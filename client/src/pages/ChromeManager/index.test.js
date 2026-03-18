import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, fallback) => {
            if (typeof fallback === 'string') return fallback;
            if (fallback && typeof fallback === 'object' && fallback.defaultValue) return fallback.defaultValue;
            return key;
        }
    })
}));

const mockApi = {
    getFingerPrintCount: jest.fn(),
    setSavePath: jest.fn(),
    setChromePath: jest.fn(),
    getFingerPrints: jest.fn(),
    generateFingerPrints: jest.fn(),
    updateFingerPrintName: jest.fn(),
    deleteFingerPrints: jest.fn(),
    deleteWallets: jest.fn(),
    updateFingerPrintProxy: jest.fn(),
    deleteFingerPrintProxy: jest.fn(),
    checkProxy: jest.fn(),
    execTask: jest.fn(),
    getAllWallets: jest.fn()
};

jest.mock('../../utils/api', () => ({
    __esModule: true,
    default: { getInstance: () => mockApi }
}));

const mockFingerPrints = {};
const mockSetFingerPrints = jest.fn();

jest.mock('../../store/fingerPrintStore', () => ({
    __esModule: true,
    default: (selector) => selector({
        fingerPrints: mockFingerPrints,
        setFingerPrints: mockSetFingerPrints
    })
}));

const mockSetWallets = jest.fn();
const mockWallets = [];
jest.mock('../../store/walletStore', () => ({
    __esModule: true,
    default: (selector) => selector({
        wallets: mockWallets,
        setWallets: mockSetWallets
    })
}));

const mockFetchPaths = jest.fn();
jest.mock('../../store/pathStore', () => ({
    __esModule: true,
    default: (selector) => selector({
        savePath: '/data',
        chromePath: '/chrome',
        fetchPaths: mockFetchPaths
    })
}));

const mockModalValues = {
    generateCount: '3', envNameInput: 'NewEnv', ipType: 'http',
    ipHost: '1.2.3.4', ipPort: '8080', ipUsername: 'user', ipPassword: 'pass'
};

jest.mock('../../components/customModal', () => {
    const ReactLocal = require('react');
    return ReactLocal.forwardRef(function MockCustomModal(props, ref) {
        ReactLocal.useImperativeHandle(ref, () => ({
            clearValueObj: jest.fn(),
            updateValueObj: jest.fn(),
            getValue: jest.fn((key) => mockModalValues[key] || ''),
            setValueObj: jest.fn()
        }));
        if (!props.show) return null;
        return (
            <div data-testid="custom-modal">
                {(props.rowList || []).map((row, ri) => (
                    <div key={ri}>
                        {row.filter(item => item && item.type === 'button' && item.click).map((item, ci) => (
                            <button key={`btn-${ri}-${ci}`} onClick={item.click}>{item.text}</button>
                        ))}
                    </div>
                ))}
            </div>
        );
    });
});

jest.mock('../../utils/eventEmitter', () => ({
    eventEmitter: { on: jest.fn(), off: jest.fn(), emit: jest.fn() }
}));

import ChromeManager from './index';

describe('ChromeManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.alert = jest.fn();
        window.electronAPI = {
            openFile: jest.fn().mockResolvedValue('/path/to/chrome'),
            chooseDirectory: jest.fn().mockResolvedValue('/data/dir')
        };
        // Re-setup mock resolved values after clearAllMocks
        mockApi.getFingerPrintCount.mockResolvedValue({ success: true, message: 5 });
        mockApi.setSavePath.mockResolvedValue({ success: true, data: { fingerprints: {}, wallets: [], tasks: [] } });
        mockApi.setChromePath.mockResolvedValue({ success: true });
        mockApi.getFingerPrints.mockResolvedValue({ success: true, data: {} });
        mockApi.generateFingerPrints.mockResolvedValue({ success: true });
        mockApi.updateFingerPrintName.mockResolvedValue({ success: true });
        mockApi.deleteFingerPrints.mockResolvedValue({ success: true });
        mockApi.deleteWallets.mockResolvedValue({ success: true });
        mockApi.updateFingerPrintProxy.mockResolvedValue({ success: true, data: { proxy: {} } });
        mockApi.deleteFingerPrintProxy.mockResolvedValue({ success: true });
        mockApi.checkProxy.mockResolvedValue({ success: true });
        mockApi.execTask.mockResolvedValue({ success: true });
        mockApi.getAllWallets.mockResolvedValue([]);
        // Setup fingerprints
        Object.assign(mockFingerPrints, {
            'fp1': { id: 'fp1', name: 'Env Alpha', createdAt: 1, proxy: null },
            'fp2': { id: 'fp2', name: 'Env Beta', createdAt: 2, proxy: { ipHost: '5.6.7.8', ipPort: '3128' } }
        });
    });

    afterEach(() => {
        delete window.electronAPI;
        Object.keys(mockFingerPrints).forEach(k => delete mockFingerPrints[k]);
        mockWallets.length = 0;
    });

    it('renders heading and control panel', () => {
        render(<ChromeManager />);
        expect(screen.getByText('chromeManage')).toBeInTheDocument();
    });

    it('shows chrome path and save path labels', () => {
        render(<ChromeManager />);
        expect(screen.getByText(/currentChromePath/)).toBeInTheDocument();
        expect(screen.getByText(/currentSavePath/)).toBeInTheDocument();
    });

    it('renders fingerprint list', () => {
        render(<ChromeManager />);
        expect(screen.getByText('fingerprintEnvs')).toBeInTheDocument();
        expect(screen.getByText('Env Alpha')).toBeInTheDocument();
        expect(screen.getByText('Env Beta')).toBeInTheDocument();
    });

    it('renders generate and delete buttons', () => {
        render(<ChromeManager />);
        expect(screen.getByText('generateFingerprint')).toBeInTheDocument();
        expect(screen.getByText('deleteSelected')).toBeInTheDocument();
    });

    it('alerts when deleting with no selection', () => {
        render(<ChromeManager />);
        fireEvent.click(screen.getByText('deleteSelected'));
        expect(window.alert).toHaveBeenCalledWith('noSelected');
    });

    it('renders action buttons for each row', () => {
        render(<ChromeManager />);
        expect(screen.getAllByText('edit')).toHaveLength(2);
        expect(screen.getAllByText('viewDetail')).toHaveLength(2);
        expect(screen.getAllByText('configProxy')).toHaveLength(2);
        expect(screen.getAllByText('open')).toHaveLength(2);
    });

    it('select and deselect individual fingerprints', () => {
        render(<ChromeManager />);
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[1]);
        fireEvent.click(checkboxes[1]);
    });

    it('select all toggles', () => {
        render(<ChromeManager />);
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[0]);
    });

    it('change buttons render', () => {
        render(<ChromeManager />);
        const changeButtons = screen.getAllByText('change');
        expect(changeButtons.length).toBeGreaterThanOrEqual(1);
    });

    // --- setChromePathHandler ---
    it('setChromePathHandler sets chrome path', async () => {
        render(<ChromeManager />);
        const changeBtns = screen.getAllByText('change');
        await act(async () => {
            fireEvent.click(changeBtns[0]); // chrome path change button
        });
        expect(window.electronAPI.openFile).toHaveBeenCalled();
        expect(mockApi.setChromePath).toHaveBeenCalledWith('/path/to/chrome');
    });

    // --- setSavePathHandler ---
    it('setSavePathHandler sets save path', async () => {
        render(<ChromeManager />);
        const changeBtns = screen.getAllByText('change');
        await act(async () => {
            fireEvent.click(changeBtns[1]); // save path change button
        });
        expect(window.electronAPI.chooseDirectory).toHaveBeenCalled();
        expect(mockApi.setSavePath).toHaveBeenCalledWith('/data/dir');
    });

    // --- Generate fingerprint modal ---
    it('generate fingerprint opens modal', () => {
        render(<ChromeManager />);
        fireEvent.click(screen.getByText('generateFingerprint'));
        expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
    });

    it('generate fingerprint calls API', async () => {
        render(<ChromeManager />);
        fireEvent.click(screen.getByText('generateFingerprint'));
        await act(async () => {
            fireEvent.click(screen.getByText('generateButton'));
        });
        expect(mockApi.generateFingerPrints).toHaveBeenCalledWith(3);
    });

    it('generate fingerprint alerts on invalid count', async () => {
        mockModalValues.generateCount = '';
        render(<ChromeManager />);
        fireEvent.click(screen.getByText('generateFingerprint'));
        await act(async () => {
            fireEvent.click(screen.getByText('generateButton'));
        });
        expect(window.alert).toHaveBeenCalledWith('invalidGenerateCount');
        mockModalValues.generateCount = '3'; // restore
    });

    // --- Edit env name ---
    it('edit env name opens modal', () => {
        render(<ChromeManager />);
        fireEvent.click(screen.getAllByText('edit')[0]);
        expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
    });

    it('edit env name saves', async () => {
        render(<ChromeManager />);
        fireEvent.click(screen.getAllByText('edit')[0]);
        await act(async () => {
            fireEvent.click(screen.getByText('save'));
        });
        expect(mockApi.updateFingerPrintName).toHaveBeenCalledWith('fp1', 'NewEnv');
    });

    // --- View detail ---
    it('viewDetail opens modal', () => {
        render(<ChromeManager />);
        fireEvent.click(screen.getAllByText('viewDetail')[0]);
        expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
    });

    // --- Open env ---
    it('openEnv calls execTask', async () => {
        render(<ChromeManager />);
        await act(async () => {
            fireEvent.click(screen.getAllByText('open')[0]);
        });
        expect(mockApi.execTask).toHaveBeenCalledWith('openChrome', { envIds: ['fp1'] });
    });

    it('openEnv handles failure', async () => {
        mockApi.execTask.mockResolvedValue({ success: false, message: 'fail' });
        render(<ChromeManager />);
        await act(async () => {
            fireEvent.click(screen.getAllByText('open')[0]);
        });
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('openEnvFailed'));
    });

    // --- Config proxy ---
    it('configProxy opens modal', async () => {
        render(<ChromeManager />);
        await act(async () => {
            fireEvent.click(screen.getAllByText('configProxy')[0]);
        });
        expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
    });

    it('configProxy save config calls API', async () => {
        render(<ChromeManager />);
        await act(async () => {
            fireEvent.click(screen.getAllByText('configProxy')[0]);
        });
        await act(async () => {
            fireEvent.click(screen.getByText('saveConfig'));
        });
        expect(mockApi.updateFingerPrintProxy).toHaveBeenCalledWith('fp1', expect.objectContaining({
            ipHost: '1.2.3.4', ipPort: '8080'
        }));
    });

    it('configProxy test proxy calls API', async () => {
        render(<ChromeManager />);
        await act(async () => {
            fireEvent.click(screen.getAllByText('configProxy')[0]);
        });
        await act(async () => {
            fireEvent.click(screen.getByText('testProxy'));
        });
        expect(mockApi.checkProxy).toHaveBeenCalled();
    });

    it('configProxy delete proxy calls API', async () => {
        render(<ChromeManager />);
        await act(async () => {
            fireEvent.click(screen.getAllByText('configProxy')[0]);
        });
        await act(async () => {
            fireEvent.click(screen.getByText('deleteProxy'));
        });
        expect(mockApi.deleteFingerPrintProxy).toHaveBeenCalledWith('fp1');
    });

    // --- Delete selected fingerprints ---
    it('deleteSelected calls API', async () => {
        render(<ChromeManager />);
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[1]); // select fp1
        await act(async () => {
            fireEvent.click(screen.getByText('deleteSelected'));
        });
        expect(mockApi.deleteFingerPrints).toHaveBeenCalledWith(['fp1']);
    });

    it('deleteSelected cleans up localStorage syncGroups', async () => {
        window.localStorage.setItem('syncGroups', JSON.stringify([
            { id: 'g1', master: 'fp1', slaves: ['fp3'], mode: 'env' }
        ]));
        render(<ChromeManager />);
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[1]);
        await act(async () => {
            fireEvent.click(screen.getByText('deleteSelected'));
        });
        expect(mockApi.deleteFingerPrints).toHaveBeenCalled();
    });

    it('deleteSelected handles failure', async () => {
        mockApi.deleteFingerPrints.mockResolvedValue({ success: false, message: 'err' });
        render(<ChromeManager />);
        fireEvent.click(screen.getAllByRole('checkbox')[1]);
        await act(async () => {
            fireEvent.click(screen.getByText('deleteSelected'));
        });
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('deleteFailed'));
    });

    // --- Wallet initialization check ---
    it('openEnv blocks when bound wallet is not initialized', async () => {
        // fp1 has a bound wallet that is NOT initialized
        Object.assign(mockFingerPrints, {
            'fp1': { id: 'fp1', name: 'Env Alpha', createdAt: 1, proxy: null, bindWalletId: 'w1' },
            'fp2': { id: 'fp2', name: 'Env Beta', createdAt: 2, proxy: null }
        });
        mockWallets.push({ id: 'w1', name: 'W1', bindEnvId: 'fp1', walletInitialized: false });

        render(<ChromeManager />);
        await act(async () => {
            fireEvent.click(screen.getAllByText('open')[0]); // click open on fp1
        });
        // Should show alert and NOT call execTask
        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('钱包尚未初始化'));
        expect(mockApi.execTask).not.toHaveBeenCalled();
    });

    it('openEnv proceeds when bound wallet IS initialized', async () => {
        Object.assign(mockFingerPrints, {
            'fp1': { id: 'fp1', name: 'Env Alpha', createdAt: 1, proxy: null, bindWalletId: 'w2' },
            'fp2': { id: 'fp2', name: 'Env Beta', createdAt: 2, proxy: null }
        });
        mockWallets.push({ id: 'w2', name: 'W2', bindEnvId: 'fp1', walletInitialized: true });

        render(<ChromeManager />);
        await act(async () => {
            fireEvent.click(screen.getAllByText('open')[0]);
        });
        expect(mockApi.execTask).toHaveBeenCalledWith('openChrome', { envIds: ['fp1'] });
    });

    it('openEnv proceeds when no wallet is bound', async () => {
        // fp1 has no bindWalletId
        Object.assign(mockFingerPrints, {
            'fp1': { id: 'fp1', name: 'Env Alpha', createdAt: 1, proxy: null },
            'fp2': { id: 'fp2', name: 'Env Beta', createdAt: 2, proxy: null }
        });

        render(<ChromeManager />);
        await act(async () => {
            fireEvent.click(screen.getAllByText('open')[0]);
        });
        expect(mockApi.execTask).toHaveBeenCalledWith('openChrome', { envIds: ['fp1'] });
    });

    // --- Delete with bound wallets ---
    it('deleteSelected also deletes bound wallets', async () => {
        mockWallets.push({ id: 'w1', name: 'W1', bindEnvId: 'fp1' });
        render(<ChromeManager />);
        fireEvent.click(screen.getAllByRole('checkbox')[1]);
        await act(async () => {
            fireEvent.click(screen.getByText('deleteSelected'));
        });
        expect(mockApi.deleteWallets).toHaveBeenCalledWith(['w1']);
    });
});
