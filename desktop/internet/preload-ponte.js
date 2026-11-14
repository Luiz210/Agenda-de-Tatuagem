const { contextBridge, ipcRenderer } = require('electron');

// A ponte só troca mensagens com o processo principal; não tem acesso a mais nada.
contextBridge.exposeInMainWorld('ponte', {
  emitir: (evento) => ipcRenderer.send('ponte:evento', evento),
  aoComando: (tratar) => ipcRenderer.on('ponte:comando', (_evento, comando) => tratar(comando)),
});
