class WebSocketService {
    static instance = null;

    constructor() {
        if (!WebSocketService.instance) {
            WebSocketService.instance = this;
            this.wsTaskServer = {}
            this.taskKey = {}
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
    initialize(expressApp) {
        this.app = expressApp;
        expressApp.ws('/ws', (ws, req) => {
            ws.on('message', (msg) => {
                console.log('收到消息:', msg);
                for (let key in this.wsTaskServer) {
                    if (this.wsTaskServer[key]) {
                        this.wsTaskServer[key].send(msg);
                    }
                }
            });
            this.wsFrontServer = ws;
        });
    }

    // 发送消息
    sendToFront(message) {

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
            this.wsTaskServer[taskName]=null;
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


}

module.exports = WebSocketService;
