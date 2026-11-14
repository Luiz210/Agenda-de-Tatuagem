/**
 * Testes do pareamento e do túnel de pedidos, sem WebRTC: os dois lados
 * conversam por um transporte em memória. Rodar: node --test testes/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarAnfitriao, TENTATIVAS_POR_CODIGO } = require('../internet/anfitriao');
const { criarCliente } = require('../internet/cliente');
const seguranca = require('../internet/seguranca');

const ESTUDIO = 'ABCDEFGH2345';

/** Liga um anfitrião a vários clientes, entregando as mensagens fora de ordem de chamada, como a rede. */
function criarRede() {
  let ouvinteDoAnfitriao;
  const clientes = new Map();
  let proximo = 1;

  const anfitriao = {
    ouvir: (o) => (ouvinteDoAnfitriao = o),
    enviar: (par, m, corpo) => setImmediate(() => clientes.get(par)?.ouvinte.aoMensagem('anfitriao', m, corpo)),
    fechar: (par) => derrubar(par),
    parar() {},
  };

  function derrubar(par) {
    const c = clientes.get(par);
    if (!c || !c.ligado) return;
    c.ligado = false;
    setImmediate(() => {
      ouvinteDoAnfitriao.aoFechar(par);
      c.ouvinte.aoFechar('anfitriao');
    });
  }

  function novoCliente() {
    const par = `c${proximo++}`;
    const c = { ouvinte: null, ligado: false, parado: false };
    clientes.set(par, c);
    return {
      par,
      transporte: {
        ouvir: (o) => (c.ouvinte = o),
        enviar: (_p, m, corpo) => setImmediate(() => c.ligado && ouvinteDoAnfitriao.aoMensagem(par, m, corpo)),
        fechar: () => derrubar(par),
        parar: () => (c.parado = true),
      },
      /** Abre a conexão. Com "noMeio", cada lado vê uma impressão digital diferente da real. */
      ligar({ noMeio = false } = {}) {
        c.ligado = true;
        const fpC = `sha-256 cliente-${par}`;
        const fpA = 'sha-256 anfitriao';
        ouvinteDoAnfitriao.aoAbrir(par, { local: fpA, remoto: noMeio ? 'sha-256 intruso' : fpC });
        c.ouvinte.aoAbrir('anfitriao', { local: fpC, remoto: noMeio ? 'sha-256 intruso' : fpA });
      },
      derrubar: () => derrubar(par),
      get parado() {
        return c.parado;
      },
    };
  }

  return { anfitriao, novoCliente };
}

function montar() {
  const rede = criarRede();
  const dispositivos = [];
  const pedidos = [];
  const anfitriao = criarAnfitriao({
    transporte: rede.anfitriao,
    dispositivos,
    salvar() {},
    async buscarLocal(pedido) {
      pedidos.push(pedido);
      if (pedido.caminho === '/quebra') throw new Error('servidor fora');
      return {
        status: 200,
        cabecalhos: { 'content-type': 'application/json' },
        corpo: Buffer.from(JSON.stringify({ caminho: pedido.caminho, tamanho: pedido.corpo?.length ?? 0 })),
      };
    },
  });
  anfitriao.definirEstudio(ESTUDIO);

  function cliente({ codigo = null, dispositivo = null, nome = 'Notebook' } = {}) {
    const ponta = rede.novoCliente();
    const guardado = { dispositivo };
    const logica = criarCliente({
      estudio: ESTUDIO,
      transporte: ponta.transporte,
      dispositivo,
      codigo,
      nome,
      aoParear: (d) => (guardado.dispositivo = d),
    });
    return { ...ponta, ponta, logica, guardado };
  }

  return { anfitriao, dispositivos, pedidos, cliente };
}

const pronto = (c) => c.logica.aguardarPronto(5000).then(() => c.logica.estado());

test('pareia com o código, recebe uma chave própria e o código deixa de valer', async () => {
  const { anfitriao, dispositivos, cliente } = montar();
  const { codigo } = anfitriao.gerarCodigo();
  assert.match(codigo, /^[2-9A-Z]{4}-[2-9A-Z]{4}$/);

  const c = cliente({ codigo });
  c.ligar();
  assert.equal((await pronto(c)).fase, 'pronto');
  assert.equal(dispositivos.length, 1);
  assert.equal(dispositivos[0].nome, 'Notebook');
  assert.equal(c.guardado.dispositivo.id, dispositivos[0].id);
  assert.equal(anfitriao.listar()[0].conectado, true);

  const outro = cliente({ codigo });
  outro.ligar();
  const estado = await pronto(outro);
  assert.equal(estado.fase, 'recusado');
  assert.equal(estado.motivo, 'sem-codigo');
  assert.equal(dispositivos.length, 1);
});

test('reconecta só com a chave do dispositivo, sem código', async () => {
  const { anfitriao, cliente } = montar();
  const primeiro = cliente({ codigo: anfitriao.gerarCodigo().codigo });
  primeiro.ligar();
  await pronto(primeiro);
  primeiro.derrubar();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(anfitriao.listar()[0].conectado, false);

  const depois = cliente({ dispositivo: primeiro.guardado.dispositivo });
  depois.ligar();
  assert.equal((await pronto(depois)).fase, 'pronto');
});

test('código errado é recusado e, depois de 5 erros, o código é cancelado', async () => {
  const { anfitriao, dispositivos, cliente } = montar();
  const { codigo } = anfitriao.gerarCodigo();
  for (let i = 0; i < TENTATIVAS_POR_CODIGO; i++) {
    const c = cliente({ codigo: 'ZZZZ-ZZZZ' });
    c.ligar();
    const estado = await pronto(c);
    assert.equal(estado.motivo, 'codigo');
    assert.equal(c.ponta.parado, true);
  }
  const certo = cliente({ codigo });
  certo.ligar();
  assert.equal((await pronto(certo)).motivo, 'sem-codigo');
  assert.equal(dispositivos.length, 0);
});

test('sem código gerado ninguém pareia, e código vencido não vale', async () => {
  const rede = criarRede();
  let relogio = 1_000_000;
  const anfitriao = criarAnfitriao({
    transporte: rede.anfitriao,
    dispositivos: [],
    salvar() {},
    buscarLocal: async () => ({ status: 200, cabecalhos: {}, corpo: Buffer.alloc(0) }),
    agora: () => relogio,
  });
  anfitriao.definirEstudio(ESTUDIO);
  const tentar = async (codigo) => {
    const ponta = rede.novoCliente();
    const logica = criarCliente({ estudio: ESTUDIO, transporte: ponta.transporte, codigo, nome: 'x', aoParear() {} });
    ponta.ligar();
    await logica.aguardarPronto(5000);
    return logica.estado();
  };
  assert.equal((await tentar('AAAA-AAAA')).motivo, 'sem-codigo');
  const { codigo } = anfitriao.gerarCodigo();
  relogio += 11 * 60 * 1000;
  assert.equal((await tentar(codigo)).motivo, 'sem-codigo');
});

test('alguém no meio do caminho não passa, mesmo com o código certo', async () => {
  const { anfitriao, dispositivos, cliente } = montar();
  const c = cliente({ codigo: anfitriao.gerarCodigo().codigo });
  c.ligar({ noMeio: true });
  const estado = await pronto(c);
  assert.equal(estado.fase, 'recusado');
  assert.equal(dispositivos.length, 0);
});

test('o cliente desconfia de um anfitrião que não conhece a chave', async () => {
  const rede = criarRede();
  const ponta = rede.novoCliente();
  // Um "estúdio" falso que aceita qualquer prova.
  rede.anfitriao.ouvir({
    aoAbrir() {},
    aoFechar() {},
    aoMensagem(par, m) {
      if (m.t === 'ola') rede.anfitriao.enviar(par, { t: 'desafio', nh: 'x' });
      if (m.t === 'prova') rede.anfitriao.enviar(par, { t: 'aceito', mac: '00', dispositivo: { id: 'a', chave: 'b' } });
    },
  });
  let pareou = false;
  const logica = criarCliente({
    estudio: ESTUDIO,
    transporte: ponta.transporte,
    codigo: 'AAAA-AAAA',
    nome: 'x',
    aoParear: () => (pareou = true),
  });
  ponta.ligar();
  await logica.aguardarPronto(5000);
  assert.equal(logica.estado().motivo, 'falso');
  assert.equal(pareou, false);
});

test('dispositivo removido é derrubado e não entra mais', async () => {
  const { anfitriao, cliente } = montar();
  const c = cliente({ codigo: anfitriao.gerarCodigo().codigo });
  c.ligar();
  await pronto(c);
  const pedido = c.logica.buscar({ metodo: 'GET', caminho: '/clientes' });
  anfitriao.remover(anfitriao.listar()[0].id);
  await assert.rejects(pedido, { codigo: 'desconectado' });

  const denovo = cliente({ dispositivo: c.guardado.dispositivo });
  denovo.ligar();
  assert.equal((await pronto(denovo)).motivo, 'dispositivo');
});

test('leva pedidos com corpo e só os cabeçalhos permitidos', async () => {
  const { anfitriao, pedidos, cliente } = montar();
  const c = cliente({ codigo: anfitriao.gerarCodigo().codigo });
  c.ligar();
  await pronto(c);

  const resposta = await c.logica.buscar({
    metodo: 'POST',
    caminho: '/tatuagens/7/imagens?x=1',
    cabecalhos: { authorization: 'Bearer t', 'content-type': 'image/png', 'x-agenda-local': 'segredo', cookie: 'a=b' },
    corpo: Buffer.alloc(300_000, 7),
  });
  assert.equal(resposta.status, 200);
  assert.deepEqual(JSON.parse(resposta.corpo.toString()), { caminho: '/tatuagens/7/imagens?x=1', tamanho: 300_000 });
  assert.deepEqual(pedidos[0].cabecalhos, { authorization: 'Bearer t', 'content-type': 'image/png' });

  const invalido = await c.logica.buscar({ metodo: 'GET', caminho: 'http://outro.site/' });
  assert.equal(invalido.status, 502);
  const quebrado = await c.logica.buscar({ metodo: 'GET', caminho: '/quebra' });
  assert.equal(quebrado.status, 502);
  assert.match(JSON.parse(quebrado.corpo.toString()).mensagem, /não conseguiu atender/);
});

test('sem se identificar, nenhum pedido chega ao servidor da agenda', async () => {
  const rede = criarRede();
  const pedidos = [];
  const anfitriao = criarAnfitriao({
    transporte: rede.anfitriao,
    dispositivos: [],
    salvar() {},
    buscarLocal: async (p) => (pedidos.push(p), { status: 200, cabecalhos: {}, corpo: Buffer.alloc(0) }),
  });
  anfitriao.definirEstudio(ESTUDIO);
  const ponta = rede.novoCliente();
  const recebidas = [];
  ponta.transporte.ouvir({ aoAbrir() {}, aoFechar() {}, aoMensagem: (_p, m) => recebidas.push(m) });
  ponta.ligar();
  ponta.transporte.enviar('anfitriao', { t: 'req', id: 1, metodo: 'GET', caminho: '/clientes' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(pedidos.length, 0);
  assert.equal(recebidas[0].t, 'recusado');
});

test('pedido feito durante uma queda espera a reconexão', async () => {
  const { anfitriao, cliente } = montar();
  const c = cliente({ codigo: anfitriao.gerarCodigo().codigo });
  const pedido = c.logica.buscar({ metodo: 'GET', caminho: '/sessoes' }, 2000);
  setTimeout(() => c.ligar(), 100);
  assert.equal((await pedido).status, 200);
  await assert.rejects(
    cliente({ dispositivo: { id: 'x', chave: seguranca.gerarChave() } }).logica.buscar({ metodo: 'GET', caminho: '/' }, 50),
    { codigo: 'desconectado' },
  );
});

test('códigos e IDs: formato, normalização e validade', () => {
  assert.equal(seguranca.gerarEstudio().length, 12);
  assert.ok(seguranca.estudioValido(seguranca.gerarEstudio()));
  assert.ok(seguranca.codigoValido(seguranca.gerarCodigo()));
  assert.equal(seguranca.normalizar(' abcd-efgh '), 'ABCDEFGH');
  assert.equal(seguranca.formatar('abcdefgh2345'), 'ABCD-EFGH-2345');
  assert.equal(seguranca.estudioValido('ABCDEFGH0000'), false);
});
