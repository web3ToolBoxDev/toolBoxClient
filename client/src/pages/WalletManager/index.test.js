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
    getAllWallets: jest.fn(),
    createWallets: jest.fn(),
    updateWalletName: jest.fn(),
    deleteWallets: jest.fn(),
    exportWallets: jest.fn(),
    importWallets: jest.fn(),
    initWallets: jest.fn(),
    openWallets: jest.fn(),
    bindWalletEnv: jest.fn(),
    getWalletScriptDirectory: jest.fn(),
    setWalletScriptDirectory: jest.fn(),
    resetWalletScriptDirectory: jest.fn()
};

jest.mock('../../utils/api', () => ({
    __esModule: true,
    default: { getInstance: () => mockApi }
}));

const mockFetchWallets = jest.fn();
const mockWallets = [];
jest.mock('../../store/walletStore', () => ({
    __esModule: true,
    default: (selector) => selector({
        fetchWallets: mockFetchWallets,
        wallets: mockWallets
    })
}));

const mockFetchFingerPrints = jest.fn();
const mockFingerPrints = {};
jest.mock('../../store/fingerPrintStore', () => ({
    __esModule: true,
    default: (selector) => selector({
        fingerPrints: mockFingerPrints,
        fetchFingerPrints: mockFetchFingerPrints
    })
}));

const mockFetchPaths = jest.fn();
jest.mock('../../store/pathStore', () => {
    const store = (selector) => selector({
        savePath: '/data',
        fetchPaths: mockFetchPaths
    });
    store.getState = () => ({ fetchWalletScriptDirectory: jest.fn() });
    return { __esModule: true, default: store };
});

// Smart CustomModal mock that renders buttons from rowList so click handlers execute
const mockModalValues = {
    count: '5', walletName: 'NewName', envId: 'fp1', directory: '/tmp/export',
    filePath: '/file.xlsx', scriptDirectoryInput: '/new-scripts', envSearch: ''
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
    eventEmitter: { on: jest.fn(), off: jest.fn(), removeListener: jest.fn() }
}));

let WalletManage;

describe('WalletManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.alert = jest.fn();
        window.confirm = jest.fn().mockReturnValue(true);
        window.electronAPI = {
            openFile: jest.fn().mockResolvedValue('/file.xlsx'),
            chooseDirectory: jest.fn().mockResolvedValue('/tmp/export')
        };
        // Re-setup mock resolved values after clearAllMocks
        mockApi.getAllWallets.mockResolvedValue([]);
        mockApi.createWallets.mockResolvedValue({ success: true });
        mockApi.updateWalletName.mockResolvedValue({ success: true });
        mockApi.deleteWallets.mockResolvedValue({ success: true });
        mockApi.exportWallets.mockResolvedValue({ success: true });
        mockApi.importWallets.mockResolvedValue({ success: true, message: '2 imported' });
        mockApi.initWallets.mockResolvedValue({ success: true });
        mockApi.openWallets.mockResolvedValue({ success: true });
        mockApi.bindWalletEnv.mockResolvedValue({ success: true });
        mockApi.getWalletScriptDirectory.mockResolvedValue({ success: true, directory: '/scripts' });
        mockApi.setWalletScriptDirectory.mockResolvedValue({ success: true });
        mockApi.resetWalletScriptDirectory.mockResolvedValue({ success: true });
        if (!WalletManage) {
            WalletManage = require('./index').default;
        }
    });

    afterEach(() => {
        delete window.electronAPI;
        mockWallets.length = 0;
        Object.keys(mockFingerPrints).forEach(k => delete mockFingerPrints[k]);
        window.localStorage.clear();
    });

    it('renders heading and control panel', () => {
        render(<WalletManage />);
        expect(screen.getByText('walletManager')).toBeInTheDocument();
        expect(screen.getByText('createWallet')).toBeInTheDocument();
        expect(screen.getByText('importWallet')).toBeInTheDocument();
        expect(screen.getByText('exportWallet')).toBeInTheDocument();
    });

    it('renders wallet list header', () => {
        render(<WalletManage />);
        expect(screen.getByText('walletList')).toBeInTheDocument();
        expect(screen.getByText('initWallets')).toBeInTheDocument();
        expect(screen.getByText('deleteSelected')).toBeInTheDocument();
    });

    it('renders no wallets when empty', () => {
        render(<WalletManage />);
        expect(screen.getByText('noWallets')).toBeInTheDocument();
    });

    it('deleteSelected alerts when nothing selected', () => {
        render(<WalletManage />);
        fireEvent.click(screen.getByText('deleteSelected'));
        expect(window.alert).toHaveBeenCalledWith('noSelected');
    });

    it('calls fetchPaths on mount', () => {
        render(<WalletManage />);
        expect(mockFetchPaths).toHaveBeenCalled();
    });

    // --- Tests with wallet data ---
    describe('with wallets', () => {
        beforeEach(() => {
            mockWallets.push(
                { id: 'w1', name: 'Wallet A', walletInitialized: true, bindEnvId: 'fp1', ethAddress: '0xaaa', solAddress: 'sol1', mnemonic: 'test words', ethPrivateKey: '0xpk1', solPrivateKey: 'spk1' },
                { id: 'w2', name: 'Wallet B', walletInitialized: false, bindEnvId: '', ethAddress: '0xbbb' }
            );
            Object.assign(mockFingerPrints, {
                'fp1': { id: 'fp1', name: 'Env Alpha', bindWalletId: '' },
                'fp2': { id: 'fp2', name: 'Env Beta', bindWalletId: '' }
            });
        });

        it('renders wallet rows', () => {
            render(<WalletManage />);
            expect(screen.getByText('Wallet A')).toBeInTheDocument();
            expect(screen.getByText(/Wallet B/)).toBeInTheDocument();
        });

        it('renders action buttons', () => {
            render(<WalletManage />);
            expect(screen.getAllByText('edit')).toHaveLength(2);
            expect(screen.getAllByText('viewDetail')).toHaveLength(2);
            expect(screen.getAllByText('open')).toHaveLength(2);
        });

        it('toggleSelect checkbox', () => {
            render(<WalletManage />);
            const checkboxes = screen.getAllByRole('checkbox');
            fireEvent.click(checkboxes[1]); // select w1
            expect(checkboxes[1].checked).toBe(true);
            fireEvent.click(checkboxes[1]); // deselect
        });

        it('toggleSelectAll', () => {
            render(<WalletManage />);
            const checkboxes = screen.getAllByRole('checkbox');
            fireEvent.click(checkboxes[0]); // select all
            fireEvent.click(checkboxes[0]); // deselect all
        });

        it('edit opens modal and saves name', async () => {
            render(<WalletManage />);
            fireEvent.click(screen.getAllByText('edit')[0]);
            expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
            await act(async () => {
                fireEvent.click(screen.getByText('save'));
            });
            expect(mockApi.updateWalletName).toHaveBeenCalledWith('w1', 'NewName');
        });

        it('viewDetail opens modal', () => {
            render(<WalletManage />);
            fireEvent.click(screen.getAllByText('viewDetail')[0]);
            expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
        });

        it('bindEnv opens modal and binds', async () => {
            render(<WalletManage />);
            fireEvent.click(screen.getAllByText(/bindEnv|rebindEnv/)[0]);
            expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
            const modal = screen.getByTestId('custom-modal');
            await act(async () => {
                fireEvent.click(within(modal).getByText('bind'));
            });
            expect(mockApi.bindWalletEnv).toHaveBeenCalledWith('w1', 'fp1');
        });

        it('bindEnv search button reopens modal', () => {
            render(<WalletManage />);
            fireEvent.click(screen.getAllByText(/bindEnv|rebindEnv/)[0]);
            const modal = screen.getByTestId('custom-modal');
            fireEvent.click(within(modal).getByText('search'));
        });

        it('open wallet with bindEnvId', async () => {
            render(<WalletManage />);
            await act(async () => {
                fireEvent.click(screen.getAllByText('open')[0]);
            });
            expect(mockApi.openWallets).toHaveBeenCalledWith(['w1']);
        });

        it('open wallet alerts when not bound', () => {
            render(<WalletManage />);
            fireEvent.click(screen.getAllByText('open')[1]);
            expect(window.alert).toHaveBeenCalledWith('wallet.open.notBound');
        });

        it('open wallet handles API failure', async () => {
            mockApi.openWallets.mockResolvedValue({ success: false, message: 'err' });
            render(<WalletManage />);
            await act(async () => {
                fireEvent.click(screen.getAllByText('open')[0]);
            });
            expect(window.alert).toHaveBeenCalled();
        });

        it('deleteSelected calls API and cleans up', async () => {
            window.localStorage.setItem('syncGroups', JSON.stringify([
                { id: 'g1', master: 'w1', slaves: ['w3'], mode: 'wallet' }
            ]));
            render(<WalletManage />);
            const checkboxes = screen.getAllByRole('checkbox');
            fireEvent.click(checkboxes[1]); // select w1
            await act(async () => {
                fireEvent.click(screen.getByText('deleteSelected'));
            });
            expect(mockApi.deleteWallets).toHaveBeenCalledWith(['w1']);
        });

        it('deleteSelected handles API failure', async () => {
            mockApi.deleteWallets.mockResolvedValue({ success: false, message: 'fail' });
            render(<WalletManage />);
            fireEvent.click(screen.getAllByRole('checkbox')[1]);
            await act(async () => {
                fireEvent.click(screen.getByText('deleteSelected'));
            });
            expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('deleteFailed'));
        });

        it('deleteSelected handles API error', async () => {
            mockApi.deleteWallets.mockRejectedValue(new Error('network'));
            render(<WalletManage />);
            fireEvent.click(screen.getAllByRole('checkbox')[1]);
            await act(async () => {
                fireEvent.click(screen.getByText('deleteSelected'));
            });
            expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('deleteFailed'));
        });

        it('initWallets with bound wallets', async () => {
            render(<WalletManage />);
            fireEvent.click(screen.getAllByRole('checkbox')[1]); // w1 (has bindEnvId)
            await act(async () => {
                fireEvent.click(screen.getByText('initWallets'));
            });
            expect(mockApi.initWallets).toHaveBeenCalledWith(['w1']);
        });

        it('initWallets alerts for unbound wallet', () => {
            render(<WalletManage />);
            fireEvent.click(screen.getAllByRole('checkbox')[2]); // w2 (no bindEnvId)
            fireEvent.click(screen.getByText('initWallets'));
            expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('3010'));
        });

        it('initWallets alerts when nothing selected', () => {
            render(<WalletManage />);
            fireEvent.click(screen.getByText('initWallets'));
            expect(window.alert).toHaveBeenCalledWith('noSelected');
        });

        it('initWallets handles failure', async () => {
            mockApi.initWallets.mockResolvedValue({ success: false, code: '1001', message: 'err' });
            render(<WalletManage />);
            fireEvent.click(screen.getAllByRole('checkbox')[1]);
            await act(async () => {
                fireEvent.click(screen.getByText('initWallets'));
            });
            expect(window.alert).toHaveBeenCalled();
        });
    });

    // --- Create wallet modal ---
    it('createWallet opens modal', () => {
        render(<WalletManage />);
        fireEvent.click(screen.getByText('createWallet'));
        expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
    });

    it('createWallet calls API via modal button', async () => {
        render(<WalletManage />);
        fireEvent.click(screen.getByText('createWallet'));
        await act(async () => {
            fireEvent.click(screen.getByText('wallet.modal.create.createButton'));
        });
        expect(mockApi.createWallets).toHaveBeenCalledWith({ count: 5 });
    });

    // --- Export wallet modal ---
    it('exportWallet opens modal', () => {
        render(<WalletManage />);
        fireEvent.click(screen.getByText('exportWallet'));
        expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
    });

    it('exportWallet calls chooseDirectory and exports', async () => {
        render(<WalletManage />);
        fireEvent.click(screen.getByText('exportWallet'));
        const modal = screen.getByTestId('custom-modal');
        // Click the chooseDirectory button in the modal
        await act(async () => {
            fireEvent.click(within(modal).getByText('chooseDirectory'));
        });
        expect(window.electronAPI.chooseDirectory).toHaveBeenCalled();
    });

    // --- Import wallet modal ---
    it('importWallet opens modal', () => {
        render(<WalletManage />);
        fireEvent.click(screen.getByText('importWallet'));
        expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
    });

    it('importWallet calls chooseFile and imports', async () => {
        render(<WalletManage />);
        fireEvent.click(screen.getByText('importWallet'));
        const modal = screen.getByTestId('custom-modal');
        await act(async () => {
            fireEvent.click(within(modal).getByText('chooseFile'));
        });
        const importBtns = screen.getAllByText('importWallet');
        await act(async () => {
            fireEvent.click(importBtns[importBtns.length - 1]);
        });
        expect(mockApi.importWallets).toHaveBeenCalled();
    });

    // --- Set wallet script directory ---
    it('setWalletScriptDirectory opens modal', async () => {
        render(<WalletManage />);
        await act(async () => {
            fireEvent.click(screen.getByText('setWalletScriptDirectory'));
        });
        expect(mockApi.getWalletScriptDirectory).toHaveBeenCalled();
        expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
    });

    it('setWalletScriptDirectory confirm sets directory', async () => {
        render(<WalletManage />);
        await act(async () => {
            fireEvent.click(screen.getByText('setWalletScriptDirectory'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('confirmButton'));
        });
        expect(mockApi.setWalletScriptDirectory).toHaveBeenCalledWith('/new-scripts');
    });

    it('setWalletScriptDirectory reset', async () => {
        render(<WalletManage />);
        await act(async () => {
            fireEvent.click(screen.getByText('setWalletScriptDirectory'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('reset'));
        });
        expect(mockApi.resetWalletScriptDirectory).toHaveBeenCalled();
    });

    it('setWalletScriptDirectory chooseButton', async () => {
        render(<WalletManage />);
        await act(async () => {
            fireEvent.click(screen.getByText('setWalletScriptDirectory'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('chooseButton'));
        });
        expect(window.electronAPI.chooseDirectory).toHaveBeenCalled();
    });
});
