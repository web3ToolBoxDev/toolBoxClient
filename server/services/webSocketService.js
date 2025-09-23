class WebSocketService {
    static instance = null;

    constructor() {
        if (!WebSocketService.instance) {
            WebSocketService.instance = this;
            this.wsTaskServer = {};
            this.taskKey = {};
            this.wsFrontServer = null;
            this.frontReady = false;
        }
        return WebSocketService.instance;
    }

    static getInstance() {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService();
        }
        return WebSocketService.instance;
    }

    // Initialize websocket with frontend
    async initialize(expressApp) {
        this.app = expressApp;
        this.createFrontWebSocket();

        while (!this.wsFrontServer) {
            await new Promise((resolve) => {
                setTimeout(() => {
                    resolve();
                }, 1000);
            });
            console.log('Waiting for WebSocket initialization');
        }
    }
    // Create websocket for frontend communication
    createFrontWebSocket() {
        if (!this.app) {
            console.log('Express app not initialized');
            return false;
        }
        if (this.wsFrontServer) {
            this.wsFrontServer.close();
            this.wsFrontServer = null;
        }
        console.log('Creating frontend WebSocket');
        this.app.ws('/ws', (ws, req) => {
            ws.on('message', (msg) => {
                const message = JSON.parse(msg);
                console.log('Received message:', message);
                if (message.type === 'terminate_process') {
                    for (let key in this.wsTaskServer) {
                        console.log('Send to task:', key);
                        this.wsTaskServer[key].send(JSON.stringify({
                            type: 'terminate_process',
                            code: 0,
                            message: 'Terminate process command received from frontend'
                        }));
                    }
                }
            });
            ws.on('error', (error) => {
                console.error('WebSocket connection error:', error);
                ws.close();
            });
            this.wsFrontServer = ws;
        });
        // Dummy WebSocket client to establish connection
        const WebSocket = require('ws');
        const ws = new WebSocket('ws://localhost:30001/ws');
        ws.on('open', () => {
            this.frontReady = true;
            ws.close();
        })
        return 'ws://localhost:30001/ws'
    }

    // Send message to frontend
    async sendToFront(message, code = 0) {
        if (!this.wsFrontServer || !this.frontReady) {
            console.log('WebSocket not initialized');
            return;
        }
        // Wrap message with code if it's a string
        let msgObj;
        try {
            msgObj = typeof message === 'string' ? JSON.parse(message) : message;
        } catch {
            msgObj = { message };
        }
        if (msgObj.code === undefined) msgObj.code = code;
        this.wsFrontServer.send(JSON.stringify(msgObj));
    }
    // Create websocket for task process communication
    createTaskWebSocket(taskName, messageCallback) {
        // Prevent taskName error if contains non-ascii
        this.taskKey[taskName] = Date.now();
        if (!this.app) {
            console.log('WebSocket not initialized');
            return false;
        }
        if (this.wsTaskServer[this.taskKey[taskName]]) {
            this.wsTaskServer[this.taskKey[taskName]].close();
        }
        let taskUrl = `/ws/task/${this.taskKey[taskName]}`;
        console.log('Creating task WebSocket:', taskUrl);
        this.app.ws(taskUrl, (ws, req) => {
            ws.on('message', (msg) => {
                messageCallback(msg);
            });
            this.wsTaskServer[this.taskKey[taskName]] = ws;
        });
        return 'ws://localhost:30001' + taskUrl
    }
    closeTaskWebSocket(taskName) {
        if (this.wsTaskServer[taskName]) {
            this.wsTaskServer[taskName].close();
            delete this.wsTaskServer[taskName];
        }
    }
    // Send message to task process
    sendToTask(taskName, message, code = 0) {
        if (!this.taskKey[taskName]) {
            console.log('Task not initialized');
            return;
        }
        if (!this.wsTaskServer[this.taskKey[taskName]]) {
            console.log('WebSocket not initialized');
            return;
        }
        let msgObj;
        try {
            msgObj = typeof message === 'string' ? JSON.parse(message) : message;
        } catch {
            msgObj = { message };
        }
        if (msgObj.code === undefined) msgObj.code = code;
        this.wsTaskServer[this.taskKey[taskName]].send(JSON.stringify(msgObj));
    }
    checkWebSocket() {
        console.log('Checking WebSocket connection');
        if (!this.wsFrontServer) {
            this.createFrontWebSocket();
        }
        return true;
    }
}

module.exports = WebSocketService;
