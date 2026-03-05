'use strict';

const http = require('http');

const MEMORY_URL = 'http://127.0.0.1:30002';

function request(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const req = http.request(`${MEMORY_URL}${urlPath}`, {
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
        req.setTimeout(30000, () => req.destroy(new Error('Memory request timed out')));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

/**
 * Store a memory for a given namespace (e.g., "job-seek:sessionId").
 * @param {string} namespace - Unique namespace for isolation
 * @param {string} text - Text to store
 * @param {object} [options] - Optional: role, metadata, llmConfig
 */
async function store(namespace, text, options = {}) {
    try {
        return await request('POST', '/memory/store', {
            namespace,
            text,
            role: options.role || 'user',
            metadata: options.metadata,
            llmConfig: options.llmConfig
        });
    } catch (err) {
        console.error('[memoryClient] store failed:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Search memories for a given namespace.
 * @param {string} namespace - Unique namespace
 * @param {string} query - Search query
 * @param {number} [topK=5] - Number of results
 */
async function search(namespace, query, topK = 5) {
    try {
        const result = await request('POST', '/memory/search', {
            namespace,
            query,
            topK
        });
        const memories = result?.results?.results || result?.results || [];
        return memories.map((m) => m.memory || m.text || '').filter(Boolean);
    } catch (err) {
        console.error('[memoryClient] search failed:', err.message);
        return [];
    }
}

/**
 * Clear all memories for a namespace.
 */
async function clear(namespace) {
    try {
        return await request('DELETE', '/memory/clear', { namespace });
    } catch (err) {
        console.error('[memoryClient] clear failed:', err.message);
        return { success: false, error: err.message };
    }
}

module.exports = { store, search, clear };
