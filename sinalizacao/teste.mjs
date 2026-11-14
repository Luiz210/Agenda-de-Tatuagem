// Confere o servidor de sinalização. Rode "npm run dev" numa janela e "npm run teste" em outra.
const URL_BASE = (process.env.SINALIZACAO || 'ws://127.0.0.1:8787') + '/sala/';
const abrir = (estudio, papel) => new Promise((ok, falha) => {
  const ws = new WebSocket(`${URL_BASE}${estudio}?papel=${papel}`);
  const fila = []; const espera = [];
  ws.onmessage = (e) => { const m = e.data === 'pong' ? 'pong' : JSON.parse(e.data); espera.length ? espera.shift()(m) : fila.push(m); };
  ws.proxima = () => new Promise((r) => fila.length ? r(fila.shift()) : espera.push(r));
  ws.fechou = new Promise((r) => (ws.onclose = (e) => r(e.code)));
  ws.onopen = () => ok(ws); ws.onerror = falha;
});
const env = (ws, m) => ws.send(JSON.stringify(m));
const confere = (nome, cond) => { console.log(cond ? 'ok  ' : 'FALHOU', nome); if (!cond) process.exitCode = 1; };
const E = 'TESTE' + Math.random().toString(36).slice(2, 9).toUpperCase().replace(/[01IO]/g, 'X');
const chave = 'k'.repeat(44);

let c0 = await abrir(E, 'cliente');
let m = await c0.proxima();
confere('estúdio desconhecido é recusado', m.tipo === 'erro' && m.codigo === 'estudio' && (await c0.fechou) === 4404);

const h = await abrir(E, 'anfitriao');
env(h, { tipo: 'registrar', chave });
confere('anfitrião registra', (await h.proxima()).tipo === 'registrado');

const intruso = await abrir(E, 'anfitriao');
env(intruso, { tipo: 'registrar', chave: 'x'.repeat(44) });
m = await intruso.proxima();
confere('outra chave não toma o ID', m.codigo === 'chave' && (await intruso.fechou) === 4403);

const c = await abrir(E, 'cliente');
m = await c.proxima();
confere('cliente recebe olá com anfitrião online', m.tipo === 'ola' && m.anfitriao === true && m.id.length === 16);
const idCliente = m.id;
env(c, { tipo: 'sinal', dados: { oferta: 1 } });
m = await h.proxima();
confere('sinal do cliente chega ao anfitrião com o remetente', m.tipo === 'sinal' && m.de === idCliente && m.dados.oferta === 1);
env(h, { tipo: 'sinal', para: idCliente, dados: { resposta: 2 } });
m = await c.proxima();
confere('sinal do anfitrião chega só ao cliente certo', m.tipo === 'sinal' && m.dados.resposta === 2);
env(c, { tipo: 'ice' });
m = await c.proxima();
confere('ICE devolve STUN', m.tipo === 'ice' && m.servidores[0].urls[0].startsWith('stun:'));
const temTurn = m.servidores.some((s) => [].concat(s.urls).some((u) => u.startsWith('turn')));
console.log(temTurn ? 'ok   TURN configurado (retransmissão disponível)' : 'aviso TURN não configurado: só conexão direta');
c.send('ping');
confere('ping responde pong', (await c.proxima()) === 'pong');

h.close();
m = await c.proxima();
confere('cliente é avisado quando o anfitrião sai', m.tipo === 'anfitriao' && m.online === false);
const h2 = await abrir(E, 'anfitriao');
env(h2, { tipo: 'registrar', chave });
await h2.proxima();
m = await c.proxima();
confere('cliente é avisado quando o anfitrião volta', m.tipo === 'anfitriao' && m.online === true);
h2.close(); c.close();
setTimeout(() => process.exit(), 300);
