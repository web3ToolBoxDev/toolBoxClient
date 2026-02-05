const WebSocket = require('ws');
const url = process.argv[2];

let ws = null;
let webSocketReady = false;
let taskData = null;
let heartBeatTimer = null;

function sendHeartBeat() {
  if (heartBeatTimer) clearInterval(heartBeatTimer);
  heartBeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'heart_beat' }));
    }
  }, 5000);
}

function sendRequestTaskData() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'request_task_data', data: '' }));
  }
}

function sendTaskLog(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'task_log', message }));
  }
}

function sendTaskCompleted(taskName, success, message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'task_completed', taskName, success, message }));
  }
}

function sendTerminateProcess() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'terminate_process' }));
  }
}

function exit() {
  try { ws && ws.close(); } catch {}
  process.exit(0);
}

function initWebSocket() {
  try {
    if (ws) {
      ws.removeAllListeners();
      ws.close();
    }
  } catch {}

  ws = new WebSocket(url);

  ws.on('open', () => {
    webSocketReady = true;
    sendHeartBeat();
    sendRequestTaskData();
  });

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    switch (data.type) {
      case 'heart_beat':
        break;
      case 'request_task_data':
        taskData = data.data;
        break;
      case 'terminate_process':
        sendTerminateProcess();
        exit();
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    webSocketReady = false;
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    webSocketReady = false;
    try { ws.close(); } catch {}
  });
}

initWebSocket();

setInterval(() => {
  if (!ws || ws.readyState === WebSocket.CLOSED) {
    initWebSocket();
  }
}, 5000);

function ensureTaskDataIsObject() {
  if (typeof taskData === 'string') {
    try { taskData = JSON.parse(taskData); } catch {}
  }
  return taskData || {};
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function maskId(value = '') {
  const str = String(value);
  if (str.length <= 8) return '***';
  return `${str.slice(0, 4)}****${str.slice(-4)}`;
}

async function runTask() {
  const payload = ensureTaskDataIsObject();
  const env = payload.env || {};
  const envData = payload.envData || {};
  const taskConfig = payload.taskDataFromFront?.config || {};
  const runMode = taskConfig.__mode || payload.taskDataFromFront?.mode || 'env';

  console.log('envConfigTest payload:', safeJson(payload));

  sendTaskLog(`[envConfigTest] env.id=${env.id || env._id || env.name}`);
  sendTaskLog(`[envConfigTest] mode=${runMode}`);
  sendTaskLog(`[envConfigTest] env.user_agent=${env.user_agent || ''}`);
  sendTaskLog(`[envConfigTest] env.language_js=${env.language_js || ''}`);
  sendTaskLog(`[envConfigTest] env.proxyUrl=${env.proxyUrl || ''}`);
  sendTaskLog(`[envConfigTest] env.timeZone=${env.timeZone || ''}`);
  sendTaskLog(`[envConfigTest] env.position=${safeJson(env.position || {})}`);
  if (envData.wallet) {
    const walletLabel = envData.wallet.address || envData.wallet.id || envData.wallet._id || 'present';
    sendTaskLog(`[envConfigTest] envData.wallet=${maskId(walletLabel)}`);
  } else {
    sendTaskLog('[envConfigTest] envData.wallet=none');
  }
  sendTaskLog(`[envConfigTest] config.default=${safeJson(taskConfig)}`);

  // quick delay to ensure logs are visible
  await new Promise((resolve) => setTimeout(resolve, 1500));

  sendTaskCompleted('环境配置测试', true, 'Config + env data received');
  exit();
}

(async () => {
  while (true) {
    if (webSocketReady) {
      sendRequestTaskData();
      if (taskData) {
        await runTask();
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
})();
