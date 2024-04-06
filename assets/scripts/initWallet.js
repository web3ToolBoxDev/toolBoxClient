const webSocket = require('ws');
const url = process.argv[2];
const puppeteer = require('puppeteer-extra');
const lanPlugin = require('puppeteer-extra-plugin-stealth/evasions/navigator.languages');
const userAgentPlugin = require('puppeteer-extra-plugin-stealth/evasions/user-agent-override');
const webglPlugin = require('puppeteer-extra-plugin-stealth/evasions/webgl.vendor');
const path = require('path');
let ChromeLauncher;
import('chrome-launcher').then((module) => {
    ChromeLauncher = module;
});

console.log('收到的URL参数:', url);

const ws = new webSocket(url);
let webSocketReady = false;
let taskData = null;

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
function sendTaskSuccess() {
    if (ws.readyState === webSocket.OPEN) {
        const taskSuccessMessage = JSON.stringify({
            type: 'task_success'
        });
        ws.send(taskSuccessMessage);
    }
}

function sendTaskCompleted() {
    if (ws.readyState === webSocket.OPEN) {
        const taskCompletedMessage = JSON.stringify({
            type: 'task_completed'
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
            console.log('收到服务端心跳包:');
            break;
        case 'request_task_data':
            console.log('收到任务数据:', data);
            taskData = JSON.parse(data.data);
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function initPhantomWallet(words){
    await sleep(5000)
    // 初始化phantom钱包
    const phantom_page = await browser.newPage();
    await phantom_page.goto('chrome-extension://bfnaelmomeimhlpmgjnjophhpkkoljpa/onboarding.html')
    // const element = await phantom_page.waitForSelector('[data-testid="import-recovery-phrase-button"]', { timeout: 3000 })
    await sleep(3000)
    const element = await phantom_page.$('button[data-testid="import-recovery-phrase-button"]')
    console.log(element)
    await element.click()
    await sleep(3000)
    for (let i = 0; i < words.length; i++) {
        await phantom_page.type(`input[data-testid="secret-recovery-phrase-word-input-${i}"]`, words[i], { delay: 50 })
    }
    
    await sleep(1000)
    const inport_element = await phantom_page.waitForSelector('[data-testid="onboarding-form-submit-button"]', { timeout: 3000 })
    await inport_element.click()
    
    await sleep(3000)
    const multichain_element = await phantom_page.waitForSelector('[data-testid="onboarding-form-submit-button"]', { timeout: 30000 })
    await multichain_element.click()
    
    await sleep(3000)
    await phantom_page.type('input[data-testid="onboarding-form-password-input"]', 'web3ToolBox', { delay: 50 })
    await sleep(100)
    await phantom_page.type('input[data-testid="onboarding-form-confirm-password-input"]', 'web3ToolBox', { delay: 50 })
    await sleep(100)
    await phantom_page.click('input[data-testid="onboarding-form-terms-of-service-checkbox"]');
    await sleep(1000)
    await phantom_page.click('button[data-testid="onboarding-form-submit-button"]');
    await sleep(1000)
    await phantom_page.click('button[data-testid="onboarding-form-submit-button"]');
    await sleep(1000)
}

async function initMetamaskWallet(words) {
    const page = await browser.newPage();
    await page.goto('chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/home.html#initialize/welcome')
    try {
        await page.bringToFront()
        const element = await page.waitForSelector('[data-testid="first-time-flow__button"]', { timeout: 3000 })
        await element.click()
    } catch (error) {
        try {
            let unLockBtn = await page.waitForSelector('[data-testid="unlock-submit"]', { timeout: 3000 })
            console.log('metamask already initialized')
        } catch (error) {
            browser.close()
        }
    }
    await sleep(3000);
    const element2 = await page.waitForSelector('[data-testid="page-container-footer-next"]')
    await element2.click()
    await sleep(3000)
    const element3 = await page.waitForSelector('[data-testid="import-wallet-button"]')
    await element3.click()
    await sleep(3000)
    for (let i = 0; i < words.length; i++) {
        await page.type('#import-srp__srp-word-' + i, words[i], { delay: 10 })
    }
    await page.type('#password', 'web3ToolBox', { delay: 50 })
    await page.type('#confirm-password', 'web3ToolBox', { delay: 50 })
    await page.click("#create-new-vault__terms-checkbox");
    await sleep(2000)
    const element4 = await page.waitForSelector('[type="submit"]')
    await element4.click()
    await sleep(2000)
    const element5 = await page.waitForSelector('[data-testid="EOF-complete-button"]')
    await element5.click()
    await sleep(2000)
}

// 进行任务逻辑
async function runTask() {
    console.log('任务开始执行');
    const chromePath = ChromeLauncher.Launcher.getInstallations();
    console.log('chromePath:', chromePath);

    let wallet = taskData;
    if (wallet.language)
        puppeteer.use(lanPlugin({ language: wallet.language.split(',') }));
    if (wallet.userAgent)
        puppeteer.use(userAgentPlugin({ userAgent: wallet.userAgent }));
    if (wallet.webglVendor && wallet.webglRenderer)
        puppeteer.use(webglPlugin({ vendor: wallet.webglVendor, renderer: wallet.webglRenderer }));
    let metamaskEx = path.resolve(__dirname, './extensions/nkbihfbeogaeaoehlefnkodbefgpgknn/10.22.2_0');
    let phantomEx = path.resolve(__dirname, './extensions/bfnaelmomeimhlpmgjnjophhpkkoljpa/24.5.0_0');
    let argArr = [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disabled-setupid-sandbox',
        '--disable-infobars',
        // 添加更多的扩展，使用','隔开，并填入路径
        `--disable-extensions-except=${metamaskEx},${phantomEx}`,
    ];
    if (wallet.ip)
        argArr.push('--proxy-server=' + wallet.ip);
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: chromePath.executablePath,
        ignoreDefaultArgs: ['--enable-automation'],
        userDataDir: wallet.chromeUserDataPath,
        defaultViewport: null,
        args: argArr
    }); // Change headless to false for debugging
    let words = wallet.mnemonic.split(' ')
    // 初始化metamask钱包
    initMetamaskWallet(words)
    // 初始化phantom钱包
    initPhantomWallet(words)

    sendTaskSuccess();
    browser.close()
    sendTaskCompleted();
    exit();
}

(async () => {
    while (true) {
        if (webSocketReady) {
            // console.log('发送任务日志');
            sendRequestTaskData();
            // sendTaskLog('任务日志内容:测试');
            if (taskData) {
                console.log('任务数据:', taskData);
                sendTaskLog('收到任务数据，完成初始化，开始执行任务');
                await runTask();
            }
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 2000);
        });
    }
})();
