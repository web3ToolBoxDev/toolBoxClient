'use strict';

/**
 * E2E Test: Workflow API endpoints on dashboardServer.
 *
 * Starts a real HTTP server (dashboardServer) and tests
 * the full workflow API surface: config CRUD, status, start/stop, login.
 */

const http = require('http');
const dashboardServer = require('../dashboardServer');

let port;

// Mock state getter
const mockState = {
    activeSessionId: 'e2e-workflow-session',
    sessions: [{ id: 'e2e-workflow-session', name: 'E2E Workflow' }],
    selectedAnswers: {
        'e2e-workflow-session': {
            q_job_title: 'QA Engineer',
            q_location: 'Toronto, Canada',
            q_work_mode: 'Remote',
            q_salary: '100'
        }
    },
    profileSections: {
        basic: 'John Doe - Software Engineer',
        skills: 'JavaScript, Node.js, React',
        experience: '5 years',
        education: 'BSc Computer Science'
    },
    envs: []
};

const SESSION = 'e2e-workflow-session';

function fetchJson(path, options = {}) {
    return new Promise((resolve, reject) => {
        const method = (options.method || 'GET').toUpperCase();
        const body = options.body || null;
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path,
            method,
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

describe('Workflow API E2E', () => {
    beforeAll(async () => {
        // Use a random port to avoid conflicts
        port = 30100 + Math.floor(Math.random() * 900);
        dashboardServer.start(() => mockState, port);
        // Wait for server to be ready
        for (let i = 0; i < 10; i++) {
            try {
                const { status } = await fetchJson('/ping');
                if (status === 200) break;
            } catch {}
            await new Promise(r => setTimeout(r, 200));
        }
    });

    afterAll(() => {
        dashboardServer.stop();
    });

    // ─── Config API ───

    test('GET /api/workflow/:sessionId/config — returns auto-created default config', async () => {
        const { status, data } = await fetchJson(`/api/workflow/${SESSION}/config`);
        expect(status).toBe(200);
        expect(data.region).toBe('canada');
        expect(data.sources.map(s => s.name)).toContain('indeed');
        expect(data.sources.map(s => s.name)).toContain('linkedin');
        expect(data.sources.map(s => s.name)).toContain('jobbank');
        expect(data.steps.map(s => s.name)).toEqual([
            'customizeProfile', 'search', 'generate', 'apply'
        ]);
        expect(data.search.minScore).toBe(60);
    });

    test('PUT /api/workflow/:sessionId/config — merges overrides', async () => {
        const { status, data } = await fetchJson(`/api/workflow/${SESSION}/config`, {
            method: 'PUT',
            body: JSON.stringify({
                search: { minScore: 75, targetCount: 5 },
                sources: [{ name: 'linkedin', enabled: false }]
            })
        });
        expect(status).toBe(200);
        expect(data.search.minScore).toBe(75);
        expect(data.search.targetCount).toBe(5);
        expect(data.sources.find(s => s.name === 'linkedin').enabled).toBe(false);
        // Other sources unchanged
        expect(data.sources.find(s => s.name === 'indeed').enabled).toBe(true);
    });

    test('PUT /api/workflow/:sessionId/config — rejects invalid JSON', async () => {
        const { status } = await fetchJson(`/api/workflow/${SESSION}/config`, {
            method: 'PUT',
            body: 'not-json'
        });
        expect(status).toBe(400);
    });

    // ─── Status API ───

    test('GET /api/workflow/:sessionId/status — returns idle for fresh session', async () => {
        const { status, data } = await fetchJson(`/api/workflow/fresh-session/status`);
        expect(status).toBe(200);
        expect(data.status).toBe('idle');
    });

    // ─── View Model API ───

    test('GET /api/workflow/:sessionId/view-model — returns configured view model', async () => {
        const { status, data } = await fetchJson(`/api/workflow/${SESSION}/view-model`);
        expect(status).toBe(200);
        expect(data.configured).toBe(true);
        expect(data.status).toBe('idle');
        expect(data.steps.length).toBe(4);
        expect(data.sources.length).toBeGreaterThan(0);
        expect(data.region).toBe('canada');
    });

    test('GET /api/workflow/:sessionId/view-model — auto-configures for new session', async () => {
        const { status, data } = await fetchJson(`/api/workflow/new-auto-session/view-model`);
        expect(status).toBe(200);
        expect(data.configured).toBe(true);
        expect(data.status).toBe('idle');
    });

    // ─── Login API ───

    test('GET /api/workflow/:sessionId/login-status/:source — check indeed (no login needed)', async () => {
        const { status, data } = await fetchJson(`/api/workflow/${SESSION}/login-status/indeed`);
        expect(status).toBe(200);
        expect(data.source).toBe('indeed');
        expect(data.status).toBe('not_required');
    });

    test('POST /api/workflow/:sessionId/login/:source — set login status', async () => {
        const { status, data } = await fetchJson(`/api/workflow/${SESSION}/login/linkedin`, {
            method: 'POST',
            body: JSON.stringify({ status: 'logged_in' })
        });
        expect(status).toBe(200);
        expect(data.status).toBe('logged_in');

        // Verify it persists
        const check = await fetchJson(`/api/workflow/${SESSION}/login-status/linkedin`);
        expect(check.data.status).toBe('logged_in');
    });

    // ─── Stop API (without start — should fail gracefully) ───

    test('POST /api/workflow/:sessionId/stop — no active run returns error', async () => {
        const { status, data } = await fetchJson(`/api/workflow/no-run-session/stop`, {
            method: 'POST'
        });
        expect(status).toBe(400);
        expect(data.error).toBeTruthy();
    });

    // ─── History API ───

    test('GET /api/workflow/:sessionId/history — empty for fresh session', async () => {
        const { status, data } = await fetchJson(`/api/workflow/${SESSION}/history`);
        expect(status).toBe(200);
        expect(Array.isArray(data)).toBe(true);
        expect(data).toHaveLength(0);
    });

    // ─── Dashboard HTML includes workflow grid ───

    test('GET /dashboard/:sessionId — HTML contains workflow grid and modals', async () => {
        const { status, data } = await fetchJson(`/dashboard/${SESSION}`);
        expect(status).toBe(200);
        expect(typeof data).toBe('string');
        expect(data).toContain('Workflow Grid');
        expect(data).toContain('wfGrid');
        expect(data).toContain('wfBtnStart');
        expect(data).toContain('addWebsiteModal');
        expect(data).toContain('globalSettingsModal');
        expect(data).toContain('alertModal');
        expect(data).toContain('Add Target Website');
        // Fingerprint login UI elements
        expect(data).toContain('bindEnv');
        expect(data).toContain('platformLogin');
        expect(data).toContain('confirmLogin');
        expect(data).toContain('populateEnvSelectors');
        expect(data).toContain('wf-env-select');
    });

    // ─── Platform API ───

    test('GET /api/platforms/:sessionId — returns 3 presets for Toronto', async () => {
        const { status, data } = await fetchJson(`/api/platforms/${SESSION}`);
        expect(status).toBe(200);
        expect(Array.isArray(data)).toBe(true);
        expect(data).toHaveLength(3);
        expect(data.map(p => p.name)).toEqual(['Indeed', 'LinkedIn', 'Job Bank']);
        expect(data[0].url).toContain('ca.indeed.com');
        expect(data[1].url).toContain('linkedin.com');
        expect(data[2].url).toContain('jobbank.gc.ca');
        expect(data.every(p => p.preset === true)).toBe(true);
        // tools.search.status may be 'not_built' or 'ready' if cached scripts were restored
        expect(data.every(p => ['not_built', 'ready'].includes(p.tools.search.status))).toBe(true);
    });

    test('POST /api/platforms/:sessionId — add a custom platform', async () => {
        const { status, data } = await fetchJson(`/api/platforms/${SESSION}`, {
            method: 'POST',
            body: JSON.stringify({
                name: 'Dice',
                url: 'https://www.dice.com/jobs',
                icon: '🎲',
                connectionType: 'browser'
            })
        });
        expect(status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.platform.name).toBe('Dice');
        expect(data.platform.preset).toBe(false);

        // Verify total count
        const list = await fetchJson(`/api/platforms/${SESSION}`);
        expect(list.data).toHaveLength(4);
    });

    test('POST /api/platforms/:sessionId — rejects duplicate URL', async () => {
        const { status, data } = await fetchJson(`/api/platforms/${SESSION}`, {
            method: 'POST',
            body: JSON.stringify({ name: 'Dup Indeed', url: 'https://ca.indeed.com/jobs' })
        });
        expect(status).toBe(400);
        expect(data.error).toMatch(/already exists/);
    });

    test('DELETE /api/platforms/:sessionId/:id — removes a platform', async () => {
        const list = await fetchJson(`/api/platforms/${SESSION}`);
        const dice = list.data.find(p => p.name === 'Dice');
        expect(dice).toBeTruthy();

        const { status, data } = await fetchJson(`/api/platforms/${SESSION}/${dice.id}`, {
            method: 'DELETE'
        });
        expect(status).toBe(200);
        expect(data.success).toBe(true);

        const after = await fetchJson(`/api/platforms/${SESSION}`);
        expect(after.data).toHaveLength(3);
    });

    // ─── Platform Login API ───

    test('POST /api/platforms/:sessionId/:platformId/login — no envId returns url method', async () => {
        const list = await fetchJson(`/api/platforms/${SESSION}`);
        const indeed = list.data.find(p => p.name === 'Indeed');
        expect(indeed).toBeTruthy();

        const { status, data } = await fetchJson(`/api/platforms/${SESSION}/${indeed.id}/login`, {
            method: 'POST',
            body: '{}'
        });
        expect(status).toBe(200);
        expect(data.method).toBe('url');
        expect(data.url).toContain('indeed.com');
    });

    test('POST /api/platforms/:sessionId/:platformId/login — 404 for unknown platform', async () => {
        const { status } = await fetchJson(`/api/platforms/${SESSION}/fake_id/login`, {
            method: 'POST',
            body: '{}'
        });
        expect(status).toBe(404);
    });

    // ─── Start API (config required) ───

    test('POST /api/workflow/:sessionId/start — no config returns error', async () => {
        const { status, data } = await fetchJson(`/api/workflow/no-config/start`, {
            method: 'POST',
            body: JSON.stringify({})
        });
        expect(status).toBe(400);
        expect(data.error).toMatch(/no workflow config/i);
    });
});
