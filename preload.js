const { contextBridge, ipcRenderer } = require('electron/renderer')
console.log('preload.js loaded')

const safeInvoke = (channel, ...args) => {
  try { return ipcRenderer.invoke(channel, ...args) }
  catch (e) { console.error('IPC invoke error:', channel, e); return Promise.resolve({ success: false, message: e.message }) }
}
const safeSendSync = (channel, ...args) => {
  try { return ipcRenderer.sendSync(channel, ...args) }
  catch (e) { console.error('IPC sendSync error:', channel, e); return null }
}

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (options) => safeInvoke('dialog:openFile', options),
  chooseDirectory: () => safeInvoke('dialog:chooseDirectory'),
  openLink: (url) => safeInvoke('dialog:openLink', url),
  revealInFolder: (payload) => safeInvoke('dialog:revealInFolder', payload),
  focusWebContents: () => safeInvoke('window:focusWebContents'),
  alertSync: (message) => safeSendSync('dialog:alertSync', message),
  confirmSync: (message) => safeSendSync('dialog:confirmSync', message),
  getBackendPort: () => safeSendSync('get-backend-port'),
  getSavePath: () => safeInvoke('get-save-path'),
  setSavePath: (path) => safeInvoke('set-save-path', path),
  getChromePath: () => safeInvoke('get-chrome-path'),
  setChromePath: (path) => safeInvoke('set-chrome-path', path),
  checkProxy: (params) => safeInvoke('check-proxy', params),
  getFingerPrints: () => safeInvoke('get-fingerprints'),
  generateFingerPrints: (counts) => safeInvoke('generate-fingerprints', counts),
  getFingerPrintCount: () => safeInvoke('get-fingerprint-count'),
})
