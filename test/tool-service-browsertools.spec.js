// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * E2E Test: Built-in browser tools — execute via /tools/execute API.
 *
 * Prerequisites: `yarn dev` running (toolService on :30004)
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/tool-service-browsertools.spec.js
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

test.describe.serial('browser tools via /tools/execute', () => {
    let browserId;

    test('browser_launch starts a headless browser', async () => {
        const res = await execTool('browser_launch', { headless: true });
        expect(res.success).toBe(true);
        expect(res.result.browserId).toBeTruthy();
        expect(res.result.mode).toBeTruthy();
        browserId = res.result.browserId;
    });

    test('page_goto navigates to a URL', async () => {
        const res = await execTool('page_goto', {
            browserId,
            url: 'http://localhost:3000'
        });
        expect(res.success).toBe(true);
        expect(res.result.title).toBeTruthy();
        expect(res.result.url).toContain('localhost:3000');
    });

    test('page_extract reads page content', async () => {
        const res = await execTool('page_extract', {
            browserId,
            selector: 'body'
        });
        expect(res.success).toBe(true);
        expect(res.result.result).toBeTruthy();
        expect(res.result.result.length).toBeGreaterThan(0);
    });

    test('page_screenshot takes a screenshot', async () => {
        const res = await execTool('page_screenshot', { browserId });
        expect(res.success).toBe(true);
        expect(res.result.screenshot).toBeTruthy();
        expect(res.result.format).toBe('base64/png');
        // Verify it's valid base64 (at least 100 chars)
        expect(res.result.screenshot.length).toBeGreaterThan(100);
    });

    test('page_scroll scrolls the page', async () => {
        const res = await execTool('page_scroll', {
            browserId,
            direction: 'down'
        });
        expect(res.success).toBe(true);
        expect(res.result.scrolled).toBe('down');
    });

    test('browser_close shuts down the browser', async () => {
        const res = await execTool('browser_close', { browserId });
        expect(res.success).toBe(true);
    });

    test('page_goto fails on closed browser', async () => {
        const res = await execTool('page_goto', {
            browserId,
            url: 'http://localhost:3000'
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain('not found');
    });
});
