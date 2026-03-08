'use strict';

const { buildMessages, callAPI, formatToolsForProvider, extractToolCalls, buildToolResultMessages } = require('./aiClient');

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

    describe('formatToolsForProvider', () => {
        const tools = [
            {
                name: 'http_fetch',
                description: 'Fetch a URL',
                parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }
            }
        ];

        it('formats tools for OpenAI', () => {
            const result = formatToolsForProvider(tools, 'openai');
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('function');
            expect(result[0].function.name).toBe('http_fetch');
            expect(result[0].function.parameters.required).toEqual(['url']);
        });

        it('formats tools for Anthropic', () => {
            const result = formatToolsForProvider(tools, 'anthropic');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('http_fetch');
            expect(result[0].input_schema.required).toEqual(['url']);
        });

        it('formats tools for Google', () => {
            const result = formatToolsForProvider(tools, 'google');
            expect(result).toHaveLength(1);
            expect(result[0].function_declarations).toHaveLength(1);
            expect(result[0].function_declarations[0].name).toBe('http_fetch');
        });

        it('returns empty array for unknown provider', () => {
            expect(formatToolsForProvider(tools, 'unknown')).toEqual([]);
        });
    });

    describe('extractToolCalls', () => {
        it('extracts tool calls from OpenAI response', () => {
            const response = {
                choices: [{
                    message: {
                        content: 'Let me fetch that.',
                        tool_calls: [{
                            id: 'call_123',
                            function: { name: 'http_fetch', arguments: '{"url":"https://example.com"}' }
                        }]
                    },
                    finish_reason: 'tool_calls'
                }]
            };
            const { textContent, toolCalls, stopReason } = extractToolCalls(response, 'openai');
            expect(textContent).toBe('Let me fetch that.');
            expect(toolCalls).toHaveLength(1);
            expect(toolCalls[0].name).toBe('http_fetch');
            expect(toolCalls[0].args.url).toBe('https://example.com');
            expect(stopReason).toBe('tool_calls');
        });

        it('extracts tool calls from Anthropic response', () => {
            const response = {
                content: [
                    { type: 'text', text: 'Fetching...' },
                    { type: 'tool_use', id: 'tu_456', name: 'page_goto', input: { url: 'https://test.com' } }
                ],
                stop_reason: 'tool_use'
            };
            const { textContent, toolCalls, stopReason } = extractToolCalls(response, 'anthropic');
            expect(textContent).toBe('Fetching...');
            expect(toolCalls).toHaveLength(1);
            expect(toolCalls[0].id).toBe('tu_456');
            expect(toolCalls[0].name).toBe('page_goto');
            expect(stopReason).toBe('tool_use');
        });

        it('extracts tool calls from Google response', () => {
            const response = {
                candidates: [{
                    content: {
                        parts: [
                            { text: 'Searching...' },
                            { functionCall: { name: 'job_search', args: { query: 'engineer' } } }
                        ]
                    },
                    finishReason: 'STOP'
                }]
            };
            const { textContent, toolCalls } = extractToolCalls(response, 'google');
            expect(textContent).toBe('Searching...');
            expect(toolCalls).toHaveLength(1);
            expect(toolCalls[0].name).toBe('job_search');
            expect(toolCalls[0].args.query).toBe('engineer');
        });

        it('returns empty tool calls when none present', () => {
            const response = {
                choices: [{
                    message: { content: 'No tools needed.' },
                    finish_reason: 'stop'
                }]
            };
            const { toolCalls } = extractToolCalls(response, 'openai');
            expect(toolCalls).toHaveLength(0);
        });
    });

    describe('buildToolResultMessages', () => {
        const results = [
            { id: 'call_1', name: 'http_fetch', result: { status: 200, body: 'ok' } }
        ];

        it('builds OpenAI tool result messages', () => {
            const msgs = buildToolResultMessages(results, 'openai');
            expect(msgs).toHaveLength(1);
            expect(msgs[0].role).toBe('tool');
            expect(msgs[0].tool_call_id).toBe('call_1');
            expect(JSON.parse(msgs[0].content)).toEqual({ status: 200, body: 'ok' });
        });

        it('builds Anthropic tool result messages', () => {
            const msgs = buildToolResultMessages(results, 'anthropic');
            expect(msgs).toHaveLength(1);
            expect(msgs[0].role).toBe('user');
            expect(msgs[0].content).toHaveLength(1);
            expect(msgs[0].content[0].type).toBe('tool_result');
            expect(msgs[0].content[0].tool_use_id).toBe('call_1');
        });

        it('builds Google function response messages', () => {
            const msgs = buildToolResultMessages(results, 'google');
            expect(msgs).toHaveLength(1);
            expect(msgs[0].role).toBe('function');
            expect(msgs[0].parts[0].functionResponse.name).toBe('http_fetch');
        });
    });
});
