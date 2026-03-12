'use strict';

/**
 * Workflow Engine — orchestrates the 4-step pipeline.
 *
 * Pure orchestrator: delegates each step to its handler,
 * manages lifecycle transitions, and emits status updates.
 *
 * Steps: customizeProfile → search → generate → apply
 */

const store = require('./workflowStore');
const { validateConfig, getSourceMeta } = require('./workflowConfig');

// Step handlers — lazy-loaded to avoid circular deps
let _stepHandlers = null;
function getStepHandlers() {
    if (!_stepHandlers) {
        _stepHandlers = {
            customizeProfile: require('./steps/customizeProfile'),
            search: require('./steps/search'),
            generate: require('./steps/generate'),
            apply: require('./steps/apply')
        };
    }
    return _stepHandlers;
}

// Login status cache: source → { status, checkedAt }
const _loginCache = new Map();

// Step timeout thresholds (ms) — steps running longer are marked stuck
const STEP_TIMEOUTS = {
    customizeProfile: 30_000,     // 30s
    search: 10 * 60_000,         // 10 min
    generate: 15 * 60_000,       // 15 min
    apply: 20 * 60_000           // 20 min
};
const DEFAULT_STEP_TIMEOUT = 5 * 60_000; // 5 min

/**
 * Start a workflow run.
 * @param {string} sessionId
 * @param {object} config - Validated workflow config
 * @param {object} context - { direction, profile, envId }
 * @returns {{ success: boolean, error?: string }}
 */
async function start(sessionId, config, context) {
    // Validate config
    const { valid, errors } = validateConfig(config);
    if (!valid) return { success: false, error: errors.join('; ') };

    // Check if already running
    const existing = store.getRun(sessionId);
    if (existing && existing.status === 'running') {
        return { success: false, error: 'Workflow already running' };
    }

    // Initialize run
    const run = store.initRun(sessionId, config);
    store.updateRunStatus(sessionId, 'running');

    // Check login requirements before proceeding
    const blocked = await checkLoginRequirements(sessionId, config);
    if (blocked.length > 0) {
        store.updateRunStatus(sessionId, 'blocked');
        return {
            success: false,
            error: `Login required for: ${blocked.join(', ')}`,
            blockedSources: blocked
        };
    }

    // Run pipeline asynchronously
    _executePipeline(sessionId, config, context).catch(err => {
        console.error(`[workflowEngine] Pipeline error (${sessionId}):`, err.message);
        store.updateRunStatus(sessionId, 'failed');
    });

    return { success: true, run };
}

/**
 * Stop a running workflow.
 */
function stop(sessionId) {
    const run = store.getRun(sessionId);
    if (!run) return { success: false, error: 'No active run' };
    if (run.status !== 'running') return { success: false, error: `Cannot stop: status is ${run.status}` };

    store.updateRunStatus(sessionId, 'paused');
    return { success: true };
}

/**
 * Resume a paused/blocked workflow.
 */
async function resume(sessionId, config, context) {
    const run = store.getRun(sessionId);
    if (!run) return { success: false, error: 'No active run' };
    if (!['paused', 'blocked'].includes(run.status)) {
        return { success: false, error: `Cannot resume: status is ${run.status}` };
    }

    store.updateRunStatus(sessionId, 'running');

    _executePipeline(sessionId, config, context).catch(err => {
        console.error(`[workflowEngine] Resume error (${sessionId}):`, err.message);
        store.updateRunStatus(sessionId, 'failed');
    });

    return { success: true };
}

/**
 * Get workflow status including step details.
 */
function getStatus(sessionId) {
    const run = store.getRun(sessionId);
    if (!run) return { status: 'idle', steps: [], currentStep: null };

    return {
        status: run.status,
        steps: run.steps,
        currentStep: run.currentStep,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        error: run.error
    };
}

/**
 * Check login status for a source.
 */
async function checkLoginStatus(source) {
    const cached = _loginCache.get(source);
    if (cached && Date.now() - new Date(cached.checkedAt).getTime() < 60_000) {
        return cached.status;
    }

    const meta = getSourceMeta(source);
    if (!meta) return 'unknown';
    if (!meta.loginRequired) return 'not_required';

    // For now, default to 'unknown' — adapters will implement actual checks
    const status = 'unknown';
    _loginCache.set(source, { status, checkedAt: new Date().toISOString() });
    return status;
}

/**
 * Update login status (called after user logs in via browser).
 */
function setLoginStatus(source, status) {
    _loginCache.set(source, { status, checkedAt: new Date().toISOString() });
}

/**
 * Check which enabled sources require login.
 * @returns {string[]} Names of blocked sources
 */
async function checkLoginRequirements(sessionId, config) {
    const blocked = [];
    for (const source of config.sources) {
        if (!source.enabled) continue;
        if (!source.loginRequired) continue;

        const status = await checkLoginStatus(source.name);
        if (status === 'logged_out' || status === 'required') {
            blocked.push(source.name);
            // Mark search step as waiting
            store.updateStepStatus(sessionId, 'search', 'waiting_login');
        }
    }
    return blocked;
}

// ─── Internal Pipeline Execution ───

async function _executePipeline(sessionId, config, context) {
    const handlers = getStepHandlers();
    const run = store.getRun(sessionId);
    if (!run) return;

    const enabledSteps = run.steps
        .filter(s => s.status !== 'skipped')
        .sort((a, b) => {
            const stepDef = config.steps || [];
            const orderA = stepDef.find(d => d.name === a.name)?.order ?? 99;
            const orderB = stepDef.find(d => d.name === b.name)?.order ?? 99;
            return orderA - orderB;
        });

    for (const step of enabledSteps) {
        // Check if stopped/paused
        const currentRun = store.getRun(sessionId);
        if (!currentRun || currentRun.status !== 'running') break;

        // Skip already completed steps (for resume)
        if (['done', 'skipped'].includes(step.status)) continue;

        const handler = handlers[step.name];
        if (!handler || !handler.execute) {
            store.updateStepStatus(sessionId, step.name, 'error', {
                error: `No handler for step: ${step.name}`
            });
            continue;
        }

        store.updateStepStatus(sessionId, step.name, 'running');

        try {
            const result = await handler.execute({
                sessionId,
                config,
                context,
                step: config.steps.find(s => s.name === step.name)
            });

            store.updateStepStatus(sessionId, step.name, 'done', { result });
        } catch (err) {
            store.updateStepStatus(sessionId, step.name, 'error', {
                error: err.message
            });

            // If a critical step fails, stop the pipeline
            if (['search'].includes(step.name)) {
                store.updateRunStatus(sessionId, 'failed');
                return;
            }
        }
    }

    // All steps done
    const finalRun = store.getRun(sessionId);
    if (finalRun && finalRun.status === 'running') {
        store.updateRunStatus(sessionId, 'completed');
        store.archiveRun(sessionId);
    }
}

/**
 * Check for stuck steps and mark them.
 * @param {string} sessionId
 * @returns {{ stuckSteps: string[] }}
 */
function checkStuckSteps(sessionId) {
    const run = store.getRun(sessionId);
    if (!run || run.status !== 'running') return { stuckSteps: [] };

    const stuckSteps = [];
    const now = Date.now();

    for (const step of run.steps) {
        if (step.status !== 'running' || !step.startedAt) continue;
        const elapsed = now - new Date(step.startedAt).getTime();
        const timeout = STEP_TIMEOUTS[step.name] || DEFAULT_STEP_TIMEOUT;
        if (elapsed > timeout) {
            store.updateStepStatus(sessionId, step.name, 'stuck', {
                error: `Step timed out after ${Math.round(elapsed / 1000)}s`
            });
            stuckSteps.push(step.name);
        }
    }

    return { stuckSteps };
}

/**
 * Retry a specific step (resets status to idle and re-runs pipeline).
 * @param {string} sessionId
 * @param {string} stepName
 * @param {object} config
 * @param {object} context
 */
async function retryStep(sessionId, stepName, config, context) {
    const run = store.getRun(sessionId);
    if (!run) return { success: false, error: 'No active run' };

    const step = run.steps.find(s => s.name === stepName);
    if (!step) return { success: false, error: `Step not found: ${stepName}` };

    if (!['error', 'stuck'].includes(step.status)) {
        return { success: false, error: `Cannot retry step in status: ${step.status}` };
    }

    // Reset step
    store.updateStepStatus(sessionId, stepName, 'idle');

    // Resume the run from this step
    store.updateRunStatus(sessionId, 'running');

    _executePipeline(sessionId, config, context).catch(err => {
        console.error(`[workflowEngine] Retry error (${sessionId}):`, err.message);
        store.updateRunStatus(sessionId, 'failed');
    });

    return { success: true };
}

/**
 * Skip a specific step.
 * @param {string} sessionId
 * @param {string} stepName
 */
function skipStep(sessionId, stepName) {
    const run = store.getRun(sessionId);
    if (!run) return { success: false, error: 'No active run' };

    const step = run.steps.find(s => s.name === stepName);
    if (!step) return { success: false, error: `Step not found: ${stepName}` };

    if (['done'].includes(step.status)) {
        return { success: false, error: `Cannot skip completed step` };
    }

    store.updateStepStatus(sessionId, stepName, 'skipped');
    return { success: true };
}

module.exports = {
    start,
    stop,
    resume,
    getStatus,
    checkLoginStatus,
    setLoginStatus,
    checkLoginRequirements,
    checkStuckSteps,
    retryStep,
    skipStep,
    STEP_TIMEOUTS,
    DEFAULT_STEP_TIMEOUT
};
