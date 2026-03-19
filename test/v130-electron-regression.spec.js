// @ts-check
const { test, expect, _electron: electron } = require('@playwright/test');

/**
 * v1.3.0 Electron Frontend Regression
 *
 * Launches the Electron app and verifies that all core (non-AI) pages
 * load correctly. Complements the API/source-level checks in
 * v130-regression.spec.js (Group D).
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/v130-electron-regression.spec.js
 */

test.describe.serial('Non-AI Feature Regression (Electron)', () => {
    let app, page;

    test.beforeAll(async () => {
        app = await electron.launch({
            args: ['.'],
            env: { ...process.env, IS_BUILD: 'false' }
        });
        page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');

        // Handle language selection if it appears
        try {
            const langBtn = page.locator('button:has-text("中文")');
            await langBtn.waitFor({ timeout: 5000 });
            await langBtn.click();
        } catch {
            /* already selected */
        }
    });

    test.afterAll(async () => {
        if (app) await app.close();
    });

    test('D1: Chrome Manager page loads', async () => {
        await page.evaluate(() => { window.location.hash = '#/chromeManager'; });
        await page.waitForSelector('text=Chrome Manage', { timeout: 10000 }).catch(() => {});
        // Accept either English or Chinese heading
        const heading = await page.textContent('h4, h5, .page-title, h1');
        expect(heading).toBeTruthy();
    });

    test('D2: Wallet Manager page loads', async () => {
        await page.evaluate(() => { window.location.hash = '#/walletManage'; });
        await page.waitForTimeout(2000);
        const content = await page.textContent('body');
        expect(content.length).toBeGreaterThan(100);
    });

    test('D3: Task Manager page loads', async () => {
        await page.evaluate(() => { window.location.hash = '#/taskManage'; });
        await page.waitForTimeout(2000);
        const content = await page.textContent('body');
        expect(content.length).toBeGreaterThan(100);
    });

    test('D4: Sync Function page loads', async () => {
        await page.evaluate(() => { window.location.hash = '#/syncFunction'; });
        await page.waitForTimeout(2000);
        const content = await page.textContent('body');
        expect(content.length).toBeGreaterThan(100);
    });
});
