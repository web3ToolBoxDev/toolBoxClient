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


async function handleFileOpen(options) {
  const { canceled, filePaths } = await dialog.showOpenDialog(options || {})
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
  const buildPath = path.join(__dirname, './client/build/index.html');
  const startURL = fs.existsSync(buildPath)
    ? `file://${buildPath}`
    : 'http://localhost:3000';
  console.log('[Electron] Loading URL:', startURL);
  mainWindow.loadURL(startURL);
  mainWindow.show();
  mainWindow.focus();
  // Inject backend port into renderer once DOM is ready
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`window.__API_PORT__ = ${backendPort};`);
  });
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
let backendPort = 30001; // default, updated when server reports actual port

function createBackendProcess() {
  // Ensure full OS env (especially ComSpec/PATH) survives into the utility process
  const serverEnv = { ...process.env };
  if (process.platform === 'win32' && !serverEnv.ComSpec && !serverEnv.COMSPEC) {
    serverEnv.ComSpec = `${process.env.SystemRoot || 'C:\\Windows'}\\system32\\cmd.exe`;
  }
  backendProcess = utilityProcess.fork(path.join(__dirname,
    './server/server.js'), { env: serverEnv });

  // Listen for actual port from server
  backendProcess.on('message', (msg) => {
    if (msg && msg.type === 'server-port') {
      backendPort = msg.port;
      console.log(`[Electron] Backend started on port ${backendPort}`);
      // Inject port into renderer if window already exists
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(`window.__API_PORT__ = ${backendPort};`);
      }
      // Resolve the port promise
      if (_portResolve) _portResolve(backendPort);
    }
  });
}

// Promise that resolves when backend port is known
let _portResolve;
function waitForBackendPort(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    // If port already known (e.g. dev mode default)
    if (backendPort !== 30001 || !isBuild) { resolve(backendPort); return; }
    _portResolve = resolve;
    setTimeout(() => reject(new Error('Backend port timeout')), timeoutMs);
  });
}

// ─── First-launch dependency install ───
function needsInstall() {
  if (!isBuild) return false;
  const resourcesDir = path.resolve(__dirname, '..');
  // Main app node_modules are in asar — only check child services
  const dirs = [
    path.join(resourcesDir, 'toolService', 'node_modules'),
    path.join(resourcesDir, 'dbservice', 'node_modules')
  ];
  return dirs.some(d => !fs.existsSync(d));
}

function showInstallPage(win) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#0d1117; color:#c9d1d9; display:flex; align-items:center; justify-content:center; height:100vh; flex-direction:column; }
  .logo { font-size:48px; margin-bottom:20px; }
  h2 { margin:0 0 10px; font-weight:400; }
  .progress { width:300px; height:4px; background:#21262d; border-radius:2px; margin:20px 0; overflow:hidden; }
  .bar { height:100%; background:#58a6ff; width:0%; transition:width 0.5s; border-radius:2px; }
  #status { color:#8b949e; font-size:13px; }
</style></head><body>
  <div class="logo">🔧</div>
  <h2>Initializing Web3 ToolBox...</h2>
  <div class="progress"><div class="bar" id="bar"></div></div>
  <div id="status">Installing dependencies, please wait...</div>
</body></html>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function _npmInstall(cwd, label) {
  return new Promise((resolve, reject) => {
    const execPath = config.getDefaultExecPath();
    const npmPath = path.join(path.dirname(execPath), process.platform === 'win32' ? 'npm.cmd' : 'npm');
    console.log(`[install] npm install in ${cwd} (${label})`);
    const { spawn } = require('child_process');
    const env = { ...process.env };
    if (process.platform === 'win32' && !env.ComSpec) {
      env.ComSpec = `${process.env.SystemRoot || 'C:\\Windows'}\\system32\\cmd.exe`;
    }
    const child = spawn(npmPath, ['install', '--production', '--no-optional'], {
      cwd,
      env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', d => { output += d; console.log(`[install:${label}] ${d.toString().trim()}`); });
    child.stderr.on('data', d => { output += d; });
    child.on('close', code => {
      if (code === 0) resolve(output);
      else reject(new Error(`npm install (${label}) failed: code ${code}`));
    });
    child.on('error', reject);
  });
}

async function runInstall() {
  const resourcesDir = path.resolve(__dirname, '..');
  // Main app node_modules are in asar — only install child services
  const dirs = [
    { cwd: path.join(resourcesDir, 'toolService'), label: 'toolService' },
    { cwd: path.join(resourcesDir, 'dbservice'), label: 'dbservice' }
  ];
  for (const { cwd, label } of dirs) {
    if (fs.existsSync(path.join(cwd, 'package.json')) && !fs.existsSync(path.join(cwd, 'node_modules'))) {
      await _npmInstall(cwd, label);
    }
  }
}

app.whenReady().then(async () => {
  ipcMain.handle('dialog:openFile', handleFileOpen)
  ipcMain.handle('dialog:chooseDirectory', chooseDirectory)
  ipcMain.handle('dialog:openLink', (event, url) => openLink(url))
  ipcMain.handle('dialog:revealInFolder', (event, payload) => revealInFolder(payload))

  ipcMain.handle('window:focusWebContents', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.blur();
      mainWindow.focus();
    }
  })

  ipcMain.on('dialog:alertSync', (event, message) => {
    dialog.showMessageBoxSync(mainWindow, {
      type: 'info',
      message: String(message),
      buttons: ['OK']
    });
    event.returnValue = true;
  })
  ipcMain.on('dialog:confirmSync', (event, message) => {
    const result = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      message: String(message),
      buttons: ['OK', 'Cancel']
    });
    event.returnValue = result === 0;
  })

  // Expose backend port to renderer (sync IPC for immediate access)
  ipcMain.on('get-backend-port', (event) => {
    event.returnValue = backendPort;
  })

  // First-launch: install dependencies if missing
  if (needsInstall()) {
    createWindow();
    showInstallPage(mainWindow);
    try {
      await runInstall();
      console.log('[install] Dependencies installed successfully');
      // Reload the main app
      const startURL = `file://${path.join(__dirname, './client/build/index.html')}`;
      mainWindow.loadURL(startURL);
    } catch (err) {
      console.error('[install] Failed:', err.message);
      dialog.showErrorBox('Initialization Failed', `Could not install dependencies:\n${err.message}\n\nPlease check your network connection and try again.`);
      app.quit();
      return;
    }
  }

  // Start backend first, wait for port, then create/update window
  if (backendProcess === null) {
    createBackendProcess();
  }
  if (isBuild) {
    try {
      const port = await waitForBackendPort(15000);
      console.log(`[Electron] Backend ready on port ${port}`);
    } catch (e) {
      console.warn('[Electron] Backend port timeout, using default 30001');
    }
  }
  if (mainWindow === null) {
    createWindow();
  }
  // Log window state for debugging
  if (mainWindow) {
    mainWindow.on('close', () => console.log('Main window closing'));
    mainWindow.on('closed', () => { console.log('Main window closed'); mainWindow = null; });
    // Prevent window-all-closed from quitting immediately in headless/Xvfb environments
    let windowCloseTime = 0;
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('[Electron] Window loaded successfully');
      windowCloseTime = 0;
    });
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
  app.on('before-quit', async (e) => {
    if (backendProcess) {
      try {
        const http = require('http');
        await new Promise((resolve) => {
          const req = http.request(`http://127.0.0.1:${backendPort}/api/state/flush`, { method: 'POST', timeout: 3000 }, (res) => {
            res.resume();
            res.on('end', resolve);
          });
          req.on('error', resolve);
          req.on('timeout', () => { req.destroy(); resolve(); });
          req.end();
        });
        console.log('[Electron] StateService flushed before quit');
      } catch (_) { /* best effort */ }
      backendProcess.kill();
      backendProcess = null;
    }
  });
  app.on('window-all-closed', () => {
    console.log('所有窗口已关闭');
    if (process.platform !== 'darwin') {
      // Delay quit to allow any pending operations to complete
      setTimeout(() => {
        if (!app.isQuitting) {
          app.quit();
        }
      }, 2000);
    }
  });
})








module.exports = app;
