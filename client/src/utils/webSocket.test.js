import '@testing-library/jest-dom';
jest.mock('./api', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        checkWebSocket: jest.fn().mockResolvedValue({ success: true })
    }))
}));
import WebSocketManager from './webSocket';

describe('WebSocketManager', () => {
    beforeEach(() => {
        if (typeof window !== 'undefined') {
            delete window.__wsManager;
        }
        WebSocketManager.instance = null;
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const mockConnectedManager = () => {
        const manager = WebSocketManager.getInstance();
        manager.connectWebsocket = jest.fn(async (messageCallback, closeCallback) => {
            manager.wss = { readyState: 1, send: jest.fn(), close: jest.fn() };
            manager.messageQueue = [];
            if (typeof messageCallback === 'function') {
                manager._messageListeners.add(messageCallback);
            }
            if (typeof closeCallback === 'function') {
                manager._closeListeners.add(closeCallback);
            }
            manager.__emit = (payload) => {
                manager.pushToQueue(payload);
                manager._messageListeners.forEach((listener) => listener(payload));
            };
            return true;
        });
        return manager;
    };

    // --- Singleton & constructor ---
    it('getInstance returns singleton', () => {
        const a = WebSocketManager.getInstance();
        const b = WebSocketManager.getInstance();
        expect(a).toBe(b);
    });

    it('constructor returns existing instance from window.__wsManager', () => {
        const first = new WebSocketManager();
        const second = new WebSocketManager();
        expect(first).toBe(second);
    });

    it('getInstance uses window.__wsManager if set', () => {
        const m = WebSocketManager.getInstance();
        expect(window.__wsManager).toBe(m);
        const m2 = WebSocketManager.getInstance();
        expect(m2).toBe(m);
    });

    // --- Listener management ---
    it('notifies all registered message listeners', async () => {
        const manager = mockConnectedManager();
        const listenerA = jest.fn();
        const listenerB = jest.fn();
        await manager.connect(listenerA, jest.fn());
        await manager.connect(listenerB, jest.fn());
        manager.__emit({ type: 'task_log', message: 'Task:demo hello' });
        expect(listenerA).toHaveBeenCalledTimes(1);
        expect(listenerB).toHaveBeenCalledTimes(1);
        expect(manager.getQueueLength()).toBe(1);
    });

    it('supports removing one listener without affecting others', async () => {
        const manager = mockConnectedManager();
        const listenerA = jest.fn();
        const listenerB = jest.fn();
        await manager.connect(listenerA, jest.fn());
        manager.addMessageListener(listenerB);
        manager.removeMessageListener(listenerB);
        manager.__emit({ type: 'task_log', message: 'Task:demo hello' });
        expect(listenerA).toHaveBeenCalledTimes(1);
        expect(listenerB).not.toHaveBeenCalled();
    });

    it('addCloseListener and removeCloseListener', () => {
        const manager = WebSocketManager.getInstance();
        const listener = jest.fn();
        manager.addCloseListener(listener);
        expect(manager._closeListeners.has(listener)).toBe(true);
        manager.removeCloseListener(listener);
        expect(manager._closeListeners.has(listener)).toBe(false);
    });

    it('addMessageListener ignores non-function', () => {
        const manager = WebSocketManager.getInstance();
        manager.addMessageListener(null);
        expect(manager._messageListeners.size).toBe(0);
    });

    it('addCloseListener ignores non-function', () => {
        const manager = WebSocketManager.getInstance();
        manager.addCloseListener('not a function');
        expect(manager._closeListeners.size).toBe(0);
    });

    // --- Message queue ---
    it('pushToQueue and popFromQueue work correctly', () => {
        const manager = WebSocketManager.getInstance();
        manager.messageQueue = [];
        manager.pushToQueue({ type: 'a' });
        manager.pushToQueue({ type: 'b' });
        expect(manager.getQueueLength()).toBe(2);
        expect(manager.popFromQueue()).toEqual({ type: 'a' });
        expect(manager.getQueueLength()).toBe(1);
    });

    // --- Outbound queue ---
    it('queues outbound message before websocket open and flushes on connect', async () => {
        const manager = WebSocketManager.getInstance();
        const wsSend = jest.fn();
        manager.connectWebsocket = jest.fn(async (messageCallback, closeCallback) => {
            manager.wss = { readyState: 1, send: wsSend, close: jest.fn() };
            manager.messageQueue = [];
            if (typeof messageCallback === 'function') manager._messageListeners.add(messageCallback);
            if (typeof closeCallback === 'function') manager._closeListeners.add(closeCallback);
            manager.flushOutboundQueue();
            return true;
        });
        manager.sendMessage(JSON.stringify({ type: 'test' }));
        expect(wsSend).not.toHaveBeenCalled();
        expect(manager._outboundQueue.length).toBe(1);
        await manager.connect(jest.fn(), jest.fn());
        expect(wsSend).toHaveBeenCalledTimes(1);
    });

    it('sendMessage sends directly when websocket is open', () => {
        const manager = WebSocketManager.getInstance();
        manager.wss = { readyState: 1, send: jest.fn() };
        const result = manager.sendMessage('hello');
        expect(result).toBe(true);
        expect(manager.wss.send).toHaveBeenCalledWith('hello');
    });

    it('sendMessage queues when websocket is not open', () => {
        const manager = WebSocketManager.getInstance();
        manager.wss = null;
        const result = manager.sendMessage('hello');
        expect(result).toBe(false);
        expect(manager._outboundQueue).toContain('hello');
    });

    it('enqueueOutbound trims queue when over limit', () => {
        const manager = WebSocketManager.getInstance();
        manager._outboundQueueLimit = 3;
        manager._outboundQueue = [];
        for (let i = 0; i < 5; i++) {
            manager.enqueueOutbound(`msg${i}`);
        }
        expect(manager._outboundQueue.length).toBe(3);
        expect(manager._outboundQueue[0]).toBe('msg2');
    });

    it('flushOutboundQueue does nothing when not connected', () => {
        const manager = WebSocketManager.getInstance();
        manager.wss = null;
        manager._outboundQueue = ['msg1'];
        manager.flushOutboundQueue();
        expect(manager._outboundQueue.length).toBe(1);
    });

    it('flushOutboundQueue re-enqueues on send error', () => {
        const manager = WebSocketManager.getInstance();
        manager.wss = {
            readyState: 1,
            send: jest.fn(() => { throw new Error('send failed'); })
        };
        manager._outboundQueue = ['msg1'];
        manager.flushOutboundQueue();
        expect(manager._outboundQueue.length).toBe(1);
        expect(manager._outboundQueue[0]).toBe('msg1');
    });

    // --- Heartbeat ---
    it('startHeartbeat sends heartbeat at intervals', () => {
        const manager = WebSocketManager.getInstance();
        manager.wss = { readyState: 1, send: jest.fn() };
        manager.startHeartbeat();
        jest.advanceTimersByTime(5000);
        expect(manager.wss.send).toHaveBeenCalledWith(JSON.stringify({ type: 'heart_beat' }));
        manager.stopHeartbeat();
    });

    it('startHeartbeat clears existing timer', () => {
        const manager = WebSocketManager.getInstance();
        manager.wss = { readyState: 1, send: jest.fn() };
        manager.startHeartbeat();
        manager.startHeartbeat();
        manager.stopHeartbeat();
    });

    it('heartbeat does not send when ws not open', () => {
        const manager = WebSocketManager.getInstance();
        manager.wss = { readyState: 3, send: jest.fn() };
        manager.startHeartbeat();
        jest.advanceTimersByTime(5000);
        expect(manager.wss.send).not.toHaveBeenCalled();
        manager.stopHeartbeat();
    });

    it('stopHeartbeat clears timer', () => {
        const manager = WebSocketManager.getInstance();
        manager.startHeartbeat();
        expect(manager._heartbeatTimer).not.toBeNull();
        manager.stopHeartbeat();
        expect(manager._heartbeatTimer).toBeNull();
    });

    // --- checkConnection ---
    it('checkConnection returns true when open', () => {
        const manager = WebSocketManager.getInstance();
        manager.wss = { readyState: 1 };
        expect(manager.checkConnection()).toBe(true);
    });

    it('checkConnection returns false when not open', () => {
        const manager = WebSocketManager.getInstance();
        manager.wss = null;
        expect(manager.checkConnection()).toBe(false);
    });

    it('checkConnection returns false when readyState is not 1', () => {
        const manager = WebSocketManager.getInstance();
        manager.wss = { readyState: 3 };
        expect(manager.checkConnection()).toBe(false);
    });

    // --- close ---
    it('close cleans up all resources', () => {
        const manager = WebSocketManager.getInstance();
        manager.wss = { readyState: 1, send: jest.fn(), close: jest.fn() };
        manager.startHeartbeat();
        manager._reconnectTimer = setTimeout(() => {}, 1000);
        manager.addMessageListener(jest.fn());
        manager.addCloseListener(jest.fn());
        manager._outboundQueue = ['msg1'];

        manager.close();
        expect(manager.wss).toBeNull();
        expect(manager._heartbeatTimer).toBeNull();
        expect(manager._reconnectTimer).toBeNull();
        expect(manager._messageListeners.size).toBe(0);
        expect(manager._closeListeners.size).toBe(0);
        expect(manager._outboundQueue.length).toBe(0);
    });

    it('close handles null wss gracefully', () => {
        const manager = WebSocketManager.getInstance();
        manager.wss = null;
        expect(() => manager.close()).not.toThrow();
    });

    // --- scheduleReconnect ---
    it('scheduleReconnect does nothing if timer already exists', () => {
        const manager = WebSocketManager.getInstance();
        manager._reconnectTimer = setTimeout(() => {}, 10000);
        const originalTimer = manager._reconnectTimer;
        manager.scheduleReconnect();
        expect(manager._reconnectTimer).toBe(originalTimer);
        clearTimeout(manager._reconnectTimer);
    });

    // --- connect with already-open socket ---
    it('connect adds listeners when already connected', async () => {
        const manager = WebSocketManager.getInstance();
        manager.wss = { readyState: 1 };
        const msgCb = jest.fn();
        const closeCb = jest.fn();
        const result = await manager.connect(msgCb, closeCb);
        expect(result).toBe(true);
        expect(manager._messageListeners.has(msgCb)).toBe(true);
        expect(manager._closeListeners.has(closeCb)).toBe(true);
    });

    // --- connect retry exhaustion ---
    it('connect returns false after exhausting retries', async () => {
        jest.useRealTimers();
        const manager = WebSocketManager.getInstance();
        manager.connectWebsocket = jest.fn(async () => false);
        const result = await manager.connect(jest.fn(), jest.fn(), 1);
        expect(result).toBe(false);
        expect(manager.connectWebsocket).toHaveBeenCalled();
    });

    // --- connectWebsocket with real WebSocket mock ---
    describe('connectWebsocket', () => {
        let mockSocket;
        const OriginalWebSocket = global.WebSocket;

        beforeEach(() => {
            jest.useRealTimers();
            mockSocket = {
                readyState: 0,
                send: jest.fn(),
                close: jest.fn(),
                onopen: null,
                onmessage: null,
                onclose: null,
                onerror: null,
            };
            global.WebSocket = jest.fn(() => mockSocket);
            global.WebSocket.OPEN = 1;
            global.WebSocket.CONNECTING = 0;
            global.WebSocket.CLOSED = 3;
        });

        afterEach(() => {
            global.WebSocket = OriginalWebSocket;
        });

        it('resolves true on open', async () => {
            const manager = WebSocketManager.getInstance();
            manager.ensureBackendReady = jest.fn().mockResolvedValue(true);
            const promise = manager.connectWebsocket(jest.fn(), jest.fn());
            await new Promise(r => setTimeout(r, 10));
            mockSocket.readyState = 1;
            mockSocket.onopen();
            expect(await promise).toBe(true);
        });

        it('processes onmessage', async () => {
            const manager = WebSocketManager.getInstance();
            manager.ensureBackendReady = jest.fn().mockResolvedValue(true);
            const msgCb = jest.fn();
            const promise = manager.connectWebsocket(msgCb, jest.fn());
            await new Promise(r => setTimeout(r, 10));
            mockSocket.readyState = 1;
            mockSocket.onopen();
            await promise;
            await mockSocket.onmessage({ data: JSON.stringify({ type: 'test_msg' }) });
            expect(msgCb).toHaveBeenCalledWith({ type: 'test_msg' });
            expect(manager.getQueueLength()).toBe(1);
        });

        it('handles onclose', async () => {
            const manager = WebSocketManager.getInstance();
            manager.ensureBackendReady = jest.fn().mockResolvedValue(true);
            const closeCb = jest.fn();
            const promise = manager.connectWebsocket(jest.fn(), closeCb);
            await new Promise(r => setTimeout(r, 10));
            mockSocket.onclose({ reason: '' });
            expect(await promise).toBe(false);
            expect(closeCb).toHaveBeenCalled();
        });

        it('handles duplicate frontend connection close', async () => {
            const manager = WebSocketManager.getInstance();
            manager.ensureBackendReady = jest.fn().mockResolvedValue(true);
            const promise = manager.connectWebsocket(jest.fn(), jest.fn());
            await new Promise(r => setTimeout(r, 10));
            mockSocket.onclose({ reason: 'duplicate frontend connection' });
            expect(await promise).toBe(false);
        });

        it('handles onerror', async () => {
            const manager = WebSocketManager.getInstance();
            manager.ensureBackendReady = jest.fn().mockResolvedValue(true);
            const promise = manager.connectWebsocket(jest.fn(), jest.fn());
            await new Promise(r => setTimeout(r, 10));
            mockSocket.onerror(new Error('ws error'));
            expect(await promise).toBe(false);
        });

        it('returns false when backend not ready', async () => {
            const manager = WebSocketManager.getInstance();
            manager.ensureBackendReady = jest.fn().mockResolvedValue(false);
            expect(await manager.connectWebsocket(jest.fn(), jest.fn())).toBe(false);
        });

        it('handles Blob message data', async () => {
            const manager = WebSocketManager.getInstance();
            manager.ensureBackendReady = jest.fn().mockResolvedValue(true);
            const msgCb = jest.fn();
            const promise = manager.connectWebsocket(msgCb, jest.fn());
            await new Promise(r => setTimeout(r, 10));
            mockSocket.readyState = 1;
            mockSocket.onopen();
            await promise;
            const fakeBlob = Object.create(Blob.prototype, {
                text: { value: () => Promise.resolve(JSON.stringify({ type: 'blob_msg' })) }
            });
            await mockSocket.onmessage({ data: fakeBlob });
            expect(msgCb).toHaveBeenCalledWith({ type: 'blob_msg' });
        });

        it('handles parse error in onmessage', async () => {
            const manager = WebSocketManager.getInstance();
            manager.ensureBackendReady = jest.fn().mockResolvedValue(true);
            const msgCb = jest.fn();
            const promise = manager.connectWebsocket(msgCb, jest.fn());
            await new Promise(r => setTimeout(r, 10));
            mockSocket.readyState = 1;
            mockSocket.onopen();
            await promise;
            await mockSocket.onmessage({ data: 'not valid json{' });
            expect(msgCb).not.toHaveBeenCalled();
        });

        it('handles WebSocket constructor error', async () => {
            global.WebSocket = jest.fn(() => { throw new Error('ws init fail'); });
            global.WebSocket.OPEN = 1;
            const manager = WebSocketManager.getInstance();
            manager.ensureBackendReady = jest.fn().mockResolvedValue(true);
            expect(await manager.connectWebsocket(jest.fn(), jest.fn())).toBe(false);
        });
    });

    // --- ensureBackendReady ---
    describe('ensureBackendReady', () => {
        it('returns true on first successful check', async () => {
            jest.useRealTimers();
            const manager = WebSocketManager.getInstance();
            manager.apiManager = { checkWebSocket: jest.fn().mockResolvedValue({ success: true }) };
            expect(await manager.ensureBackendReady()).toBe(true);
            expect(manager.apiManager.checkWebSocket).toHaveBeenCalledTimes(1);
        });

        it('retries and succeeds on second check', async () => {
            jest.useRealTimers();
            const manager = WebSocketManager.getInstance();
            manager.apiManager = {
                checkWebSocket: jest.fn()
                    .mockRejectedValueOnce(new Error('first fail'))
                    .mockResolvedValueOnce({ success: true })
            };
            expect(await manager.ensureBackendReady()).toBe(true);
            expect(manager.apiManager.checkWebSocket).toHaveBeenCalledTimes(2);
        });

        it('returns false when both checks fail', async () => {
            jest.useRealTimers();
            const manager = WebSocketManager.getInstance();
            manager.apiManager = {
                checkWebSocket: jest.fn().mockRejectedValue(new Error('always fail'))
            };
            expect(await manager.ensureBackendReady()).toBe(false);
        });

        it('returns false when first not ready and retry also not ready', async () => {
            jest.useRealTimers();
            const manager = WebSocketManager.getInstance();
            manager.apiManager = {
                checkWebSocket: jest.fn().mockResolvedValue({ success: false })
            };
            expect(await manager.ensureBackendReady()).toBe(false);
        });
    });

    // --- connect with CONNECTING state ---
    it('connect joins _connecting when ws is CONNECTING', async () => {
        jest.useRealTimers();
        const manager = WebSocketManager.getInstance();
        manager.wss = { readyState: 0 };
        manager._connecting = Promise.resolve(true);
        const msgCb = jest.fn();
        const closeCb = jest.fn();
        const result = await manager.connect(msgCb, closeCb);
        expect(result).toBe(true);
        expect(manager._messageListeners.has(msgCb)).toBe(true);
        expect(manager._closeListeners.has(closeCb)).toBe(true);
    });

    it('connect joins _connecting when no wss', async () => {
        jest.useRealTimers();
        const manager = WebSocketManager.getInstance();
        manager.wss = null;
        manager._connecting = Promise.resolve(false);
        const result = await manager.connect(jest.fn(), jest.fn());
        expect(result).toBe(false);
    });

    // --- scheduleReconnect ---
    it('scheduleReconnect calls connect after delay', () => {
        const manager = WebSocketManager.getInstance();
        manager._lastCallbacks = { messageCallback: jest.fn(), closeCallback: jest.fn() };
        manager.connect = jest.fn().mockResolvedValue(true);
        manager.scheduleReconnect();
        expect(manager._reconnectTimer).not.toBeNull();
        jest.advanceTimersByTime(1500);
        expect(manager.connect).toHaveBeenCalled();
    });

    it('scheduleReconnect skips without messageCallback', () => {
        const manager = WebSocketManager.getInstance();
        manager._lastCallbacks = null;
        manager.connect = jest.fn();
        manager.scheduleReconnect();
        jest.advanceTimersByTime(1500);
        expect(manager.connect).not.toHaveBeenCalled();
    });
});
