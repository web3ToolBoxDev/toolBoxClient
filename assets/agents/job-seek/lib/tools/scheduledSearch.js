'use strict';

/**
 * scheduled_search domain tool — Manage recurring job search schedules.
 *
 * Supports creating, listing, running, and removing search schedules.
 * Schedules are stored in memory with configurable intervals.
 * Each run deduplicates against previously seen URLs and stores new
 * listings in knowledgeStore.
 */

const knowledgeClient = require('../core/knowledgeClient');
const { handler: jobSearchHandler } = require('./jobSearch');

const TOOL_DEF = {
    name: 'scheduled_search',
    description: 'Create, list, run, or remove a recurring job search schedule. Runs searches periodically and stores new results in knowledge store.',
    parameters: {
        type: 'object',
        properties: {
            action: { type: 'string', description: 'Action: create | list | run | remove' },
            scheduleId: { type: 'string', description: 'Schedule ID (for run/remove)' },
            query: { type: 'string', description: 'Job search query (for create)' },
            location: { type: 'string', description: 'Location filter (for create)' },
            intervalMs: { type: 'number', description: 'Interval in ms (default 86400000 = 24h)' },
            maxResults: { type: 'number', description: 'Max results per run (default 10)' },
            scope: { type: 'string', description: 'Knowledge store scope (default user:global)' }
        },
        required: ['action']
    },
    category: 'job-seek'
};

// In-memory schedule store: scheduleId → ScheduleConfig
const _schedules = new Map();
// Timer handles
const _timers = new Map();

const DEFAULT_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create a new search schedule.
 */
function createSchedule({ scheduleId, query, location, intervalMs, maxResults, scope }) {
    if (!query) throw new Error('query is required to create a schedule');
    const id = scheduleId || `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (_schedules.has(id)) throw new Error(`Schedule "${id}" already exists`);

    const config = {
        id,
        query,
        location: location || '',
        intervalMs: intervalMs || DEFAULT_INTERVAL,
        maxResults: maxResults || 10,
        scope: scope || 'user:global',
        createdAt: new Date().toISOString(),
        lastRunAt: null,
        runCount: 0,
        totalNewListings: 0,
        active: true
    };

    _schedules.set(id, config);
    startTimer(id);
    return config;
}

/**
 * Start the interval timer for a schedule.
 */
function startTimer(scheduleId) {
    const config = _schedules.get(scheduleId);
    if (!config || !config.active) return;

    // Clear existing timer if any
    if (_timers.has(scheduleId)) {
        clearInterval(_timers.get(scheduleId));
    }

    const timer = setInterval(() => {
        runSchedule(scheduleId).catch(err => {
            console.error(`[scheduledSearch] auto-run failed for ${scheduleId}:`, err.message);
        });
    }, config.intervalMs);

    // Don't prevent Node from exiting
    if (timer.unref) timer.unref();
    _timers.set(scheduleId, timer);
}

/**
 * Run a search schedule immediately.
 * @returns {Promise<{ newListings: number, totalFound: number, duplicates: number }>}
 */
async function runSchedule(scheduleId) {
    const config = _schedules.get(scheduleId);
    if (!config) throw new Error(`Schedule "${scheduleId}" not found`);

    // Execute job search
    const results = await jobSearchHandler({
        query: config.query,
        location: config.location || undefined,
        maxResults: config.maxResults
    });

    // Check existing listings to find new ones
    const existingDocs = await knowledgeClient.find({ type: 'job_listing', scope: config.scope });
    const existingUrls = new Set(existingDocs.map(d => d.content?.url || d.content?.refId));

    let newCount = 0;
    let dupCount = 0;

    for (const listing of results.listings) {
        if (existingUrls.has(listing.url)) {
            dupCount++;
            continue;
        }

        await knowledgeClient.upsert({
            refId: `job_${Buffer.from(listing.url).toString('base64').slice(0, 40)}`,
            type: 'job_listing',
            content: listing,
            summary: `${listing.title} at ${listing.company} (${listing.location || 'unknown'})`,
            tags: [config.query, listing.company, listing.location].filter(Boolean),
            scope: config.scope,
            source: 'scheduled_search'
        });
        newCount++;
    }

    // Update stats
    config.lastRunAt = new Date().toISOString();
    config.runCount++;
    config.totalNewListings += newCount;

    return {
        scheduleId,
        newListings: newCount,
        totalFound: results.totalFound,
        duplicates: dupCount
    };
}

/**
 * List all schedules.
 */
function listSchedules() {
    return Array.from(_schedules.values());
}

/**
 * Remove a schedule.
 */
function removeSchedule(scheduleId) {
    if (_timers.has(scheduleId)) {
        clearInterval(_timers.get(scheduleId));
        _timers.delete(scheduleId);
    }
    return _schedules.delete(scheduleId);
}

/**
 * Clear all schedules (for testing).
 */
function clearAll() {
    for (const [id] of _timers) {
        clearInterval(_timers.get(id));
    }
    _timers.clear();
    _schedules.clear();
}

/**
 * Handler for the domain tool.
 */
async function handler(params) {
    const { action } = params;

    switch (action) {
        case 'create':
            return createSchedule(params);
        case 'list':
            return { schedules: listSchedules() };
        case 'run': {
            if (!params.scheduleId) throw new Error('scheduleId is required for run');
            return await runSchedule(params.scheduleId);
        }
        case 'remove': {
            if (!params.scheduleId) throw new Error('scheduleId is required for remove');
            const removed = removeSchedule(params.scheduleId);
            return { removed, scheduleId: params.scheduleId };
        }
        default:
            throw new Error(`Unknown action: ${action}. Use create, list, run, or remove.`);
    }
}

module.exports = { TOOL_DEF, handler, createSchedule, runSchedule, listSchedules, removeSchedule, clearAll };
