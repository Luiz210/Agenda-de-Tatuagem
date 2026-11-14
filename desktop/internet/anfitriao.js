/**
 * O lado do computador do estúdio na conexão pela internet: confere quem está
 * do outro lado e, só então, entrega os pedidos ao servidor da agenda.
 *
 * Não conhece WebRTC: recebe um "transporte" que abre pares, entrega mensagens
 * e informa as impressões digitais de cada conexão.
 */
const crypto = require('node:crypto');
const seguranca = require('./seguranca');

const VALIDADE_DO_CODIGO_MS = 10 * 60 * 1000;
const TENTATIVAS_POR_CODIGO = 5;
const PRAZO_PARA_SE_IDENTIFICAR_MS = 20_000;
const METODOS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH']);
/** Só o necessário chega ao servidor da agenda; o resto do que o outro lado mandar é descartado. */
const CABECALHOS_ACEITOS = ['authorization', 'content-type', 'accept'];

/**
 * @param {object} opcoes
 * @param {object} opcoes.transporte      enviar(par, mensagem, corpo), fechar(par) e ouvir({...})
 * @param {object[]} opcoes.dispositivos  computadores autorizados (a lista é alterada aqui)
 * @param {() => void} opcoes.salvar      grava a lista depois de cada mudança
 * @param {(pedido) => Promise<{status, cabecalhos, corpo}>} opcoes.buscarLocal
 * @param {() => void} [opcoes.aoMudar]   avisa a tela de conexão
 */
function criarAnfitriao({ transporte, dispositivos, salvar, buscarLocal, aoMudar = () => {}, agora = Date.now }) {
  /** @type {{codigo: string, chave: Promise<Buffer>, expira: number, tentativas: number} | null} */
  let codigo = null;
  const pares = new Map();
  let estudio = '';

  function definirEstudio(id) {
    estudio = id;
  }

  /** Um código novo substitui o anterior. Vale 10 minutos e serve para um computador só. */
  function gerarCodigo() {
    const texto = seguranca.gerarCodigo();
    codigo = {
      codigo: texto,
      chave: seguranca.chaveDoCodigo(texto, estudio),
      expira: agora() + VALIDADE_DO_CODIGO_MS,
      tentativas: 0,
    };
    return { codigo: seguranca.formatar(texto), expiraEm: codigo.expira };
  }

  function codigoAtivo() {
    if (codigo && agora() > codigo.expira) codigo = null;
    return codigo;
  }

  function listar() {
    const conectados = new Map();
    for (const p of pares.values()) {
      if (p.fase === 'pronto') conectados.set(p.dispositivo.id, p.caminho ?? 'conectado');
    }
    return dispositivos.map((d) => ({
      id: d.id,
      nome: d.nome,
      criadoEm: d.criadoEm,
      vistoEm: d.vistoEm,
      conectado: conectados.has(d.id),
      caminho: conectados.get(d.id) ?? null,
    }));
  }

  /** Tira a autorização e derruba a conexão, se o computador estiver conectado. */
  function remover(id) {
    const indice = dispositivos.findIndex((d) => d.id === id);
    if (indice < 0) return;
    dispositivos.splice(indice, 1);
    salvar();
    for (const [par, p] of pares) {
      if (p.dispositivo?.id === id) transporte.fechar(par);
    }
    aoMudar();
  }

  function recusar(par, motivo) {
    const p = pares.get(par);
    if (p) p.fase = 'recusado';
    transporte.enviar(par, { t: 'recusado', motivo });
    // Dá tempo de a recusa chegar antes de derrubar a conexão.
    setTimeout(() => transporte.fechar(par), 300);
  }

  async function aoMensagem(par, m, corpo) {
    const p = pares.get(par);
    if (!p || !m || typeof m !== 'object') return;

    if (p.fase === 'ola' && m.t === 'ola') {
      p.nonceDoCliente = String(m.nc ?? '').slice(0, 64);
      p.nome = String(m.nome ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || 'Computador';
      if (m.modo === 'dispositivo') {
        const d = dispositivos.find((x) => x.id === m.id);
        if (!d) return recusar(par, 'dispositivo');
        p.dispositivo = d;
        p.chave = Buffer.from(d.chave, 'base64');
      } else if (m.modo === 'parear') {
        const ativo = codigoAtivo();
        if (!ativo) return recusar(par, 'sem-codigo');
        p.codigo = ativo;
        p.chave = await ativo.chave;
      } else {
        return recusar(par, 'protocolo');
      }
      p.nonceDoAnfitriao = seguranca.gerarNonce();
      p.fase = 'prova';
      transporte.enviar(par, { t: 'desafio', nh: p.nonceDoAnfitriao });
      return;
    }

    if (p.fase === 'prova' && m.t === 'prova') {
      const argumentos = [p.impressoes.remoto, p.impressoes.local, p.nonceDoCliente, p.nonceDoAnfitriao];
      const esperada = seguranca.prova(p.chave, 'cliente', ...argumentos);
      if (!seguranca.iguais(m.mac, esperada)) {
        if (p.codigo) {
          p.codigo.tentativas += 1;
          if (p.codigo.tentativas >= TENTATIVAS_POR_CODIGO && codigo === p.codigo) codigo = null;
        }
        return recusar(par, p.codigo ? 'codigo' : 'dispositivo');
      }

      const resposta = { t: 'aceito', mac: seguranca.prova(p.chave, 'anfitriao', ...argumentos) };
      if (p.codigo) {
        // O código serviu: não vale mais para ninguém.
        if (codigo !== p.codigo) return recusar(par, 'sem-codigo');
        codigo = null;
        p.dispositivo = {
          id: crypto.randomBytes(8).toString('hex'),
          chave: seguranca.gerarChave(),
          nome: p.nome,
          criadoEm: agora(),
          vistoEm: agora(),
        };
        dispositivos.push(p.dispositivo);
        resposta.dispositivo = { id: p.dispositivo.id, chave: p.dispositivo.chave };
      } else {
        p.dispositivo.vistoEm = agora();
      }
      salvar();
      clearTimeout(p.prazo);
      p.fase = 'pronto';
      transporte.enviar(par, resposta);
      aoMudar();
      return;
    }

    if (p.fase === 'pronto' && m.t === 'req') {
      // A autorização pode ter sido removida com a conexão aberta.
      if (!dispositivos.includes(p.dispositivo)) return transporte.fechar(par);
      return atender(par, m, corpo);
    }

    // Qualquer coisa fora de ordem encerra a conversa.
    if (p.fase !== 'pronto' && p.fase !== 'recusado') recusar(par, 'protocolo');
  }

  async function atender(par, m, corpo) {
    let resposta;
    try {
      const caminho = String(m.caminho ?? '');
      if (!METODOS.has(m.metodo) || !caminho.startsWith('/') || caminho.length > 2000 || /[\r\n\\]/.test(caminho)) {
        throw new Error('pedido inválido');
      }
      const cabecalhos = {};
      for (const nome of CABECALHOS_ACEITOS) {
        const valor = m.cabecalhos?.[nome];
        if (typeof valor === 'string' && !/[\r\n]/.test(valor)) cabecalhos[nome] = valor;
      }
      resposta = await buscarLocal({ metodo: m.metodo, caminho, cabecalhos, corpo });
    } catch {
      resposta = {
        status: 502,
        cabecalhos: { 'content-type': 'application/json' },
        corpo: Buffer.from(JSON.stringify({ mensagem: 'O computador do estúdio não conseguiu atender o pedido.' })),
      };
    }
    transporte.enviar(par, { t: 'res', id: m.id, status: resposta.status, cabecalhos: resposta.cabecalhos }, resposta.corpo);
  }

  transporte.ouvir({
    aoAbrir(par, impressoes) {
      const p = { fase: 'ola', impressoes };
      // Quem conecta e não se identifica não fica pendurado.
      p.prazo = setTimeout(() => {
        if (pares.get(par) === p && p.fase !== 'pronto') transporte.fechar(par);
      }, PRAZO_PARA_SE_IDENTIFICAR_MS);
      pares.set(par, p);
    },
    aoMensagem(par, mensagem, corpo) {
      aoMensagem(par, mensagem, corpo).catch(() => transporte.fechar(par));
    },
    aoCaminho(par, caminho) {
      const p = pares.get(par);
      if (p) p.caminho = caminho;
      aoMudar();
    },
    aoFechar(par) {
      const p = pares.get(par);
      if (!p) return;
      clearTimeout(p.prazo);
      pares.delete(par);
      aoMudar();
    },
  });

  return { definirEstudio, gerarCodigo, listar, remover };
}

module.exports = { criarAnfitriao, VALIDADE_DO_CODIGO_MS, TENTATIVAS_POR_CODIGO };
