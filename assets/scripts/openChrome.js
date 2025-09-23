const webSocket = require('ws');
const url = process.argv[2];
const puppeteer = require('puppeteer-extra');
const path = require('path');
const fs = require('fs');



let ws = new webSocket(url);
let webSocketReady = false;
let taskData = null;

const checkIfDirectoryExists = (dirPath) => {
    try {
        return fs.existsSync(dirPath) && fs.lstatSync(dirPath).isDirectory();
    } catch (error) {
        console.error(`检查目录 ${dirPath} 是否存在时出错:`, error);
        return false;
    }
}

// 心跳包定时发送
function sendHeartBeat() {
    setInterval(() => {
        if (ws.readyState === webSocket.OPEN) {
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
    if (ws.readyState === webSocket.OPEN) {
        const taskLogMessage = JSON.stringify({
            type: 'task_log',
            message: log
        });
        ws.send(taskLogMessage);
    }
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

ws.on('open', () => {
    webSocketReady = true;
    sendHeartBeat();
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

ws.on('error', (error) => {
    console.error('WebSocket连接发生错误:', error);
    // 关闭连接并退出
    ws.close();
    process.exit(1);
});

// 定时检查连接状态，如果连接断开则重连
setInterval(() => {
    if (ws.readyState === webSocket.CLOSED) {
        console.log('WebSocket连接断开，尝试重新连接...');
        ws = new webSocket(url);
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
    console.log('任务开始执行');
    console.log('任务数据:', taskData);
    if (typeof taskData === 'string') {
        taskData = JSON.parse(taskData);
    }
    // 检查是否有 Chrome 路径
    if (!taskData || !taskData.chromePath) {
        console.log(Object.keys(taskData));
        console.error('任务数据中缺少 Chrome 路径');
        sendTaskCompleted('例子任务', false, '任务执行失败: 缺少 Chrome 路径');
        exit();
    }
    // 检查是否有 userDataDir目录
    const userDataDir = path.join(taskData.savePath, taskData.env.id);
    if (!checkIfDirectoryExists(userDataDir)) {
        // 如果目录不存在，尝试创建
        try {
            fs.mkdirSync(userDataDir, { recursive: true });
            console.log(`创建目录成功: ${userDataDir}`);
        } catch (error) {
            console.error(`创建目录失败: ${userDataDir}`, error);
            sendTaskCompleted('例子任务', false, `任务执行失败: 创建目录失败 - ${error.message}`);
            exit();
        }
    }
    console.log('useProxy', taskData.env.useProxy);
    let fingerprints = '';
    let args = ['--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disabled-setupid-sandbox',
        '--disable-infobars',
        `--user-agent=${taskData.env.user_agent}`,
        `--lang=${taskData.env.language_js}`
    ];
    if (taskData.env.useProxy) {
        fingerprints = JSON.stringify({
            canvas: taskData.env.canvas,
            hardware: taskData.env.hardware,
            screen: taskData.env.screen,
            clientHint: taskData.env.clientHint,
            languages_js: taskData.env.language_js,
            languages_http: taskData.env.language_http,
            fonts_remove: taskData.env.fonts_remove + ',Tahoma',
            position: taskData.env.position,
            timeZone: taskData.env.timeZone,
            webrtc_public: taskData.env.webrtc_public,
        });
        args.push(`--proxy-server=${taskData.env.proxyUrl}`);



    } else {
        fingerprints = JSON.stringify({
            canvas: taskData.env.canvas,
            hardware: taskData.env.hardware,
            screen: taskData.env.screen,
            clientHint: taskData.env.clientHint,
            languages_js: taskData.env.language_js,
            languages_http: taskData.env.language_http,
            fonts_remove: taskData.env.fonts_remove + ',Tahoma'
        });
    }

    args.push(`--toolbox=${fingerprints}`);




    console.log('指纹数据:', fingerprints);
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


    sendTaskCompleted('例子任务', true, '任务执行成功');
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
