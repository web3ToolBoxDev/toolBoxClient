const webSocket = require('ws');
const url = process.argv[2];
const ccxt = require('ccxt');


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

function binanceProcessBalance(balance){
    let result = Object.keys(balance).filter((key) => {
        if(!key.startsWith('LD')){
            return balance[key] > 0;
        }else if(key === 'LDO'){
            return balance[key] > 0;
        }else{
            return false;
        }
    }).map((key) => {                
        return {
            currency: key,
            balance: balance[key]
        };
    });
    return result;
}
function okxProcessBalance(balance){
    let result = [];
    for(let key in balance){
        result.push({
            currency: key,
            balance: balance[key]
        });
    }
    return result;
}   

// 进行任务逻辑
async function runTask() {
    console.log('任务开始执行');
    
    let taskDataFromFront = taskData.taskDataFromFront;
    let exchangeKey = taskDataFromFront.exchange;
    let exchange;
    if (exchangeKey === 'binance') {
        let apiKey = taskDataFromFront.apiKey;
        let secret = taskDataFromFront.secret;
        exchange = new ccxt[exchangeKey]({
            apiKey,
            secret
        });
        try{
            let balance = await exchange.fetchBalance();
            let free = balance.free;
            // 导出所有余额大于0的币种
            let result = binanceProcessBalance(free);
            let networks = await exchange.fetchCurrencies();
            // 获取余额大于0币种的提币网络
            for(let i = 0;i < result.length;i++){
                let currency = result[i].currency;
                console.log('currency:',networks[currency]);
                result[i].networks = networks[currency]['fees']
            }
            console.log('result:',result);
            sendTaskCompleted(taskData.taskName,true,{type:'result',message:result});
            exit();
        }catch(error){
            console.error('查询余额失败:',error);
            sendTaskCompleted(taskData.taskName,false,{type:'error',message:error.message});
            exit();
        }
    } else if(exchangeKey === 'okx'){
        let apiKey = taskDataFromFront.apiKey;
        let secret = taskDataFromFront.secret;
        let password = taskDataFromFront.password;
        exchange = new ccxt[exchangeKey]({
            apiKey,
            secret,
            password
        });
        try{
            let balance = await exchange.fetchBalance({type:'funding'});
            let networks = await exchange.fetchCurrencies();
            let result = okxProcessBalance(balance.free);
            for(let i = 0;i < result.length;i++){
                let currency = result[i].currency;
                let networksList = {};
                let networksObj = networks[currency]['networks'];
                for(let key in networksObj){
                    if(networksObj[key]['withdraw']){
                        console.log('networksObj[key]:',key,networksObj[key]);
                        networksList[key]= networksObj[key]['fee'];
                    }
                    result[i].networks = networksList;
                }
            }
            // result = [...result,{currency:'test',balance:1.1},
            //     {currency:'test1',balance:0.1},
            //     {currency:'test2',balance:0.2},
            //     {currency:'test3',balance:0.3},
            //     {currency:'test4',balance:0.4},
            //     ];
            
            sendTaskCompleted(taskData.taskName,true,{type:'result',message:result});
            exit();
        }catch(error){
            console.error('查询余额失败:',error);
            sendTaskCompleted(taskData.taskName,false,{type:'error',message:error.message});
            exit();
        }
    }
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
