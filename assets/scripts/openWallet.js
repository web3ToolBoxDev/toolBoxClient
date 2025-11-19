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
    console.error(`Error checking whether directory ${dirPath} exists:`, error);
        return false;
    }
}

// Heartbeat scheduler
function sendHeartBeat() {
    setInterval(() => {
        if (ws.readyState === webSocket.OPEN) {
            const heartBeatMessage = JSON.stringify({
                type: 'heart_beat'
            });
            ws.send(heartBeatMessage);
        }
    }, 5000); // Send heartbeat every 5 seconds
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
            // console.log('Received server heartbeat');
            break;
        case 'request_task_data':
            // console.log('Received task data:', data);
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
    console.error('WebSocket connection error:', error);
    // Close connection and exit
    ws.close();
    process.exit(1);
});

// Reconnect if WebSocket closes
setInterval(() => {
    if (ws.readyState === webSocket.CLOSED) {
    console.log('WebSocket disconnected, attempting to reconnect...');
        ws = new webSocket(url);
    }
}, 5000); // Check connection state every 5 seconds

// During task execution we send heartbeats, request data, log updates, and finalize results
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let closeSignal = false;

// Detect browser closure
async function checkBrowserClosed(browser) {
    while (!closeSignal) {
        await sleep(5000);
    }
    await browser.close();
    exit();
}

// Ensure taskData is parsed as an object
function ensureTaskDataIsObject() {
    if (typeof taskData === 'string') {
        taskData = JSON.parse(taskData);
    }
    return taskData;
}

// Unlock the wallet
async function unlockWallet(page) {
    await page.bringToFront();
    try {
    console.log('Starting wallet unlock');

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
    console.error('Failed to unlock wallet:', error);
        throw error;
    }
}



// Task logic
async function runTask() {
    console.log('Task execution started');
    // console.log('Task data:', taskData);

    const currentTaskData = ensureTaskDataIsObject();

    // 检查是否有 Chrome 路径
    if (!currentTaskData || !currentTaskData.chromePath) {
        console.log(Object.keys(currentTaskData));
        console.error('Chrome path missing in task data');
        sendTaskCompleted('openWallet', false, 'Task failed: Chrome path is missing');
        exit();
    }

    // 检查是否有 userDataDir目录
    const userDataDir = path.join(currentTaskData.savePath, currentTaskData.env.id);
    if (!checkIfDirectoryExists(userDataDir)) {
        console.error(`User data directory does not exist: ${userDataDir}`);
        sendTaskCompleted('openWallet', false, 'Task failed: User data directory is missing');
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

    // console.log('Fingerprint payload:', fingerprints);

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
                        sendTaskCompleted('openWallet', true, 'Wallet opened successfully');
                        sendTaskLog('Wallet opened and unlocked successfully');
                        breaked = true;
                        break;
                    } else {
                        sendTaskCompleted('openWallet', false, 'Wallet failed to open');
                        exit();
                    }
                } catch (error) {
                    console.log('Failed to open wallet:', error);
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
    //         sendTaskCompleted('openWallet', true, 'Wallet opened successfully');
    //         sendTaskLog('Wallet opened and unlocked successfully');
    //     } else {
    //         sendTaskCompleted('openWallet', false, 'Wallet failed to open');
        //     }
        // } catch (error) {
    //     console.log('Failed to open wallet:', error);
    //     sendTaskCompleted('openWallet', false, 'Wallet failed to open: ' + error.message);
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