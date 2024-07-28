const webSocket = require('ws');
const url = process.argv[2];
const puppeteer = require('puppeteer-extra');
const lanPlugin = require('puppeteer-extra-plugin-stealth/evasions/navigator.languages');
const userAgentPlugin = require('puppeteer-extra-plugin-stealth/evasions/user-agent-override');
const webglPlugin = require('puppeteer-extra-plugin-stealth/evasions/webgl.vendor');
const path = require('path');
const ChromeLauncher = require('chrome-launcher');

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
    const fs = require('fs');
    fs.writeFileSync(path.resolve(__dirname, './extensionInfo.json'), JSON.stringify({ extensionId }));
    return extensionId;
}
async function loadMetaMaskId(browser) {
    try{
        let extensionInfo = require(path.resolve(__dirname, './extensionInfo.json'));
        return extensionInfo.extensionId;
    }catch(e){
        getMetaMaskId(browser);
    }
}

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

function sendTaskCompleted(taskName,success,message) {
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
    let metamaskEx = path.resolve(__dirname, './metamask-chrome-11.16.2');
    let argArr = [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disabled-setupid-sandbox',
        '--disable-infobars',
        '--disable-extensions-except=' + metamaskEx
    ];
    if (wallet.ip)
        argArr.push('--proxy-server=' + wallet.ip);
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: chromePath[0],
        ignoreDefaultArgs: ['--enable-automation'],
        userDataDir: wallet.chromeUserDataPath,
        defaultViewport: null,
        args: argArr
    }); // Change headless to false for debugging
    const page = await browser.newPage();
    // await sleep(30000);
    extensionId = await loadMetaMaskId(browser);
    try{
        await page.goto(`chrome-extension://${extensionId}/home.html#onboarding/welcome`,{waitUntil:'networkidle2'});
    }catch(e){
        console.log('打开metamask失败');
        extensionId = await getMetaMaskId(browser);
        await page.goto(`chrome-extension://${extensionId}/home.html#onboarding/welcome`,{waitUntil:'networkidle2'});
    }

    await page.bringToFront();
    await sleep(2000);
    try{
        const checkbox = await page.waitForSelector('input.check-box',{timeout:100000});
        await checkbox.click();
    }catch(e){
        //有可能已经初始化，检查是否输入密码
        const passwordInput = await page.waitForSelector('#password',{timeout:100000});
        if(passwordInput){
            console.log('已经初始化');
            browser.close();
            sendTaskCompleted(taskData.taskName,true,{type:'success',message:'已经初始化'});
            exit();
        }else{
            sendTaskCompleted(taskData.taskName,false,{type:'error',message:'初始化失败'});
            throw e;
        }

        
    }
    
    const importButton = await page.waitForSelector('button.btn-secondary',{timeout:100000});
    await importButton.click();
    const agreeButton = await page.waitForSelector('[data-testid="metametrics-i-agree"]',{timeout:100000});
    await agreeButton.click();
    let mnemonic = wallet.mnemonic;
    let words = mnemonic.split(' ')
    for (let i = 0; i < words.length; i++) {
        await page.type('#import-srp__srp-word-' + i, words[i], { delay: 10 })
    }
    const confirmButton = await page.waitForSelector('[data-testid="import-srp-confirm"]',{timeout:100000});
    await confirmButton.click();

    const password = 'web3ToolBox'
    const passwordInput = await page.waitForSelector('[data-testid="create-password-new"]',{timeout:100000});
    await passwordInput.type(password, { delay: 10 });
    const confirmPasswordInput = await page.waitForSelector('[data-testid="create-password-confirm"]',{timeout:100000});
    await confirmPasswordInput.type(password, { delay: 10 });
    await sleep(2000);
    const checkBox = await page.waitForSelector('[data-testid="create-password-terms"]',{timeout:100000});
    await checkBox.click();
    await sleep(2000);
    const createButton = await page.waitForSelector('[data-testid="create-password-import"]',{timeout:100000});
    await createButton.click();
    await sleep(5000);
    const completeButton = await page.waitForSelector('[data-testid="onboarding-complete-done"]',{timeout:100000});
    await completeButton.click();
    await sleep(2000);
    const nextButton = await page.waitForSelector('[data-testid="pin-extension-next"]',{timeout:100000});
    await nextButton.click();
    await sleep(2000);
    const doneButton = await page.waitForSelector('[data-testid="pin-extension-done"]',{timeout:100000});
    await doneButton.click();
    await sleep(2000);
    const enableButton = await page.waitForSelector('button.mm-box--color-primary-inverse.mm-box--background-color-primary-default.mm-box--rounded-pill',{timeout:100000});
    await enableButton.click();
    await sleep(2000);

    sendTaskCompleted(taskData.taskName,true,{type:'success',message:'导入钱包成功'});
    browser.close()

    
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
