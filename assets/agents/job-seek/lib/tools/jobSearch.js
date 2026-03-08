'use strict';

/**
 * job_search domain tool — Registered as a domain tool in toolRouter.
 * AI invokes this to search for jobs based on user's direction/query.
 *
 * Flow: query → Indeed adapter → normalize → deduplicate → return results
 */

const indeed = require('../sources/indeed');

/**
 * Tool definition for registration.
 */
const TOOL_DEF = {
    name: 'job_search',
    description: 'Search for job listings based on query, location, and filters. Returns structured job listings with title, company, location, salary, and URL.',
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Job title or keywords to search for' },
            location: { type: 'string', description: 'Location to search in (city, state, country)' },
            maxResults: { type: 'number', description: 'Maximum number of results to return (default 10)' },
            source: { type: 'string', description: 'Job source to use: indeed (default)' }
        },
        required: ['query']
    },
    category: 'job-seek'
};

/**
 * Execute job search.
 * @param {object} params
 * @param {string} params.query
 * @param {string} [params.location]
 * @param {number} [params.maxResults=10]
 * @param {string} [params.source='indeed']
 * @returns {Promise<object>}
 */
async function handler({ query, location, maxResults = 10, source = 'indeed' }) {
    if (!query) {
        throw new Error('query is required');
    }

    let results;

    switch (source) {
        case 'indeed':
        default:
            results = await indeed.search({ query, location, maxResults });
            break;
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
        source: results.method === 'browser' ? `${source} (browser)` : source,
        totalFound: deduped.length,
        listings: deduped.slice(0, maxResults)
    };
}

module.exports = { TOOL_DEF, handler };
