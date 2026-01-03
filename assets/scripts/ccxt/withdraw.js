const webSocket = require('ws');
const url = process.argv[2];
const ccxt = require('ccxt');
const { send } = require('process');


console.log('Received URL parameter:', url);

let ws = new webSocket(url);
let webSocketReady = false;
let taskData = null;

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
            console.log('Received server heartbeat');
            break;
        case 'request_task_data':
            console.log('Received task data:', data);
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
// 进行任务时，需要发送心跳包，接收任务数据，发送任务日志，完成任务

// Task logic
async function runTask() {
    console.log('Task execution started');
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
            sendTaskLog(`Exchange ${exchangeName} not configured`);
            continue;
        }
        let amount = wallet.amount;
        let currency = wallet.currency;
        let network = wallet.network;
        if(!address||!amount||!currency||!network){
            sendTaskLog(`${address} withdrawal missing parameters`);
            continue;
        }
        exchangeInstance.timeout = 60000;
        try {
            let withdrawResult = await exchangeInstance.withdraw(currency, amount, address, {network,timeout:60000});
            sendTaskLog(`${address} withdrawal initiated successfully: ${JSON.stringify(withdrawResult)}`);
            successInfo.success.push(address);
        } catch (error) {
            sendTaskLog(`${address} withdrawal failed: ${error.message}`);
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
                sendTaskLog(`Starting ${taskData.taskDataFromFront.exchange} withdrawal run`);
                await runTask();
            }
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 1000);
        });
    }
})();
