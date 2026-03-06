import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AITaskPanel from './AITaskPanel';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key, fallback) => fallback || key })
}));

describe('AITaskPanel structured prompt regression', () => {
    it('auto scrolls chat area to bottom when new message arrives', async () => {
        const scrollToMock = jest.fn();
        const originalScrollTo = HTMLElement.prototype.scrollTo;
        HTMLElement.prototype.scrollTo = scrollToMock;
        try {
            const { rerender, container } = render(
                <AITaskPanel
                    activeTask={{ displayName: 'AI Task' }}
                    messages={[
                        { id: 'm1', role: 'assistant', content: 'hello', createdAt: 1 }
                    ]}
                    prompt={null}
                    subTasks={[]}
                    artifacts={[]}
                    onSendMessage={jest.fn()}
                    onSelectOption={jest.fn()}
                    onSubmitAnswer={jest.fn()}
                    onSendAttachments={jest.fn()}
                    onOpenArtifact={jest.fn()}
                />
            );

            const chatContent = container.querySelector('.ai-chat-content');
            Object.defineProperty(chatContent, 'scrollHeight', { value: 300, configurable: true });

            rerender(
                <AITaskPanel
                    activeTask={{ displayName: 'AI Task' }}
                    messages={[
                        { id: 'm1', role: 'assistant', content: 'hello', createdAt: 1 },
                        { id: 'm2', role: 'assistant', content: 'new', createdAt: 2 }
                    ]}
                    prompt={null}
                    subTasks={[]}
                    artifacts={[]}
                    onSendMessage={jest.fn()}
                    onSelectOption={jest.fn()}
                    onSubmitAnswer={jest.fn()}
                    onSendAttachments={jest.fn()}
                    onOpenArtifact={jest.fn()}
                />
            );

            await waitFor(() => {
                expect(scrollToMock).toHaveBeenCalledWith({ top: 300, behavior: 'auto' });
            });
        } finally {
            HTMLElement.prototype.scrollTo = originalScrollTo;
        }
    });

    it('supports both option question and input question submission', () => {
        const onSelectOption = jest.fn();
        const onSubmitAnswer = jest.fn();

        const { container } = render(
            <AITaskPanel
                activeTask={{ displayName: 'AI Task' }}
                messages={[]}
                prompt={{
                    text: 'Select and fill',
                    questions: [
                        {
                            id: 'q_track',
                            text: 'Choose track',
                            options: [
                                { id: 'backend', label: 'Backend' }
                            ],
                            selectedOptionId: ''
                        },
                        {
                            id: 'q_salary',
                            type: 'input',
                            inputType: 'number',
                            text: 'Input salary',
                            placeholder: 'e.g. 30',
                            answerValue: ''
                        }
                    ]
                }}
                subTasks={[]}
                artifacts={[]}
                onSendMessage={jest.fn()}
                onSelectOption={onSelectOption}
                onSubmitAnswer={onSubmitAnswer}
                onSendAttachments={jest.fn()}
                onOpenArtifact={jest.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /\(2\)/ }));

        fireEvent.click(screen.getByRole('button', { name: 'Backend' }));
        expect(onSelectOption).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'backend',
                questionId: 'q_track',
                questionText: 'Choose track'
            })
        );

        fireEvent.click(screen.getByRole('button', { name: /Input/i }));
        const input = screen.getByPlaceholderText('e.g. 30');
        fireEvent.change(input, { target: { value: '30' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

        expect(onSubmitAnswer).toHaveBeenCalledWith({
            questionId: 'q_salary',
            questionText: 'Input salary',
            answer: '30'
        });
    });

    it('supports inline options inside conversation message', () => {
        const onSelectOption = jest.fn();

        const { container } = render(
            <AITaskPanel
                activeTask={{ displayName: 'AI Task' }}
                messages={[
                    {
                        id: 'm1',
                        role: 'assistant',
                        content: 'Choose execution mode',
                        questionId: 'q_exec_mode',
                        questionText: 'Choose execution mode',
                        options: [
                            { id: 'immediate', label: 'Run now' },
                            { id: 'scheduled', label: 'Schedule later' }
                        ],
                        createdAt: Date.now()
                    }
                ]}
                prompt={null}
                subTasks={[]}
                artifacts={[]}
                onSendMessage={jest.fn()}
                onSelectOption={onSelectOption}
                onSubmitAnswer={jest.fn()}
                onSendAttachments={jest.fn()}
                onOpenArtifact={jest.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Run now' }));

        expect(onSelectOption).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'immediate',
                questionId: 'q_exec_mode',
                questionText: 'Choose execution mode'
            })
        );
    });

    it('renders attachment chips from structured conversation message', () => {
        const { container } = render(
            <AITaskPanel
                activeTask={{ displayName: 'AI Task' }}
                messages={[
                    {
                        id: 'm2',
                        role: 'assistant',
                        content: '[attachment] uploaded files',
                        createdAt: Date.now(),
                        attachments: [
                            { name: 'resume.pdf', mimeType: 'application/pdf', size: 1234, contentBase64: 'ZGF0YQ==' },
                            { name: 'profile.png', mimeType: 'image/png', size: 2234, contentBase64: 'ZGF0YQ==' }
                        ]
                    }
                ]}
                prompt={null}
                subTasks={[]}
                artifacts={[]}
                onSendMessage={jest.fn()}
                onSelectOption={jest.fn()}
                onSubmitAnswer={jest.fn()}
                onSendAttachments={jest.fn()}
                onOpenArtifact={jest.fn()}
            />
        );

        expect(screen.getByText('resume.pdf')).toBeInTheDocument();
        expect(screen.getByText('profile.png')).toBeInTheDocument();
    });

    it('shows attachment policy summary from prompt', () => {
        const { container } = render(
            <AITaskPanel
                activeTask={{ displayName: 'AI Task' }}
                messages={[]}
                prompt={{
                    text: 'Prompt',
                    attachmentPolicy: {
                        maxSizeMB: 6,
                        allowedKinds: ['image', 'pdf']
                    },
                    questions: []
                }}
                subTasks={[]}
                artifacts={[]}
                onSendMessage={jest.fn()}
                onSelectOption={jest.fn()}
                onSubmitAnswer={jest.fn()}
                onSendAttachments={jest.fn()}
                onOpenArtifact={jest.fn()}
            />
        );

        expect(screen.getByText(/Attachment Policy/i)).toBeInTheDocument();
        expect(screen.getByText(/Max size/i)).toBeInTheDocument();
        expect(screen.getByText(/Allowed/i)).toBeInTheDocument();
        expect(screen.getByText(/Image, PDF/i)).toBeInTheDocument();
    });

    it('can clear rejected attachments list', async () => {
        const { container } = render(
            <AITaskPanel
                activeTask={{ displayName: 'AI Task' }}
                messages={[]}
                prompt={{
                    text: 'Prompt',
                    attachmentPolicy: {
                        maxSizeMB: 1,
                        allowedKinds: ['image']
                    },
                    questions: []
                }}
                subTasks={[]}
                artifacts={[]}
                onSendMessage={jest.fn()}
                onSelectOption={jest.fn()}
                onSubmitAnswer={jest.fn()}
                onSendAttachments={jest.fn()}
                onOpenArtifact={jest.fn()}
            />
        );

        const bigFile = new File([new Uint8Array(2 * 1024 * 1024)], 'large.bin', { type: 'application/octet-stream' });
        const fileInput = container.querySelector('input[type="file"]');
        fireEvent.change(fileInput, { target: { files: [bigFile] } });

        expect(await screen.findByText(/Rejected Attachments/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Clear Rejected/i }));
        expect(screen.queryByText(/Rejected Attachments/i)).not.toBeInTheDocument();
    });

    it('renders subtask cards with correct status badges', () => {
        render(
            <AITaskPanel
                activeTask={{ displayName: 'AI Task' }}
                messages={[]}
                prompt={null}
                subTasks={[
                    { key: 'onboarding', status: 'pending', updatedAt: 1 },
                    { key: 'profile', status: 'running', updatedAt: 2 },
                    { key: 'search', status: 'done', updatedAt: 3 }
                ]}
                subtaskLogs={{}}
                artifacts={[]}
                runtimeLogs={[]}
                onSendMessage={jest.fn()}
                onSelectOption={jest.fn()}
                onSubmitAnswer={jest.fn()}
                onSendAttachments={jest.fn()}
                onOpenArtifact={jest.fn()}
            />
        );

        expect(screen.getByText('AI Subtasks')).toBeInTheDocument();
        // Subtask cards render — find by class + check disabled state
        const buttons = document.querySelectorAll('.ai-subtask-card');
        expect(buttons.length).toBe(3);
        // Pending subtask button should be disabled
        expect(buttons[0]).toBeDisabled();
        expect(buttons[0].className).toContain('pending');
        // Running subtask button should be enabled
        expect(buttons[1]).not.toBeDisabled();
        expect(buttons[1].className).toContain('running');
        // Done subtask button should be enabled
        expect(buttons[2]).not.toBeDisabled();
        expect(buttons[2].className).toContain('done');
    });

    it('supports upload question and dispatches attachments with question context', async () => {
        const onSendAttachments = jest.fn();
        const originalFileReader = global.FileReader;
        class MockFileReader {
            readAsDataURL() {
                this.result = 'data:text/plain;base64,YWJj';
                if (typeof this.onload === 'function') {
                    this.onload();
                }
            }
        }
        global.FileReader = MockFileReader;

        const { container } = render(
            <AITaskPanel
                activeTask={{ displayName: 'AI Task' }}
                messages={[]}
                prompt={{
                    text: 'Upload first',
                    questions: [
                        {
                            id: 'q_upload_profile',
                            type: 'upload',
                            text: 'Upload resume',
                            buttonLabel: 'Upload Resume',
                            allowMultiple: false
                        }
                    ]
                }}
                subTasks={[]}
                artifacts={[]}
                onSendMessage={jest.fn()}
                onSelectOption={jest.fn()}
                onSubmitAnswer={jest.fn()}
                onSendAttachments={onSendAttachments}
                onOpenArtifact={jest.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /\(1\)/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Upload Resume' }));

        const fileInputs = container.querySelectorAll('input[type="file"]');
        const testFile = new File(['abc'], 'resume.txt', { type: 'text/plain' });
        fireEvent.change(fileInputs[1], { target: { files: [testFile] } });

        await waitFor(() => {
            expect(onSendAttachments).toHaveBeenCalledWith(
                expect.objectContaining({
                    attachments: [
                        expect.objectContaining({
                            questionId: 'q_upload_profile',
                            questionText: 'Upload resume'
                        })
                    ]
                })
            );
        });

        global.FileReader = originalFileReader;
    });

    it('supports inline upload request message in conversation', async () => {
        const onSendAttachments = jest.fn();
        const originalFileReader = global.FileReader;
        class MockFileReader {
            readAsDataURL() {
                this.result = 'data:text/plain;base64,YWJj';
                if (typeof this.onload === 'function') this.onload();
            }
        }
        global.FileReader = MockFileReader;

        const { container } = render(
            <AITaskPanel
                activeTask={{ displayName: 'AI Task' }}
                messages={[
                    {
                        id: 'm-upload-1',
                        role: 'assistant',
                        content: 'Upload your source resume',
                        createdAt: Date.now(),
                        questionType: 'upload',
                        questionId: 'inline_upload_resume',
                        questionText: 'Upload source resume',
                        buttonLabel: 'Upload Resume File',
                        allowMultiple: false
                    }
                ]}
                prompt={null}
                subTasks={[]}
                artifacts={[]}
                onSendMessage={jest.fn()}
                onSelectOption={jest.fn()}
                onSubmitAnswer={jest.fn()}
                onSendAttachments={onSendAttachments}
                onOpenArtifact={jest.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Upload Resume File' }));
        const fileInputs = container.querySelectorAll('input[type="file"]');
        const testFile = new File(['abc'], 'resume.txt', { type: 'text/plain' });
        fireEvent.change(fileInputs[fileInputs.length - 1], { target: { files: [testFile] } });

        await waitFor(() => {
            expect(onSendAttachments).toHaveBeenCalledWith(
                expect.objectContaining({
                    questionId: 'inline_upload_resume',
                    questionText: 'Upload source resume',
                    attachments: [
                        expect.objectContaining({
                            questionId: 'inline_upload_resume'
                        })
                    ]
                })
            );
        });

        global.FileReader = originalFileReader;
    });

    it('supports paste-mode upload question and auto dispatches with question context', async () => {
        const onSendAttachments = jest.fn();
        const originalFileReader = global.FileReader;
        class MockFileReader {
            readAsDataURL() {
                this.result = 'data:text/plain;base64,YWJj';
                if (typeof this.onload === 'function') this.onload();
            }
        }
        global.FileReader = MockFileReader;

        const { container } = render(
            <AITaskPanel
                activeTask={{ displayName: 'AI Task' }}
                messages={[]}
                prompt={{
                    text: 'Upload first',
                    questions: [
                        {
                            id: 'q_upload_profile',
                            type: 'upload',
                            text: 'Upload resume',
                            uploadMode: 'paste'
                        }
                    ]
                }}
                subTasks={[]}
                artifacts={[]}
                onSendMessage={jest.fn()}
                onSelectOption={jest.fn()}
                onSubmitAnswer={jest.fn()}
                onSendAttachments={onSendAttachments}
                onOpenArtifact={jest.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /\(1\)/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Paste File' }));

        const input = container.querySelector('.ai-chat-input .form-control');
        expect(input).toBeInTheDocument();
        const testFile = new File(['abc'], 'resume.txt', { type: 'text/plain' });
        fireEvent.paste(input, {
            clipboardData: {
                items: [{ kind: 'file', getAsFile: () => testFile }]
            }
        });

        await waitFor(() => {
            expect(onSendAttachments).toHaveBeenCalledWith(
                expect.objectContaining({
                    questionId: 'q_upload_profile',
                    questionText: 'Upload resume',
                    attachments: [
                        expect.objectContaining({
                            source: 'paste-question',
                            questionId: 'q_upload_profile'
                        })
                    ]
                })
            );
        });

        global.FileReader = originalFileReader;
    });

    it('supports paste-mode inline upload message and auto dispatches with question context', async () => {
        const onSendAttachments = jest.fn();
        const originalFileReader = global.FileReader;
        class MockFileReader {
            readAsDataURL() {
                this.result = 'data:text/plain;base64,YWJj';
                if (typeof this.onload === 'function') this.onload();
            }
        }
        global.FileReader = MockFileReader;

        const { container } = render(
            <AITaskPanel
                activeTask={{ displayName: 'AI Task' }}
                messages={[
                    {
                        id: 'm-upload-paste',
                        role: 'assistant',
                        content: 'Please paste your resume file',
                        createdAt: Date.now(),
                        questionType: 'upload',
                        questionId: 'inline_upload_resume',
                        questionText: 'Upload source resume',
                        uploadMode: 'paste'
                    }
                ]}
                prompt={null}
                subTasks={[]}
                artifacts={[]}
                onSendMessage={jest.fn()}
                onSelectOption={jest.fn()}
                onSubmitAnswer={jest.fn()}
                onSendAttachments={onSendAttachments}
                onOpenArtifact={jest.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Paste File' }));

        const input = container.querySelector('.ai-chat-input .form-control');
        expect(input).toBeInTheDocument();
        const testFile = new File(['abc'], 'resume.txt', { type: 'text/plain' });
        fireEvent.paste(input, {
            clipboardData: {
                items: [{ kind: 'file', getAsFile: () => testFile }]
            }
        });

        await waitFor(() => {
            expect(onSendAttachments).toHaveBeenCalledWith(
                expect.objectContaining({
                    questionId: 'inline_upload_resume',
                    questionText: 'Upload source resume',
                    attachments: [
                        expect.objectContaining({
                            source: 'paste-question',
                            questionId: 'inline_upload_resume'
                        })
                    ]
                })
            );
        });

        global.FileReader = originalFileReader;
    });
});
