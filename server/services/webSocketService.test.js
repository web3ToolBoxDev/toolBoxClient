const WebSocketService = require('./webSocketService');

describe('WebSocketService agent protocol regression', () => {
    beforeEach(() => {
        WebSocketService.instance = null;
        jest.clearAllMocks();
        global.crypto = {
            randomUUID: jest.fn(() => 'test-uuid'),
            randomBytes: jest.fn(() => Buffer.from('12345678'))
        };
    });

    it('forwards agent_* frontend message to target task socket', () => {
        const service = new WebSocketService();
        const targetTaskSocket = { send: jest.fn() };
        service.getTaskSocket = jest.fn(() => targetTaskSocket);

        let frontHandler = null;
        service.app = {
            ws: jest.fn((path, handler) => {
                if (path === '/ws') {
                    frontHandler = handler;
                }
            })
        };

        service.createFrontWebSocket();

        const ws = {
            send: jest.fn(),
            close: jest.fn(),
            on: jest.fn((event, handler) => {
                ws.__events[event] = handler;
            }),
            __events: {}
        };

        const req = {
            headers: {
                origin: 'http://localhost:3000',
                'user-agent': 'Mozilla/5.0',
                host: 'localhost:30001',
                'sec-websocket-key': 'test-key'
            },
            url: '/ws?clientTag=renderer-test'
        };

        frontHandler(ws, req);

        ws.__events.message(
            JSON.stringify({
                type: 'agent_user_input',
                taskName: '求职AI助手',
                payload: { sessionId: 's1', text: 'hello' }
            })
        );

        expect(service.getTaskSocket).toHaveBeenCalledWith('求职AI助手');
        expect(targetTaskSocket.send).toHaveBeenCalledWith(
            JSON.stringify({
                type: 'agent_user_input',
                taskName: '求职AI助手',
                payload: { sessionId: 's1', text: 'hello' }
            })
        );
    });

    it('resolves task socket by short task name', () => {
        const service = new WebSocketService();
        const fullName = '1234567890abcdef_openWallet';
        const shortName = '12345...bcdef_openWallet';
        const socket = { send: jest.fn() };

        service.taskKey[fullName] = 1001;
        service.wsTaskServer[1001] = socket;

        expect(service.getTaskSocket(shortName)).toBe(socket);
    });

    it('queues agent message when task socket not ready and flushes after task connects', () => {
        const service = new WebSocketService();
        const sent = [];
        service.enqueueTaskMessage('求职AI助手', {
            type: 'agent_session_create',
            taskName: '求职AI助手',
            payload: { name: '后端方向' }
        });

        service.taskKey['求职AI助手'] = 1002;
        service.wsTaskServer[1002] = {
            send: (msg) => sent.push(msg)
        };
        service.wsTaskServer['求职AI助手'] = service.wsTaskServer[1002];
        service.flushTaskMessageQueue('求职AI助手');

        expect(sent.length).toBe(1);
        expect(JSON.parse(sent[0])).toMatchObject({
            type: 'agent_session_create',
            taskName: '求职AI助手'
        });
    });
});
