// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForBackend, BACKEND_URL } = require('./helpers/e2e-helpers');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE = BACKEND_URL || 'http://localhost:30001';

test.describe.serial('SavePath Switch — BUG-004 regression', () => {
    /** @type {import('@playwright/test').Page} */
    let page;
    const state = {
        gateOk: false,
        originalPath: '',
        originalSessions: [],
        tempPath: '',
        tempSessions: [],
    };

    test('GATE-0: Backend health', async ({ browser }) => {
        page = await browser.newPage();
        const ok = await waitForBackend(BASE + '/api/health', 30000);
        expect(ok).toBeTruthy();
        state.gateOk = true;
    });

    test('Test 2: Record initial savePath and sessions', async () => {
        if (!state.gateOk) test.skip();

        const pathRes = await page.request.get(BASE + '/api/getSavePath');
        const pathData = await pathRes.json();
        state.originalPath = pathData.path || pathData;
        console.log('[savepath-test] original path:', state.originalPath);
        expect(state.originalPath).toBeTruthy();

        const sessRes = await page.request.get(BASE + '/api/state/sessions/jobSeekAgent');
        const sessData = await sessRes.json();
        state.originalSessions = Array.isArray(sessData.sessions) ? sessData.sessions : [];
        console.log('[savepath-test] original sessions:', state.originalSessions.length,
            state.originalSessions.map(s => s.name));
    });

    test('Test 3: Switch to temp directory — sessions must change', async () => {
        if (!state.gateOk) test.skip();

        state.tempPath = path.join(os.tmpdir(), 'e2e-savepath-test-' + Date.now());
        fs.mkdirSync(state.tempPath, { recursive: true });
        console.log('[savepath-test] temp path:', state.tempPath);

        const switchRes = await page.request.post(BASE + '/api/setSavePath', {
            data: { path: state.tempPath }
        });
        expect(switchRes.ok()).toBeTruthy();

        await page.waitForTimeout(3000);

        const sessRes = await page.request.get(BASE + '/api/state/sessions/jobSeekAgent');
        const sessData = await sessRes.json();
        state.tempSessions = Array.isArray(sessData.sessions) ? sessData.sessions : [];
        console.log('[savepath-test] temp sessions:', state.tempSessions.length,
            state.tempSessions.map(s => s.name));

        // BUG-004: original session names must NOT appear in temp path
        const originalNames = state.originalSessions.map(s => s.name);
        const tempNames = state.tempSessions.map(s => s.name);
        for (const name of originalNames) {
            expect(tempNames, `Original session "${name}" leaked to temp path`).not.toContain(name);
        }
    });

    test('Test 4: Switch back — original sessions must restore', async () => {
        if (!state.gateOk) test.skip();

        const switchRes = await page.request.post(BASE + '/api/setSavePath', {
            data: { path: state.originalPath }
        });
        expect(switchRes.ok()).toBeTruthy();

        await page.waitForTimeout(3000);

        const sessRes = await page.request.get(BASE + '/api/state/sessions/jobSeekAgent');
        const sessData = await sessRes.json();
        const restoredSessions = Array.isArray(sessData.sessions) ? sessData.sessions : [];
        console.log('[savepath-test] restored sessions:', restoredSessions.length,
            restoredSessions.map(s => s.name));

        expect(restoredSessions.length).toBe(state.originalSessions.length);
        const restoredNames = restoredSessions.map(s => s.name).sort();
        const originalNames = state.originalSessions.map(s => s.name).sort();
        expect(restoredNames).toEqual(originalNames);
    });

    test('Test 5: BUG-004 regression — no session mixing', async () => {
        if (!state.gateOk) test.skip();

        const originalNames = new Set(state.originalSessions.map(s => s.name));
        const tempNames = new Set(state.tempSessions.map(s => s.name));

        for (const name of originalNames) {
            expect(tempNames.has(name), `BUG-004: "${name}" from path A leaked to path B`).toBe(false);
        }
        for (const name of tempNames) {
            expect(originalNames.has(name), `BUG-004: "${name}" from path B leaked to path A`).toBe(false);
        }
        console.log('[savepath-test] BUG-004 regression: PASS');
    });

    test('Test 6: Cleanup', async () => {
        await page.request.post(BASE + '/api/setSavePath', {
            data: { path: state.originalPath }
        }).catch(() => {});

        if (state.tempPath) {
            try { fs.rmSync(state.tempPath, { recursive: true, force: true }); } catch {}
        }
        await page.close();
    });
});
