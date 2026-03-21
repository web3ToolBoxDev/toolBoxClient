// @ts-check
/**
 * E2E Test Helpers — shared utilities for main-flow and rebuild-flow specs.
 *
 * All helpers are stateless functions.  No hardcoded user paths.
 */

const { expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// ─── Constants ───

const BACKEND_URL = process.env.E2E_BACKEND_URL || 'http://localhost:30001';
const DASHBOARD_URL = process.env.E2E_DASHBOARD_URL || 'http://localhost:30003';
const POLL_INTERVAL = 5_000;

// ─── Health / readiness checks ───

/**
 * Poll a URL until it returns HTTP 200 (or times out).
 * Works for both backend health and dashboard readiness.
 *
 * @param {string} url        — full URL to probe
 * @param {number} [timeout]  — ms before giving up (default 30 s)
 * @returns {Promise<boolean>}
 */
async function waitForService(url, timeout = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (resp.ok) return true;
    } catch { /* retry */ }
    await sleep(2_000);
  }
  return false;
}

/**
 * Wait for the Express backend health endpoint.
 * @param {number} [timeout]
 */
async function waitForBackend(timeout = 30_000) {
  return waitForService(`${BACKEND_URL}/api/getAllTasks?default=true`, timeout);
}

/**
 * Wait for the dashboard server to be reachable.
 * @param {number} [timeout]
 */
async function waitForDashboard(timeout = 60_000) {
  return waitForService(`${DASHBOARD_URL}/api/dashboard/ping`, timeout);
}

// ─── Workflow polling ───

/**
 * Poll `GET /api/workflow/:sid/status` until `doneFn(body)` returns true.
 *
 * @param {string} sid        — session id (will be URI-encoded)
 * @param {(body: any) => boolean} doneFn
 * @param {number} [timeout]  — ms (default 5 min)
 * @param {(body: any) => void} [logFn] — optional per-tick logger
 * @returns {Promise<any>}    — last response body
 */
async function pollWorkflowStatus(sid, doneFn, timeout = 300_000, logFn) {
  const url = `${DASHBOARD_URL}/api/workflow/${encodeURIComponent(sid)}/status`;
  const start = Date.now();
  let lastBody = null;

  while (Date.now() - start < timeout) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      lastBody = await resp.json();
      if (logFn) logFn(lastBody);
      if (doneFn(lastBody)) return lastBody;
    } catch (err) {
      console.log(`[e2e] pollWorkflowStatus error: ${err.message}`);
    }
    await sleep(POLL_INTERVAL);
  }
  throw new Error(`pollWorkflowStatus timed out after ${timeout}ms. Last body: ${JSON.stringify(lastBody)}`);
}

/**
 * Poll `GET /api/workflow-status/:sid` for platform cell visual states.
 *
 * @param {string} sid
 * @param {(body: any) => boolean} doneFn
 * @param {number} [timeout]
 * @returns {Promise<any>}
 */
async function pollPlatformStatus(sid, doneFn, timeout = 120_000) {
  const url = `${DASHBOARD_URL}/api/workflow-status/${encodeURIComponent(sid)}`;
  const start = Date.now();
  let lastBody = null;

  while (Date.now() - start < timeout) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      lastBody = await resp.json();
      if (doneFn(lastBody)) return lastBody;
    } catch { /* retry */ }
    await sleep(POLL_INTERVAL);
  }
  throw new Error(`pollPlatformStatus timed out after ${timeout}ms. Last: ${JSON.stringify(lastBody)}`);
}

// ─── Session setup ───

/**
 * Create a session, bind environment + provider/model, apply model.
 * Returns the sessionId string extracted from the DOM.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} config
 * @param {string} config.sessionName
 * @param {string} [config.provider]
 * @param {string} [config.model]
 * @param {string} [config.subProvider]
 * @param {string} [config.apiKey]
 * @param {string} [config.envLabel]   — label text to match in env dropdown
 * @returns {Promise<string>}          — sessionId
 */
async function setupSession(page, config) {
  const {
    sessionName,
    provider = process.env.E2E_PROVIDER || 'claude-code',
    model = process.env.E2E_MODEL || '',
    subProvider = process.env.E2E_SUB_PROVIDER || '',
    apiKey = process.env.E2E_API_KEY || '',
    envLabel,
  } = config;

  // ── Create session ──
  await expect(page.locator('.agent-session-toolbar')).toBeVisible({ timeout: 20_000 });
  const sessionInput = page.locator('[data-testid="session-name-input"]');
  await sessionInput.fill(sessionName);
  await page.locator('[data-testid="new-session-btn"]').click();
  await expect(
    page.locator('.agent-session-item.active', { hasText: new RegExp(sessionName, 'i') })
  ).toBeVisible({ timeout: 15_000 });
  console.log(`[e2e] Session "${sessionName}" created`);

  // ── Open Runtime Settings ──
  const runtimeToggle = page.locator('[data-testid="runtime-settings-toggle"]');
  await runtimeToggle.click();

  // ── Bind environment ──
  const bindModeSelect = page.locator('[data-testid="session-bind-mode"]');
  await expect(bindModeSelect).toBeVisible({ timeout: 5_000 });
  await bindModeSelect.selectOption('env');

  const envSelect = page.locator('[data-testid="session-bind-env"]');
  await expect(envSelect).toBeVisible({ timeout: 5_000 });
  // Prefer env1 (has saved login cookies) — find by label text or use explicit envLabel
  const targetLabel = envLabel || 'env1';
  try {
    await envSelect.selectOption({ label: targetLabel });
    console.log(`[e2e] Env selected by label: ${targetLabel}`);
  } catch {
    // Label not found — try partial match by iterating options
    const options = envSelect.locator('option');
    const count = await options.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      const text = await options.nth(i).textContent() || '';
      if (text.includes('env1')) {
        await envSelect.selectOption({ index: i });
        console.log(`[e2e] Env selected by partial match: ${text}`);
        found = true;
        break;
      }
    }
    if (!found) {
      await envSelect.selectOption({ index: 1 });
      console.log('[e2e] Env fallback: index 1');
    }
  }

  const bindBtn = page.locator('[data-testid="session-bind-btn"]');
  await expect(bindBtn).toBeEnabled({ timeout: 5_000 });
  await bindBtn.click();
  console.log('[e2e] Environment bound');
  await page.waitForTimeout(1_000);

  // ── Provider / model ──
  const providerSelect = page.locator('[data-testid="session-provider"]');
  await expect(providerSelect).toBeVisible({ timeout: 5_000 });
  await providerSelect.selectOption(provider);
  console.log(`[e2e] Provider: ${provider}`);
  await page.waitForTimeout(500);

  if (provider === 'api-key') {
    if (subProvider) {
      await page.locator('[aria-label="session-sub-provider"]').selectOption(subProvider);
      await page.waitForTimeout(300);
    }
    if (apiKey) {
      await page.locator('[aria-label="session-api-key"]').fill(apiKey);
      await page.waitForTimeout(300);
    }
  }

  if (model) {
    const modelSelect = page.locator('[data-testid="session-model"]');
    await expect(modelSelect).toBeVisible({ timeout: 5_000 });
    await modelSelect.selectOption(model);
    console.log(`[e2e] Model: ${model}`);
    await page.waitForTimeout(300);
  }

  // ── Apply Model (triggers execTask) ──
  await page.locator('[data-testid="apply-model-btn"]').click();
  console.log('[e2e] Model applied');

  await dismissTaskOffcanvas(page);

  // Wait for Running state
  await expect(
    page.locator('.session-context-toolbar')
  ).toContainText(/running/i, { timeout: 15_000 });
  console.log('[e2e] Execution state: Running');

  // Extract session ID
  const sid = await page.locator('.agent-session-item.active').getAttribute('data-session-id');
  console.log(`[e2e] Session ID: ${sid}`);
  return sid || `e2e-${Date.now()}`;
}

// ─── TaskOffcanvas dismiss ───

/**
 * Dismiss the TaskOffcanvas if its backdrop is visible.
 * @param {import('@playwright/test').Page} page
 */
async function dismissTaskOffcanvas(page) {
  const backdrop = page.locator('.offcanvas-backdrop.show');
  try {
    await backdrop.waitFor({ state: 'visible', timeout: 3_000 });
  } catch {
    return; // No backdrop
  }
  console.log('[e2e] TaskOffcanvas backdrop detected -- dismissing...');
  const offcanvas = page.locator('[data-testid="task-offcanvas"]');
  const closeBtn = offcanvas.locator('.offcanvas-header .btn-close');
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await expect(backdrop).not.toBeVisible({ timeout: 5_000 });
  console.log('[e2e] TaskOffcanvas dismissed');
}

// ─── Navigation ───

/**
 * Navigate to the agent workspace by clicking through the UI.
 * Does NOT use page.goto() for the workspace — goes via sidebar nav.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [taskName] — e.g. 'jobSeekAgent'
 */
async function navigateToWorkspace(page, taskName = 'jobSeekAgent') {
  // Load the app root
  await page.goto('/');
  await expect(page.locator('.sidebar, .nav')).toBeVisible({ timeout: 10_000 });

  // Switch language to English
  try {
    const langBtn = page.locator('.btn-change-lang');
    await langBtn.click();
    const langOffcanvas = page.locator('.lang-offcanvas');
    await expect(langOffcanvas).toBeVisible({ timeout: 5_000 });
    await page.locator('.lang-offcanvas button', { hasText: 'English' }).click();
    await expect(langOffcanvas).not.toBeVisible({ timeout: 3_000 });
    console.log('[e2e] Language set to English');
  } catch {
    // Already English
  }

  // Click AI Agents nav item
  await page.locator('[data-testid="nav-aiAgents"]').click();
  await expect(page.locator('.ai-agents-page').first()).toBeVisible({ timeout: 10_000 });
  console.log('[e2e] AI Agents page loaded');

  // Click "Open Workspace" on the target agent card
  const agentCard = page.locator('.agent-card', { hasText: new RegExp(taskName, 'i') }).first();
  // If no card matched by taskName, try clicking the first card
  const card = await agentCard.isVisible().catch(() => false) ? agentCard : page.locator('.agent-card').first();
  await card.locator('button', { hasText: /open workspace|start/i }).click();

  await expect(page.locator('.agent-workspace-main')).toBeVisible({ timeout: 15_000 });
  console.log('[e2e] Workspace loaded');

  await dismissTaskOffcanvas(page);
}

// ─── Log file reader ───

/**
 * Read a log file and return lines matching a pattern.
 *
 * @param {string} logPath   — absolute path to log file
 * @param {string|RegExp} pattern
 * @returns {string[]}       — matched lines
 */
function readLogFile(logPath, pattern) {
  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    const re = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    return content.split('\n').filter(line => re.test(line));
  } catch {
    return [];
  }
}

// ─── Tiny helpers ───

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Fetch JSON from the dashboard server.
 * @param {string} urlPath
 */
async function fetchDashboardJSON(urlPath) {
  const resp = await fetch(`${DASHBOARD_URL}${urlPath}`, { signal: AbortSignal.timeout(10_000) });
  return { status: resp.status, body: await resp.json() };
}

/**
 * POST JSON to the dashboard server.
 * @param {string} urlPath
 * @param {any} body
 */
async function postDashboardJSON(urlPath, body) {
  const resp = await fetch(`${DASHBOARD_URL}${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return { status: resp.status, body: await resp.json() };
}

module.exports = {
  BACKEND_URL,
  DASHBOARD_URL,
  waitForService,
  waitForBackend,
  waitForDashboard,
  pollWorkflowStatus,
  pollPlatformStatus,
  setupSession,
  dismissTaskOffcanvas,
  navigateToWorkspace,
  readLogFile,
  sleep,
  fetchDashboardJSON,
  postDashboardJSON,
};
