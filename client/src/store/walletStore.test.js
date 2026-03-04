import '@testing-library/jest-dom';

const mockApiMethods = {
    getAllWallets: jest.fn()
};

jest.mock('../utils/api', () => ({
    __esModule: true,
    default: { getInstance: () => mockApiMethods }
}));

describe('walletStore', () => {
    let useWalletStore;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    const getStore = () => require('./walletStore').default;

    it('setWallets sets wallets', () => {
        useWalletStore = getStore();
        useWalletStore.getState().setWallets([{ id: '1' }]);
        expect(useWalletStore.getState().wallets).toEqual([{ id: '1' }]);
    });

    it('clearWallets resets wallets to empty', () => {
        useWalletStore = getStore();
        useWalletStore.getState().setWallets([{ id: '1' }]);
        useWalletStore.getState().clearWallets();
        expect(useWalletStore.getState().wallets).toEqual([]);
    });

    it('fetchWallets sorts by createdAt then id', async () => {
        mockApiMethods.getAllWallets.mockResolvedValue([
            { id: 'b', createdAt: 2 },
            { id: 'a', createdAt: 1 },
            { id: 'c', createdAt: 1 }
        ]);
        useWalletStore = getStore();
        await useWalletStore.getState().fetchWallets();
        const wallets = useWalletStore.getState().wallets;
        expect(wallets[0].id).toBe('a');
        expect(wallets[1].id).toBe('c');
        expect(wallets[2].id).toBe('b');
    });

    it('fetchWallets handles non-array response', async () => {
        mockApiMethods.getAllWallets.mockResolvedValue(null);
        useWalletStore = getStore();
        await useWalletStore.getState().fetchWallets();
        expect(useWalletStore.getState().wallets).toEqual([]);
    });

    it('fetchWallets sorts equal createdAt and equal id as 0', async () => {
        mockApiMethods.getAllWallets.mockResolvedValue([
            { id: 'a', createdAt: 1 },
            { id: 'a', createdAt: 1 }
        ]);
        useWalletStore = getStore();
        await useWalletStore.getState().fetchWallets();
        expect(useWalletStore.getState().wallets).toHaveLength(2);
    });
});
