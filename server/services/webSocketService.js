class WebSocketService {
    static instance = null;

    constructor() {
        if (!WebSocketService.instance) {
            WebSocketService.instance = this;
            this.wsTaskServer = {};
            this.taskKey = {};
            this.wsFrontServers = [];
            this.frontReady = false;
            this.frontMessageBuffer = [];
            this.frontMessageBufferLimit = 200;
            this.frontRouteRegistered = false;
            this.pendingTaskMessages = {};
            this.pendingTaskMessageLimit = 100;
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
        this._wireStateService();
        if ((!this.wsFrontServers || this.wsFrontServers.length === 0) && process.env.NODE_ENV !== 'production') {
            console.log('Frontend WebSocket will be ready after the client connects.');
        }
    }

    /**
     * Listen to StateService state.changed events and broadcast to frontend.
     * Called once during initialize. Safe to call multiple times (idempotent).
     */
    _wireStateService() {
        if (this._stateServiceWired) return;
        this._stateServiceWired = true;
        try {
            const { StateService } = require('./stateService');
            const stateService = StateService.getInstance();
            stateService.eventBus.on('state.changed', (changeEvent) => {
                const agentId = changeEvent.path ? changeEvent.path.split('.')[0] : '';
                stateService.broadcastToFrontend(agentId, changeEvent);
            });
            console.log('[WebSocketService] StateService state.changed wired to frontend broadcast');
        } catch (err) {
            console.warn('[WebSocketService] StateService not available, skipping wire:', err.message);
        }
    }
    // Create websocket for frontend communication
    createFrontWebSocket() {
        if (!this.app) {
            console.log('Express app not initialized');
            return false;
        }
        if (this.frontRouteRegistered) {
            return 'ws://localhost:30001/ws';
        }
        console.log('Creating frontend WebSocket');
        this.app.ws('/ws', (ws, req) => {
            const connId = crypto.randomUUID?.() || crypto.randomBytes(8).toString('hex');

            const origin = req.headers.origin;
            const ua = req.headers['user-agent'];
            const key = req.headers['sec-websocket-key'];
            const host = req.headers.host;
            const url = req.url; // ✅ 能看到 querystring（后面我们会用它）

            const isElectronUA = typeof ua === 'string' && (ua.includes('Electron') || ua.includes('Web3toolbox'));
            const hasRendererTag = typeof url === 'string' && url.includes('clientTag=');
            const isAllowedFrontend = isElectronUA || hasRendererTag;

            if (!isAllowedFrontend) {
                console.warn('[WS][REJECT_NON_ELECTRON]', {
                    connId,
                    origin,
                    host,
                    url,
                    ua,
                    time: new Date().toISOString(),
                });
                try { ws.close(1008, 'frontend only accepts electron client'); } catch {}
                return;
            }

            ws._connId = connId;

            console.log('[WS][OPEN]', {
                connId,
                origin,
                host,
                url,
                key,
                ua,
                time: new Date().toISOString(),
            });
            // Prefer the first open connection; if none or closed, promote the new one
            this.wsFrontServers = this.wsFrontServers || [];
            this.wsFrontServers.push(ws);
            this.frontReady = this._getOpenFrontSockets().length > 0;
            this.flushFrontBuffer();
            ws.on('message', (msg) => {
                let message;
                try {
                    const raw = typeof msg === 'string' ? msg : (msg?.toString ? msg.toString() : '');
                    message = raw ? JSON.parse(raw) : null;
                } catch (error) {
                    console.warn('Frontend WebSocket message parse failed:', error);
                    return;
                }
                if (!message || !message.type) {
                    return;
                }
                if (message.type === 'heart_beat') {
                    return;
                }
                console.log('Received message:', message);
                if (message.type === 'terminate_process') {
                    if (message.taskName) {
                        const target = this.getTaskSocket(message.taskName);
                        if (target) {
                            console.log('Send terminate to task:', message.taskName);
                            target.send(JSON.stringify({
                                type: 'terminate_process',
                                code: 0,
                                message: 'Terminate process command received from frontend'
                            }));
                        }
                    } else {
                        for (let key in this.wsTaskServer) {
                            console.log('Broadcast terminate to task:', key);
                            this.wsTaskServer[key].send(JSON.stringify({
                                type: 'terminate_process',
                                code: 0,
                                message: 'Terminate process command received from frontend'
                            }));
                        }
                    }
                    return;
                }

                if (String(message.type || '').startsWith('agent_')) {
                    const targetTaskName = message.taskName;
                    if (!targetTaskName) {
                        return;
                    }
                    const target = this.getTaskSocket(targetTaskName);
                    if (!target) {
                        this.enqueueTaskMessage(targetTaskName, message);
                        return;
                    }
                    target.send(JSON.stringify(message));
                }
            });
            ws.on('error', (error) => {
                console.error('WebSocket connection error:', error);
                ws.close();
            });
            ws.on('close', (code, reason) => {
                console.log('[WS][CLOSE]', {
                    connId: ws?._connId,
                    code,
                    reason: reason ? reason.toString() : '',
                    time: new Date().toISOString(),
                });
                this.wsFrontServers = (this.wsFrontServers || []).filter((s) => s !== ws);
                this.frontReady = this._getOpenFrontSockets().length > 0;
            });
        });
        this.frontRouteRegistered = true;
        return 'ws://localhost:30001/ws'
    }

    enqueueFrontMessage(message, code = 0) {
        if (!this.frontMessageBuffer) {
            this.frontMessageBuffer = [];
        }
        this.frontMessageBuffer.push({ message, code });
        if (this.frontMessageBuffer.length > this.frontMessageBufferLimit) {
            this.frontMessageBuffer.splice(0, this.frontMessageBuffer.length - this.frontMessageBufferLimit);
        }
    }

    _getOpenFrontSockets() {
        return (this.wsFrontServers || []).filter((s) => s && s.readyState === 1);
    }

    flushFrontBuffer() {
        const targets = this._getOpenFrontSockets();
        if (targets.length === 0 || !this.frontReady || !Array.isArray(this.frontMessageBuffer)) {
            return;
        }
        const buffer = this.frontMessageBuffer.slice();
        this.frontMessageBuffer = [];
        buffer.forEach(({ message, code }) => {
            try {
                this._sendToFrontNow(message, code, targets);
            } catch (e) {
                console.warn('Failed to flush front message:', e);
            }
        });
    }

    // Send message to frontend
    async sendToFront(message, code = 0) {
        const targets = this._getOpenFrontSockets();
        if (targets.length === 0) {
            this.frontReady = false;
            this.enqueueFrontMessage(message, code);
            return;
        }
        if (!this.frontReady) {
            this.enqueueFrontMessage(message, code);
            console.log('WebSocket not initialized');
            return;
        }
        try {
            this._sendToFrontNow(message, code, targets);
        } catch (e) {
            console.error('sendToFront failed, enqueueing:', e?.message || e);
            this.enqueueFrontMessage(message, code);
        }
    }

    _sendToFrontNow(message, code = 0, targets = this._getOpenFrontSockets()) {
        let msgObj;
        try {
            msgObj = typeof message === 'string' ? JSON.parse(message) : message;
        } catch {
            msgObj = { message };
        }
        if (msgObj.code === undefined) msgObj.code = code;
        targets.forEach((socket) => {
            try {
                socket.send(JSON.stringify(msgObj));
            } catch (e) {
                console.error('wsFrontServer.send failed:', e?.message || e);
            }
        });
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
            // Store socket by both numeric key and taskName for targeted operations
            this.wsTaskServer[this.taskKey[taskName]] = ws;
            this.wsTaskServer[taskName] = ws;
            this.flushTaskMessageQueue(taskName);
        });
        return 'ws://localhost:30001' + taskUrl
    }
    closeTaskWebSocket(taskName) {
        const socket = this.getTaskSocket(taskName);
        if (socket) {
            socket.close();
        }
        const key = this.taskKey[taskName];
        if (key && this.wsTaskServer[key]) {
            delete this.wsTaskServer[key];
        }
        if (this.wsTaskServer[taskName]) {
            delete this.wsTaskServer[taskName];
        }
    }
    // Send message to task process
    sendToTask(taskName, message, code = 0) {
        const socket = this.getTaskSocket(taskName);
        if (!socket) {
            this.enqueueTaskMessage(taskName, message);
            return;
        }
        let msgObj;
        try {
            msgObj = typeof message === 'string' ? JSON.parse(message) : message;
        } catch {
            msgObj = { message };
        }
        if (msgObj.code === undefined) msgObj.code = code;
        socket.send(JSON.stringify(msgObj));
    }

    enqueueTaskMessage(taskName, message) {
        if (!taskName) return;
        if (!this.pendingTaskMessages[taskName]) {
            this.pendingTaskMessages[taskName] = [];
        }
        this.pendingTaskMessages[taskName].push(message);
        if (this.pendingTaskMessages[taskName].length > this.pendingTaskMessageLimit) {
            this.pendingTaskMessages[taskName].splice(
                0,
                this.pendingTaskMessages[taskName].length - this.pendingTaskMessageLimit
            );
        }
    }

    flushTaskMessageQueue(taskName) {
        const socket = this.getTaskSocket(taskName);
        const queue = this.pendingTaskMessages[taskName];
        if (!socket || !Array.isArray(queue) || queue.length === 0) {
            return;
        }
        const pending = queue.slice();
        this.pendingTaskMessages[taskName] = [];
        pending.forEach((message) => {
            try {
                const payload = typeof message === 'string' ? message : JSON.stringify(message);
                socket.send(payload);
            } catch (error) {
                this.enqueueTaskMessage(taskName, message);
            }
        });
    }

    shortTaskName(taskName = '') {
        if (typeof taskName !== 'string' || !taskName.includes('_')) return taskName;
        const [address, rest] = taskName.split('_');
        if (!address || !rest || address.length < 10) return taskName;
        const shortAddress = `${address.slice(0, 5)}...${address.slice(-5)}`;
        return `${shortAddress}_${rest}`;
    }

    // Helper: retrieve socket by taskName or numeric key (supports short id matching)
    getTaskSocket(taskName) {
        if (this.wsTaskServer[taskName]) {
            return this.wsTaskServer[taskName];
        }
        const key = this.taskKey[taskName];
        if (key && this.wsTaskServer[key]) {
            return this.wsTaskServer[key];
        }
        // Try match by short task name (e.g., ea115...679c9_openWallet)
        const shortIncoming = this.shortTaskName(taskName);
        if (shortIncoming) {
            const fullMatch = Object.keys(this.taskKey || {}).find((fullName) => {
                return this.shortTaskName(fullName) === shortIncoming;
            });
            if (fullMatch) {
                const resolvedKey = this.taskKey[fullMatch];
                if (resolvedKey && this.wsTaskServer[resolvedKey]) {
                    return this.wsTaskServer[resolvedKey];
                }
                if (this.wsTaskServer[fullMatch]) {
                    return this.wsTaskServer[fullMatch];
                }
            }
        }
        return null;
    }
    checkWebSocket() {
        console.log('Checking WebSocket connection');
        if (!this.frontRouteRegistered) {
            this.createFrontWebSocket();
        }
        return {
            success: true,
            routeRegistered: this.frontRouteRegistered,
            frontReady: this.frontReady,
        };
    }
}

module.exports = WebSocketService;
