const { app, BrowserWindow, utilityProcess, ipcMain, dialog, Menu } = require('electron');
const { t } = require('i18next');
const path = require('path');
const fs = require('fs');
const shell = require('electron').shell;
if (!process.env.APP_USER_DATA) {
  try {
    process.env.APP_USER_DATA = app.getPath('userData');
  } catch (e) {
    // ignore if not available
  }
}
const config = require('./config').getInstance();
const isBuild = config.getIsBuild();
// const isBuild = true;

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

async function revealInFolder(payload = {}) {
  const inputPath = typeof payload === 'string' ? payload : payload?.filePath;
  const basePath = typeof payload === 'object' ? payload?.basePath : '';
  const fallbackOpenPath = typeof payload === 'object' ? payload?.fallbackOpenPath : '';
  const raw = String(inputPath || '').trim();
  const base = String(basePath || '').trim();
  const fallback = String(fallbackOpenPath || '').trim();
  const targetPath = raw
    ? (path.isAbsolute(raw) ? raw : (base ? path.resolve(base, raw) : path.resolve(raw)))
    : '';
  const shouldOpenFile = typeof payload === 'object' && payload?.openFile === true;
  try {
    if (targetPath && fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.isFile()) {
        if (shouldOpenFile) {
          await shell.openPath(targetPath);
          return { success: true, mode: 'open-file', path: targetPath };
        }
        shell.showItemInFolder(targetPath);
        return { success: true, mode: 'select-file', path: targetPath };
      }
      if (stat.isDirectory()) {
        await shell.openPath(targetPath);
        return { success: true, mode: 'open-dir', path: targetPath };
      }
    }
    const openDir = fallback || (targetPath ? path.dirname(targetPath) : '');
    if (openDir && fs.existsSync(openDir)) {
      await shell.openPath(openDir);
      return { success: true, mode: 'open-dir', path: openDir };
    }
    return { success: false, message: 'Path not found', path: targetPath || openDir };
  } catch (error) {
    return { success: false, message: error?.message || 'Failed to reveal path', path: targetPath };
  }
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
  // if (true){
  if (isBuild) {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setAutoHideMenuBar(true);
    Menu.setApplicationMenu(null);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    // 窗口关闭时终止后台服务子进程
    if (backendProcess) {
      backendProcess.kill();
      backendProcess = null;
    }
  });
  // Windows focus fix: after the window regains focus, Electron on Windows
  // sometimes fails to pass keyboard/mouse events to the renderer.
  // Old approach used blur()+focus() on the BrowserWindow which caused a
  // ~200ms period where the input fields were unclickable/untypeable.
  // New approach: focus the webContents directly, which restores renderer
  // input without stealing window-level focus.
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    mainWindow.on('focus', () => {
      // Use setImmediate to let the window finish its focus transition
      setImmediate(() => {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
          mainWindow.webContents.focus();
        }
      });
    });
  }

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
  ipcMain.handle('dialog:revealInFolder', (event, payload) => revealInFolder(payload))
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
