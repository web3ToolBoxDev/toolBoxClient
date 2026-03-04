import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { eventEmitter } from '../../utils/eventEmitter';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key })
}));

const mockApi = {
    getTaskStatus: jest.fn().mockResolvedValue({ success: true, data: {} }),
    getAllTasks: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
};

jest.mock('../../utils/api', () => ({
    __esModule: true,
    default: {
        getInstance: () => mockApi
    }
}));

const mockWsManager = {
    wss: null,
    connect: jest.fn(),
    sendMessage: jest.fn(),
    getQueueLength: jest.fn(() => 0),
    popFromQueue: jest.fn(() => null)
};

jest.mock('../../utils/webSocket', () => ({
    __esModule: true,
    default: {
        getInstance: () => mockWsManager
    }
}));

describe('TaskOffcanvas regression', () => {
    let TaskOffcanvas;

    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        if (typeof window !== 'undefined') {
            window.matchMedia = window.matchMedia || (() => ({
                matches: false,
                media: '',
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => false
            }));
        }
        mockWsManager.connect.mockImplementation(async (messageCallback) => {
            mockWsManager._callback = messageCallback;
            return true;
        });
        TaskOffcanvas = require('./index').default;
    });

    it('renders normal task logs from websocket messages', async () => {
        await act(async () => {
            render(
                <MemoryRouter>
                    <TaskOffcanvas show={true} handleClose={() => {}} />
                </MemoryRouter>
            );
        });

        await waitFor(() => expect(mockWsManager.connect).toHaveBeenCalled());
        await waitFor(() => expect(mockApi.getAllTasks).toHaveBeenCalledTimes(2));

        act(() => {
            mockWsManager._callback({ type: 'task_started', taskName: 'demoTask', time: '2026/2/26 00:00:00' });
            mockWsManager._callback({ type: 'task_log', taskName: 'demoTask', message: 'Task:demoTask hello', time: '2026/2/26 00:00:01' });
        });

        expect(await screen.findByText('demoTask')).toBeInTheDocument();
        expect(await screen.findByText('hello')).toBeInTheDocument();
    });

    it('seeds client started log on taskStart event for normal task', async () => {
        await act(async () => {
            render(
                <MemoryRouter>
                    <TaskOffcanvas show={true} handleClose={() => {}} />
                </MemoryRouter>
            );
        });

        await waitFor(() => expect(mockWsManager.connect).toHaveBeenCalled());

        act(() => {
            eventEmitter.emit('taskStart', {
                taskName: 'Sample Task',
                taskData: { envIds: ['env-1'], mode: 'env' }
            });
        });

        expect(await screen.findByText('env-1_Sample Task')).toBeInTheDocument();
        expect(await screen.findByText('started (client)')).toBeInTheDocument();
    });
});
