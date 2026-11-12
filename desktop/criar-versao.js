// Cria a versão no GitHub antes do envio dos arquivos. O electron-builder envia
// o instalador e o blockmap ao mesmo tempo, e cada envio tentava criar a mesma versão.
//
// A versão fica marcada no commit atual. A descrição é o arquivo novidades.md,
// se existir; sem ele, a lista dos commits desde a versão anterior. Por isso o código precisa estar commitado e enviado (push)
// antes de publicar: senão o instalador teria código que o GitHub não mostra.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { version, build } = require('./package.json');

// O repositório vem do package.json, para ficar configurado num lugar só.
const { owner, repo } = build.publish[0];
const REPOSITORIO = `${owner}/${repo}`;
const API = `https://api.github.com/repos/${REPOSITORIO}`;
const CABECALHOS = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${process.env.GH_TOKEN}`,
  'User-Agent': 'agenda-tatuagem-publicar',
};

// O publicar.bat acabou de aumentar a versão nestes arquivos: eles podem estar alterados.
const ALTERADOS_PELA_PUBLICACAO = ['desktop/package.json', 'desktop/package-lock.json'];

const git = (comando) => execSync(`git ${comando}`, { encoding: 'utf8', cwd: __dirname }).trim();

function parar(mensagem) {
  console.error(`\n${mensagem}\n`);
  process.exit(1);
}

/** O commit publicado precisa ser exatamente o código da pasta, e já estar no GitHub. */
function commitPublicado() {
  const pendentes = git('status --porcelain')
    .split('\n')
    .filter(Boolean)
    .map((linha) => linha.slice(3).replace(/"/g, ''))
    .filter((arquivo) => !ALTERADOS_PELA_PUBLICACAO.includes(arquivo));
  if (pendentes.length) {
    parar(
      'Há alterações sem commit:\n  ' +
        pendentes.join('\n  ') +
        '\nFaça o commit e o push antes de publicar, para a versão no GitHub ter o mesmo código do instalador.\n' +
        'Depois, volte a versão do desktop\\package.json para a anterior e rode o publicar.bat de novo.',
    );
  }
  const commit = git('rev-parse HEAD');
  const remotos = git(`branch -r --contains ${commit}`);
  if (!remotos) {
    parar(
      'O último commit ainda não foi enviado para o GitHub. Rode "git push" e depois o publicar.bat de novo.\n' +
        'Antes, volte a versão do desktop\\package.json para a anterior.',
    );
  }
  return commit;
}

async function pedir(caminho, opcoes = {}) {
  const resposta = await fetch(`${API}${caminho}`, { ...opcoes, headers: CABECALHOS });
  return resposta;
}

/** Os títulos dos commits desde a versão publicada anterior. */
async function novidades(commit) {
  const anterior = await pedir('/releases/latest');
  if (!anterior.ok) return '';
  const { tag_name: tag } = await anterior.json();
  const comparacao = await pedir(`/compare/${tag}...${commit}`);
  if (!comparacao.ok) return '';
  const { commits } = await comparacao.json();
  return commits
    .map((c) => c.commit.message.split('\n')[0])
    .filter((titulo) => !titulo.startsWith('Merge'))
    .map((titulo) => `- ${titulo}`)
    .join('\n');
}

/** O texto escrito à mão para esta versão, se houver. */
function novidadesEscritas() {
  try {
    return fs.readFileSync(path.join(__dirname, 'novidades.md'), 'utf8').trim();
  } catch {
    return '';
  }
}

async function criar() {
  const commit = commitPublicado();
  const escritas = novidadesEscritas();
  const lista = escritas ? '' : await novidades(commit);
  const corpo = escritas || (lista ? `Novidades desde a versão anterior:\n\n${lista}` : `Versão ${version}.`);

  const resposta = await pedir('/releases', {
    method: 'POST',
    body: JSON.stringify({ tag_name: `v${version}`, target_commitish: commit, name: version, body: corpo }),
  });

  if (!resposta.ok) {
    console.error(`Não foi possível criar a versão ${version} em ${REPOSITORIO}: ${resposta.status}`);
    console.error(await resposta.text());
    process.exit(1);
  }
  console.log(`Versão ${version} criada em ${REPOSITORIO}, no commit ${commit.slice(0, 7)}.`);
  console.log(corpo);
  if (escritas) console.log('\nDepois de publicar, apague ou reescreva o desktop\\novidades.md para a próxima versão.');
}

criar().catch((erro) => {
  console.error(`Não foi possível falar com o GitHub: ${erro.message}`);
  process.exit(1);
});
