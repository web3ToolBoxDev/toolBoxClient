const { contextBridge, ipcRenderer } = require('electron/renderer')
console.log('preload.js')
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  chooseDirectory: () => ipcRenderer.invoke('dialog:chooseDirectory'),
  openLink: (url) => ipcRenderer.invoke('dialog:openLink', url)
})