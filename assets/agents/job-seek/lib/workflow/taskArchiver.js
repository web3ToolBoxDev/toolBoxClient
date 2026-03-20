'use strict';

/**
 * Task Archiver — auto-archive completed/failed tasks after TTL,
 * strip large data to save space, enforce retention limits.
 *
 * Archive flow:
 *   completed/failed → (TTL expires) → archived (data stripped)
 *   archived → (retention limit) → permanently deleted
 */

const taskManager = require('./taskManager');

// ─── Config ───

const DEFAULT_CONFIG = {
    archiveTtlMs: 7 * 24 * 60 * 60 * 1000,   // 7 days before archiving
    maxArchivedPerSession: 50,                  // keep last N archived per session
    scanIntervalMs: 60 * 60 * 1000             // scan every hour
};

let _config = { ...DEFAULT_CONFIG };
let _scanTimer = null;

/**
 * Configure archiver settings.
 */
function configure(opts = {}) {
    if (opts.archiveTtlMs !== undefined) _config.archiveTtlMs = opts.archiveTtlMs;
    if (opts.maxArchivedPerSession !== undefined) _config.maxArchivedPerSession = opts.maxArchivedPerSession;
    if (opts.scanIntervalMs !== undefined) _config.scanIntervalMs = opts.scanIntervalMs;
}

// ─── Data Stripping ───

/**
 * Strip large data fields from a task before archiving.
 * Keeps: id, sessionId, status, config (summary), stats, timestamps, humanBlock history.
 * Strips: step progress details, seenUrls, buildLogs, fullText.
 */
function stripForArchive(task) {
    const stripped = {
        id: task.id,
        sessionId: task.sessionId,
        status: 'archived',
        config: _stripConfig(task.config),
        context: {
            direction: task.context?.direction || {},
            // Strip profile text — just keep section names
            profileSections: task.context?.profile
                ? Object.keys(task.context.profile).filter(k => task.context.profile[k])
                : []
        },
        currentStep: task.currentStep,
        steps: (task.steps || []).map(s => ({
            name: s.name,
            status: s.status,
            startedAt: s.startedAt,
            completedAt: s.completedAt,
            error: s.error,
            // Strip progress: keep counts, drop arrays
            progress: s.progress ? _stripProgress(s.progress) : null
        })),
        stats: task.stats || {},
        humanBlockHistory: task._humanBlockHistory || [],
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        archivedAt: new Date().toISOString()
    };
    return stripped;
}

function _stripConfig(config) {
    if (!config) return {};
    return {
        region: config.region,
        location: config.location,
        sources: (config.sources || []).map(s => ({
            name: s.name || s, enabled: s.enabled !== undefined ? s.enabled : true
        })),
        steps: (config.steps || []).map(s => ({ name: s.name }))
    };
}

function _stripProgress(progress) {
    return {
        phase: progress.phase,
        searched: progress.searched || 0,
        matched: progress.matched || 0,
        qualified: progress.qualified || 0,
        seenUrlCount: Array.isArray(progress.seenUrls) ? progress.seenUrls.length : (progress.seenUrlCount || 0),
        failedSources: progress.failedSources || [],
        queryCount: Array.isArray(progress.queries) ? progress.queries.length : (progress.queryCount || 0)
        // Stripped: seenUrls[], queries[], selfHealAttempts{}, pageOffsets{}
    };
}

// ─── Archive Operations ───

/**
 * Archive a single task — strip data and transition to archived.
 * @param {string} taskId
 * @returns {{ success: boolean, error?: string }}
 */
function archiveTask(taskId) {
    const task = taskManager.getTask(taskId);
    if (!task) return { success: false, error: 'Task not found' };
    if (!['completed', 'failed'].includes(task.status)) {
        return { success: false, error: `Cannot archive task in status: ${task.status}` };
    }

    // Strip data in place
    const stripped = stripForArchive(task);
    // Replace task data with stripped version via transition
    const result = taskManager.transition(taskId, 'archived');
    if (!result.success) return result;

    // Overwrite task fields with stripped data
    const current = taskManager.getTask(taskId);
    if (current) {
        Object.assign(current, stripped);
    }

    return { success: true };
}

/**
 * Scan all tasks and archive those past TTL.
 * @returns {{ archived: string[], pruned: string[] }}
 */
function scanAndArchive() {
    const now = Date.now();
    const archived = [];
    const pruned = [];

    // 1. Archive completed/failed tasks past TTL
    const terminal = taskManager.listTasks().filter(t =>
        ['completed', 'failed'].includes(t.status) && t.completedAt
    );
    for (const task of terminal) {
        const elapsed = now - new Date(task.completedAt).getTime();
        if (elapsed > _config.archiveTtlMs) {
            const r = archiveTask(task.id);
            if (r.success) archived.push(task.id);
        }
    }

    // 2. Enforce per-session retention limit on archived tasks
    const sessionMap = {};
    for (const task of taskManager.listTasks({ status: 'archived' })) {
        if (!sessionMap[task.sessionId]) sessionMap[task.sessionId] = [];
        sessionMap[task.sessionId].push(task);
    }
    for (const [sessionId, tasks] of Object.entries(sessionMap)) {
        // Sort by archivedAt descending — keep newest
        tasks.sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''));
        if (tasks.length > _config.maxArchivedPerSession) {
            const toDelete = tasks.slice(_config.maxArchivedPerSession);
            for (const task of toDelete) {
                taskManager.deleteTask(task.id);
                pruned.push(task.id);
            }
        }
    }

    if (archived.length || pruned.length) {
        console.log(`[taskArchiver] Scan: archived ${archived.length}, pruned ${pruned.length}`);
    }
    return { archived, pruned };
}

// ─── Query ───

/**
 * List archived tasks for a session.
 */
function listArchived(sessionId) {
    return taskManager.listTasks({ sessionId, status: 'archived' });
}

/**
 * Get archive summary (stats across all sessions).
 */
function getArchiveSummary() {
    const all = taskManager.listTasks({ status: 'archived' });
    const sessions = new Set(all.map(t => t.sessionId));
    return {
        total: all.length,
        sessions: sessions.size,
        oldest: all.length ? all[all.length - 1].archivedAt : null,
        newest: all.length ? all[0].archivedAt : null
    };
}

// ─── Scheduled Scan ───

/**
 * Start periodic archival scan.
 */
function startScheduledScan() {
    stopScheduledScan();
    _scanTimer = setInterval(() => {
        try { scanAndArchive(); } catch (e) {
            console.error('[taskArchiver] Scan error:', e.message);
        }
    }, _config.scanIntervalMs);
    console.log(`[taskArchiver] Scheduled scan every ${_config.scanIntervalMs / 60000}min`);
}

/**
 * Stop periodic scan.
 */
function stopScheduledScan() {
    if (_scanTimer) {
        clearInterval(_scanTimer);
        _scanTimer = null;
    }
}

module.exports = {
    configure,
    stripForArchive,
    archiveTask,
    scanAndArchive,
    listArchived,
    getArchiveSummary,
    startScheduledScan,
    stopScheduledScan,
    DEFAULT_CONFIG
};
