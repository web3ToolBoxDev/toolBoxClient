'use strict';

const { buildMessages, callAPI } = require('./aiClient');

// Mock the httpRequest function
jest.mock('./aiClient', () => {
    const actual = jest.requireActual('./aiClient');
    return {
        ...actual,
        httpRequest: jest.fn()
    };
});

describe('aiClient', () => {
    describe('buildMessages', () => {
        it('builds messages with system prompt', () => {
            const history = [
                { role: 'user', text: 'Hello' },
                { role: 'assistant', text: 'Hi there' },
                { role: 'user', text: 'How are you?' }
            ];
            const result = buildMessages(history, 'You are helpful.');
            expect(result).toEqual([
                { role: 'system', content: 'You are helpful.' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there' },
                { role: 'user', content: 'How are you?' }
            ]);
        });

        it('builds messages without system prompt', () => {
            const history = [{ role: 'user', text: 'Hello' }];
            const result = buildMessages(history, null);
            expect(result).toEqual([
                { role: 'user', content: 'Hello' }
            ]);
        });

        it('filters out non-user/assistant roles', () => {
            const history = [
                { role: 'system', text: 'ignored' },
                { role: 'user', text: 'Hello' },
                { role: 'tool', text: 'ignored' },
                { role: 'assistant', text: 'Hi' }
            ];
            const result = buildMessages(history, null);
            expect(result).toEqual([
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi' }
            ]);
        });

        it('handles empty history', () => {
            expect(buildMessages([], 'sys')).toEqual([
                { role: 'system', content: 'sys' }
            ]);
        });

        it('uses content field as fallback', () => {
            const history = [{ role: 'user', content: 'from content field' }];
            const result = buildMessages(history, null);
            expect(result).toEqual([
                { role: 'user', content: 'from content field' }
            ]);
        });
    });

    describe('callAPI', () => {
        it('throws for unsupported sub-provider', async () => {
            await expect(callAPI({
                subProvider: 'unknown',
                apiKey: 'key',
                model: 'model',
                conversationHistory: []
            })).rejects.toThrow('Unsupported sub-provider: unknown');
        });
    });
});
