'use strict';

const toolRouter = require('./toolRouter');

describe('toolRouter', () => {
    afterEach(() => {
        toolRouter.clearDomainTools();
    });

    // ─── parseParams ───

    describe('parseParams', () => {
        test('parses quoted string values', () => {
            const result = toolRouter.parseParams('url="https://example.com", method="POST"');
            expect(result).toEqual({ url: 'https://example.com', method: 'POST' });
        });

        test('parses boolean and number values', () => {
            const result = toolRouter.parseParams('headless=true, retries=3, extract=false');
            expect(result).toEqual({ headless: true, retries: 3, extract: false });
        });

        test('parses null values', () => {
            const result = toolRouter.parseParams('proxy=null');
            expect(result).toEqual({ proxy: null });
        });

        test('handles empty string', () => {
            expect(toolRouter.parseParams('')).toEqual({});
        });

        test('handles escaped quotes in values', () => {
            const result = toolRouter.parseParams('query="hello \\"world\\""');
            expect(result.query).toBe('hello "world"');
        });

        test('handles single quotes', () => {
            const result = toolRouter.parseParams("url='https://example.com'");
            expect(result.url).toBe('https://example.com');
        });
    });

    // ─── parseToolCallMarkers ───

    describe('parseToolCallMarkers', () => {
        test('parses single tool call', () => {
            const text = 'Let me fetch that page. [TOOL_CALL:page_goto(url="https://example.com")]';
            const { toolCalls, cleanText } = toolRouter.parseToolCallMarkers(text);
            expect(toolCalls).toHaveLength(1);
            expect(toolCalls[0].name).toBe('page_goto');
            expect(toolCalls[0].params.url).toBe('https://example.com');
            expect(cleanText).toBe('Let me fetch that page.');
        });

        test('parses multiple tool calls', () => {
            const text = '[TOOL_CALL:browser_launch(headless=true)] [TOOL_CALL:http_fetch(url="https://test.com", extract=true)]';
            const { toolCalls } = toolRouter.parseToolCallMarkers(text);
            expect(toolCalls).toHaveLength(2);
            expect(toolCalls[0].name).toBe('browser_launch');
            expect(toolCalls[1].name).toBe('http_fetch');
            expect(toolCalls[1].params.extract).toBe(true);
        });

        test('returns empty for no markers', () => {
            const { toolCalls, cleanText } = toolRouter.parseToolCallMarkers('Hello world');
            expect(toolCalls).toHaveLength(0);
            expect(cleanText).toBe('Hello world');
        });

        test('handles null/empty input', () => {
            expect(toolRouter.parseToolCallMarkers(null).toolCalls).toHaveLength(0);
            expect(toolRouter.parseToolCallMarkers('').toolCalls).toHaveLength(0);
        });

        test('parses tool call with no params', () => {
            const { toolCalls } = toolRouter.parseToolCallMarkers('[TOOL_CALL:browser_launch()]');
            expect(toolCalls).toHaveLength(1);
            expect(toolCalls[0].name).toBe('browser_launch');
            expect(toolCalls[0].params).toEqual({});
        });
    });

    // ─── hasToolCalls ───

    describe('hasToolCalls', () => {
        test('returns true when markers present', () => {
            expect(toolRouter.hasToolCalls('[TOOL_CALL:test(x=1)]')).toBe(true);
        });

        test('returns false when no markers', () => {
            expect(toolRouter.hasToolCalls('no tools here')).toBe(false);
        });

        test('returns false for null/empty', () => {
            expect(toolRouter.hasToolCalls(null)).toBe(false);
            expect(toolRouter.hasToolCalls('')).toBe(false);
        });
    });

    // ─── Domain tool registration ───

    describe('domain tool registration', () => {
        test('registerDomainTool and listDomainTools', () => {
            toolRouter.registerDomainTool('job_search', async () => ({ results: [] }));
            toolRouter.registerDomainTool('parse_listing', async () => ({ data: {} }));
            expect(toolRouter.listDomainTools()).toEqual(['job_search', 'parse_listing']);
        });

        test('unregisterDomainTool removes handler', () => {
            toolRouter.registerDomainTool('test_tool', async () => ({}));
            expect(toolRouter.listDomainTools()).toContain('test_tool');
            toolRouter.unregisterDomainTool('test_tool');
            expect(toolRouter.listDomainTools()).not.toContain('test_tool');
        });

        test('clearDomainTools removes all', () => {
            toolRouter.registerDomainTool('a', async () => ({}));
            toolRouter.registerDomainTool('b', async () => ({}));
            toolRouter.clearDomainTools();
            expect(toolRouter.listDomainTools()).toHaveLength(0);
        });
    });

    // ─── executeTool ───

    describe('executeTool', () => {
        test('dispatches to domain handler when registered', async () => {
            toolRouter.registerDomainTool('my_tool', async (params) => {
                return { echo: params.msg };
            });
            const result = await toolRouter.executeTool('my_tool', { msg: 'hello' });
            expect(result.success).toBe(true);
            expect(result.result.echo).toBe('hello');
        });

        test('domain handler error returns success=false', async () => {
            toolRouter.registerDomainTool('fail_tool', async () => {
                throw new Error('domain error');
            });
            const result = await toolRouter.executeTool('fail_tool', {});
            expect(result.success).toBe(false);
            expect(result.error).toBe('domain error');
        });

        test('unknown tool dispatches to toolService (may fail if not running)', async () => {
            const result = await toolRouter.executeTool('nonexistent_tool_xyz', {});
            // Will fail because toolService may not have this tool or not be running
            expect(result.success).toBe(false);
        });
    });

    // ─── executeAll ───

    describe('executeAll', () => {
        test('executes multiple tool calls sequentially', async () => {
            let callOrder = [];
            toolRouter.registerDomainTool('tool_a', async () => {
                callOrder.push('a');
                return { a: true };
            });
            toolRouter.registerDomainTool('tool_b', async () => {
                callOrder.push('b');
                return { b: true };
            });

            const results = await toolRouter.executeAll([
                { name: 'tool_a', params: {} },
                { name: 'tool_b', params: {} }
            ]);

            expect(results).toHaveLength(2);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
            expect(callOrder).toEqual(['a', 'b']);
        });
    });

    // ─── formatToolResults ───

    describe('formatToolResults', () => {
        test('formats successful results', () => {
            const formatted = toolRouter.formatToolResults([
                { name: 'http_fetch', success: true, result: { status: 200, body: 'ok' } }
            ]);
            expect(formatted).toContain('[TOOL_RESULT:http_fetch]');
            expect(formatted).toContain('[/TOOL_RESULT]');
            expect(formatted).toContain('200');
        });

        test('formats error results', () => {
            const formatted = toolRouter.formatToolResults([
                { name: 'page_goto', success: false, error: 'timeout' }
            ]);
            expect(formatted).toContain('[TOOL_ERROR:page_goto]');
            expect(formatted).toContain('timeout');
        });

        test('truncates very long results', () => {
            const longResult = 'x'.repeat(5000);
            const formatted = toolRouter.formatToolResults([
                { name: 'test', success: true, result: longResult }
            ]);
            expect(formatted).toContain('(truncated)');
            expect(formatted.length).toBeLessThan(5000);
        });
    });
});
