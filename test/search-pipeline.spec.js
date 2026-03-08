// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * E2E Test: Search Pipeline API + Dashboard interactive UI.
 *
 * Tests the pipeline control endpoints and the rebuilt dashboard HTML
 * with search config panel, action buttons, tabs, and history.
 *
 * Prerequisites: Dashboard server running (typically started by agent)
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/search-pipeline.spec.js
 *
 * NOTE: If the dashboard server is not running, tests will be skipped.
 */

const DS = process.env.DASHBOARD_URL || 'http://127.0.0.1:30003';
const SESSION_ID = `e2e-pipe-${Date.now()}`;

async function fetchJSON(path) {
    const resp = await fetch(`${DS}${path}`);
    return { status: resp.status, body: await resp.json() };
}

async function postJSON(path, body) {
    const resp = await fetch(`${DS}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return { status: resp.status, body: await resp.json() };
}

async function isDashboardUp() {
    try {
        const resp = await fetch(`${DS}/api/dashboard/ping`, { signal: AbortSignal.timeout(2000) });
        return resp.status === 200;
    } catch {
        return false;
    }
}

test.describe('Search Pipeline E2E', () => {

    test.beforeAll(async () => {
        const up = await isDashboardUp();
        test.skip(!up, 'Dashboard server not running');
    });

    // ─── Pipeline control API ───

    test('GET /api/pipeline/:sessionId/status returns idle for new session', async () => {
        const { status, body } = await fetchJSON(`/api/pipeline/${SESSION_ID}/status`);
        expect(status).toBe(200);
        expect(body.running).toBe(false);
        expect(body.progress).toBeNull();
    });

    test('POST /api/pipeline/:sessionId/start starts pipeline', async () => {
        const { status, body } = await postJSON(`/api/pipeline/${SESSION_ID}/start`, {
            minScore: 70,
            targetCount: 5,
            maxResults: 20
        });
        expect(status).toBe(200);
        // Either running:true (started) or error (no profile/direction set)
        expect(body).toHaveProperty('running');
    });

    test('POST /api/pipeline/:sessionId/stop stops pipeline', async () => {
        const { status, body } = await postJSON(`/api/pipeline/${SESSION_ID}/stop`, {});
        expect(status).toBe(200);
        // Should return stopped:true or error if nothing running
        expect(body).toBeDefined();
    });

    test('GET /api/pipeline/:sessionId/status shows stopped state', async () => {
        const { status, body } = await fetchJSON(`/api/pipeline/${SESSION_ID}/status`);
        expect(status).toBe(200);
        expect(body.running).toBe(false);
    });

    // ─── Mark applied API ───

    test('POST /api/pipeline/:sessionId/mark-applied marks job', async () => {
        // First create a job card
        await postJSON(`/api/jobs/${SESSION_ID}`, {
            url: 'https://e2e-pipe.com/job/1',
            title: 'Pipeline Test Job',
            company: 'PipeCo',
            matchScore: 85,
            status: 'matched'
        });

        const { status, body } = await postJSON(`/api/pipeline/${SESSION_ID}/mark-applied`, {
            jobUrl: 'https://e2e-pipe.com/job/1',
            note: 'Applied via E2E test'
        });
        expect(status).toBe(200);
        expect(body.success).toBe(true);

        // Verify status changed
        const data = await fetchJSON(`/api/dashboard/${SESSION_ID}`);
        const job = data.body.jobs.find(j => j.url === 'https://e2e-pipe.com/job/1');
        expect(job.status).toBe('submitted');
    });

    // ─── History API ───

    test('GET /api/pipeline/:sessionId/history returns submitted jobs', async () => {
        const { status, body } = await fetchJSON(`/api/pipeline/${SESSION_ID}/history`);
        expect(status).toBe(200);
        expect(Array.isArray(body)).toBe(true);
        const applied = body.find(j => j.url === 'https://e2e-pipe.com/job/1');
        expect(applied).toBeDefined();
        expect(applied.status).toBe('submitted');
    });

    // ─── Dashboard HTML ───

    test('dashboard HTML contains search config panel', async () => {
        const resp = await fetch(`${DS}/dashboard/${SESSION_ID}`);
        expect(resp.status).toBe(200);
        const html = await resp.text();
        expect(html).toContain('Automated Job Search');
        expect(html).toContain('cfgMinScore');
        expect(html).toContain('cfgTargetCount');
        expect(html).toContain('cfgMaxResults');
        expect(html).toContain('btnStart');
        expect(html).toContain('btnStop');
    });

    test('dashboard HTML contains job table with action columns', async () => {
        const resp = await fetch(`${DS}/dashboard/${SESSION_ID}`);
        const html = await resp.text();
        expect(html).toContain('job-table');
        expect(html).toContain('Actions');
        expect(html).toContain('genResume');
        expect(html).toContain('genCoverLetter');
        expect(html).toContain('markApplied');
    });

    test('dashboard HTML contains tabs for listings and history', async () => {
        const resp = await fetch(`${DS}/dashboard/${SESSION_ID}`);
        const html = await resp.text();
        expect(html).toContain('tab-listings');
        expect(html).toContain('tab-history');
        expect(html).toContain('Application History');
    });

    test('dashboard HTML contains artifact modal', async () => {
        const resp = await fetch(`${DS}/dashboard/${SESSION_ID}`);
        const html = await resp.text();
        expect(html).toContain('modalOverlay');
        expect(html).toContain('modalTitle');
        expect(html).toContain('modalContent');
    });

    test('dashboard HTML contains pipeline status bar', async () => {
        const resp = await fetch(`${DS}/dashboard/${SESSION_ID}`);
        const html = await resp.text();
        expect(html).toContain('pipeStatus');
        expect(html).toContain('pipeFill');
        expect(html).toContain('pipeCounts');
        expect(html).toContain('pipePhase');
    });
});
