const { app, BrowserWindow,utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');


function writeToLog(message) {
  const logDirectory = path.join(os.homedir(), 'my-electron-app-logs');
  const logFilePath = path.join(logDirectory, 'app.log');
  console.log('logFilePath', logFilePath);
  
  // 检查日志目录是否存在，如果不存在 则创建它
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
  }

  // 写入日志消息到日志文件
  fs.appendFileSync(logFilePath, `${new Date().toISOString()} - ${message}\n`);
}


// 在这里设置 isDev 变量表示是否处于开发模式
const isDev = false;
console.log('isDev', isDev);

let mainWindow = null;
let backendProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      webSecurity: true // 禁用跨域限制
    },
  });
  console.log(`file://${path.join(__dirname, './client/build/index.html')}`);
  const startURL = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, './client/build/index.html')}`;

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
  backendProcess = utilityProcess.fork(path.join(__dirname, './server/server.js'));

  backendProcess.on('message', (message) => {
    writeToLog(`收到后台服务消息: ${message}`);
  });

}

app.on('ready', () => {
  writeToLog('应用程序已启动');
  if (mainWindow === null) {
    createWindow();
    // createBackendProcess();
  }
  if (backendProcess === null) {
    createBackendProcess();
  }
});

app.on('window-all-closed', () => {
  writeToLog('所有窗口已关闭');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    writeToLog('激活窗口');
    createWindow();
    // createBackendProcess();
  }else{
    mainWindow.show();
  }
  if (backendProcess === null) {
    createBackendProcess();
  }
});

// 在应用程序关闭之前终止后台服务子进程
app.on('before-quit', () => {
  writeToLog('应用程序即将退出');
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});
module.exports = app;