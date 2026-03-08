'use strict';

/**
 * E2E integration test: starts dashboardServer, exercises pipeline API routes,
 * and verifies the full flow: start → status → mark-applied → history.
 *
 * This test actually boots the HTTP server and makes real HTTP requests,
 * so it catches circular dependency and route-matching issues.
 */

const http = require('http');

// Mock the domain tool handlers so we don't need real browser/AI
jest.mock('./tools/jobSearch', () => ({
    handler: jest.fn().mockResolvedValue({
        listings: [
            { url: 'https://e2e-live.com/job/1', title: 'React Developer', company: 'TestCo', location: 'Toronto', salary: '120K' },
            { url: 'https://e2e-live.com/job/2', title: 'Node Engineer', company: 'BigCorp', location: 'Remote' },
            { url: 'https://e2e-live.com/job/3', title: 'Fullstack Dev', company: 'StartupX', location: 'Vancouver' }
        ]
    })
}));
jest.mock('./tools/parseListing', () => ({
    handler: jest.fn().mockResolvedValue({ technical: ['React', 'Node'], experience: ['3+ years'], education: [] })
}));
jest.mock('./tools/matchProfile', () => ({
    handler: jest.fn().mockResolvedValue({ overall: 78 })
}));
jest.mock('./tools/resumeGen', () => ({
    handler: jest.fn().mockResolvedValue({ markdown: '# Tailored Resume\n\nJohn Doe — React Developer' })
}));
jest.mock('./tools/coverLetter', () => ({
    handler: jest.fn().mockResolvedValue({ markdown: '# Cover Letter\n\nDear Hiring Manager' })
}));

const dashboardServer = require('./dashboardServer');
const searchPipeline = require('./searchPipeline');

const TEST_PORT = 30098;
const SESSION_ID = 'e2e-pipeline-live';

const STATE = {
    selectedAnswers: {
        [SESSION_ID]: {
            q_job_title: 'Frontend Engineer',
            q_location: 'Toronto',
            q_work_mode: 'remote',
            q_salary: '120'
        }
    },
    profileSections: {
        [SESSION_ID]: {
            basic: 'John Doe, john@test.com',
            skills: 'React, Node, TypeScript',
            experience: 'ACME Corp, 2020-2024',
            education: 'CS, MIT, 2019'
        }
    },
    subtasks: { [SESSION_ID]: [] },
    intentFiles: { [SESSION_ID]: { version: 1 } }
};

function fetchJSON(path) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${TEST_PORT}${path}`, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { reject(new Error(`JSON parse failed: ${data}`)); }
            });
        }).on('error', reject);
    });
}

function postJSON(path, body) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(body);
        const req = http.request({
            hostname: '127.0.0.1',
            port: TEST_PORT,
            path,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { reject(new Error(`Parse failed: ${data}`)); }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function fetchHTML(path) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${TEST_PORT}${path}`, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        }).on('error', reject);
    });
}

describe('Search Pipeline E2E (live server)', () => {
    beforeAll((done) => {
        dashboardServer.start(() => STATE, TEST_PORT);
        setTimeout(done, 300);
    });

    afterAll(async () => {
        await dashboardServer.stop();
    });

    // ─── Pipeline status (idle) ───
    test('GET /api/pipeline/:sid/status returns idle for new session', async () => {
        const { status, body } = await fetchJSON(`/api/pipeline/${SESSION_ID}/status`);
        expect(status).toBe(200);
        expect(body.running).toBe(false);
        expect(body.progress).toBeNull();
    });

    // ─── Start pipeline ───
    test('POST /api/pipeline/:sid/start starts pipeline', async () => {
        const { status, body } = await postJSON(`/api/pipeline/${SESSION_ID}/start`, {
            minScore: 60,
            targetCount: 3,
            maxResults: 10
        });
        expect(status).toBe(200);
        expect(body.running).toBe(true);
        expect(body.config.minScore).toBe(60);
        expect(body.config.targetCount).toBe(3);
    });

    // ─── Wait for pipeline to complete ───
    test('pipeline completes and populates job cards', async () => {
        // Wait for async pipeline to finish
        await new Promise(r => setTimeout(r, 1000));

        const { body } = await fetchJSON(`/api/pipeline/${SESSION_ID}/status`);
        expect(body.running).toBe(false);
        expect(body.progress.phase).toMatch(/completed|done/);
        expect(body.progress.qualified).toBeGreaterThanOrEqual(3);
    });

    // ─── Dashboard data shows jobs ───
    test('dashboard data includes discovered/matched jobs', async () => {
        const { body } = await fetchJSON(`/api/dashboard/${SESSION_ID}`);
        expect(body.jobs.length).toBeGreaterThanOrEqual(3);
        expect(body.jobStats.total).toBeGreaterThanOrEqual(3);
    });

    // ─── Generate resume via API ───
    test('POST /api/pipeline/:sid/generate-resume returns markdown', async () => {
        const { status, body } = await postJSON(`/api/pipeline/${SESSION_ID}/generate-resume`, {
            jobUrl: 'https://e2e-live.com/job/1'
        });
        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.markdown).toContain('Resume');
    });

    // ─── Generate cover letter via API ───
    test('POST /api/pipeline/:sid/generate-cover-letter returns markdown', async () => {
        const { status, body } = await postJSON(`/api/pipeline/${SESSION_ID}/generate-cover-letter`, {
            jobUrl: 'https://e2e-live.com/job/1'
        });
        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.markdown).toContain('Cover Letter');
    });

    // ─── Mark applied ───
    test('POST /api/pipeline/:sid/mark-applied updates status', async () => {
        const { status, body } = await postJSON(`/api/pipeline/${SESSION_ID}/mark-applied`, {
            jobUrl: 'https://e2e-live.com/job/1',
            note: 'Applied via E2E test'
        });
        expect(status).toBe(200);
        expect(body.success).toBe(true);

        // Verify status changed in dashboard
        const data = await fetchJSON(`/api/dashboard/${SESSION_ID}`);
        const job = data.body.jobs.find(j => j.url === 'https://e2e-live.com/job/1');
        expect(job.status).toBe('submitted');
    });

    // ─── History ───
    test('GET /api/pipeline/:sid/history returns submitted jobs', async () => {
        const { status, body } = await fetchJSON(`/api/pipeline/${SESSION_ID}/history`);
        expect(status).toBe(200);
        expect(Array.isArray(body)).toBe(true);
        const applied = body.find(j => j.url === 'https://e2e-live.com/job/1');
        expect(applied).toBeDefined();
        expect(applied.status).toBe('submitted');
    });

    // ─── Stop (already finished, should not error) ───
    test('POST /api/pipeline/:sid/stop on finished pipeline', async () => {
        const { status, body } = await postJSON(`/api/pipeline/${SESSION_ID}/stop`, {});
        expect(status).toBe(200);
        expect(body.stopped).toBe(true);
    });

    // ─── Duplicate start prevention ───
    test('starting pipeline again on same session works after completion', async () => {
        const { status, body } = await postJSON(`/api/pipeline/${SESSION_ID}/start`, {
            minScore: 80,
            targetCount: 2
        });
        expect(status).toBe(200);
        expect(body.running).toBe(true);

        // Stop it immediately
        await postJSON(`/api/pipeline/${SESSION_ID}/stop`, {});
    });

    // ─── Dashboard HTML structure ───
    test('dashboard HTML contains search config and action buttons', async () => {
        const { status, body } = await fetchHTML(`/dashboard/${SESSION_ID}`);
        expect(status).toBe(200);
        expect(body).toContain('Automated Job Search');
        expect(body).toContain('cfgMinScore');
        expect(body).toContain('cfgTargetCount');
        expect(body).toContain('btnStart');
        expect(body).toContain('genResume');
        expect(body).toContain('genCoverLetter');
        expect(body).toContain('markApplied');
        expect(body).toContain('tab-listings');
        expect(body).toContain('tab-history');
        expect(body).toContain('modalOverlay');
        expect(body).toContain('pipeStatus');
    });

    // ─── 404 for unknown routes ───
    test('unknown route returns 404', async () => {
        const { status } = await fetchJSON('/api/unknown/route');
        expect(status).toBe(404);
    });
});
