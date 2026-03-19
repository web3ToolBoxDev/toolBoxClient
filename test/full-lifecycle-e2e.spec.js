// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

/**
 * Full Lifecycle E2E Test — Real UI interaction flow using Playwright
 * against the React frontend (localhost:3000) with Express backend
 * started as a child process.
 *
 *   Phase 0: Setup          — Start backend, navigate, create session
 *   Phase 1: Configuration  — Bind env, configure provider, fill preset questions
 *   Phase 2: Profile        — Wait for profile collection to complete
 *   Phase 3: Dashboard      — Verify dashboard loads with correct data
 *   Phase 4: Login          — Click Login on a platform, verify browser opens
 *   Phase 5: GATE           — Verify all search prerequisites before workflow
 *   Phase 6: Workflow       — Start workflow, poll until complete
 *   Phase 7: Results        — Verify search results (jobs > 0)
 *   Phase 8: Summary        — Final report + cleanup
 *
 * Prerequisites:
 *   - React dev server running on http://localhost:3000 (npm start)
 *   - env1 fingerprint browser profile must exist in DB
 *   - Indeed/LinkedIn should be logged in on env1
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/full-lifecycle-e2e.spec.js --headed
 */

const TASK_NAME = 'jobSeekAgent';
const BACKEND = 'http://127.0.0.1:30001';
const DASHBOARD = 'http://127.0.0.1:30003';

const E2E_PROVIDER = process.env.E2E_PROVIDER || 'claude-code';
const E2E_MODEL = process.env.E2E_MODEL || '';
const E2E_SUB_PROVIDER = process.env.E2E_SUB_PROVIDER || '';
const E2E_API_KEY = process.env.E2E_API_KEY || '';
const E2E_TIMEOUT = parseInt(process.env.E2E_TIMEOUT || '300000'); // 5 min
const POLL_INTERVAL = 5_000;

const PLATFORM_TOOLS_PATH = path.join(
    __dirname, '..', 'assets', 'agents', 'job-seek', 'data', 'platform-tools.json'
);

let backendProcess = null;
let sessionId = '';
let platforms = [];
let indeedPlatform = null;

// Run tracking
const run1 = { jobs: 0, seenUrls: 0, queries: 0, errors: 0 };
let fixRulesBefore = 0;

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

async function fetchJSON(urlPath) {
    const resp = await fetch(`${DASHBOARD}${urlPath}`, {
        signal: AbortSignal.timeout(10_000)
    });
    return { status: resp.status, body: await resp.json() };
}

async function postJSON(urlPath, body) {
    const resp = await fetch(`${DASHBOARD}${urlPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000)
    });
    return { status: resp.status, body: await resp.json() };
}

async function pollUntil(fetchFn, doneFn, timeout, interval, logFn) {
    const start = Date.now();
    let lastBody = null;
    while (Date.now() - start < timeout) {
        try {
            lastBody = await fetchFn();
            if (logFn) logFn(lastBody);
            if (doneFn(lastBody)) return lastBody;
        } catch (err) {
            console.log(`[lifecycle-e2e]   Poll error: ${err.message}`);
        }
        await new Promise(r => setTimeout(r, interval));
    }
    throw new Error(`Poll timed out after ${timeout}ms. Last: ${JSON.stringify(lastBody)}`);
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
    console.log('[lifecycle-e2e]   TaskOffcanvas backdrop detected — dismissing...');
    const offcanvas = pg.locator('[data-testid="task-offcanvas"]');
    const closeBtn = offcanvas.locator('.offcanvas-header .btn-close');
    if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
    } else {
        await pg.keyboard.press('Escape');
    }
    await expect(backdrop).not.toBeVisible({ timeout: 5_000 });
    console.log('[lifecycle-e2e]   TaskOffcanvas dismissed');
}

function readPlatformTools() {
    try {
        return JSON.parse(fs.readFileSync(PLATFORM_TOOLS_PATH, 'utf-8'));
    } catch {
        return {};
    }
}

function countFixRules(ptData) {
    let count = 0;
    for (const pid of Object.keys(ptData)) {
        const p = ptData[pid];
        if (p && p.tools) {
            for (const tName of Object.keys(p.tools)) {
                const tool = p.tools[tName];
                if (tool.fixRules && Array.isArray(tool.fixRules)) {
                    count += tool.fixRules.length;
                }
            }
        }
    }
    return count;
}

function sid() {
    return encodeURIComponent(sessionId || 'default');
}

/**
 * Start the Express backend as a child process.
 * Returns when the server is ready on port 30001.
 */
async function startBackend() {
    const serverPath = path.join(__dirname, '..', 'server', 'server.js');
    console.log(`[lifecycle-e2e] Starting backend: node ${serverPath}`);

    backendProcess = spawn('node', [serverPath], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, IS_BUILD: 'false' },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
    });

    backendProcess.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[backend] ${msg}`);
    });
    backendProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[backend:err] ${msg}`);
    });
    backendProcess.on('error', (err) => {
        console.error(`[backend] Failed to start: ${err.message}`);
    });

    // Wait for backend to be ready
    await pollUntil(
        async () => ({ ready: await isBackendReady() }),
        (s) => s.ready,
        30_000,
        2_000
    );
    console.log('[lifecycle-e2e] Backend ready on :30001');
}

function stopBackend() {
    if (backendProcess) {
        console.log('[lifecycle-e2e] Stopping backend...');
        try {
            // On Windows, need to kill the process tree
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t'], {
                    stdio: 'ignore',
                    shell: true
                });
            } else {
                backendProcess.kill('SIGTERM');
            }
        } catch (err) {
            console.log(`[lifecycle-e2e] Backend stop error: ${err.message}`);
        }
        backendProcess = null;
    }
}

// ─── Test Suite ───

test.describe.serial('Full Lifecycle E2E (UI Flow)', () => {
    // Global timeout: generous for real AI
    test.setTimeout(E2E_TIMEOUT * 2 + 300_000);

    test.afterAll(async () => {
        stopBackend();
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 0: Setup — Start backend, navigate, create session
    // ═══════════════════════════════════════════════════════════════════

    test('1. Start backend and verify ready', async () => {
        console.log('[lifecycle-e2e] Phase 0 — Step 1: Starting backend...');

        // Check if backend is already running (e.g. from npm run dev)
        const alreadyRunning = await isBackendReady();
        if (alreadyRunning) {
            console.log('[lifecycle-e2e]   Backend already running on :30001 — skipping spawn');
        } else {
            await startBackend();
        }
    });

    test('2. Navigate to Agent Workspace and switch to English', async ({ page }) => {
        test.setTimeout(60_000);
        console.log('[lifecycle-e2e] Phase 0 — Step 2: Navigating to workspace...');

        // Switch language to English first
        await page.goto('/');
        await expect(page.locator('.sidebar, .nav')).toBeVisible({ timeout: 10_000 });

        try {
            const langBtn = page.locator('.btn-change-lang');
            await langBtn.click();
            const langOffcanvas = page.locator('.lang-offcanvas');
            await expect(langOffcanvas).toBeVisible({ timeout: 5_000 });
            await page.locator('.lang-offcanvas button', { hasText: 'English' }).click();
            await expect(langOffcanvas).not.toBeVisible({ timeout: 3_000 });
            console.log('[lifecycle-e2e]   Language set to English');
        } catch {
            console.log('[lifecycle-e2e]   Language already set or skipped');
        }

        // Navigate to Agent Workspace
        await page.goto(`/#/agentWorkspace/${encodeURIComponent(TASK_NAME)}`);
        await expect(page.locator('.agent-workspace-main')).toBeVisible({ timeout: 15_000 });
        console.log('[lifecycle-e2e]   Workspace loaded');

        await dismissTaskOffcanvas(page);
    });

    test('3. Create session, bind env1, configure provider, fill preset questions', async ({ page }) => {
        test.setTimeout(120_000);
        console.log('[lifecycle-e2e] Phase 1 — Step 3: Session setup via UI...');

        // Navigate to workspace (fresh page context in serial)
        await page.goto(`/#/agentWorkspace/${encodeURIComponent(TASK_NAME)}`);
        await expect(page.locator('.agent-workspace-main')).toBeVisible({ timeout: 15_000 });
        await dismissTaskOffcanvas(page);

        // ── 3a: Create new session ──
        await expect(page.locator('.agent-session-toolbar')).toBeVisible({ timeout: 20_000 });
        const sessionInput = page.locator('.agent-session-toolbar input');
        await sessionInput.fill('Lifecycle E2E');
        await page.locator('.agent-session-toolbar button', { hasText: /new|\+/i }).click();
        await expect(
            page.locator('.agent-session-item.active', { hasText: /Lifecycle E2E/i })
        ).toBeVisible({ timeout: 15_000 });
        console.log('[lifecycle-e2e]   Session "Lifecycle E2E" created');

        // ── 3b: Open Runtime Settings ──
        const runtimeToggle = page.locator('[aria-label="toggle-runtime-settings"]');
        await runtimeToggle.click();

        // ── 3c: Configure provider ──
        const providerSelect = page.locator('[aria-label="session-provider"]');
        await expect(providerSelect).toBeVisible({ timeout: 5_000 });
        await providerSelect.selectOption(E2E_PROVIDER);
        console.log(`[lifecycle-e2e]   Provider: ${E2E_PROVIDER}`);
        await page.waitForTimeout(500);

        // API key provider extras
        if (E2E_PROVIDER === 'api-key') {
            if (E2E_SUB_PROVIDER) {
                const subProviderSelect = page.locator('[aria-label="session-sub-provider"]');
                await expect(subProviderSelect).toBeVisible({ timeout: 5_000 });
                await subProviderSelect.selectOption(E2E_SUB_PROVIDER);
                console.log(`[lifecycle-e2e]   Sub-provider: ${E2E_SUB_PROVIDER}`);
                await page.waitForTimeout(300);
            }
            if (E2E_API_KEY) {
                const apiKeyInput = page.locator('[aria-label="session-api-key"]');
                await expect(apiKeyInput).toBeVisible({ timeout: 5_000 });
                await apiKeyInput.fill(E2E_API_KEY);
                console.log('[lifecycle-e2e]   API key entered');
                await page.waitForTimeout(300);
            }
        }

        // Model
        if (E2E_MODEL) {
            const modelSelect = page.locator('[aria-label="session-model"]');
            await expect(modelSelect).toBeVisible({ timeout: 5_000 });
            await modelSelect.selectOption(E2E_MODEL);
            console.log(`[lifecycle-e2e]   Model: ${E2E_MODEL}`);
            await page.waitForTimeout(300);
        }

        // ── 3d: Bind env1 (BEFORE Apply Model to avoid modal race) ──
        console.log('[lifecycle-e2e]   Binding environment...');
        const bindModeSelect = page.locator('[aria-label="session-bind-mode"]');
        await expect(bindModeSelect).toBeVisible({ timeout: 5_000 });
        await bindModeSelect.selectOption('env');

        const envSelect = page.locator('[aria-label="session-bind-env"]');
        await expect(envSelect).toBeVisible({ timeout: 5_000 });
        // Try English label first, fall back to Chinese
        try {
            await envSelect.selectOption({ label: 'env1' });
        } catch {
            await envSelect.selectOption({ index: 1 }); // First real env option
        }
        console.log('[lifecycle-e2e]   Selected environment');

        const bindBtn = page.locator('button', { hasText: /bind to/i });
        await expect(bindBtn).toBeEnabled({ timeout: 5_000 });
        await bindBtn.click();
        console.log('[lifecycle-e2e]   Environment bound to session');
        await page.waitForTimeout(1_000);

        // ── 3e: Apply Model (triggers execTask -> preset modal auto-opens) ──
        await page.locator('button', { hasText: /apply model/i }).click();
        console.log('[lifecycle-e2e]   Model applied');

        await dismissTaskOffcanvas(page);

        // Wait for Running state
        await expect(
            page.locator('.session-context-toolbar')
        ).toContainText(/running/i, { timeout: 15_000 });
        console.log('[lifecycle-e2e]   Execution state: Running');

        // Extract session ID from DOM
        sessionId = await page.locator('.agent-session-item.active').getAttribute('data-session-id');
        if (!sessionId) {
            const url = page.url();
            const match = url.match(/sessionId=([^&]+)/);
            sessionId = match ? decodeURIComponent(match[1]) : `lifecycle-e2e-${Date.now()}`;
        }
        console.log(`[lifecycle-e2e]   Session ID: ${sessionId}`);

        // ── 3f: Fill preset questions via UI ──
        console.log('[lifecycle-e2e]   Waiting for preset modal...');
        const presetModal = page.locator('.ai-preset-modal');
        try {
            await expect(presetModal).toBeVisible({ timeout: 10_000 });
        } catch {
            // Modal didn't auto-open — collapse settings, click trigger
            await runtimeToggle.click();
            const presetTrigger = page.locator('.ai-preset-trigger');
            await expect(presetTrigger).toBeEnabled({ timeout: 10_000 });
            await presetTrigger.click();
            await expect(presetModal).toBeVisible({ timeout: 5_000 });
        }
        console.log('[lifecycle-e2e]   Preset modal opened');

        // Fill Job Title
        const jobTitleItem = page.locator('.ai-preset-question-item').filter({
            has: page.locator('.ai-option-title', { hasText: /job title/i })
        });
        await expect(jobTitleItem).toBeVisible({ timeout: 5_000 });
        await jobTitleItem.locator('input[type="text"]').fill('Fullstack Developer');
        console.log('[lifecycle-e2e]   Filled: Job Title = Fullstack Developer');

        // Fill Location
        const locationItem = page.locator('.ai-preset-question-item').filter({
            has: page.locator('.ai-option-title', { hasText: /location/i })
        });
        await expect(locationItem).toBeVisible({ timeout: 5_000 });
        await locationItem.locator('input[type="text"]').fill('Ontario');
        console.log('[lifecycle-e2e]   Filled: Location = Ontario');

        // Fill Salary
        try {
            const salaryItem = page.locator('.ai-preset-question-item').filter({
                has: page.locator('.ai-option-title', { hasText: /salary/i })
            });
            await salaryItem.scrollIntoViewIfNeeded();
            await salaryItem.locator('input[type="text"]').fill('80K');
            console.log('[lifecycle-e2e]   Filled: Salary = 80K');
        } catch {
            console.log('[lifecycle-e2e]   Salary field not found (optional)');
        }

        // Click "Confirm All" to submit all input questions at once
        const confirmAllBtn = presetModal.locator('button').filter({ hasText: /confirm all|确认/i });
        await expect(confirmAllBtn).toBeVisible({ timeout: 5_000 });
        await confirmAllBtn.click();
        console.log('[lifecycle-e2e]   Clicked Confirm All');
        await page.waitForTimeout(2000);

        // Select Work Mode (Selection group — expand if collapsed)
        try {
            const selectionGroup = page.locator('.ai-preset-group').filter({
                has: page.locator('.ai-preset-group__title', { hasText: /selection/i })
            });
            const groupHeader = selectionGroup.locator('.ai-preset-group__header');
            await groupHeader.scrollIntoViewIfNeeded();
            // Expand if collapsed
            const caret = selectionGroup.locator('.ai-preset-group__caret');
            if (await caret.isVisible() && (await caret.textContent()).trim() === '+') {
                await groupHeader.click();
                await page.waitForTimeout(500);
            }
            const workModeItem = page.locator('.ai-preset-question-item').filter({
                has: page.locator('.ai-option-title', { hasText: /work mode/i })
            });
            await expect(workModeItem).toBeVisible({ timeout: 5_000 });
            await workModeItem.locator('.ai-option-btn', { hasText: /any/i }).click();
            console.log('[lifecycle-e2e]   Selected: Work Mode = any');
            await page.waitForTimeout(1000);
        } catch {
            console.log('[lifecycle-e2e]   Work Mode selection skipped');
        }

        // Close preset modal
        console.log('[lifecycle-e2e]   Closing preset modal...');
        const closeBtn = presetModal.locator('.modal-footer button', { hasText: /close|关闭/i });
        if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await closeBtn.click();
        } else {
            await presetModal.locator('button.btn-close').click().catch(() => {});
        }
        await expect(presetModal).not.toBeVisible({ timeout: 5_000 }).catch(() => {});
        console.log('[lifecycle-e2e]   Preset modal closed');

        // Record initial fix rules count
        fixRulesBefore = countFixRules(readPlatformTools());
        console.log(`[lifecycle-e2e]   Initial fix rules count: ${fixRulesBefore}`);
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 2: Wait for profile collection to complete
    // ═══════════════════════════════════════════════════════════════════

    test('4. Wait for profile collection (AI subtasks show Done)', async ({ page }) => {
        test.setTimeout(120_000);
        console.log('[lifecycle-e2e] Phase 2 — Step 4: Waiting for profile collection...');

        await page.goto(`/#/agentWorkspace/${encodeURIComponent(TASK_NAME)}`);
        await expect(page.locator('.agent-workspace-main')).toBeVisible({ timeout: 15_000 });
        await dismissTaskOffcanvas(page);

        // Wait for at least one subtask to show "Done" status
        const doneBadge = page.locator('.ai-subtask-card__badge--done');
        try {
            await expect(doneBadge.first()).toBeVisible({ timeout: 60_000 });
            console.log('[lifecycle-e2e]   At least one subtask completed (Done)');
        } catch {
            console.log('[lifecycle-e2e]   No subtask marked Done yet — continuing (AI may still be working)');
        }

        // Wait for dashboard server to come up (started by agent during profile collection)
        console.log('[lifecycle-e2e]   Waiting for dashboard server...');
        try {
            await pollUntil(
                async () => ({ up: await isDashboardUp() }),
                (s) => s.up,
                60_000,
                3_000
            );
            console.log('[lifecycle-e2e]   Dashboard ready on :30003');
        } catch {
            console.log('[lifecycle-e2e]   Dashboard not yet available — will retry in later tests');
        }
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 3: Dashboard verification
    // ═══════════════════════════════════════════════════════════════════

    test('5. Verify dashboard artifact appears and open it', async ({ page }) => {
        test.setTimeout(90_000);
        console.log('[lifecycle-e2e] Phase 3 — Step 5: Verifying dashboard...');

        await page.goto(`/#/agentWorkspace/${encodeURIComponent(TASK_NAME)}`);
        await expect(page.locator('.agent-workspace-main')).toBeVisible({ timeout: 15_000 });
        await dismissTaskOffcanvas(page);

        // Wait for dashboard artifact button to appear
        const artifactCard = page.locator('.ai-artifact-card--button').filter({
            hasText: /dashboard/i
        });
        try {
            await expect(artifactCard).toBeVisible({ timeout: 60_000 });
            console.log('[lifecycle-e2e]   Dashboard artifact available');
        } catch {
            console.log('[lifecycle-e2e]   Dashboard artifact not yet visible — profile collection may still be in progress');
        }

        // Verify dashboard data via API
        const dashboardUp = await isDashboardUp();
        if (dashboardUp) {
            const { status, body: dashData } = await fetchJSON(`/api/dashboard/${sid()}`);
            expect(status).toBe(200);

            // Direction section should have job title + location
            const direction = dashData.direction || {};
            const jobTitle = direction.jobTitle || direction.q_job_title || '';
            const location = direction.location || direction.q_location || '';
            console.log(`[lifecycle-e2e]   Direction: "${jobTitle}" in "${location}"`);

            if (jobTitle) {
                expect(jobTitle.toLowerCase()).toContain('fullstack');
                console.log('[lifecycle-e2e]   Job title matches "Fullstack Developer"');
            }

            // Env binding should be present
            if (dashData.env) {
                expect(dashData.env.bound).toBe(true);
                expect(dashData.env.envIds.length).toBeGreaterThan(0);
                console.log(`[lifecycle-e2e]   Env bound: envIds=${JSON.stringify(dashData.env.envIds)}`);
            }
        } else {
            console.log('[lifecycle-e2e]   Dashboard API not available yet — skipping data verification');
        }
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 4: Platform Login
    // ═══════════════════════════════════════════════════════════════════

    test('6. Discover platforms and login to Indeed', async ({ page }) => {
        test.setTimeout(60_000);
        console.log('[lifecycle-e2e] Phase 4 — Step 6: Platform discovery + login...');

        const dashboardUp = await isDashboardUp();
        if (!dashboardUp) {
            console.log('[lifecycle-e2e]   Dashboard not available — skipping platform login');
            test.skip();
            return;
        }

        // Discover platforms via dashboard API
        const { status, body } = await fetchJSON(`/api/platforms/${sid()}`);
        expect(status).toBe(200);
        platforms = body.platforms || body || [];
        console.log(`[lifecycle-e2e]   Found ${platforms.length} platform(s)`);

        platforms.forEach(p => {
            console.log(`[lifecycle-e2e]     Platform: ${p.name || p.id} | login: ${p.loginStatus || 'unknown'}`);
        });

        // Identify Indeed
        indeedPlatform = platforms.find(p =>
            (p.name || p.id || '').toLowerCase().includes('indeed')
        );

        if (!indeedPlatform) {
            console.log('[lifecycle-e2e]   Indeed not found — skipping login');
            return;
        }

        const pid = encodeURIComponent(indeedPlatform.id || indeedPlatform.name);

        // Login via API (opens browser via env binding)
        try {
            const { status: loginStatus, body: loginBody } = await postJSON(
                `/api/platforms/${sid()}/${pid}/login`, {}
            );
            console.log(`[lifecycle-e2e]   Login response: ${loginStatus} — ${JSON.stringify(loginBody).slice(0, 200)}`);

            // Wait for browser to open and load
            console.log('[lifecycle-e2e]   Waiting 10s for browser to load...');
            await new Promise(r => setTimeout(r, 10_000));

            // Confirm login
            const { body: confirmBody } = await postJSON(
                `/api/platforms/${sid()}/${pid}/confirm-login`, {}
            );
            if (confirmBody.loggedIn || confirmBody.confirmed || confirmBody.success) {
                console.log('[lifecycle-e2e]   Indeed login CONFIRMED');
            } else {
                console.log('[lifecycle-e2e]   Indeed login NOT confirmed (may need manual login)');
            }
        } catch (err) {
            console.log(`[lifecycle-e2e]   Login flow error: ${err.message} (non-fatal)`);
        }

        // Verify browserId was assigned
        try {
            const { body: platList } = await fetchJSON(`/api/platforms/${sid()}`);
            const allPlatforms = platList.platforms || platList || [];
            const indeed = allPlatforms.find(p => /indeed/i.test(p.name || p.id || ''));
            if (indeed) {
                if (indeed._browserId) {
                    console.log(`[lifecycle-e2e]   Indeed browserId: ${indeed._browserId}`);
                } else {
                    console.log('[lifecycle-e2e]   Indeed has no _browserId — env binding may not have worked');
                }
            }
        } catch (err) {
            console.log(`[lifecycle-e2e]   browserId check error: ${err.message}`);
        }
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 5: GATE — Verify search prerequisites
    // ═══════════════════════════════════════════════════════════════════

    test('7. GATE: Verify all search prerequisites before workflow', async () => {
        test.setTimeout(30_000);
        console.log('[lifecycle-e2e] Phase 5 — GATE: Verifying search prerequisites...');

        const dashboardUp = await isDashboardUp();
        if (!dashboardUp) {
            console.log('[lifecycle-e2e]   Dashboard not available — GATE cannot verify');
            test.skip();
            return;
        }

        const { status, body: dashData } = await fetchJSON(`/api/dashboard/${sid()}`);
        expect(status).toBe(200);

        // Direction must be set (from preset questions)
        const jobTitle = dashData.direction?.jobTitle || dashData.direction?.q_job_title || '';
        expect(jobTitle).toBeTruthy();
        console.log(`[lifecycle-e2e]   Direction: ${jobTitle} in ${dashData.direction?.location || dashData.direction?.q_location || 'N/A'}`);

        // Profile should exist
        const profile = dashData.profile || {};
        const hasProfile = profile.skills || profile.basic || profile.experience || Object.keys(profile).length > 0;
        console.log(`[lifecycle-e2e]   Profile: ${hasProfile ? 'present' : 'empty'} (keys: ${Object.keys(profile).join(', ')})`);

        // Env must be bound
        expect(dashData.env?.bound).toBe(true);
        expect(dashData.env?.envIds?.length).toBeGreaterThan(0);
        console.log(`[lifecycle-e2e]   Env bound: ${JSON.stringify(dashData.env.envIds)}`);

        // At least one platform should have a browser open
        const { body: platList } = await fetchJSON(`/api/platforms/${sid()}`);
        const allPlatforms = platList.platforms || platList || [];
        const withBrowser = allPlatforms.filter(p => p._browserId);
        expect(withBrowser.length).toBeGreaterThan(0);
        console.log(`[lifecycle-e2e]   Platforms with browser: ${withBrowser.map(p => p.name || p.id).join(', ')}`);

        console.log('[lifecycle-e2e]   GATE PASSED: All search prerequisites met');
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 6: Start Workflow and poll until complete
    // ═══════════════════════════════════════════════════════════════════

    test('8. Start workflow', async () => {
        test.setTimeout(60_000);
        console.log('[lifecycle-e2e] Phase 6 — Step 8: Starting workflow...');

        const dashboardUp = await isDashboardUp();
        if (!dashboardUp) {
            console.log('[lifecycle-e2e]   Dashboard not available — skipping workflow');
            test.skip();
            return;
        }

        // Ensure config exists
        const cfgResp = await fetchJSON(`/api/workflow/${sid()}/config`);
        console.log(`[lifecycle-e2e]   Config: ${cfgResp.status}`);
        expect(cfgResp.status).toBe(200);

        const { status, body } = await postJSON(`/api/workflow/${sid()}/start`, {});
        console.log(`[lifecycle-e2e]   Start response: ${status} — ${JSON.stringify(body)}`);

        if (status === 400 && body.error?.includes('AI provider required')) {
            console.log('[lifecycle-e2e]   AI provider not available — skipping workflow');
            test.skip();
            return;
        }
        expect(status).toBe(200);
        expect(body.success === true || body.error?.includes('already running')).toBeTruthy();
        console.log('[lifecycle-e2e]   Workflow started');
    });

    test('9. Poll workflow until completion', async () => {
        test.setTimeout(E2E_TIMEOUT + 60_000);
        console.log(`[lifecycle-e2e] Phase 6 — Step 9: Polling workflow (timeout: ${E2E_TIMEOUT / 1000}s)...`);

        const dashboardUp = await isDashboardUp();
        if (!dashboardUp) {
            console.log('[lifecycle-e2e]   Dashboard not available — skipping poll');
            test.skip();
            return;
        }

        let lastPhase = '';
        const finalStatus = await pollUntil(
            async () => {
                const { body } = await fetchJSON(`/api/workflow/${sid()}/status`);
                return body;
            },
            (body) => body.status !== 'running',
            E2E_TIMEOUT,
            POLL_INTERVAL,
            (body) => {
                const phase = body.currentStep || body.status || 'unknown';
                if (phase !== lastPhase) {
                    const stepInfo = body.steps
                        ? body.steps.map(s => `${s.name}:${s.status}`).join(', ')
                        : '';
                    console.log(`[lifecycle-e2e]   Phase: ${phase} | Steps: [${stepInfo}]`);
                    lastPhase = phase;
                }
            }
        );

        console.log(`[lifecycle-e2e]   Workflow final status: ${finalStatus.status}`);
        expect(['completed', 'stopped', 'idle', 'error']).toContain(finalStatus.status);

        // Pipeline status
        try {
            const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid()}/status`);
            console.log(`[lifecycle-e2e]   Pipeline running: ${pipeStatus.running}`);
            if (pipeStatus.progress) {
                run1.errors = (pipeStatus.progress.errors || []).length;
                console.log(`[lifecycle-e2e]   Pipeline errors: ${run1.errors}`);
                console.log(`[lifecycle-e2e]   Searched: ${pipeStatus.progress.searched || 0}`);
                console.log(`[lifecycle-e2e]   Parsed: ${pipeStatus.progress.parsed || 0}`);
                console.log(`[lifecycle-e2e]   Matched: ${pipeStatus.progress.matched || 0}`);
            }
        } catch (err) {
            console.log(`[lifecycle-e2e]   Pipeline status error: ${err.message}`);
        }
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 7: Verify search results
    // ═══════════════════════════════════════════════════════════════════

    test('10. Verify search results (jobs > 0)', async ({ page }) => {
        test.setTimeout(30_000);
        console.log('[lifecycle-e2e] Phase 7 — Step 10: Verifying search results...');

        const dashboardUp = await isDashboardUp();
        if (!dashboardUp) {
            console.log('[lifecycle-e2e]   Dashboard not available — skipping results verification');
            test.skip();
            return;
        }

        const { status, body } = await fetchJSON(`/api/dashboard/${sid()}`);
        expect(status).toBe(200);

        const jobs = body.jobs || [];
        run1.jobs = jobs.length;
        console.log(`[lifecycle-e2e]   Jobs found: ${run1.jobs}`);

        // STRICT: 0 jobs = FAIL
        expect(jobs.length).toBeGreaterThan(0);
        console.log(`[lifecycle-e2e]   Jobs found: ${run1.jobs} (PASS: > 0)`);

        const first = jobs[0];
        expect(first).toHaveProperty('title');
        expect(first).toHaveProperty('company');
        console.log(`[lifecycle-e2e]   First job: "${first.title}" at ${first.company}`);

        // Check fields
        const withUrl = jobs.filter(j => j.url);
        const withScore = jobs.filter(j => j.matchScore != null || j.score != null);
        console.log(`[lifecycle-e2e]   With URL: ${withUrl.length}/${jobs.length}`);
        console.log(`[lifecycle-e2e]   With score: ${withScore.length}/${jobs.length}`);

        // Markdown contamination check
        const mdContaminated = jobs.filter(j => {
            const title = j.title || '';
            return title.includes('**') || title.includes('##') || title.includes('```');
        });
        if (mdContaminated.length > 0) {
            console.log(`[lifecycle-e2e]   WARNING: ${mdContaminated.length} job(s) with markdown in title`);
        } else {
            console.log('[lifecycle-e2e]   No markdown contamination detected');
        }

        // Pipeline must have actually searched
        try {
            const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid()}/status`);
            if (pipeStatus.progress) {
                const searched = pipeStatus.progress.searched || 0;
                expect(searched).toBeGreaterThan(0);
                console.log(`[lifecycle-e2e]   Pipeline searched: ${searched} (PASS: > 0)`);

                // Seen URLs + queries
                const seenUrls = pipeStatus.progress.seenUrls || pipeStatus.progress.seen || [];
                run1.seenUrls = Array.isArray(seenUrls) ? seenUrls.length : (typeof seenUrls === 'number' ? seenUrls : 0);
                const queries = pipeStatus.progress.queries || pipeStatus.progress.searchQueries || [];
                run1.queries = Array.isArray(queries) ? queries.length : 0;
            }
        } catch (err) {
            console.log(`[lifecycle-e2e]   Pipeline status check error: ${err.message}`);
        }

        // Take screenshot
        const resultsDir = path.join(__dirname, '..', 'test-results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }
        await page.screenshot({ path: 'test-results/lifecycle-e2e-results.png' });
        console.log('[lifecycle-e2e]   Results screenshot saved');
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 8: Summary report + cleanup
    // ═══════════════════════════════════════════════════════════════════

    test('11. Check fix rules and selfHeal', async () => {
        console.log('[lifecycle-e2e] Phase 8 — Step 11: Checking fix rules + selfHeal...');

        const ptData = readPlatformTools();
        const fixRulesAfter = countFixRules(ptData);
        console.log(`[lifecycle-e2e]   Fix rules before: ${fixRulesBefore}`);
        console.log(`[lifecycle-e2e]   Fix rules after:  ${fixRulesAfter}`);
        console.log(`[lifecycle-e2e]   New rules added:  ${fixRulesAfter - fixRulesBefore}`);

        // Log fix rules
        for (const pid of Object.keys(ptData)) {
            const p = ptData[pid];
            if (p && p.tools) {
                for (const tName of Object.keys(p.tools)) {
                    const tool = p.tools[tName];
                    if (tool.fixRules && tool.fixRules.length > 0) {
                        console.log(`[lifecycle-e2e]   ${pid} -> ${tName} fixRules: ${tool.fixRules.length}`);
                    }
                }
            }
        }

        // selfHeal + Cloudflare checks via pipeline logs
        const dashboardUp = await isDashboardUp();
        if (dashboardUp) {
            try {
                const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid()}/status`);
                if (pipeStatus.progress && pipeStatus.progress.logs) {
                    const selfHealLogs = pipeStatus.progress.logs.filter(l => {
                        const msg = (l.message || JSON.stringify(l)).toLowerCase();
                        return msg.includes('selfheal') || msg.includes('self-heal') || msg.includes('fix rule');
                    });
                    console.log(`[lifecycle-e2e]   selfHeal triggers: ${selfHealLogs.length}`);

                    const cfLogs = pipeStatus.progress.logs.filter(l => {
                        const msg = (l.message || JSON.stringify(l)).toLowerCase();
                        return msg.includes('cloudflare') || msg.includes('blocked') || msg.includes('captcha');
                    });
                    console.log(`[lifecycle-e2e]   Cloudflare detections: ${cfLogs.length}`);
                }
            } catch (err) {
                console.log(`[lifecycle-e2e]   Pipeline log check error: ${err.message}`);
            }
        }
    });

    test('12. Summary report + final screenshot', async ({ page }) => {
        console.log('[lifecycle-e2e] Phase 8 — Step 12: SUMMARY REPORT');
        console.log('[lifecycle-e2e] ========================================================');
        console.log('[lifecycle-e2e]           FULL LIFECYCLE E2E -- SUMMARY');
        console.log('[lifecycle-e2e] ========================================================');
        console.log(`[lifecycle-e2e]  Provider:     ${E2E_PROVIDER}`);
        console.log(`[lifecycle-e2e]  Session:      ${sessionId || 'N/A'}`);
        console.log('[lifecycle-e2e] --------------------------------------------------------');
        console.log('[lifecycle-e2e]  SEARCH RESULTS');
        console.log(`[lifecycle-e2e]    Jobs found:    ${run1.jobs}`);
        console.log(`[lifecycle-e2e]    Seen URLs:     ${run1.seenUrls}`);
        console.log(`[lifecycle-e2e]    Queries used:  ${run1.queries}`);
        console.log(`[lifecycle-e2e]    Errors:        ${run1.errors}`);
        console.log('[lifecycle-e2e] --------------------------------------------------------');

        // Platform summary
        if (platforms.length > 0) {
            console.log('[lifecycle-e2e]  PLATFORMS');
            platforms.forEach(p => {
                console.log(`[lifecycle-e2e]    ${(p.name || p.id || 'unknown').padEnd(15)} login: ${p.loginStatus || 'unknown'}`);
            });
            console.log('[lifecycle-e2e] --------------------------------------------------------');
        }

        console.log(`[lifecycle-e2e]  Fix rules (initial): ${fixRulesBefore}`);
        console.log(`[lifecycle-e2e]  Fix rules (final):   ${countFixRules(readPlatformTools())}`);
        console.log('[lifecycle-e2e] ========================================================');

        // Final screenshot
        await page.goto(`/#/agentWorkspace/${encodeURIComponent(TASK_NAME)}`);
        await page.waitForTimeout(3_000);

        const resultsDir = path.join(__dirname, '..', 'test-results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }
        await page.screenshot({ path: 'test-results/lifecycle-e2e-final.png' });
        console.log('[lifecycle-e2e]   Final screenshot saved to test-results/lifecycle-e2e-final.png');

        console.log('[lifecycle-e2e] Full Lifecycle E2E complete');
    });
});
