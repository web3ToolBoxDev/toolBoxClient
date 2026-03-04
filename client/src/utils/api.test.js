const mockAxios = {
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
};

jest.mock('axios', () => mockAxios);

const { default: APIManager } = require('./api');
const { eventEmitter } = require('./eventEmitter');

describe('APIManager regression', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        APIManager.instance = null;
        window.localStorage.clear();
        window.alert = jest.fn();
        jest.spyOn(eventEmitter, 'emit').mockImplementation(() => true);
    });

    afterEach(() => {
        if (eventEmitter.emit.mockRestore) {
            eventEmitter.emit.mockRestore();
        }
    });

    it('execTask posts to backend and emits task events when not running', async () => {
        const api = APIManager.getInstance();
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        window.localStorage.setItem('appLanguage', 'zh-CN');

        const res = await api.execTask('demoTask', { mode: 'normal' });

        expect(res).toEqual({ success: true });
        expect(mockAxios.post).toHaveBeenCalledWith('http://localhost:30001/api/execTask', {
            taskName: 'demoTask',
            taskData: { mode: 'normal', language: 'zh-CN' }
        });
        expect(eventEmitter.emit).toHaveBeenCalledWith('taskExecuted');
        expect(eventEmitter.emit).toHaveBeenCalledWith('taskStart', {
            taskName: 'demoTask',
            taskData: { mode: 'normal', language: 'zh-CN' }
        });
    });

    it('execTask blocks duplicate non-id-scoped running task', async () => {
        const api = APIManager.getInstance();
        window.localStorage.setItem(
            'taskLogsByTask',
            JSON.stringify({
                demoTask: { status: 'running' }
            })
        );

        const res = await api.execTask('demoTask');

        expect(res).toMatchObject({ success: false, code: 1003 });
        expect(window.alert).toHaveBeenCalledWith('Task is already running');
        expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('execTask can suppress duplicate running alert', async () => {
        const api = APIManager.getInstance();
        window.localStorage.setItem(
            'taskLogsByTask',
            JSON.stringify({
                demoTask: { status: 'running' }
            })
        );

        const res = await api.execTask('demoTask', { _suppressRunningAlert: true });

        expect(res).toMatchObject({ success: false, code: 1003 });
        expect(window.alert).not.toHaveBeenCalled();
        expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('execTask blocks id-scoped overlap and returns runningIds', async () => {
        const api = APIManager.getInstance();
        window.localStorage.setItem(
            'taskLogsByTask',
            JSON.stringify({
                abc_openWallet: { status: 'running' },
                xyz_openWallet: { status: 'completed' }
            })
        );

        const res = await api.execTask('openWallet', { envIds: ['abc', 'new-id'] });

        expect(res).toMatchObject({
            success: false,
            code: 1003,
            runningIds: ['abc']
        });
        expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('execTask allows id-scoped non-overlap even if another id is running', async () => {
        const api = APIManager.getInstance();
        mockAxios.post.mockResolvedValue({ data: { success: true, task: 'openWallet' } });
        window.localStorage.setItem('appLanguage', 'zh-CN');
        window.localStorage.setItem(
            'taskLogsByTask',
            JSON.stringify({
                abc_openWallet: { status: 'running' }
            })
        );

        const res = await api.execTask('openWallet', { envIds: ['new-id'] });

        expect(res).toEqual({ success: true, task: 'openWallet' });
        expect(mockAxios.post).toHaveBeenCalledWith('http://localhost:30001/api/execTask', {
            taskName: 'openWallet',
            taskData: { envIds: ['new-id'], language: 'zh-CN' }
        });
    });

    it('AI session APIs send expected endpoint and payload', async () => {
        const api = APIManager.getInstance();
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        mockAxios.get.mockResolvedValue({ data: { success: true, data: [] } });

        await api.createAiSession('求职AI助手', '后端方向');
        await api.sendAiOption('求职AI助手', 'opt-1', '后端工程师', 's1');
        await api.listAiSessions('求职AI助手');

        expect(mockAxios.post).toHaveBeenCalledWith('http://localhost:30001/api/createAiSession', {
            taskName: '求职AI助手',
            name: '后端方向'
        });
        expect(mockAxios.post).toHaveBeenCalledWith('http://localhost:30001/api/sendAiOption', {
            taskName: '求职AI助手',
            optionId: 'opt-1',
            optionLabel: '后端工程师',
            sessionId: 's1'
        });
        expect(mockAxios.get).toHaveBeenCalledWith('http://localhost:30001/api/listAiSessions', {
            params: { taskName: '求职AI助手' }
        });
    });

    it('execTask forwards ai runtime context payload as-is', async () => {
        const api = APIManager.getInstance();
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        window.localStorage.setItem('appLanguage', 'zh-CN');

        const payload = {
            mode: 'ai',
            runtimeContext: {
                envIds: ['env-1'],
                walletIds: ['w1'],
                metaMaskPath: 'C:\\meta\\path'
            }
        };

        const res = await api.execTask('求职AI助手', payload);

        expect(res).toEqual({ success: true });
        expect(mockAxios.post).toHaveBeenCalledWith('http://localhost:30001/api/execTask', {
            taskName: '求职AI助手',
            taskData: { ...payload, language: 'zh-CN' }
        });
    });

    it('execTask does not forward internal _suppressRunningAlert flag', async () => {
        const api = APIManager.getInstance();
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        window.localStorage.setItem('appLanguage', 'zh-CN');

        const res = await api.execTask('求职AI助手', {
            mode: 'ai',
            _suppressRunningAlert: true
        });

        expect(res).toEqual({ success: true });
        expect(mockAxios.post).toHaveBeenCalledWith('http://localhost:30001/api/execTask', {
            taskName: '求职AI助手',
            taskData: { mode: 'ai', language: 'zh-CN' }
        });
    });
});
