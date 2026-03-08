// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * E2E Test: browserPool — launches real Chrome via toolService.
 *
 * Prerequisites:
 *   - `yarn dev` running (toolService on :30004)
 *   - Chromium installed at path in savePath.json
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/tool-service-browser.spec.js
 */

const TOOL_SERVICE_URL = 'http://127.0.0.1:30004';

test.describe('browserPool E2E', () => {

    test('launch headless Chrome, navigate, get title, close', async () => {
        // 1. Verify chromePath is set
        const configResp = await fetch(`${TOOL_SERVICE_URL}/config`);
        const config = await configResp.json();
        expect(config.chromePath).toBeTruthy();

        // 2. Launch browser, navigate to local dev server (always reachable)
        const launchResp = await fetch(`${TOOL_SERVICE_URL}/test/browser-launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: 'http://localhost:3000', headless: true })
        });
        const launchData = await launchResp.json();
        expect(launchData.success).toBe(true);
        expect(launchData.title).toBeTruthy();
        expect(launchData.browserId).toBeTruthy();
        expect(launchData.mode).toBe('chrome');

        // 3. Close the browser
        const closeResp = await fetch(`${TOOL_SERVICE_URL}/test/browser-close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ browserId: launchData.browserId })
        });
        expect((await closeResp.json()).success).toBe(true);
    });

    test('launch non-headless Chrome, navigate external site, close', async () => {
        // Navigate to a reliable external site
        const launchResp = await fetch(`${TOOL_SERVICE_URL}/test/browser-launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: 'https://www.baidu.com', headless: false })
        });
        const launchData = await launchResp.json();
        expect(launchData.success).toBe(true);
        expect(launchData.title).toBeTruthy();
        expect(launchData.browserId).toBeTruthy();

        // Close
        const closeResp = await fetch(`${TOOL_SERVICE_URL}/test/browser-close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ browserId: launchData.browserId })
        });
        expect((await closeResp.json()).success).toBe(true);
    });

    test('browser/list shows active browsers', async () => {
        // Launch one
        const launchResp = await fetch(`${TOOL_SERVICE_URL}/test/browser-launch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: 'http://localhost:3000', headless: true })
        });
        const { browserId } = await launchResp.json();

        // List should include it
        const listResp = await fetch(`${TOOL_SERVICE_URL}/browser/list`);
        const listData = await listResp.json();
        expect(listData.success).toBe(true);
        expect(listData.browsers.some(b => b.id === browserId)).toBe(true);

        // Cleanup
        await fetch(`${TOOL_SERVICE_URL}/test/browser-close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ browserId })
        });
    });
});
