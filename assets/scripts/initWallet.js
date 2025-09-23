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
    try{
        let extensionInfo = require(path.resolve(__dirname, './extensionInfo.json'));
        return extensionInfo.extensionId;
    }catch(e){
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
async function getStartedPhase(page) {
    // page active
    await page.bringToFront();
    console.log('开始初始化设置');
    // 点击 "Get Started" 按钮,等待页面加载
    const startButton = await page.waitForSelector('[data-testid="onboarding-get-started-button"]', { visible: true });
    console.log('点击 "Get Started" 按钮');
    console.log('startButton', startButton);
    await startButton.click();


    const termCheckbox = await page.waitForSelector('.terms-of-use__checkbox', { visible: true });
    await termCheckbox.click();

    // scroll to bottom
    await page.evaluate(() => {
        const termsBox = document.querySelector('.terms-of-use-popup__body');
        termsBox.scrollTop = termsBox.scrollHeight;
    });

    const acceptButton = await page.waitForSelector('button[data-testid="terms-of-use-agree-button"]', { visible: true });
    // make accept button clickable
    await page.evaluate((button) => button.removeAttribute('disabled'), acceptButton);
    await acceptButton.click();
}

async function startInitialSetup(page) {
    try {
        await getStartedPhase(page);
    } catch (error) {
        console.error('Error during getStartedPhase,it seems the wallet is already passed this step:', error);
    }
    

    // click "Import wallet"
    const importWalletButton = await page.waitForSelector('[data-testid="onboarding-import-wallet"]', { visible: true });
    await importWalletButton.click();

    // click onboarding-import-with-srp-button
    const importWithSeedPhraseButton = await page.waitForSelector('[data-testid="onboarding-import-with-srp-button"]', { visible: true });
    await importWithSeedPhraseButton.click();

    // 输入助记词
    const seedPhraseInput = await page.waitForSelector('textarea[data-testid="srp-input-import__srp-note"]', { visible: true });
    console.log(typeof taskData);
    if (typeof taskData === 'string') {
        taskData = JSON.parse(taskData);
    }
    await seedPhraseInput.type(taskData.envData.mnemonic, { delay: 100 });

    // import-srp-confirm button
    const srpConfirmButton = await page.waitForSelector('button[data-testid="import-srp-confirm"]', { visible: true });
    await srpConfirmButton.click();

    //data-testid="create-password-new-input
    const passwordInput = await page.waitForSelector('input[data-testid="create-password-new-input"]', { visible: true });
    await passwordInput.type('web3toolbox', { delay: 100 });

    //data-testid="create-password-confirm-input
    const passwordConfirmInput = await page.waitForSelector('input[data-testid="create-password-confirm-input"]', { visible: true });
    await passwordConfirmInput.type('web3toolbox', { delay: 100 });

    // data-testid="create-password-terms
    const termsCheckbox = await page.waitForSelector('input[data-testid="create-password-terms"]', { visible: true });
    await termsCheckbox.click();

    // data-testid="create-password-submit
    const passwordSubmitButton = await page.waitForSelector('button[data-testid="create-password-submit"]', { visible: true });
    await passwordSubmitButton.click();
    // data-testid="metametrics-no-thanks
    const noThanksButton = await page.waitForSelector('button[data-testid="metametrics-no-thanks"]', { visible: true });
    await noThanksButton.click();

    // data-testid="onboarding-complete-done
    const allDoneButton = await page.waitForSelector('button[data-testid="onboarding-complete-done"]', { visible: true });
    await allDoneButton.click();

    // data-testid="download-app-continue
    const continueButton = await page.waitForSelector('button[data-testid="download-app-continue"]', { visible: true });
    await continueButton.click();

    // data-testid="pin-extension-done
    const pinDoneButton = await page.waitForSelector('button[data-testid="pin-extension-done"]', { visible: true });
    await pinDoneButton.click();
    await sleep(3000);
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
    let metamaskEx = path.resolve(__dirname, './metamask-chrome-13.2.0');
    let fingerprints = '';
    let args = ['--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disabled-setupid-sandbox',
        '--disable-infobars',
        `--user-agent=${taskData.env.user_agent}`,
        `--lang=${taskData.env.language_js}`,
        '--disable-extensions-except=' + metamaskEx
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

    const page = await browser.newPage();
    // await sleep(30000);
    extensionId = await loadMetaMaskId(browser);
    
    console.log('MetaMask Extension ID:', extensionId);
    await page.goto(`chrome-extension://${extensionId}/home.html#onboarding/welcome`);
    try {
        await startInitialSetup(page);
    } catch (error) {
        console.log('初始化设置失败:', error);
        sendTaskCompleted('initWallet', false, 'initial setup failed: ' + error.message);
    }
    sendTaskCompleted('initWallet', true, 'initial setup success');
    closeSignal = true;
    await checkBrowserClosed(browser);
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
