const webSocket = require('ws');
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
    const startTime = Date.now();
    // 模拟任务执行
    while (true) {
        await new Promise((resolve) => {
            setTimeout(resolve, 5000);
        });
        sendTaskLog('任务执行中...');
        if(Date.now()-startTime>10000){
            break;
        }
    }
    console.log('任务执行完成');
    sendTaskCompleted('例子任务',true,'任务执行成功');
    exit();
}

(async () => {
    while (true) {
        if (webSocketReady) {
            // console.log('发送任务日志');
            sendRequestTaskData();
            
            if (taskData) {
                sendTaskLog('任务日志内容:测试');
                sendTaskLog(`收到任务数据:${taskData}`);
                await runTask();
            }
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 1000);
        });
    }
})();
