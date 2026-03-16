const webSocket = require('ws');
const url = process.argv[2];
const puppeteer = require('puppeteer-extra');
const path = require('path');
const fs = require('fs');



let ws = null;
let webSocketReady = false;
let taskData = null;
let heartBeatTimer = null;

const checkIfDirectoryExists = (dirPath) => {
    try {
        return fs.existsSync(dirPath) && fs.lstatSync(dirPath).isDirectory();
    } catch (error) {
    console.error(`Error checking whether directory ${dirPath} exists:`, error);
        return false;
    }
}

const SENSITIVE_KEYS = new Set([
    'mnemonic',
    'privateKey',
    'ethPrivateKey',
    'solPrivateKey',
    'seed',
    'password'
]);

const maskString = (value = '') => {
    const str = String(value);
    if (str.length <= 8) return '***';
    return `${str.slice(0, 4)}****${str.slice(-4)}`;
};

const sanitize = (value) => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sanitize);
    const out = {};
    Object.entries(value).forEach(([key, val]) => {
        if (SENSITIVE_KEYS.has(key)) {
            out[key] = '***';
            return;
        }
        if (key.toLowerCase().includes('private') || key.toLowerCase().includes('mnemonic')) {
            out[key] = '***';
            return;
        }
        if (typeof val === 'string' && (key.toLowerCase().includes('address') || key.toLowerCase().includes('id'))) {
            out[key] = maskString(val);
            return;
        }
        out[key] = sanitize(val);
    });
    return out;
};

function sendSafeLog(log) {
    if (ws && ws.readyState === webSocket.OPEN) {
        const message = typeof log === 'string' ? log : JSON.stringify(sanitize(log));
        ws.send(JSON.stringify({ type: 'task_log', message }));
    }
}

// 心跳包定时发送
function sendHeartBeat() {
    if (heartBeatTimer) {
        clearInterval(heartBeatTimer);
    }
    heartBeatTimer = setInterval(() => {
        if (ws && ws.readyState === webSocket.OPEN) {
            const heartBeatMessage = JSON.stringify({
                type: 'heart_beat'
            });
            ws.send(heartBeatMessage);
        }
    }, 5000); // 每 5 秒发送一次心跳包
}

function sendRequestTaskData() {
    if (ws.readyState === webSocket.OPEN) {
        const requestTaskDataMessage = JSON.stringify({
            type: 'request_task_data',
            data: ''
        });
        ws.send(requestTaskDataMessage);
    }
}

function sendTaskLog(log) {
    sendSafeLog(log);
}

function sendTaskCompleted(taskName, success, message) {
    if (ws.readyState === webSocket.OPEN) {
        const taskCompletedMessage = JSON.stringify({
            type: 'task_completed',
            taskName,
            success,
            message
        });
        ws.send(taskCompletedMessage);
    }
}
function sendTerminateProcess() {
    if (ws.readyState === webSocket.OPEN) {
        const terminateProcessMessage = JSON.stringify({
            type: 'terminate_process'
        });
        ws.send(terminateProcessMessage);
    }
}
function exit() {
    ws.close();
    process.exit(0);
}

function initWebSocket() {
    try {
        if (ws) {
            ws.removeAllListeners();
            ws.close();
        }
    } catch {}
    ws = new webSocket(url);

    ws.on('open', () => {
        webSocketReady = true;
        sendHeartBeat();
        sendRequestTaskData();
    });

    ws.on('message', (message) => {
        let data = JSON.parse(message);
        switch (data.type) {
            case 'heart_beat':
                // console.log('收到服务端心跳包:');
                break;
            case 'request_task_data':
                // console.log('收到任务数据:', data);
                taskData = data.data;
                break;
            case 'terminate_process':
                sendTerminateProcess();
                exit();
            default:
                break;
        }
    });

    ws.on('close', () => {
        webSocketReady = false;
    });

    ws.on('error', (error) => {
        console.error('WebSocket connection error:', error);
        webSocketReady = false;
        try { ws.close(); } catch {}
    });
}

initWebSocket();

// 定时检查连接状态，如果连接断开则重连
setInterval(() => {
    if (!ws || ws.readyState === webSocket.CLOSED) {
        console.log('WebSocket disconnected, attempting to reconnect...');
        initWebSocket();
    }
}, 5000); // 每 5 秒检查一次连接状态
// 进行任务时，需要发送心跳包，接收任务数据，发送任务日志，完成任务
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let closeSignal = false;
// 检测浏览器是否关闭
async function checkBrowserClosed(browser) {
    while (!closeSignal) {
        await sleep(5000);
    }
    await browser.close();
    exit();
}
// 进行任务逻辑
async function runTask() {
    console.log('Task execution started');
    // avoid logging raw task data to frontend
    if (typeof taskData === 'string') {
        taskData = JSON.parse(taskData);
    }
    // 检查是否有 Chrome 路径
    if (!taskData || !taskData.chromePath) {
        console.log(Object.keys(taskData));
    console.error('Chrome path missing in task data');
    sendTaskCompleted('Example Task', false, 'Task failed: Chrome path is missing');
        exit();
    }
    // 检查是否有 userDataDir目录
    const userDataDir = path.join(taskData.savePath, taskData.env.id);
    if (!checkIfDirectoryExists(userDataDir)) {
        // 如果目录不存在，尝试创建
        try {
            fs.mkdirSync(userDataDir, { recursive: true });
            console.log(`Created directory: ${userDataDir}`);
        } catch (error) {
            console.error(`Failed to create directory: ${userDataDir}`, error);
            sendTaskCompleted('Example Task', false, `Task failed: Could not create directory - ${error.message}`);
            exit();
        }
    }
    console.log('useProxy', taskData.env.useProxy);

    // 将新格式 audio: {seed: N} 转为 Chromium 补丁期望的浮点数噪声值
    // 用 seed 做确定性伪随机，保证同一 env 每次生成相同噪声
    let audioNoise = taskData.env.audio;
    if (audioNoise && typeof audioNoise === 'object' && audioNoise.seed !== undefined) {
        // 简单确定性哈希：seed → [0.00001, 0.01) 范围的噪声值
        const s = audioNoise.seed;
        audioNoise = ((((s * 1103515245 + 12345) & 0x7fffffff) % 10000) + 1) / 1000000;
    }

    let fingerprints = '';
    let args = [
        '--disable-infobars',
        `--user-agent=${taskData.env.user_agent}`,
        `--lang=${taskData.env.language_js}`
    ];
    if (taskData.env.useProxy) {
        fingerprints = JSON.stringify({
            audio: audioNoise,
            clientRect: taskData.env.clientRect,
            webgl: taskData.env.webgl,
            canvas: taskData.env.canvas,
            hardware: taskData.env.hardware,
            screen: taskData.env.screen,
            clientHint: taskData.env.clientHint,
            languages_js: taskData.env.language_js,
            languages_http: taskData.env.language_http,

            position: taskData.env.position,
            timeZone: taskData.env.timeZone,
            webrtc_public: taskData.env.webrtc_public,
        });
        args.push(`--proxy-server=${taskData.env.proxyUrl}`);
        args.push('--disable-ipv6');



    } else {
        fingerprints = JSON.stringify({
            audio: audioNoise,
            clientRect: taskData.env.clientRect,
            webgl: taskData.env.webgl,
            canvas: taskData.env.canvas,
            hardware: taskData.env.hardware,
            screen: taskData.env.screen,
            clientHint: taskData.env.clientHint,
            languages_js: taskData.env.language_js,
            languages_http: taskData.env.language_http
        });
    }

    args.push(`--toolbox=${fingerprints}`);
    console.log('toolbox args:', `--toolbox=${fingerprints}`);




    console.log('Fingerprint payload:', fingerprints);
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: taskData.chromePath,
        ignoreDefaultArgs: ['--enable-automation'],
        userDataDir: userDataDir,
        args,
        defaultViewport: null,

    });



    browser.on('disconnected', () => {
        console.log('Browser disconnected.');
        // 在这里执行您希望在浏览器关闭时进行的操作
        closeSignal = true;

    });
    while (!closeSignal) {
        // 检测浏览器是否关闭
        await checkBrowserClosed(browser);
        // 这里可以添加其他任务逻辑
        await sleep(1000); // 每秒检查一次
    }


    // sendTaskCompleted('例子任务', true, '任务执行成功');
    exit();
}

(async () => {
    while (true) {
        if (webSocketReady) {
            // console.log('发送任务日志');
            sendRequestTaskData();

            if (taskData) {
                // sendTaskLog('任务日志内容:测试');
                // sendTaskLog(`收到任务数据:${taskData}`);
                await runTask();
            }
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 1000);
        });
    }
})();
