'use strict';

const toolRegistry = require('../lib/toolRegistry');
const browserTools = require('../lib/browserTools');

beforeEach(() => {
    toolRegistry.clear();
});

describe('browserTools registration', () => {
    test('registerAll registers 8 browser tools', () => {
        browserTools.registerAll();
        const tools = toolRegistry.list();
        expect(tools.length).toBe(8);

        const names = tools.map(t => t.name);
        expect(names).toContain('browser_launch');
        expect(names).toContain('browser_close');
        expect(names).toContain('page_goto');
        expect(names).toContain('page_click');
        expect(names).toContain('page_type');
        expect(names).toContain('page_screenshot');
        expect(names).toContain('page_extract');
        expect(names).toContain('page_scroll');
    });

    test('all tools have category "browser"', () => {
        browserTools.registerAll();
        const tools = toolRegistry.list();
        tools.forEach(t => {
            expect(t.category).toBe('browser');
        });
    });

    test('all tools have descriptions', () => {
        browserTools.registerAll();
        const tools = toolRegistry.list();
        tools.forEach(t => {
            expect(t.description).toBeTruthy();
            expect(t.description.length).toBeGreaterThan(10);
        });
    });

    test('all tools have parameters schema', () => {
        browserTools.registerAll();
        const tools = toolRegistry.list();
        tools.forEach(t => {
            expect(t.parameters).toBeDefined();
            expect(t.parameters.type).toBe('object');
        });
    });

    test('browser_close requires browserId', () => {
        browserTools.registerAll();
        const tool = toolRegistry.list().find(t => t.name === 'browser_close');
        expect(tool.parameters.required).toContain('browserId');
    });

    test('page_goto requires browserId and url', () => {
        browserTools.registerAll();
        const tool = toolRegistry.list().find(t => t.name === 'page_goto');
        expect(tool.parameters.required).toContain('browserId');
        expect(tool.parameters.required).toContain('url');
    });
});
