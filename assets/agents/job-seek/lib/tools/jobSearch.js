'use strict';

/**
 * job_search domain tool — Multi-source job search with fallback.
 *
 * Sources (in fallback order):
 *   1. indeed   — Indeed HTTP scraping → browser fallback
 *   2. google   — Google search for job URLs
 *   3. direct   — Direct HTTP fetch of known job board search pages
 *
 * If the primary source fails, automatically tries the next.
 */

const indeed = require('../sources/indeed');
const google = require('../sources/google');
const linkedin = require('../sources/linkedin');
const jobbank = require('../sources/jobbank');
const { getSourcesForLocation } = require('../sources/locationSources');

const TOOL_DEF = {
    name: 'job_search',
    description: 'Search for job listings based on query, location, and filters. Returns structured job listings with title, company, location, salary, and URL. Supports multiple sources: indeed, google, linkedin, jobbank, all (tries all sources based on location).',
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Job title or keywords to search for' },
            location: { type: 'string', description: 'Location to search in (city, state, country)' },
            maxResults: { type: 'number', description: 'Maximum number of results to return (default 10)' },
            source: { type: 'string', description: 'Job source: indeed, google, linkedin, jobbank, all (default: all — auto-selects sources based on location)' },
            envId: { type: 'string', description: 'Fingerprint browser environment ID for anti-detection scraping' }
        },
        required: ['query']
    },
    category: 'job-seek'
};

/**
 * Source adapters in priority order.
 */
const SOURCES = {
    indeed: { adapter: indeed, label: 'indeed' },
    linkedin: { adapter: linkedin, label: 'linkedin' },
    jobbank: { adapter: jobbank, label: 'jobbank' },
    google: { adapter: google, label: 'google' }
};

/**
 * Search a single source, returning results or null on failure.
 */
async function searchSource(name, params) {
    const src = SOURCES[name];
    if (!src) return null;

    try {
        const result = await src.adapter.search(params);
        if (result.listings && result.listings.length > 0) {
            return {
                ...result,
                listings: result.listings.map(l => ({ ...l, source: l.source || name }))
            };
        }
        return null;
    } catch (err) {
        console.log(`[jobSearch] ${name} search failed: ${err.message}`);
        return null;
    }
}

/**
 * Get ordered source list for a search.
 * When source='all', uses location-based selection.
 * When source is specific, returns that source (with fallbacks).
 */
function getSourceOrder(source, location) {
    if (source === 'all') {
        return getSourcesForLocation(location);
    }
    // Specific source requested — try it first, then fallback to others
    const all = Object.keys(SOURCES);
    return [source, ...all.filter(s => s !== source)];
}

/**
 * Execute job search with multi-source fallback.
 */
async function handler({ query, location, maxResults = 10, source = 'all', envId }) {
    if (!query) throw new Error('query is required');

    let results = null;
    let usedSource = source;

    // Get source order based on location (or specific source with fallbacks)
    const sourceOrder = getSourceOrder(source, location);
    const searchParams = { query, location, maxResults };
    if (envId) searchParams.envId = envId;

    // Try sources in order until we get results
    for (const name of sourceOrder) {
        results = await searchSource(name, searchParams);
        if (results && results.listings.length > 0) {
            usedSource = (source !== 'all' && name !== source)
                ? `${source}→${name}` : name;
            break;
        }
    }

    if (!results) {
        return {
            query,
            location: location || 'any',
            source: `${source} (failed)`,
            sourceOrder,
            totalFound: 0,
            listings: []
        };
    }

    // Deduplicate by URL
    const seen = new Set();
    const deduped = results.listings.filter(l => {
        if (!l.url || seen.has(l.url)) return false;
        seen.add(l.url);
        return true;
    });

    return {
        query,
        location: location || 'any',
        source: usedSource,
        totalFound: deduped.length,
        listings: deduped.slice(0, maxResults)
    };
}

module.exports = { TOOL_DEF, handler, SOURCES };
