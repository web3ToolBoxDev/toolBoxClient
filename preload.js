const { contextBridge, ipcRenderer } = require('electron/renderer')
console.log('preload.js')
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  chooseDirectory: () => ipcRenderer.invoke('dialog:chooseDirectory'),
  openLink: (url) => ipcRenderer.invoke('dialog:openLink', url),
  revealInFolder: (payload) => ipcRenderer.invoke('dialog:revealInFolder', payload),
  focusWebContents: () => ipcRenderer.invoke('window:focusWebContents'),
  alertSync: (message) => ipcRenderer.sendSync('dialog:alertSync', message),
  confirmSync: (message) => ipcRenderer.sendSync('dialog:confirmSync', message),
  getBackendPort: () => ipcRenderer.sendSync('get-backend-port')
})
