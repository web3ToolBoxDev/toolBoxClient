'use strict';

const http = require('http');

const BASE_URL = 'http://127.0.0.1:30002';

function request(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const req = http.request(`${BASE_URL}${urlPath}`, {
            method,
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { resolve(data); }
            });
        });
        req.on('error', (err) => reject(err));
        req.setTimeout(15000, () => req.destroy(new Error('Knowledge request timed out')));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

/**
 * Upsert a document into the knowledge store.
 * @param {object} doc - { refId?, type, subType?, content, summary?, tags?, source?, ... }
 * @returns {Promise<{success: boolean, refId: string}>}
 */
async function upsert(doc) {
    try {
        return await request('POST', '/knowledge/upsert', doc);
    } catch (err) {
        console.error('[knowledgeClient] upsert failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Full-text search across knowledge store.
 * @param {string} query - Search keywords
 * @param {string[]} [types] - Filter by document types
 * @param {number} [limit=10]
 * @returns {Promise<Array<{doc: object, rank: number}>>}
 */
async function search(query, types, limit = 10) {
    try {
        const result = await request('POST', '/knowledge/search', { query, types, limit });
        return result?.results || [];
    } catch (err) {
        console.error('[knowledgeClient] search failed:', err.message);
        return [];
    }
}

/**
 * Find documents by refId, type, tags, or scope.
 * @param {object} criteria - { refId?, type?, subType?, tags?, scope? }
 * @returns {Promise<object[]>}
 */
async function find(criteria) {
    try {
        const result = await request('POST', '/knowledge/find', criteria);
        return result?.results || [];
    } catch (err) {
        console.error('[knowledgeClient] find failed:', err.message);
        return [];
    }
}

/**
 * Expand matched types to fetch all related documents.
 * E.g., if search hits a 'direction' doc, expand to also fetch all 'profile' docs.
 * @param {string[]} types - Types found in search hits
 * @returns {Promise<object[]>}
 */
async function expand(types) {
    try {
        const result = await request('POST', '/knowledge/expand', { types });
        return result?.results || [];
    } catch (err) {
        console.error('[knowledgeClient] expand failed:', err.message);
        return [];
    }
}

/**
 * Remove documents by refId or type.
 * @param {object} criteria - { refId? } or { type?, scope? }
 */
async function remove(criteria) {
    try {
        return await request('DELETE', '/knowledge/remove', criteria);
    } catch (err) {
        console.error('[knowledgeClient] remove failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Promote a candidate document to current.
 * @param {string} refId
 */
async function promote(refId) {
    try {
        return await request('POST', '/knowledge/promote', { refId });
    } catch (err) {
        console.error('[knowledgeClient] promote failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Get audit log for a document.
 * @param {string} refId
 * @param {number} [limit=50]
 */
async function audit(refId, limit = 50) {
    try {
        const result = await request('POST', '/knowledge/audit', { refId, limit });
        return result?.results || [];
    } catch (err) {
        console.error('[knowledgeClient] audit failed:', err.message);
        return [];
    }
}

/**
 * Walk scope hierarchy, return first matching document.
 * @param {string} type
 * @param {string} subType
 * @param {string[]} scopes
 */
async function resolve(type, subType, scopes) {
    try {
        const result = await request('POST', '/knowledge/resolve', { type, subType, scopes });
        return result?.result || null;
    } catch (err) {
        console.error('[knowledgeClient] resolve failed:', err.message);
        return null;
    }
}

/**
 * Find fresh (non-stale) documents.
 * @param {string} type
 * @param {string} [scope]
 * @param {number} [maxAgeDays=30]
 */
async function findFresh(type, scope, maxAgeDays = 30) {
    try {
        const result = await request('POST', '/knowledge/fresh', { type, scope, maxAgeDays });
        return result?.results || [];
    } catch (err) {
        console.error('[knowledgeClient] findFresh failed:', err.message);
        return [];
    }
}

/**
 * Register a domain pack with the knowledge store.
 * @param {string} domain - Domain name (e.g., 'job-seek')
 * @param {object} types - Type definitions to register
 * @returns {Promise<{success: boolean}>}
 */
async function registerPack(domain, types) {
    try {
        return await request('POST', '/knowledge/register-pack', { domain, types });
    } catch (err) {
        console.error('[knowledgeClient] registerPack failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Detect intent from user question and map to document types.
 * When FTS keyword search fails (questions don't contain data keywords),
 * this routes to the right documents based on what the user is asking about.
 */
const INTENT_RULES = [
    { pattern: /who\s+(am|are)\s+i|my\s+name|我是谁|我的名字|个人|简介|about\s+me/i, types: ['profile'] },
    { pattern: /skill|技[能术]|proficien|tech|stack|会什么|擅长|能力/i, types: ['profile'] },
    { pattern: /experience|work|job|career|经[历验]|工作|职[位业]/i, types: ['profile'] },
    { pattern: /education|school|degree|university|学[历校]|教育/i, types: ['profile'] },
    { pattern: /resume|简历|CV|generate|生成|draft|草稿/i, types: ['profile', 'direction'] },
    { pattern: /direction|方向|track|目标|target|岗位/i, types: ['direction', 'profile'] },
    { pattern: /match|匹配|compare|对比|JD|job\s*description|职位描述/i, types: ['profile', 'job_listing'] },
    { pattern: /prefer|偏好|remote|远程|salary|薪[资水]/i, types: ['preference', 'direction'] },
];

function detectIntent(query) {
    for (const rule of INTENT_RULES) {
        if (rule.pattern.test(query)) return rule.types;
    }
    return null;
}

/**
 * Combined search: FTS keyword search → intent detection → type expansion → full context.
 * This is the main query method for the agent.
 * @param {string} query - User question
 * @returns {Promise<{docs: object[], source: string}>}
 */
async function searchAndExpand(query) {
    // Step 1: FTS keyword search
    const hits = await search(query, null, 5);
    if (hits.length > 0) {
        const matchedTypes = [...new Set(hits.map(h => h.doc?.type).filter(Boolean))];
        console.log(`[knowledgeClient] FTS hit types: ${matchedTypes.join(', ')}`);
        const expanded = await expand(matchedTypes);
        return { docs: expanded, source: 'fts' };
    }

    // Step 2: Intent detection — map question to document types
    const intentTypes = detectIntent(query);
    if (intentTypes) {
        console.log(`[knowledgeClient] Intent detected: ${intentTypes.join(', ')}`);
        const expanded = await expand(intentTypes);
        if (expanded.length > 0) {
            return { docs: expanded, source: 'intent' };
        }
    }

    return { docs: [], source: 'none' };
}

module.exports = { upsert, search, find, expand, remove, promote, audit, resolve, findFresh, registerPack, searchAndExpand, detectIntent };
