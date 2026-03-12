'use strict';

/**
 * Schedule Engine — interval-based recurring workflow runs.
 *
 * Supports:
 *   - Per-session schedules (interval in minutes)
 *   - Max runs limit
 *   - Start/stop/pause scheduling
 *   - History of scheduled runs
 *
 * Does NOT use cron syntax — keeps it simple with interval + time window.
 */

const workflowEngine = require('./workflowEngine');
const workflowStore = require('./workflowStore');

// Active schedules: sessionId → { timer, config, ... }
const _schedules = new Map();

/**
 * Create or update a schedule.
 * @param {string} sessionId
 * @param {object} opts
 * @param {number} opts.intervalMinutes - Run every N minutes
 * @param {number} [opts.maxRuns] - Max total runs (0 = unlimited)
 * @param {string[]} [opts.activeHours] - ['09:00','18:00'] time window
 * @param {Function} [opts.getContext] - Returns { direction, profile } for each run
 */
function createSchedule(sessionId, opts) {
    if (_schedules.has(sessionId)) {
        stopSchedule(sessionId);
    }

    const schedule = {
        sessionId,
        intervalMinutes: opts.intervalMinutes || 60,
        maxRuns: opts.maxRuns || 0,
        activeHours: opts.activeHours || null,
        getContext: opts.getContext || null,
        runCount: 0,
        enabled: true,
        timer: null,
        createdAt: new Date().toISOString(),
        lastRunAt: null,
        nextRunAt: null
    };

    _schedules.set(sessionId, schedule);
    _scheduleNext(sessionId);

    return { success: true, schedule: _serializeSchedule(schedule) };
}

/**
 * Start (or resume) a schedule.
 */
function startSchedule(sessionId) {
    const schedule = _schedules.get(sessionId);
    if (!schedule) return { success: false, error: 'No schedule found' };

    schedule.enabled = true;
    _scheduleNext(sessionId);
    return { success: true, schedule: _serializeSchedule(schedule) };
}

/**
 * Pause a schedule (keeps config, stops timer).
 */
function pauseSchedule(sessionId) {
    const schedule = _schedules.get(sessionId);
    if (!schedule) return { success: false, error: 'No schedule found' };

    schedule.enabled = false;
    if (schedule.timer) {
        clearTimeout(schedule.timer);
        schedule.timer = null;
    }
    schedule.nextRunAt = null;
    return { success: true, schedule: _serializeSchedule(schedule) };
}

/**
 * Stop and remove a schedule.
 */
function stopSchedule(sessionId) {
    const schedule = _schedules.get(sessionId);
    if (!schedule) return { success: false, error: 'No schedule found' };

    if (schedule.timer) {
        clearTimeout(schedule.timer);
        schedule.timer = null;
    }
    _schedules.delete(sessionId);
    return { success: true };
}

/**
 * Get schedule status.
 */
function getSchedule(sessionId) {
    const schedule = _schedules.get(sessionId);
    if (!schedule) return null;
    return _serializeSchedule(schedule);
}

/**
 * List all active schedules.
 */
function listSchedules() {
    const result = [];
    for (const [sid, sched] of _schedules) {
        result.push(_serializeSchedule(sched));
    }
    return result;
}

// ─── Internal ───

function _scheduleNext(sessionId) {
    const schedule = _schedules.get(sessionId);
    if (!schedule || !schedule.enabled) return;

    // Check max runs
    if (schedule.maxRuns > 0 && schedule.runCount >= schedule.maxRuns) {
        schedule.enabled = false;
        schedule.nextRunAt = null;
        return;
    }

    const delayMs = schedule.intervalMinutes * 60 * 1000;
    schedule.nextRunAt = new Date(Date.now() + delayMs).toISOString();

    schedule.timer = setTimeout(() => {
        _executeScheduledRun(sessionId);
    }, delayMs);
}

async function _executeScheduledRun(sessionId) {
    const schedule = _schedules.get(sessionId);
    if (!schedule || !schedule.enabled) return;

    // Check time window
    if (schedule.activeHours) {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const [start, end] = schedule.activeHours;
        if (timeStr < start || timeStr > end) {
            // Outside window, schedule next check
            _scheduleNext(sessionId);
            return;
        }
    }

    // Get config and context
    const config = workflowStore.getConfig(sessionId);
    if (!config) {
        console.warn(`[scheduleEngine] No config for session ${sessionId}, skipping run`);
        _scheduleNext(sessionId);
        return;
    }

    const context = schedule.getContext ? schedule.getContext() : { direction: {}, profile: {} };

    // Start workflow
    try {
        const result = await workflowEngine.start(sessionId, config, context);
        schedule.runCount++;
        schedule.lastRunAt = new Date().toISOString();

        if (!result.success) {
            console.warn(`[scheduleEngine] Run failed for ${sessionId}: ${result.error}`);
        }
    } catch (err) {
        console.error(`[scheduleEngine] Error starting run for ${sessionId}:`, err.message);
    }

    // Schedule next
    _scheduleNext(sessionId);
}

function _serializeSchedule(schedule) {
    return {
        sessionId: schedule.sessionId,
        intervalMinutes: schedule.intervalMinutes,
        maxRuns: schedule.maxRuns,
        activeHours: schedule.activeHours,
        runCount: schedule.runCount,
        enabled: schedule.enabled,
        createdAt: schedule.createdAt,
        lastRunAt: schedule.lastRunAt,
        nextRunAt: schedule.nextRunAt
    };
}

module.exports = {
    createSchedule,
    startSchedule,
    pauseSchedule,
    stopSchedule,
    getSchedule,
    listSchedules
};
