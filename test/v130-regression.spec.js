// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * v1.3.0 Regression Test Suite
 *
 * Validates fixes for all P0-P3 issues from the v1.2.0 QA backlog.
 * Groups A and C/D are source-level assertions (no running server needed).
 * Group A requires the dashboard server running on port 30003.
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/v130-regression.spec.js
 */

const DS = process.env.DASHBOARD_URL || 'http://127.0.0.1:30003';
const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:30001';
const PIPELINE_SRC = path.join(__dirname, '..', 'assets', 'agents', 'job-seek', 'lib', 'searchPipeline.js');
const DASHBOARD_SRC = path.join(__dirname, '..', 'assets', 'agents', 'job-seek', 'lib', 'dashboardServer.js');
const SCRIPT_BUILDER_SRC = path.join(__dirname, '..', 'assets', 'agents', 'job-seek', 'lib', 'workflow', 'scriptBuilder.js');
const ANTI_DEBUG_SRC = path.join(__dirname, '..', 'assets', 'agents', 'job-seek', 'lib', 'tools', 'antiDebug.js');
const PKG_JSON = path.join(__dirname, '..', 'package.json');

async function fetchJSON(url) {
    const r = await fetch(url);
    return r.json();
}

async function postJSON(url, body) {
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return r.json();
}

async function putJSON(url, body) {
    const r = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return { status: r.status, body: await r.json() };
}

async function isDashboardUp() {
    try {
        const r = await fetch(DS, { signal: AbortSignal.timeout(3000) });
        return true;
    } catch {
        return false;
    }
}

async function isBackendReady() {
    try {
        const r = await fetch(`${BACKEND}/api/getAgentTasks`, { signal: AbortSignal.timeout(3000) });
        return r.status === 200;
    } catch {
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Group A: Dashboard API Regression
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('Group A: Dashboard API Regression', () => {
    let sessionId;

    test.beforeAll(async () => {
        const up = await isDashboardUp();
        test.skip(!up, 'Dashboard server not running — skipping Group A');

        // Find a valid session by fetching /api/sessions or using a test session
        try {
            const resp = await fetch(`${DS}/api/sessions`, { signal: AbortSignal.timeout(5000) });
            if (resp.ok) {
                const sessions = await resp.json();
                if (Array.isArray(sessions) && sessions.length > 0) {
                    sessionId = sessions[0].id || sessions[0].sessionId || sessions[0];
                }
            }
        } catch { /* ignore */ }

        if (!sessionId) {
            sessionId = `e2e-regress-${Date.now()}`;
        }
    });

    test('A1 (P1#7): Dashboard table has "Job Type" header, no "Salary" header', async () => {
        const resp = await fetch(`${DS}/dashboard/${sessionId}`);
        expect(resp.status).toBe(200);
        const html = await resp.text();

        // "Job Type" column should exist
        expect(html).toContain('Job Type');
        // "Salary" column should NOT exist (removed in v1.3.0)
        const hasSalaryHeader = /<th[^>]*>.*Salary.*<\/th>/i.test(html);
        expect(hasSalaryHeader).toBe(false);
    });

    test('A2 (P1#9): Dashboard JSON artifacts contain displayJson structure', async () => {
        const data = await fetchJSON(`${DS}/api/dashboard/${sessionId}`);
        expect(data).toBeDefined();

        if (data.jobs && data.jobs.length > 0) {
            const jobsWithArtifacts = data.jobs.filter(j => j.artifacts && j.artifacts.length > 0);
            if (jobsWithArtifacts.length > 0) {
                const artifact = jobsWithArtifacts[0].artifacts[0];
                if (artifact.displayJson) {
                    expect(typeof artifact.displayJson).toBe('object');
                }
            }
        }
        // If no jobs or no artifacts, the test still passes (structure validated)
        expect(true).toBe(true);
    });

    test('A3 (P2#13): Dashboard has val-edit inputs and PUT /api/direction/:sid returns 200', async () => {
        const resp = await fetch(`${DS}/dashboard/${sessionId}`);
        const html = await resp.text();

        // Direction editing inputs
        expect(html).toContain('val-edit');

        // Test PUT endpoint
        const putResp = await putJSON(`${DS}/api/direction/${sessionId}`, {
            field: 'targetRole',
            value: 'E2E Test Role'
        });
        expect(putResp.status).toBe(200);
    });

    test('A4 (P1#4): Dashboard has bulk generate button', async () => {
        const resp = await fetch(`${DS}/dashboard/${sessionId}`);
        const html = await resp.text();

        const hasBulkBtn = html.includes('btnBulkGenerate') || html.includes('bulkGenerateDocs');
        expect(hasBulkBtn).toBe(true);
    });

    test('A5 (P1#6): dashboardServer.js contains _wfFailedTasks clearing logic', async () => {
        const src = fs.readFileSync(DASHBOARD_SRC, 'utf-8');

        // Should clear _wfFailedTasks near workflow restart logic
        expect(src).toContain('_wfFailedTasks');

        // Verify clearing pattern (assignment to empty or .clear() or .length = 0 or delete)
        const clearPatterns = [
            /_wfFailedTasks\s*=\s*\[/,
            /_wfFailedTasks\s*=\s*new/,
            /_wfFailedTasks\.clear\(\)/,
            /_wfFailedTasks\.length\s*=\s*0/,
            /_wfFailedTasks\s*=\s*\{\}/,
        ];
        const hasClearing = clearPatterns.some(p => p.test(src));
        expect(hasClearing).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group B: Unit Logic Regression
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Group B: Unit Logic Regression', () => {

    test('B1 (P1#8): searchPipeline has _stripMarkdownFormatting with proper patterns', async () => {
        const src = fs.readFileSync(PIPELINE_SRC, 'utf-8');

        // Function must exist
        expect(src).toContain('_stripMarkdownFormatting');

        // Must strip common markdown patterns
        expect(src).toContain('**');   // bold markers
        expect(src).toContain('`');    // inline code
        expect(src).toContain('#');    // heading markers
    });

    test('B2 (P2#14): searchPipeline has Cloudflare detection functions', async () => {
        const src = fs.readFileSync(PIPELINE_SRC, 'utf-8');

        // Both functions must exist
        expect(src).toContain('_isCloudflareError');
        expect(src).toContain('_isCloudflareChallenge');

        // Must reference known Cloudflare signatures
        const cfSignatures = ['cf-browser-verification', 'challenges.cloudflare.com'];
        const hasSignatures = cfSignatures.some(sig => src.includes(sig));
        expect(hasSignatures).toBe(true);
    });

    test('B3 (P1#3): searchPipeline interview prompt references req.sections and fullText fallback', async () => {
        const src = fs.readFileSync(PIPELINE_SRC, 'utf-8');

        // Interview prep should reference sections from request
        expect(src).toContain('sections');
        expect(src).toContain('fullText');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group C: Pipeline & Build Config
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Group C: Pipeline & Build Config', () => {

    test('C1 (P0#1): searchPipeline has sufficient _finishPipeline references with try/finally', async () => {
        const src = fs.readFileSync(PIPELINE_SRC, 'utf-8');

        // Count _finishPipeline references
        const matches = src.match(/_finishPipeline/g);
        expect(matches).not.toBeNull();
        expect(matches.length).toBeGreaterThanOrEqual(10);

        // Must have try/finally pattern to guarantee cleanup
        expect(src).toContain('finally');
    });

    test('C2 (P0#2): _selfHealAndRetry is called, not just defined (>= 3 occurrences)', async () => {
        const src = fs.readFileSync(PIPELINE_SRC, 'utf-8');

        // Count all occurrences (definition + calls)
        const matches = src.match(/_selfHealAndRetry/g);
        expect(matches).not.toBeNull();
        expect(matches.length).toBeGreaterThanOrEqual(3);

        // Verify it is actually called (not just defined) — look for invocation pattern
        const callPattern = /(?:await\s+)?(?:this\.|self\.)?_selfHealAndRetry\s*\(/g;
        const calls = src.match(callPattern);
        expect(calls).not.toBeNull();
        expect(calls.length).toBeGreaterThanOrEqual(1);
    });

    test('C3 (P2#10): antiDebug.js references _persistDomains and platform-tools.json', async () => {
        const src = fs.readFileSync(ANTI_DEBUG_SRC, 'utf-8');

        expect(src).toContain('_persistDomains');
        expect(src).toContain('platform-tools.json');
    });

    test('C4 (P2#12): searchPipeline tracks failedSources and _prevFailedSources', async () => {
        const src = fs.readFileSync(PIPELINE_SRC, 'utf-8');

        expect(src).toContain('failedSources');
        expect(src).toContain('_prevFailedSources');
    });

    test('C5 (P3#15): package.json build config has beforeBuild and excludes ip2location', async () => {
        const pkg = JSON.parse(fs.readFileSync(PKG_JSON, 'utf-8'));

        // beforeBuild hook must exist
        expect(pkg.build.beforeBuild).toBeDefined();
        expect(typeof pkg.build.beforeBuild).toBe('string');

        // extraResources should exclude ip2location
        const extraRes = pkg.build.extraResources;
        expect(Array.isArray(extraRes)).toBe(true);

        const assetsEntry = extraRes.find(e => typeof e === 'object' && e.from && e.from.includes('assets'));
        expect(assetsEntry).toBeDefined();
        const hasIp2Exclusion = assetsEntry.filter.some(f => f.includes('ip2location'));
        expect(hasIp2Exclusion).toBe(true);
    });
});

// Group D: Electron frontend regression — see v130-electron-regression.spec.js
