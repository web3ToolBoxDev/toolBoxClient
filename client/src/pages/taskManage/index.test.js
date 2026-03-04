import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
    const actual = jest.requireActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate
    };
});

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, fallbackOrOptions) => {
            if (typeof fallbackOrOptions === 'string') return fallbackOrOptions;
            if (fallbackOrOptions && typeof fallbackOrOptions === 'object' && fallbackOrOptions.defaultValue) {
                return fallbackOrOptions.defaultValue;
            }
            return key;
        }
    })
}));

const mockApi = {
    getAllTasks: jest.fn(),
    getAllWallets: jest.fn(),
    getFingerPrints: jest.fn(),
    execTask: jest.fn(),
    deleteTask: jest.fn(),
    importTask: jest.fn(),
    setConfigInfo: jest.fn()
};

jest.mock('../../utils/api', () => ({
    __esModule: true,
    default: {
        getInstance: () => mockApi
    }
}));

jest.mock('../../components/customModal', () => {
    const ReactLocal = require('react');
    return ReactLocal.forwardRef(function MockCustomModal(_props, ref) {
        ReactLocal.useImperativeHandle(ref, () => ({
            clearValueObj: jest.fn(),
            updateValueObj: jest.fn(),
            getValue: jest.fn()
        }));
        return <div data-testid="custom-modal" />;
    });
});

jest.mock('../../components/setWalletConfigModal', () => {
    return function MockSetWalletConfigModal() {
        return <div data-testid="set-wallet-config-modal" />;
    };
});

describe('TaskManage regression', () => {
    const TaskManage = require('./index').default;

    beforeEach(() => {
        jest.clearAllMocks();
        window.alert = jest.fn();
        mockApi.getAllTasks
            .mockResolvedValueOnce([
                { taskName: '求职AI助手', taskType: 'ai' },
                { taskName: '普通任务', taskType: 'normal' },
                { taskName: '钱包任务', taskType: 'execByWallet' }
            ])
            .mockResolvedValue([]);
        mockApi.getAllWallets.mockResolvedValue([
            { id: 'w1', name: 'Wallet A', ethAddress: '0xabc', bindEnvId: 'env-1' }
        ]);
        mockApi.getFingerPrints.mockResolvedValue({
            success: true,
            data: {
                'env-1': { id: 'env-1', name: 'Env A' }
            }
        });
        mockApi.execTask.mockResolvedValue({ success: true });
        mockApi.deleteTask.mockResolvedValue({ success: true });
    });

    it('navigates to ai workspace directly when clicking ai task action', async () => {
        render(
            <MemoryRouter>
                <TaskManage />
            </MemoryRouter>
        );

        expect(await screen.findByText('求职AI助手')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '进入AI工作台' }));
        expect(mockNavigate).toHaveBeenCalledWith('/agentWorkspace/%E6%B1%82%E8%81%8CAI%E5%8A%A9%E6%89%8B', expect.objectContaining({
            state: expect.objectContaining({
                taskDisplayName: '求职AI助手'
            })
        }));
    });

    it('starts normal task in env mode with selected env ids', async () => {
        render(
            <MemoryRouter>
                <TaskManage />
            </MemoryRouter>
        );

        expect(await screen.findByText('普通任务')).toBeInTheDocument();
        const startButtons = screen.getAllByRole('button', { name: '启动' });
        fireEvent.click(startButtons[0]);

        const dialog = await screen.findByRole('dialog');
        const envRow = screen.getByText('Env A').closest('.row');
        const envCheckbox = within(envRow).getByRole('checkbox');
        fireEvent.click(envCheckbox);

        await act(async () => {
            fireEvent.click(within(dialog).getByRole('button', { name: '启动' }));
        });

        await waitFor(() => {
            expect(mockApi.execTask).toHaveBeenCalledWith('普通任务', {
                envIds: ['env-1'],
                mode: 'env'
            });
        });
    });

    it('starts normal task in wallet mode with mapped env ids and wallet ids', async () => {
        render(
            <MemoryRouter>
                <TaskManage />
            </MemoryRouter>
        );

        expect(await screen.findByText('普通任务')).toBeInTheDocument();
        const startButtons = screen.getAllByRole('button', { name: '启动' });
        fireEvent.click(startButtons[0]);

        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByLabelText('按钱包'));
        const walletRow = screen.getByText('Wallet A').closest('.row');
        const walletCheckbox = within(walletRow).getByRole('checkbox');
        fireEvent.click(walletCheckbox);

        await act(async () => {
            fireEvent.click(within(dialog).getByRole('button', { name: '启动' }));
        });

        await waitFor(() => {
            expect(mockApi.execTask).toHaveBeenCalledWith('普通任务', {
                envIds: ['env-1'],
                mode: 'wallet',
                walletIds: ['w1']
            });
        });
    });

    it('starts execByWallet task in wallet mode without env mapping', async () => {
        render(
            <MemoryRouter>
                <TaskManage />
            </MemoryRouter>
        );

        expect(await screen.findByText('钱包任务')).toBeInTheDocument();
        const startButtons = screen.getAllByRole('button', { name: '启动' });
        fireEvent.click(startButtons[1]);

        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByLabelText('按钱包'));
        const walletRow = screen.getByText('Wallet A').closest('.row');
        const walletCheckbox = within(walletRow).getByRole('checkbox');
        fireEvent.click(walletCheckbox);

        await act(async () => {
            fireEvent.click(within(dialog).getByRole('button', { name: '启动' }));
        });

        await waitFor(() => {
            expect(mockApi.execTask).toHaveBeenCalledWith('钱包任务', {
                walletIds: ['w1'],
                mode: 'wallet'
            });
        });
    });

    it('deletes selected tasks via api and updates list', async () => {
        render(
            <MemoryRouter>
                <TaskManage />
            </MemoryRouter>
        );

        expect(await screen.findByText('普通任务')).toBeInTheDocument();
        const taskRow = screen.getByText('普通任务').closest('.row');
        fireEvent.click(within(taskRow).getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: '删除任务' }));

        await waitFor(() => expect(mockApi.deleteTask).toHaveBeenCalledWith(['普通任务']));
        expect(window.alert).toHaveBeenCalledWith('删除成功');
    });
});
