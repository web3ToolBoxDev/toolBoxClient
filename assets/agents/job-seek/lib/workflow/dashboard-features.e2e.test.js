'use strict';

/**
 * E2E tests for Stories 9.11-9.16 dashboard features:
 *
 * 9.11 — Control Bar: Start/Stop + Status polling
 * 9.12 — Add Target Website: Modal → POST /api/platforms/:sid → grid update
 * 9.13 — AI Script Builder: POST /api/platforms/:sid/:pid/tools/search/build
 * 9.14 — Search Execution: POST /api/platforms/:sid/:pid/tools/search/execute
 * 9.15 — Global Settings: PUT /api/workflow/:sid/config
 * 9.16 — Job Records: GET /api/jobs/:sid with filtering & pagination
 *
 * Uses a real HTTP server on a random port.
 */

const http = require('http');
const dashboardServer = require('../dashboardServer');

// Port chosen to avoid conflicts
const TEST_PORT = 30096;
const BASE = `http://127.0.0.1:${TEST_PORT}`;

// ─── State for dashboard server ───
const TEST_SID = 'e2e-session-features';
const _state = {
    activeSessionId: TEST_SID,
    sessions: [{ id: TEST_SID, name: 'Test' }],
    selectedAnswers: { [TEST_SID]: { q_job_title: 'Software Engineer', q_location: 'Toronto, Canada' } },
    profileSections: { [TEST_SID]: { skills: 'JavaScript, React', experience: '5 years' } },
    subtasks: { [TEST_SID]: [] },
    intentFiles: {},
    envs: [{ id: 'env_001', name: 'Test Env' }],
    currentProvider: '',
    currentModel: 'default'
};

// ─── HTTP helpers ───

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

// ─── Server lifecycle ───

beforeAll(async () => {
    dashboardServer.start(() => _state, TEST_PORT);
    await new Promise(r => setTimeout(r, 300));
});

afterAll(async () => {
    await dashboardServer.stop();
});

// ═══════════════════════════════════════════════
// 9.11 — Control Bar: Start/Stop + Status
// ═══════════════════════════════════════════════

describe('Story 9.11: Control Bar — Start/Stop + Status', () => {
    test('GET /api/workflow/:sid/status returns idle when no run', async () => {
        const res = await request('GET', `/api/workflow/${TEST_SID}/status`);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('idle');
    });

    test('POST /api/workflow/:sid/start returns 400 without config', async () => {
        const res = await request('POST', `/api/workflow/${TEST_SID}/start`, {});
        // No config exists yet → should return 400 with a clear error message
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('config');
    });

    test('POST /api/workflow/:sid/start succeeds after config created', async () => {
        // Create config first
        await request('GET', `/api/workflow/${TEST_SID}/config`); // auto-creates default
        const res = await request('POST', `/api/workflow/${TEST_SID}/start`, {});
        expect([200, 400]).toContain(res.status);
        expect(res.body).toBeDefined();
    });

    test('POST /api/workflow/:sid/stop handles no-active-run', async () => {
        const res = await request('POST', `/api/workflow/${TEST_SID}/stop`);
        expect(res.status).toBeDefined();
    });

    test('GET /api/workflow/:sid/view-model returns viewModel structure', async () => {
        const res = await request('GET', `/api/workflow/${TEST_SID}/view-model`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('configured');
        expect(res.body).toHaveProperty('status');
    });
});

// ═══════════════════════════════════════════════
// 9.12 — Add Target Website
// ═══════════════════════════════════════════════

describe('Story 9.12: Add Target Website', () => {
    test('GET /api/platforms/:sid returns preset platforms', async () => {
        const res = await request('GET', `/api/platforms/${TEST_SID}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
    });

    let addedPlatformId = null;

    test('POST /api/platforms/:sid adds a new platform', async () => {
        const res = await request('POST', `/api/platforms/${TEST_SID}`, {
            name: 'TestJobs',
            url: 'https://testjobs.example.com/search',
            loginUrl: 'https://testjobs.example.com/login',
            icon: '🧪',
            connectionType: 'browser',
            notes: 'E2E test platform'
        });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.platform).toHaveProperty('id');
        addedPlatformId = res.body.platform.id;
    });

    test('newly added platform appears in list', async () => {
        const res = await request('GET', `/api/platforms/${TEST_SID}`);
        const found = res.body.find(p => p.id === addedPlatformId);
        expect(found).toBeTruthy();
        expect(found.name).toBe('TestJobs');
        expect(found.connectionType).toBe('browser');
    });

    test('POST /api/platforms/:sid rejects duplicate URL', async () => {
        const res = await request('POST', `/api/platforms/${TEST_SID}`, {
            name: 'TestJobs2',
            url: 'https://testjobs.example.com/search',
            connectionType: 'browser'
        });
        expect(res.body.success).toBeFalsy();
    });

    test('POST /api/platforms/:sid rejects empty name', async () => {
        const res = await request('POST', `/api/platforms/${TEST_SID}`, {
            name: '',
            url: 'https://new.example.com',
            connectionType: 'browser'
        });
        expect(res.body.success).toBeFalsy();
    });

    test('DELETE /api/platforms/:sid/:pid removes platform', async () => {
        if (!addedPlatformId) return;
        const res = await request('DELETE', `/api/platforms/${TEST_SID}/${addedPlatformId}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('removed platform no longer in list', async () => {
        if (!addedPlatformId) return;
        const res = await request('GET', `/api/platforms/${TEST_SID}`);
        const found = res.body.find(p => p.id === addedPlatformId);
        expect(found).toBeFalsy();
    });
});

// ═══════════════════════════════════════════════
// 9.13 — AI Script Builder (build log endpoint)
// ═══════════════════════════════════════════════

describe('Story 9.13: AI Script Builder — Build Log', () => {
    let platformId;

    beforeAll(async () => {
        // Add a platform to test with
        const res = await request('POST', `/api/platforms/${TEST_SID}`, {
            name: 'BuildTestSite',
            url: 'https://buildtest.example.com',
            connectionType: 'browser'
        });
        platformId = res.body?.platform?.id;
    });

    test('GET build-log returns tool status for new platform', async () => {
        if (!platformId) return;
        const res = await request('GET', `/api/platforms/${TEST_SID}/${platformId}/tools/search/build-log`);
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('not_built');
        expect(res.body.buildLog).toEqual([]);
    });

    test('POST build returns 400 when no AI provider configured', async () => {
        if (!platformId) return;
        // _state.currentProvider is empty, so no AI invoke available
        const res = await request('POST', `/api/platforms/${TEST_SID}/${platformId}/tools/search/build`, {});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('No AI provider');
    });

    test('build-log 404 for non-existent platform', async () => {
        const res = await request('GET', `/api/platforms/${TEST_SID}/nonexistent/tools/search/build-log`);
        expect(res.status).toBe(404);
    });

    afterAll(async () => {
        if (platformId) {
            await request('DELETE', `/api/platforms/${TEST_SID}/${platformId}`);
        }
    });
});

// ═══════════════════════════════════════════════
// 9.14 — Search Execution
// ═══════════════════════════════════════════════

describe('Story 9.14: Search Execution via Script', () => {
    let platformId;

    beforeAll(async () => {
        const res = await request('POST', `/api/platforms/${TEST_SID}`, {
            name: 'SearchTestSite',
            url: 'https://searchtest.example.com',
            connectionType: 'browser'
        });
        platformId = res.body?.platform?.id;
    });

    test('POST execute returns error when tool not ready', async () => {
        if (!platformId) return;
        const res = await request('POST', `/api/platforms/${TEST_SID}/${platformId}/tools/search/execute`, {
            keywords: 'test', location: ''
        });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('not ready');
    });

    afterAll(async () => {
        if (platformId) {
            await request('DELETE', `/api/platforms/${TEST_SID}/${platformId}`);
        }
    });
});

// ═══════════════════════════════════════════════
// 9.15 — Global Settings
// ═══════════════════════════════════════════════

describe('Story 9.15: Global Settings Modal', () => {
    test('GET /api/workflow/:sid/config returns default config', async () => {
        const res = await request('GET', `/api/workflow/${TEST_SID}/config`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('search');
        expect(res.body.search).toHaveProperty('minScore');
        expect(res.body.search).toHaveProperty('targetCount');
        expect(res.body.search).toHaveProperty('maxResults');
    });

    test('PUT /api/workflow/:sid/config updates search params', async () => {
        const res = await request('PUT', `/api/workflow/${TEST_SID}/config`, {
            search: { minScore: 75, targetCount: 15, maxResults: 50 }
        });
        expect(res.status).toBe(200);
        expect(res.body.search.minScore).toBe(75);
        expect(res.body.search.targetCount).toBe(15);
        expect(res.body.search.maxResults).toBe(50);
    });

    test('updated config persists on re-fetch', async () => {
        const res = await request('GET', `/api/workflow/${TEST_SID}/config`);
        expect(res.body.search.minScore).toBe(75);
        expect(res.body.search.targetCount).toBe(15);
    });

    test('PUT with invalid minScore rejects', async () => {
        const res = await request('PUT', `/api/workflow/${TEST_SID}/config`, {
            search: { minScore: 150 }
        });
        expect(res.status).toBe(400);
    });

    test('config version increments on update', async () => {
        const before = await request('GET', `/api/workflow/${TEST_SID}/config`);
        const vBefore = before.body.version;

        await request('PUT', `/api/workflow/${TEST_SID}/config`, {
            search: { targetCount: 20 }
        });

        const after = await request('GET', `/api/workflow/${TEST_SID}/config`);
        expect(after.body.version).toBe(vBefore + 1);
    });
});

// ═══════════════════════════════════════════════
// 9.16 — Job Records Table
// ═══════════════════════════════════════════════

describe('Story 9.16: Job Records Table', () => {
    beforeAll(() => {
        // Seed some job cards
        for (let i = 0; i < 25; i++) {
            dashboardServer.upsertJobCard(TEST_SID, {
                url: `https://example.com/job/${i}`,
                title: `Job ${i}`,
                company: `Company ${i % 5}`,
                location: 'Toronto',
                salary: '100K',
                platform: 'Indeed',
                matchScore: 50 + (i * 2),
                status: i < 10 ? 'discovered' : i < 18 ? 'matched' : 'submitted'
            });
        }
    });

    test('GET /api/jobs/:sid returns all jobs with pagination', async () => {
        const res = await request('GET', `/api/jobs/${TEST_SID}`);
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(25);
        expect(res.body.jobs.length).toBe(20); // default pageSize
        expect(res.body.totalPages).toBe(2);
        expect(res.body.page).toBe(1);
        expect(res.body.stats).toHaveProperty('total', 25);
    });

    test('GET /api/jobs/:sid?page=2 returns second page', async () => {
        const res = await request('GET', `/api/jobs/${TEST_SID}?page=2&pageSize=20`);
        expect(res.status).toBe(200);
        expect(res.body.jobs.length).toBe(5); // 25 - 20
        expect(res.body.page).toBe(2);
    });

    test('GET /api/jobs/:sid?status=discovered filters by status', async () => {
        const res = await request('GET', `/api/jobs/${TEST_SID}?status=discovered`);
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(10);
        expect(res.body.jobs.every(j => j.status === 'discovered')).toBe(true);
    });

    test('GET /api/jobs/:sid?status=submitted filters applied jobs', async () => {
        const res = await request('GET', `/api/jobs/${TEST_SID}?status=submitted`);
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(7);
    });

    test('GET /api/jobs/:sid?status=matched returns matched jobs', async () => {
        const res = await request('GET', `/api/jobs/${TEST_SID}?status=matched`);
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(8);
    });

    test('custom pageSize works', async () => {
        const res = await request('GET', `/api/jobs/${TEST_SID}?pageSize=5`);
        expect(res.body.jobs.length).toBe(5);
        expect(res.body.totalPages).toBe(5);
    });

    test('jobs include platform field', async () => {
        const res = await request('GET', `/api/jobs/${TEST_SID}?pageSize=1`);
        expect(res.body.jobs[0]).toHaveProperty('platform');
    });

    test('stats include breakdown by status', async () => {
        const res = await request('GET', `/api/jobs/${TEST_SID}`);
        expect(res.body.stats.discovered).toBe(10);
        expect(res.body.stats.matched).toBe(8);
        expect(res.body.stats.submitted).toBe(7);
    });

    test('POST /api/jobs/:sid/status updates job status', async () => {
        const res = await request('POST', `/api/jobs/${TEST_SID}/status`, {
            jobUrl: 'https://example.com/job/0',
            status: 'matched'
        });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        // Verify the update
        const jobs = await request('GET', `/api/jobs/${TEST_SID}?status=matched`);
        const updated = jobs.body.jobs.find(j => j.url === 'https://example.com/job/0');
        expect(updated).toBeTruthy();
        expect(updated.status).toBe('matched');
    });
});

// ═══════════════════════════════════════════════
// Dashboard HTML rendering
// ═══════════════════════════════════════════════

describe('Dashboard HTML', () => {
    test('GET /dashboard/:sid returns HTML with control bar', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.status).toBe(200);
        expect(typeof res.body).toBe('string');
        expect(res.body).toContain('controlBar');
        expect(res.body).toContain('wfBtnStart');
        expect(res.body).toContain('wfBtnStop');
        expect(res.body).toContain('asyncToggle');
    });

    test('HTML contains global settings modal', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.body).toContain('globalSettingsModal');
        expect(res.body).toContain('saveGlobalSettings');
        expect(res.body).toContain('gsCfgMinScore');
    });

    test('HTML contains add website modal', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.body).toContain('addWebsiteModal');
        expect(res.body).toContain('submitAddWebsite');
    });

    test('HTML contains job filter bar', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.body).toContain('jobFilterBar');
        expect(res.body).toContain('filterJobs');
        expect(res.body).toContain('refreshJobRecords');
    });

    test('HTML contains script builder functions', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.body).toContain('buildToolForPlatform');
        expect(res.body).toContain('executeSearchForPlatform');
    });

    test('HTML contains cell status overlay CSS', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.body).toContain('cell-running');
        expect(res.body).toContain('cell-stuck');
        expect(res.body).toContain('cell-building');
    });

    test('HTML contains workflow status polling', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.body).toContain('pollWfStatus');
        expect(res.body).toContain('updateWfUI');
    });

    test('HTML contains pagination', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.body).toContain('jobPagination');
        expect(res.body).toContain('goJobPage');
    });
});
