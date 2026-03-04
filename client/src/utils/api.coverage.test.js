const mockAxios = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
    interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
    }
};

jest.mock('axios', () => ({
    __esModule: true,
    default: mockAxios,
    ...mockAxios
}));

// Reset singleton before each test
beforeEach(() => {
    jest.clearAllMocks();
    // Re-setup mock return values after clearAllMocks
    mockAxios.get.mockResolvedValue({ data: {} });
    mockAxios.post.mockResolvedValue({ data: {} });
    mockAxios.put.mockResolvedValue({ data: {} });
    mockAxios.delete.mockResolvedValue({ data: {} });
    jest.resetModules();
});

describe('APIManager additional coverage', () => {
    const getApi = () => {
        const APIManager = require('./api').default;
        APIManager.instance = null;
        return APIManager.getInstance();
    };

    it('_resolveCurrentLanguage returns stored appLanguage', () => {
        window.localStorage.setItem('appLanguage', 'zh-CN');
        const api = getApi();
        expect(api._resolveCurrentLanguage()).toBe('zh-CN');
        window.localStorage.removeItem('appLanguage');
    });

    it('_resolveCurrentLanguage falls back to i18nextLng', () => {
        window.localStorage.removeItem('appLanguage');
        window.localStorage.setItem('i18nextLng', 'fr');
        const api = getApi();
        expect(api._resolveCurrentLanguage()).toBe('fr');
        window.localStorage.removeItem('i18nextLng');
    });

    it('_resolveCurrentLanguage defaults to en', () => {
        window.localStorage.removeItem('appLanguage');
        window.localStorage.removeItem('i18nextLng');
        const api = getApi();
        expect(api._resolveCurrentLanguage()).toBe('en');
    });

    it('_withLanguage adds language to object', () => {
        const api = getApi();
        const result = api._withLanguage({ foo: 'bar' });
        expect(result).toHaveProperty('language');
        expect(result.foo).toBe('bar');
    });

    it('_withLanguage preserves existing language', () => {
        const api = getApi();
        const result = api._withLanguage({ language: 'de' });
        expect(result.language).toBe('de');
    });

    it('_withLanguage handles null input', () => {
        const api = getApi();
        const result = api._withLanguage(null);
        expect(result).toHaveProperty('language');
    });

    it('createWallets posts to correct endpoint', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        const result = await api.createWallets({ count: 3 });
        expect(mockAxios.post).toHaveBeenCalledWith(expect.stringContaining('/createWallet'), { count: 3 });
        expect(result).toEqual({ success: true });
    });

    it('updateWalletName posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.updateWalletName('id1', 'NewName');
        expect(mockAxios.post).toHaveBeenCalledWith(expect.stringContaining('/updateWalletName'), { id: 'id1', name: 'NewName' });
    });

    it('getAllWallets gets correctly', async () => {
        mockAxios.get.mockResolvedValue({ data: [{ id: '1' }] });
        const api = getApi();
        const result = await api.getAllWallets();
        expect(result).toEqual([{ id: '1' }]);
    });

    it('updateWallet puts correctly', async () => {
        mockAxios.put.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.updateWallet({ id: '1', name: 'Updated' });
        expect(mockAxios.put).toHaveBeenCalled();
    });

    it('openWallets posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.openWallets(['w1']);
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('deleteWallets deletes correctly', async () => {
        mockAxios.delete.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.deleteWallets(['id1']);
        expect(mockAxios.delete).toHaveBeenCalled();
    });

    it('exportWallets posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.exportWallets(['id1'], '/dir');
        expect(mockAxios.post).toHaveBeenCalledWith(expect.stringContaining('/exportWallets'), { ids: ['id1'], directory: '/dir' });
    });

    it('importWallets posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.importWallets('/file.xlsx');
        expect(mockAxios.post).toHaveBeenCalledWith(expect.stringContaining('/importWallets'), { filePath: '/file.xlsx' });
    });

    it('initWallets posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.initWallets(['w1']);
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('importTask posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.importTask({ taskName: 'test' });
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('getAllTasks gets correctly', async () => {
        mockAxios.get.mockResolvedValue({ data: [{ taskName: 'task1' }] });
        const api = getApi();
        const result = await api.getAllTasks(false);
        expect(result).toEqual([{ taskName: 'task1' }]);
    });

    it('getConfigInfo posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.getConfigInfo('task1');
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('setConfigInfo posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.setConfigInfo('task1', { key: 'val' });
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('deleteTask deletes correctly', async () => {
        mockAxios.delete.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.deleteTask(['task1']);
        expect(mockAxios.delete).toHaveBeenCalled();
    });

    it('setSavePath posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.setSavePath('/path');
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('getSavePath gets correctly', async () => {
        mockAxios.get.mockResolvedValue({ data: { path: '/saved' } });
        const api = getApi();
        const result = await api.getSavePath();
        expect(result.path).toBe('/saved');
    });

    it('getWalletScriptDirectory gets correctly', async () => {
        mockAxios.get.mockResolvedValue({ data: { directory: '/scripts' } });
        const api = getApi();
        const result = await api.getWalletScriptDirectory();
        expect(result.directory).toBe('/scripts');
    });

    it('checkWebSocket gets correctly', async () => {
        mockAxios.get.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        const result = await api.checkWebSocket();
        expect(result.success).toBe(true);
    });

    it('getTaskStatus posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.getTaskStatus(['task1']);
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('checkProxy posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.checkProxy({ ipHost: '1.2.3.4', ipPort: 8080 });
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('getFingerPrintCount gets correctly', async () => {
        mockAxios.get.mockResolvedValue({ data: { success: true, message: 10 } });
        const api = getApi();
        const result = await api.getFingerPrintCount();
        expect(result.message).toBe(10);
    });

    it('generateFingerPrints posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.generateFingerPrints(5);
        expect(mockAxios.post).toHaveBeenCalledWith(expect.stringContaining('/generateFingerPrints'), { counts: 5 });
    });

    it('getFingerPrints gets correctly', async () => {
        mockAxios.get.mockResolvedValue({ data: { success: true, data: {} } });
        const api = getApi();
        await api.getFingerPrints();
        expect(mockAxios.get).toHaveBeenCalled();
    });

    it('updateFingerPrintName posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.updateFingerPrintName('fp1', 'New Name');
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('clearFingerPrints gets correctly', async () => {
        mockAxios.get.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.clearFingerPrints();
        expect(mockAxios.get).toHaveBeenCalled();
    });

    it('updateFingerPrintProxy posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.updateFingerPrintProxy('fp1', { ipHost: '1.2.3.4' });
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('deleteFingerPrintProxy posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.deleteFingerPrintProxy('fp1');
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('setChromePath posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.setChromePath('/chrome');
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('getChromePath gets correctly', async () => {
        mockAxios.get.mockResolvedValue({ data: { path: '/chrome' } });
        const api = getApi();
        const result = await api.getChromePath();
        expect(result.path).toBe('/chrome');
    });

    it('deleteFingerPrints posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.deleteFingerPrints(['fp1']);
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('openEnv posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.openEnv('fp1');
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('bindWalletEnv posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.bindWalletEnv('w1', 'e1');
        expect(mockAxios.post).toHaveBeenCalledWith(expect.stringContaining('/bindWalletEnv'), { walletId: 'w1', envId: 'e1' });
    });

    it('setWalletScriptDirectory posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.setWalletScriptDirectory('/dir');
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('resetWalletScriptDirectory posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.resetWalletScriptDirectory();
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('setSyncScriptDirectory posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.setSyncScriptDirectory('/sync');
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('getSyncScriptDirectory gets correctly', async () => {
        mockAxios.get.mockResolvedValue({ data: { directory: '/sync' } });
        const api = getApi();
        const result = await api.getSyncScriptDirectory();
        expect(result.directory).toBe('/sync');
    });

    it('resetSyncScriptDirectory posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.resetSyncScriptDirectory();
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('listAiSessions gets correctly', async () => {
        mockAxios.get.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.listAiSessions('task1');
        expect(mockAxios.get).toHaveBeenCalled();
    });

    it('deleteAiSession posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.deleteAiSession('task1', 's1');
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('getAiSession gets correctly', async () => {
        mockAxios.get.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.getAiSession('task1', 's1');
        expect(mockAxios.get).toHaveBeenCalled();
    });

    it('sendAiMessage posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.sendAiMessage('task1', 'hello', 's1');
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('updateAiSubTask posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.updateAiSubTask('task1', 'key1', 'done', 's1');
        expect(mockAxios.post).toHaveBeenCalled();
    });

    it('initTwitters posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.initTwitters(['addr1']);
        expect(mockAxios.post).toHaveBeenCalledWith(expect.stringContaining('/initTwitter'), { addresses: ['addr1'] });
    });

    it('loadFingerPrints posts correctly', async () => {
        mockAxios.post.mockResolvedValue({ data: { success: true } });
        const api = getApi();
        await api.loadFingerPrints('/file.xlsx');
        expect(mockAxios.post).toHaveBeenCalledWith(expect.stringContaining('/loadFingerPrints'), { filePath: '/file.xlsx' });
    });

    it('singleton returns same instance', () => {
        const APIManager = require('./api').default;
        APIManager.instance = null;
        const a = APIManager.getInstance();
        const b = APIManager.getInstance();
        expect(a).toBe(b);
    });
});
