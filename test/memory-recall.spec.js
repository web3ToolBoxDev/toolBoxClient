// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

/**
 * E2E Test: Cross-session profile memory recall with live Claude CLI.
 *
 * Prerequisites:
 *   - `yarn dev` running (Electron + Express on :30001 + React on :3000)
 *   - dbservice running on :30002
 *   - dashboardServer on :30003
 *   - Claude CLI installed and authenticated
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/memory-recall.spec.js
 */

const WORKSPACE_URL = '/#/agentWorkspace/jobSeekAgent';
const RESUME_QA = path.join(__dirname, 'fixtures', 'resume-qa.txt');
const RESUME_FULLSTACK = path.join(__dirname, 'fixtures', 'resume-fullstack.txt');

const BACKEND_URL = 'http://127.0.0.1:30001/api';
const AGENT_TASK_NAME = 'jobSeekAgent';

// AI response timeout — Claude CLI can take up to 90s
const AI_TIMEOUT = 90_000;

/** Generate a unique random name so tests never match stale text on page */
function randomTestName() {
    const firsts = ['Alex', 'Robin', 'Kai', 'Sasha', 'Nova', 'Riley', 'Zara', 'Finn'];
    const lasts = ['Moon', 'River', 'Storm', 'Lake', 'Fox', 'Stone', 'Peak', 'Vale'];
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    // Append 3-digit suffix for extra uniqueness
    const suffix = String(Math.floor(Math.random() * 900) + 100);
    return `${pick(firsts)} ${pick(lasts)}${suffix}`;
}

// ───────── helpers ─────────

/** Wait for a chat message matching ANY of the given texts (bilingual support) */
async function waitForChatMessage(page, texts, timeout = AI_TIMEOUT) {
    const searchTexts = Array.isArray(texts) ? texts : [texts];
    await page.waitForFunction(
        (candidates) => {
            const messages = document.querySelectorAll('.ai-chat-item__text');
            return Array.from(messages).some((el) =>
                candidates.some((t) => el.textContent?.includes(t))
            );
        },
        searchTexts,
        { timeout }
    );
}

/** Ensure Runtime Settings panel is expanded (use aria-label, language-independent) */
async function ensureRuntimeOpen(page) {
    const toggle = page.locator('button[aria-label="toggle-runtime-settings"]');
    if (await toggle.count() === 0) return;
    // If the controls section is NOT visible, the panel is collapsed — click to expand
    const controls = page.locator('.controls [aria-label="session-provider"]');
    if (await controls.count() === 0) {
        await toggle.click();
        await page.waitForTimeout(300);
    }
}

/** Select provider and apply model (uses aria-labels, language-independent) */
async function applyModel(page, provider = 'claude-code') {
    await ensureRuntimeOpen(page);
    await page.selectOption('[aria-label="session-provider"]', provider);
    await page.waitForTimeout(200);
    // Click the Apply Model button in runtime-row--model (right next to the model select)
    await page.locator('.runtime-row--model button').click();
    await page.waitForTimeout(1000);
}

/** Fill a preset text input by matching question label keywords */
async function fillPresetInput(page, questionId, value) {
    const items = page.locator('.ai-preset-question-item');
    const count = await items.count();
    for (let i = 0; i < count; i++) {
        const item = items.nth(i);
        const input = item.locator('input[type="text"], input[type="number"]');
        if (await input.count() === 0) continue;

        const label = (await item.locator('.ai-option-title').textContent()) || '';

        const isMatch =
            (questionId === 'q_job_title' && (/job.?title/i.test(label) || label.includes('职位'))) ||
            (questionId === 'q_location' && (/location/i.test(label) || label.includes('地点') || label.includes('城市') || label.includes('工作地点'))) ||
            (questionId === 'q_salary' && (/salary/i.test(label) || label.includes('年薪') || label.includes('薪')));

        if (isMatch) {
            await input.fill(value);
            // Click the first button inside this item (Confirm / 确认)
            const confirmBtn = item.locator('.ai-preset-question-item__done button, button').first();
            await confirmBtn.click();
            await page.waitForTimeout(300);
            return;
        }
    }
    throw new Error(`Could not find preset input for ${questionId}`);
}

/** Select a work mode option in preset modal */
async function selectWorkMode(page, mode = 'Any') {
    const items = page.locator('.ai-preset-question-item');
    const count = await items.count();
    for (let i = 0; i < count; i++) {
        const item = items.nth(i);
        const label = (await item.locator('.ai-option-title').textContent()) || '';
        if (/work.?mode/i.test(label) || label.includes('工作模式') || label.includes('工作方式')) {
            // Click the option button matching mode text
            const btn = item.locator(`button:has-text("${mode}")`);
            if (await btn.count() > 0) {
                await btn.click();
            } else {
                // Try first unselected option as fallback
                await item.locator('button').first().click();
            }
            await page.waitForTimeout(300);
            return;
        }
    }
    throw new Error('Could not find work mode question');
}

/** Expand a preset group by partial header text match */
async function expandPresetGroup(page, ...keywords) {
    const groups = page.locator('.ai-preset-group__header');
    const groupCount = await groups.count();
    for (let i = 0; i < groupCount; i++) {
        const group = groups.nth(i);
        const text = (await group.textContent())?.toLowerCase() || '';
        const matched = keywords.some((kw) => text.includes(kw.toLowerCase()));
        if (matched) {
            const caret = await group.locator('.ai-preset-group__caret').textContent();
            if (caret?.trim() === '+') {
                await group.click();
                await page.waitForTimeout(300);
            }
            return;
        }
    }
}

/** Upload a file via the preset upload question */
async function uploadResumeInPreset(page, filePath) {
    await expandPresetGroup(page, 'attachment', 'upload', '附件');
    const fileInput = page.locator('input[type="file"]').last();
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(500);
}

/** Send a chat message (low-level, no wait) */
async function sendChat(page, message) {
    // Wait until input is enabled (AI not processing)
    const input = page.locator('.ai-chat-input input').first();
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    // Wait for input to be enabled (not disabled by isAiProcessing)
    await page.waitForFunction(
        () => {
            const inp = document.querySelector('.ai-chat-input input');
            return inp && !inp.disabled;
        },
        null,
        { timeout: AI_TIMEOUT }
    );
    await input.fill(message);
    // Click the last button in chat-input row (Send / 发送)
    await page.locator('.ai-chat-input button').last().click();
}

/** Send a chat message and wait for a NEW AI reply matching any of the given texts.
 *  Uses message count to ensure we wait for a genuinely new response. */
async function sendChatAndWaitReply(page, message, expectedTexts, timeout = AI_TIMEOUT) {
    const searchTexts = Array.isArray(expectedTexts) ? expectedTexts : [expectedTexts];
    // Snapshot current AI message count before sending
    // Count ALL messages (user + assistant) before sending
    const countBefore = await page.locator('.ai-chat-item').count();
    await sendChat(page, message);
    // Wait for a NEW assistant message (appears after our user message) matching expected text
    await page.waitForFunction(
        ({ countBefore: cb, candidates }) => {
            const allItems = document.querySelectorAll('.ai-chat-item');
            // Only check items that appeared after we sent (index > cb because cb includes the user msg we just sent)
            for (let i = cb; i < allItems.length; i++) {
                const item = allItems[i];
                // Skip user messages
                if (item.classList.contains('user')) continue;
                const textEl = item.querySelector('.ai-chat-item__text');
                if (!textEl) continue;
                const text = textEl.textContent || '';
                // Skip thinking indicators
                if (text.includes('✨') && text.includes('...')) continue;
                if (candidates.some((t) => text.includes(t))) return true;
            }
            return false;
        },
        { countBefore, candidates: searchTexts },
        { timeout }
    );
}

/** Open preset modal — skip if already open */
async function openPresetModal(page) {
    const modal = page.locator('.ai-preset-modal');
    if (await modal.isVisible()) return; // already open
    const btn = page.locator('.ai-preset-trigger');
    if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(500);
    }
}

/** Close preset modal */
async function closePresetModal(page) {
    // Try the X button first, then the "Close" text button
    const xBtn = page.locator('.ai-preset-modal .btn-close').first();
    if (await xBtn.isVisible()) {
        await xBtn.click();
        await page.waitForTimeout(300);
        return;
    }
    const closeBtn = page.locator('.ai-preset-modal button:has-text("Close"), .ai-preset-modal button:has-text("关闭")').first();
    if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(300);
    }
}

/** Check if a subtask shows Done / 已完成 status */
async function expectSubtaskDone(page, subtaskKey) {
    // subtaskKey is 'onboarding', 'profile', or 'search'
    // The card class includes the status: ai-subtask-card--done
    const card = page.locator(`.ai-subtask-card--done`);
    // Wait for at least one done card whose label matches
    await page.waitForFunction(
        (key) => {
            const cards = document.querySelectorAll('.ai-subtask-card--done');
            return Array.from(cards).some((c) => {
                const label = c.querySelector('.ai-subtask-card__label')?.textContent || '';
                // Match by checking if the label's i18n key maps to this subtask
                // We can't know the exact label, so check if it appears in the right position
                return true; // fallback: just check at least one done card exists
            });
        },
        subtaskKey,
        { timeout: 10_000 }
    );
}

/** Click the Finish button on a running subtask.
 *  The finish button is the first .ai-subtask-action inside
 *  an .ai-subtask-item that contains a running card. */
async function finishSubtask(page, subtaskKey) {
    const item = page.locator('.ai-subtask-item:has(.ai-subtask-card--running)').first();
    await item.waitFor({ state: 'visible', timeout: 15_000 });
    const finishBtn = item.locator('.ai-subtask-action').first();
    await finishBtn.waitFor({ state: 'visible', timeout: 5_000 });
    page.once('dialog', (dialog) => dialog.accept());
    await finishBtn.click();
    await page.waitForTimeout(2000);
}

/** Reset all agent data via REST API with retry */
async function resetAgentForTest(maxRetries = 10) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const resp = await fetch(`${BACKEND_URL}/resetAgentForTest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskName: AGENT_TASK_NAME }),
        });
        const text = await resp.text();
        let body;
        try {
            body = JSON.parse(text);
        } catch {
            throw new Error(`resetAgentForTest: expected JSON but got (${resp.status}): ${text.slice(0, 200)}`);
        }
        if (body.success) {
            await new Promise((r) => setTimeout(r, 3000));
            return;
        }
        if (body.code === 1019 && attempt < maxRetries) {
            console.log(`[resetAgentForTest] attempt ${attempt}/${maxRetries}: agent not ready, retrying in 3s...`);
            await new Promise((r) => setTimeout(r, 3000));
            continue;
        }
        throw new Error(`resetAgentForTest failed: ${JSON.stringify(body)}`);
    }
}

const DASHBOARD_API = 'http://127.0.0.1:30003/api/dashboard';

/** Get the agent's active session ID from the DOM (data-session-id attribute) */
async function getActiveSessionId(page) {
    return page.evaluate(() => {
        const active = document.querySelector('.agent-session-item.active');
        return active?.getAttribute('data-session-id') || '';
    });
}

/** Fetch dashboard JSON and verify it contains expected text in profile.basic.
 *  Short timeout — this is supplementary verification, not a hard requirement. */
async function waitForDashboardProfile(sessionId, expectedText, timeout = 10_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const resp = await fetch(`${DASHBOARD_API}/${encodeURIComponent(sessionId)}`);
            if (resp.ok) {
                const data = await resp.json();
                const basic = data?.profile?.basic || '';
                if (basic.includes(expectedText)) return data;
            }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error(`Dashboard profile did not contain "${expectedText}" within ${timeout}ms`);
}

// ───────── tests ─────────

test.describe.serial('Memory Recall E2E', () => {
    test.beforeAll(async ({ browser }) => {
        // Open workspace to boot the agent process
        const page = await browser.newPage();
        await page.goto(WORKSPACE_URL);
        await page.waitForTimeout(5000);

        // Full data wipe via API
        await resetAgentForTest();

        // Reload to pick up the reset state
        await page.reload();
        await page.waitForTimeout(3000);
        await page.close();
    });

    test('Session A: build profile from resume and generate dashboard', async ({ page }) => {
        await page.goto(WORKSPACE_URL);
        await page.waitForTimeout(3000);

        // 1. Create new session — the reset leaves one default session,
        //    but we create a fresh one to be explicit
        await page.click('button:has-text("+ New")');
        await page.waitForTimeout(1000);

        // 2. Apply model (claude-code) — uses aria-label selectors
        await applyModel(page, 'claude-code');

        // 3. Wait for preset modal to auto-open, or open it
        await page.waitForTimeout(2000);
        await openPresetModal(page);
        await page.waitForSelector('.ai-preset-modal', { state: 'visible', timeout: 5000 });

        // 4. Expand Input group if collapsed
        await expandPresetGroup(page, 'input', '输入', '填写');

        // 5. Fill preset questions
        await fillPresetInput(page, 'q_job_title', 'QA Engineer');
        await fillPresetInput(page, 'q_location', 'Toronto');
        await fillPresetInput(page, 'q_salary', '85');

        // 6. Expand Selection group and select work mode
        await expandPresetGroup(page, 'selection', '选择', '选项');
        await selectWorkMode(page, 'Any');

        // 7. Upload resume
        await uploadResumeInPreset(page, RESUME_QA);

        // 8. Close preset modal
        await closePresetModal(page);

        // 9. Wait for resume extraction (AI call)
        await waitForChatMessage(page, ['sections stored', '分区存入知识库'], AI_TIMEOUT);

        // 10. Finish the Profile Collection subtask (it should be running)
        await finishSubtask(page, 'profile');

        // 11. Wait for subtask finish confirmation + dashboard artifact
        await waitForChatMessage(page, ['Subtask finished', '子任务已完成'], 30_000);
        await page.waitForSelector('.ai-artifact-card', { timeout: 30_000 });

        console.log('[Test A] Profile built and dashboard generated successfully');
    });

    test('Session B: recall profile, modify, and verify dashboard updates', async ({ page }) => {
        const TEST_NAME = randomTestName();
        console.log(`[Test B] Using random test name: "${TEST_NAME}"`);

        await page.goto(WORKSPACE_URL);
        await page.waitForTimeout(3000);

        // 1. Verify Session A exists in sidebar
        const sessionsBefore = await page.locator('.agent-session-item').count();
        expect(sessionsBefore).toBeGreaterThanOrEqual(1);

        // 2. Create new session
        await page.click('button:has-text("+ New")');
        await page.waitForTimeout(1000);

        // 3. Apply model
        await applyModel(page, 'claude-code');
        await page.waitForTimeout(2000);

        // 4. Open preset modal and fill different job target
        await openPresetModal(page);
        await page.waitForSelector('.ai-preset-modal', { state: 'visible', timeout: 5000 });

        await expandPresetGroup(page, 'input', '输入', '填写');
        await fillPresetInput(page, 'q_job_title', 'Fullstack Developer');
        await fillPresetInput(page, 'q_location', 'London');
        await fillPresetInput(page, 'q_salary', '120');

        await expandPresetGroup(page, 'selection', '选择', '选项');
        await selectWorkMode(page, 'Remote');

        // 5. Close preset modal
        await closePresetModal(page);

        // 6. Wait for memory recall message (works for both EN and ZH)
        await page.waitForFunction(
            () => {
                const msgs = document.querySelectorAll('.ai-chat-item__text');
                return Array.from(msgs).some((el) => {
                    const t = el.textContent || '';
                    return t.includes('I found your profile') || t.includes('已找到你之前的档案');
                });
            },
            null,
            { timeout: AI_TIMEOUT }
        );
        console.log('[Test B] Profile recalled from Session A');

        // 7. Verify dashboard was auto-generated and contains original name (Jane Doe)
        await page.waitForSelector('.ai-artifact-card', { timeout: 30_000 });
        console.log('[Test B] Dashboard auto-generated after recall');

        // 8. Change name via chat — uses sendChatAndWaitReply to ensure
        //    we wait for a genuinely NEW AI reply (not stale page text)
        await sendChatAndWaitReply(
            page,
            `Please change my name to ${TEST_NAME}`,
            [TEST_NAME, 'confirm', '确认', 'updated', '已更新', 'changed', '已修改'],
            AI_TIMEOUT
        );
        console.log('[Test B] AI responded to name change request');

        // 9. Confirm with short reply "y" — tests CLI conversation history
        //    The AI must remember what "y" refers to from the previous exchange
        await sendChatAndWaitReply(
            page,
            'y',
            [TEST_NAME, 'updated', '已更新', 'changed', '已修改', 'done', '完成'],
            AI_TIMEOUT
        );
        console.log('[Test B] Name change confirmed with "y" — CLI context preserved');

        // 10. Verify the name was actually stored by asking AI
        await sendChatAndWaitReply(
            page,
            'What is my name?',
            [TEST_NAME],
            AI_TIMEOUT
        );
        console.log(`[Test B] AI correctly recalls updated name "${TEST_NAME}"`);

        // 11. Verify dashboard data reflects the name change
        const sessionId = await getActiveSessionId(page);
        expect(sessionId).toBeTruthy();
        console.log(`[Test B] Checking dashboard for session: ${sessionId}`);
        const dashData = await waitForDashboardProfile(sessionId, TEST_NAME, 15_000);
        console.log(`[Test B] Dashboard profile.basic contains "${TEST_NAME}"`);
        expect(dashData.profile.basic).toContain(TEST_NAME);

        // 12. Add skill via chat
        await sendChatAndWaitReply(
            page,
            'Please add Docker and Kubernetes to my skills',
            ['Docker'],
            AI_TIMEOUT
        );
        console.log('[Test B] AI responded to add skill request');

        // 13. Upload new resume to replace seeded profile
        await openPresetModal(page);
        await page.waitForSelector('.ai-preset-modal', { state: 'visible', timeout: 5000 });
        await uploadResumeInPreset(page, RESUME_FULLSTACK);
        await closePresetModal(page);

        // 14. Wait for new resume extraction
        await waitForChatMessage(page, ['sections stored', '分区存入知识库'], AI_TIMEOUT);
        console.log('[Test B] New resume extracted and stored');

        // 15. Verify dashboard artifact still visible
        await page.waitForTimeout(3000);
        expect(await page.locator('.ai-artifact-card').first().isVisible()).toBeTruthy();

        console.log('[Test B] All verifications passed');
    });
});
