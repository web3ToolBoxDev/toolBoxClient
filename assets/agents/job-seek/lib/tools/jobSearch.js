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

const TOOL_DEF = {
    name: 'job_search',
    description: 'Search for job listings based on query, location, and filters. Returns structured job listings with title, company, location, salary, and URL. Supports multiple sources: indeed, google, all (tries all sources).',
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Job title or keywords to search for' },
            location: { type: 'string', description: 'Location to search in (city, state, country)' },
            maxResults: { type: 'number', description: 'Maximum number of results to return (default 10)' },
            source: { type: 'string', description: 'Job source: indeed, google, all (default: all — tries all sources with fallback)' }
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
 * Execute job search with multi-source fallback.
 */
async function handler({ query, location, maxResults = 10, source = 'all' }) {
    if (!query) throw new Error('query is required');

    let results = null;
    let usedSource = source;

    if (source === 'all') {
        // Try each source in order until we get results
        for (const [name] of Object.entries(SOURCES)) {
            results = await searchSource(name, { query, location, maxResults });
            if (results && results.listings.length > 0) {
                usedSource = name;
                break;
            }
        }
        if (!results) {
            // All sources failed — return empty
            return { query, location: location || 'any', source: 'all (failed)', totalFound: 0, listings: [] };
        }
    } else {
        results = await searchSource(source, { query, location, maxResults });
        if (!results) {
            // Primary source failed, try fallback
            for (const [name] of Object.entries(SOURCES)) {
                if (name === source) continue;
                results = await searchSource(name, { query, location, maxResults });
                if (results && results.listings.length > 0) {
                    usedSource = `${source}→${name}`;
                    break;
                }
            }
        }
        if (!results) {
            return { query, location: location || 'any', source: `${source} (failed)`, totalFound: 0, listings: [] };
        }
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
