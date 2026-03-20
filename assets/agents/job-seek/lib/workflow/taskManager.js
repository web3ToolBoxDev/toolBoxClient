'use strict';

/**
 * Task Manager — Workflow task lifecycle with persistent state.
 *
 * Each workflow run = a "Task" with a state machine:
 *   queued → running → completed → archived
 *                    ↘ waiting_human → running (resolve)
 *                    ↘ paused → running (resume)
 *                    ↘ failed → archived
 *
 * Persisted via agent state (sessionStore / StateService).
 * Survives agent restart — running tasks auto-transition to paused.
 */

// ─── Constants ───

const TASK_STATUS = ['queued', 'running', 'waiting_human', 'paused', 'completed', 'failed', 'archived'];

const VALID_TRANSITIONS = {
    queued:        ['running', 'failed'],
    running:       ['waiting_human', 'paused', 'completed', 'failed'],
    waiting_human: ['running', 'failed'],
    paused:        ['running', 'failed'],
    completed:     ['archived'],
    failed:        ['archived'],
    archived:      []
};

const STEP_STATUS = ['idle', 'waiting_login', 'ready', 'running', 'done', 'error', 'skipped', 'stuck'];

// ─── State ───

// In-memory task registry: taskId → TaskData
// Hydrated from persistent state on init, written back on every mutation.
const _tasks = new Map();

// Callbacks
let _persistFn = null;   // (tasks: object) => void — debounced save
let _notifyFn = null;    // (taskId, event, data) => void — alert dispatch

// ─── ID Generation ───

function _genId() {
    return 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function _now() {
    return new Date().toISOString();
}

// ─── Persistence Bridge ───

/**
 * Initialize taskManager with persistence callbacks.
 * @param {object} opts
 * @param {function} opts.persist - Called with full tasks map as plain object on every mutation
 * @param {function} [opts.notify] - Called with (taskId, event, data) for notifications
 * @param {object} [opts.savedTasks] - Previously persisted tasks to hydrate from
 */
function init({ persist, notify, savedTasks } = {}) {
    _persistFn = persist || null;
    _notifyFn = notify || null;

    // Hydrate from saved state
    _tasks.clear();
    if (savedTasks && typeof savedTasks === 'object') {
        for (const [id, task] of Object.entries(savedTasks)) {
            if (task && task.id) {
                _tasks.set(id, task);
            }
        }
    }
}

function _persist() {
    if (!_persistFn) return;
    const plain = {};
    for (const [id, task] of _tasks) {
        plain[id] = task;
    }
    _persistFn(plain);
}

function _notify(taskId, event, data) {
    if (_notifyFn) {
        try { _notifyFn(taskId, event, data); } catch (_) {}
    }
}

// ─── CRUD ───

/**
 * Create a new task.
 * @param {object} opts
 * @param {string} opts.sessionId
 * @param {object} opts.config - Workflow config snapshot
 * @param {object} opts.context - { direction, profile, envId }
 * @param {Array} [opts.steps] - Step definitions from config
 * @returns {object} Created task
 */
function createTask({ sessionId, config, context, steps = [] }) {
    const id = _genId();
    const task = {
        id,
        sessionId,
        status: 'queued',
        config: config || {},
        context: context || {},

        currentStep: null,
        steps: steps.map(s => ({
            name: s.name,
            status: s.enabled !== false ? 'idle' : 'skipped',
            startedAt: null,
            completedAt: null,
            error: null,
            result: null,
            progress: null
        })),

        humanBlock: null,

        stats: {
            totalSearched: 0,
            totalMatched: 0,
            totalGenerated: 0,
            totalApplied: 0,
            duration: 0,
            errors: []
        },

        createdAt: _now(),
        startedAt: null,
        completedAt: null,
        archivedAt: null
    };

    _tasks.set(id, task);
    _persist();
    return task;
}

/**
 * Get a task by ID.
 */
function getTask(taskId) {
    return _tasks.get(taskId) || null;
}

/**
 * List tasks, optionally filtered.
 * @param {object} [filter]
 * @param {string} [filter.sessionId]
 * @param {string} [filter.status]
 * @param {boolean} [filter.active] - true = exclude archived
 * @returns {object[]}
 */
function listTasks(filter = {}) {
    const results = [];
    for (const task of _tasks.values()) {
        if (filter.sessionId && task.sessionId !== filter.sessionId) continue;
        if (filter.status && task.status !== filter.status) continue;
        if (filter.active && task.status === 'archived') continue;
        results.push(task);
    }
    return results.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || (b.id || '').localeCompare(a.id || ''));
}

/**
 * Get active task for a session (most recent non-archived).
 */
function getActiveTask(sessionId) {
    const tasks = listTasks({ sessionId, active: true });
    return tasks[0] || null;
}

// ─── State Machine ───

/**
 * Transition task status with validation.
 * @param {string} taskId
 * @param {string} newStatus
 * @param {object} [extra] - Additional fields to set
 * @returns {{ success: boolean, error?: string, task?: object }}
 */
function transition(taskId, newStatus, extra = {}) {
    const task = _tasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };

    const allowed = VALID_TRANSITIONS[task.status];
    if (!allowed || !allowed.includes(newStatus)) {
        return { success: false, error: `Invalid transition: ${task.status} → ${newStatus}` };
    }

    const prevStatus = task.status;
    task.status = newStatus;

    // Auto-set timestamps
    if (newStatus === 'running' && !task.startedAt) {
        task.startedAt = _now();
    }
    if (newStatus === 'completed' || newStatus === 'failed') {
        task.completedAt = _now();
        if (task.startedAt) {
            task.stats.duration = Date.now() - new Date(task.startedAt).getTime();
        }
    }
    if (newStatus === 'archived') {
        task.archivedAt = _now();
    }

    // Clear human block when resuming
    if (newStatus === 'running' && prevStatus === 'waiting_human') {
        task.humanBlock = null;
    }

    // Apply extra fields
    if (extra.error) {
        task.stats.errors.push({ message: extra.error, at: _now() });
    }

    _persist();
    _notify(taskId, 'status_change', { from: prevStatus, to: newStatus, taskId });
    return { success: true, task };
}

// ─── Step Progress ───

/**
 * Update step status within a task.
 */
function updateStep(taskId, stepName, status, extra = {}) {
    const task = _tasks.get(taskId);
    if (!task) return null;

    const step = task.steps.find(s => s.name === stepName);
    if (!step) return null;
    if (!STEP_STATUS.includes(status)) return null;

    step.status = status;
    if (status === 'running') {
        step.startedAt = _now();
        task.currentStep = stepName;
    }
    if (['done', 'error', 'skipped', 'stuck'].includes(status)) {
        step.completedAt = _now();
    }
    if (extra.error) step.error = extra.error;
    if (extra.result) step.result = extra.result;
    if (extra.progress) step.progress = extra.progress;

    _persist();
    return step;
}

/**
 * Update step progress data (e.g., search progress).
 */
function updateStepProgress(taskId, stepName, progress) {
    const task = _tasks.get(taskId);
    if (!task) return null;

    const step = task.steps.find(s => s.name === stepName);
    if (!step) return null;

    step.progress = { ...(step.progress || {}), ...progress };
    _persist();
    return step;
}

/**
 * Update task stats.
 */
function updateStats(taskId, statsUpdate) {
    const task = _tasks.get(taskId);
    if (!task) return null;

    Object.assign(task.stats, statsUpdate);
    _persist();
    return task.stats;
}

// ─── Human Intervention ───

/**
 * Request human intervention — transitions to waiting_human.
 * @param {string} taskId
 * @param {object} block - { reason, platform?, message, actions[], autoTimeout? }
 * @returns {{ success: boolean, error?: string }}
 */
function requestHumanIntervention(taskId, block) {
    const task = _tasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };
    if (task.status !== 'running') return { success: false, error: `Cannot request intervention in status: ${task.status}` };

    task.humanBlock = {
        reason: block.reason,
        platform: block.platform || null,
        envId: block.envId || null,
        message: block.message || '',
        actions: block.actions || [],
        createdAt: _now(),
        autoTimeout: block.autoTimeout || 30 * 60 * 1000
    };

    const result = transition(taskId, 'waiting_human');
    if (result.success) {
        _notify(taskId, 'human_intervention', {
            taskId,
            reason: block.reason,
            message: block.message,
            actions: block.actions,
            priority: block.priority || 'high'
        });
    }
    return result;
}

/**
 * Resolve human intervention — transitions back to running.
 * @param {string} taskId
 * @param {string} action - The action taken (e.g., 'relogin', 'skip_platform')
 * @returns {{ success: boolean, error?: string, action?: string }}
 */
function resolveHumanBlock(taskId, action) {
    const task = _tasks.get(taskId);
    if (!task) return { success: false, error: 'Task not found' };
    if (task.status !== 'waiting_human') return { success: false, error: `Not in waiting_human state: ${task.status}` };

    const resolution = {
        action,
        resolvedAt: _now(),
        reason: task.humanBlock?.reason || 'unknown'
    };

    // Store resolution in history
    if (!task._humanBlockHistory) task._humanBlockHistory = [];
    task._humanBlockHistory.push(resolution);

    const result = transition(taskId, 'running');
    if (result.success) {
        _notify(taskId, 'human_resolved', { taskId, action, reason: resolution.reason });
    }
    return { ...result, action };
}

// ─── Timeout Checker ───

/**
 * Check all waiting_human tasks for timeout.
 * Call periodically (e.g., every 60s).
 * @returns {string[]} taskIds that timed out
 */
function checkTimeouts() {
    const timedOut = [];
    const now = Date.now();

    for (const [taskId, task] of _tasks) {
        if (task.status !== 'waiting_human' || !task.humanBlock) continue;

        const elapsed = now - new Date(task.humanBlock.createdAt).getTime();
        if (elapsed > (task.humanBlock.autoTimeout || Infinity)) {
            transition(taskId, 'failed', { error: `Human intervention timed out: ${task.humanBlock.reason}` });
            _notify(taskId, 'timeout', { taskId, reason: task.humanBlock.reason });
            timedOut.push(taskId);
        }
    }
    return timedOut;
}

// ─── Restart Recovery ───

/**
 * Recover tasks after agent restart.
 * Running tasks → paused, notify user.
 * @returns {string[]} taskIds that were paused
 */
function recoverFromRestart() {
    const paused = [];
    for (const [taskId, task] of _tasks) {
        if (task.status === 'running') {
            task.status = 'paused';
            task.currentStep = task.currentStep || null;
            paused.push(taskId);
            _notify(taskId, 'restart_paused', {
                taskId,
                message: 'Task paused after service restart. Resume when ready.',
                sessionId: task.sessionId
            });
        }
    }
    if (paused.length > 0) _persist();
    return paused;
}

// ─── Cleanup ───

/**
 * Delete a task permanently.
 */
function deleteTask(taskId) {
    const deleted = _tasks.delete(taskId);
    if (deleted) _persist();
    return deleted;
}

/**
 * Clear all tasks for a session.
 */
function clearSession(sessionId) {
    let deleted = 0;
    for (const [taskId, task] of _tasks) {
        if (task.sessionId === sessionId) {
            _tasks.delete(taskId);
            deleted++;
        }
    }
    if (deleted > 0) _persist();
    return deleted;
}

module.exports = {
    // Lifecycle
    init,
    createTask,
    getTask,
    listTasks,
    getActiveTask,
    transition,
    deleteTask,
    clearSession,

    // Steps
    updateStep,
    updateStepProgress,
    updateStats,

    // Human intervention
    requestHumanIntervention,
    resolveHumanBlock,
    checkTimeouts,

    // Recovery
    recoverFromRestart,

    // Constants
    TASK_STATUS,
    VALID_TRANSITIONS,
    STEP_STATUS
};
