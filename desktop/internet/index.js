/**
 * Conexão entre computadores pela internet.
 *
 * Junta as três partes: a ponte (janela oculta com o WebRTC), a lógica de quem
 * hospeda (anfitriao.js) ou de quem se conecta (cliente.js) e o arquivo que
 * guarda a identidade do estúdio e as chaves dos computadores autorizados.
 *
 * A rede local continua como sempre foi: nada aqui é usado nesse modo.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarAnfitriao } = require('./anfitriao');
const { criarCliente } = require('./cliente');
const seguranca = require('./seguranca');

const PRAZO_DO_PAREAMENTO_MS = 40_000;

const ERROS_DA_SINALIZACAO = {
  estudio: 'ID do estúdio não encontrado. Confira o ID na tela Conexão do computador do estúdio.',
  chave: 'Este ID de estúdio está registrado por outro computador.',
  substituido: 'A Agenda deste estúdio foi aberta em outro lugar com a mesma identidade.',
  cheio: 'Há muitos computadores conectando ao mesmo tempo. Tente de novo em instantes.',
};

/**
 * @param {object} opcoes
 * @param {object} opcoes.electron   { BrowserWindow, ipcMain, safeStorage }
 * @param {string} opcoes.url        endereço do servidor de sinalização (wss://...); vazio desativa tudo
 * @param {string} opcoes.pasta      onde fica o internet.json
 * @param {(pedido) => Promise<{status, cabecalhos, corpo}>} opcoes.buscarLocal  entrega um pedido ao servidor da agenda
 * @param {() => void} [opcoes.aoMudar]
 */
function criarInternet({ electron, url, pasta, buscarLocal, aoMudar = () => {} }) {
  const { BrowserWindow, ipcMain, safeStorage } = electron;
  const arquivo = path.join(pasta, 'internet.json');

  let cofre = lerCofre();
  let janela = null;
  let config = null;
  let ouvinte = null;
  let anfitriao = null;
  let cliente = null;
  let sinalizacao = { estado: 'desligada', motivo: null, anfitriao: null };
  let aoMudarNoPareamento = null;
  let encerrado = false;

  // ---------- Arquivo com a identidade e as chaves ----------

  /** Cifrado pelo sistema operacional quando possível, para as chaves não ficarem legíveis no disco. */
  function lerCofre() {
    try {
      const bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      if (bruto.protegido) {
        return JSON.parse(safeStorage.decryptString(Buffer.from(bruto.protegido, 'base64')));
      }
      return bruto.dados ?? {};
    } catch {
      return {};
    }
  }

  function gravarCofre() {
    const texto = JSON.stringify(cofre);
    const conteudo = safeStorage.isEncryptionAvailable()
      ? { protegido: safeStorage.encryptString(texto).toString('base64') }
      : { dados: cofre };
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(arquivo, JSON.stringify(conteudo));
  }

  // ---------- Ponte ----------

  function comando(c) {
    if (janela && !janela.isDestroyed()) janela.webContents.send('ponte:comando', c);
  }

  const transporte = {
    ouvir: (o) => (ouvinte = o),
    enviar: (par, mensagem, corpo) =>
      comando({ tipo: 'enviar', par, mensagem, corpo: corpo && corpo.length > 0 ? corpo : undefined }),
    fechar: (par) => comando({ tipo: 'fechar', par }),
    parar: () => comando({ tipo: 'parar' }),
  };

  ipcMain.on('ponte:evento', (evento, e) => {
    if (!janela || janela.isDestroyed() || evento.sender !== janela.webContents || !e) return;
    switch (e.tipo) {
      case 'pronta':
        if (config) comando({ tipo: 'iniciar', config });
        break;
      case 'sinalizacao':
        sinalizacao = { estado: e.estado, motivo: e.motivo ?? null, anfitriao: e.anfitriao ?? sinalizacao.anfitriao };
        mudou();
        break;
      case 'aberto':
        // Sem as impressões digitais não há como amarrar a autorização a esta conexão.
        if (!e.impressoes?.local || !e.impressoes?.remoto) transporte.fechar(e.par);
        else ouvinte?.aoAbrir(e.par, e.impressoes);
        break;
      case 'mensagem': {
        const c = e.corpo;
        ouvinte?.aoMensagem(e.par, e.mensagem, c ? Buffer.from(c.buffer, c.byteOffset, c.byteLength) : null);
        break;
      }
      case 'caminho':
        ouvinte?.aoCaminho(e.par, e.caminho);
        break;
      case 'fechado':
        ouvinte?.aoFechar(e.par);
        break;
    }
  });

  function abrirPonte() {
    if (janela && !janela.isDestroyed()) {
      comando({ tipo: 'iniciar', config });
      return;
    }
    janela = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload-ponte.js'),
        // Escondida, a janela teria os temporizadores atrasados e a conexão cairia.
        backgroundThrottling: false,
      },
    });
    const esta = janela;
    // Se o processo da ponte morrer, as conexões caem: avisa a lógica e abre outra.
    esta.webContents.on('render-process-gone', () => {
      if (janela !== esta) return;
      esta.destroy();
      janela = null;
      ouvinte?.aoFechar('anfitriao');
      if (!encerrado && config) setTimeout(() => !encerrado && config && abrirPonte(), 2000);
    });
    void esta.loadFile(path.join(__dirname, 'ponte.html'));
  }

  function mudou() {
    aoMudarNoPareamento?.();
    aoMudar();
  }

  function pararTudo() {
    transporte.parar();
    config = null;
    ouvinte = null;
    anfitriao = null;
    cliente = null;
    sinalizacao = { estado: 'desligada', motivo: null, anfitriao: null };
  }

  // ---------- Computador do estúdio ----------

  /** Passa a aceitar computadores autorizados. A identidade do estúdio é criada na primeira vez. */
  function iniciarAnfitriao() {
    if (!url) return;
    pararTudo();
    if (!cofre.anfitriao) {
      cofre.anfitriao = { estudio: seguranca.gerarEstudio(), chave: seguranca.gerarChave(), dispositivos: [] };
      gravarCofre();
    }
    anfitriao = criarAnfitriao({
      transporte,
      dispositivos: cofre.anfitriao.dispositivos,
      salvar: gravarCofre,
      buscarLocal,
      aoMudar: mudou,
    });
    anfitriao.definirEstudio(cofre.anfitriao.estudio);
    config = { papel: 'anfitriao', url, estudio: cofre.anfitriao.estudio, chave: cofre.anfitriao.chave };
    abrirPonte();
  }

  function gerarCodigo() {
    return anfitriao ? anfitriao.gerarCodigo() : null;
  }

  function removerDispositivo(id) {
    anfitriao?.remover(String(id));
  }

  // ---------- Computador que se conecta ----------

  /** O estúdio em que este computador já está autorizado, se houver. */
  function estudioPareado() {
    return cofre.cliente?.dispositivo ? cofre.cliente.estudio : null;
  }

  /** Conecta com a chave recebida num pareamento anterior. */
  function iniciarCliente() {
    if (!url || !estudioPareado()) return false;
    pararTudo();
    montarCliente({ estudio: cofre.cliente.estudio, dispositivo: cofre.cliente.dispositivo, nome: os.hostname() });
    return true;
  }

  function montarCliente({ estudio, dispositivo = null, codigo = null, nome }) {
    cliente = criarCliente({
      estudio,
      transporte,
      dispositivo,
      codigo,
      nome,
      aoParear(novo) {
        cofre.cliente = { estudio, dispositivo: novo };
        gravarCofre();
      },
      aoMudar: mudou,
    });
    config = { papel: 'cliente', url, estudio };
    abrirPonte();
  }

  /**
   * Primeiro acesso: conecta com o ID do estúdio e o código temporário. Termina
   * quando o estúdio autoriza (e a chave deste computador fica guardada) ou
   * com um erro que pode ser mostrado na tela.
   */
  function parear({ estudio, codigo, nome }) {
    const id = seguranca.normalizar(estudio);
    const texto = seguranca.normalizar(codigo);
    if (!url) return Promise.reject(new Error('A conexão pela internet não está configurada nesta versão.'));
    if (!seguranca.estudioValido(id)) {
      return Promise.reject(new Error('Confira o ID do estúdio: são 12 letras e números, como ABCD-EFGH-JKLM.'));
    }
    if (!seguranca.codigoValido(texto)) {
      return Promise.reject(new Error('Confira o código de conexão: são 8 letras e números, como ABCD-EFGH.'));
    }
    pararTudo();
    const apelido = String(nome ?? '').trim().slice(0, 60) || os.hostname();

    return new Promise((ok, falha) => {
      const terminar = (erro) => {
        clearTimeout(prazo);
        aoMudarNoPareamento = null;
        if (erro) {
          pararTudo();
          falha(erro);
        } else {
          ok();
        }
      };
      const prazo = setTimeout(() => {
        let mensagem = 'Não foi possível conectar ao computador do estúdio. Tente de novo.';
        if (sinalizacao.estado !== 'conectada' && sinalizacao.anfitriao === null) {
          mensagem = 'Não foi possível falar com o serviço de conexão. Confira a internet deste computador.';
        } else if (sinalizacao.anfitriao === false) {
          mensagem =
            'O computador do estúdio não está conectado. Ele precisa estar ligado, com a Agenda aberta e com a conexão pela internet ativada.';
        }
        terminar(new Error(mensagem));
      }, PRAZO_DO_PAREAMENTO_MS);
      aoMudarNoPareamento = () => {
        const e = cliente?.estado();
        if (e?.fase === 'pronto') terminar(null);
        else if (e?.fase === 'recusado') terminar(new Error(e.mensagem));
        else if (sinalizacao.estado === 'erro') {
          terminar(new Error(ERROS_DA_SINALIZACAO[sinalizacao.motivo] ?? 'O serviço de conexão recusou o pedido.'));
        }
      };
      montarCliente({ estudio: id, codigo: texto, nome: apelido });
    });
  }

  /** Leva um pedido da agenda ao computador do estúdio. */
  function buscar(pedido, esperaMs) {
    if (!cliente) return Promise.reject(new Error('Este computador não está conectado a um estúdio pela internet.'));
    return cliente.buscar(pedido, esperaMs);
  }

  // ---------- Para as telas ----------

  function estado() {
    const comum = {
      disponivel: Boolean(url),
      sinalizacao: sinalizacao.estado,
      erro: sinalizacao.estado === 'erro' ? ERROS_DA_SINALIZACAO[sinalizacao.motivo] ?? null : null,
      estudioPareado: estudioPareado() ? seguranca.formatar(estudioPareado()) : '',
    };
    if (anfitriao) {
      return {
        ...comum,
        papel: 'anfitriao',
        estudio: seguranca.formatar(cofre.anfitriao.estudio),
        dispositivos: anfitriao.listar(),
      };
    }
    if (cliente) {
      return { ...comum, papel: 'cliente', anfitriaoOnline: sinalizacao.anfitriao, ...cliente.estado() };
    }
    return { ...comum, papel: null };
  }

  function encerrar() {
    encerrado = true;
    pararTudo();
    if (janela && !janela.isDestroyed()) janela.destroy();
    janela = null;
  }

  return {
    buscar,
    encerrar,
    estado,
    estudioPareado,
    gerarCodigo,
    iniciarAnfitriao,
    iniciarCliente,
    parear,
    removerDispositivo,
  };
}

module.exports = { criarInternet };
