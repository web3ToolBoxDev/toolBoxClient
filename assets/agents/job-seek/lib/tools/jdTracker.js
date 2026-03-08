'use strict';

/**
 * jd_tracker domain tool — Monitor saved job listings for changes.
 *
 * Periodically re-fetches saved job URLs, compares content,
 * and reports updates, removals, or salary changes.
 */

const knowledgeClient = require('../core/knowledgeClient');
const toolServiceClient = require('../core/toolServiceClient');

const TOOL_DEF = {
    name: 'jd_tracker',
    description: 'Track changes to saved job listings. Detects updated descriptions, removed listings, or salary changes.',
    parameters: {
        type: 'object',
        properties: {
            action: { type: 'string', description: 'Action: track | check | list_changes' },
            jobUrl: { type: 'string', description: 'Job URL to track (for track action)' },
            scope: { type: 'string', description: 'Knowledge store scope (default user:global)' }
        },
        required: ['action']
    },
    category: 'job-seek'
};

// In-memory change log
const _changes = new Map(); // jobUrl → Array<ChangeEntry>

/**
 * Compare two job listing objects and return list of changes.
 * @param {object} oldListing
 * @param {object} newListing
 * @returns {Array<{field: string, old: any, new: any}>}
 */
function diffListings(oldListing, newListing) {
    const changes = [];
    const fields = ['title', 'company', 'location', 'salary', 'description', 'requirements'];

    for (const field of fields) {
        const oldVal = oldListing[field] || '';
        const newVal = newListing[field] || '';
        if (typeof oldVal === 'string' && typeof newVal === 'string') {
            if (oldVal.trim() !== newVal.trim()) {
                changes.push({ field, old: oldVal, new: newVal });
            }
        } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes.push({ field, old: oldVal, new: newVal });
        }
    }

    return changes;
}

/**
 * Fetch the current state of a job listing from the web.
 * @param {string} url
 * @returns {Promise<object|null>}
 */
async function fetchCurrentListing(url) {
    try {
        const result = await toolServiceClient.executeTool('http_extract', {
            url,
            selectors: {
                title: 'h1, .job-title, [data-testid="jobTitle"]',
                company: '.company, .employer, [data-testid="company"]',
                location: '.location, [data-testid="location"]',
                salary: '.salary, .compensation, [data-testid="salary"]',
                description: '.description, .job-description, [data-testid="description"]'
            }
        });

        if (result.success) {
            return {
                url,
                title: result.result?.title || '',
                company: result.result?.company || '',
                location: result.result?.location || '',
                salary: result.result?.salary || '',
                description: result.result?.description || '',
                fetchedAt: new Date().toISOString()
            };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Check a single job listing for changes.
 * @param {string} jobUrl
 * @param {string} scope
 * @returns {Promise<object>}
 */
async function checkJob(jobUrl, scope = 'user:global') {
    // Find stored listing
    const stored = await knowledgeClient.find({ type: 'job_listing', scope });
    const existing = stored.find(d => (d.content?.url || '') === jobUrl);

    if (!existing) {
        return { jobUrl, status: 'not_tracked', message: 'Job not found in knowledge store' };
    }

    // Fetch current listing
    const current = await fetchCurrentListing(jobUrl);

    if (!current) {
        // Page couldn't be loaded — possibly removed
        const entry = { type: 'possibly_removed', detectedAt: new Date().toISOString(), jobUrl };
        addChangeEntry(jobUrl, entry);
        return { jobUrl, status: 'possibly_removed', message: 'Could not fetch listing — may have been removed' };
    }

    // Compare
    const diffs = diffListings(existing.content || {}, current);

    if (diffs.length === 0) {
        return { jobUrl, status: 'unchanged', message: 'No changes detected' };
    }

    // Record changes
    const entry = {
        type: 'updated',
        detectedAt: new Date().toISOString(),
        jobUrl,
        changes: diffs
    };
    addChangeEntry(jobUrl, entry);

    // Update stored listing
    await knowledgeClient.upsert({
        refId: existing.refId,
        type: 'job_listing',
        content: { ...existing.content, ...current },
        summary: existing.summary,
        tags: existing.tags,
        scope,
        source: 'jd_tracker'
    });

    return {
        jobUrl,
        status: 'updated',
        changes: diffs,
        message: `${diffs.length} field(s) changed: ${diffs.map(d => d.field).join(', ')}`
    };
}

/**
 * Add a change entry to the log.
 */
function addChangeEntry(jobUrl, entry) {
    if (!_changes.has(jobUrl)) {
        _changes.set(jobUrl, []);
    }
    _changes.get(jobUrl).push(entry);
}

/**
 * Get all recorded changes.
 */
function getChanges(jobUrl) {
    if (jobUrl) return _changes.get(jobUrl) || [];
    const all = [];
    for (const [url, entries] of _changes) {
        for (const entry of entries) {
            all.push({ ...entry, jobUrl: url });
        }
    }
    return all.sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt));
}

/**
 * Clear changes (for testing).
 */
function clearChanges() {
    _changes.clear();
}

/**
 * Handler for the domain tool.
 */
async function handler(params) {
    const { action, jobUrl, scope = 'user:global' } = params;

    switch (action) {
        case 'track':
            if (!jobUrl) throw new Error('jobUrl is required for track action');
            return await checkJob(jobUrl, scope);
        case 'check':
            if (!jobUrl) throw new Error('jobUrl is required for check action');
            return await checkJob(jobUrl, scope);
        case 'list_changes':
            return { changes: getChanges(jobUrl) };
        default:
            throw new Error(`Unknown action: ${action}. Use track, check, or list_changes.`);
    }
}

module.exports = { TOOL_DEF, handler, diffListings, checkJob, getChanges, clearChanges, fetchCurrentListing };
