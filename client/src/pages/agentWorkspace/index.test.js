import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AgentWorkspace from './index';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key, fallback) => fallback || key })
}));

const mockApi = {
    execTask: jest.fn().mockResolvedValue({ success: true }),
    getConfigInfo: jest.fn().mockResolvedValue({
        config: {
            default: {
                apiKey: 'test-key',
                model: 'gpt-4o-mini',
                availableModels: ['gpt-4o-mini', 'gpt-4.1-mini']
            }
        }
    }),
    getAllWallets: jest.fn().mockResolvedValue([{ id: 'w1', name: 'Wallet A', bindEnvId: 'env-1' }]),
    getFingerPrints: jest.fn().mockResolvedValue({ success: true, data: { 'env-1': { id: 'env-1', name: 'Env A' } } })
};

jest.mock('../../utils/api', () => ({
    __esModule: true,
    default: {
        getInstance: () => mockApi
    }
}));

const mockMessageListeners = new Set();
const mockCloseListeners = new Set();
const mockWsManager = {
    connect: jest.fn().mockImplementation(async (messageCallback) => {
        mockWsManager._connectMessageCallback = messageCallback;
        return true;
    }),
    sendMessage: jest.fn(),
    addMessageListener: jest.fn((listener) => {
        mockMessageListeners.add(listener);
    }),
    removeMessageListener: jest.fn((listener) => {
        mockMessageListeners.delete(listener);
    }),
    addCloseListener: jest.fn((listener) => {
        mockCloseListeners.add(listener);
    }),
    removeCloseListener: jest.fn((listener) => {
        mockCloseListeners.delete(listener);
    })
};

jest.mock('../../utils/webSocket', () => ({
    __esModule: true,
    default: {
        getInstance: () => mockWsManager
    }
}));

jest.mock('../../components/taskOffcanvas/AITaskPanel', () => {
    return function MockAITaskPanel(props) {
        return (
            <div data-testid="ai-panel">
                <div data-testid="panel-task">{props.activeTask?.displayName || ''}</div>
                <div data-testid="panel-message-count">{(props.messages || []).length}</div>
                <button type="button" onClick={() => props.onSendMessage && props.onSendMessage('mock input')}>
                    mock-send
                </button>
                <button
                    type="button"
                    onClick={() => props.onSelectOption && props.onSelectOption({ id: 'opt-1', label: '后端工程师' })}
                >
                    mock-option
                </button>
                <button
                    type="button"
                    onClick={() =>
                        props.onSendAttachments &&
                        props.onSendAttachments([
                            {
                                id: 'att-1',
                                name: 'resume.pdf',
                                mimeType: 'application/pdf',
                                size: 1024,
                                source: 'upload',
                                contentBase64: 'dGVzdA=='
                            }
                        ])
                    }
                >
                    mock-attachment
                </button>
                <button
                    type="button"
                    onClick={() =>
                        props.onSendAttachments &&
                        props.onSendAttachments({
                            attachments: [],
                            rejected: [{ name: 'large.mov', reason: 'size', size: 10500000, source: 'upload' }]
                        })
                    }
                >
                    mock-attachment-rejected
                </button>
                <button
                    type="button"
                    onClick={() =>
                        props.onSubmitAnswer &&
                        props.onSubmitAnswer({
                            questionId: 'q_salary',
                            questionText: 'Input target monthly salary (K)',
                            answer: '30'
                        })
                    }
                >
                    mock-answer
                </button>
            </div>
        );
    };
});

describe('AgentWorkspace protocol regression', () => {
    const expectSent = (predicate) => {
        const matched = mockWsManager.sendMessage.mock.calls.some(([raw]) => {
            try {
                return predicate(JSON.parse(raw));
            } catch (error) {
                return false;
            }
        });
        expect(matched).toBe(true);
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockMessageListeners.clear();
        mockCloseListeners.clear();
        mockWsManager._connectMessageCallback = null;
        window.alert = jest.fn();
        mockApi.execTask.mockResolvedValue({ success: true });
        mockApi.getConfigInfo.mockResolvedValue({
            config: {
                default: {
                    apiKey: 'test-key',
                    model: 'gpt-4o-mini',
                    availableModels: ['gpt-4o-mini', 'gpt-4.1-mini']
                }
            }
        });
        mockApi.getAllWallets.mockResolvedValue([{ id: 'w1', name: 'Wallet A', bindEnvId: 'env-1' }]);
        mockApi.getFingerPrints.mockResolvedValue({ success: true, data: { 'env-1': { id: 'env-1', name: 'Env A' } } });
    });

    it('handles agent messages and sends user actions through websocket', async () => {
        render(
            <MemoryRouter initialEntries={['/agentWorkspace/%E6%B1%82%E8%81%8CAI%E5%8A%A9%E6%89%8B']}>
                <Routes>
                    <Route path="/agentWorkspace/:taskName" element={<AgentWorkspace />} />
                    <Route path="/taskManage" element={<div data-testid="task-manage-page">task-manage</div>} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => expect(mockWsManager.connect).toHaveBeenCalled());
        await waitFor(() => expect(mockWsManager.addMessageListener).toHaveBeenCalled());
        await waitFor(() => expect(mockApi.execTask).toHaveBeenCalledWith('求职AI助手', { mode: 'ai', _suppressRunningAlert: true }));
        expect(mockApi.getConfigInfo).toHaveBeenCalledWith('求职AI助手');

        await waitFor(() => {
            expectSent((msg) => (
                msg.type === 'agent_init'
                && msg.taskName === '求职AI助手'
                && msg.payload?.language === 'en'
                && msg.payload?.apiKeyConfigured === true
            ));
        });

        const listener = mockWsManager.addMessageListener.mock.calls[0][0];
        act(() => {
            listener({
                type: 'agent_state_snapshot',
                taskName: '求职AI助手',
                data: {
                    sessions: [{ id: 's1', name: '后端方向', updatedAt: Date.now() }],
                    activeSessionId: 's1',
                    conversations: {
                        s1: [{ id: 'm1', role: 'assistant', content: '你好', createdAt: Date.now() }]
                    },
                    subtasks: {},
                    artifacts: {},
                    prompts: {}
                }
            });
        });

        expect(await screen.findByTestId('panel-task')).toHaveTextContent('后端方向');
        expect(await screen.findByTestId('panel-message-count')).toHaveTextContent('1');

        fireEvent.change(screen.getByPlaceholderText('New Session (Optional)'), {
            target: { value: '前端方向' }
        });
        fireEvent.click(screen.getByText('+ New'));
        expectSent((msg) => (
            msg.type === 'agent_session_create'
            && msg.taskName === '求职AI助手'
            && msg.payload?.name === '前端方向'
            && msg.payload?.language === 'en'
            && msg.payload?.apiKeyConfigured === true
            && msg.payload?.model === 'gpt-4o-mini'
        ));

        fireEvent.click(screen.getByText('mock-send'));
        await waitFor(() => {
            expectSent((msg) => (
                msg.type === 'agent_user_input'
                && msg.taskName === '求职AI助手'
                && msg.payload?.sessionId === 's1'
                && msg.payload?.text === 'mock input'
                && msg.payload?.runtimeContext === null
                && msg.payload?.language === 'en'
                && msg.payload?.apiKeyConfigured === true
                && msg.payload?.model === 'gpt-4o-mini'
            ));
        });

        fireEvent.click(screen.getByText('mock-option'));
        await waitFor(() => {
            expectSent((msg) => (
                msg.type === 'agent_user_option'
                && msg.taskName === '求职AI助手'
                && msg.payload?.sessionId === 's1'
                && msg.payload?.optionId === 'opt-1'
                && msg.payload?.optionLabel === '后端工程师'
                && msg.payload?.runtimeContext === null
                && msg.payload?.language === 'en'
                && msg.payload?.apiKeyConfigured === true
                && msg.payload?.model === 'gpt-4o-mini'
            ));
        });

        fireEvent.click(screen.getByText('mock-attachment'));
        await waitFor(() => {
            expectSent((msg) => (
                msg.type === 'agent_user_attachment'
                && msg.taskName === '求职AI助手'
                && msg.payload?.sessionId === 's1'
                && Array.isArray(msg.payload?.attachments)
                && msg.payload.attachments.length === 1
                && msg.payload.attachments[0]?.name === 'resume.pdf'
                && Array.isArray(msg.payload?.rejected)
                && msg.payload.rejected.length === 0
                && msg.payload?.runtimeContext === null
                && msg.payload?.language === 'en'
                && msg.payload?.apiKeyConfigured === true
                && msg.payload?.model === 'gpt-4o-mini'
            ));
        });

        fireEvent.click(screen.getByText('mock-attachment-rejected'));
        await waitFor(() => {
            expectSent((msg) => (
                msg.type === 'agent_user_attachment'
                && msg.taskName === '求职AI助手'
                && msg.payload?.sessionId === 's1'
                && Array.isArray(msg.payload?.attachments)
                && msg.payload.attachments.length === 0
                && Array.isArray(msg.payload?.rejected)
                && msg.payload.rejected.length === 1
                && msg.payload.rejected[0]?.name === 'large.mov'
                && msg.payload?.runtimeContext === null
                && msg.payload?.language === 'en'
                && msg.payload?.apiKeyConfigured === true
                && msg.payload?.model === 'gpt-4o-mini'
            ));
        });

        fireEvent.click(screen.getByText('mock-answer'));
        await waitFor(() => {
            expectSent((msg) => (
                msg.type === 'agent_user_answer'
                && msg.taskName === '求职AI助手'
                && msg.payload?.sessionId === 's1'
                && msg.payload?.questionId === 'q_salary'
                && msg.payload?.answer === '30'
                && msg.payload?.runtimeContext === null
                && msg.payload?.language === 'en'
                && msg.payload?.apiKeyConfigured === true
                && msg.payload?.model === 'gpt-4o-mini'
            ));
        });

        fireEvent.click(screen.getByLabelText('toggle-runtime-settings'));
        fireEvent.change(screen.getByLabelText('session-bind-mode'), { target: { value: 'env' } });
        fireEvent.change(screen.getByLabelText('session-bind-env'), { target: { value: 'env-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Bind To Current Session' }));
        await waitFor(() => {
            expectSent((msg) => (
                msg.type === 'agent_session_context_update'
                && msg.taskName === '求职AI助手'
                && msg.payload?.sessionId === 's1'
                && msg.payload?.runtimeContext?.mode === 'env'
                && JSON.stringify(msg.payload?.runtimeContext?.walletIds || []) === JSON.stringify([])
                && JSON.stringify(msg.payload?.runtimeContext?.envIds || []) === JSON.stringify(['env-1'])
                && msg.payload?.language === 'en'
                && msg.payload?.apiKeyConfigured === true
                && msg.payload?.model === 'gpt-4o-mini'
            ));
        });

        fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
        await waitFor(() => {
            expectSent((msg) => (
                msg.type === 'agent_execution_control'
                && msg.taskName === '求职AI助手'
                && msg.payload?.sessionId === 's1'
                && msg.payload?.action === 'pause'
                && msg.payload?.language === 'en'
                && msg.payload?.apiKeyConfigured === true
                && msg.payload?.model === 'gpt-4o-mini'
            ));
        });
    });

    it('starts ai task with runtime context from route state', async () => {
        render(
            <MemoryRouter
                initialEntries={[
                    {
                        pathname: '/agentWorkspace/%E6%B1%82%E8%81%8CAI%E5%8A%A9%E6%89%8B',
                        state: { runtimeContext: { mode: 'wallet', walletIds: ['w1'], envIds: ['env-1'] } }
                    }
                ]}
            >
                <Routes>
                    <Route path="/agentWorkspace/:taskName" element={<AgentWorkspace />} />
                    <Route path="/taskManage" element={<div data-testid="task-manage-page">task-manage</div>} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => expect(mockWsManager.connect).toHaveBeenCalled());
        await waitFor(() =>
            expect(mockApi.execTask).toHaveBeenCalledWith('求职AI助手', {
                mode: 'ai',
                runtimeContext: { mode: 'wallet', walletIds: ['w1'], envIds: ['env-1'] },
                _suppressRunningAlert: true
            })
        );
    });

    it('navigates back to task manage when ai task stops', async () => {
        render(
            <MemoryRouter initialEntries={['/agentWorkspace/%E6%B1%82%E8%81%8CAI%E5%8A%A9%E6%89%8B']}>
                <Routes>
                    <Route path="/agentWorkspace/:taskName" element={<AgentWorkspace />} />
                    <Route path="/taskManage" element={<div data-testid="task-manage-page">task-manage</div>} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => expect(mockWsManager.connect).toHaveBeenCalled());
        const listener = mockWsManager.addMessageListener.mock.calls[0][0];
        act(() => {
            listener({
                type: 'task_completed',
                taskName: '求职AI助手',
                message: 'AI task stopped'
            });
        });

        await waitFor(() => expect(window.alert).toHaveBeenCalledWith('AI task stopped'));
        expect(await screen.findByTestId('task-manage-page')).toBeInTheDocument();
    });
});
