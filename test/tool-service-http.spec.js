// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * E2E Test: HTTP fetcher tools — execute via /tools/execute API.
 *
 * Prerequisites: toolService running on :30004
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/tool-service-http.spec.js
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

test.describe('HTTP fetcher tools via /tools/execute', () => {

    test('http_fetch fetches a live URL', async () => {
        const res = await execTool('http_fetch', {
            url: 'https://www.baidu.com',
            retries: 1
        });
        expect(res.success).toBe(true);
        expect(res.result.status).toBe(200);
        expect(res.result.body).toBeTruthy();
        expect(res.result.body.length).toBeGreaterThan(100);
    });

    test('http_fetch with extract=true returns title and text', async () => {
        const res = await execTool('http_fetch', {
            url: 'https://www.baidu.com',
            extract: true,
            retries: 1
        });
        expect(res.success).toBe(true);
        expect(res.result.status).toBe(200);
        expect(res.result.title).toBeTruthy();
        expect(res.result.text).toBeTruthy();
        expect(res.result.links).toBeInstanceOf(Array);
    });

    test('http_extract with CSS selectors extracts data', async () => {
        const res = await execTool('http_extract', {
            url: 'https://www.baidu.com',
            selectors: { title: 'title' }
        });
        expect(res.success).toBe(true);
        expect(res.result.status).toBe(200);
        expect(res.result.title).toBeTruthy();
    });

    test('http_fetch fails gracefully on invalid URL', async () => {
        const res = await execTool('http_fetch', {
            url: 'http://this-domain-does-not-exist-99999.invalid',
            retries: 0,
            timeout: 5000
        });
        expect(res.success).toBe(false);
        expect(res.error).toBeTruthy();
    });

    test('http_fetch and http_extract are listed in tool registry', async () => {
        const resp = await fetch(`${TS}/tools/list`);
        const data = await resp.json();
        expect(data.success).toBe(true);
        const names = data.tools.map(t => t.name);
        expect(names).toContain('http_fetch');
        expect(names).toContain('http_extract');
    });
});
