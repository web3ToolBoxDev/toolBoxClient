'use strict';

/**
 * Workflow Store — persistent storage for config, run state, and history.
 *
 * Three separate concerns:
 *   config  — user's workflow configuration (per session)
 *   run     — current execution state (ephemeral, in-memory)
 *   history — completed run records (per session)
 */

const { buildDefaultConfig, validateConfig } = require('./workflowConfig');

// In-memory stores keyed by sessionId
const _configs = new Map();
const _runs = new Map();
const _history = new Map();

// ─── Config Store ───

/**
 * Get workflow config for a session. Creates default if missing.
 * @param {string} sessionId
 * @param {string} [location] - Used for default config creation
 * @returns {object} Workflow config
 */
function getConfig(sessionId, location) {
    if (!_configs.has(sessionId) && location) {
        _configs.set(sessionId, buildDefaultConfig(location));
    }
    return _configs.get(sessionId) || null;
}

/**
 * Save workflow config for a session.
 * @param {string} sessionId
 * @param {object} config
 * @returns {{ success: boolean, errors?: string[] }}
 */
function saveConfig(sessionId, config) {
    const { valid, errors } = validateConfig(config);
    if (!valid) return { success: false, errors };

    _configs.set(sessionId, { ...config, updatedAt: new Date().toISOString() });
    return { success: true };
}

/**
 * Delete config for a session.
 */
function deleteConfig(sessionId) {
    _configs.delete(sessionId);
}

// ─── Run Store ───

/** Step status enum. */
const STEP_STATUS = ['idle', 'waiting_login', 'ready', 'running', 'done', 'error', 'skipped'];
/** Workflow status enum. */
const WORKFLOW_STATUS = ['idle', 'blocked', 'ready', 'running', 'paused', 'failed', 'completed'];

/**
 * Initialize a new run for a session.
 * @param {string} sessionId
 * @param {object} config - Workflow config to use
 * @returns {object} Run state
 */
function initRun(sessionId, config) {
    const steps = (config.steps || []).map(s => ({
        name: s.name,
        status: s.enabled ? 'idle' : 'skipped',
        startedAt: null,
        completedAt: null,
        error: null,
        result: null
    }));

    const run = {
        sessionId,
        status: 'idle',
        steps,
        startedAt: null,
        completedAt: null,
        currentStep: null,
        error: null
    };

    _runs.set(sessionId, run);
    return run;
}

/**
 * Get current run state.
 */
function getRun(sessionId) {
    return _runs.get(sessionId) || null;
}

/**
 * Update run status.
 */
function updateRunStatus(sessionId, status) {
    const run = _runs.get(sessionId);
    if (!run) return null;

    if (!WORKFLOW_STATUS.includes(status)) return null;

    run.status = status;
    if (status === 'running' && !run.startedAt) {
        run.startedAt = new Date().toISOString();
    }
    if (['completed', 'failed'].includes(status)) {
        run.completedAt = new Date().toISOString();
    }
    return run;
}

/**
 * Update a step's status within the current run.
 */
function updateStepStatus(sessionId, stepName, status, extra = {}) {
    const run = _runs.get(sessionId);
    if (!run) return null;

    const step = run.steps.find(s => s.name === stepName);
    if (!step) return null;

    if (!STEP_STATUS.includes(status)) return null;

    step.status = status;
    if (status === 'running') {
        step.startedAt = new Date().toISOString();
        run.currentStep = stepName;
    }
    if (['done', 'error', 'skipped'].includes(status)) {
        step.completedAt = new Date().toISOString();
    }
    if (extra.error) step.error = extra.error;
    if (extra.result) step.result = extra.result;

    return step;
}

/**
 * Delete run state.
 */
function deleteRun(sessionId) {
    _runs.delete(sessionId);
}

// ─── History Store ───

/**
 * Archive current run to history.
 */
function archiveRun(sessionId) {
    const run = _runs.get(sessionId);
    if (!run) return null;

    if (!_history.has(sessionId)) {
        _history.set(sessionId, []);
    }

    const record = {
        ...run,
        archivedAt: new Date().toISOString()
    };

    _history.get(sessionId).push(record);
    _runs.delete(sessionId);
    return record;
}

/**
 * Get run history for a session.
 */
function getHistory(sessionId) {
    return _history.get(sessionId) || [];
}

/**
 * Clear all stores for a session.
 */
function clearSession(sessionId) {
    _configs.delete(sessionId);
    _runs.delete(sessionId);
    _history.delete(sessionId);
}

module.exports = {
    // Config
    getConfig,
    saveConfig,
    deleteConfig,
    // Run
    initRun,
    getRun,
    updateRunStatus,
    updateStepStatus,
    deleteRun,
    // History
    archiveRun,
    getHistory,
    // Cleanup
    clearSession,
    // Constants
    STEP_STATUS,
    WORKFLOW_STATUS
};
