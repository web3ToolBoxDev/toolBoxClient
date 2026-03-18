'use strict';

/**
 * E2E tests for Alert & Notification features:
 *
 * - Alert config CRUD (GET/PUT)
 * - Alert history (GET/DELETE)
 * - Test alert dispatch (POST)
 * - Stuck check + alert (POST)
 * - Dashboard HTML contains alert UI elements
 *
 * Uses a real HTTP server on a random port.
 */

const http = require('http');
const dashboardServer = require('../dashboardServer');

const TEST_PORT = 30197 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${TEST_PORT}`;

const TEST_SID = 'e2e-alert-session';
const _state = {
    activeSessionId: TEST_SID,
    sessions: [{ id: TEST_SID, name: 'Alert Test' }],
    selectedAnswers: { [TEST_SID]: { q_job_title: 'Engineer', q_location: 'Toronto, Canada' } },
    profileSections: { [TEST_SID]: { skills: 'JavaScript' } },
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
// Alert Config CRUD
// ═══════════════════════════════════════════════

describe('Alert Config API', () => {
    test('GET /api/workflow/:sid/alerts/config returns default config', async () => {
        const res = await request('GET', `/api/workflow/${TEST_SID}/alerts/config`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('enabled', true);
        expect(res.body).toHaveProperty('stuckDetection');
        expect(res.body.stuckDetection).toHaveProperty('enabled', true);
        expect(res.body.stuckDetection).toHaveProperty('thresholds');
        expect(res.body.stuckDetection.thresholds).toHaveProperty('search', 600);
        expect(res.body.stuckDetection).toHaveProperty('consecutiveFailureTrigger', 3);
        expect(res.body.stuckDetection).toHaveProperty('autoRetry', true);
        expect(res.body.stuckDetection).toHaveProperty('maxRetries', 2);
        expect(res.body).toHaveProperty('channels');
        expect(res.body.channels.dashboard).toHaveProperty('enabled', true);
        expect(res.body.channels.desktop).toHaveProperty('enabled', true);
        expect(res.body.channels.webhook).toHaveProperty('enabled', false);
        expect(res.body).toHaveProperty('throttle');
        expect(res.body.throttle).toHaveProperty('intervalSeconds', 300);
    });

    test('PUT /api/workflow/:sid/alerts/config updates config', async () => {
        const res = await request('PUT', `/api/workflow/${TEST_SID}/alerts/config`, {
            enabled: true,
            stuckDetection: {
                thresholds: { search: 300 },
                consecutiveFailureTrigger: 5
            },
            channels: {
                webhook: { enabled: true, url: 'https://hook.example.com/test' }
            },
            throttle: { intervalSeconds: 120 }
        });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.config.stuckDetection.thresholds.search).toBe(300);
        expect(res.body.config.stuckDetection.consecutiveFailureTrigger).toBe(5);
        expect(res.body.config.channels.webhook.enabled).toBe(true);
        expect(res.body.config.channels.webhook.url).toBe('https://hook.example.com/test');
        expect(res.body.config.throttle.intervalSeconds).toBe(120);
    });

    test('GET /api/workflow/:sid/alerts/config returns updated values', async () => {
        const res = await request('GET', `/api/workflow/${TEST_SID}/alerts/config`);
        expect(res.status).toBe(200);
        expect(res.body.stuckDetection.thresholds.search).toBe(300);
        expect(res.body.stuckDetection.consecutiveFailureTrigger).toBe(5);
        expect(res.body.channels.webhook.enabled).toBe(true);
        expect(res.body.throttle.intervalSeconds).toBe(120);
    });

    test('PUT preserves unmodified fields (deep merge)', async () => {
        const res = await request('PUT', `/api/workflow/${TEST_SID}/alerts/config`, {
            stuckDetection: { thresholds: { generate: 500 } }
        });
        expect(res.status).toBe(200);
        // search should still be 300 from previous update
        expect(res.body.config.stuckDetection.thresholds.search).toBe(300);
        expect(res.body.config.stuckDetection.thresholds.generate).toBe(500);
        // webhook should still be enabled
        expect(res.body.config.channels.webhook.enabled).toBe(true);
    });
});

// ═══════════════════════════════════════════════
// Alert Test Dispatch
// ═══════════════════════════════════════════════

describe('Alert Test Dispatch', () => {
    test('POST /api/workflow/:sid/alerts/test dispatches test alert', async () => {
        const res = await request('POST', `/api/workflow/${TEST_SID}/alerts/test`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.sent).toBe(true);
        expect(res.body.channels).toContain('dashboard');
    });
});

// ═══════════════════════════════════════════════
// Alert History
// ═══════════════════════════════════════════════

describe('Alert History API', () => {
    test('GET /api/workflow/:sid/alerts/history returns alert records', async () => {
        const res = await request('GET', `/api/workflow/${TEST_SID}/alerts/history`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0]).toHaveProperty('type', 'info');
        expect(res.body[0]).toHaveProperty('title', 'Test Alert');
        expect(res.body[0]).toHaveProperty('sentAt');
        expect(res.body[0]).toHaveProperty('channels');
    });

    test('DELETE /api/workflow/:sid/alerts/history clears history', async () => {
        const res = await request('DELETE', `/api/workflow/${TEST_SID}/alerts/history`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        // Verify cleared
        const check = await request('GET', `/api/workflow/${TEST_SID}/alerts/history`);
        expect(check.body).toEqual([]);
    });
});

// ═══════════════════════════════════════════════
// Stuck Check + Alert
// ═══════════════════════════════════════════════

describe('Stuck Check with Alerts', () => {
    test('POST /api/workflow/:sid/alerts/check returns stuck result', async () => {
        const res = await request('POST', `/api/workflow/${TEST_SID}/alerts/check`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('stuckSteps');
        expect(res.body).toHaveProperty('alerts');
        expect(Array.isArray(res.body.stuckSteps)).toBe(true);
    });
});

// ═══════════════════════════════════════════════
// Throttling
// ═══════════════════════════════════════════════

describe('Alert Throttling', () => {
    const THROTTLE_SID = 'e2e-throttle-session';

    test('Second test alert within throttle window is throttled', async () => {
        // Use a fresh session to avoid interference from prior tests
        // Set throttle to large value
        await request('PUT', `/api/workflow/${THROTTLE_SID}/alerts/config`, {
            throttle: { intervalSeconds: 3600 }
        });

        // Send first — should succeed
        const first = await request('POST', `/api/workflow/${THROTTLE_SID}/alerts/test`);
        expect(first.body.sent).toBe(true);
        expect(first.body.throttled).toBe(false);

        // Send second immediately — should be throttled
        const second = await request('POST', `/api/workflow/${THROTTLE_SID}/alerts/test`);
        expect(second.body.sent).toBe(false);
        expect(second.body.throttled).toBe(true);
    });
});

// ═══════════════════════════════════════════════
// Dashboard HTML contains alert UI
// ═══════════════════════════════════════════════

describe('Dashboard HTML Alert UI', () => {
    test('HTML contains alert settings modal', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.status).toBe(200);
        expect(res.body).toContain('alertSettingsModal');
        expect(res.body).toContain('alertEnabled');
        expect(res.body).toContain('alertStuckEnabled');
        expect(res.body).toContain('alertChWebhook');
        expect(res.body).toContain('alertThrottle');
        expect(res.body).toContain('openAlertSettings');
        expect(res.body).toContain('toastContainer');
    });

    test('HTML contains alert button in control bar', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.body).toContain('data-i18n="alerts"');
    });

    test('HTML contains SSE alert listener', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.body).toContain("addEventListener('alert'");
        expect(res.body).toContain("addEventListener('desktopNotify'");
    });

    test('HTML i18n has alert translation keys', async () => {
        const res = await request('GET', `/dashboard/${TEST_SID}`);
        expect(res.body).toContain('告警');
        expect(res.body).toContain('alertSettings');
        expect(res.body).toContain('stuckDetection');
        expect(res.body).toContain('notificationChannels');
    });
});
