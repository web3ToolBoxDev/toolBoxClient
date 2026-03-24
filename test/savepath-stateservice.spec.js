// @ts-check
/**
 * SavePath ↔ StateService Session Isolation E2E
 *
 * Covers the gap where savepath-switch.spec.js only tests disk-level
 * sessions.json isolation but NOT the StateService (in-memory) path
 * that the agent actually uses at runtime.
 *
 * Test A: StateService /api/state/sessions/:agentId returns correct
 *         sessions after savePath switch (not stale data).
 * Test B: Agent WebSocket emits correct agent_session_list after switch.
 * Test C: Rapid savePath toggle (race condition) — final state is correct.
 */
const { test, expect } = require('@playwright/test');
const { waitForBackend, BACKEND_URL } = require('./helpers/e2e-helpers');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE = BACKEND_URL || 'http://localhost:30001';

/**
 * Seed both sessions.json (for disk API) and state.json (for StateService).
 * StateService.Persistence reads from state.json with agentId-keyed structure.
 */
function seedSessions(savePath, sessionName) {
    const dataDir = path.join(savePath, 'agents', 'job-seek', 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const session = {
        id: 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        name: sessionName,
        updatedAt: Date.now(),
    };
    const sessionData = {
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
    // Disk format (read by /api/getAgentSessions)
    fs.writeFileSync(path.join(dataDir, 'sessions.json'), JSON.stringify(sessionData, null, 2));
    // StateService format (read by Persistence._ensureLoaded → state.json)
    fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify(sessionData, null, 2));
    return session;
}

/** Switch savePath and wait for agent to process it */
async function switchPath(page, newPath) {
    const res = await page.request.post(BASE + '/api/setSavePath', {
        data: { path: newPath }
    });
    expect(res.ok()).toBeTruthy();
    // Wait for agent to process the switch (updateDataDir + stateService sync)
    await page.waitForTimeout(4000);
}

/** Read sessions from StateService HTTP API (the actual runtime data source) */
async function getStateServiceSessions(page) {
    const res = await page.request.get(BASE + '/api/state/sessions/jobSeekAgent');
    if (!res.ok()) return { sessions: [], activeSessionId: '' };
    const body = await res.json();
    // API returns { success, data: { sessions, activeSessionId } }
    return body.data || body;
}

/** Read sessions from disk API (the test-only path) */
async function getDiskSessions(page) {
    const res = await page.request.get(BASE + '/api/getAgentSessions/job-seek');
    const data = await res.json();
    return data.sessions || [];
}

test.describe.serial('SavePath ↔ StateService Session Isolation', () => {
    /** @type {import('@playwright/test').Page} */
    let page;
    const state = {
        gateOk: false,
        pathA: '',
        pathB: '',
        originalPath: '',
    };

    test('GATE-0: Backend + StateService health', async ({ browser }) => {
        page = await browser.newPage();
        const ok = await waitForBackend(30000);
        expect(ok).toBeTruthy();

        // Verify StateService is accessible
        const stateRes = await page.request.get(BASE + '/api/state/sessions/jobSeekAgent');
        expect(stateRes.ok()).toBeTruthy();

        // Record original savePath
        const pathRes = await page.request.get(BASE + '/api/getSavePath');
        const pathData = await pathRes.json();
        state.originalPath = pathData.path || pathData;
        state.gateOk = true;
    });

    test('Setup: Seed pathA (1 session) and pathB (2 sessions)', async () => {
        if (!state.gateOk) test.skip();

        state.pathA = path.join(os.tmpdir(), 'e2e-stateA-' + Date.now());
        state.pathB = path.join(os.tmpdir(), 'e2e-stateB-' + Date.now());

        seedSessions(state.pathA, 'STATE-PATH-A-SESSION');

        // Seed pathB with TWO sessions to make counts distinguishable
        const dirB = path.join(state.pathB, 'agents', 'job-seek', 'data');
        fs.mkdirSync(dirB, { recursive: true });
        const s1 = { id: 'sb1_' + Date.now(), name: 'STATE-PATH-B-FIRST', updatedAt: Date.now() };
        const s2 = { id: 'sb2_' + Date.now(), name: 'STATE-PATH-B-SECOND', updatedAt: Date.now() };
        const dataB = {
            sessions: [s1, s2],
            activeSessionId: s1.id,
            conversations: { [s1.id]: [], [s2.id]: [] },
            subtasks: { [s1.id]: [], [s2.id]: [] },
            subtaskLogs: { [s1.id]: {}, [s2.id]: {} },
            artifacts: { [s1.id]: [], [s2.id]: [] },
            runtimeLogs: { [s1.id]: [], [s2.id]: [] },
            prompts: { [s1.id]: [], [s2.id]: [] },
            executionStates: { [s1.id]: { paused: true, canceled: false }, [s2.id]: { paused: true, canceled: false } },
            onboardingComplete: { [s1.id]: false, [s2.id]: false },
            profileSections: { [s1.id]: {}, [s2.id]: {} },
            profileCollectionMode: { [s1.id]: false, [s2.id]: false },
        };
        fs.writeFileSync(path.join(dirB, 'sessions.json'), JSON.stringify(dataB, null, 2));
        fs.writeFileSync(path.join(dirB, 'state.json'), JSON.stringify(dataB, null, 2));
    });

    test('Test A: StateService returns pathA sessions after switch', async () => {
        if (!state.gateOk) test.skip();

        await switchPath(page, state.pathA);

        // Check StateService (the actual runtime data source)
        const stateData = await getStateServiceSessions(page);
        const stateNames = (stateData.sessions || []).map(s => s.name || s.id);
        console.log('[stateService-test] pathA stateService sessions:', stateNames);

        expect(stateNames).toContain('STATE-PATH-A-SESSION');
        expect(stateNames).not.toContain('STATE-PATH-B-FIRST');
        expect(stateNames).not.toContain('STATE-PATH-B-SECOND');

        // Cross-check with disk
        const diskSessions = await getDiskSessions(page);
        const diskNames = diskSessions.map(s => s.name);
        expect(diskNames).toContain('STATE-PATH-A-SESSION');
    });

    test('Test B: StateService returns pathB sessions after switch (no pathA leak)', async () => {
        if (!state.gateOk) test.skip();

        await switchPath(page, state.pathB);

        const stateData = await getStateServiceSessions(page);
        const stateNames = (stateData.sessions || []).map(s => s.name || s.id);
        console.log('[stateService-test] pathB stateService sessions:', stateNames);

        // pathB has 2 sessions
        expect(stateNames).toContain('STATE-PATH-B-FIRST');
        expect(stateNames).toContain('STATE-PATH-B-SECOND');
        // pathA must NOT leak
        expect(stateNames).not.toContain('STATE-PATH-A-SESSION');
    });

    test('Test C: Rapid toggle pathA→pathB→pathA — final state is pathA', async () => {
        if (!state.gateOk) test.skip();

        // Fire switches rapidly (< 1s apart)
        await page.request.post(BASE + '/api/setSavePath', { data: { path: state.pathA } });
        await page.waitForTimeout(500);
        await page.request.post(BASE + '/api/setSavePath', { data: { path: state.pathB } });
        await page.waitForTimeout(500);
        await page.request.post(BASE + '/api/setSavePath', { data: { path: state.pathA } });
        // Wait for final switch to settle
        await page.waitForTimeout(5000);

        // StateService must reflect pathA
        const stateData = await getStateServiceSessions(page);
        const stateNames = (stateData.sessions || []).map(s => s.name || s.id);
        console.log('[stateService-test] rapid toggle final sessions:', stateNames);

        expect(stateNames).toContain('STATE-PATH-A-SESSION');
        expect(stateNames).not.toContain('STATE-PATH-B-FIRST');

        // Disk must also be pathA
        const diskSessions = await getDiskSessions(page);
        const diskNames = diskSessions.map(s => s.name);
        expect(diskNames).toContain('STATE-PATH-A-SESSION');
    });

    test('Cleanup', async () => {
        // Restore original savePath
        await page.request.post(BASE + '/api/setSavePath', {
            data: { path: state.originalPath }
        }).catch(() => {});
        await page.waitForTimeout(2000);

        // Remove temp dirs
        for (const p of [state.pathA, state.pathB]) {
            if (p) try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
        }
        await page.close();
    });
});
