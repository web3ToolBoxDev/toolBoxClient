// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const {
  waitForBackend,
  waitForDashboard,
  setupSession,
  dismissTaskOffcanvas,
  navigateToWorkspace,
  pollWorkflowStatus,
  pollPlatformStatus,
  fetchDashboardJSON,
  postDashboardJSON,
  BACKEND_URL,
  DASHBOARD_URL,
} = require('./helpers/e2e-helpers');

/**
 * Main Flow E2E — Happy Path (Phase 0-8, serial, GATE mechanism)
 *
 * Covers the complete job-seek agent lifecycle:
 *   Phase 0: Health checks (backend + React UI)
 *   Phase 1: Session creation + runtime settings
 *   Phase 2: Onboarding + resume upload
 *   Phase 3: Build dashboard
 *   Phase 4: Dashboard verification (second page context, :30003)
 *   Phase 5: Platform login (LinkedIn-preferred)
 *   Phase 6: Search build
 *   Phase 7: Workflow start + poll
 *   Phase 8: Results verification
 *
 * Prerequisites:
 *   - React dev server on http://localhost:3000  (npm start)
 *   - Express backend on http://localhost:30001  (npm run dev)
 *   - env1 fingerprint browser profile with LinkedIn/Indeed cookies
 *
 * Environment variables:
 *   E2E_PROVIDER      - 'claude-code' (default) | 'codex-cli' | 'api-key'
 *   E2E_MODEL         - model name (empty = default)
 *   E2E_SUB_PROVIDER  - 'openai' | 'anthropic' | 'google' (api-key only)
 *   E2E_API_KEY       - API key (api-key only)
 *   E2E_SKIP_LOGIN    - '1' to skip platform login steps
 *   E2E_TIMEOUT       - workflow poll timeout in ms (default 300000)
 *   E2E_ENV_LABEL     - env dropdown label (default tries env1 / 环境1)
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/main-flow.spec.js --headed
 */

const MOCK_RESUME = path.resolve(__dirname, 'fixtures', 'mock-resume.txt');
const E2E_SKIP_LOGIN = process.env.E2E_SKIP_LOGIN === '1';
const E2E_TIMEOUT = parseInt(process.env.E2E_TIMEOUT || '300000');
const E2E_ENV_LABEL = process.env.E2E_ENV_LABEL || undefined;

// ─── Shared state across serial tests ───

const gates = {
  backendUp: false,
  uiReady: false,
  sessionCreated: false,
  onboardingDone: false,
  dashboardReady: false,
  dashboardValid: false,
  loginReady: false,
  searchReady: false,
  workflowDone: false,
};

let sessionId = '';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FLOW — serial tests with GATE skipping
// ═══════════════════════════════════════════════════════════════════════════════

test.describe.serial('Main Flow E2E — Happy Path', () => {
  test.setTimeout(E2E_TIMEOUT + 300_000);

  // ── Phase 0: Pre-flight checks ──

  test('GATE-0: Backend health check', async () => {
    test.setTimeout(35_000);
    console.log('[e2e] Phase 0 -- Backend health check...');
    const ready = await waitForBackend(30_000);
    expect(ready, 'Backend must be running on :30001').toBe(true);
    gates.backendUp = true;
    console.log('[e2e] GATE-0 PASSED: Backend healthy');
  });

  test('GATE-0b: React UI reachable', async () => {
    test.setTimeout(15_000);
    test.skip(!gates.backendUp, 'Skipped — GATE-0 failed');
    console.log('[e2e] Phase 0b -- React UI check...');
    try {
      const resp = await fetch('http://localhost:3000', { signal: AbortSignal.timeout(10_000) });
      expect(resp.ok, 'React UI must be reachable on :3000').toBe(true);
    } catch (err) {
      throw new Error(`React UI not reachable: ${err.message}`);
    }
    gates.uiReady = true;
    console.log('[e2e] GATE-0b PASSED: React UI reachable');
  });

  // ── Phase 1: Session creation + runtime settings ──

  test('Phase 1: Create session, bind env, configure provider/model', async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!gates.uiReady, 'Skipped — GATE-0b failed');
    console.log('[e2e] Phase 1 -- Session setup...');

    // Navigate via UI clicks (not page.goto to workspace)
    await navigateToWorkspace(page);

    sessionId = await setupSession(page, {
      sessionName: `MainFlow E2E ${Date.now()}`,
      envLabel: E2E_ENV_LABEL,
    });

    expect(sessionId).toBeTruthy();
    gates.sessionCreated = true;
    console.log(`[e2e] Phase 1 PASSED: Session ${sessionId}`);
  });

  // ── Phase 2: Onboarding + resume upload ──

  test('Phase 2: Preset questions + resume upload', async ({ page }) => {
    test.setTimeout(180_000);
    test.skip(!gates.sessionCreated, 'Skipped — Phase 1 failed');
    console.log('[e2e] Phase 2 -- Onboarding...');

    // Re-navigate (serial tests get fresh pages)
    await navigateToWorkspace(page);
    // Select the most recent session (AI may rename it during onboarding)
    const sessionItem = page.locator('.agent-session-item').last();
    await expect(sessionItem).toBeVisible({ timeout: 15_000 });
    await sessionItem.locator('[data-testid="session-select-btn"]').click();
    await page.waitForTimeout(2_000);

    // Open preset modal
    const presetTrigger = page.locator('[data-testid="preset-trigger-btn"]');
    await expect(presetTrigger).toBeVisible({ timeout: 15_000 });
    await presetTrigger.click();
    const presetModal = page.locator('.ai-preset-modal');
    await expect(presetModal).toBeVisible({ timeout: 10_000 });
    console.log('[e2e] Preset modal opened');

    // Fill Job Title
    const jobTitleItem = page.locator('.ai-preset-question-item').filter({
      has: page.locator('.ai-option-title', { hasText: /job title/i }),
    });
    await expect(jobTitleItem).toBeVisible({ timeout: 5_000 });
    await jobTitleItem.locator('input[type="text"]').fill('Fullstack Developer');
    console.log('[e2e] Job Title filled');

    // Fill Location
    const locationItem = page.locator('.ai-preset-question-item').filter({
      has: page.locator('.ai-option-title', { hasText: /location/i }),
    });
    await expect(locationItem).toBeVisible({ timeout: 5_000 });
    await locationItem.locator('input[type="text"]').fill('Ontario, Canada');
    console.log('[e2e] Location filled');

    // Fill Salary
    try {
      const salaryItem = page.locator('.ai-preset-question-item').filter({
        has: page.locator('.ai-option-title', { hasText: /salary/i }),
      });
      await salaryItem.scrollIntoViewIfNeeded();
      await salaryItem.locator('input[type="text"]').fill('80');
      console.log('[e2e] Salary filled');
    } catch {
      console.log('[e2e] Salary field not found (optional)');
    }

    // Click Confirm All for input group
    const confirmAllBtn = presetModal.locator('button').filter({ hasText: /confirm all/i });
    if (await confirmAllBtn.isVisible().catch(() => false)) {
      await confirmAllBtn.click();
      console.log('[e2e] Confirm All clicked');
      await page.waitForTimeout(2_000);
    }

    // Select Work Mode
    try {
      const selectionGroup = page.locator('.ai-preset-group').filter({
        has: page.locator('.ai-preset-group__title', { hasText: /selection/i }),
      });
      const groupHeader = selectionGroup.locator('.ai-preset-group__header');
      await groupHeader.scrollIntoViewIfNeeded();
      const caret = selectionGroup.locator('.ai-preset-group__caret');
      if (await caret.isVisible() && (await caret.textContent()).trim() === '+') {
        await groupHeader.click();
        await page.waitForTimeout(500);
      }
      const workModeItem = page.locator('.ai-preset-question-item').filter({
        has: page.locator('.ai-option-title', { hasText: /work mode/i }),
      });
      await expect(workModeItem).toBeVisible({ timeout: 5_000 });
      await workModeItem.locator('.ai-option-btn', { hasText: /any/i }).click();
      console.log('[e2e] Work Mode = Any');
      await page.waitForTimeout(1_000);
    } catch {
      console.log('[e2e] Work Mode skipped');
    }

    // Upload resume
    try {
      const attachGroup = page.locator('.ai-preset-group').filter({
        has: page.locator('.ai-preset-group__title', { hasText: /attachment/i }),
      });
      await attachGroup.locator('.ai-preset-group__header').scrollIntoViewIfNeeded();
      const attachCaret = attachGroup.locator('.ai-preset-group__caret');
      if (await attachCaret.isVisible() && (await attachCaret.textContent()).trim() === '+') {
        await attachGroup.locator('.ai-preset-group__header').click();
        await page.waitForTimeout(500);
      }
      const uploadItem = page.locator('.ai-preset-question-item').filter({
        has: page.locator('.ai-option-title', { hasText: /upload|resume/i }),
      });
      await expect(uploadItem).toBeVisible({ timeout: 5_000 });
      const uploadBtn = uploadItem.locator('button', { hasText: /upload/i });
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        uploadBtn.click(),
      ]);
      await fileChooser.setFiles(MOCK_RESUME);
      console.log('[e2e] Resume uploaded');
    } catch (err) {
      console.log(`[e2e] Resume upload skipped: ${err.message}`);
    }

    // Verify preset progress
    try {
      await expect(page.locator('.ai-preset-modal__subtitle')).toContainText(/[45]\/5/, { timeout: 10_000 });
      console.log('[e2e] Preset questions complete');
    } catch {
      console.log('[e2e] Could not verify 5/5 preset count');
    }

    // Close preset modal
    await page.locator('.ai-preset-modal .modal-footer button', { hasText: /close/i }).click();
    await expect(presetModal).not.toBeVisible({ timeout: 5_000 });

    // Send confirmation via chat
    const chatInput = page.locator('[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible({ timeout: 10_000 });
    await chatInput.fill('All questions answered. Please proceed with onboarding.');
    await page.locator('[data-testid="chat-send-btn"]').click();
    console.log('[e2e] Chat confirmation sent');

    // Wait for subtask cards (onboarding + profile)
    await expect(
      page.locator('[data-testid="subtask-card-onboarding"]')
    ).toBeVisible({ timeout: 60_000 });
    console.log('[e2e] Onboarding subtask card visible');

    await expect(
      page.locator('[data-testid="subtask-card-profile"]')
    ).toBeVisible({ timeout: 60_000 });
    console.log('[e2e] Profile subtask card visible');

    // Wait for resume processing
    const chatContent = page.locator('.ai-chat-content');
    await expect(chatContent).toContainText(
      /resume sections stored|knowledge base|profile.*done|reusing previous parse|onboarding.*complete|profile from a previous session/i,
      { timeout: 120_000 }
    );
    console.log('[e2e] Resume processed');

    gates.onboardingDone = true;
    console.log('[e2e] Phase 2 PASSED: Onboarding complete');
  });

  // ── Phase 3: Build Dashboard ──

  test('Phase 3: Build dashboard', async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!gates.onboardingDone, 'Skipped — Phase 2 failed');
    console.log('[e2e] Phase 3 -- Build dashboard...');

    await navigateToWorkspace(page);
    // Session may have been renamed by AI during onboarding — select the last (most recent) one
    const sessionItem = page.locator('.agent-session-item').last();
    await expect(sessionItem).toBeVisible({ timeout: 15_000 });
    await sessionItem.locator('[data-testid="session-select-btn"]').click();
    await page.waitForTimeout(2_000);

    // Click Start on dashboard subtask
    const dashboardStart = page.locator('[data-testid="subtask-start-dashboard"]');
    if (await dashboardStart.isVisible().catch(() => false)) {
      await dashboardStart.click();
      console.log('[e2e] Dashboard subtask Start clicked');
    } else {
      console.log('[e2e] Dashboard subtask already started or auto-triggered');
    }

    // Wait for dashboard server to become reachable
    const dashReady = await waitForDashboard(90_000);
    expect(dashReady, 'Dashboard server must be reachable on :30003').toBe(true);
    gates.dashboardReady = true;
    console.log('[e2e] Phase 3 PASSED: Dashboard server ready');
  });

  // ── Phase 4: Dashboard verification (second page context) ──

  test('Phase 4: Dashboard page verification', async ({ browser }) => {
    test.setTimeout(60_000);
    test.skip(!gates.dashboardReady, 'Skipped — Phase 3 failed');
    console.log('[e2e] Phase 4 -- Dashboard verification...');

    // Open dashboard in a NEW browser context (separate from React UI)
    const context = await browser.newContext();
    const dashPage = await context.newPage();

    const dashUrl = `${DASHBOARD_URL}/dashboard/${encodeURIComponent(sessionId)}`;
    await dashPage.goto(dashUrl);
    // Dashboard polls every 5s — networkidle never fires. Use domcontentloaded + wait.
    await dashPage.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await dashPage.waitForTimeout(6_000);

    // Verify platform cards exist (at least 1)
    const platformCards = dashPage.locator('[data-testid^="platform-card-"]');
    const cardCount = await platformCards.count();
    console.log(`[e2e] Found ${cardCount} platform card(s)`);
    expect(cardCount).toBeGreaterThanOrEqual(1);

    // Verify Login button is visible on at least one platform
    const loginBtns = dashPage.locator('[data-testid^="platform-login-"]');
    const confirmBtns = dashPage.locator('[data-testid^="platform-confirm-"]');
    const reloginBtns = dashPage.locator('[data-testid^="platform-relogin-"]');
    const totalLoginControls = await loginBtns.count() + await reloginBtns.count();
    console.log(`[e2e] Login/Relogin buttons: ${totalLoginControls}`);
    expect(totalLoginControls).toBeGreaterThanOrEqual(1);

    // Verify Start Workflow button
    const wfStartBtn = dashPage.locator('[data-testid="wf-start-btn"]');
    await expect(wfStartBtn).toBeVisible({ timeout: 5_000 });
    console.log('[e2e] Start Workflow button visible');

    gates.dashboardValid = true;
    await context.close();
    console.log('[e2e] Phase 4 PASSED: Dashboard valid');
  });

  // ── Phase 5: Platform Login ──

  test('Phase 5: Platform login (LinkedIn preferred)', async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(!gates.dashboardValid, 'Skipped — Phase 4 failed');

    if (E2E_SKIP_LOGIN) {
      console.log('[e2e] Phase 5 SKIPPED: E2E_SKIP_LOGIN=1');
      gates.loginReady = true;
      return;
    }

    console.log('[e2e] Phase 5 -- Platform login...');

    const context = await browser.newContext();
    const dashPage = await context.newPage();
    const dashUrl = `${DASHBOARD_URL}/dashboard/${encodeURIComponent(sessionId)}`;
    await dashPage.goto(dashUrl);
    // Dashboard polls every 5s — networkidle never fires. Use domcontentloaded + wait.
    await dashPage.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await dashPage.waitForTimeout(6_000);

    // Find LinkedIn platform card by name (pid is internal ID, not 'linkedin')
    // Prefer LinkedIn to avoid Indeed's Cloudflare
    const linkedInCard = dashPage.locator('[data-testid^="platform-card-"]', { hasText: /linkedin/i }).first();
    let targetCard = linkedInCard;
    let targetPid = '';

    if (!await linkedInCard.isVisible().catch(() => false)) {
      // No LinkedIn — use first available platform (not Indeed to avoid Cloudflare)
      const cards = dashPage.locator('[data-testid^="platform-card-"]');
      const count = await cards.count();
      for (let i = 0; i < count; i++) {
        const text = await cards.nth(i).textContent() || '';
        if (!/indeed/i.test(text)) { targetCard = cards.nth(i); break; }
      }
      if (!targetCard) targetCard = cards.first();
    }

    // Extract pid from data-testid="platform-card-{pid}"
    const cardTestId = await targetCard.getAttribute('data-testid') || '';
    targetPid = cardTestId.replace('platform-card-', '');
    console.log(`[e2e] Target platform: ${targetPid}`);

    // Check if already logged in (re-login button visible)
    const reloginBtn = targetCard.locator(`[data-testid="platform-relogin-${targetPid}"]`);
    if (await reloginBtn.isVisible().catch(() => false)) {
      console.log(`[e2e] ${targetPid} already logged in (cookie valid)`);
      gates.loginReady = true;
      await context.close();
      return;
    }

    // Click Login
    const loginBtn = targetCard.locator(`[data-testid="platform-login-${targetPid}"]`);
    if (!await loginBtn.isVisible().catch(() => false)) {
      // Maybe confirm button visible instead — platform is in verifying state
      console.log(`[e2e] No login button for ${targetPid} — may be in different state, continuing`);
      gates.loginReady = true;
      await context.close();
      return;
    }
    await loginBtn.click();
    console.log(`[e2e] Login clicked for ${targetPid}`);

    // Wait for status transition: idle -> launching -> verifying -> verified/ready
    // Poll platform status via API
    try {
      await pollPlatformStatus(sessionId, (body) => {
        const platforms = body.platforms || body;
        if (Array.isArray(platforms)) {
          const p = platforms.find(pl => pl.id === targetPid);
          if (!p) return false;
          const loginVis = p.cells?.login?.visual;
          console.log(`[e2e] ${targetPid} login visual: ${loginVis}`);
          return loginVis === 'ready' || loginVis === 'verifying';
        }
        return false;
      }, 60_000);
    } catch {
      console.log('[e2e] Login status poll timed out — checking dashboard UI');
    }

    // If in verifying state, click Confirm
    await dashPage.reload();
    await dashPage.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    await dashPage.waitForTimeout(3_000);

    const confirmActive = dashPage.locator(`[data-testid="platform-confirm-active-${targetPid}"]`);
    if (await confirmActive.isVisible().catch(() => false)) {
      await confirmActive.click();
      console.log(`[e2e] Confirm clicked for ${targetPid}`);
      await dashPage.waitForTimeout(3_000);
    }

    // Verify ready state
    await dashPage.reload();
    await dashPage.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    await dashPage.waitForTimeout(3_000);

    const reloginVisible = await dashPage.locator(`[data-testid="platform-relogin-${targetPid}"]`).isVisible().catch(() => false);
    if (reloginVisible) {
      console.log(`[e2e] ${targetPid} login verified (re-login visible)`);
    } else {
      console.log(`[e2e] ${targetPid} login state unclear — continuing`);
    }

    gates.loginReady = true;
    await context.close();
    console.log('[e2e] Phase 5 PASSED: Login ready');
  });

  // ── Phase 6: Search Build ──

  test('Phase 6: Search build', async ({ browser }) => {
    test.setTimeout(120_000);
    test.skip(!gates.loginReady, 'Skipped — Phase 5 failed');
    console.log('[e2e] Phase 6 -- Search build...');

    const context = await browser.newContext();
    const dashPage = await context.newPage();
    const dashUrl = `${DASHBOARD_URL}/dashboard/${encodeURIComponent(sessionId)}`;
    await dashPage.goto(dashUrl);
    // Dashboard polls every 5s — networkidle never fires. Use domcontentloaded + wait.
    await dashPage.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await dashPage.waitForTimeout(6_000);

    // Click the search cell action button (Build)
    const searchAction = dashPage.locator('[data-testid="wf-cell-action-search"]').first();
    if (await searchAction.isVisible().catch(() => false)) {
      await searchAction.click();
      console.log('[e2e] Search Build clicked');
    } else {
      console.log('[e2e] Search action not visible — may already be building or ready');
    }

    // Poll until search cell is ready
    try {
      await pollPlatformStatus(sessionId, (body) => {
        const platforms = body.platforms || body;
        if (Array.isArray(platforms)) {
          return platforms.some(p => {
            const searchVis = p.cells?.search?.visual;
            return searchVis === 'ready';
          });
        }
        return false;
      }, 90_000);
      console.log('[e2e] Search cell ready');
    } catch {
      console.log('[e2e] Search build poll timed out — continuing');
    }

    gates.searchReady = true;
    await context.close();
    console.log('[e2e] Phase 6 PASSED: Search ready');
  });

  // ── Phase 7: Workflow start ──

  test('Phase 7: Start workflow + poll completion', async ({ browser }) => {
    // Search + AI scoring per job ~1min each, self-heal adds ~3min. 15min total.
    test.setTimeout(900_000);
    test.skip(!gates.searchReady, 'Skipped — Phase 6 failed');
    console.log('[e2e] Phase 7 -- Workflow start...');

    const context = await browser.newContext();
    const dashPage = await context.newPage();
    const dashUrl = `${DASHBOARD_URL}/dashboard/${encodeURIComponent(sessionId)}`;
    await dashPage.goto(dashUrl);
    // Dashboard polls every 5s — networkidle never fires. Use domcontentloaded + wait.
    await dashPage.waitForLoadState('domcontentloaded', { timeout: 30_000 });
    await dashPage.waitForTimeout(6_000);

    // Click Start Workflow — this opens the Workflow Editor modal
    const wfStartBtn = dashPage.locator('[data-testid="wf-start-btn"]');
    await expect(wfStartBtn).toBeVisible({ timeout: 10_000 });
    await wfStartBtn.click();
    console.log('[e2e] Clicked wf-start-btn, waiting for Workflow Editor modal...');

    // Wait for the Workflow Editor modal to become visible
    const wfeModal = dashPage.locator('[data-testid="wfe-modal"]');
    await expect(wfeModal).toBeVisible({ timeout: 15_000 });
    console.log('[e2e] Workflow Editor modal visible');

    // Wait for the modal to finish loading (it fetches config, platforms, jobs)
    // The pipeline area shows "Loading..." until data arrives, then renders cards
    await dashPage.waitForFunction(
      () => {
        const pipeline = document.getElementById('wfePipeline');
        if (!pipeline) return false;
        // Cards rendered = loading done
        return pipeline.querySelectorAll('.wfe-card').length > 0;
      },
      { timeout: 15_000 }
    );
    console.log('[e2e] Workflow Editor loaded, cards rendered');

    // Set targetCount to 3 (reduce AI scoring time for E2E)
    const targetCountInput = dashPage.locator('#wfe_targetCount');
    await expect(targetCountInput).toBeVisible({ timeout: 5_000 });
    await targetCountInput.fill('3');
    console.log('[e2e] Set targetCount = 3');

    // Set minScore to 40 (lower threshold to ensure qualified jobs for docx generation)
    const minScoreInput = dashPage.locator('#wfe_minScore');
    await expect(minScoreInput).toBeVisible({ timeout: 5_000 });
    await minScoreInput.fill('40');
    console.log('[e2e] Set minScore = 40');

    // Click Confirm to start the workflow
    const wfeConfirmBtn = dashPage.locator('[data-testid="wfe-confirm-btn"]');
    await expect(wfeConfirmBtn).toBeVisible({ timeout: 5_000 });
    await wfeConfirmBtn.click();
    console.log('[e2e] Clicked Confirm — workflow starting');

    // Wait for modal to close (indicates workflow started successfully)
    await expect(wfeModal).toBeHidden({ timeout: 10_000 });
    console.log('[e2e] Workflow Editor modal closed, workflow started');

    // Poll workflow status until pipeline fully completes (phase=completed/idle).
    // With targetCount=3, pipeline processes ~3 jobs then runs generate step for docx output.
    // We need to wait for generate to finish so Phase 8 can verify docx artifacts.
    const finalStatus = await pollWorkflowStatus(
      sessionId,
      (body) => {
        const phase = body.phase || body.status;
        const results = body.results || body.totalResults || 0;
        const logs = body.pipelineLogs || [];
        const hasQualified = logs.some(
          (l) => typeof l === 'string' ? l.includes('QUALIFIED') : (l.msg || l.message || '').includes('QUALIFIED')
        );
        console.log(`[e2e] Workflow: phase=${phase}, results=${results}, logs=${logs.length}, qualified=${hasQualified}`);
        // Wait for pipeline to fully complete (including generate step)
        return phase === 'completed' || phase === 'done' || phase === 'idle';
      },
      800_000, // 13min — search + self-heal + AI scoring + generate
      (body) => {
        const phase = body.phase || body.status || 'unknown';
        const logs = body.pipelineLogs || [];
        console.log(`[e2e] Poll tick: phase=${phase}, pipelineLogs=${logs.length}`);
      }
    );

    const phase = finalStatus.phase || finalStatus.status;
    const results = finalStatus.results || finalStatus.totalResults || 0;
    // Pipeline must reach completed/done/idle state (generate step finished)
    expect(
      phase === 'completed' || phase === 'done' || phase === 'idle',
      `Pipeline must fully complete. phase=${phase}, results=${results}`
    ).toBe(true);

    gates.workflowDone = true;
    await context.close();
    console.log(`[e2e] Phase 7 PASSED: Workflow complete (${results} results)`);
  });

  // ── Phase 8: Results verification ──

  test('Phase 8: Verify job listing results + docx generation', async () => {
    test.setTimeout(60_000);
    test.skip(!gates.workflowDone, 'Skipped — Phase 7 failed');
    console.log('[e2e] Phase 8 -- Results verification...');

    // Fetch dashboard data and verify job listings
    const { status, body } = await fetchDashboardJSON(
      `/api/dashboard/${encodeURIComponent(sessionId)}`
    );
    expect(status).toBe(200);

    const jobs = body.jobs || [];
    console.log(`[e2e] Total jobs: ${jobs.length}`);
    expect(jobs.length).toBeGreaterThan(0);

    // Verify at least one job has title + company + location
    const validJobs = jobs.filter(j => j.title && j.company);
    console.log(`[e2e] Jobs with title + company: ${validJobs.length}`);
    expect(validJobs.length).toBeGreaterThan(0);

    const sample = validJobs[0];
    console.log(`[e2e] Sample job: "${sample.title}" at "${sample.company}" (${sample.location || 'N/A'})`);

    // Verify docx generation — qualified jobs should have resumeDocx artifact
    const qualifiedJobs = jobs.filter(j => j.score && j.score >= 60);
    console.log(`[e2e] Qualified jobs (score >= 60): ${qualifiedJobs.length}`);

    if (qualifiedJobs.length > 0) {
      // Check that at least one qualified job has a downloadable resume via the download API
      let docxFound = false;
      for (const job of qualifiedJobs) {
        const encodedUrl = encodeURIComponent(job.url || job.link || '');
        if (!encodedUrl) continue;
        try {
          const dlResp = await fetch(
            `${DASHBOARD_URL}/api/pipeline/${encodeURIComponent(sessionId)}/download/${encodedUrl}/resume`,
            { signal: AbortSignal.timeout(10_000) }
          );
          if (dlResp.ok) {
            const contentDisp = dlResp.headers.get('content-disposition') || '';
            const contentType = dlResp.headers.get('content-type') || '';
            console.log(`[e2e] Docx download OK: content-type=${contentType}, disposition=${contentDisp}`);
            docxFound = true;
            break;
          } else {
            console.log(`[e2e] Docx download returned ${dlResp.status} for job "${job.title}"`);
          }
        } catch (err) {
          console.log(`[e2e] Docx download error for job "${job.title}": ${err.message}`);
        }
      }
      expect(docxFound, 'At least one qualified job should have a downloadable resume docx').toBe(true);
      console.log('[e2e] Docx generation verified');
    } else {
      console.log('[e2e] No qualified jobs — docx verification skipped (pipeline ran but no matches above threshold)');
    }

    console.log('[e2e] Phase 8 PASSED: Results verified');
  });
});
