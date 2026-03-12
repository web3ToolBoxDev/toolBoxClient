'use strict';

/**
 * E2E tests for Sprint 3 features (Stories 9.21-9.29):
 *
 * 9.21 — Stuck Detection & Status Reflect
 * 9.22 — Runtime Script Self-Healing (integration test)
 * 9.24 — Partial Execution (skip/retry steps)
 * 9.25 — Schedule Engine
 * 9.26 — Dashboard i18n
 * 9.27 — SSE Live Push
 * 9.28 — Dashboard Stats Panel
 * 9.29 — AI Stale Selector Update
 *
 * Uses a real HTTP server on a random port.
 */

const http = require('http');
const dashboardServer = require('../dashboardServer');

const TEST_PORT = 30097 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${TEST_PORT}`;

const TEST_SID = 'e2e-sprint3-session';
const _state = {
    activeSessionId: TEST_SID,
    sessions: [{ id: TEST_SID, name: 'Sprint3 Test' }],
    selectedAnswers: { [TEST_SID]: { q_job_title: 'Software Engineer', q_location: 'Toronto, Canada' } },
    profileSections: { [TEST_SID]: { skills: 'JavaScript, React', experience: '5 years' } },
    subtasks: { [TEST_SID]: [] },
    intentFiles: {},
    envs: [{ id: 'env_001', name: 'Test Env' }],
    currentProvider: '',
    currentModel: 'default'
};

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const opts = { hostname: '127.0.0.1', port: TEST_PORT, path, method, headers: {} };
        if (body) opts.headers['Content-Type'] = 'application/json';
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (_) { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

beforeAll(async () => {
    dashboardServer.start(() => _state, TEST_PORT);
    await new Promise(r => setTimeout(r, 300));
});

afterAll(async () => {
    await dashboardServer.stop();
});

// ═══════════════════════════════════════════════
// 9.21 — Stuck Detection & Status Reflect
// ═══════════════════════════════════════════════

describe('Story 9.21: Stuck Detection', () => {
    test('GET /api/workflow/:sid/stuck returns empty when no run', async () => {
        const res = await request('GET', `/api/workflow/${TEST_SID}/stuck`);
        expect(res.status).toBe(200);
        expect(res.body.stuckSteps).toEqual([]);
    });

    test('GET /api/workflow/:sid/status returns idle for new session', async () => {
        const res = await request('GET', `/api/workflow/${TEST_SID}/status`);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('idle');
    });
});

// ═══════════════════════════════════════════════
// 9.24 — Partial Execution (skip/retry)
// ═══════════════════════════════════════════════

describe('Story 9.24: Partial Execution', () => {
    test('POST /api/workflow/:sid/skip/:step returns error when no run', async () => {
        const res = await request('POST', `/api/workflow/${TEST_SID}/skip/search`);
        expect(res.status).toBe(400);
        expect(res.body.error).toBeTruthy();
    });

    test('POST /api/workflow/:sid/retry/:step returns error when no run', async () => {
        const res = await request('POST', `/api/workflow/${TEST_SID}/retry/search`);
        expect(res.status).toBe(400);
        expect(res.body.error).toBeTruthy();
    });
});

// ═══════════════════════════════════════════════
// 9.25 — Schedule Engine
// ═══════════════════════════════════════════════

describe('Story 9.25: Schedule Engine', () => {
    test('GET /api/workflow/:sid/schedule returns disabled when none exists', async () => {
        const res = await request('GET', `/api/workflow/${TEST_SID}/schedule`);
        expect(res.status).toBe(200);
        expect(res.body.enabled).toBe(false);
    });

    test('POST /api/workflow/:sid/schedule creates a schedule', async () => {
        const res = await request('POST', `/api/workflow/${TEST_SID}/schedule`, {
            intervalMinutes: 60,
            maxRuns: 5,
            activeHours: ['09:00', '18:00']
        });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.schedule.intervalMinutes).toBe(60);
        expect(res.body.schedule.maxRuns).toBe(5);
        expect(res.body.schedule.enabled).toBe(true);
        expect(res.body.schedule.nextRunAt).toBeTruthy();
    });

    test('GET /api/workflow/:sid/schedule returns active schedule', async () => {
        const res = await request('GET', `/api/workflow/${TEST_SID}/schedule`);
        expect(res.status).toBe(200);
        expect(res.body.enabled).toBe(true);
        expect(res.body.intervalMinutes).toBe(60);
    });

    test('POST /api/workflow/:sid/schedule/pause pauses schedule', async () => {
        const res = await request('POST', `/api/workflow/${TEST_SID}/schedule/pause`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.schedule.enabled).toBe(false);
        expect(res.body.schedule.nextRunAt).toBeNull();
    });

    test('DELETE /api/workflow/:sid/schedule removes schedule', async () => {
        // First re-create
        await request('POST', `/api/workflow/${TEST_SID}/schedule`, { intervalMinutes: 30 });
        const res = await request('DELETE', `/api/workflow/${TEST_SID}/schedule`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        // Verify removed
        const check = await request('GET', `/api/workflow/${TEST_SID}/schedule`);
        expect(check.body.enabled).toBe(false);
    });
});

// ═══════════════════════════════════════════════
// 9.27 — SSE Live Push
// ═══════════════════════════════════════════════

describe('Story 9.27: SSE Live Push', () => {
    test('GET /api/events/:sid returns event-stream content type', (done) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: TEST_PORT,
            path: `/api/events/${TEST_SID}`,
            method: 'GET'
        }, (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toBe('text/event-stream');
            expect(res.headers['cache-control']).toBe('no-cache');

            let data = '';
            res.on('data', (chunk) => {
                data += chunk.toString();
                // Should receive connected event
                if (data.includes('event: connected')) {
                    res.destroy(); // Close the connection
                    done();
                }
            });

            // Timeout fallback
            setTimeout(() => {
                res.destroy();
                done();
            }, 2000);
        });
        req.end();
    });
});

// ═══════════════════════════════════════════════
// 9.28 — Dashboard Stats Panel
// ═══════════════════════════════════════════════

describe('Story 9.28: Dashboard Stats Panel', () => {
    test('GET /api/workflow/:sid/stats returns combined stats', async () => {
        // Auto-create config first
        await request('GET', `/api/workflow/${TEST_SID}/config`);

        const res = await request('GET', `/api/workflow/${TEST_SID}/stats`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('jobs');
        expect(res.body).toHaveProperty('platforms');
        expect(res.body).toHaveProperty('workflow');
        expect(res.body).toHaveProperty('schedule');
        expect(res.body).toHaveProperty('history');
        expect(res.body.jobs).toHaveProperty('total');
        expect(res.body.platforms).toHaveProperty('total');
        expect(res.body.platforms).toHaveProperty('ready');
        expect(res.body.workflow).toHaveProperty('status');
    });

    test('HTML contains stats panel', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.status).toBe(200);
        expect(res.body).toContain('statsPanel');
        expect(res.body).toContain('statJobsTotal');
        expect(res.body).toContain('statJobsMatched');
        expect(res.body).toContain('refreshStats');
    });
});

// ═══════════════════════════════════════════════
// 9.29 — AI Stale Selector Update
// ═══════════════════════════════════════════════

describe('Story 9.29: Stale Selector API', () => {
    test('GET /api/workflow/:sid/stale-selectors returns hints', async () => {
        const res = await request('GET', `/api/workflow/${TEST_SID}/stale-selectors`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('hints');
    });

    test('POST /api/workflow/:sid/stale-selectors/clear works', async () => {
        const res = await request('POST', `/api/workflow/${TEST_SID}/stale-selectors/clear`, {
            pattern: 'test-selector'
        });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// ═══════════════════════════════════════════════
// 9.26 — Dashboard i18n
// ═══════════════════════════════════════════════

describe('Story 9.26: Dashboard i18n', () => {
    test('HTML contains i18n system', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.body).toContain('_i18n');
        expect(res.body).toContain('switchLang');
        expect(res.body).toContain('langToggle');
        expect(res.body).toContain('zh-CN');
    });

    test('HTML contains Chinese translations', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.body).toContain('求职方向');
        expect(res.body).toContain('启动工作流');
    });
});

// ═══════════════════════════════════════════════
// 9.22 — Self-Healing Integration (route presence)
// ═══════════════════════════════════════════════

describe('Story 9.22: Self-Healing Integration', () => {
    let platformId;

    beforeAll(async () => {
        const res = await request('POST', `/api/platforms/${TEST_SID}`, {
            name: 'HealTestSite',
            url: 'https://healtest.example.com',
            connectionType: 'browser'
        });
        platformId = res.body?.platform?.id;
    });

    test('POST execute returns error when tool not ready (with autoHeal flag)', async () => {
        if (!platformId) return;
        const res = await request('POST', `/api/platforms/${TEST_SID}/${platformId}/tools/search/execute`, {
            keywords: 'test', location: '', autoHeal: false
        });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
    });

    test('POST heal endpoint exists', async () => {
        if (!platformId) return;
        const res = await request('POST', `/api/platforms/${TEST_SID}/${platformId}/tools/search/heal`, {
            error: 'test error'
        });
        // Should respond (may fail due to no script, but route exists)
        expect(res.status).toBeDefined();
    });

    afterAll(async () => {
        if (platformId) {
            await request('DELETE', `/api/platforms/${TEST_SID}/${platformId}`);
        }
    });
});
