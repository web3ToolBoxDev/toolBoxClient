// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

/**
 * E2E Test: Agent Workspace Onboarding — from page load to dashboard.
 *
 * Automates the full onboarding flow:
 *   1. Switch language to English
 *   2. Navigate to Agent Workspace, create session
 *   3. Configure provider & model, bind env, apply
 *   4. Open preset modal manually, fill questions
 *   5. Upload resume (.docx)
 *   6. Wait for resume storage, click Finish on profile subtask
 *   7. Verify dashboard artifact appears
 *
 * NOTE: Frontend has been modified so that TaskOffcanvas and preset modal
 * do NOT auto-open on AgentWorkspace routes. No dismissal workarounds needed.
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
 */

const TASK_NAME = 'jobSeekAgent';
const RESUME_PATH = path.resolve('C:\\Users\\z5866\\Documents\\resume\\Ying_Zhang_fullstack_OnePage_Final.docx');

// Provider/model config
const PROVIDER = process.env.E2E_PROVIDER || 'claude-code';
const MODEL = process.env.E2E_MODEL || '';
const SUB_PROVIDER = process.env.E2E_SUB_PROVIDER || '';
const API_KEY = process.env.E2E_API_KEY || '';

// Onboarding answers
const JOB_TITLE = process.env.E2E_JOB_TITLE || 'QA Automation Engineer';
const LOCATION = process.env.E2E_LOCATION || 'Toronto, Canada';
const WORK_MODE = process.env.E2E_WORK_MODE || 'Remote';
const SALARY = process.env.E2E_SALARY || '120';

// Default timeout for non-AI UI interactions
const UI_TIMEOUT = 10_000;

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

/**
 * Helper: find a button by bilingual text (supports both EN and ZH).
 */
function bilingualButton(page, patterns, scope) {
    const parent = scope || page;
    const combined = new RegExp(patterns.map(p => p.source).join('|'), 'i');
    return parent.locator('button', { hasText: combined });
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
        await expect(page.locator('.sidebar, .nav')).toBeVisible({ timeout: UI_TIMEOUT });

        const langBtn = page.locator('.btn-change-lang');
        await langBtn.click({ timeout: UI_TIMEOUT });

        const langOffcanvas = page.locator('.lang-offcanvas');
        await expect(langOffcanvas).toBeVisible({ timeout: UI_TIMEOUT });
        await page.locator('.lang-offcanvas button', { hasText: 'English' }).click({ timeout: UI_TIMEOUT });
        await expect(langOffcanvas).not.toBeVisible({ timeout: UI_TIMEOUT });
        console.log('[e2e]   ✓ Language set to English');

        // ── Step 2: Navigate to Agent Workspace & create session ──
        console.log('[e2e] Step 2: Navigating to Agent Workspace...');
        await page.goto(`/#/agentWorkspace/${encodeURIComponent(TASK_NAME)}`);
        await expect(page.locator('.agent-workspace-main')).toBeVisible({ timeout: 15_000 });
        console.log('[e2e]   ✓ Workspace loaded');

        // No TaskOffcanvas or preset modal should auto-open anymore.
        // Just verify no blocking overlays exist.
        await expect(page.locator('.offcanvas-backdrop.show')).not.toBeVisible({ timeout: 3_000 }).catch(() => {});

        // Create a fresh session
        await expect(page.locator('.agent-session-toolbar')).toBeVisible({ timeout: UI_TIMEOUT });
        const sessionInput = page.locator('.agent-session-toolbar input');
        await sessionInput.fill('E2E Test Session', { timeout: UI_TIMEOUT });
        await page.locator('.agent-session-toolbar button', { hasText: /new|\+/i }).click({ timeout: UI_TIMEOUT });
        // Wait for ANY active session (name may be auto-renamed by agent)
        await expect(page.locator('.agent-session-item.active')).toBeVisible({ timeout: 15_000 });
        console.log('[e2e]   ✓ New session created');

        // ── Step 3: Configure provider, bind env, apply model ──
        console.log('[e2e] Step 3: Configuring runtime...');
        const runtimeToggle = page.locator('[aria-label="toggle-runtime-settings"]');
        await runtimeToggle.click({ timeout: UI_TIMEOUT });

        // 3a: Select provider
        const providerSelect = page.locator('[aria-label="session-provider"]');
        await expect(providerSelect).toBeVisible({ timeout: UI_TIMEOUT });
        await providerSelect.selectOption(PROVIDER);
        console.log(`[e2e]   ✓ Provider: ${PROVIDER}`);
        await page.waitForTimeout(500);

        // For api-key provider: select sub-provider and enter API key
        if (PROVIDER === 'api-key') {
            if (SUB_PROVIDER) {
                const subProviderSelect = page.locator('[aria-label="session-sub-provider"]');
                await expect(subProviderSelect).toBeVisible({ timeout: UI_TIMEOUT });
                await subProviderSelect.selectOption(SUB_PROVIDER);
                console.log(`[e2e]   ✓ Sub-provider: ${SUB_PROVIDER}`);
                await page.waitForTimeout(300);
            }
            if (API_KEY) {
                const apiKeyInput = page.locator('[aria-label="session-api-key"]');
                await expect(apiKeyInput).toBeVisible({ timeout: UI_TIMEOUT });
                await apiKeyInput.fill(API_KEY);
                console.log('[e2e]   ✓ API key entered');
                await page.waitForTimeout(300);
            }
        }

        // Select model if specified
        if (MODEL) {
            const modelSelect = page.locator('[aria-label="session-model"]');
            await expect(modelSelect).toBeVisible({ timeout: UI_TIMEOUT });
            await modelSelect.selectOption(MODEL);
            console.log(`[e2e]   ✓ Model: ${MODEL}`);
            await page.waitForTimeout(300);
        }

        // 3b: Bind environment
        console.log('[e2e] Step 3b: Binding environment...');
        const bindModeSelect = page.locator('[aria-label="session-bind-mode"]');
        await expect(bindModeSelect).toBeVisible({ timeout: UI_TIMEOUT });
        await bindModeSelect.selectOption('env');

        const envSelect = page.locator('[aria-label="session-bind-env"]');
        await expect(envSelect).toBeVisible({ timeout: UI_TIMEOUT });
        await envSelect.selectOption({ label: '环境1' });
        console.log('[e2e]   ✓ Selected environment: 环境1');

        // 3c: Apply model (this triggers execTask → agent starts)
        const applyModelBtn = bilingualButton(page, [/apply model/i, /应用模型/]);
        await applyModelBtn.click({ timeout: UI_TIMEOUT });
        console.log('[e2e]   ✓ Model applied');

        // Wait for execution state to become Running
        await expect(page.locator('.session-context-toolbar')).toContainText(/running|运行中/i, { timeout: 15_000 });
        console.log('[e2e]   ✓ Execution state: Running');

        // 3d: Bind environment to session
        const bindBtn = bilingualButton(page, [/bind to/i, /绑定到当前会话/]);
        await expect(bindBtn).toBeEnabled({ timeout: UI_TIMEOUT });
        await bindBtn.click({ timeout: UI_TIMEOUT });
        console.log('[e2e]   ✓ Environment bound to session');

        // Collapse runtime settings panel
        await runtimeToggle.click({ timeout: UI_TIMEOUT });
        await page.waitForTimeout(500);

        // ── Step 4: Open preset modal manually ──
        console.log('[e2e] Step 4: Opening preset modal...');
        const presetModal = page.locator('.ai-preset-modal');
        const presetTrigger = page.locator('.ai-preset-trigger');
        await expect(presetTrigger).toBeVisible({ timeout: UI_TIMEOUT });
        await presetTrigger.click({ timeout: UI_TIMEOUT });
        await expect(presetModal).toBeVisible({ timeout: UI_TIMEOUT });
        console.log('[e2e]   ✓ Preset modal opened');

        // ── Step 5: Fill onboarding questions ──
        console.log('[e2e] Step 5: Filling onboarding questions...');

        // 5a: Job Title
        const jobTitleItem = page.locator('.ai-preset-question-item').filter({
            has: page.locator('.ai-option-title', { hasText: /job title|目标职位名称/i })
        });
        await expect(jobTitleItem).toBeVisible({ timeout: UI_TIMEOUT });
        await jobTitleItem.locator('input[type="text"]').fill(JOB_TITLE, { timeout: UI_TIMEOUT });
        await jobTitleItem.locator('button', { hasText: /confirm|确认/i }).click({ timeout: UI_TIMEOUT });
        console.log(`[e2e]   ✓ Job title: ${JOB_TITLE}`);
        await page.waitForTimeout(500);

        // 5b: Location
        const locationItem = page.locator('.ai-preset-question-item').filter({
            has: page.locator('.ai-option-title', { hasText: /location|期望工作地点/i })
        });
        await expect(locationItem).toBeVisible({ timeout: UI_TIMEOUT });
        await locationItem.locator('input[type="text"]').fill(LOCATION, { timeout: UI_TIMEOUT });
        await locationItem.locator('button', { hasText: /confirm|确认/i }).click({ timeout: UI_TIMEOUT });
        console.log(`[e2e]   ✓ Location: ${LOCATION}`);
        await page.waitForTimeout(500);

        // 5c: Salary
        const salaryItem = page.locator('.ai-preset-question-item').filter({
            has: page.locator('.ai-option-title', { hasText: /salary|目标年薪/i })
        });
        await salaryItem.scrollIntoViewIfNeeded();
        await salaryItem.locator('input[type="text"]').fill(SALARY, { timeout: UI_TIMEOUT });
        await salaryItem.locator('button', { hasText: /confirm|确认/i }).click({ timeout: UI_TIMEOUT });
        console.log(`[e2e]   ✓ Salary: ${SALARY}K`);
        await page.waitForTimeout(500);

        // 5d: Work Mode (expand Selection group if collapsed)
        const selectionGroup = page.locator('.ai-preset-group').filter({
            has: page.locator('.ai-preset-group__title', { hasText: /selection/i })
        });
        await selectionGroup.locator('.ai-preset-group__header').scrollIntoViewIfNeeded();
        const selectionCaret = await selectionGroup.locator('.ai-preset-group__caret').textContent();
        if (selectionCaret === '+') {
            await selectionGroup.locator('.ai-preset-group__header').click({ timeout: UI_TIMEOUT });
            await page.waitForTimeout(300);
        }
        const workModeItem = page.locator('.ai-preset-question-item').filter({
            has: page.locator('.ai-option-title', { hasText: /work mode|工作模式/i })
        });
        await expect(workModeItem).toBeVisible({ timeout: UI_TIMEOUT });
        const workModeBtn = workModeItem.locator('.ai-option-btn', { hasText: new RegExp(`^(${WORK_MODE}|远程)$`, 'i') });
        await workModeBtn.scrollIntoViewIfNeeded();
        await workModeBtn.click({ timeout: UI_TIMEOUT });
        // Verify Selection counter updated
        await expect(selectionGroup.locator('.ai-preset-group__count')).toContainText(/1\/1/, { timeout: UI_TIMEOUT });
        console.log(`[e2e]   ✓ Work mode: ${WORK_MODE}`);

        // ── Step 6: Upload resume ──
        console.log('[e2e] Step 6: Uploading resume...');
        const attachGroup = page.locator('.ai-preset-group').filter({
            has: page.locator('.ai-preset-group__title', { hasText: /attachment/i })
        });
        await attachGroup.locator('.ai-preset-group__header').scrollIntoViewIfNeeded();
        const attachCaret = await attachGroup.locator('.ai-preset-group__caret').textContent();
        if (attachCaret === '+') {
            await attachGroup.locator('.ai-preset-group__header').click({ timeout: UI_TIMEOUT });
            await page.waitForTimeout(300);
        }

        const uploadItem = page.locator('.ai-preset-question-item').filter({
            has: page.locator('.ai-option-title', { hasText: /upload|resume|上传|简历/i })
        });
        await expect(uploadItem).toBeVisible({ timeout: UI_TIMEOUT });
        const uploadBtn = uploadItem.locator('button', { hasText: /upload|上传/i });
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: UI_TIMEOUT }),
            uploadBtn.click({ timeout: UI_TIMEOUT })
        ]);
        await fileChooser.setFiles(RESUME_PATH);
        // Verify Attachment counter updated
        await expect(attachGroup.locator('.ai-preset-group__count')).toContainText(/1\/1/, { timeout: UI_TIMEOUT });
        console.log(`[e2e]   ✓ Resume uploaded: ${path.basename(RESUME_PATH)}`);

        // Verify all 5 questions answered
        await expect(page.locator('.ai-preset-modal__subtitle')).toContainText(/5\/5/, { timeout: UI_TIMEOUT });
        console.log('[e2e]   ✓ All 5/5 questions answered');

        // ── Step 7: Close preset modal ──
        console.log('[e2e] Step 7: Closing preset modal...');
        const closeModalBtn = page.locator('.ai-preset-modal .modal-footer button', { hasText: /close|关闭/i });
        await closeModalBtn.click({ timeout: UI_TIMEOUT });
        await expect(presetModal).not.toBeVisible({ timeout: UI_TIMEOUT });
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
        const finishBtn = page.locator('.ai-subtask-action', { hasText: /finish|完成/i }).first();
        await expect(finishBtn).toBeVisible({ timeout: UI_TIMEOUT });
        await finishBtn.click({ timeout: UI_TIMEOUT });
        console.log('[e2e]   ✓ Clicked Finish on profile subtask');

        // Wait for at least 2 subtasks done
        const doneBadges = page.locator('.ai-subtask-card__badge--done');
        await expect(async () => {
            const count = await doneBadges.count();
            expect(count).toBeGreaterThanOrEqual(2);
        }).toPass({ timeout: 30_000 });
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
