import '@testing-library/jest-dom';

const mockApiMethods = {
    getSavePath: jest.fn(),
    getChromePath: jest.fn(),
    getWalletScriptDirectory: jest.fn()
};

jest.mock('../utils/api', () => ({
    __esModule: true,
    default: { getInstance: () => mockApiMethods }
}));

describe('pathStore', () => {
    let usePathStore;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    const getStore = () => {
        return require('./pathStore').default;
    };

    it('setSavePath updates savePath', () => {
        usePathStore = getStore();
        usePathStore.getState().setSavePath('/data');
        expect(usePathStore.getState().savePath).toBe('/data');
    });

    it('setChromePath updates chromePath', () => {
        usePathStore = getStore();
        usePathStore.getState().setChromePath('/chrome');
        expect(usePathStore.getState().chromePath).toBe('/chrome');
    });

    it('setWalletScriptDirectory updates walletScriptDirectory', () => {
        usePathStore = getStore();
        usePathStore.getState().setWalletScriptDirectory('/scripts');
        expect(usePathStore.getState().walletScriptDirectory).toBe('/scripts');
    });

    it('fetchSavePath sets path from api response', async () => {
        mockApiMethods.getSavePath.mockResolvedValue({ path: '/saved' });
        usePathStore = getStore();
        await usePathStore.getState().fetchSavePath();
        expect(usePathStore.getState().savePath).toBe('/saved');
    });

    it('fetchSavePath sets empty when no path', async () => {
        mockApiMethods.getSavePath.mockResolvedValue({});
        usePathStore = getStore();
        await usePathStore.getState().fetchSavePath();
        expect(usePathStore.getState().savePath).toBe('');
    });

    it('fetchSavePath sets empty on error', async () => {
        mockApiMethods.getSavePath.mockRejectedValue(new Error('fail'));
        usePathStore = getStore();
        await usePathStore.getState().fetchSavePath();
        expect(usePathStore.getState().savePath).toBe('');
    });

    it('fetchChromePath sets path from api response', async () => {
        mockApiMethods.getChromePath.mockResolvedValue({ path: '/chrome/bin' });
        usePathStore = getStore();
        await usePathStore.getState().fetchChromePath();
        expect(usePathStore.getState().chromePath).toBe('/chrome/bin');
    });

    it('fetchChromePath sets empty when no path', async () => {
        mockApiMethods.getChromePath.mockResolvedValue({});
        usePathStore = getStore();
        await usePathStore.getState().fetchChromePath();
        expect(usePathStore.getState().chromePath).toBe('');
    });

    it('fetchChromePath sets empty on error', async () => {
        mockApiMethods.getChromePath.mockRejectedValue(new Error('fail'));
        usePathStore = getStore();
        await usePathStore.getState().fetchChromePath();
        expect(usePathStore.getState().chromePath).toBe('');
    });

    it('fetchWalletScriptDirectory sets directory from api response', async () => {
        mockApiMethods.getWalletScriptDirectory.mockResolvedValue({ directory: '/scripts/dir' });
        usePathStore = getStore();
        await usePathStore.getState().fetchWalletScriptDirectory();
        expect(usePathStore.getState().walletScriptDirectory).toBe('/scripts/dir');
    });

    it('fetchWalletScriptDirectory sets empty when no directory', async () => {
        mockApiMethods.getWalletScriptDirectory.mockResolvedValue({});
        usePathStore = getStore();
        await usePathStore.getState().fetchWalletScriptDirectory();
        expect(usePathStore.getState().walletScriptDirectory).toBe('');
    });

    it('fetchWalletScriptDirectory sets empty on error', async () => {
        mockApiMethods.getWalletScriptDirectory.mockRejectedValue(new Error('fail'));
        usePathStore = getStore();
        await usePathStore.getState().fetchWalletScriptDirectory();
        expect(usePathStore.getState().walletScriptDirectory).toBe('');
    });

    it('fetchPaths calls all three fetch methods', async () => {
        mockApiMethods.getSavePath.mockResolvedValue({ path: '/a' });
        mockApiMethods.getChromePath.mockResolvedValue({ path: '/b' });
        mockApiMethods.getWalletScriptDirectory.mockResolvedValue({ directory: '/c' });
        usePathStore = getStore();
        await usePathStore.getState().fetchPaths();
        expect(usePathStore.getState().savePath).toBe('/a');
        expect(usePathStore.getState().chromePath).toBe('/b');
        expect(usePathStore.getState().walletScriptDirectory).toBe('/c');
    });
});
