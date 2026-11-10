// Cria a versão no GitHub antes do envio dos arquivos. O electron-builder envia
// o instalador e o blockmap ao mesmo tempo, e cada envio tentava criar a mesma versão.
const { version, build } = require('./package.json');

// O repositório vem do package.json, para ficar configurado num lugar só.
const { owner, repo } = build.publish[0];
const REPOSITORIO = `${owner}/${repo}`;

async function criar() {
  const resposta = await fetch(`https://api.github.com/repos/${REPOSITORIO}/releases`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      'User-Agent': 'agenda-tatuagem-publicar',
    },
    body: JSON.stringify({ tag_name: `v${version}`, name: version }),
  });

  if (!resposta.ok) {
    console.error(`Não foi possível criar a versão ${version} em ${REPOSITORIO}: ${resposta.status}`);
    console.error(await resposta.text());
    process.exit(1);
  }
  console.log(`Versão ${version} criada em ${REPOSITORIO}.`);
}

criar().catch((erro) => {
  console.error(`Não foi possível falar com o GitHub: ${erro.message}`);
  process.exit(1);
});
