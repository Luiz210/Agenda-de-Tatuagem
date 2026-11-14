const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  ipcMain,
  nativeImage,
  net,
  protocol,
  safeStorage,
  shell,
} = require('electron');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { criarAtualizador } = require('./atualizador');
const { criarInternet } = require('./internet');
const { formatar: formatarId } = require('./internet/seguranca');

// Porta diferente da do Rotina, para os dois poderem rodar no mesmo computador.
const PORTA = 8090;
let api = `http://localhost:${PORTA}`;
// Servidor que apresenta os computadores na conexão pela internet (pasta sinalizacao/).
// Vazio, a opção "pela internet" fica desativada e o resto funciona como sempre.
const SINALIZACAO = process.env.AGENDA_SINALIZACAO || require('./package.json').sinalizacao || '';
const ORIGEM = 'app://agenda';
const UI = path.join(__dirname, 'ui');
const JAR = app.isPackaged
  ? path.join(process.resourcesPath, 'agenda.jar')
  : path.join(__dirname, 'backend', 'agenda.jar');

// O banco pode demorar para abrir logo depois que o Windows liga.
const TEMPO_MAXIMO_MS = 5 * 60 * 1000;
const INTERVALO_ENTRE_TENTATIVAS_MS = 5000;
const INTERVALO_DE_ATUALIZACAO_MS = 6 * 60 * 60 * 1000;
// Java dentro do aplicativo, para quem instala não precisar baixar nada.
const JAVA_EMBUTIDO = path.join(
  process.resourcesPath,
  'jre',
  'bin',
  process.platform === 'win32' ? 'java.exe' : 'java',
);
// Mantém o consumo de memória previsível, mesmo com o aplicativo sempre aberto.
const ARGUMENTOS_JAVA = ['-Xmx384m', '-XX:+UseSerialGC'];
let janela = null;
let janelaConexao = null;
let conexao = null;
let back = null;
let bandeja = null;
let atualizacaoPronta = null;
let atualizador = null;
let encerrando = false;
let internet = null;
// Enviado em cada pedido das telas deste computador. O servidor só trata como "computador do
// estúdio" quem apresenta este segredo; o que chega pela internet não o conhece.
let segredoLocal = '';
// Por que a conexão pela internet não pôde ser ativada neste computador, se for o caso.
let avisoDaInternet = '';

// Dois computadores na mesma rede conectam direto mesmo onde nomes .local não funcionam.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => {
  mostrarJanela();
});

function mostrarJanela() {
  if (!janela) return;
  if (janela.isMinimized()) janela.restore();
  janela.show();
  janela.focus();
}

function caminhoDaConexao() {
  return path.join(app.getPath('userData'), 'conexao.json');
}

function lerConexaoSalva() {
  try {
    return JSON.parse(fs.readFileSync(caminhoDaConexao(), 'utf8'));
  } catch {
    return null;
  }
}

function ipsDaRede() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((rede) => rede.family === 'IPv4' && !rede.internal)
    .map((rede) => rede.address);
}

function gerarCodigoConvite() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function gravarConexao(nova) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(caminhoDaConexao(), JSON.stringify(nova, null, 2));
}

/** O mesmo segredo entre aberturas, para um servidor que tenha ficado no ar continuar reconhecendo as telas. */
function lerSegredoLocal() {
  const arquivo = path.join(app.getPath('userData'), 'segredo-local');
  try {
    const salvo = fs.readFileSync(arquivo, 'utf8').trim();
    if (/^[0-9a-f]{48}$/.test(salvo)) return salvo;
  } catch {
    // Primeira abertura.
  }
  const novo = crypto.randomBytes(24).toString('hex');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(arquivo, novo);
  return novo;
}

/** Este computador usa a agenda de um estúdio pela internet. */
const viaInternet = () => conexao?.modo === 'cliente' && Boolean(conexao.viaInternet);

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Telas do Angular, ou a API repassada ao Spring, sem precisar de CORS. */
async function responder(pedido) {
  const url = new URL(pedido.url);

  if (url.pathname.startsWith('/api/')) {
    const temCorpo = pedido.method !== 'GET' && pedido.method !== 'HEAD';
    const caminho = url.pathname.slice(4) + url.search;
    const corpo = temCorpo ? await pedido.arrayBuffer() : undefined;
    if (viaInternet()) return responderPelaInternet(pedido, caminho, corpo);

    const cabecalhos = new Headers(pedido.headers);
    if (segredoLocal) cabecalhos.set('X-Agenda-Local', segredoLocal);
    return net.fetch(api + caminho, { method: pedido.method, headers: cabecalhos, body: corpo });
  }

  const relativo = path.normalize(decodeURIComponent(url.pathname)).replace(/^[\\/]+/, '');
  const arquivo = path.join(UI, relativo);
  const dentroDaUi = arquivo.startsWith(UI + path.sep);
  const existe = dentroDaUi && path.extname(arquivo) !== '' && fs.existsSync(arquivo);
  return net.fetch(pathToFileURL(existe ? arquivo : path.join(UI, 'index.html')).toString());
}

/** O mesmo pedido que iria pela rede local, levado pelo canal com o computador do estúdio. */
async function responderPelaInternet(pedido, caminho, corpo) {
  const cabecalhos = {};
  for (const nome of ['authorization', 'content-type', 'accept']) {
    const valor = pedido.headers.get(nome);
    if (valor) cabecalhos[nome] = valor;
  }
  try {
    const r = await internet.buscar({
      metodo: pedido.method,
      caminho,
      cabecalhos,
      corpo: corpo ? Buffer.from(corpo) : null,
    });
    const semCorpo = pedido.method === 'HEAD' || [204, 205, 304].includes(r.status);
    return new Response(semCorpo ? null : r.corpo, { status: r.status, headers: r.cabecalhos });
  } catch (erro) {
    // As telas mostram a mensagem como está.
    return Response.json({ mensagem: erro.message }, { status: 503 });
  }
}

/**
 * No computador do estúdio: entrega ao servidor da agenda um pedido que chegou
 * pela internet. Vai sem o segredo local, então o servidor o trata como remoto
 * (exige login), igual a um pedido vindo da rede.
 */
async function buscarNoServidorLocal({ metodo, caminho, cabecalhos, corpo }) {
  const resposta = await net.fetch(`http://127.0.0.1:${PORTA}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo && corpo.length > 0 && metodo !== 'GET' && metodo !== 'HEAD' ? corpo : undefined,
  });
  const devolvidos = {};
  for (const nome of ['content-type', 'cache-control', 'content-disposition']) {
    const valor = resposta.headers.get(nome);
    if (valor) devolvidos[nome] = valor;
  }
  return { status: resposta.status, cabecalhos: devolvidos, corpo: Buffer.from(await resposta.arrayBuffer()) };
}

/**
 * Só aceita computadores pela internet se o servidor da agenda souber separar
 * os pedidos deles dos pedidos deste computador. Um servidor iniciado fora do
 * aplicativo (em desenvolvimento) não recebe o segredo e trataria todos como locais.
 */
async function iniciarAnfitriaoDaInternet() {
  avisoDaInternet = '';
  if (!SINALIZACAO || conexao.modo !== 'local' || !conexao.internet) return;
  try {
    const resposta = await net.fetch(`http://127.0.0.1:${PORTA}/auth/estado`, { signal: AbortSignal.timeout(5000) });
    const { estudio } = await resposta.json();
    if (estudio !== false) {
      avisoDaInternet =
        'A conexão pela internet não foi ativada: já havia outro servidor da agenda rodando na porta 8090 (Eclipse, mvnw ou outra Agenda aberta). Feche-o e reabra o aplicativo.';
      return;
    }
  } catch {
    avisoDaInternet = 'A conexão pela internet não foi ativada: o servidor da agenda não respondeu.';
    return;
  }
  internet.iniciarAnfitriao();
}

async function apiPronta() {
  try {
    if (viaInternet()) {
      const r = await internet.buscar({ metodo: 'GET', caminho: '/auth/status' }, 2000);
      return r.status === 200;
    }
    const resposta = await net.fetch(`${api}/auth/status`, { signal: AbortSignal.timeout(2000) });
    return resposta.ok;
  } catch {
    return false;
  }
}

function caminhoDoLog() {
  return path.join(app.getPath('userData'), 'back-end.log');
}

function iniciarBack(aoFalhar) {
  const log = fs.createWriteStream(caminhoDoLog(), { flags: 'a' });
  let java = 'java';
  if (fs.existsSync(JAVA_EMBUTIDO)) java = JAVA_EMBUTIDO;
  else if (process.env.JAVA_HOME) java = path.join(process.env.JAVA_HOME, 'bin', 'java');

  // Só aceita outros computadores se isso foi ativado na tela de conexão.
  const argumentos = [
    ...ARGUMENTOS_JAVA,
    '-jar',
    JAR,
    // Pela internet o servidor continua fechado em 127.0.0.1: quem recebe os outros computadores é o aplicativo.
    `--server.address=${conexao.compartilhar ? '0.0.0.0' : '127.0.0.1'}`,
    `--agenda.codigo-convite=${conexao.compartilhar || conexao.internet ? conexao.codigoConvite : ''}`,
    `--agenda.segredo-local=${segredoLocal}`,
  ];
  back = spawn(java, argumentos, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  back.stdout.pipe(log);
  back.stderr.pipe(log);
  back.on('error', aoFalhar);
  back.on('exit', () => {
    back = null;
  });
}

/** Sobe o Spring e tenta de novo enquanto o banco ainda não estiver pronto. */
async function aguardarBack() {
  if (await apiPronta()) return null;

  if (conexao.modo === 'cliente') {
    // O outro computador pode estar desligado: fica aguardando até ele voltar.
    await janela?.loadFile(path.join(__dirname, 'splash.html'), {
      query: {
        aguardando: viaInternet() ? `do estúdio ${formatarId(conexao.estudio)} (pela internet)` : conexao.servidor,
      },
    });
    while (!encerrando && !(await apiPronta())) {
      // Autorização removida no estúdio: esperar não resolve.
      const estado = viaInternet() ? internet.estado() : null;
      if (estado?.fase === 'recusado') return `${estado.mensagem} Abra "Conexão" pelo ícone da bandeja.`;
      if (estado && estado.papel !== 'cliente') {
        return 'Este computador não tem mais a autorização do estúdio. Abra "Conexão" pelo ícone da bandeja e conecte de novo com um código.';
      }
      await esperar(3000);
    }
    return null;
  }

  // O log começa do zero a cada abertura para não crescer para sempre.
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(caminhoDoLog(), '');

  const limite = Date.now() + TEMPO_MAXIMO_MS;
  let proximaTentativa = 0;
  let erroAoIniciar = null;

  while (Date.now() < limite && !encerrando) {
    if (erroAoIniciar) {
      return 'Não foi possível iniciar o Java. Confira se ele está instalado neste computador.';
    }
    if (!back && Date.now() >= proximaTentativa) {
      iniciarBack((erro) => {
        erroAoIniciar = erro;
      });
      proximaTentativa = Date.now() + INTERVALO_ENTRE_TENTATIVAS_MS;
    }
    if (await apiPronta()) return null;
    await esperar(1000);
  }
  return `O servidor da agenda não respondeu a tempo. Veja os detalhes em ${caminhoDoLog()}`;
}

function criarBandeja() {
  const icone = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
  bandeja = new Tray(icone.resize({ width: 16, height: 16 }));
  bandeja.setToolTip('Agenda de Tatuagem');
  montarMenuDaBandeja();
  bandeja.on('click', mostrarJanela);
}

function montarMenuDaBandeja() {
  const itens = [
    { label: 'Abrir', click: mostrarJanela },
    { label: 'Conexão', click: abrirTelaDeConexao },
    { label: 'Sair', click: () => app.quit() },
  ];
  if (atualizacaoPronta) {
    itens.unshift({ label: 'Reiniciar para atualizar', click: atualizacaoPronta });
  }
  bandeja.setContextMenu(Menu.buildFromTemplate(itens));
}

/**
 * Baixa versões novas em segundo plano. A instalação acontece pelo aviso ou, se
 * ninguém clicar, na próxima vez que o aplicativo for fechado.
 */
function iniciarAtualizacaoAutomatica() {
  if (!app.isPackaged || process.platform !== 'win32') return;

  const { autoUpdater } = require('electron-updater');
  atualizador = criarAtualizador({
    autoUpdater,
    versaoAtual: app.getVersion(),
    aoMudar: (estado) => {
      janela?.webContents.send('atualizacao-estado', estado);
      if (estado.fase !== 'pronta' || atualizacaoPronta) return;

      atualizacaoPronta = atualizador.instalar;
      montarMenuDaBandeja();
      const aviso = new Notification({
        title: 'Atualização da Agenda de Tatuagem pronta',
        body: `A versão ${estado.versao} foi baixada. Clique para reiniciar e atualizar.`,
        icon: path.join(__dirname, 'build', 'icon.png'),
      });
      aviso.on('click', atualizacaoPronta);
      aviso.show();
    },
  });

  void atualizador.buscar();
  setInterval(() => atualizador.buscar(), INTERVALO_DE_ATUALIZACAO_MS);
}

function abrirTelaDeConexao() {
  if (janelaConexao) {
    janelaConexao.focus();
    return;
  }
  janelaConexao = new BrowserWindow({
    width: 640,
    height: 720,
    title: 'Conexão da Agenda de Tatuagem',
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  janelaConexao.on('closed', () => {
    janelaConexao = null;
    // Na primeira abertura, sem escolher não há como continuar.
    if (!conexao) app.quit();
  });
  void janelaConexao.loadFile(path.join(__dirname, 'conexao.html'));
}

ipcMain.on('modo', (evento) => {
  evento.returnValue = conexao?.modo ?? 'local';
});
ipcMain.on('abrir-conexao', abrirTelaDeConexao);
ipcMain.handle('ler-atualizacao', () =>
  atualizador ? atualizador.ler() : { fase: 'indisponivel', versaoAtual: app.getVersion() },
);
ipcMain.on('buscar-atualizacao', () => void atualizador?.buscar(true));
ipcMain.on('instalar-atualizacao', () => atualizador?.instalar());
/** O que a tela de conexão mostra sobre a internet: estado, ID do estúdio e computadores autorizados. */
function estadoDaInternet() {
  return { ...internet.estado(), aviso: avisoDaInternet };
}

ipcMain.handle('ler-conexao', () => ({
  modo: conexao?.modo ?? 'local',
  compartilhar: conexao?.compartilhar ?? false,
  internet: conexao?.internet ?? false,
  viaInternet: conexao?.viaInternet ?? false,
  servidor: conexao?.servidor ?? '',
  codigoConvite: conexao?.codigoConvite ?? '',
  nomeComputador: os.hostname(),
  ips: ipsDaRede(),
  internetEstado: estadoDaInternet(),
}));
ipcMain.on('salvar-conexao', (_evento, dados) => {
  const cliente = dados.modo === 'cliente';
  // Pela internet só continua quem já foi autorizado; o primeiro acesso passa por "conectar-internet".
  const pelaInternet = cliente && Boolean(dados.viaInternet) && Boolean(internet.estudioPareado());
  gravarConexao({
    modo: cliente ? 'cliente' : 'local',
    compartilhar: !cliente && Boolean(dados.compartilhar),
    internet: !cliente && Boolean(dados.internet) && Boolean(SINALIZACAO),
    viaInternet: pelaInternet,
    estudio: pelaInternet ? internet.estudioPareado() : '',
    servidor: cliente && !pelaInternet ? String(dados.servidor) : '',
    codigoConvite: conexao?.codigoConvite || gerarCodigoConvite(),
  });
  // O servidor só lê a escolha ao iniciar.
  app.relaunch();
  app.quit();
});
// Primeiro acesso a um estúdio pela internet: só salva e reabre se o estúdio autorizar.
ipcMain.handle('conectar-internet', async (_evento, dados) => {
  try {
    await internet.parear({ estudio: dados.estudio, codigo: dados.codigo, nome: dados.nome });
  } catch (erro) {
    // Se já havia uma conexão em uso, ela volta como estava.
    if (viaInternet()) internet.iniciarCliente();
    else if (conexao?.modo === 'local' && conexao.internet) void iniciarAnfitriaoDaInternet();
    return { erro: erro.message };
  }
  gravarConexao({
    modo: 'cliente',
    compartilhar: false,
    internet: false,
    viaInternet: true,
    estudio: internet.estudioPareado(),
    servidor: '',
    codigoConvite: conexao?.codigoConvite || gerarCodigoConvite(),
  });
  app.relaunch();
  app.quit();
  return { ok: true };
});
ipcMain.handle('gerar-codigo-internet', () => internet.gerarCodigo());
ipcMain.handle('remover-dispositivo', (_evento, id) => {
  internet.removerDispositivo(id);
  return estadoDaInternet();
});

async function abrir() {
  api = conexao.modo === 'cliente' ? `http://${conexao.servidor}:${PORTA}` : `http://localhost:${PORTA}`;
  if (conexao.modo === 'local') segredoLocal = lerSegredoLocal();
  if (viaInternet()) internet.iniciarCliente();
  janela = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 420,
    title: 'Agenda de Tatuagem',
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  // Links como o do WhatsApp abrem no navegador ou no aplicativo do WhatsApp.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // O X só esconde a janela, para o servidor continuar no ar para os outros computadores.
  janela.on('close', (evento) => {
    if (!encerrando) {
      evento.preventDefault();
      janela.hide();
    }
  });
  janela.on('closed', () => {
    janela = null;
  });

  await janela.loadFile(path.join(__dirname, 'splash.html'));
  const erro = await aguardarBack();
  if (!janela) return;

  if (erro) {
    await janela.loadFile(path.join(__dirname, 'splash.html'), { query: { erro } });
  } else {
    await iniciarAnfitriaoDaInternet();
    await janela.loadURL(`${ORIGEM}/`);
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.agenda.tatuagem');
  Menu.setApplicationMenu(null);
  protocol.handle('app', responder);
  internet = criarInternet({
    electron: { BrowserWindow, ipcMain, safeStorage },
    url: SINALIZACAO,
    pasta: app.getPath('userData'),
    buscarLocal: buscarNoServidorLocal,
    aoMudar: () => {
      if (janelaConexao && !janelaConexao.isDestroyed()) {
        janelaConexao.webContents.send('internet-estado', estadoDaInternet());
      }
    },
  });
  criarBandeja();
  iniciarAtualizacaoAutomatica();
  conexao = lerConexaoSalva();
  if (!conexao) {
    abrirTelaDeConexao();
    return;
  }
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
  void abrir();
});

// Ao sair, desliga o servidor junto.
app.on('before-quit', () => {
  encerrando = true;
  internet?.encerrar();
  janelaConexao?.destroy();
  if (back) back.kill();
});
