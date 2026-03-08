// @ts-check
const { test, expect } = require('@playwright/test');
const http = require('http');

/**
 * E2E Test: Dashboard job workflow API.
 *
 * Tests the job card CRUD API endpoints on the dashboard server.
 * Uses the live dashboard server (port 30003 or DASHBOARD_URL).
 *
 * Prerequisites: Dashboard server running (typically started by agent)
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/dashboard-workflow.spec.js
 *
 * NOTE: If the dashboard server is not running, tests will be skipped.
 */

const DS = process.env.DASHBOARD_URL || 'http://127.0.0.1:30003';
const SESSION_ID = `e2e-test-${Date.now()}`;

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

test.describe('Dashboard job workflow E2E', () => {

    test.beforeAll(async () => {
        const up = await isDashboardUp();
        test.skip(!up, 'Dashboard server not running');
    });

    test('GET /api/dashboard/:sessionId returns data with jobs and jobStats', async () => {
        const { status, body } = await fetchJSON(`/api/dashboard/${SESSION_ID}`);
        expect(status).toBe(200);
        expect(body.sessionId).toBe(SESSION_ID);
        expect(body).toHaveProperty('jobs');
        expect(body).toHaveProperty('jobStats');
        expect(body).toHaveProperty('direction');
        expect(body).toHaveProperty('profile');
    });

    test('POST /api/jobs/:sessionId upserts a job card', async () => {
        const { status, body } = await postJSON(`/api/jobs/${SESSION_ID}`, {
            url: 'https://e2e-test.com/job/1',
            title: 'E2E Developer',
            company: 'TestCo',
            matchScore: 75
        });
        expect(status).toBe(200);
        expect(body.success).toBe(true);

        // Verify via dashboard data
        const data = await fetchJSON(`/api/dashboard/${SESSION_ID}`);
        const job = data.body.jobs.find(j => j.url === 'https://e2e-test.com/job/1');
        expect(job).toBeDefined();
        expect(job.title).toBe('E2E Developer');
        expect(job.matchScore).toBe(75);
    });

    test('POST /api/jobs/:sessionId/status updates job status', async () => {
        // Ensure the card exists first
        await postJSON(`/api/jobs/${SESSION_ID}`, {
            url: 'https://e2e-test.com/job/2',
            title: 'Status Test Job'
        });

        const { status, body } = await postJSON(`/api/jobs/${SESSION_ID}/status`, {
            jobUrl: 'https://e2e-test.com/job/2',
            status: 'submitted'
        });
        expect(status).toBe(200);
        expect(body.success).toBe(true);

        // Verify
        const data = await fetchJSON(`/api/dashboard/${SESSION_ID}`);
        const job = data.body.jobs.find(j => j.url === 'https://e2e-test.com/job/2');
        expect(job.status).toBe('submitted');
    });

    test('jobStats reflects correct counts', async () => {
        // Add a few more jobs with different statuses
        await postJSON(`/api/jobs/${SESSION_ID}`, {
            url: 'https://e2e-test.com/job/3',
            title: 'Stats Job A',
            status: 'matched'
        });
        await postJSON(`/api/jobs/${SESSION_ID}`, {
            url: 'https://e2e-test.com/job/4',
            title: 'Stats Job B',
            status: 'matched'
        });

        const data = await fetchJSON(`/api/dashboard/${SESSION_ID}`);
        const stats = data.body.jobStats;
        expect(stats.total).toBeGreaterThanOrEqual(4);
        expect(stats.matched).toBeGreaterThanOrEqual(2);
    });

    test('GET /dashboard/:sessionId returns HTML page', async () => {
        const resp = await fetch(`${DS}/dashboard/${SESSION_ID}`);
        expect(resp.status).toBe(200);
        const html = await resp.text();
        expect(html).toContain('Job Search Dashboard');
        expect(html).toContain('Application Pipeline');
        expect(html).toContain('Job Listings');
    });
});
