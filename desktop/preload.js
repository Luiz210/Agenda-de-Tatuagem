const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agendaApp', {
  modo: ipcRenderer.sendSync('modo'),
  abrirConexao: () => ipcRenderer.send('abrir-conexao'),
  lerConexao: () => ipcRenderer.invoke('ler-conexao'),
  salvarConexao: (dados) => ipcRenderer.send('salvar-conexao', dados),
  // Conexão pela internet (tela de conexão).
  conectarInternet: (dados) => ipcRenderer.invoke('conectar-internet', dados),
  gerarCodigoInternet: () => ipcRenderer.invoke('gerar-codigo-internet'),
  removerDispositivo: (id) => ipcRenderer.invoke('remover-dispositivo', id),
  ouvirInternet: (aoMudar) => ipcRenderer.on('internet-estado', (_evento, estado) => aoMudar(estado)),
  lerAtualizacao: () => ipcRenderer.invoke('ler-atualizacao'),
  buscarAtualizacao: () => ipcRenderer.send('buscar-atualizacao'),
  instalarAtualizacao: () => ipcRenderer.send('instalar-atualizacao'),
  ouvirAtualizacao: (aoMudar) =>
    ipcRenderer.on('atualizacao-estado', (_evento, estado) => aoMudar(estado)),
});
