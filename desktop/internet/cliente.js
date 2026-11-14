/**
 * O lado de quem se conecta ao computador do estúdio pela internet: prova quem
 * é, confere se o outro lado é mesmo o estúdio e, daí em diante, leva os
 * pedidos da agenda e traz as respostas.
 *
 * Não conhece WebRTC: recebe um "transporte" com um único par, o anfitrião.
 */
const seguranca = require('./seguranca');

const PAR = 'anfitriao';
const ESPERA_PELA_CONEXAO_MS = 8_000;
const PRAZO_DA_RESPOSTA_MS = 60_000;

const MOTIVOS = {
  codigo: 'Código de conexão incorreto. Confira o código no computador do estúdio.',
  'sem-codigo': 'O código de conexão expirou ou já foi usado. Gere outro no computador do estúdio.',
  dispositivo: 'Este computador não está mais autorizado. Conecte de novo com um código gerado no computador do estúdio.',
  falso: 'Não foi possível confirmar que o outro lado é o computador do estúdio. A conexão foi encerrada.',
  protocolo: 'Os dois computadores estão com versões diferentes da Agenda. Atualize os dois e tente de novo.',
};

class ErroDeConexao extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.codigo = codigo;
  }
}

/**
 * @param {object} opcoes
 * @param {string} opcoes.estudio
 * @param {object} opcoes.transporte
 * @param {{id: string, chave: string} | null} opcoes.dispositivo  chave recebida num pareamento anterior
 * @param {string | null} opcoes.codigo                             código temporário, no primeiro pareamento
 * @param {string} opcoes.nome                                      como este computador aparece no estúdio
 * @param {(dispositivo) => void} opcoes.aoParear                   guarda a chave recebida
 * @param {(estado) => void} [opcoes.aoMudar]
 */
function criarCliente({ estudio, transporte, dispositivo = null, codigo = null, nome, aoParear, aoMudar = () => {} }) {
  let fase = 'desconectado';
  let motivo = null;
  let caminho = null;
  let conversa = null;
  let proximoId = 1;
  const pendentes = new Map();
  let esperando = [];

  const estado = () => ({ fase, motivo, mensagem: motivo ? MOTIVOS[motivo] ?? MOTIVOS.protocolo : null, caminho });

  function mudar(novaFase, novoMotivo = null) {
    fase = novaFase;
    motivo = novoMotivo;
    if (novaFase !== 'pronto') caminho = null;
    const fila = esperando;
    if (novaFase === 'pronto' || novaFase === 'recusado') {
      esperando = [];
      fila.forEach((acordar) => acordar());
    }
    aoMudar(estado());
  }

  /** Sem autorização não adianta insistir: para de tentar até a pessoa conectar de novo. */
  function desistir(codigoDoMotivo) {
    mudar('recusado', codigoDoMotivo);
    transporte.parar();
  }

  async function aoMensagem(m, corpo) {
    if (!m || typeof m !== 'object' || !conversa) return;

    if (m.t === 'desafio' && fase === 'autenticando' && !conversa.chave) {
      conversa.nonceDoAnfitriao = String(m.nh ?? '');
      const atual = conversa;
      const chave = dispositivo
        ? Buffer.from(dispositivo.chave, 'base64')
        : await seguranca.chaveDoCodigo(seguranca.normalizar(codigo), estudio);
      if (conversa !== atual) return;
      conversa.chave = chave;
      transporte.enviar(PAR, { t: 'prova', mac: provar('cliente') });
      return;
    }

    if (m.t === 'aceito' && fase === 'autenticando' && conversa.chave) {
      // O estúdio também precisa provar que conhece a chave.
      if (!seguranca.iguais(m.mac, provar('anfitriao'))) return desistir('falso');
      if (m.dispositivo && !dispositivo) {
        dispositivo = { id: String(m.dispositivo.id), chave: String(m.dispositivo.chave) };
        codigo = null;
        aoParear(dispositivo);
      }
      mudar('pronto');
      return;
    }

    if (m.t === 'recusado') return desistir(MOTIVOS[m.motivo] ? m.motivo : 'protocolo');

    if (m.t === 'res' && fase === 'pronto') {
      const pendente = pendentes.get(m.id);
      if (!pendente) return;
      pendentes.delete(m.id);
      clearTimeout(pendente.prazo);
      pendente.ok({ status: Number(m.status) || 502, cabecalhos: m.cabecalhos ?? {}, corpo: corpo ?? Buffer.alloc(0) });
    }
  }

  function provar(papel) {
    return seguranca.prova(
      conversa.chave,
      papel,
      conversa.impressoes.local,
      conversa.impressoes.remoto,
      conversa.nonceDoCliente,
      conversa.nonceDoAnfitriao,
    );
  }

  function falharPendentes() {
    for (const pendente of pendentes.values()) {
      clearTimeout(pendente.prazo);
      pendente.falha(new ErroDeConexao('desconectado', 'A conexão com o computador do estúdio caiu.'));
    }
    pendentes.clear();
  }

  transporte.ouvir({
    aoAbrir(_par, impressoes) {
      conversa = { impressoes, nonceDoCliente: seguranca.gerarNonce(), nonceDoAnfitriao: null, chave: null };
      mudar('autenticando');
      transporte.enviar(PAR, {
        t: 'ola',
        modo: dispositivo ? 'dispositivo' : 'parear',
        id: dispositivo?.id,
        nome,
        nc: conversa.nonceDoCliente,
      });
    },
    aoMensagem(_par, mensagem, corpo) {
      aoMensagem(mensagem, corpo).catch(() => transporte.fechar(PAR));
    },
    aoCaminho(_par, novo) {
      caminho = novo;
      aoMudar(estado());
    },
    aoFechar() {
      conversa = null;
      falharPendentes();
      if (fase !== 'recusado') mudar('desconectado');
    },
  });

  /** Espera a conexão ficar pronta por alguns segundos, para uma queda rápida não virar erro na tela. */
  function aguardarPronto(esperaMs) {
    if (fase === 'pronto' || fase === 'recusado') return Promise.resolve();
    return new Promise((ok) => {
      const acordar = () => {
        clearTimeout(prazo);
        ok();
      };
      const prazo = setTimeout(() => {
        esperando = esperando.filter((x) => x !== acordar);
        ok();
      }, esperaMs);
      esperando.push(acordar);
    });
  }

  /** Leva um pedido da agenda ao computador do estúdio. */
  async function buscar({ metodo, caminho: destino, cabecalhos = {}, corpo = null }, esperaMs = ESPERA_PELA_CONEXAO_MS) {
    await aguardarPronto(esperaMs);
    if (fase === 'recusado') throw new ErroDeConexao('recusado', estado().mensagem);
    if (fase !== 'pronto') {
      throw new ErroDeConexao('desconectado', 'Sem conexão com o computador do estúdio. Tentando reconectar.');
    }
    const id = proximoId++;
    return new Promise((ok, falha) => {
      const prazo = setTimeout(() => {
        pendentes.delete(id);
        falha(new ErroDeConexao('tempo', 'O computador do estúdio demorou demais para responder.'));
      }, PRAZO_DA_RESPOSTA_MS);
      pendentes.set(id, { ok, falha, prazo });
      transporte.enviar(PAR, { t: 'req', id, metodo, caminho: destino, cabecalhos }, corpo);
    });
  }

  return { aguardarPronto, buscar, estado };
}

module.exports = { criarCliente, ErroDeConexao, MOTIVOS };
