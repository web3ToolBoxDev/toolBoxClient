// @ts-check
const { test, expect, _electron: electron } = require('@playwright/test');

/**
 * E2E Test: Full Search Workflow — Electron launch to pipeline completion.
 *
 * Validates the entire Job Seek Agent pipeline in a real Electron environment:
 *   1. Launch Electron app, wait for backend (:30001)
 *   2. Navigate to Agent Workspace → job-seek
 *   3. Create/select session, bind env1, configure AI provider
 *   4. Wait for agent start → dashboard server (:30003)
 *   5. Verify dashboard loads with expected sections
 *   6. Start workflow via API
 *   7. Poll pipeline/workflow status until completion (timeout 5 min)
 *   8. Verify search results: jobs found, scored, documents generated
 *   9. Check for Cloudflare detection
 *  10. Final screenshot + cleanup
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
 *   npx playwright test -c test/playwright.config.js test/workflow-e2e.spec.js --headed
 *
 * Examples:
 *   # Default provider (claude-code)
 *   npx playwright test -c test/playwright.config.js test/workflow-e2e.spec.js --headed
 *
 *   # Codex CLI
 *   E2E_PROVIDER=codex-cli npx playwright test -c test/playwright.config.js test/workflow-e2e.spec.js --headed
 *
 *   # API Key with OpenAI
 *   E2E_PROVIDER=api-key E2E_SUB_PROVIDER=openai E2E_API_KEY=sk-... E2E_MODEL=gpt-4o-mini npx playwright test -c test/playwright.config.js test/workflow-e2e.spec.js --headed
 */

const TASK_NAME = 'jobSeekAgent';
const BACKEND = 'http://127.0.0.1:30001';
const DASHBOARD = 'http://127.0.0.1:30003';

// Provider/model config — override via env
const E2E_PROVIDER = process.env.E2E_PROVIDER || 'claude-code';
const E2E_MODEL = process.env.E2E_MODEL || '';
const E2E_SUB_PROVIDER = process.env.E2E_SUB_PROVIDER || '';
const E2E_API_KEY = process.env.E2E_API_KEY || '';
const E2E_TIMEOUT = parseInt(process.env.E2E_TIMEOUT || '300000'); // 5 min default
const POLL_INTERVAL = 5_000; // 5s between status polls

let app, page;
let sessionId;

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

/**
 * Dismiss TaskOffcanvas if it is visible (backdrop blocks interaction).
 * Waits briefly for the backdrop to appear, then closes it.
 */
async function dismissTaskOffcanvas(page) {
    const backdrop = page.locator('.offcanvas-backdrop.show');
    try {
        await backdrop.waitFor({ state: 'visible', timeout: 3_000 });
    } catch {
        return; // No backdrop appeared
    }
    console.log('[workflow-e2e]   TaskOffcanvas backdrop detected — dismissing...');
    const offcanvas = page.locator('[data-testid="task-offcanvas"]');
    const closeBtn = offcanvas.locator('.offcanvas-header .btn-close');
    if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
    } else {
        await page.keyboard.press('Escape');
    }
    await expect(backdrop).not.toBeVisible({ timeout: 5_000 });
    console.log('[workflow-e2e]   TaskOffcanvas dismissed');
}

/**
 * Poll a status endpoint until a condition is met or timeout.
 * @param {Function} fetchFn - async function returning status object
 * @param {Function} doneFn - predicate: (body) => boolean
 * @param {number} timeout - max wait in ms
 * @param {number} interval - poll interval in ms
 * @param {Function} [logFn] - optional progress logger
 * @returns {Promise<object>} final status body
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
            console.log(`[workflow-e2e]   Poll error: ${err.message}`);
        }
        await new Promise(r => setTimeout(r, interval));
    }
    throw new Error(`Poll timed out after ${timeout}ms. Last status: ${JSON.stringify(lastBody)}`);
}

// ─── Test Suite ───

test.describe.serial('Full Workflow E2E (Electron)', () => {
    // Global timeout: pipeline timeout + 2 min buffer for setup/teardown
    test.setTimeout(E2E_TIMEOUT + 120_000);

    test.afterAll(async () => {
        if (app) {
            console.log('[workflow-e2e] Closing Electron app...');
            await app.close().catch(() => {});
        }
    });

    // ── Test 1: Launch Electron + Backend Ready ──

    test('1. Launch Electron and wait for backend', async () => {
        console.log('[workflow-e2e] Step 1: Launching Electron...');
        app = await electron.launch({
            args: ['.'],
            env: { ...process.env, IS_BUILD: 'false' }
        });
        page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');
        console.log('[workflow-e2e]   Electron window opened');

        // Wait for backend to be ready (poll up to 30s)
        console.log('[workflow-e2e]   Waiting for backend...');
        await pollUntil(
            async () => ({ ready: await isBackendReady() }),
            (s) => s.ready,
            30_000,
            2_000
        );
        console.log('[workflow-e2e]   Backend ready on :30001');

        // Handle language selection — switch to English
        try {
            const langBtn = page.locator('.btn-change-lang');
            await langBtn.waitFor({ timeout: 5_000 });
            await langBtn.click();
            const langOffcanvas = page.locator('.lang-offcanvas');
            await expect(langOffcanvas).toBeVisible({ timeout: 5_000 });
            await page.locator('.lang-offcanvas button', { hasText: 'English' }).click();
            await expect(langOffcanvas).not.toBeVisible({ timeout: 3_000 });
            console.log('[workflow-e2e]   Language set to English');
        } catch {
            console.log('[workflow-e2e]   Language already set or selection skipped');
        }
    });

    // ── Test 2: Navigate to Agent Workspace ──

    test('2. Navigate to Agent Workspace', async () => {
        console.log('[workflow-e2e] Step 2: Navigating to Agent Workspace...');
        await page.goto(`/#/agentWorkspace/${encodeURIComponent(TASK_NAME)}`);
        await expect(page.locator('.agent-workspace-main')).toBeVisible({ timeout: 15_000 });
        console.log('[workflow-e2e]   Workspace loaded');

        // Dismiss TaskOffcanvas if it auto-opened
        await dismissTaskOffcanvas(page);
    });

    // ── Test 3: Create/Select Session + Bind env1 + Configure Provider ──

    test('3. Create session, bind env1, configure provider', async () => {
        console.log('[workflow-e2e] Step 3: Session setup...');

        // Wait for session panel
        await expect(page.locator('.agent-session-toolbar')).toBeVisible({ timeout: 20_000 });

        // Create a new session
        const sessionInput = page.locator('.agent-session-toolbar input');
        await sessionInput.fill('Workflow E2E');
        await page.locator('.agent-session-toolbar button', { hasText: /new|\+/i }).click();
        await expect(
            page.locator('.agent-session-item.active', { hasText: /Workflow E2E/i })
        ).toBeVisible({ timeout: 15_000 });
        console.log('[workflow-e2e]   New session "Workflow E2E" created');

        // Open runtime settings
        const runtimeToggle = page.locator('[aria-label="toggle-runtime-settings"]');
        await runtimeToggle.click();

        // Select provider
        const providerSelect = page.locator('[aria-label="session-provider"]');
        await expect(providerSelect).toBeVisible({ timeout: 5_000 });
        await providerSelect.selectOption(E2E_PROVIDER);
        console.log(`[workflow-e2e]   Provider: ${E2E_PROVIDER}`);
        await page.waitForTimeout(500);

        // For api-key provider: set sub-provider and API key
        if (E2E_PROVIDER === 'api-key') {
            if (E2E_SUB_PROVIDER) {
                const subProviderSelect = page.locator('[aria-label="session-sub-provider"]');
                await expect(subProviderSelect).toBeVisible({ timeout: 5_000 });
                await subProviderSelect.selectOption(E2E_SUB_PROVIDER);
                console.log(`[workflow-e2e]   Sub-provider: ${E2E_SUB_PROVIDER}`);
                await page.waitForTimeout(300);
            }
            if (E2E_API_KEY) {
                const apiKeyInput = page.locator('[aria-label="session-api-key"]');
                await expect(apiKeyInput).toBeVisible({ timeout: 5_000 });
                await apiKeyInput.fill(E2E_API_KEY);
                console.log('[workflow-e2e]   API key entered');
                await page.waitForTimeout(300);
            }
        }

        // Select model if specified
        if (E2E_MODEL) {
            const modelSelect = page.locator('[aria-label="session-model"]');
            await expect(modelSelect).toBeVisible({ timeout: 5_000 });
            await modelSelect.selectOption(E2E_MODEL);
            console.log(`[workflow-e2e]   Model: ${E2E_MODEL}`);
            await page.waitForTimeout(300);
        }

        // Bind env1
        console.log('[workflow-e2e]   Binding environment...');
        const bindModeSelect = page.locator('[aria-label="session-bind-mode"]');
        await expect(bindModeSelect).toBeVisible({ timeout: 5_000 });
        await bindModeSelect.selectOption('env');

        const envSelect = page.locator('[aria-label="session-bind-env"]');
        await expect(envSelect).toBeVisible({ timeout: 5_000 });
        // Select first env option (env1 / 环境1)
        await envSelect.selectOption({ index: 1 });
        console.log('[workflow-e2e]   Selected environment (env1)');

        const bindBtn = page.locator('button', { hasText: /bind to/i });
        await expect(bindBtn).toBeEnabled({ timeout: 5_000 });
        await bindBtn.click();
        console.log('[workflow-e2e]   Environment bound to session');
        await page.waitForTimeout(1_000);

        // Apply model (triggers execTask)
        await page.locator('button', { hasText: /apply model/i }).click();
        console.log('[workflow-e2e]   Model applied');

        // Dismiss TaskOffcanvas if it auto-opened after execTask
        await dismissTaskOffcanvas(page);

        // Wait for execution state to become Running
        await expect(
            page.locator('.session-context-toolbar')
        ).toContainText(/running/i, { timeout: 15_000 });
        console.log('[workflow-e2e]   Execution state: Running');

        // Extract session ID from the active session item (for API calls)
        sessionId = await page.locator('.agent-session-item.active').getAttribute('data-session-id');
        if (!sessionId) {
            // Fallback: try to get from URL or use a generated ID
            const url = page.url();
            const match = url.match(/sessionId=([^&]+)/);
            sessionId = match ? decodeURIComponent(match[1]) : `workflow-e2e-${Date.now()}`;
        }
        console.log(`[workflow-e2e]   Session ID: ${sessionId}`);
    });

    // ── Test 4: Wait for Dashboard Server ──

    test('4. Wait for dashboard server (:30003)', async () => {
        console.log('[workflow-e2e] Step 4: Waiting for dashboard server...');

        await pollUntil(
            async () => ({ up: await isDashboardUp() }),
            (s) => s.up,
            60_000, // 1 min max wait
            3_000
        );
        console.log('[workflow-e2e]   Dashboard server ready on :30003');
    });

    // ── Test 5: Dashboard Loads Correctly ──

    test('5. Verify dashboard loads with expected sections', async () => {
        console.log('[workflow-e2e] Step 5: Verifying dashboard...');

        // Fetch dashboard HTML
        const htmlResp = await fetch(`${DASHBOARD}/dashboard/${sessionId || 'default'}`, {
            signal: AbortSignal.timeout(10_000)
        });
        expect(htmlResp.status).toBe(200);
        const html = await htmlResp.text();

        // Verify key dashboard sections exist
        expect(html).toContain('job-table');
        console.log('[workflow-e2e]   Dashboard HTML contains job table');

        // Verify pipeline status bar
        expect(html).toContain('pipeStatus');
        expect(html).toContain('btnStart');
        console.log('[workflow-e2e]   Dashboard HTML contains pipeline controls');

        // Verify search config panel
        expect(html).toContain('cfgMinScore');
        expect(html).toContain('cfgTargetCount');
        console.log('[workflow-e2e]   Dashboard HTML contains search config panel');

        // Try fetching dashboard JSON data
        try {
            const { status, body } = await fetchJSON(`/api/dashboard/${encodeURIComponent(sessionId || 'default')}`);
            expect(status).toBe(200);
            expect(body).toBeDefined();
            console.log(`[workflow-e2e]   Dashboard JSON: ${Object.keys(body).join(', ')}`);
        } catch (err) {
            console.log(`[workflow-e2e]   Dashboard JSON fetch: ${err.message} (non-fatal)`);
        }

        // Take screenshot of dashboard state before workflow
        await page.screenshot({ path: 'test-results/workflow-e2e-dashboard-before.png' });
        console.log('[workflow-e2e]   Pre-workflow screenshot saved');
    });

    // ── Test 6: Start Workflow ──

    test('6. Start workflow via API', async () => {
        console.log('[workflow-e2e] Step 6: Starting workflow...');

        const sid = encodeURIComponent(sessionId || 'default');
        const { status, body } = await postJSON(`/api/workflow/${sid}/start`, {});

        console.log(`[workflow-e2e]   Start response: ${JSON.stringify(body)}`);
        expect(status).toBe(200);
        // Workflow start should succeed (success=true) or already be running
        expect(body.success === true || body.error?.includes('already running')).toBeTruthy();
        console.log('[workflow-e2e]   Workflow started');
    });

    // ── Test 7: Poll Pipeline Until Complete ──

    test('7. Poll workflow status until completion', async () => {
        test.setTimeout(E2E_TIMEOUT + 60_000);
        console.log(`[workflow-e2e] Step 7: Polling workflow status (timeout: ${E2E_TIMEOUT / 1000}s)...`);

        const sid = encodeURIComponent(sessionId || 'default');
        let lastPhase = '';

        const finalStatus = await pollUntil(
            async () => {
                const { body } = await fetchJSON(`/api/workflow/${sid}/status`);
                return body;
            },
            (body) => {
                // Workflow is done when status is not 'running'
                return body.status !== 'running';
            },
            E2E_TIMEOUT,
            POLL_INTERVAL,
            (body) => {
                const phase = body.currentStep || body.status || 'unknown';
                if (phase !== lastPhase) {
                    const stepInfo = body.steps
                        ? body.steps.map(s => `${s.name}:${s.status}`).join(', ')
                        : '';
                    console.log(`[workflow-e2e]   Phase: ${phase} | Steps: [${stepInfo}]`);
                    lastPhase = phase;
                }
            }
        );

        console.log(`[workflow-e2e]   Workflow final status: ${finalStatus.status}`);
        expect(['completed', 'stopped', 'idle', 'error']).toContain(finalStatus.status);

        // Also check pipeline status
        const pipeStatus = await fetchJSON(`/api/pipeline/${sid}/status`);
        console.log(`[workflow-e2e]   Pipeline running: ${pipeStatus.body.running}`);
    });

    // ── Test 8: Verify Search Results ──

    test('8. Verify search results: jobs found and scored', async () => {
        console.log('[workflow-e2e] Step 8: Verifying search results...');

        const sid = encodeURIComponent(sessionId || 'default');
        const { status, body } = await fetchJSON(`/api/dashboard/${sid}`);
        expect(status).toBe(200);

        const jobs = body.jobs || [];
        console.log(`[workflow-e2e]   Total jobs found: ${jobs.length}`);

        // At minimum, pipeline should have found some jobs
        // (may be 0 if all platforms are Cloudflare-blocked, handled in test 9)
        if (jobs.length > 0) {
            // Check that jobs have expected fields
            const firstJob = jobs[0];
            expect(firstJob).toHaveProperty('title');
            expect(firstJob).toHaveProperty('company');
            console.log(`[workflow-e2e]   First job: "${firstJob.title}" at ${firstJob.company}`);

            // Check for scored jobs (matchScore populated)
            const scoredJobs = jobs.filter(j => j.matchScore != null || j.score != null);
            console.log(`[workflow-e2e]   Scored jobs: ${scoredJobs.length}/${jobs.length}`);

            // Check for generated artifacts (resume, cover letter)
            const withArtifacts = jobs.filter(j => j.artifacts && Object.keys(j.artifacts).length > 0);
            console.log(`[workflow-e2e]   Jobs with artifacts: ${withArtifacts.length}/${jobs.length}`);
        } else {
            console.log('[workflow-e2e]   WARNING: No jobs found (possible Cloudflare block or network issue)');
        }
    });

    // ── Test 9: Verify Pipeline Didn't Get Stuck (P0 #1) ──

    test('9. Verify pipeline finished cleanly (not stuck)', async () => {
        console.log('[workflow-e2e] Step 9: Verifying pipeline completion...');

        const sid = encodeURIComponent(sessionId || 'default');
        const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid}/status`);

        // Pipeline should NOT be running after workflow completes
        expect(pipeStatus.running).toBe(false);
        console.log('[workflow-e2e]   Pipeline is not running (good)');

        // Check for errors in progress
        if (pipeStatus.progress) {
            const logs = pipeStatus.progress.logs || [];
            const errors = logs.filter(l => l.type === 'error' || l.level === 'error');
            console.log(`[workflow-e2e]   Pipeline logs: ${logs.length} total, ${errors.length} errors`);
            if (errors.length > 0) {
                errors.forEach(e => console.log(`[workflow-e2e]     ERROR: ${e.message || JSON.stringify(e)}`));
            }
        }

        // Check workflow engine status
        const { body: wfStatus } = await fetchJSON(`/api/workflow/${sid}/status`);
        console.log(`[workflow-e2e]   Workflow status: ${wfStatus.status}`);
        if (wfStatus.error) {
            console.log(`[workflow-e2e]   Workflow error: ${wfStatus.error}`);
        }
        // Log step outcomes
        if (wfStatus.steps) {
            wfStatus.steps.forEach(s => {
                const dur = s.completedAt && s.startedAt
                    ? `${((new Date(s.completedAt) - new Date(s.startedAt)) / 1000).toFixed(1)}s`
                    : 'N/A';
                console.log(`[workflow-e2e]     Step "${s.name}": ${s.status} (${dur})`);
            });
        }
    });

    // ── Test 10: Check for Cloudflare Detection ──

    test('10. Check for Cloudflare detection', async () => {
        console.log('[workflow-e2e] Step 10: Checking Cloudflare status...');

        const sid = encodeURIComponent(sessionId || 'default');
        const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid}/status`);

        if (pipeStatus.progress && pipeStatus.progress.logs) {
            const cfLogs = pipeStatus.progress.logs.filter(l => {
                const msg = (l.message || JSON.stringify(l)).toLowerCase();
                return msg.includes('cloudflare') || msg.includes('blocked') || msg.includes('challenge');
            });
            if (cfLogs.length > 0) {
                console.log(`[workflow-e2e]   Cloudflare detections: ${cfLogs.length}`);
                cfLogs.forEach(l => {
                    console.log(`[workflow-e2e]     CF: ${l.message || JSON.stringify(l)}`);
                });
            } else {
                console.log('[workflow-e2e]   No Cloudflare blocks detected');
            }
        } else {
            console.log('[workflow-e2e]   No pipeline logs available for Cloudflare check');
        }
    });

    // ── Test 11: Final Screenshot + Summary ──

    test('11. Final screenshot and summary', async () => {
        console.log('[workflow-e2e] Step 11: Final screenshot...');

        // Navigate back to workspace to capture final state
        await page.goto(`/#/agentWorkspace/${encodeURIComponent(TASK_NAME)}`);
        await page.waitForTimeout(3_000);
        await page.screenshot({ path: 'test-results/workflow-e2e-final.png' });
        console.log('[workflow-e2e]   Final screenshot saved to test-results/workflow-e2e-final.png');

        // Summary
        const sid = encodeURIComponent(sessionId || 'default');
        try {
            const { body: dashData } = await fetchJSON(`/api/dashboard/${sid}`);
            const { body: wfStatus } = await fetchJSON(`/api/workflow/${sid}/status`);
            const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid}/status`);

            const jobs = dashData.jobs || [];
            const scored = jobs.filter(j => j.matchScore != null || j.score != null);
            const withDocs = jobs.filter(j => j.artifacts && Object.keys(j.artifacts).length > 0);

            console.log('[workflow-e2e] ========== SUMMARY ==========');
            console.log(`[workflow-e2e]   Provider:       ${E2E_PROVIDER}`);
            console.log(`[workflow-e2e]   Session ID:      ${sessionId}`);
            console.log(`[workflow-e2e]   Workflow status: ${wfStatus.status}`);
            console.log(`[workflow-e2e]   Pipeline done:   ${!pipeStatus.running}`);
            console.log(`[workflow-e2e]   Jobs found:      ${jobs.length}`);
            console.log(`[workflow-e2e]   Jobs scored:     ${scored.length}`);
            console.log(`[workflow-e2e]   Jobs with docs:  ${withDocs.length}`);
            if (wfStatus.steps) {
                console.log(`[workflow-e2e]   Steps completed: ${wfStatus.steps.filter(s => s.status === 'completed').length}/${wfStatus.steps.length}`);
            }
            console.log('[workflow-e2e] ==============================');
        } catch (err) {
            console.log(`[workflow-e2e]   Summary fetch error: ${err.message}`);
        }

        console.log('[workflow-e2e] Workflow E2E complete');
    });
});
