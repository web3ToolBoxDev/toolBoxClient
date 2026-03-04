const mockWebSocketService = {
    getTaskSocket: jest.fn(),
    sendToTask: jest.fn(),
    sendToFront: jest.fn(),
    closeTaskWebSocket: jest.fn(),
    checkWebSocket: jest.fn()
};

jest.mock('./webSocketService', () => ({
    getInstance: () => mockWebSocketService
}));

jest.mock('./proxyService', () => ({
    stopProxy: jest.fn(),
    checkAndStartProxy: jest.fn()
}));

jest.mock('./fingerPrintService', () => ({
    getEnvById: jest.fn((id) => Promise.resolve({ success: true, data: { id, name: id, bindWalletId: '' } }))
}));

jest.mock('./walletService', () => ({
    getWalletById: jest.fn((id) => Promise.resolve({
        success: true,
        data: { id, name: id, bindEnvId: 'env-1', address: '0xabc' }
    }))
}));

jest.mock('../utils', () => ({
    sleep: jest.fn()
}));

jest.mock('../../config', () => ({
    getInstance: () => ({
        getIsBuild: () => false,
        getDefaultExecPath: () => 'node',
        getInitWalletScriptPath: () => './init.js',
        getOpenWalletScriptPath: () => './open.js',
        getChromePath: () => ({ path: 'chrome' }),
        getSavePath: () => ({ path: 'save' }),
        getTaskDb: () => ({
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn()
        }),
        loadTasksFromDirectory: jest.fn()
    })
}));

const TaskService = require('./taskService');

describe('TaskService sendAgentCommand regression', () => {
    beforeEach(() => {
        TaskService.instance = null;
        jest.clearAllMocks();
    });

    it('returns 1002 when task does not exist', async () => {
        const service = new TaskService();
        service.getTaskByName = jest.fn().mockResolvedValue(null);

        const res = await service.sendAgentCommand('求职AI助手', JSON.stringify({ type: 'agent_init' }));

        expect(res).toMatchObject({ success: false, code: 1002 });
    });

    it('returns 1014 when task is not ai task', async () => {
        const service = new TaskService();
        service.getTaskByName = jest.fn().mockResolvedValue({ taskName: '普通任务', taskType: 'normal' });

        const res = await service.sendAgentCommand('普通任务', JSON.stringify({ type: 'agent_init' }));

        expect(res).toMatchObject({ success: false, code: 1014 });
    });

    it('returns 1019 when ai task socket is not running', async () => {
        const service = new TaskService();
        service.getTaskByName = jest.fn().mockResolvedValue({ taskName: '求职AI助手', taskType: 'ai' });
        mockWebSocketService.getTaskSocket.mockReturnValue(null);

        const res = await service.sendAgentCommand('求职AI助手', JSON.stringify({ type: 'agent_init' }));

        expect(res).toMatchObject({ success: false, code: 1019 });
    });

    it('forwards agent message to task socket and returns success', async () => {
        const service = new TaskService();
        service.getTaskByName = jest.fn().mockResolvedValue({ taskName: '求职AI助手', taskType: 'ai' });
        mockWebSocketService.getTaskSocket.mockReturnValue({ send: jest.fn() });

        const message = JSON.stringify({ type: 'agent_user_input', payload: { sessionId: 's1', text: 'hello' } });
        const res = await service.sendAgentCommand('求职AI助手', message);

        expect(mockWebSocketService.sendToTask).toHaveBeenCalledWith('求职AI助手', message);
        expect(res).toMatchObject({ success: true, code: 0 });
    });

    it('execTask(ai) keeps runtime context in request_task_data payload', async () => {
        const service = new TaskService();
        service.getTaskByName = jest.fn().mockResolvedValue({
            taskName: '求职AI助手',
            taskType: 'ai',
            scriptPath: './example/ai_example.js',
            execPath: 'node',
            config: { default: { apiKey: 'k' } },
            configSchema: { apiKey: { type: 'input' } }
        });
        service.runTask = jest.fn();
        service.checkCompleted = jest.fn();

        await service.execTask('求职AI助手', {
            mode: 'ai',
            runtimeContext: {
                envIds: ['env-1'],
                walletIds: ['w1'],
                metaMaskPath: 'C:\\meta\\path'
            }
        });

        expect(service.runTask).toHaveBeenCalledTimes(1);
        const runTaskArgs = service.runTask.mock.calls[0];
        expect(runTaskArgs[0]).toBe('求职AI助手');
        expect(runTaskArgs[1]).toMatchObject({
            taskType: 'ai',
            taskName: '求职AI助手',
            taskDataFromFront: {
                mode: 'ai',
                runtimeContext: {
                    envIds: ['env-1'],
                    walletIds: ['w1'],
                    metaMaskPath: 'C:\\meta\\path'
                }
            }
        });
    });
});
