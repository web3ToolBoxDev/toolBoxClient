'use strict';

const http = require('http');

/**
 * Fetch env (fingerprint) data from main backend by ID.
 * Extracted as shared utility to avoid circular deps between index.js and browserTools.js.
 * @param {string} envId
 * @returns {Promise<object|null>}
 */
async function fetchEnvById(envId) {
    const backendPort = process.env.BACKEND_PORT || '30001';
    return new Promise((resolve) => {
        http.get(`http://127.0.0.1:${backendPort}/api/getEnvById/${envId}`, (resp) => {
            let data = '';
            resp.on('data', chunk => data += chunk);
            resp.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const env = parsed.data || parsed;
                    if (env && (env.id || env._id)) {
                        if (!env.id) env.id = env._id;
                        resolve(env);
                    } else {
                        resolve(null);
                    }
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

module.exports = { fetchEnvById };
