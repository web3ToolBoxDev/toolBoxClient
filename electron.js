const { app, BrowserWindow, utilityProcess, ipcMain, dialog } = require('electron');
const path = require('path');
const shell = require('electron').shell;
const config = require('./config').getInstance();
const isBuild = config.getIsBuild();

console.log('isBuild:', isBuild);


async function handleFileOpen() {
  const { canceled, filePaths } = await dialog.showOpenDialog()
  if (!canceled) {
    return filePaths[0]
  }
}
async function chooseDirectory() {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (!canceled) {
    return filePaths[0]
  }
}
async function openLink(url) {
  await shell.openExternal(url);
}




let mainWindow = null;
let backendProcess = null;

function createWindow() {
  app.setName('Web3toolbox')
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, './client/public/favicon.ico'),
    webPreferences: {
      nodeIntegration: true,
      webSecurity: false, // 禁用跨域限制
      preload: path.join(__dirname, 'preload.js')
    },
  });
  console.log(`file://${path.join(__dirname, './client/build/index.html')}`);
  const startURL = isBuild
    ? `file://${path.join(__dirname, './client/build/index.html')}`
    : 'http://localhost:3000';

  mainWindow.loadURL(startURL);

  mainWindow.on('closed', () => {
    mainWindow = null;
    // 窗口关闭时终止后台服务子进程
    if (backendProcess) {
      backendProcess.kill();
      backendProcess = null;
    }
  });
}

// 创建后台服务进程
function createBackendProcess() {
  backendProcess = utilityProcess.fork(path.join(__dirname, 
    './server/server.js'));
  // backendProcess.stdout.on('data', (data) => {
  //   console.log(`Received chunk ${data}`)
  // })

}

app.whenReady().then(() => {
  ipcMain.handle('dialog:openFile', handleFileOpen)
  ipcMain.handle('dialog:chooseDirectory', chooseDirectory)
  ipcMain.handle('dialog:openLink', (event, url) => openLink(url))
  if (mainWindow === null) {
    createWindow();
    // createBackendProcess();
  }
  if (backendProcess === null) {
    createBackendProcess();
  }
  app.on('activate', function () {
    if (mainWindow === null) {
      console.log('重新创建窗口');
      createWindow();
      // createBackendProcess();
    } else {
      mainWindow.show();
    }
    if (backendProcess === null) {
      createBackendProcess();
    }
  });
  // 在应用程序关闭之前终止后台服务子进程
  app.on('before-quit', () => {
    if (backendProcess) {
      backendProcess.kill();
      backendProcess = null;
    }
  });
  app.on('window-all-closed', () => {
    console.log('所有窗口已关闭');
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
})








module.exports = app;