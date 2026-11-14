/**
 * Códigos, chaves e provas da conexão pela internet.
 *
 * Um computador é autorizado de duas formas: na primeira vez, por um código
 * temporário gerado no computador do estúdio; depois, por uma chave própria
 * que ele recebe no pareamento. Nos dois casos o segredo nunca trafega: cada
 * lado envia um HMAC calculado com ele sobre as impressões digitais (DTLS) da
 * conexão. Assim, quem estiver no meio do caminho, inclusive o servidor de
 * sinalização, não consegue se passar por nenhum dos dois.
 */
const crypto = require('node:crypto');

/** Sem 0, 1, I e O, para ninguém confundir ao ditar ou digitar. */
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const TAMANHO_DO_ESTUDIO = 12;
const TAMANHO_DO_CODIGO = 8;
// Encarece testar códigos por força bruta a partir de uma prova capturada.
const ITERACOES = 200_000;

function aleatorio(tamanho) {
  // 32 símbolos: cada byte escolhe um deles sem viés.
  return [...crypto.randomBytes(tamanho)].map((b) => ALFABETO[b & 31]).join('');
}

const gerarEstudio = () => aleatorio(TAMANHO_DO_ESTUDIO);
const gerarCodigo = () => aleatorio(TAMANHO_DO_CODIGO);
const gerarChave = () => crypto.randomBytes(32).toString('base64');
const gerarNonce = () => crypto.randomBytes(16).toString('hex');

/** Aceita o que a pessoa digitou com espaços, hífens ou minúsculas. */
const normalizar = (texto) =>
  String(texto ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** ABCD-EFGH-JKLM, como aparece nas telas. */
const formatar = (texto) => normalizar(texto).replace(/(.{4})(?=.)/g, '$1-');

const estudioValido = (texto) => new RegExp(`^[${ALFABETO}]{${TAMANHO_DO_ESTUDIO}}$`).test(texto);
const codigoValido = (texto) => new RegExp(`^[${ALFABETO}]{${TAMANHO_DO_CODIGO}}$`).test(texto);

/** A chave que os dois lados derivam do código temporário. */
function chaveDoCodigo(codigo, estudio) {
  return new Promise((ok, falha) => {
    crypto.pbkdf2(codigo, `agenda-tatuagem:${estudio}`, ITERACOES, 32, 'sha256', (erro, chave) =>
      erro ? falha(erro) : ok(chave),
    );
  });
}

/**
 * A prova de que um lado conhece a chave nesta conexão: o papel de quem prova,
 * as duas impressões digitais e um número aleatório de cada lado. Mudando
 * qualquer um deles (outra conexão, outro papel), a prova não serve.
 */
function prova(chave, papel, impressaoDoCliente, impressaoDoAnfitriao, nonceDoCliente, nonceDoAnfitriao) {
  return crypto
    .createHmac('sha256', chave)
    .update([papel, impressaoDoCliente, impressaoDoAnfitriao, nonceDoCliente, nonceDoAnfitriao].join('\n'))
    .digest('hex');
}

/** Compara sem revelar, pelo tempo gasto, onde está a diferença. */
function iguais(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = {
  chaveDoCodigo,
  codigoValido,
  estudioValido,
  formatar,
  gerarChave,
  gerarCodigo,
  gerarEstudio,
  gerarNonce,
  iguais,
  normalizar,
  prova,
};
