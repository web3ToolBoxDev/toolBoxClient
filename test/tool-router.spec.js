// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * E2E Test: Tool Router integration with live toolService.
 *
 * Tests the full flow: parse markers → dispatch to toolService → get results.
 *
 * Prerequisites: toolService running on :30004 (or TOOL_SERVICE_URL env)
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/tool-router.spec.js
 */

const TS = process.env.TOOL_SERVICE_URL || 'http://127.0.0.1:30004';

async function execTool(name, params) {
    const resp = await fetch(`${TS}/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, params })
    });
    return resp.json();
}

async function listTools() {
    const resp = await fetch(`${TS}/tools/list`);
    return resp.json();
}

test.describe('Tool Router E2E — toolService integration', () => {

    test('toolService is healthy and has tools registered', async () => {
        const resp = await fetch(`${TS}/health`);
        const data = await resp.json();
        expect(data.success).toBe(true);
        expect(data.tools).toBeGreaterThanOrEqual(10); // 8 browser + 2 http
    });

    test('can list all tools with descriptions and parameters', async () => {
        const data = await listTools();
        expect(data.success).toBe(true);
        expect(data.tools.length).toBeGreaterThanOrEqual(10);

        // Every tool should have name, description, parameters
        for (const tool of data.tools) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.parameters).toBeDefined();
        }
    });

    test('http_fetch executes correctly via toolService', async () => {
        const result = await execTool('http_fetch', {
            url: 'https://www.baidu.com',
            extract: true,
            retries: 1
        });
        expect(result.success).toBe(true);
        expect(result.result.status).toBe(200);
        expect(result.result.title).toBeTruthy();
    });

    test('unknown tool returns error', async () => {
        const result = await execTool('nonexistent_tool_12345', { foo: 'bar' });
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test('tool execution without required params still runs (handler validates)', async () => {
        // http_fetch requires url — the handler should fail gracefully
        const result = await execTool('http_fetch', {});
        expect(result.success).toBe(false);
    });

    test('browser_launch + page_goto + browser_close full lifecycle', async () => {
        // Launch
        const launch = await execTool('browser_launch', { headless: true });
        expect(launch.success).toBe(true);
        const browserId = launch.result.browserId;
        expect(browserId).toBeTruthy();

        // Navigate
        const goto = await execTool('page_goto', {
            browserId,
            url: 'https://www.baidu.com'
        });
        expect(goto.success).toBe(true);
        expect(goto.result.title).toBeTruthy();

        // Close
        const close = await execTool('browser_close', { browserId });
        expect(close.success).toBe(true);
    });
});
