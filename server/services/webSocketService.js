class WebSocketService {
    static instance = null;

    constructor() {
        if (!WebSocketService.instance) {
            WebSocketService.instance = this;
            this.wsTaskServer = {};
            this.taskKey = {};
            this.wsFrontServer = null;
        }
        return WebSocketService.instance;
    }

    static getInstance() {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    // 初始化与前端的websocket
    async initialize(expressApp) {
        this.app = expressApp;
        this.createFrontWebSocket();
    }
    // 创建前端通讯的websocket
    createFrontWebSocket() {
        if (!this.app) {
            console.log('app未初始化');
            return false;
        }
        if (this.wsFrontServer) {
            this.wsFrontServer.close();
            this.wsFrontServer = null;
        }
        console.log('创建前端WebSocket');
        this.app.ws('/ws', (ws, req) => {
            ws.on('message', (msg) => {
                const message = JSON.parse(msg);
                console.log('收到消息:', message);
                if(message.type === 'terminate_process'){
                    for (let key in this.wsTaskServer) {
                        console.log('send to task:',key);
                        this.wsTaskServer[key].send(msg);
                    }
                }
            });
            ws.on('error', (error) => {
                console.error('WebSocket连接发生错误:', error);
                // 关闭连接并退出
                ws.close();
            });
            this.wsFrontServer = ws;
        });
        return 'ws://localhost:30001/ws'
    }

    // 发送消息
    async sendToFront(message) {
        if (!this.wsFrontServer) {
            console.log('WebSocket未初始化');
            return;
        }
        this.wsFrontServer.send(message);
    }
    // 创建任务进程通讯的websocket
    createTaskWebSocket(taskName,messageCallback) {
        //防止taskName为中文出错
        this.taskKey[taskName] = Date.now();
        if (!this.app) {
            console.log('WebSocket未初始化');
            return false;
        }
        if (this.wsTaskServer[this.taskKey[taskName]]) {
            this.wsTaskServer[this.taskKey[taskName]].close();
        }
        let taskUrl = `/ws/task/${this.taskKey[taskName]}`;
        console.log('创建任务WebSocket:', taskUrl);
        this.app.ws(taskUrl, (ws, req) => {
            ws.on('message', (msg) => {
                messageCallback(msg);
            });
            this.wsTaskServer[this.taskKey[taskName]] = ws;
        });
        return 'ws://localhost:30001'+taskUrl
    }
    closeTaskWebSocket(taskName){
        if(this.wsTaskServer[taskName]){
            this.wsTaskServer[taskName].close();
            delete this.wsTaskServer[taskName];
        }
    }
    // 发送任务消息
    sendToTask(taskName,message) {
        if(!this.taskKey[taskName]){
            console.log('任务未初始化');
            return;
        }
        if (!this.wsTaskServer[this.taskKey[taskName]]) {
            console.log('WebSocket未初始化');
            return;
        }
        this.wsTaskServer[this.taskKey[taskName]].send(message);
    }
    checkWebSocket(){
        console.log('检查WebSocket连接');
        if(!this.wsFrontServer){
            this.createFrontWebSocket();
        }
        return true;
    }


}

module.exports = WebSocketService;
