const webSocket = require('ws');
const url = process.argv[2];
const ccxt = require('ccxt');
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
            taskData = data.data;
            break;
        case 'terminate_process':
            sendTerminateProcess();
            sendTaskCompleted(taskData.taskName,false,{type:'terminate_process'});
            exit();
            break;
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
    console.log('taskData:', taskData);
    let taskDataFromFront = taskData.taskDataFromFront;
    let binanceInfo = taskDataFromFront.binance;
    let okxInfo = taskDataFromFront.okx;
    let exchange = {
        binance: binanceInfo&&new ccxt.binance({
            apiKey: binanceInfo.apiKey,
            secret: binanceInfo.secret
        }),
        okx: okxInfo&&new ccxt.okx({
            apiKey: okxInfo.apiKey,
            secret: okxInfo.secret,
            password: okxInfo.password
        })
    };
    let wallets = taskDataFromFront.walletList;
    let successInfo = {
        success: [],
        fail: []
    }
    for (let wallet of wallets) {
        let address = wallet.address;
        let exchangeName = wallet.exchange;
        let exchangeInstance = exchange[exchangeName];
        if (!exchangeInstance) {
            sendTaskLog(`未找到${exchangeName}交易所`);
            continue;
        }
        let amount = wallet.amount;
        let currency = wallet.currency;
        let network = wallet.network;
        if(!address||!amount||!currency||!network){
            sendTaskLog(`${address}提币缺少参数`);
            continue;
        }
        try {
            let withdrawResult = await exchangeInstance.withdraw(currency, amount, address, {network});
            sendTaskLog(`${address}提币发起成功:${JSON.stringify(withdrawResult)}`);
            successInfo.success.push(address);
        } catch (error) {
            sendTaskLog(`${address}提币失败:${error.message}`);
            successInfo.fail.push(address);
        }
    }
    sendTaskCompleted(taskData.taskName,true,{type:'taskResult',message:successInfo});
    exit();

    
}

(async () => {
    while (true) {
        if (webSocketReady) {
            // console.log('发送任务日志');
            sendRequestTaskData();
            
            if (taskData) {
                taskData = JSON.parse(taskData);
                sendTaskLog(`开始查询${taskData.taskDataFromFront.exchange}余额`);
                await runTask();
            }
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 1000);
        });
    }
})();
