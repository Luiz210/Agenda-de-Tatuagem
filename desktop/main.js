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
  shell,
} = require('electron');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { criarAtualizador } = require('./atualizador');

// Porta diferente da do Rotina, para os dois poderem rodar no mesmo computador.
const PORTA = 8090;
let api = `http://localhost:${PORTA}`;
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

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Telas do Angular, ou a API repassada ao Spring, sem precisar de CORS. */
async function responder(pedido) {
  const url = new URL(pedido.url);

  if (url.pathname.startsWith('/api/')) {
    const temCorpo = pedido.method !== 'GET' && pedido.method !== 'HEAD';
    return net.fetch(api + url.pathname.slice(4) + url.search, {
      method: pedido.method,
      headers: pedido.headers,
      body: temCorpo ? await pedido.arrayBuffer() : undefined,
    });
  }

  const relativo = path.normalize(decodeURIComponent(url.pathname)).replace(/^[\\/]+/, '');
  const arquivo = path.join(UI, relativo);
  const dentroDaUi = arquivo.startsWith(UI + path.sep);
  const existe = dentroDaUi && path.extname(arquivo) !== '' && fs.existsSync(arquivo);
  return net.fetch(pathToFileURL(existe ? arquivo : path.join(UI, 'index.html')).toString());
}

async function apiPronta() {
  try {
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
    `--server.address=${conexao.compartilhar ? '0.0.0.0' : '127.0.0.1'}`,
    `--agenda.codigo-convite=${conexao.compartilhar ? conexao.codigoConvite : ''}`,
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
      query: { aguardando: conexao.servidor },
    });
    while (!encerrando && !(await apiPronta())) await esperar(3000);
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
ipcMain.handle('ler-conexao', () => ({
  modo: conexao?.modo ?? 'local',
  compartilhar: conexao?.compartilhar ?? false,
  servidor: conexao?.servidor ?? '',
  codigoConvite: conexao?.codigoConvite ?? '',
  nomeComputador: os.hostname(),
  ips: ipsDaRede(),
}));
ipcMain.on('salvar-conexao', (_evento, dados) => {
  const nova = {
    modo: dados.modo === 'cliente' ? 'cliente' : 'local',
    compartilhar: dados.modo !== 'cliente' && Boolean(dados.compartilhar),
    servidor: dados.modo === 'cliente' ? String(dados.servidor) : '',
    codigoConvite: conexao?.codigoConvite || gerarCodigoConvite(),
  };
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(caminhoDaConexao(), JSON.stringify(nova, null, 2));
  // O servidor só lê a escolha ao iniciar.
  app.relaunch();
  app.quit();
});

async function abrir() {
  api = conexao.modo === 'cliente' ? `http://${conexao.servidor}:${PORTA}` : `http://localhost:${PORTA}`;
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
    await janela.loadURL(`${ORIGEM}/`);
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.agenda.tatuagem');
  Menu.setApplicationMenu(null);
  protocol.handle('app', responder);
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
  janelaConexao?.destroy();
  if (back) back.kill();
});
