const webSocket = require('ws');
const url = process.argv[2];
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const ChromeLauncher = require('chrome-launcher');
const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');



console.log('收到的URL参数:', url);

let ws = new webSocket(url);
let webSocketReady = false;
let taskData = null;
let browser = null;
let emailClient = null;
let recordMessage = JSON.parse(fs.readFileSync(path.join(__dirname, 'recordMessage.json')));
let sendEmailAddress = '';
let receiveEmailAddress = '';
let config = null;
let pageInit = false;
let rateLimit = false;  //是否达到请求次数限制

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
            console.log('收到任务数据:', data);
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

async function openBrowser(config) {
    let chromePath = ChromeLauncher.Launcher.getInstallations()[0];

    //检查路径是否存在taskData.config.chromeUserDataDir，如果不存在则创建
    if (!fs.existsSync(config.chromeUserDataPath)) {
        fs.mkdirSync(config.chromeUserDataPath);
    }


    let argArr = [
        `--user-data-dir=${config.chromeUserDataPath}`,
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disabled-setupid-sandbox',
        '--disable-infobars',
        '--webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--force-webrtc-ip-handling-policy',
    ];
    if (taskData.ipInfo && taskData.ipInfo.proxyUrl) {
        argArr.push('--proxy-server=' + taskData.ipInfo.proxyUrl);
        argArr.push('--timezone=' + taskData.ipInfo.timeZone);
        argArr.push('--tz=' + taskData.ipInfo.timeZone);
        argArr.push('--geolocation=' + taskData.ipInfo.ll.join(','));
    }
    puppeteer.use(StealthPlugin());
    browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false,
        ignoreDefaultArgs: ['--enable-automation'],
        defaultViewport: null,
        args: argArr
    });

}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function openTwitter(config) {
    const token = config.twitterToken
    const twitterPage = await browser.newPage();
    await twitterPage.goto('https://x.com');
    await sleep(5000);
    const cookies = await twitterPage.cookies();
    let update = true;
    // 打印每个 cookie 的信息
    cookies.forEach(cookie => {

        if (cookie.name === 'auth_token') {
            console.log('cookie:', cookie.value);
            console.log('token:', `${token.replace('"', '')}`);
            console.log('auth_token or not:', cookie.value === `${token.replace('"', '')}`);
            if (cookie.value === `${token.replace('"', '')}`) {

                update = false;
            }
        }
    });
    if (update) {
        console.log('更新cookie');
        try {
            await twitterPage.evaluate((token) => {

                function Login(token) {
                    var expirationTime = new Date();
                    expirationTime.setFullYear(expirationTime.getFullYear() + 1); // expires in 1 year
                    document.cookie = `auth_token=${token.replace('"', '')};domain=x.com;path=/;expires=${expirationTime.toUTCString()};Secure`;
                    window.location.replace('https://x.com');
                }
                Login(token);

            }, token);
        } catch (e) {
            console.log('登录失败:', e);
        }
    }
}

async function startMonitor(page,url) {

    setInterval(async () => {
        if (rateLimit) {
            return;
        }
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        
    }, 60000 * config.refreshInterval);
}

async function processMonitor(processList) {
    let waitInterval = Math.floor(config.refreshInterval * 60000 / processList.length);
    for (let i = 0; i < processList.length; i++) {
        const url = processList[i];
        const pages = await browser.pages();
        const page = pages[i];
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        startMonitor(page,url);
        await sleep(waitInterval);
    }
    pageInit = true;
}
const messageList = [];
async function processSendEmail() {
    setInterval(async () => {
        if (messageList.length > 0) {
            const message = messageList.shift();

            emailClient.sendMail({
                from: sendEmailAddress,
                to: receiveEmailAddress,
                subject: message.subject,
                text: message.text
            }, async (error, info) => {
                if (error) {
                    console.error('发送邮件失败:', error);
                    setTimeout(() => {
                        emailClient = nodemailer.createTransport({
                            host: config.smtpServer,
                            port: config.smtpPort,
                            auth: {
                                user: config.sendMailAccount,
                                pass: config.sendMailPassword
                            }
                        });

                        messageList.push(message);
                    }, 2000);

                } else {
                    console.log('发送邮件成功:', info.response);
                }
            }
            );
        }
    }, 2000);
}
function sendEmail(subject, text) {
    messageList.push({
        subject,
        text
    });
}

function processJson(json) {
    const info = json.data.user.result.timeline_v2.timeline
    let length = info.instructions.length;
    let entries = [];
    if (length === 3) {
        const pinnedTweet = info.instructions[1]
        const entry = pinnedTweet.entry;
        const pinnedFullText = entry.content.itemContent.tweet_results.result.legacy.full_text;
        const pinnedTweetId = entry.content.itemContent.tweet_results.result.legacy.id_str;
        const pinnedUserId = entry.content.itemContent.tweet_results.result.legacy.user_id_str;
        const pinnedUserName = entry.content.itemContent.tweet_results.result.core.user_results.result.legacy.name;
        // Initialize recordMessage['pinned'] if it is not already
        if (recordMessage['pinned'] === undefined) {
            recordMessage['pinned'] = {};
        }

        if (recordMessage['pinned'][pinnedUserId] === undefined) {
            recordMessage['pinned'][pinnedUserId] = {
                pinnedFullText,
                pinnedTweetId,
                pinnedUserId,
                pinnedUserName
            };
            pageInit && sendEmail(`${pinnedUserName}置顶推文`, `${pinnedFullText}`);
        } else {
            if (recordMessage['pinned'][pinnedUserId].pinnedFullText !== pinnedFullText) {
                recordMessage['pinned'][pinnedUserId] = {
                    pinnedFullText,
                    pinnedTweetId,
                    pinnedUserId,
                    pinnedUserName
                };
                pageInit && sendEmail(`${pinnedUserName}置顶推文变化`, `新的置顶推文为:${pinnedFullText}`);
            }
        }
        entries = info.instructions[2].entries;
    }else if(length === 2){
        entries = info.instructions[1].entries;
    }
    for (let entry of entries) {
        if (!entry.content.itemContent) {
            if (!entry.content.items) {
                continue
            }
            for (let subentry of entry.content.items) {

                if (!subentry.item.itemContent.tweet_results) {
                    continue
                }
                const tweetFullText = subentry.item.itemContent.tweet_results.result.legacy.full_text;
                const tweetId = subentry.item.itemContent.tweet_results.result.legacy.id_str;
                const userId = subentry.item.itemContent.tweet_results.result.legacy.user_id_str;
                const userName = subentry.item.itemContent.tweet_results.result.core.user_results.result.legacy.name;
                if (recordMessage[tweetId] === undefined) {

                    pageInit && sendEmail(`${userName}发推`, `${tweetFullText}`);
                    recordMessage[tweetId] = {
                        tweetFullText,
                        tweetId,
                        userId,
                        userName,
                    };
                } else {
                    if (recordMessage[tweetId].tweetFullText !== tweetFullText) {
                        pageInit && sendEmail(`${userName}更新推文`, `新的推文为:${tweetFullText}`);
                        recordMessage[tweetId] = {
                            tweetFullText,
                            tweetId,
                            userId,
                            userName
                        };
                    }
                }

            }
        } else {
            const tweetFullText = entry.content.itemContent.tweet_results.result.legacy.full_text;
            const tweetId = entry.content.itemContent.tweet_results.result.legacy.id_str;
            const userId = entry.content.itemContent.tweet_results.result.legacy.user_id_str;
            const userName = entry.content.itemContent.tweet_results.result.core.user_results.result.legacy.name;
            if (recordMessage[tweetId] === undefined) {
                pageInit && sendEmail(`${userName}发推`, `${tweetFullText}`);
                recordMessage[tweetId] = {
                    tweetFullText,
                    tweetId,
                    userId,
                    userName
                };
            } else {
                if (recordMessage[tweetId].tweetFullText !== tweetFullText) {
                    pageInit && sendEmail(`${userName}更新推文`, `新的推文为:${tweetFullText}`);
                    recordMessage[tweetId] = {
                        tweetFullText,
                        tweetId,
                        userId,
                        userName
                    };
                }
            }
        }
        // let userInfo = entry.content.itemContent.tweet_results.result.core.user_results.result.legacy
        // let tweet = entry.content.itemContent.tweet_results.result.legacy
        // console.log(userInfo.name)
        // console.log(tweet.full_text)
    }
}
function startListening(page) {
    // 监听响应事件
    page.on('response', async response => {
        const url = response.url();
        const request = response.request();
        const method = request.method();


        if (url.includes('x.com') && method === 'GET' && url.includes('UserTweets')) {
             //如果返回报错码

            if (response.status() === 429) {
                console.log('请求次数过多:', response.status());
                sendTaskLog('请求次数过多，等待中...');
                rateLimit = true;
                return;
            }

            
            const contentType = response.headers()['content-type'];
            if (contentType && contentType.includes('application/json')) {
                try {
                    const json = await response.json();
                    processJson(json);

                    //写入文件
                    fs.writeFileSync(path.join(__dirname, 'recordMessage.json'), JSON.stringify(recordMessage));
                } catch (e) {
                    console.log('Failed to parse response JSON:', e);
                }
            }
        }
    });
}
// 进行任务逻辑
async function runTask() {
    console.log('任务开始执行');

    taskData = JSON.parse(taskData);
    config = taskData.taskDataFromFront.config;
    const monitorList = taskData.taskDataFromFront.monitorList;

    await openBrowser(config);
    await openTwitter(config);
    const pages = await browser.pages();


    while (pages.length < monitorList.length) {
        pages.push(await browser.newPage());
    }
    for (let i = 0; i < pages.length; i++) {
        startListening(pages[i]);
    }

    // const refreshInterval = config.refreshInterval;
    emailClient = nodemailer.createTransport({
        host: config.smtpServer,
        port: config.smtpPort,
        auth: {
            user: config.sendMailAccount,
            pass: config.sendMailPassword
        }
    });
    console.log('emailClient:', config.sendMailPassword);

    sendEmailAddress = config.sendMailAccount;
    receiveEmailAddress = config.receiveMailAccount;
    processSendEmail();
    await sleep(5000);
    console.log('monitorList:', monitorList);
    //任务执行
    processMonitor(monitorList);
    while (true) {
        if (rateLimit) {
            await sleep(60000);
            rateLimit = false;
            console.log('请求次数过多，等待结束');
        }
        await sleep(1000);
    }

}

(async () => {
    while (true) {
        if (webSocketReady) {
            // console.log('发送任务日志');
            sendRequestTaskData();

            if (taskData) {
                sendTaskLog(`收到任务数据:${taskData}`);
                await runTask();
            }
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 1000);
        });
    }
})();
