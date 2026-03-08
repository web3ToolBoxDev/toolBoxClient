'use strict';

const registry = require('../lib/toolRegistry');

beforeEach(() => {
    registry.clear();
});

describe('toolRegistry', () => {
    test('register and list a tool', () => {
        registry.register({
            name: 'test_tool',
            description: 'A test tool',
            parameters: { type: 'object', properties: { url: { type: 'string' } } },
            handler: async () => 'ok',
            category: 'test'
        });
        const tools = registry.list();
        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe('test_tool');
        expect(tools[0].description).toBe('A test tool');
        expect(tools[0].category).toBe('test');
        // handler should NOT be in list output
        expect(tools[0].handler).toBeUndefined();
    });

    test('register throws on missing name', () => {
        expect(() => registry.register({ handler: async () => {} })).toThrow('Tool name is required');
    });

    test('register throws on missing handler', () => {
        expect(() => registry.register({ name: 'bad' })).toThrow('handler must be a function');
    });

    test('has() checks existence', () => {
        expect(registry.has('nope')).toBe(false);
        registry.register({ name: 'exists', handler: async () => {} });
        expect(registry.has('exists')).toBe(true);
    });

    test('execute runs handler and returns result', async () => {
        registry.register({
            name: 'adder',
            handler: async ({ a, b }) => a + b
        });
        const res = await registry.execute('adder', { a: 3, b: 4 });
        expect(res).toEqual({ success: true, result: 7 });
    });

    test('execute returns error for unknown tool', async () => {
        const res = await registry.execute('nonexistent', {});
        expect(res.success).toBe(false);
        expect(res.error).toContain('Unknown tool');
    });

    test('execute catches handler errors', async () => {
        registry.register({
            name: 'crasher',
            handler: async () => { throw new Error('boom'); }
        });
        const res = await registry.execute('crasher', {});
        expect(res.success).toBe(false);
        expect(res.error).toBe('boom');
    });

    test('unregister removes a tool', () => {
        registry.register({ name: 'temp', handler: async () => {} });
        expect(registry.has('temp')).toBe(true);
        registry.unregister('temp');
        expect(registry.has('temp')).toBe(false);
    });

    test('register overwrites existing tool', () => {
        registry.register({ name: 'dup', description: 'v1', handler: async () => 1 });
        registry.register({ name: 'dup', description: 'v2', handler: async () => 2 });
        const tools = registry.list();
        expect(tools).toHaveLength(1);
        expect(tools[0].description).toBe('v2');
    });
});
