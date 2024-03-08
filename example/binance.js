const webSocket = require('ws');
const fs = require('fs');
const url = process.argv[2];

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
            console.log('收到服务端心跳包:');
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

// 进行任务逻辑
async function runTask() {
    console.log('任务开始执行');
    startTime = Date.now();
    const runData = JSON.parse(taskData);
    const configPath = runData.configPath;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    sendTaskLog(`任务配置:${JSON.stringify(config)}`);
    const { Spot } = require('@binance/connector')
    const tunnel = require('tunnel')
    //检测需要提币的余额
    const symbol = config.symbol;
    const amount = Number(config.amount);
    const network = config.network;
    const address = runData.address;
    if (!symbol) {
        sendTaskLog('未配置symbol,请检查配置文件');
        sendTaskCompleted();
        exit();
    }
    if (!amount) {
        sendTaskLog('未配置提取金额,请检查配置文件');
        sendTaskCompleted();
        exit();
    }
    if (!network) {
        sendTaskLog('未配置提币网络,请检查配置文件');
        sendTaskCompleted();
        exit();
    }



    let agent = null;
    if (config.proxy_host && config.proxy_port) {
        agent = tunnel.httpsOverHttp({
            proxy: {
                host: config.proxy_host,
                port: config.proxy_port
            }
        })
    }

    const apiKey = config.apiKey
    const apiSecret = config.apiSecret
    const client = new Spot(apiKey, apiSecret,
        {
            httpsAgent: agent,
            timeout: 50000
        }
    )
    //检测是否连接成功
    try {
        await client.ping()
    } catch (e) {
        console.log(e);
        sendTaskLog(`连接失败:${e.message},检查是否需要配置代理`);
        sendTaskCompleted();
        exit();
    }

    [{ "asset": "BNB", "free": "0.80294293", "locked": "0", "freeze": "0", "withdrawing": "0", "ipoable": "0", "btcValuation": "0" }]

    //检测余额
    const res = await client.userAsset({ asset: symbol })
    const reserveAmount = Number(res.data[0].free);
    // console.log(res)    
    sendTaskLog(`检测余额:${reserveAmount} ${symbol}`);
    if (reserveAmount < amount) {
        sendTaskLog(`余额不足,当前余额:${reserveAmount} ${symbol}`);
        sendTaskCompleted();
        exit();
    }
    try {
        console.log(symbol, address, amount);
        //提币
        const withdrawRes = await client.withdraw(
            symbol,
            address,
            amount,
            {
                network: network
            }
        )
        sendTaskLog(`提币结果:${JSON.stringify(withdrawRes.data)}`);
    } catch (e) {
        console.log(e);
        sendTaskLog(`提币失败:${e.message}`);
        sendTaskCompleted();
        exit();
    }

    console.log('任务执行完成');
    sendTaskCompleted();
    exit();
}

(async () => {
    while (true) {
        if (webSocketReady) {
            // console.log('发送任务日志');
            sendRequestTaskData();

            if (taskData) {
                sendTaskLog('收到任务数据，完成初始化，开始执行任务');
                await runTask();
            }
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 1000);
        });
    }
})();
