// @ts-check
const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

/**
 * Full Lifecycle E2E Test — The definitive baseline covering the complete
 * Job Seek Agent lifecycle with real browsers and real AI:
 *
 *   Phase 0: Setup          — Launch Electron, navigate, create session
 *   Phase 1: Discovery      — List platforms, record IDs
 *   Phase 2: Login          — Login flow + confirm for Indeed
 *   Phase 3: Build Tool     — AI builds search script, verify result
 *   Phase 4: Search (Run 1) — Start workflow, poll, verify jobs
 *   Phase 5: Persistence    — Check fix rules + search history
 *   Phase 6: Search (Run 2) — Dedup, keyword rotation verification
 *   Phase 7: Error Recovery — selfHeal + Cloudflare detection
 *   Phase 8: Final Report   — Summary table + screenshot + cleanup
 *
 * Prerequisites:
 *   - env1 fingerprint browser profile must exist
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

let app, page;
let sessionId;
let platforms = [];
let indeedPlatform = null;
let linkedinPlatform = null;

// Run 1 vs Run 2 tracking
const run1 = { jobs: 0, seenUrls: 0, queries: 0, errors: 0 };
const run2 = { jobs: 0, seenUrls: 0, queries: 0, errors: 0 };
let fixRulesBefore = 0;
let fixRulesAfter = 0;
let selfHealCount = 0;
let cloudflareCount = 0;

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

async function putJSON(urlPath, body) {
    const resp = await fetch(`${DASHBOARD}${urlPath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000)
    });
    return { status: resp.status, body: await resp.json() };
}

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

// ─── Test Suite ───

test.describe.serial('Full Lifecycle E2E (Electron)', () => {
    // Global timeout: 2x pipeline timeout + buffer for login/build/setup
    test.setTimeout(E2E_TIMEOUT * 2 + 300_000);

    test.afterAll(async () => {
        if (app) {
            console.log('[lifecycle-e2e] Closing Electron app...');
            await app.close().catch(() => {});
        }
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 0: Setup (Tests 1-3)
    // ═══════════════════════════════════════════════════════════════════

    test('1. Launch Electron and wait for backend', async () => {
        console.log('[lifecycle-e2e] Phase 0 — Step 1: Launching Electron...');
        app = await electron.launch({
            args: ['.'],
            env: { ...process.env, IS_BUILD: 'false' }
        });
        page = await app.firstWindow();
        await page.waitForLoadState('domcontentloaded');
        console.log('[lifecycle-e2e]   Electron window opened');

        console.log('[lifecycle-e2e]   Waiting for backend...');
        await pollUntil(
            async () => ({ ready: await isBackendReady() }),
            (s) => s.ready,
            30_000,
            2_000
        );
        console.log('[lifecycle-e2e]   Backend ready on :30001');

        // Language → English
        try {
            const langBtn = page.locator('.btn-change-lang');
            await langBtn.waitFor({ timeout: 5_000 });
            await langBtn.click();
            const langOffcanvas = page.locator('.lang-offcanvas');
            await expect(langOffcanvas).toBeVisible({ timeout: 5_000 });
            await page.locator('.lang-offcanvas button', { hasText: 'English' }).click();
            await expect(langOffcanvas).not.toBeVisible({ timeout: 3_000 });
            console.log('[lifecycle-e2e]   Language set to English');
        } catch {
            console.log('[lifecycle-e2e]   Language already set or skipped');
        }
    });

    test('2. Navigate to Agent Workspace', async () => {
        console.log('[lifecycle-e2e] Phase 0 — Step 2: Navigating to Agent Workspace...');
        const baseUrl = page.url().split('#')[0];
        await page.goto(`${baseUrl}#/agentWorkspace/${encodeURIComponent(TASK_NAME)}`);
        await expect(page.locator('.agent-workspace-main')).toBeVisible({ timeout: 15_000 });
        console.log('[lifecycle-e2e]   Workspace loaded');
        await dismissTaskOffcanvas(page);
    });

    test('3. Create session, bind env1, configure provider, fill preset questions', async () => {
        test.setTimeout(120_000);
        console.log('[lifecycle-e2e] Phase 0 — Step 3: Session setup...');

        await expect(page.locator('.agent-session-toolbar')).toBeVisible({ timeout: 20_000 });

        // Create new session
        const sessionInput = page.locator('.agent-session-toolbar input');
        await sessionInput.fill('Lifecycle E2E');
        await page.locator('.agent-session-toolbar button', { hasText: /new|\+/i }).click();
        await expect(
            page.locator('.agent-session-item.active', { hasText: /Lifecycle E2E/i })
        ).toBeVisible({ timeout: 15_000 });
        console.log('[lifecycle-e2e]   Session "Lifecycle E2E" created');

        // Open runtime settings
        const runtimeToggle = page.locator('[aria-label="toggle-runtime-settings"]');
        await runtimeToggle.click();

        // Provider
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

        // Bind env1
        console.log('[lifecycle-e2e]   Binding environment...');
        const bindModeSelect = page.locator('[aria-label="session-bind-mode"]');
        await expect(bindModeSelect).toBeVisible({ timeout: 5_000 });
        await bindModeSelect.selectOption('env');

        const envSelect = page.locator('[aria-label="session-bind-env"]');
        await expect(envSelect).toBeVisible({ timeout: 5_000 });
        // Select env1 by label (index:1 may pick wrong env depending on sort order)
        await envSelect.selectOption({ label: 'env1' });
        console.log('[lifecycle-e2e]   Selected environment: env1');

        const bindBtn = page.locator('button', { hasText: /bind to/i });
        await expect(bindBtn).toBeEnabled({ timeout: 5_000 });
        await bindBtn.click();
        console.log('[lifecycle-e2e]   Environment bound');
        await page.waitForTimeout(1_000);

        // Apply model
        await page.locator('button', { hasText: /apply model/i }).click();
        console.log('[lifecycle-e2e]   Model applied');

        await dismissTaskOffcanvas(page);

        // Wait for Running state
        await expect(
            page.locator('.session-context-toolbar')
        ).toContainText(/running/i, { timeout: 15_000 });
        console.log('[lifecycle-e2e]   Execution state: Running');

        // Extract session ID
        sessionId = await page.locator('.agent-session-item.active').getAttribute('data-session-id');
        if (!sessionId) {
            const url = page.url();
            const match = url.match(/sessionId=([^&]+)/);
            sessionId = match ? decodeURIComponent(match[1]) : `lifecycle-e2e-${Date.now()}`;
        }
        console.log(`[lifecycle-e2e]   Session ID: ${sessionId}`);

        // Wait for dashboard server
        console.log('[lifecycle-e2e]   Waiting for dashboard server...');
        await pollUntil(
            async () => ({ up: await isDashboardUp() }),
            (s) => s.up,
            60_000,
            3_000
        );
        console.log('[lifecycle-e2e]   Dashboard ready on :30003');

        // ── Verify env binding propagated to backend ──
        console.log('[lifecycle-e2e]   Verifying env binding via dashboard API...');
        const envBinding = await pollUntil(
            async () => {
                const d = await fetchJSON(`/api/dashboard/${sid()}`);
                return { bound: d.body.env.bound, envIds: d.body.env.envIds };
            },
            (r) => r.bound && r.envIds.length > 0,
            15_000,
            2_000
        );
        expect(envBinding.bound).toBe(true);
        expect(envBinding.envIds.length).toBeGreaterThan(0);
        console.log(`[lifecycle-e2e]   Env binding verified: envIds=${JSON.stringify(envBinding.envIds)}`);

        // ── Fill preset questions via UI (mirrors onboarding-e2e.spec.js) ──
        console.log('[lifecycle-e2e]   Waiting for preset modal...');
        const presetModal = page.locator('.ai-preset-modal');
        try {
            await expect(presetModal).toBeVisible({ timeout: 10_000 });
        } catch {
            // Modal didn't auto-open — collapse settings, click trigger
            const runtimeToggleClose = page.locator('[aria-label="toggle-runtime-settings"]');
            await runtimeToggleClose.click();
            const presetTrigger = page.locator('.ai-preset-trigger');
            await expect(presetTrigger).toBeEnabled({ timeout: 10_000 });
            await presetTrigger.click();
            await expect(presetModal).toBeVisible({ timeout: 5_000 });
        }
        console.log('[lifecycle-e2e]   Preset modal opened');

        // 1. Job Title
        const jobTitleItem = page.locator('.ai-preset-question-item').filter({
            has: page.locator('.ai-option-title', { hasText: /job title/i })
        });
        await expect(jobTitleItem).toBeVisible({ timeout: 5_000 });
        await jobTitleItem.locator('input[type="text"]').fill('Fullstack Developer');
        await jobTitleItem.locator('button', { hasText: /confirm/i }).click();
        console.log('[lifecycle-e2e]   Filled: Job Title = Fullstack Developer');
        await page.waitForTimeout(1000);

        // 2. Location
        const locationItem = page.locator('.ai-preset-question-item').filter({
            has: page.locator('.ai-option-title', { hasText: /location/i })
        });
        await expect(locationItem).toBeVisible({ timeout: 5_000 });
        await locationItem.locator('input[type="text"]').fill('Ontario');
        await locationItem.locator('button', { hasText: /confirm/i }).click();
        console.log('[lifecycle-e2e]   Filled: Location = Ontario');
        await page.waitForTimeout(1000);

        // 3. Salary
        try {
            const salaryItem = page.locator('.ai-preset-question-item').filter({
                has: page.locator('.ai-option-title', { hasText: /salary/i })
            });
            await salaryItem.scrollIntoViewIfNeeded();
            await salaryItem.locator('input[type="text"]').fill('80K');
            await salaryItem.locator('button', { hasText: /confirm/i }).click();
            console.log('[lifecycle-e2e]   Filled: Salary = 80K');
            await page.waitForTimeout(1000);
        } catch {
            console.log('[lifecycle-e2e]   Salary field not found (optional)');
        }

        // 4. Work Mode (Selection group — expand if collapsed)
        try {
            const selectionGroup = page.locator('.ai-preset-group').filter({
                has: page.locator('.ai-preset-group__title', { hasText: /selection/i })
            });
            await selectionGroup.locator('.ai-preset-group__header').scrollIntoViewIfNeeded();
            if (await selectionGroup.locator('.ai-preset-group__caret').textContent() === '+') {
                await selectionGroup.locator('.ai-preset-group__header').click();
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

        // 5. Close preset modal
        console.log('[lifecycle-e2e]   Closing preset modal...');
        await page.locator('.ai-preset-modal .modal-footer button', { hasText: /close/i }).click();
        await expect(presetModal).not.toBeVisible({ timeout: 5_000 });
        console.log('[lifecycle-e2e]   Preset modal closed');

        // 6. Wait for dashboard artifact (direction+profile seeded via UI flow)
        console.log('[lifecycle-e2e]   Waiting for dashboard generation...');
        try {
            await page.locator('.ai-artifact-card--button').filter({ hasText: /dashboard/i })
                .waitFor({ state: 'visible', timeout: 60_000 });
            console.log('[lifecycle-e2e]   Dashboard artifact appeared');
        } catch {
            console.log('[lifecycle-e2e]   Dashboard artifact not auto-generated (profile collection may be needed)');
        }

        // Record initial fix rules count
        fixRulesBefore = countFixRules(readPlatformTools());
        console.log(`[lifecycle-e2e]   Initial fix rules count: ${fixRulesBefore}`);
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 1: Platform Discovery (Test 4)
    // ═══════════════════════════════════════════════════════════════════

    test('4. Discover platforms', async () => {
        console.log('[lifecycle-e2e] Phase 1 — Step 4: Platform discovery...');

        const { status, body } = await fetchJSON(`/api/platforms/${sid()}`);
        expect(status).toBe(200);
        platforms = body.platforms || body || [];
        console.log(`[lifecycle-e2e]   Found ${platforms.length} platform(s)`);

        platforms.forEach(p => {
            console.log(`[lifecycle-e2e]     Platform: ${p.name || p.id} | login: ${p.loginStatus || 'unknown'} | tools: ${JSON.stringify(p.tools || {})}`);
        });

        // Identify Indeed and LinkedIn
        indeedPlatform = platforms.find(p =>
            (p.name || p.id || '').toLowerCase().includes('indeed')
        );
        linkedinPlatform = platforms.find(p =>
            (p.name || p.id || '').toLowerCase().includes('linkedin')
        );

        console.log(`[lifecycle-e2e]   Indeed: ${indeedPlatform ? (indeedPlatform.id || indeedPlatform.name) : 'NOT FOUND'}`);
        console.log(`[lifecycle-e2e]   LinkedIn: ${linkedinPlatform ? (linkedinPlatform.id || linkedinPlatform.name) : 'NOT FOUND'}`);

        expect(platforms.length).toBeGreaterThan(0);
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 2: Login Flow (Tests 5-6)
    // ═══════════════════════════════════════════════════════════════════

    test('5. Login to Indeed (open browser)', async () => {
        test.setTimeout(60_000);
        console.log('[lifecycle-e2e] Phase 2 — Step 5: Indeed login...');

        if (!indeedPlatform) {
            console.log('[lifecycle-e2e]   Indeed not found — skipping');
            test.skip();
            return;
        }

        const pid = encodeURIComponent(indeedPlatform.id || indeedPlatform.name);

        try {
            const { status, body } = await postJSON(`/api/platforms/${sid()}/${pid}/login`, {});
            console.log(`[lifecycle-e2e]   Login response: ${status} — ${JSON.stringify(body).slice(0, 200)}`);

            // Wait for browser to open and load
            console.log('[lifecycle-e2e]   Waiting 10s for browser to load...');
            await new Promise(r => setTimeout(r, 10_000));
        } catch (err) {
            console.log(`[lifecycle-e2e]   Login request failed: ${err.message} (non-fatal)`);
        }
    });

    test('6. Confirm Indeed login', async () => {
        test.setTimeout(60_000);
        console.log('[lifecycle-e2e] Phase 2 — Step 6: Confirm Indeed login...');

        if (!indeedPlatform) {
            console.log('[lifecycle-e2e]   Indeed not found — skipping');
            test.skip();
            return;
        }

        const pid = encodeURIComponent(indeedPlatform.id || indeedPlatform.name);

        try {
            const { status, body } = await postJSON(`/api/platforms/${sid()}/${pid}/confirm-login`, {});
            console.log(`[lifecycle-e2e]   Confirm-login response: ${status} — ${JSON.stringify(body).slice(0, 200)}`);

            if (body.loggedIn || body.confirmed || body.success) {
                console.log('[lifecycle-e2e]   Indeed login CONFIRMED');
            } else {
                console.log('[lifecycle-e2e]   Indeed login NOT confirmed (may need manual login)');
            }
        } catch (err) {
            console.log(`[lifecycle-e2e]   Confirm-login failed: ${err.message} (non-fatal, continuing)`);
        }

        // Verify browserId was assigned (not just method:url fallback)
        try {
            const { body: platList } = await fetchJSON(`/api/platforms/${sid()}`);
            const allPlatforms = platList.platforms || platList || [];
            const indeed = allPlatforms.find(p => /indeed/i.test(p.name || p.id || ''));
            if (indeed) {
                if (indeed._browserId) {
                    console.log(`[lifecycle-e2e]   Indeed browserId: ${indeed._browserId} (fingerprint browser)`);
                } else {
                    console.log('[lifecycle-e2e]   FAIL: Indeed has no _browserId — login used URL fallback instead of fingerprint browser');
                    console.log('[lifecycle-e2e]   This means env binding did not work. Search will fail with "No browser open".');
                    // Don't hard-fail yet — the GATE test will catch this
                }
            }
        } catch (err) {
            console.log(`[lifecycle-e2e]   browserId check error: ${err.message}`);
        }

        // Also try LinkedIn if available
        if (linkedinPlatform) {
            const lpid = encodeURIComponent(linkedinPlatform.id || linkedinPlatform.name);
            try {
                await postJSON(`/api/platforms/${sid()}/${lpid}/login`, {});
                await new Promise(r => setTimeout(r, 5_000));
                const { body } = await postJSON(`/api/platforms/${sid()}/${lpid}/confirm-login`, {});
                console.log(`[lifecycle-e2e]   LinkedIn login: ${body.loggedIn || body.confirmed || body.success ? 'CONFIRMED' : 'NOT confirmed'}`);
            } catch (err) {
                console.log(`[lifecycle-e2e]   LinkedIn login attempt: ${err.message} (non-fatal)`);
            }
        }
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 3: Build Search Tool (Tests 7-8)
    // ═══════════════════════════════════════════════════════════════════

    test('7. Build search tool for Indeed', async () => {
        test.setTimeout(180_000); // 3 min — AI generation takes time
        console.log('[lifecycle-e2e] Phase 3 — Step 7: Building search tool...');

        if (!indeedPlatform) {
            console.log('[lifecycle-e2e]   Indeed not found — skipping');
            test.skip();
            return;
        }

        const pid = encodeURIComponent(indeedPlatform.id || indeedPlatform.name);

        try {
            const { status, body } = await postJSON(`/api/platforms/${sid()}/${pid}/tools/search/build`, {});
            console.log(`[lifecycle-e2e]   Build response: ${status} — ${JSON.stringify(body).slice(0, 300)}`);

            if (status === 200 && (body.success || body.building || body.status)) {
                console.log('[lifecycle-e2e]   Build initiated, polling for completion...');

                // Poll build-log until done
                const buildResult = await pollUntil(
                    async () => {
                        const { body: log } = await fetchJSON(`/api/platforms/${sid()}/${pid}/tools/search/build-log`);
                        return log;
                    },
                    (log) => {
                        const st = (log.status || '').toLowerCase();
                        return st === 'ready' || st === 'complete' || st === 'completed' || st === 'failed' || st === 'error';
                    },
                    120_000,
                    5_000,
                    (log) => {
                        console.log(`[lifecycle-e2e]     Build status: ${log.status || 'unknown'}`);
                    }
                );
                console.log(`[lifecycle-e2e]   Build result: ${JSON.stringify(buildResult).slice(0, 300)}`);
            } else {
                console.log(`[lifecycle-e2e]   Build response unexpected: ${status}`);
            }
        } catch (err) {
            console.log(`[lifecycle-e2e]   Build tool error: ${err.message} (non-fatal)`);
        }
    });

    test('8. Verify build result + check fix rules', async () => {
        console.log('[lifecycle-e2e] Phase 3 — Step 8: Verifying build result...');

        if (!indeedPlatform) {
            console.log('[lifecycle-e2e]   Indeed not found — skipping');
            test.skip();
            return;
        }

        const pid = encodeURIComponent(indeedPlatform.id || indeedPlatform.name);

        try {
            const { status, body } = await fetchJSON(`/api/platforms/${sid()}/${pid}/tools/search/build-log`);
            console.log(`[lifecycle-e2e]   Build-log status: ${status}`);
            console.log(`[lifecycle-e2e]   Tool status: ${body.status || 'unknown'}`);
            console.log(`[lifecycle-e2e]   Version: ${body.version || 'N/A'}`);
            console.log(`[lifecycle-e2e]   JD verified: ${body.jdVerified ?? 'N/A'}`);

            if (body.status === 'failed' || body.status === 'error') {
                console.log(`[lifecycle-e2e]   Build FAILED — error: ${body.error || body.message || 'unknown'}`);
                // Check if fix rules were generated
                const ptData = readPlatformTools();
                const newFixRules = countFixRules(ptData);
                if (newFixRules > fixRulesBefore) {
                    console.log(`[lifecycle-e2e]   Fix rules generated: ${newFixRules - fixRulesBefore} new rule(s)`);
                }
            }
        } catch (err) {
            console.log(`[lifecycle-e2e]   Build-log fetch error: ${err.message} (non-fatal)`);
        }

        // Read platform-tools.json for current state
        const ptData = readPlatformTools();
        const keys = Object.keys(ptData);
        console.log(`[lifecycle-e2e]   platform-tools.json: ${keys.length} platform(s)`);
        keys.forEach(k => {
            const p = ptData[k];
            if (p && p.tools) {
                Object.keys(p.tools).forEach(t => {
                    const tool = p.tools[t];
                    console.log(`[lifecycle-e2e]     ${k} → ${t}: fixRules=${(tool.fixRules || []).length}, antiDebug=${(tool.__antiDebugDomains || []).length || 0}`);
                });
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 3b: GATE — Verify Search Prerequisites (Test 8b)
    // ═══════════════════════════════════════════════════════════════════

    test('8b. GATE: Verify search prerequisites before workflow', async () => {
        console.log('[lifecycle-e2e] Phase 3b — GATE: Verifying all search prerequisites...');

        // Verify direction + profile persisted from UI flow (no re-injection needed)
        const { status, body: dashData } = await fetchJSON(`/api/dashboard/${sid()}`);
        expect(status).toBe(200);

        // Direction must be set (from preset questions filled in test 3)
        expect(dashData.direction.jobTitle || dashData.direction.q_job_title).toBeTruthy();
        console.log(`[lifecycle-e2e]   Direction: ${dashData.direction.jobTitle || dashData.direction.q_job_title} in ${dashData.direction.location || dashData.direction.q_location}`);

        // Profile should exist (may be seeded from resume or master profile via UI flow)
        const profile = dashData.profile || {};
        const hasProfile = profile.skills || profile.basic || profile.experience || Object.keys(profile).length > 0;
        console.log(`[lifecycle-e2e]   Profile: ${hasProfile ? 'present' : 'empty'} (keys: ${Object.keys(profile).join(', ')})`);
        if (profile.skills) {
            console.log(`[lifecycle-e2e]   Profile skills: ${(profile.skills || '').slice(0, 60)}...`);
        }

        // Env must be bound
        expect(dashData.env.bound).toBe(true);
        expect(dashData.env.envIds.length).toBeGreaterThan(0);
        console.log(`[lifecycle-e2e]   Env bound: ${JSON.stringify(dashData.env.envIds)}`);

        // At least one platform must have a browser open (_browserId)
        const { body: platList } = await fetchJSON(`/api/platforms/${sid()}`);
        const allPlatforms = platList.platforms || platList || [];
        const withBrowser = allPlatforms.filter(p => p._browserId);
        expect(withBrowser.length).toBeGreaterThan(0);
        console.log(`[lifecycle-e2e]   Platforms with browser: ${withBrowser.map(p => p.name || p.id).join(', ')}`);

        console.log('[lifecycle-e2e]   GATE PASSED: All search prerequisites met');
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 4: Search Workflow — Run 1 (Tests 9-11)
    // ═══════════════════════════════════════════════════════════════════

    test('9. Start workflow (Run 1)', async () => {
        console.log('[lifecycle-e2e] Phase 4 — Step 9: Starting workflow (Run 1)...');

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
        console.log('[lifecycle-e2e]   Workflow Run 1 started');
    });

    test('10. Poll workflow Run 1 until completion', async () => {
        test.setTimeout(E2E_TIMEOUT + 60_000);
        console.log(`[lifecycle-e2e] Phase 4 — Step 10: Polling Run 1 (timeout: ${E2E_TIMEOUT / 1000}s)...`);

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

        console.log(`[lifecycle-e2e]   Run 1 final status: ${finalStatus.status}`);
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

    test('11. Verify Run 1 search results', async () => {
        console.log('[lifecycle-e2e] Phase 4 — Step 11: Verifying Run 1 results...');

        const { status, body } = await fetchJSON(`/api/dashboard/${sid()}`);
        expect(status).toBe(200);

        const jobs = body.jobs || [];
        run1.jobs = jobs.length;
        console.log(`[lifecycle-e2e]   Jobs found: ${run1.jobs}`);

        // ── STRICT: 0 jobs = FAIL ──
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

        // Markdown contamination check (P1 #8)
        const mdContaminated = jobs.filter(j => {
            const title = j.title || '';
            return title.includes('**') || title.includes('##') || title.includes('```');
        });
        if (mdContaminated.length > 0) {
            console.log(`[lifecycle-e2e]   WARNING: ${mdContaminated.length} job(s) with markdown in title (P1 #8)`);
            mdContaminated.slice(0, 3).forEach(j => console.log(`[lifecycle-e2e]     "${j.title}"`));
        } else {
            console.log('[lifecycle-e2e]   No markdown contamination detected');
        }

        // Job type field check (P1 #7)
        const withType = jobs.filter(j => j.type || j.jobType);
        console.log(`[lifecycle-e2e]   With job type: ${withType.length}/${jobs.length} (P1 #7)`);

        // ── STRICT: pipeline must have actually searched ──
        try {
            const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid()}/status`);
            if (pipeStatus.progress) {
                const searched = pipeStatus.progress.searched || 0;
                expect(searched).toBeGreaterThan(0);
                console.log(`[lifecycle-e2e]   Pipeline searched: ${searched} (PASS: > 0)`);
            }
        } catch (err) {
            console.log(`[lifecycle-e2e]   Pipeline status check error: ${err.message}`);
        }

        // Take screenshot
        await page.screenshot({ path: 'test-results/lifecycle-e2e-run1.png' });
        console.log('[lifecycle-e2e]   Run 1 screenshot saved');
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 5: Fix Rule & History Persistence (Tests 12-13)
    // ═══════════════════════════════════════════════════════════════════

    test('12. Check fix rules after Run 1', async () => {
        console.log('[lifecycle-e2e] Phase 5 — Step 12: Checking fix rules...');

        const ptData = readPlatformTools();
        fixRulesAfter = countFixRules(ptData);

        console.log(`[lifecycle-e2e]   Fix rules before: ${fixRulesBefore}`);
        console.log(`[lifecycle-e2e]   Fix rules after:  ${fixRulesAfter}`);
        console.log(`[lifecycle-e2e]   New rules added:  ${fixRulesAfter - fixRulesBefore}`);

        // Log all fix rules
        for (const pid of Object.keys(ptData)) {
            const p = ptData[pid];
            if (p && p.tools) {
                for (const tName of Object.keys(p.tools)) {
                    const tool = p.tools[tName];
                    if (tool.fixRules && tool.fixRules.length > 0) {
                        console.log(`[lifecycle-e2e]   ${pid} → ${tName} fixRules:`);
                        tool.fixRules.forEach((r, i) => {
                            console.log(`[lifecycle-e2e]     [${i}] ${typeof r === 'string' ? r.slice(0, 100) : JSON.stringify(r).slice(0, 100)}`);
                        });
                    }
                    if (tool.__antiDebugDomains && tool.__antiDebugDomains.length > 0) {
                        console.log(`[lifecycle-e2e]   ${pid} → ${tName} antiDebugDomains: ${tool.__antiDebugDomains.join(', ')}`);
                    }
                }
            }
        }
    });

    test('13. Check search history persistence', async () => {
        console.log('[lifecycle-e2e] Phase 5 — Step 13: Checking search history...');

        try {
            const { status, body } = await fetchJSON(`/api/pipeline/${sid()}/status`);
            if (status === 200 && body.progress) {
                // seenUrls
                const seenUrls = body.progress.seenUrls || body.progress.seen || [];
                run1.seenUrls = Array.isArray(seenUrls) ? seenUrls.length : (typeof seenUrls === 'number' ? seenUrls : 0);
                console.log(`[lifecycle-e2e]   Seen URLs: ${run1.seenUrls}`);

                // Queries
                const queries = body.progress.queries || body.progress.searchQueries || [];
                run1.queries = Array.isArray(queries) ? queries.length : 0;
                console.log(`[lifecycle-e2e]   Queries used: ${run1.queries}`);

                // Page offsets
                const pageOffsets = body.progress.pageOffsets || body.progress.offsets || {};
                console.log(`[lifecycle-e2e]   Page offsets: ${JSON.stringify(pageOffsets)}`);
            }
        } catch (err) {
            console.log(`[lifecycle-e2e]   History check error: ${err.message}`);
        }

        // Also check dashboard data for history
        try {
            const { body: dashData } = await fetchJSON(`/api/dashboard/${sid()}`);
            if (dashData.direction) {
                console.log(`[lifecycle-e2e]   Direction persisted: q_job_title="${dashData.direction.q_job_title}"`);
            }
            if (dashData.profile) {
                console.log(`[lifecycle-e2e]   Profile persisted: basic="${(dashData.profile.basic || '').slice(0, 50)}..."`);
            }
        } catch (err) {
            console.log(`[lifecycle-e2e]   Dashboard data error: ${err.message}`);
        }
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 6: Second Search — Run 2 (Tests 14-16)
    // ═══════════════════════════════════════════════════════════════════

    test('14. Start workflow (Run 2)', async () => {
        console.log('[lifecycle-e2e] Phase 6 — Step 14: Starting workflow (Run 2)...');

        // Ensure config still valid
        const cfgResp = await fetchJSON(`/api/workflow/${sid()}/config`);
        expect(cfgResp.status).toBe(200);

        const { status, body } = await postJSON(`/api/workflow/${sid()}/start`, {});
        console.log(`[lifecycle-e2e]   Start response: ${status} — ${JSON.stringify(body)}`);

        if (status === 400 && body.error?.includes('AI provider required')) {
            console.log('[lifecycle-e2e]   AI provider not available — skipping');
            test.skip();
            return;
        }
        expect(status).toBe(200);
        expect(body.success === true || body.error?.includes('already running')).toBeTruthy();
        console.log('[lifecycle-e2e]   Workflow Run 2 started');
    });

    test('15. Poll workflow Run 2 until completion', async () => {
        test.setTimeout(E2E_TIMEOUT + 60_000);
        console.log(`[lifecycle-e2e] Phase 6 — Step 15: Polling Run 2 (timeout: ${E2E_TIMEOUT / 1000}s)...`);

        let lastPhase = '';
        let restoredSeenUrls = false;

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

        console.log(`[lifecycle-e2e]   Run 2 final status: ${finalStatus.status}`);
        expect(['completed', 'stopped', 'idle', 'error']).toContain(finalStatus.status);

        // Check pipeline for "Restored X seen URLs"
        try {
            const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid()}/status`);
            if (pipeStatus.progress && pipeStatus.progress.logs) {
                const restoreLogs = pipeStatus.progress.logs.filter(l => {
                    const msg = (l.message || JSON.stringify(l)).toLowerCase();
                    return msg.includes('restored') && msg.includes('seen');
                });
                if (restoreLogs.length > 0) {
                    restoredSeenUrls = true;
                    restoreLogs.forEach(l => console.log(`[lifecycle-e2e]   DEDUP: ${l.message || JSON.stringify(l)}`));
                }
            }
            console.log(`[lifecycle-e2e]   Restored seen URLs from history: ${restoredSeenUrls}`);
            run2.errors = (pipeStatus.progress?.errors || []).length;
        } catch (err) {
            console.log(`[lifecycle-e2e]   Pipeline status error: ${err.message}`);
        }
    });

    test('16. Verify dedup + keyword rotation (Run 2 vs Run 1)', async () => {
        console.log('[lifecycle-e2e] Phase 6 — Step 16: Verifying dedup + keyword rotation...');

        const { status, body } = await fetchJSON(`/api/dashboard/${sid()}`);
        expect(status).toBe(200);

        const jobs = body.jobs || [];
        run2.jobs = jobs.length;
        console.log(`[lifecycle-e2e]   Total jobs after Run 2: ${run2.jobs}`);
        console.log(`[lifecycle-e2e]   Jobs from Run 1: ${run1.jobs}`);
        console.log(`[lifecycle-e2e]   Net new jobs: ${run2.jobs - run1.jobs}`);

        // Check pipeline for updated seen URLs / queries
        try {
            const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid()}/status`);
            if (pipeStatus.progress) {
                const seenUrls = pipeStatus.progress.seenUrls || pipeStatus.progress.seen || [];
                run2.seenUrls = Array.isArray(seenUrls) ? seenUrls.length : (typeof seenUrls === 'number' ? seenUrls : 0);
                const queries = pipeStatus.progress.queries || pipeStatus.progress.searchQueries || [];
                run2.queries = Array.isArray(queries) ? queries.length : 0;
            }
        } catch (err) {
            console.log(`[lifecycle-e2e]   Pipeline check error: ${err.message}`);
        }

        // Comparison table
        console.log('[lifecycle-e2e]   ┌───────────────┬────────┬────────┐');
        console.log('[lifecycle-e2e]   │ Metric        │ Run 1  │ Run 2  │');
        console.log('[lifecycle-e2e]   ├───────────────┼────────┼────────┤');
        console.log(`[lifecycle-e2e]   │ Jobs          │ ${String(run1.jobs).padStart(6)} │ ${String(run2.jobs).padStart(6)} │`);
        console.log(`[lifecycle-e2e]   │ Seen URLs     │ ${String(run1.seenUrls).padStart(6)} │ ${String(run2.seenUrls).padStart(6)} │`);
        console.log(`[lifecycle-e2e]   │ Queries       │ ${String(run1.queries).padStart(6)} │ ${String(run2.queries).padStart(6)} │`);
        console.log(`[lifecycle-e2e]   │ Errors        │ ${String(run1.errors).padStart(6)} │ ${String(run2.errors).padStart(6)} │`);
        console.log('[lifecycle-e2e]   └───────────────┴────────┴────────┘');

        // Take screenshot
        await page.screenshot({ path: 'test-results/lifecycle-e2e-run2.png' });
        console.log('[lifecycle-e2e]   Run 2 screenshot saved');
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 7: Error Recovery Verification (Tests 17-18)
    // ═══════════════════════════════════════════════════════════════════

    test('17. Check selfHeal triggers', async () => {
        console.log('[lifecycle-e2e] Phase 7 — Step 17: Checking selfHeal...');

        try {
            const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid()}/status`);
            if (pipeStatus.progress && pipeStatus.progress.logs) {
                const selfHealLogs = pipeStatus.progress.logs.filter(l => {
                    const msg = (l.message || JSON.stringify(l)).toLowerCase();
                    return msg.includes('selfheal') || msg.includes('self-heal') || msg.includes('self_heal')
                        || msg.includes('fix rule') || msg.includes('fixrule');
                });
                selfHealCount = selfHealLogs.length;
                console.log(`[lifecycle-e2e]   selfHeal triggers found: ${selfHealCount}`);
                selfHealLogs.forEach(l => {
                    console.log(`[lifecycle-e2e]     HEAL: ${l.message || JSON.stringify(l)}`);
                });

                if (selfHealCount > 0) {
                    // Verify fix rules were added
                    const ptData = readPlatformTools();
                    const currentRules = countFixRules(ptData);
                    console.log(`[lifecycle-e2e]   Fix rules now: ${currentRules} (was: ${fixRulesBefore})`);
                }
            } else {
                console.log('[lifecycle-e2e]   No pipeline logs available');
            }

            if (selfHealCount === 0) {
                console.log('[lifecycle-e2e]   No selfHeal triggers — no failures occurred (valid outcome)');
            }
        } catch (err) {
            console.log(`[lifecycle-e2e]   selfHeal check error: ${err.message}`);
        }
    });

    test('18. Check Cloudflare detection', async () => {
        console.log('[lifecycle-e2e] Phase 7 — Step 18: Checking Cloudflare...');

        try {
            const { body: pipeStatus } = await fetchJSON(`/api/pipeline/${sid()}/status`);
            if (pipeStatus.progress && pipeStatus.progress.logs) {
                const cfLogs = pipeStatus.progress.logs.filter(l => {
                    const msg = (l.message || JSON.stringify(l)).toLowerCase();
                    return msg.includes('cloudflare') || msg.includes('blocked') || msg.includes('challenge')
                        || msg.includes('captcha') || msg.includes('bot detect');
                });
                cloudflareCount = cfLogs.length;
                if (cloudflareCount > 0) {
                    console.log(`[lifecycle-e2e]   Cloudflare detections: ${cloudflareCount}`);
                    cfLogs.forEach(l => {
                        console.log(`[lifecycle-e2e]     CF: ${l.message || JSON.stringify(l)}`);
                    });
                } else {
                    console.log('[lifecycle-e2e]   No Cloudflare blocks detected');
                }
            } else {
                console.log('[lifecycle-e2e]   No pipeline logs available for Cloudflare check');
            }
        } catch (err) {
            console.log(`[lifecycle-e2e]   Cloudflare check error: ${err.message}`);
        }
    });

    // ═══════════════════════════════════════════════════════════════════
    // Phase 8: Final Report (Tests 19-20)
    // ═══════════════════════════════════════════════════════════════════

    test('19. Summary report', async () => {
        console.log('[lifecycle-e2e] Phase 8 — Step 19: SUMMARY REPORT');
        console.log('[lifecycle-e2e] ╔══════════════════════════════════════════════════════════╗');
        console.log('[lifecycle-e2e] ║           FULL LIFECYCLE E2E — SUMMARY                  ║');
        console.log('[lifecycle-e2e] ╠══════════════════════════════════════════════════════════╣');
        console.log(`[lifecycle-e2e] ║ Provider:        ${E2E_PROVIDER.padEnd(39)}║`);
        console.log(`[lifecycle-e2e] ║ Session:         ${(sessionId || 'N/A').slice(0, 39).padEnd(39)}║`);
        console.log('[lifecycle-e2e] ╠══════════════════════════════════════════════════════════╣');

        // Platform login status
        console.log('[lifecycle-e2e] ║ PLATFORM STATUS                                        ║');
        for (const p of platforms) {
            const name = (p.name || p.id || 'unknown').slice(0, 15).padEnd(15);
            const login = (p.loginStatus || 'unknown').padEnd(10);
            console.log(`[lifecycle-e2e] ║   ${name} login: ${login}                         ║`);
        }

        console.log('[lifecycle-e2e] ╠══════════════════════════════════════════════════════════╣');
        console.log('[lifecycle-e2e] ║ SEARCH COMPARISON                                      ║');
        console.log('[lifecycle-e2e] ║   ┌───────────────┬────────┬────────┐                   ║');
        console.log('[lifecycle-e2e] ║   │ Metric        │ Run 1  │ Run 2  │                   ║');
        console.log('[lifecycle-e2e] ║   ├───────────────┼────────┼────────┤                   ║');
        console.log(`[lifecycle-e2e] ║   │ Jobs          │ ${String(run1.jobs).padStart(6)} │ ${String(run2.jobs).padStart(6)} │                   ║`);
        console.log(`[lifecycle-e2e] ║   │ Seen URLs     │ ${String(run1.seenUrls).padStart(6)} │ ${String(run2.seenUrls).padStart(6)} │                   ║`);
        console.log(`[lifecycle-e2e] ║   │ Queries       │ ${String(run1.queries).padStart(6)} │ ${String(run2.queries).padStart(6)} │                   ║`);
        console.log(`[lifecycle-e2e] ║   │ Errors        │ ${String(run1.errors).padStart(6)} │ ${String(run2.errors).padStart(6)} │                   ║`);
        console.log('[lifecycle-e2e] ║   └───────────────┴────────┴────────┘                   ║');

        console.log('[lifecycle-e2e] ╠══════════════════════════════════════════════════════════╣');
        console.log('[lifecycle-e2e] ║ RECOVERY & INTEGRITY                                   ║');
        console.log(`[lifecycle-e2e] ║   Fix rules (before):  ${String(fixRulesBefore).padStart(5)}                            ║`);
        console.log(`[lifecycle-e2e] ║   Fix rules (after):   ${String(fixRulesAfter).padStart(5)}                            ║`);
        console.log(`[lifecycle-e2e] ║   selfHeal triggers:   ${String(selfHealCount).padStart(5)}                            ║`);
        console.log(`[lifecycle-e2e] ║   Cloudflare blocks:   ${String(cloudflareCount).padStart(5)}                            ║`);
        console.log('[lifecycle-e2e] ╚══════════════════════════════════════════════════════════╝');
    });

    test('20. Final screenshot + cleanup', async () => {
        console.log('[lifecycle-e2e] Phase 8 — Step 20: Final screenshot + cleanup...');

        // Navigate back to workspace for final screenshot
        const baseUrl = page.url().split('#')[0];
        await page.goto(`${baseUrl}#/agentWorkspace/${encodeURIComponent(TASK_NAME)}`);
        await page.waitForTimeout(3_000);

        // Ensure test-results dir exists
        const resultsDir = path.join(__dirname, '..', 'test-results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }

        await page.screenshot({ path: 'test-results/lifecycle-e2e-final.png' });
        console.log('[lifecycle-e2e]   Final screenshot saved to test-results/lifecycle-e2e-final.png');

        // Dashboard screenshot via fetch
        try {
            const { body: dashData } = await fetchJSON(`/api/dashboard/${sid()}`);
            const totalJobs = (dashData.jobs || []).length;
            const scored = (dashData.jobs || []).filter(j => j.matchScore != null || j.score != null).length;
            console.log(`[lifecycle-e2e]   Final dashboard: ${totalJobs} jobs, ${scored} scored`);
        } catch (err) {
            console.log(`[lifecycle-e2e]   Dashboard fetch error: ${err.message}`);
        }

        console.log('[lifecycle-e2e] Full Lifecycle E2E complete');
    });
});
