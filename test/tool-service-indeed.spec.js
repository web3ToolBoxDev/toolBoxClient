// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * E2E Test: Indeed source adapter — uses toolService HTTP tools to fetch Indeed.
 *
 * NOTE: Indeed blocks HTTP requests from many regions (returns 403/CAPTCHA).
 * Tests are designed to pass regardless — they validate the adapter handles
 * both success and failure gracefully.
 *
 * Prerequisites: toolService running (port 30004 or TOOL_SERVICE_URL)
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/tool-service-indeed.spec.js
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

test.describe('Indeed source adapter E2E', () => {

    test('http_fetch attempts Indeed search without crashing', async () => {
        const url = 'https://www.indeed.com/jobs?q=software+engineer&l=Toronto';
        const result = await execTool('http_fetch', {
            url,
            extract: true,
            retries: 0,
            timeout: 10000
        });

        // Tool should return a result (success or failure), not crash
        expect(result).toBeDefined();
        // If success, validate structure
        if (result.success) {
            expect(result.result.status).toBeDefined();
        } else {
            // HTTP blocked — expected in some regions
            expect(result.error).toBeTruthy();
        }
    });

    test('http_extract with selectors handles Indeed gracefully', async () => {
        const url = 'https://www.indeed.com/jobs?q=developer&l=New+York';
        const result = await execTool('http_extract', {
            url,
            selectors: {
                titles: '.jobTitle span, h2.jobTitle',
                pageTitle: 'title'
            }
        });

        expect(result).toBeDefined();
        if (result.success) {
            expect(result.result.status).toBeDefined();
        } else {
            expect(result.error).toBeTruthy();
        }
    });

    test('browser navigates to Indeed and gets page content', async () => {
        // Launch headless browser
        const launch = await execTool('browser_launch', { headless: true });
        expect(launch.success).toBe(true);
        const browserId = launch.result.browserId;

        try {
            // Navigate to Indeed
            const goto = await execTool('page_goto', {
                browserId,
                url: 'https://www.indeed.com/jobs?q=qa+engineer'
            });
            expect(goto.success).toBe(true);
            // Indeed may show CAPTCHA but page should load
            expect(goto.result.title).toBeDefined();
            expect(goto.result.url).toContain('indeed.com');
        } finally {
            await execTool('browser_close', { browserId });
        }
    });
});
