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
    execTask: jest.fn(),
    getSyncScriptDirectory: jest.fn(),
    setSyncScriptDirectory: jest.fn(),
    resetSyncScriptDirectory: jest.fn()
};

jest.mock('../../utils/api', () => ({
    __esModule: true,
    default: { getInstance: () => mockApi }
}));

const mockWallets = [
    { id: 'w1', name: 'Wallet A', walletInitialized: true, bindEnvId: 'env1' },
    { id: 'w2', name: 'Wallet B', walletInitialized: true, bindEnvId: 'env2' },
    { id: 'w3', name: 'Wallet C', walletInitialized: false, bindEnvId: 'env3' }
];

const mockFetchWallets = jest.fn();
const mockFetchFingerPrints = jest.fn();

jest.mock('../../store/walletStore', () => ({
    __esModule: true,
    default: (selector) => selector({
        wallets: mockWallets,
        fetchWallets: mockFetchWallets
    })
}));

const mockFingerPrints = {
    'env1': { id: 'env1', name: 'Chrome Env 1' },
    'env2': { id: 'env2', name: 'Chrome Env 2' },
    'env3': { id: 'env3', name: 'Chrome Env 3' }
};

jest.mock('../../store/fingerPrintStore', () => ({
    __esModule: true,
    default: (selector) => selector({
        fingerPrints: mockFingerPrints,
        fetchFingerPrints: mockFetchFingerPrints
    })
}));

const mockModalValues = {
    walletId: 'w1', envIds: ['w2'], walletSearch: '', envSearch: '',
    directoryPath: '/new-scripts'
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

import SyncFunction from './index';

describe('SyncFunction', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.alert = jest.fn();
        window.confirm = jest.fn().mockReturnValue(true);
        window.localStorage.clear();
        window.electronAPI = {
            chooseDirectory: jest.fn().mockResolvedValue('/scripts')
        };
        mockApi.execTask.mockResolvedValue({ success: true });
        mockApi.getSyncScriptDirectory.mockResolvedValue({ success: true, directory: 'default' });
        mockApi.setSyncScriptDirectory.mockResolvedValue({ success: true });
        mockApi.resetSyncScriptDirectory.mockResolvedValue({ success: true });
    });

    afterEach(() => {
        delete window.electronAPI;
    });

    it('renders heading and control panel', () => {
        render(<SyncFunction />);
        expect(screen.getByText('syncFunction.title')).toBeInTheDocument();
    });

    it('renders sync mode switch', () => {
        render(<SyncFunction />);
        expect(screen.getByText('sync.useWalletSync')).toBeInTheDocument();
    });

    it('renders control buttons', () => {
        render(<SyncFunction />);
        expect(screen.getByText('sync.chooseMaster')).toBeInTheDocument();
        expect(screen.getByText('sync.chooseSlaves')).toBeInTheDocument();
        expect(screen.getByText('sync.addGroup')).toBeInTheDocument();
        expect(screen.getByText('setSyncScriptDirectory')).toBeInTheDocument();
    });

    it('renders selection display with no master/slaves', () => {
        render(<SyncFunction />);
        expect(screen.getByText('sync.currentSelection')).toBeInTheDocument();
        expect(screen.getByText('sync.noMaster')).toBeInTheDocument();
        expect(screen.getByText('sync.noSlaves')).toBeInTheDocument();
    });

    it('renders empty group list', () => {
        render(<SyncFunction />);
        expect(screen.getByText('sync.groupList')).toBeInTheDocument();
        expect(screen.getByText('sync.noGroups')).toBeInTheDocument();
    });

    it('alerts when adding group without master/slaves', () => {
        render(<SyncFunction />);
        fireEvent.click(screen.getByText('sync.addGroup'));
        expect(window.alert).toHaveBeenCalledWith('sync.selectMasterAndSlaves');
    });

    it('toggles sync mode', () => {
        const { container } = render(<SyncFunction />);
        const switchEl = container.querySelector('#sync-mode-switch');
        fireEvent.click(switchEl);
        expect(screen.getByText('sync.useEnvSync')).toBeInTheDocument();
        fireEvent.click(switchEl);
        expect(screen.getByText('sync.useWalletSync')).toBeInTheDocument();
    });

    it('alerts when deleting groups with none selected', () => {
        render(<SyncFunction />);
        fireEvent.click(screen.getByText('deleteSelected'));
        expect(window.alert).toHaveBeenCalledWith('noSelected');
    });

    it('loads groups from localStorage', () => {
        const storedGroups = [
            { id: 'g1', master: 'w1', slaves: ['w2'], mode: 'wallet' }
        ];
        window.localStorage.setItem('syncGroups', JSON.stringify(storedGroups));
        render(<SyncFunction />);
        expect(screen.getByText('Wallet A')).toBeInTheDocument();
    });

    // --- Choose Master Modal ---
    it('chooseMaster opens modal', () => {
        render(<SyncFunction />);
        fireEvent.click(screen.getByText('sync.chooseMaster'));
        expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
    });

    it('chooseMaster confirm sets master', () => {
        render(<SyncFunction />);
        fireEvent.click(screen.getByText('sync.chooseMaster'));
        fireEvent.click(screen.getByText('confirmButton'));
        // Master should now be set (w1)
        expect(screen.getByText('Wallet A')).toBeInTheDocument();
    });

    it('chooseMaster search reopens modal', () => {
        render(<SyncFunction />);
        fireEvent.click(screen.getByText('sync.chooseMaster'));
        fireEvent.click(screen.getByText('search'));
    });

    // --- Choose Slaves Modal ---
    it('chooseSlaves opens modal', () => {
        render(<SyncFunction />);
        fireEvent.click(screen.getByText('sync.chooseSlaves'));
        expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
    });

    it('chooseSlaves confirm sets slaves', () => {
        render(<SyncFunction />);
        fireEvent.click(screen.getByText('sync.chooseSlaves'));
        fireEvent.click(screen.getByText('confirmButton'));
    });

    it('chooseSlaves search reopens modal', () => {
        render(<SyncFunction />);
        fireEvent.click(screen.getByText('sync.chooseSlaves'));
        fireEvent.click(screen.getByText('search'));
    });

    // --- Add Group ---
    it('adds a group after selecting master and slaves', () => {
        render(<SyncFunction />);
        // Select master
        fireEvent.click(screen.getByText('sync.chooseMaster'));
        fireEvent.click(screen.getByText('confirmButton'));
        // Select slaves
        fireEvent.click(screen.getByText('sync.chooseSlaves'));
        fireEvent.click(screen.getByText('confirmButton'));
        // Add group
        fireEvent.click(screen.getByText('sync.addGroup'));
        // Group should appear
        expect(screen.queryByText('sync.noGroups')).not.toBeInTheDocument();
    });

    it('alerts when adding duplicate group', () => {
        render(<SyncFunction />);
        // Select master + slaves and add
        fireEvent.click(screen.getByText('sync.chooseMaster'));
        fireEvent.click(screen.getByText('confirmButton'));
        fireEvent.click(screen.getByText('sync.chooseSlaves'));
        fireEvent.click(screen.getByText('confirmButton'));
        fireEvent.click(screen.getByText('sync.addGroup'));
        // Try to add same again - need to re-select since it resets
        fireEvent.click(screen.getByText('sync.chooseMaster'));
        fireEvent.click(screen.getByText('confirmButton'));
        fireEvent.click(screen.getByText('sync.chooseSlaves'));
        fireEvent.click(screen.getByText('confirmButton'));
        fireEvent.click(screen.getByText('sync.addGroup'));
        expect(window.alert).toHaveBeenCalledWith('sync.groupExists');
    });

    // --- Start Group ---
    it('starts a group', async () => {
        const storedGroups = [
            { id: 'g1', master: 'w1', slaves: ['w2'], mode: 'wallet' }
        ];
        window.localStorage.setItem('syncGroups', JSON.stringify(storedGroups));
        render(<SyncFunction />);
        await act(async () => {
            fireEvent.click(screen.getByText('sync.startGroup'));
        });
        expect(mockApi.execTask).toHaveBeenCalledWith('syncFunction', expect.objectContaining({
            masterId: 'w1',
            slaveIds: ['w2']
        }));
    });

    it('start group alerts on failure', async () => {
        mockApi.execTask.mockResolvedValue({ success: false, message: 'err' });
        const storedGroups = [
            { id: 'g1', master: 'w1', slaves: ['w2'], mode: 'wallet' }
        ];
        window.localStorage.setItem('syncGroups', JSON.stringify(storedGroups));
        render(<SyncFunction />);
        await act(async () => {
            fireEvent.click(screen.getByText('sync.startGroup'));
        });
        expect(window.alert).toHaveBeenCalled();
    });

    // --- Delete Groups ---
    it('deletes selected groups', () => {
        const storedGroups = [
            { id: 'g1', master: 'w1', slaves: ['w2'], mode: 'wallet' }
        ];
        window.localStorage.setItem('syncGroups', JSON.stringify(storedGroups));
        render(<SyncFunction />);
        // Select the group checkbox (not the sync mode switch, not the select-all-groups)
        const checkboxes = screen.getAllByRole('checkbox');
        // checkboxes: [0]=sync-mode-switch, [1]=select-all-groups, [2]=group-g1
        const groupCheckbox = checkboxes[checkboxes.length - 1]; // last checkbox is group
        fireEvent.click(groupCheckbox);
        fireEvent.click(screen.getByText('deleteSelected'));
        expect(window.alert).toHaveBeenCalledWith('deleteSuccess');
    });

    // --- Toggle select all groups ---
    it('toggle select all groups', () => {
        const storedGroups = [
            { id: 'g1', master: 'w1', slaves: ['w2'], mode: 'wallet' }
        ];
        window.localStorage.setItem('syncGroups', JSON.stringify(storedGroups));
        render(<SyncFunction />);
        const checkboxes = screen.getAllByRole('checkbox');
        // Find the select-all groups checkbox (second checkbox, after sync mode switch)
        const selectAllGroupsCheckbox = checkboxes[1];
        fireEvent.click(selectAllGroupsCheckbox);
        fireEvent.click(selectAllGroupsCheckbox);
    });

    // --- Set Sync Script Directory ---
    it('setSyncScriptDirectory opens modal', async () => {
        render(<SyncFunction />);
        await act(async () => {
            fireEvent.click(screen.getByText('setSyncScriptDirectory'));
        });
        expect(mockApi.getSyncScriptDirectory).toHaveBeenCalled();
        expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
    });

    it('setSyncScriptDirectory confirm sets directory', async () => {
        render(<SyncFunction />);
        await act(async () => {
            fireEvent.click(screen.getByText('setSyncScriptDirectory'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('confirmButton'));
        });
        expect(mockApi.setSyncScriptDirectory).toHaveBeenCalledWith('/new-scripts');
    });

    it('setSyncScriptDirectory reset', async () => {
        render(<SyncFunction />);
        await act(async () => {
            fireEvent.click(screen.getByText('setSyncScriptDirectory'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('resetToDefault'));
        });
        expect(mockApi.resetSyncScriptDirectory).toHaveBeenCalled();
    });

    it('setSyncScriptDirectory selectFolder', async () => {
        render(<SyncFunction />);
        await act(async () => {
            fireEvent.click(screen.getByText('setSyncScriptDirectory'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('syncScriptDirectory.selectFolder'));
        });
        expect(window.electronAPI.chooseDirectory).toHaveBeenCalled();
    });

    // --- Env mode ---
    it('env mode chooseMaster uses fingerprints', () => {
        const { container } = render(<SyncFunction />);
        const switchEl = container.querySelector('#sync-mode-switch');
        fireEvent.click(switchEl); // switch to env mode
        fireEvent.click(screen.getByText('sync.chooseMaster'));
        expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
    });

    it('env mode chooseSlaves uses fingerprints', () => {
        const { container } = render(<SyncFunction />);
        const switchEl = container.querySelector('#sync-mode-switch');
        fireEvent.click(switchEl);
        fireEvent.click(screen.getByText('sync.chooseSlaves'));
        expect(screen.getByTestId('custom-modal')).toBeInTheDocument();
    });
});
