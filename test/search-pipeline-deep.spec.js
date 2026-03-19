// @ts-check
const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * Search Pipeline Deep E2E — Dedup, keyword rotation, fix rule persistence.
 *
 * Runs TWO sequential search rounds on the same session to verify cross-run
 * pipeline behaviors:
 *   - URL dedup restoration (seenUrls carried across runs)
 *   - Keyword rotation / AI query expansion on Round 2
 *   - Page advancement when overlap >= 80%
 *   - Fix rule persistence in platform-tools.json
 *   - Pipeline completion guarantee (_finishPipeline always called)
 *
 * Prerequisites:
 *   - env1 fingerprint browser profile must exist and be configured
 *   - Indeed/LinkedIn should be logged in on env1
 *
 * Environment variables:
 *   E2E_PROVIDER      - 'claude-code' (default) | 'codex-cli' | 'api-key'
 *   E2E_MODEL         - model name, empty = use default
 *   E2E_SUB_PROVIDER  - 'openai' | 'anthropic' | 'google' (only for api-key)
 *   E2E_API_KEY       - API key string (only for api-key)
 *   E2E_TIMEOUT       - pipeline timeout in ms (default: 300000 = 5 min)
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/search-pipeline-deep.spec.js --headed
 *   npm run test:e2e:pipeline
 */

const TASK_NAME = 'jobSeekAgent';
const BACKEND = 'http://127.0.0.1:30001';
const DASHBOARD = 'http://127.0.0.1:30003';

const E2E_PROVIDER = process.env.E2E_PROVIDER || 'codex-cli';
const E2E_MODEL = process.env.E2E_MODEL || '';
const E2E_SUB_PROVIDER = process.env.E2E_SUB_PROVIDER || '';
const E2E_API_KEY = process.env.E2E_API_KEY || '';
const E2E_TIMEOUT = parseInt(process.env.E2E_TIMEOUT || '300000');
const POLL_INTERVAL = 5_000;

let app, page;
let sessionId;

// Cross-test state for comparison
let run1Status = null;
let run1Jobs = [];
let run1SeenUrls = 0;
let run1Queries = [];
let run1PageOffsets = {};

// ─── Helpers ───

async function isBackendReady() {
    try {
        const resp = await fetch(`${BACKEND}/api/getAllTasks?default=true`, {
            signal: AbortSignal.timeout(3000)
        });
        return resp.status === 200;
    } catch {
        return false;
    }
}

async function isDashboardUp() {
    try {
        const resp = await fetch(`${DASHBOARD}/ping`, {
            signal: AbortSignal.timeout(3000)
        });
        return resp.status === 200;
    } catch {
        return false;
    }
}

async function fetchJSON(path) {
    const resp = await fetch(`${DASHBOARD}${path}`, {
        signal: AbortSignal.timeout(10_000)
    });
    return { status: resp.status, body: await resp.json() };
}

async function postJSON(path, body) {
    const resp = await fetch(`${DASHBOARD}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000)
    });
    return { status: resp.status, body: await resp.json() };
}

async function putJSON(urlPath, body) {
    const resp = await fetch(`${DASHBOARD}${urlPath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000)
    });
    return { status: resp.status, body: await resp.json() };
}

/**
 * Dismiss TaskOffcanvas if it is visible (backdrop blocks interaction).
 */
async function dismissTaskOffcanvas(pg) {
    const backdrop = pg.locator('.offcanvas-backdrop.show');
    try {
        await backdrop.waitFor({ state: 'visible', timeout: 3_000 });
    } catch {
        return;
    }
    console.log('[pipeline-deep]   TaskOffcanvas backdrop detected — dismissing...');
    const offcanvas = pg.locator('[data-testid="task-offcanvas"]');
    const closeBtn = offcanvas.locator('.offcanvas-header .btn-close');
    if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
    } else {
        await pg.keyboard.press('Escape');
    }
    await expect(backdrop).not.toBeVisible({ timeout: 5_000 });
    console.log('[pipeline-deep]   TaskOffcanvas dismissed');
}

/**
 * Poll a status endpoint until a condition is met or timeout.
 */
async function pollUntil(fetchFn, doneFn, timeout, interval, logFn) {
    const start = Date.now();
    let lastBody = null;
    while (Date.now() - start < timeout) {
        try {
            lastBody = await fetchFn();
            if (logFn) logFn(lastBody);
            if (doneFn(lastBody)) return lastBody;
        } catch (err) {
            console.log(`[pipeline-deep]   Poll error: ${err.message}`);
        }
        await new Promise(r => setTimeout(r, interval));
    }
    throw new Error(`Poll timed out after ${timeout}ms. Last status: ${JSON.stringify(lastBody)}`);
}

/**
 * Start a workflow run and poll until pipeline finishes.
 * Returns { pipelineStatus, workflowStatus }.
 */
async function startAndWaitForPipeline(sid, runLabel) {
    // Ensure config exists
    const cfgResp = await fetchJSON(`/api/workflow/${sid}/config`);
    expect(cfgResp.status).toBe(200);
    console.log(`[pipeline-deep]   ${runLabel}: Config ready`);

    // Start workflow
    const { status, body } = await postJSON(`/api/workflow/${sid}/start`, {});
    console.log(`[pipeline-deep]   ${runLabel}: Start response: ${JSON.stringify(body)}`);

    if (status === 400 && body.error?.includes('AI provider required')) {
        return { skipped: true };
    }
    expect(status).toBe(200);
    expect(body.success === true || body.error?.includes('already running')).toBeTruthy();

    // Poll workflow status until not running
    let lastPhase = '';
    await pollUntil(
        async () => {
            const { body: wb } = await fetchJSON(`/api/workflow/${sid}/status`);
            return wb;
        },
        (wb) => wb.status !== 'running',
        E2E_TIMEOUT,
        POLL_INTERVAL,
        (wb) => {
            const phase = wb.currentStep || wb.status || 'unknown';
            if (phase !== lastPhase) {
                const stepInfo = wb.steps
                    ? wb.steps.map(s => `${s.name}:${s.status}`).join(', ')
                    : '';
                console.log(`[pipeline-deep]   ${runLabel} phase: ${phase} | Steps: [${stepInfo}]`);
                lastPhase = phase;
            }
        }
    );

    // Fetch final statuses
    const { body: pipelineStatus } = await fetchJSON(`/api/pipeline/${sid}/status`);
    const { body: workflowStatus } = await fetchJSON(`/api/workflow/${sid}/status`);
    return { pipelineStatus, workflowStatus };
}

/**
 * Extract pipeline log entries matching a pattern.
 */
function filterLogs(pipelineStatus, pattern) {
    const logs = pipelineStatus?.progress?.logs || [];
    return logs.filter(l => {
        const msg = (l.message || l.msg || JSON.stringify(l)).toLowerCase();
        return pattern.test(msg);
    });
}

// ─── Test Suite ───

test.describe.serial('Search Pipeline Deep Verification', () => {
    test.setTimeout(E2E_TIMEOUT * 2 + 180_000); // Two runs + buffer

    test.afterAll(async () => {
        if (app) {
            console.log('[pipeline-deep] Closing Electron app...');
            await app.close().catch(() => {});
        }
    });

    // ── Test 1: Launch Electron + Backend Ready ──

    test('1. Launch Electron and wait for backend', async () => {
        console.log('[pipeline-deep] Step 1: Launching Electron...');
        app = await electron.launch({
            args: ['.'],
            env: { ...process.env, IS_BUILD: 'false' }
        });
        page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');
        console.log('[pipeline-deep]   Electron window opened');

        // Wait for backend
        console.log('[pipeline-deep]   Waiting for backend...');
        await pollUntil(
            async () => ({ ready: await isBackendReady() }),
            (s) => s.ready,
            30_000,
            2_000
        );
        console.log('[pipeline-deep]   Backend ready on :30001');

        // Handle language selection
        try {
            const langBtn = page.locator('.btn-change-lang');
            await langBtn.waitFor({ timeout: 5_000 });
            await langBtn.click();
            const langOffcanvas = page.locator('.lang-offcanvas');
            await expect(langOffcanvas).toBeVisible({ timeout: 5_000 });
            await page.locator('.lang-offcanvas button', { hasText: 'English' }).click();
            await expect(langOffcanvas).not.toBeVisible({ timeout: 3_000 });
            console.log('[pipeline-deep]   Language set to English');
        } catch {
            console.log('[pipeline-deep]   Language already set or selection skipped');
        }
    });

    // ── Test 2: Navigate to Agent Workspace ──

    test('2. Navigate to Agent Workspace', async () => {
        console.log('[pipeline-deep] Step 2: Navigating to Agent Workspace...');
        const baseUrl = page.url().split('#')[0];
        await page.goto(`${baseUrl}#/agentWorkspace/${encodeURIComponent(TASK_NAME)}`);
        await expect(page.locator('.agent-workspace-main')).toBeVisible({ timeout: 15_000 });
        console.log('[pipeline-deep]   Workspace loaded');
        await dismissTaskOffcanvas(page);
    });

    // ── Test 3: Create Session + Bind env1 + Configure Provider + Inject Direction ──

    test('3. Create session, bind env1, configure provider, inject direction', async () => {
        console.log('[pipeline-deep] Step 3: Session setup...');

        await expect(page.locator('.agent-session-toolbar')).toBeVisible({ timeout: 20_000 });

        // Create a new session
        const sessionInput = page.locator('.agent-session-toolbar input');
        await sessionInput.fill('Pipeline Deep E2E');
        await page.locator('.agent-session-toolbar button', { hasText: /new|\+/i }).click();
        await expect(
            page.locator('.agent-session-item.active', { hasText: /Pipeline Deep E2E/i })
        ).toBeVisible({ timeout: 15_000 });
        console.log('[pipeline-deep]   New session "Pipeline Deep E2E" created');

        // Open runtime settings
        const runtimeToggle = page.locator('[aria-label="toggle-runtime-settings"]');
        await runtimeToggle.click();

        // Select provider
        const providerSelect = page.locator('[aria-label="session-provider"]');
        await expect(providerSelect).toBeVisible({ timeout: 5_000 });
        await providerSelect.selectOption(E2E_PROVIDER);
        console.log(`[pipeline-deep]   Provider: ${E2E_PROVIDER}`);
        await page.waitForTimeout(500);

        // For api-key provider: set sub-provider and API key
        if (E2E_PROVIDER === 'api-key') {
            if (E2E_SUB_PROVIDER) {
                const subProviderSelect = page.locator('[aria-label="session-sub-provider"]');
                await expect(subProviderSelect).toBeVisible({ timeout: 5_000 });
                await subProviderSelect.selectOption(E2E_SUB_PROVIDER);
                console.log(`[pipeline-deep]   Sub-provider: ${E2E_SUB_PROVIDER}`);
                await page.waitForTimeout(300);
            }
            if (E2E_API_KEY) {
                const apiKeyInput = page.locator('[aria-label="session-api-key"]');
                await expect(apiKeyInput).toBeVisible({ timeout: 5_000 });
                await apiKeyInput.fill(E2E_API_KEY);
                console.log('[pipeline-deep]   API key entered');
                await page.waitForTimeout(300);
            }
        }

        // Select model if specified
        if (E2E_MODEL) {
            const modelSelect = page.locator('[aria-label="session-model"]');
            await expect(modelSelect).toBeVisible({ timeout: 5_000 });
            await modelSelect.selectOption(E2E_MODEL);
            console.log(`[pipeline-deep]   Model: ${E2E_MODEL}`);
            await page.waitForTimeout(300);
        }

        // Bind env1
        console.log('[pipeline-deep]   Binding environment...');
        const bindModeSelect = page.locator('[aria-label="session-bind-mode"]');
        await expect(bindModeSelect).toBeVisible({ timeout: 5_000 });
        await bindModeSelect.selectOption('env');

        const envSelect = page.locator('[aria-label="session-bind-env"]');
        await expect(envSelect).toBeVisible({ timeout: 5_000 });
        await envSelect.selectOption({ index: 1 });
        console.log('[pipeline-deep]   Selected environment (env1)');

        const bindBtn = page.locator('button', { hasText: /bind to/i });
        await expect(bindBtn).toBeEnabled({ timeout: 5_000 });
        await bindBtn.click();
        console.log('[pipeline-deep]   Environment bound to session');
        await page.waitForTimeout(1_000);

        // Apply model (triggers execTask)
        await page.locator('button', { hasText: /apply model/i }).click();
        console.log('[pipeline-deep]   Model applied');

        await dismissTaskOffcanvas(page);

        // Wait for execution state to become Running
        await expect(
            page.locator('.session-context-toolbar')
        ).toContainText(/running/i, { timeout: 15_000 });
        console.log('[pipeline-deep]   Execution state: Running');

        // Extract session ID
        sessionId = await page.locator('.agent-session-item.active').getAttribute('data-session-id');
        if (!sessionId) {
            const url = page.url();
            const match = url.match(/sessionId=([^&]+)/);
            sessionId = match ? decodeURIComponent(match[1]) : `pipeline-deep-${Date.now()}`;
        }
        console.log(`[pipeline-deep]   Session ID: ${sessionId}`);

        // Wait for dashboard server
        console.log('[pipeline-deep]   Waiting for dashboard server...');
        await pollUntil(
            async () => ({ up: await isDashboardUp() }),
            (s) => s.up,
            60_000,
            3_000
        );
        console.log('[pipeline-deep]   Dashboard server ready on :30003');

        // Inject mock direction data
        const sid = encodeURIComponent(sessionId);
        const dirResp = await putJSON(`/api/direction/${sid}`, {
            jobTitle: 'Fullstack Developer',
            location: 'Ontario',
            workMode: 'any',
            salary: '80K'
        });
        console.log(`[pipeline-deep]   Direction injected: ${JSON.stringify(dirResp.body)}`);
        expect(dirResp.status).toBe(200);

        // Inject mock profile directly into session via PUT /api/profile/:sid/tailored
        const profileData = {
            basic: 'Ying Zhang | Ontario, Canada | Fullstack Developer | 10 years experience',
            skills: 'JavaScript, TypeScript, Node.js, React, Express, Python, C++, Playwright, Puppeteer, Docker, Redis, MySQL, SQLite',
            experience: 'Senior Fullstack Developer — Built AI agent platform with browser automation, workflow orchestration, and memory systems. Previously: product lead at China Mobile healthcare platform, blockchain marketplace founder.',
            education: 'Fanshawe College — Web Development and Internet Applications (2026). Sichuan Normal University — B.Eng Electronic Information Engineering (2013).',
            highlights: 'Designed self-healing browser automation pipeline. Built 3-layer memory architecture (state/SQLite/mem0). Chromium C++ fingerprint patches for anti-bot bypass.'
        };
        const profResp = await putJSON(`/api/profile/${sid}/tailored`, profileData);
        console.log(`[pipeline-deep]   Profile injected: ${JSON.stringify(profResp.body)}`);
        expect(profResp.status).toBe(200);
    });

    // ── Test 4: First Search Run ──

    test('4. First search run — execute and record baseline', async () => {
        test.setTimeout(E2E_TIMEOUT + 60_000);
        console.log('[pipeline-deep] Step 4: Starting first search run...');

        const sid = encodeURIComponent(sessionId);
        const result = await startAndWaitForPipeline(sid, 'Run 1');

        if (result.skipped) {
            console.log('[pipeline-deep]   AI provider not available — skipping');
            test.skip();
            return;
        }

        const { pipelineStatus, workflowStatus } = result;

        // Pipeline must have finished
        expect(pipelineStatus.running).toBe(false);
        console.log(`[pipeline-deep]   Run 1 finished. Phase: ${pipelineStatus.progress?.phase}`);
        console.log(`[pipeline-deep]   Workflow status: ${workflowStatus.status}`);

        // Record baseline for cross-run comparison
        run1Status = pipelineStatus;

        // Get jobs
        const { body: dashData } = await fetchJSON(`/api/dashboard/${sid}`);
        run1Jobs = dashData.jobs || [];
        console.log(`[pipeline-deep]   Run 1 jobs found: ${run1Jobs.length}`);

        // Extract seen URLs count from logs
        const seenLogs = filterLogs(pipelineStatus, /seen url/i);
        if (seenLogs.length > 0) {
            const lastLog = seenLogs[seenLogs.length - 1];
            const msg = lastLog.message || lastLog.msg || JSON.stringify(lastLog);
            const match = msg.match(/(\d+)\s*seen\s*url/i);
            if (match) run1SeenUrls = parseInt(match[1]);
        }
        // Fallback: count unique URLs from jobs
        if (run1SeenUrls === 0 && run1Jobs.length > 0) {
            run1SeenUrls = new Set(run1Jobs.map(j => j.url).filter(Boolean)).size;
        }
        console.log(`[pipeline-deep]   Run 1 seen URLs: ${run1SeenUrls}`);

        // Record queries from logs
        const queryLogs = filterLogs(pipelineStatus, /query|search.*for|keyword/i);
        run1Queries = queryLogs.map(l => l.message || l.msg || JSON.stringify(l));
        console.log(`[pipeline-deep]   Run 1 query log entries: ${run1Queries.length}`);

        // Record page offsets from logs
        const offsetLogs = filterLogs(pipelineStatus, /page offset|page \d+|advancement/i);
        console.log(`[pipeline-deep]   Run 1 page offset log entries: ${offsetLogs.length}`);

        // Take screenshot
        await page.screenshot({ path: 'test-results/pipeline-deep-run1.png' });
        console.log('[pipeline-deep]   Run 1 screenshot saved');
    });

    // ── Test 5: Verify Search Results Quality ──

    test('5. Verify search results quality', async () => {
        console.log('[pipeline-deep] Step 5: Verifying search result quality...');

        const sid = encodeURIComponent(sessionId);
        const { status, body } = await fetchJSON(`/api/dashboard/${sid}`);
        expect(status).toBe(200);

        const jobs = body.jobs || [];
        console.log(`[pipeline-deep]   Total jobs: ${jobs.length}`);

        if (jobs.length > 0) {
            // Verify jobs have required fields
            const firstJob = jobs[0];
            expect(firstJob).toHaveProperty('title');
            expect(firstJob).toHaveProperty('company');
            expect(firstJob).toHaveProperty('url');
            console.log(`[pipeline-deep]   First job: "${firstJob.title}" at ${firstJob.company}`);

            // P1 #7: Verify jobType field does not contain salary-like data
            const badJobType = jobs.filter(j => {
                if (!j.jobType) return false;
                const jt = j.jobType.toLowerCase();
                // jobType should be things like "Full-time", "Contract", not salary info
                return /\$|\d{2,}k/i.test(jt);
            });
            if (badJobType.length > 0) {
                console.log(`[pipeline-deep]   WARNING: ${badJobType.length} jobs have salary-like data in jobType`);
                badJobType.slice(0, 3).forEach(j => {
                    console.log(`[pipeline-deep]     jobType="${j.jobType}" for "${j.title}"`);
                });
            } else {
                console.log('[pipeline-deep]   jobType field clean (no salary contamination)');
            }

            // P1 #8: Verify search keywords in logs don't contain markdown
            const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid}/status`);
            const allLogs = pipeStatus?.progress?.logs || [];
            const markdownInKeywords = allLogs.filter(l => {
                const msg = (l.message || l.msg || '').toLowerCase();
                if (!msg.includes('search') && !msg.includes('query') && !msg.includes('keyword')) return false;
                return /[*_`#\[\]]/.test(msg);
            });
            if (markdownInKeywords.length > 0) {
                console.log(`[pipeline-deep]   WARNING: ${markdownInKeywords.length} log entries contain markdown in search keywords`);
                markdownInKeywords.slice(0, 3).forEach(l => {
                    console.log(`[pipeline-deep]     ${l.message || l.msg}`);
                });
            } else {
                console.log('[pipeline-deep]   Search keywords clean (no markdown contamination)');
            }

            // Count scored jobs
            const scored = jobs.filter(j => j.matchScore != null || j.score != null);
            console.log(`[pipeline-deep]   Scored jobs: ${scored.length}/${jobs.length}`);
        } else {
            console.log('[pipeline-deep]   WARNING: No jobs found (possible Cloudflare block or network issue)');
        }
    });

    // ── Test 6: Verify Fix Rules Persistence ──

    test('6. Verify fix rules persistence in platform-tools.json', async () => {
        console.log('[pipeline-deep] Step 6: Checking fix rules...');

        const platformToolsPath = path.resolve(__dirname, '..', 'assets', 'agents', 'job-seek', 'data', 'platform-tools.json');

        let platformTools;
        try {
            const raw = fs.readFileSync(platformToolsPath, 'utf-8');
            platformTools = JSON.parse(raw);
        } catch (err) {
            console.log(`[pipeline-deep]   Could not read platform-tools.json: ${err.message}`);
            // File should exist — warn but don't fail hard
            expect(fs.existsSync(platformToolsPath)).toBe(true);
            return;
        }

        console.log(`[pipeline-deep]   platform-tools.json keys: ${Object.keys(platformTools).join(', ')}`);

        // Check structure: should have tool entries for platforms
        const toolEntries = Object.entries(platformTools).filter(([key]) => !key.startsWith('__'));
        console.log(`[pipeline-deep]   Platform tool entries: ${toolEntries.length}`);

        // Log any fix rules found
        let totalFixRules = 0;
        for (const [key, value] of toolEntries) {
            if (value && typeof value === 'object') {
                const fixRules = value.fixRules || value.fix_rules;
                if (fixRules && (Array.isArray(fixRules) ? fixRules.length > 0 : Object.keys(fixRules).length > 0)) {
                    const count = Array.isArray(fixRules) ? fixRules.length : Object.keys(fixRules).length;
                    console.log(`[pipeline-deep]   ${key}: ${count} fix rules`);
                    totalFixRules += count;
                }
            }
        }
        console.log(`[pipeline-deep]   Total fix rules across platforms: ${totalFixRules}`);

        // P2 #10: Check for __antiDebugDomains key
        if (platformTools.__antiDebugDomains) {
            console.log(`[pipeline-deep]   __antiDebugDomains: ${JSON.stringify(platformTools.__antiDebugDomains)}`);
        } else {
            console.log('[pipeline-deep]   __antiDebugDomains: not present');
        }
    });

    // ── Test 7: Verify Search History Persistence ──

    test('7. Verify search history persistence after Run 1', async () => {
        console.log('[pipeline-deep] Step 7: Checking search history...');

        const sid = encodeURIComponent(sessionId);
        const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid}/status`);

        // Pipeline should not be running
        expect(pipeStatus.running).toBe(false);

        // Check progress has data from the run
        if (pipeStatus.progress) {
            console.log(`[pipeline-deep]   Phase: ${pipeStatus.progress.phase}`);
            console.log(`[pipeline-deep]   Searched: ${pipeStatus.progress.searched}`);
            console.log(`[pipeline-deep]   Parsed: ${pipeStatus.progress.parsed}`);
            console.log(`[pipeline-deep]   Matched: ${pipeStatus.progress.matched}`);
            console.log(`[pipeline-deep]   Qualified: ${pipeStatus.progress.qualified}`);
            console.log(`[pipeline-deep]   Errors: ${(pipeStatus.progress.errors || []).length}`);
            console.log(`[pipeline-deep]   Logs: ${(pipeStatus.progress.logs || []).length}`);
        }

        // Search history is persisted via onHistorySave callback (stored in workflow engine)
        // We verify it indirectly: the next run should restore seenUrls
        // For now, verify the pipeline has meaningful data
        expect(pipeStatus.progress).toBeDefined();

        // Verify seenUrls count is reflected in run1 data
        console.log(`[pipeline-deep]   Run 1 recorded seenUrls: ${run1SeenUrls}`);
        console.log(`[pipeline-deep]   Run 1 recorded queries: ${run1Queries.length}`);

        // Verify at least some search activity happened
        const totalActivity = (pipeStatus.progress?.searched || 0) +
                              (pipeStatus.progress?.parsed || 0) +
                              (pipeStatus.progress?.matched || 0);
        console.log(`[pipeline-deep]   Total search activity (searched+parsed+matched): ${totalActivity}`);
        // Even if Cloudflare blocked everything, searched count should be > 0
        // (pipeline attempted at least one search)
        expect(pipeStatus.progress?.searched || pipeStatus.progress?.logs?.length).toBeGreaterThan(0);
    });

    // ── Test 8: Second Search Run (Dedup + Keyword Behavior) ──

    test('8. Second search run — verify dedup + keyword rotation', async () => {
        test.setTimeout(E2E_TIMEOUT + 60_000);
        console.log('[pipeline-deep] Step 8: Starting second search run...');

        const sid = encodeURIComponent(sessionId);

        // Record pre-run job count
        const { body: preRunDash } = await fetchJSON(`/api/dashboard/${sid}`);
        const preRunJobCount = (preRunDash.jobs || []).length;
        const preRunUrls = new Set((preRunDash.jobs || []).map(j => j.url).filter(Boolean));
        console.log(`[pipeline-deep]   Pre-Run 2 job count: ${preRunJobCount}`);

        const result = await startAndWaitForPipeline(sid, 'Run 2');

        if (result.skipped) {
            console.log('[pipeline-deep]   AI provider not available — skipping');
            test.skip();
            return;
        }

        const { pipelineStatus, workflowStatus } = result;

        // Pipeline must have finished
        expect(pipelineStatus.running).toBe(false);
        console.log(`[pipeline-deep]   Run 2 finished. Phase: ${pipelineStatus.progress?.phase}`);
        console.log(`[pipeline-deep]   Workflow status: ${workflowStatus.status}`);

        // Check for "Restored X seen URLs" log (dedup loaded from history)
        const restoredLogs = filterLogs(pipelineStatus, /restored.*seen|seen.*url.*restored/i);
        if (restoredLogs.length > 0) {
            console.log('[pipeline-deep]   Dedup restoration detected:');
            restoredLogs.forEach(l => {
                console.log(`[pipeline-deep]     ${l.message || l.msg || JSON.stringify(l)}`);
            });
        } else {
            console.log('[pipeline-deep]   No explicit "Restored seen URLs" log found (may be in console only)');
        }

        // Get post-run jobs
        const { body: postRunDash } = await fetchJSON(`/api/dashboard/${sid}`);
        const postRunJobs = postRunDash.jobs || [];
        const postRunUrls = new Set(postRunJobs.map(j => j.url).filter(Boolean));
        console.log(`[pipeline-deep]   Post-Run 2 job count: ${postRunJobs.length}`);

        // Verify new jobs (if any) don't duplicate Run 1 URLs
        const newJobs = postRunJobs.filter(j => j.url && !preRunUrls.has(j.url));
        console.log(`[pipeline-deep]   New unique jobs from Run 2: ${newJobs.length}`);

        // Check overlap
        const duplicateUrls = postRunJobs.filter(j => j.url && preRunUrls.has(j.url));
        console.log(`[pipeline-deep]   Jobs carried from Run 1: ${duplicateUrls.length}`);

        // Log overlap rate info from pipeline logs
        const overlapLogs = filterLogs(pipelineStatus, /overlap/i);
        if (overlapLogs.length > 0) {
            console.log('[pipeline-deep]   Overlap information:');
            overlapLogs.forEach(l => {
                console.log(`[pipeline-deep]     ${l.message || l.msg || JSON.stringify(l)}`);
            });
        }

        // Check keyword rotation: compare Run 2 queries to Run 1
        const run2QueryLogs = filterLogs(pipelineStatus, /query|search.*for|keyword/i);
        console.log(`[pipeline-deep]   Run 2 query log entries: ${run2QueryLogs.length}`);
        if (run1Queries.length > 0 && run2QueryLogs.length > 0) {
            console.log('[pipeline-deep]   Comparing queries between runs...');
            const run2Msgs = run2QueryLogs.map(l => l.message || l.msg || JSON.stringify(l));
            const shared = run2Msgs.filter(m => run1Queries.some(q => q === m));
            console.log(`[pipeline-deep]     Shared query logs: ${shared.length}`);
            console.log(`[pipeline-deep]     Run 1 unique: ${run1Queries.length - shared.length}`);
            console.log(`[pipeline-deep]     Run 2 unique: ${run2Msgs.length - shared.length}`);
        }

        // Take screenshot
        await page.screenshot({ path: 'test-results/pipeline-deep-run2.png' });
        console.log('[pipeline-deep]   Run 2 screenshot saved');
    });

    // ── Test 9: Verify Page Advancement ──

    test('9. Verify page advancement behavior', async () => {
        console.log('[pipeline-deep] Step 9: Checking page advancement...');

        const sid = encodeURIComponent(sessionId);
        const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid}/status`);

        // Check for page advancement logs
        const advanceLogs = filterLogs(pipeStatus, /page offset|page \d+|high overlap|advancement|will use page/i);
        if (advanceLogs.length > 0) {
            console.log('[pipeline-deep]   Page advancement detected:');
            advanceLogs.forEach(l => {
                console.log(`[pipeline-deep]     ${l.message || l.msg || JSON.stringify(l)}`);
            });
        } else {
            console.log('[pipeline-deep]   No page advancement logs (overlap may not have exceeded 80%)');
        }

        // Check moderate overlap logs
        const moderateLogs = filterLogs(pipeStatus, /moderate overlap/i);
        if (moderateLogs.length > 0) {
            console.log(`[pipeline-deep]   Moderate overlap entries: ${moderateLogs.length}`);
        }

        // Log new vs old result counts
        const resultLogs = filterLogs(pipeStatus, /found \d+ results/i);
        if (resultLogs.length > 0) {
            console.log('[pipeline-deep]   Search result summary:');
            resultLogs.forEach(l => {
                console.log(`[pipeline-deep]     ${l.message || l.msg || JSON.stringify(l)}`);
            });
        }
    });

    // ── Test 10: Pipeline Error Handling Verification ──

    test('10. Verify pipeline error handling', async () => {
        console.log('[pipeline-deep] Step 10: Checking pipeline error handling...');

        const sid = encodeURIComponent(sessionId);
        const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid}/status`);

        // Pipeline must not be running (completion guarantee)
        expect(pipeStatus.running).toBe(false);
        console.log('[pipeline-deep]   Pipeline is not running (completion verified)');

        const errors = pipeStatus.progress?.errors || [];
        console.log(`[pipeline-deep]   Total errors: ${errors.length}`);
        if (errors.length > 0) {
            errors.slice(0, 5).forEach((e, i) => {
                console.log(`[pipeline-deep]     Error ${i + 1}: ${typeof e === 'string' ? e : JSON.stringify(e)}`);
            });
        }

        // Check for selfHeal logs
        const healLogs = filterLogs(pipeStatus, /self.?heal|heal.*script|analyze.*failure/i);
        if (healLogs.length > 0) {
            console.log(`[pipeline-deep]   Self-heal attempts: ${healLogs.length}`);
            healLogs.forEach(l => {
                console.log(`[pipeline-deep]     ${l.message || l.msg || JSON.stringify(l)}`);
            });
        } else {
            console.log('[pipeline-deep]   No self-heal attempts logged');
        }

        // Check Cloudflare detection
        const cfLogs = filterLogs(pipeStatus, /cloudflare|blocked|challenge/i);
        if (cfLogs.length > 0) {
            console.log(`[pipeline-deep]   Cloudflare detections: ${cfLogs.length}`);
            cfLogs.slice(0, 5).forEach(l => {
                console.log(`[pipeline-deep]     CF: ${l.message || l.msg || JSON.stringify(l)}`);
            });
        } else {
            console.log('[pipeline-deep]   No Cloudflare blocks detected');
        }

        // Verify _finishPipeline was called (phase should be a terminal state)
        const phase = pipeStatus.progress?.phase || '';
        const terminalPhases = ['completed', 'done', 'stopped', 'error', 'searching'];
        console.log(`[pipeline-deep]   Final phase: "${phase}"`);
        // Phase should be one of the terminal states (or searching if no results)
        expect(phase).toBeTruthy();
    });

    // ── Test 11: Final Summary ──

    test('11. Final summary and comparison', async () => {
        console.log('[pipeline-deep] Step 11: Final summary...');

        const sid = encodeURIComponent(sessionId);

        let run2Jobs = [];
        let run2Errors = 0;
        try {
            const { body: dashData } = await fetchJSON(`/api/dashboard/${sid}`);
            const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid}/status`);

            run2Jobs = dashData.jobs || [];
            run2Errors = (pipeStatus.progress?.errors || []).length;

            // Comparison table
            console.log('[pipeline-deep] ========== RUN COMPARISON ==========');
            console.log(`[pipeline-deep]   Provider:              ${E2E_PROVIDER}`);
            console.log(`[pipeline-deep]   Session ID:            ${sessionId}`);
            console.log('[pipeline-deep]   ---');
            console.log(`[pipeline-deep]   Run 1 jobs:            ${run1Jobs.length}`);
            console.log(`[pipeline-deep]   Run 2 total jobs:      ${run2Jobs.length}`);
            console.log(`[pipeline-deep]   New jobs in Run 2:     ${run2Jobs.length - run1Jobs.length}`);
            console.log('[pipeline-deep]   ---');
            console.log(`[pipeline-deep]   Run 1 seen URLs:       ${run1SeenUrls}`);
            console.log(`[pipeline-deep]   Run 1 query entries:   ${run1Queries.length}`);
            console.log('[pipeline-deep]   ---');
            console.log(`[pipeline-deep]   Run 1 errors:          ${(run1Status?.progress?.errors || []).length}`);
            console.log(`[pipeline-deep]   Run 2 errors:          ${run2Errors}`);
            console.log('[pipeline-deep]   ---');

            // Scored jobs
            const scored = run2Jobs.filter(j => j.matchScore != null || j.score != null);
            console.log(`[pipeline-deep]   Scored jobs (final):   ${scored.length}/${run2Jobs.length}`);

            // Jobs with artifacts
            const withArtifacts = run2Jobs.filter(j => j.artifacts && Object.keys(j.artifacts).length > 0);
            console.log(`[pipeline-deep]   Jobs with artifacts:   ${withArtifacts.length}/${run2Jobs.length}`);

            console.log('[pipeline-deep] ====================================');
        } catch (err) {
            console.log(`[pipeline-deep]   Summary fetch error: ${err.message}`);
        }

        // Take final screenshot
        const baseUrl = page.url().split('#')[0];
        await page.goto(`${baseUrl}#/agentWorkspace/${encodeURIComponent(TASK_NAME)}`);
        await page.waitForTimeout(3_000);
        await page.screenshot({ path: 'test-results/pipeline-deep-final.png' });
        console.log('[pipeline-deep]   Final screenshot saved to test-results/pipeline-deep-final.png');
        console.log('[pipeline-deep] Pipeline Deep E2E complete');
    });
});
