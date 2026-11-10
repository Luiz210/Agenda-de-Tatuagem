/**
 * Acompanha a atualização automática e informa cada mudança às telas.
 * Fases: parado, verificando, baixando, pronta, atualizado, erro e indisponivel.
 */
function criarAtualizador({ autoUpdater, versaoAtual, aoMudar }) {
  let estado = { fase: 'parado', versaoAtual };
  let buscaManual = false;

  const definir = (novo) => {
    estado = { versaoAtual, ...novo };
    aoMudar(estado);
  };

  autoUpdater.on('checking-for-update', () => {
    if (estado.fase !== 'pronta') definir({ fase: 'verificando' });
  });
  autoUpdater.on('update-available', (info) => definir({ fase: 'baixando', versao: info.version, progresso: 0 }));
  autoUpdater.on('download-progress', (p) =>
    definir({ fase: 'baixando', versao: estado.versao, progresso: Math.round(p.percent) }),
  );
  autoUpdater.on('update-not-available', () => definir({ fase: 'atualizado' }));
  autoUpdater.on('update-downloaded', (info) => definir({ fase: 'pronta', versao: info.version }));
  autoUpdater.on('error', () => {
    // A verificação automática falha em silêncio, por exemplo sem internet.
    definir(buscaManual ? { fase: 'erro' } : { fase: 'parado' });
  });

  return {
    ler: () => estado,
    async buscar(manual = false) {
      if (estado.fase === 'baixando' || estado.fase === 'pronta') return;
      buscaManual = manual;
      try {
        await autoUpdater.checkForUpdates();
      } catch {
        // O evento de erro já atualizou o estado.
      }
    },
    instalar: () => autoUpdater.quitAndInstall(true, true),
  };
}

module.exports = { criarAtualizador };
