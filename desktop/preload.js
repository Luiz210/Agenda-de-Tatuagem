const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agendaApp', {
  modo: ipcRenderer.sendSync('modo'),
  abrirConexao: () => ipcRenderer.send('abrir-conexao'),
  lerConexao: () => ipcRenderer.invoke('ler-conexao'),
  salvarConexao: (dados) => ipcRenderer.send('salvar-conexao', dados),
  lerAtualizacao: () => ipcRenderer.invoke('ler-atualizacao'),
  buscarAtualizacao: () => ipcRenderer.send('buscar-atualizacao'),
  instalarAtualizacao: () => ipcRenderer.send('instalar-atualizacao'),
  ouvirAtualizacao: (aoMudar) =>
    ipcRenderer.on('atualizacao-estado', (_evento, estado) => aoMudar(estado)),
});
