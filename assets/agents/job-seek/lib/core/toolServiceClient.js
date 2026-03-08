'use strict';

/**
 * toolServiceClient — HTTP client for toolService (:30004).
 * Used by toolRouter to dispatch general tool calls (browser, http, captcha).
 */

const http = require('http');

const TOOL_SERVICE_URL = process.env.TOOL_SERVICE_URL || 'http://127.0.0.1:30004';

/**
 * Make an HTTP request to toolService.
 * @param {string} method
 * @param {string} path
 * @param {object} [body]
 * @param {number} [timeout=30000]
 * @returns {Promise<object>}
 */
function request(method, path, body, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, TOOL_SERVICE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method,
            headers: { 'Content-Type': 'application/json' },
            timeout
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (_) {
                    resolve({ success: false, error: `Invalid JSON: ${data.slice(0, 200)}` });
                }
            });
        });

        req.on('error', (err) => {
            reject(new Error(`toolService request failed: ${err.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`toolService request timed out after ${timeout}ms`));
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

/**
 * Execute a tool via toolService.
 * @param {string} name - Tool name
 * @param {object} params - Tool parameters
 * @returns {Promise<object>} - { success, result } or { success: false, error }
 */
async function executeTool(name, params) {
    return request('POST', '/tools/execute', { name, params });
}

/**
 * List all tools registered in toolService.
 * @returns {Promise<object>} - { success, tools: [...] }
 */
async function listTools() {
    return request('GET', '/tools/list');
}

/**
 * Check toolService health.
 * @returns {Promise<object>}
 */
async function health() {
    return request('GET', '/health');
}

module.exports = { request, executeTool, listTools, health };
