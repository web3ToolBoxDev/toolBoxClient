const webSocket = require('ws');
const url = process.argv[2];
const puppeteer = require('puppeteer-extra');
const path = require('path');
const fs = require('fs');

let ws = new webSocket(url);
let webSocketReady = false;
let taskData = null;

let extensionId = '';

async function getMetaMaskId(browser) {
    const page = await browser.newPage();
    await page.goto('chrome://extensions/');
    await sleep(5000);
    const extensionId = await page.evaluate(() => {
        const extensions = document.querySelectorAll('extensions-manager');
        const extension = extensions[0].shadowRoot.querySelector('extensions-item-list').shadowRoot.querySelector('extensions-item').getAttribute('id');
        return extension;
    });
    await page.close();
    fs.writeFileSync(path.resolve(__dirname, './extensionInfo.json'), JSON.stringify({ extensionId }));
    return extensionId;
}

async function loadMetaMaskId(browser) {
    try {
        let extensionInfo = require(path.resolve(__dirname, './extensionInfo.json'));
        return extensionInfo.extensionId;
    } catch (e) {
        return getMetaMaskId(browser);
    }
}

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

// 确保taskData是对象类型
function ensureTaskDataIsObject() {
    if (typeof taskData === 'string') {
        taskData = JSON.parse(taskData);
    }
    return taskData;
}

// 解锁钱包
async function unlockWallet(page) {
    await page.bringToFront();
    try {
        console.log('开始解锁钱包');

        // 等待密码输入框出现
        const passwordInput = await page.waitForSelector('input[data-testid="unlock-password"]', {
            visible: true,
            timeout: 30000
        });

        // 输入密码
        await passwordInput.type('web3toolbox', { delay: 100 });

        // 点击解锁按钮
        const unlockButton = await page.waitForSelector('button[data-testid="unlock-submit"]', { visible: true });
        await unlockButton.click();

        return true;
    } catch (error) {
        console.error('解锁钱包失败:', error);
        throw error;
    }
}



// 进行任务逻辑
async function runTask() {
    console.log('任务开始执行');
    // console.log('任务数据:', taskData);

    const currentTaskData = ensureTaskDataIsObject();

    // 检查是否有 Chrome 路径
    if (!currentTaskData || !currentTaskData.chromePath) {
        console.log(Object.keys(currentTaskData));
        console.error('任务数据中缺少 Chrome 路径');
        sendTaskCompleted('openWallet', false, '任务执行失败: 缺少 Chrome 路径');
        exit();
    }

    // 检查是否有 userDataDir目录
    const userDataDir = path.join(currentTaskData.savePath, currentTaskData.env.id);
    if (!checkIfDirectoryExists(userDataDir)) {
        console.error(`用户数据目录不存在: ${userDataDir}`);
        sendTaskCompleted('openWallet', false, `任务执行失败: 用户数据目录不存在`);
        exit();
    }

    console.log('useProxy', currentTaskData.env.useProxy);
    let metamaskEx = path.resolve(__dirname, './metamask-chrome-13.2.0');
    let fingerprints = '';
    let args = [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disabled-setupid-sandbox',
        '--disable-infobars',
        `--user-agent=${currentTaskData.env.user_agent}`,
        `--lang=${currentTaskData.env.language_js}`,
        '--disable-extensions-except=' + metamaskEx
    ];

    if (currentTaskData.env.useProxy) {
        fingerprints = JSON.stringify({
            canvas: currentTaskData.env.canvas,
            hardware: currentTaskData.env.hardware,
            screen: currentTaskData.env.screen,
            clientHint: currentTaskData.env.clientHint,
            languages_js: currentTaskData.env.language_js,
            languages_http: currentTaskData.env.language_http,
            fonts_remove: currentTaskData.env.fonts_remove + ',Tahoma',
            position: currentTaskData.env.position,
            timeZone: currentTaskData.env.timeZone,
            webrtc_public: currentTaskData.env.webrtc_public,
        });
        args.push(`--proxy-server=${currentTaskData.env.proxyUrl}`);
    } else {
        fingerprints = JSON.stringify({
            canvas: currentTaskData.env.canvas,
            hardware: currentTaskData.env.hardware,
            screen: currentTaskData.env.screen,
            clientHint: currentTaskData.env.clientHint,
            languages_js: currentTaskData.env.language_js,
            languages_http: currentTaskData.env.language_http,
            fonts_remove: currentTaskData.env.fonts_remove + ',Tahoma'
        });
    }

    args.push(`--toolbox=${fingerprints}`);

    // console.log('指纹数据:', fingerprints);

    const browser = await puppeteer.launch({
        headless: false,
        executablePath: currentTaskData.chromePath,
        ignoreDefaultArgs: ['--enable-automation'],
        userDataDir: userDataDir,
        args,
        defaultViewport: null,
    });

    browser.on('disconnected', () => {
        console.log('Browser disconnected.');
        closeSignal = true;
    });
    let breaked = false;
    while (!breaked) {
        await sleep(1000);
        const pages = await browser.pages();

        if (pages.length === 2) {
            const page = pages[pages.length - 1];
            extensionId = await loadMetaMaskId(browser);

            console.log('MetaMask Extension ID:', extensionId);
            let cnt = 0;
            
            while (cnt < 3) {
                try {
                    await page.goto(`chrome-extension://${extensionId}/home.html#unlock`);
                    const success = await unlockWallet(page);
                    if (success) {
                        sendTaskCompleted('openWallet', true, '钱包打开成功');
                        sendTaskLog('钱包已成功打开并解锁');
                        breaked = true;
                        break;
                    } else {
                        sendTaskCompleted('openWallet', false, '钱包打开失败');
                        exit();
                    }
                } catch (error) {
                    console.log('打开钱包失败:', error);
                    cnt++;
                }
            }   
        }
    }

        // const page = await browser.newPage();
        // extensionId = await loadMetaMaskId(browser);

        // // console.log('MetaMask Extension ID:', extensionId);
        // await page.goto(`chrome-extension://${extensionId}/home.html#unlock`);

        // try {
        //     const success = await openWallet(page);
        //     if (success) {
        //         sendTaskCompleted('openWallet', true, '钱包打开成功');
        //         sendTaskLog('钱包已成功打开并解锁');
        //     } else {
        //         sendTaskCompleted('openWallet', false, '钱包打开失败');
        //     }
        // } catch (error) {
        //     console.log('打开钱包失败:', error);
        //     sendTaskCompleted('openWallet', false, '钱包打开失败: ' + error.message);
        // }

        // 保持浏览器打开，等待用户操作或外部信号关闭
        await checkBrowserClosed(browser);
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
            await new Promise((resolve) => {
                setTimeout(resolve, 1000);
            });
        }
    })();