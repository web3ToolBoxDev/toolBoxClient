// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForBackend, BACKEND_URL } = require('./helpers/e2e-helpers');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE = BACKEND_URL || 'http://localhost:30001';

/**
 * Seed a sessions.json file into a savePath directory so that
 * switching to that path has identifiable session data.
 */
function seedSessions(savePath, sessionName) {
    const dataDir = path.join(savePath, 'agents', 'job-seek', 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const session = {
        id: 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        name: sessionName,
        updatedAt: Date.now(),
    };
    const data = {
        sessions: [session],
        activeSessionId: session.id,
        conversations: { [session.id]: [] },
        subtasks: { [session.id]: [] },
        subtaskLogs: { [session.id]: {} },
        artifacts: { [session.id]: [] },
        runtimeLogs: { [session.id]: [] },
        prompts: { [session.id]: [] },
        executionStates: { [session.id]: { paused: true, canceled: false } },
        onboardingComplete: { [session.id]: false },
        profileSections: { [session.id]: {} },
        profileCollectionMode: { [session.id]: false },
    };
    fs.writeFileSync(path.join(dataDir, 'sessions.json'), JSON.stringify(data, null, 2));
    return session;
}

test.describe.serial('SavePath Switch — BUG-004 regression', () => {
    /** @type {import('@playwright/test').Page} */
    let page;
    const state = {
        gateOk: false,
        pathA: '',
        pathB: '',
        sessionA: null, // { id, name }
        sessionB: null,
        originalPath: '',
    };

    test('GATE-0: Backend health', async ({ browser }) => {
        page = await browser.newPage();
        const ok = await waitForBackend(30000);
        expect(ok).toBeTruthy();
        state.gateOk = true;

        // Record original savePath for cleanup
        const pathRes = await page.request.get(BASE + '/api/getSavePath');
        const pathData = await pathRes.json();
        state.originalPath = pathData.path || pathData;
    });

    test('Test 2: Seed two directories with distinct sessions', async () => {
        if (!state.gateOk) test.skip();

        // Create two temp directories with identifiable session names
        state.pathA = path.join(os.tmpdir(), 'e2e-pathA-' + Date.now());
        state.pathB = path.join(os.tmpdir(), 'e2e-pathB-' + Date.now());

        state.sessionA = seedSessions(state.pathA, 'PATH-A-UNIQUE-SESSION');
        state.sessionB = seedSessions(state.pathB, 'PATH-B-UNIQUE-SESSION');

        console.log('[savepath-test] pathA:', state.pathA, '| session:', state.sessionA.name);
        console.log('[savepath-test] pathB:', state.pathB, '| session:', state.sessionB.name);

        // Verify files exist
        expect(fs.existsSync(path.join(state.pathA, 'agents/job-seek/data/sessions.json'))).toBe(true);
        expect(fs.existsSync(path.join(state.pathB, 'agents/job-seek/data/sessions.json'))).toBe(true);
    });

    test('Test 3: Switch to path A — must show PATH-A session only', async () => {
        if (!state.gateOk) test.skip();

        const switchRes = await page.request.post(BASE + '/api/setSavePath', {
            data: { path: state.pathA }
        });
        expect(switchRes.ok()).toBeTruthy();
        await page.waitForTimeout(3000);

        // Check via API
        const sessRes = await page.request.get(BASE + '/api/listAiSessions', {
            params: { taskName: 'job-seek' }
        });
        const sessData = await sessRes.json();
        const sessions = sessData.sessions || sessData.data?.sessions || [];
        const names = sessions.map(s => s.name);
        console.log('[savepath-test] pathA sessions:', names);

        // PATH-A session should be present
        expect(names).toContain('PATH-A-UNIQUE-SESSION');
        // PATH-B session must NOT be present
        expect(names).not.toContain('PATH-B-UNIQUE-SESSION');
    });

    test('Test 4: Switch to path B — must show PATH-B session only', async () => {
        if (!state.gateOk) test.skip();

        const switchRes = await page.request.post(BASE + '/api/setSavePath', {
            data: { path: state.pathB }
        });
        expect(switchRes.ok()).toBeTruthy();
        await page.waitForTimeout(3000);

        const sessRes = await page.request.get(BASE + '/api/listAiSessions', {
            params: { taskName: 'job-seek' }
        });
        const sessData = await sessRes.json();
        const sessions = sessData.sessions || sessData.data?.sessions || [];
        const names = sessions.map(s => s.name);
        console.log('[savepath-test] pathB sessions:', names);

        // PATH-B session should be present
        expect(names).toContain('PATH-B-UNIQUE-SESSION');
        // PATH-A session must NOT be present
        expect(names).not.toContain('PATH-A-UNIQUE-SESSION');
    });

    test('Test 5: Switch back to path A — must restore, no mixing', async () => {
        if (!state.gateOk) test.skip();

        const switchRes = await page.request.post(BASE + '/api/setSavePath', {
            data: { path: state.pathA }
        });
        expect(switchRes.ok()).toBeTruthy();
        await page.waitForTimeout(3000);

        const sessRes = await page.request.get(BASE + '/api/listAiSessions', {
            params: { taskName: 'job-seek' }
        });
        const sessData = await sessRes.json();
        const sessions = sessData.sessions || sessData.data?.sessions || [];
        const names = sessions.map(s => s.name);
        console.log('[savepath-test] pathA restored sessions:', names);

        expect(names).toContain('PATH-A-UNIQUE-SESSION');
        expect(names).not.toContain('PATH-B-UNIQUE-SESSION');
    });

    test('Test 6: Cleanup', async () => {
        // Restore original savePath
        await page.request.post(BASE + '/api/setSavePath', {
            data: { path: state.originalPath }
        }).catch(() => {});
        await page.waitForTimeout(1000);

        // Remove temp dirs
        for (const p of [state.pathA, state.pathB]) {
            if (p) try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
        }
        await page.close();
    });
});
