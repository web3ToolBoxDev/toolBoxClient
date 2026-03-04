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
    getFingerPrints: jest.fn(),
    getConfigInfo: jest.fn(),
    setConfigInfo: jest.fn()
};

jest.mock('../../utils/api', () => ({
    __esModule: true,
    default: { getInstance: () => mockApi }
}));

const mockModalValues = { field1: 'testVal', selectField: 'opt1' };

jest.mock('../customModal', () => {
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
            <div data-testid="inner-modal">
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

import SetWalletConfigModal from './index';

describe('SetWalletConfigModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.alert = jest.fn();
        mockApi.getAllWallets.mockResolvedValue([
            { id: 'w1', name: 'Wallet A', ethAddress: '0xaaa' },
            { id: 'w2', name: 'Wallet B', ethAddress: '0xbbb' }
        ]);
        mockApi.getFingerPrints.mockResolvedValue({
            success: true,
            data: { 'e1': { id: 'e1', name: 'Env X' }, 'e2': { id: 'e2', name: 'Env Y' } }
        });
        mockApi.getConfigInfo.mockResolvedValue({
            success: true,
            config: { default: { field1: 'val1' }, walletConfigs: {}, envConfigs: {}, mode: 'wallet' }
        });
        mockApi.setConfigInfo.mockResolvedValue({ success: true });
    });

    it('renders nothing when show is false', () => {
        const { container } = render(
            <SetWalletConfigModal taskName="test" configSchema={{}} show={false} onHide={jest.fn()} confirm={jest.fn()} />
        );
        expect(container.querySelector('.modal.show')).toBeNull();
    });

    it('renders config modal when shown', async () => {
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="test"
                    configSchema={{ field1: { type: 'input', text: 'Field 1' } }}
                    show={true}
                    onHide={jest.fn()}
                    confirm={jest.fn()}
                />
            );
        });
        expect(screen.getByText('配置任务')).toBeInTheDocument();
        expect(screen.getByText('修改通用配置')).toBeInTheDocument();
    });

    it('renders wallet list', async () => {
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="test"
                    configSchema={{ field1: { type: 'input', text: 'F1' } }}
                    show={true}
                    onHide={jest.fn()}
                    confirm={jest.fn()}
                />
            );
        });
        expect(screen.getByText('Wallet A')).toBeInTheDocument();
        expect(screen.getByText('Wallet B')).toBeInTheDocument();
    });

    it('switches to env scope', async () => {
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="test"
                    configSchema={{}}
                    show={true}
                    onHide={jest.fn()}
                    confirm={jest.fn()}
                />
            );
        });
        await act(async () => {
            fireEvent.click(screen.getByText('按环境配置'));
        });
        expect(screen.getByText('Env X')).toBeInTheDocument();
        expect(screen.getByText('Env Y')).toBeInTheDocument();
    });

    it('calls confirm with config', async () => {
        const confirm = jest.fn();
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="test"
                    configSchema={{}}
                    show={true}
                    onHide={jest.fn()}
                    confirm={confirm}
                />
            );
        });
        fireEvent.click(screen.getByText('确认'));
        expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ mode: 'wallet' }));
    });

    it('calls onHide on cancel', async () => {
        const onHide = jest.fn();
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="test"
                    configSchema={{}}
                    show={true}
                    onHide={onHide}
                    confirm={jest.fn()}
                />
            );
        });
        fireEvent.click(screen.getByText('取消'));
        expect(onHide).toHaveBeenCalled();
    });

    it('AI task mode shows only default config', async () => {
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="aiTask"
                    configSchema={{ f1: { type: 'input', text: 'F1' } }}
                    show={true}
                    onHide={jest.fn()}
                    confirm={jest.fn()}
                    isAiTask={true}
                />
            );
        });
        expect(screen.getByText('修改通用配置')).toBeInTheDocument();
        expect(screen.queryByText('按钱包配置')).not.toBeInTheDocument();
    });

    it('AI task confirm sends ai mode', async () => {
        const confirm = jest.fn();
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="aiTask"
                    configSchema={{}}
                    show={true}
                    onHide={jest.fn()}
                    confirm={confirm}
                    isAiTask={true}
                />
            );
        });
        fireEvent.click(screen.getByText('确认'));
        expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ mode: 'ai' }));
    });

    it('clears wallet configs', async () => {
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="test"
                    configSchema={{}}
                    show={true}
                    onHide={jest.fn()}
                    confirm={jest.fn()}
                />
            );
        });
        await act(async () => {
            fireEvent.click(screen.getByText('清除钱包配置'));
        });
        expect(mockApi.setConfigInfo).toHaveBeenCalled();
    });

    it('clears env configs in env mode', async () => {
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="test"
                    configSchema={{}}
                    show={true}
                    onHide={jest.fn()}
                    confirm={jest.fn()}
                />
            );
        });
        await act(async () => {
            fireEvent.click(screen.getByText('按环境配置'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('清除环境配置'));
        });
        expect(mockApi.setConfigInfo).toHaveBeenCalled();
    });

    // --- setConfigProp ---
    it('edit default config opens inner modal with input fields', async () => {
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="test"
                    configSchema={{ field1: { type: 'input', text: 'Field One' } }}
                    show={true}
                    onHide={jest.fn()}
                    confirm={jest.fn()}
                />
            );
        });
        await act(async () => {
            fireEvent.click(screen.getByText('修改通用配置'));
        });
        expect(screen.getByTestId('inner-modal')).toBeInTheDocument();
    });

    it('edit default config confirm button updates config', async () => {
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="test"
                    configSchema={{ field1: { type: 'input', text: 'Field One' } }}
                    show={true}
                    onHide={jest.fn()}
                    confirm={jest.fn()}
                />
            );
        });
        await act(async () => {
            fireEvent.click(screen.getByText('修改通用配置'));
        });
        // Click confirm button inside inner modal
        const innerModal = screen.getByTestId('inner-modal');
        await act(async () => {
            fireEvent.click(within(innerModal).getByText('确认'));
        });
    });

    it('edit wallet-specific config', async () => {
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="test"
                    configSchema={{ field1: { type: 'input', text: 'F1' } }}
                    show={true}
                    onHide={jest.fn()}
                    confirm={jest.fn()}
                />
            );
        });
        // Click edit config button for first wallet
        const editButtons = screen.getAllByText('修改配置');
        await act(async () => {
            fireEvent.click(editButtons[0]);
        });
        expect(screen.getByTestId('inner-modal')).toBeInTheDocument();
    });

    it('edit config with select type schema', async () => {
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="test"
                    configSchema={{
                        selectField: {
                            type: 'select',
                            text: 'Choose',
                            options: [{ value: 'opt1', text: 'Option 1' }],
                            defaultValue: 'opt1'
                        }
                    }}
                    show={true}
                    onHide={jest.fn()}
                    confirm={jest.fn()}
                />
            );
        });
        await act(async () => {
            fireEvent.click(screen.getByText('修改通用配置'));
        });
        expect(screen.getByTestId('inner-modal')).toBeInTheDocument();
    });

    it('AI task edit default config', async () => {
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="aiTask"
                    configSchema={{ f1: { type: 'input', text: 'F1' } }}
                    show={true}
                    onHide={jest.fn()}
                    confirm={jest.fn()}
                    isAiTask={true}
                />
            );
        });
        await act(async () => {
            fireEvent.click(screen.getByText('修改通用配置'));
        });
        expect(screen.getByTestId('inner-modal')).toBeInTheDocument();
    });

    // --- normalizeConfig edge cases ---
    it('handles config with flat keys outside known keys', async () => {
        mockApi.getConfigInfo.mockResolvedValue({
            success: true,
            config: { customKey: { nested: true }, flatKey: 'value' }
        });
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="test"
                    configSchema={{}}
                    show={true}
                    onHide={jest.fn()}
                    confirm={jest.fn()}
                />
            );
        });
        expect(screen.getByText('配置任务')).toBeInTheDocument();
    });

    it('handles empty config response', async () => {
        mockApi.getConfigInfo.mockResolvedValue({ success: true, config: {} });
        await act(async () => {
            render(
                <SetWalletConfigModal
                    taskName="test"
                    configSchema={{}}
                    show={true}
                    onHide={jest.fn()}
                    confirm={jest.fn()}
                />
            );
        });
        expect(screen.getByText('配置任务')).toBeInTheDocument();
    });
});
