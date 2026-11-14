const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('launcher', {
  selectServer: id => ipcRenderer.invoke('select-server',id),
  checkLauncher: () => ipcRenderer.invoke('launcher-check'),
  downloadLauncher: () => ipcRenderer.invoke('launcher-download'),
  installLauncher: () => ipcRenderer.invoke('launcher-install'),
  state: () => ipcRenderer.invoke('state'),
  save: data => ipcRenderer.invoke('save', data),
  login: () => ipcRenderer.invoke('login'),
  logout: () => ipcRenderer.invoke('logout'),
  update: () => ipcRenderer.invoke('update'),
  play: data => ipcRenderer.invoke('play', data),
  chooseJava: () => ipcRenderer.invoke('choose-java'),
  folder: kind => ipcRenderer.invoke('folder', kind),
  onEvent: callback => { const listener = (_, value) => callback(value); ipcRenderer.on('event', listener); return () => ipcRenderer.removeListener('event', listener); }
});
