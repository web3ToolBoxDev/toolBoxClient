// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

/**
 * E2E Test: Agent Workspace Onboarding — from page load to dashboard.
 *
 * Automates the full onboarding flow:
 *   1. Switch language to English
 *   2. Navigate to Agent Workspace, create session
 *   3. Configure provider & model, apply
 *   4. Fill preset questions (job title, location, work mode, salary)
 *   5. Upload resume (.docx)
 *   6. Wait for resume storage, click Finish on profile subtask
 *   7. Verify dashboard artifact appears
 *
 * Prerequisites:
 *   - React dev server running on http://localhost:3000 (npm start)
 *   - Express backend running on http://localhost:30001 (npm run dev)
 *
 * Environment variables:
 *   E2E_PROVIDER      - 'claude-code' (default) | 'codex-cli' | 'api-key'
 *   E2E_MODEL         - model name (e.g. 'gpt-4o-mini'), empty = use default
 *   E2E_SUB_PROVIDER  - 'openai' | 'anthropic' | 'google' (only for api-key)
 *   E2E_API_KEY       - API key string (only for api-key)
 *   E2E_JOB_TITLE     - override job title (default: 'QA Automation Engineer')
 *   E2E_LOCATION      - override location (default: 'Toronto, Canada')
 *   E2E_WORK_MODE     - override work mode (default: 'Remote')
 *   E2E_SALARY        - override salary (default: '120')
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/onboarding-e2e.spec.js --headed
 *
 * Examples:
 *   # Default (Claude Code)
 *   npx playwright test -c test/playwright.config.js test/onboarding-e2e.spec.js --headed
 *
 *   # Codex CLI
 *   E2E_PROVIDER=codex-cli npx playwright test -c test/playwright.config.js test/onboarding-e2e.spec.js --headed
 *
 *   # API Key with OpenAI
 *   E2E_PROVIDER=api-key E2E_SUB_PROVIDER=openai E2E_API_KEY=sk-... E2E_MODEL=gpt-4o-mini npx playwright test -c test/playwright.config.js test/onboarding-e2e.spec.js --headed
 */

const TASK_NAME = 'jobSeekAgent';
const RESUME_PATH = path.resolve('C:\\Users\\z5866\\Documents\\resume\\Ying_Zhang_fullstack_OnePage_Final.docx');

// Provider/model config — override via env: E2E_PROVIDER=codex-cli npx playwright test ...
const PROVIDER = process.env.E2E_PROVIDER || 'claude-code'; // 'codex-cli' | 'claude-code' | 'api-key'
const MODEL = process.env.E2E_MODEL || ''; // e.g. 'gpt-4o-mini', '' = use default
const SUB_PROVIDER = process.env.E2E_SUB_PROVIDER || ''; // 'openai' | 'anthropic' | 'google' (only for api-key)
const API_KEY = process.env.E2E_API_KEY || ''; // only for api-key provider

// Onboarding answers
const JOB_TITLE = process.env.E2E_JOB_TITLE || 'QA Automation Engineer';
const LOCATION = process.env.E2E_LOCATION || 'Toronto, Canada';
const WORK_MODE = process.env.E2E_WORK_MODE || 'Remote';
const SALARY = process.env.E2E_SALARY || '120';

async function isBackendReady() {
    try {
        const resp = await fetch('http://localhost:30001/api/getAllTasks?default=true', {
            signal: AbortSignal.timeout(3000)
        });
        return resp.status === 200;
    } catch {
        return false;
    }
}

test.describe('Agent Workspace Onboarding E2E', () => {
    test.setTimeout(240_000); // 4 minutes

    test.beforeAll(async () => {
        const ready = await isBackendReady();
        test.skip(!ready, 'Backend server not running on port 30001');
    });

    test('complete onboarding flow from page load to dashboard', async ({ page }) => {

        // ── Step 1: Switch language to English ──
        console.log('[e2e] Step 1: Switching to English...');
        await page.goto('/');
        await expect(page.locator('.sidebar, .nav')).toBeVisible({ timeout: 10_000 });

        // Click the Languages button in sidebar
        const langBtn = page.locator('.btn-change-lang');
        await langBtn.click();

        // Wait for language offcanvas and click English
        const langOffcanvas = page.locator('.lang-offcanvas');
        await expect(langOffcanvas).toBeVisible({ timeout: 5_000 });
        await page.locator('.lang-offcanvas button', { hasText: 'English' }).click();
        await expect(langOffcanvas).not.toBeVisible({ timeout: 3_000 });
        console.log('[e2e]   ✓ Language set to English');

        // ── Step 2: Navigate to Agent Workspace & create session ──
        console.log('[e2e] Step 2: Navigating to Agent Workspace...');
        await page.goto(`/#/agentWorkspace/${encodeURIComponent(TASK_NAME)}`);
        await expect(page.locator('.agent-workspace-main')).toBeVisible({ timeout: 15_000 });
        console.log('[e2e]   ✓ Workspace loaded');

        // Wait for session panel and create a fresh session
        await expect(page.locator('.agent-session-toolbar')).toBeVisible({ timeout: 20_000 });
        const sessionInput = page.locator('.agent-session-toolbar input');
        await sessionInput.fill('E2E Test Session');
        await page.locator('.agent-session-toolbar button', { hasText: /new|\+/i }).click();
        await expect(page.locator('.agent-session-item.active', { hasText: /E2E Test Session/i })).toBeVisible({ timeout: 15_000 });
        console.log('[e2e]   ✓ New session created');

        // ── Step 3: Configure provider & model ──
        console.log('[e2e] Step 3: Configuring provider and model...');
        const runtimeToggle = page.locator('[aria-label="toggle-runtime-settings"]');
        await runtimeToggle.click();

        const providerSelect = page.locator('[aria-label="session-provider"]');
        await expect(providerSelect).toBeVisible({ timeout: 5_000 });
        await providerSelect.selectOption(PROVIDER);
        console.log(`[e2e]   ✓ Provider: ${PROVIDER}`);

        await page.waitForTimeout(500);

        // For api-key provider: select sub-provider and enter API key
        if (PROVIDER === 'api-key') {
            if (SUB_PROVIDER) {
                const subProviderSelect = page.locator('[aria-label="session-sub-provider"]');
                await expect(subProviderSelect).toBeVisible({ timeout: 5_000 });
                await subProviderSelect.selectOption(SUB_PROVIDER);
                console.log(`[e2e]   ✓ Sub-provider: ${SUB_PROVIDER}`);
                await page.waitForTimeout(300);
            }
            if (API_KEY) {
                const apiKeyInput = page.locator('[aria-label="session-api-key"]');
                await expect(apiKeyInput).toBeVisible({ timeout: 5_000 });
                await apiKeyInput.fill(API_KEY);
                console.log('[e2e]   ✓ API key entered');
                await page.waitForTimeout(300);
            }
        }

        // Select model if specified
        if (MODEL) {
            const modelSelect = page.locator('[aria-label="session-model"]');
            await expect(modelSelect).toBeVisible({ timeout: 5_000 });
            await modelSelect.selectOption(MODEL);
            console.log(`[e2e]   ✓ Model: ${MODEL}`);
            await page.waitForTimeout(300);
        }

        // Click Apply Model
        await page.locator('button', { hasText: /apply model/i }).click();
        console.log('[e2e]   ✓ Model applied');

        // Wait for execution state to become Running
        await expect(page.locator('.session-context-toolbar')).toContainText(/running/i, { timeout: 15_000 });
        console.log('[e2e]   ✓ Execution state: Running');

        // ── Step 3b: Bind environment ──
        console.log('[e2e] Step 3b: Binding environment...');
        const bindModeSelect = page.locator('[aria-label="session-bind-mode"]');
        await expect(bindModeSelect).toBeVisible({ timeout: 5_000 });
        await bindModeSelect.selectOption('env');

        const envSelect = page.locator('[aria-label="session-bind-env"]');
        await expect(envSelect).toBeVisible({ timeout: 5_000 });
        await envSelect.selectOption({ label: '环境1' });
        console.log('[e2e]   ✓ Selected environment: 环境1');

        const bindBtn = page.locator('button', { hasText: /bind to/i });
        await expect(bindBtn).toBeEnabled({ timeout: 5_000 });
        await bindBtn.click();
        console.log('[e2e]   ✓ Environment bound to session');
        await page.waitForTimeout(1000);

        // ── Step 4: Open preset modal ──
        console.log('[e2e] Step 4: Opening preset modal...');
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
        console.log('[e2e]   ✓ Preset modal opened');

        // ── Step 5: Fill onboarding questions ──
        console.log('[e2e] Step 5: Filling onboarding questions...');

        // 5a: Job Title
        const jobTitleItem = page.locator('.ai-preset-question-item').filter({
            has: page.locator('.ai-option-title', { hasText: /job title/i })
        });
        await expect(jobTitleItem).toBeVisible({ timeout: 5_000 });
        await jobTitleItem.locator('input[type="text"]').fill(JOB_TITLE);
        await jobTitleItem.locator('button', { hasText: /confirm/i }).click();
        console.log(`[e2e]   ✓ Job title: ${JOB_TITLE}`);
        await page.waitForTimeout(1000);

        // 5b: Location
        const locationItem = page.locator('.ai-preset-question-item').filter({
            has: page.locator('.ai-option-title', { hasText: /location/i })
        });
        await expect(locationItem).toBeVisible({ timeout: 5_000 });
        await locationItem.locator('input[type="text"]').fill(LOCATION);
        await locationItem.locator('button', { hasText: /confirm/i }).click();
        console.log(`[e2e]   ✓ Location: ${LOCATION}`);
        await page.waitForTimeout(1000);

        // 5c: Salary (same Input group)
        const salaryItem = page.locator('.ai-preset-question-item').filter({
            has: page.locator('.ai-option-title', { hasText: /salary/i })
        });
        await salaryItem.scrollIntoViewIfNeeded();
        await salaryItem.locator('input[type="text"]').fill(SALARY);
        await salaryItem.locator('button', { hasText: /confirm/i }).click();
        console.log(`[e2e]   ✓ Salary: ${SALARY}K`);
        await page.waitForTimeout(1000);

        // 5d: Work Mode (Selection group — expand if collapsed)
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
        await workModeItem.locator('.ai-option-btn', { hasText: new RegExp(`^${WORK_MODE}$`, 'i') }).click();
        console.log(`[e2e]   ✓ Work mode: ${WORK_MODE}`);
        await page.waitForTimeout(1000);

        // ── Step 6: Upload resume ──
        console.log('[e2e] Step 6: Uploading resume...');
        const attachGroup = page.locator('.ai-preset-group').filter({
            has: page.locator('.ai-preset-group__title', { hasText: /attachment/i })
        });
        await attachGroup.locator('.ai-preset-group__header').scrollIntoViewIfNeeded();
        if (await attachGroup.locator('.ai-preset-group__caret').textContent() === '+') {
            await attachGroup.locator('.ai-preset-group__header').click();
        }

        const uploadItem = page.locator('.ai-preset-question-item').filter({
            has: page.locator('.ai-option-title', { hasText: /upload|resume/i })
        });
        await expect(uploadItem).toBeVisible({ timeout: 5_000 });
        const uploadBtn = uploadItem.locator('button', { hasText: /upload/i });
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            uploadBtn.click()
        ]);
        await fileChooser.setFiles(RESUME_PATH);
        console.log(`[e2e]   ✓ Resume uploaded: ${path.basename(RESUME_PATH)}`);

        // Verify all 5 questions answered
        await expect(page.locator('.ai-preset-modal__subtitle')).toContainText(/5\/5/, { timeout: 10_000 });
        console.log('[e2e]   ✓ All 5/5 questions answered');

        // ── Step 7: Close preset modal ──
        console.log('[e2e] Step 7: Closing preset modal...');
        await page.locator('.ai-preset-modal .modal-footer button', { hasText: /close/i }).click();
        await expect(presetModal).not.toBeVisible({ timeout: 5_000 });
        console.log('[e2e]   ✓ Preset modal closed');

        // ── Step 8: Wait for resume processing ──
        console.log('[e2e] Step 8: Waiting for resume to be processed...');

        // Wait for direction subtask to complete
        await expect(page.locator('.ai-subtask-card__badge--done').first()).toBeVisible({ timeout: 30_000 });
        console.log('[e2e]   ✓ Direction subtask completed');

        // Wait for resume storage confirmation in chat
        const chatContent = page.locator('.ai-chat-content');
        await expect(chatContent).toContainText(/resume sections stored|简历分区存入知识库|knowledge base/i, { timeout: 120_000 });
        console.log('[e2e]   ✓ Resume stored in knowledge base');

        // ── Step 9: Click Finish on profile subtask ──
        console.log('[e2e] Step 9: Finishing profile subtask...');

        // Find the profile subtask's Finish button (outline-success variant when status=running)
        const finishBtn = page.locator('.ai-subtask-action', { hasText: /finish/i }).first();
        await expect(finishBtn).toBeVisible({ timeout: 10_000 });
        await finishBtn.click();
        console.log('[e2e]   ✓ Clicked Finish on profile subtask');

        // Wait for profile subtask to transition to done
        const doneBadges = page.locator('.ai-subtask-card__badge--done');
        await expect(doneBadges).toHaveCount(2, { timeout: 30_000 });
        console.log('[e2e]   ✓ Profile subtask completed');

        // ── Step 10: Verify dashboard artifact appears ──
        console.log('[e2e] Step 10: Waiting for dashboard artifact...');
        const artifactCard = page.locator('.ai-artifact-card--button').filter({
            hasText: /dashboard/i
        });
        await expect(artifactCard).toBeVisible({ timeout: 60_000 });
        console.log('[e2e]   ✓ Dashboard artifact available');

        console.log('[e2e] ✅ Onboarding E2E complete — dashboard ready');
    });
});
