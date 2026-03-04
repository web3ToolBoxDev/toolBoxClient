import '@testing-library/jest-dom';

const mockApiMethods = {
    getFingerPrints: jest.fn()
};

jest.mock('../utils/api', () => ({
    __esModule: true,
    default: { getInstance: () => mockApiMethods }
}));

describe('fingerPrintStore', () => {
    let useFingerPrintStore;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    const getStore = () => require('./fingerPrintStore').default;

    it('setFingerPrints sets data', () => {
        useFingerPrintStore = getStore();
        useFingerPrintStore.getState().setFingerPrints({ a: { id: 'a' } });
        expect(useFingerPrintStore.getState().fingerPrints).toEqual({ a: { id: 'a' } });
    });

    it('clearFingerPrints resets to empty', () => {
        useFingerPrintStore = getStore();
        useFingerPrintStore.getState().setFingerPrints({ a: { id: 'a' } });
        useFingerPrintStore.getState().clearFingerPrints();
        expect(useFingerPrintStore.getState().fingerPrints).toEqual({});
    });

    it('fetchFingerPrints sets data on success', async () => {
        mockApiMethods.getFingerPrints.mockResolvedValue({ success: true, data: { fp1: { id: 'fp1', name: 'FP1' } } });
        useFingerPrintStore = getStore();
        await useFingerPrintStore.getState().fetchFingerPrints();
        expect(useFingerPrintStore.getState().fingerPrints).toEqual({ fp1: { id: 'fp1', name: 'FP1' } });
    });

    it('fetchFingerPrints sets empty on failure', async () => {
        mockApiMethods.getFingerPrints.mockResolvedValue({ success: false });
        useFingerPrintStore = getStore();
        await useFingerPrintStore.getState().fetchFingerPrints();
        expect(useFingerPrintStore.getState().fingerPrints).toEqual({});
    });

    it('fetchFingerPrints sets empty when no data', async () => {
        mockApiMethods.getFingerPrints.mockResolvedValue({ success: true, data: null });
        useFingerPrintStore = getStore();
        await useFingerPrintStore.getState().fetchFingerPrints();
        expect(useFingerPrintStore.getState().fingerPrints).toEqual({});
    });
});
