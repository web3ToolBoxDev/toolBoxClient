const webSocket = require('ws');
const url = process.argv[2];
const puppeteer = require('puppeteer-extra');
const lanPlugin = require('puppeteer-extra-plugin-stealth/evasions/navigator.languages');
const userAgentPlugin = require('puppeteer-extra-plugin-stealth/evasions/user-agent-override');
const webglPlugin = require('puppeteer-extra-plugin-stealth/evasions/webgl.vendor');
const fs = require('fs');
const path = require('path');
const findChrome = require('carlo/lib/find_chrome');
const { send } = require('process');

console.log('收到的URL参数:', url);

let ws = new webSocket(url);
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
            log: log
        });
        ws.send(taskLogMessage);
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
// 检测浏览器是否关闭
async function checkBrowserClosed(browser) {
    const pages =await browser.pages();
    if (pages.length === 0) {
        console.log('浏览器已关闭');
        await browser.close();
        sendTerminateProcess();
        exit();
    }else{
        // console.log('浏览器未关闭');
        await sleep(5000);
        await checkBrowserClosed(browser);
    }
}

// 进行任务逻辑
async function runTask() {
    console.log('任务开始执行');
    const chromePath = await findChrome({});
    console.log('chromePath:', chromePath);

    let wallet = taskData;
    if (wallet.language)
        puppeteer.use(lanPlugin({ language: wallet.language.split(',') }));
    if (wallet.userAgent)
        puppeteer.use(userAgentPlugin({ userAgent: wallet.userAgent }));
    if (wallet.webglVendor && wallet.webglRenderer)
        puppeteer.use(webglPlugin({ vendor: wallet.webglVendor, renderer: wallet.webglRenderer }));
    let metamaskEx = path.resolve(__dirname, './nkbihfbeogaeaoehlefnkodbefgpgknn/10.22.2_0');
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
        executablePath: chromePath.executablePath,
        ignoreDefaultArgs: ['--enable-automation'],
        userDataDir: wallet.chromeUserDataPath,
        defaultViewport: null,
        args: argArr
    }); // Change headless to false for debugging
    await sleep(5000)
    const pages = await browser.pages();
    if(pages.length>1){
        for(let i=1;i<pages.length;i++){
            await pages[i].close();
        }
    }
    const page = pages[0];
    await page.goto('chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/home.html#initialize/unlock')
    await sleep(5000);
    try {
        await page.waitForSelector('#password');
        await page.type('#password', 'web3ToolBox',{delay:50});
        
        await sleep(2000);
        const element3 = await page.waitForSelector('[data-testid="unlock-submit"]');
        await element3.click();
    }catch(error){
        console.log('error:',error);
    }
    
    await checkBrowserClosed(browser);
}

(async () => {
    while (true) {
        if (webSocketReady) {
            // console.log('发送任务日志');
            sendRequestTaskData();
            sendTaskLog('任务日志内容:测试');
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
