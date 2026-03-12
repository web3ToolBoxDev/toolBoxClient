'use strict';

const toolRegistry = require('../lib/toolRegistry');
const browserTools = require('../lib/browserTools');

beforeEach(() => {
    toolRegistry.clear();
});

describe('browserTools registration', () => {
    test('registerAll registers 13 browser tools', () => {
        browserTools.registerAll();
        const tools = toolRegistry.list();
        expect(tools.length).toBe(13);

        const names = tools.map(t => t.name);
        // Original 9 tools
        expect(names).toContain('browser_launch');
        expect(names).toContain('browser_close');
        expect(names).toContain('page_new');
        expect(names).toContain('page_goto');
        expect(names).toContain('page_click');
        expect(names).toContain('page_type');
        expect(names).toContain('page_screenshot');
        expect(names).toContain('page_extract');
        expect(names).toContain('page_scroll');
        // New 4 tools
        expect(names).toContain('page_evaluate');
        expect(names).toContain('page_keyboard');
        expect(names).toContain('page_wait_for_selector');
        expect(names).toContain('page_wait_for_navigation');
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

    test('page_click accepts pageIndex parameter', () => {
        browserTools.registerAll();
        const tool = toolRegistry.list().find(t => t.name === 'page_click');
        expect(tool.parameters.properties.pageIndex).toBeDefined();
        expect(tool.parameters.properties.pageIndex.type).toBe('number');
    });

    test('page_type accepts pageIndex parameter', () => {
        browserTools.registerAll();
        const tool = toolRegistry.list().find(t => t.name === 'page_type');
        expect(tool.parameters.properties.pageIndex).toBeDefined();
    });

    test('page_evaluate requires browserId and expression', () => {
        browserTools.registerAll();
        const tool = toolRegistry.list().find(t => t.name === 'page_evaluate');
        expect(tool.parameters.required).toContain('browserId');
        expect(tool.parameters.required).toContain('expression');
    });

    test('page_keyboard requires browserId and key', () => {
        browserTools.registerAll();
        const tool = toolRegistry.list().find(t => t.name === 'page_keyboard');
        expect(tool.parameters.required).toContain('browserId');
        expect(tool.parameters.required).toContain('key');
    });

    test('page_wait_for_selector requires browserId and selector', () => {
        browserTools.registerAll();
        const tool = toolRegistry.list().find(t => t.name === 'page_wait_for_selector');
        expect(tool.parameters.required).toContain('browserId');
        expect(tool.parameters.required).toContain('selector');
    });
});
