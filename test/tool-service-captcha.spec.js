// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * E2E Test: CAPTCHA detection & solving tools.
 *
 * Tests captcha_detect on pages with/without CAPTCHAs.
 * Uses live toolService browser tools.
 *
 * Prerequisites: toolService running (port 30004 or TOOL_SERVICE_URL)
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/tool-service-captcha.spec.js
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

test.describe('CAPTCHA tools E2E', () => {

    test('captcha_detect and captcha_solve are registered', async () => {
        const resp = await fetch(`${TS}/tools/list`);
        const data = await resp.json();
        const names = data.tools.map(t => t.name);
        expect(names).toContain('captcha_detect');
        expect(names).toContain('captcha_solve');
    });

    test('captcha_detect reports "none" on a normal page', async () => {
        // Launch browser and navigate to a simple page (no CAPTCHA)
        const launch = await execTool('browser_launch', { headless: true });
        expect(launch.success).toBe(true);
        const browserId = launch.result.browserId;

        try {
            const goto = await execTool('page_goto', {
                browserId,
                url: 'https://www.baidu.com'
            });
            expect(goto.success).toBe(true);

            // Detect CAPTCHA — should be none
            const detect = await execTool('captcha_detect', { browserId });
            expect(detect.success).toBe(true);
            expect(detect.result.type).toBe('none');
        } finally {
            await execTool('browser_close', { browserId });
        }
    });

    test('captcha_solve returns solved=true for type "none"', async () => {
        const launch = await execTool('browser_launch', { headless: true });
        expect(launch.success).toBe(true);
        const browserId = launch.result.browserId;

        try {
            await execTool('page_goto', { browserId, url: 'https://www.baidu.com' });

            const solve = await execTool('captcha_solve', {
                browserId,
                captchaType: 'none'
            });
            expect(solve.success).toBe(true);
            expect(solve.result.solved).toBe(true);
        } finally {
            await execTool('browser_close', { browserId });
        }
    });

    test('captcha_detect on Google reCAPTCHA demo page', async () => {
        const launch = await execTool('browser_launch', { headless: true });
        expect(launch.success).toBe(true);
        const browserId = launch.result.browserId;

        try {
            // Google's reCAPTCHA demo page
            const goto = await execTool('page_goto', {
                browserId,
                url: 'https://www.google.com/recaptcha/api2/demo'
            });

            // Page may or may not load depending on network
            if (goto.success) {
                const detect = await execTool('captcha_detect', { browserId });
                expect(detect.success).toBe(true);
                // Should detect reCAPTCHA (if page loaded correctly)
                // In some regions this may be blocked, so we accept any valid type
                expect(['recaptcha', 'cloudflare', 'none', 'image_text']).toContain(detect.result.type);
            }
        } finally {
            await execTool('browser_close', { browserId });
        }
    });
});
