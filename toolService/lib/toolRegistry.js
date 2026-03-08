'use strict';

/**
 * Tool Registry — register, list, and execute tools.
 * Tools can be registered by toolService built-ins or by agents via HTTP.
 */

const _tools = new Map();

/**
 * Register a tool.
 * @param {object} def
 * @param {string} def.name - Unique tool name (e.g. 'page_goto')
 * @param {string} def.description - What the tool does (shown to AI)
 * @param {object} def.parameters - JSON Schema for parameters
 * @param {function} def.handler - async (params) => result
 * @param {string} [def.category] - 'browser' | 'http' | 'captcha' | 'domain'
 */
function register(def) {
    if (!def.name) throw new Error('Tool name is required');
    if (!def.handler || typeof def.handler !== 'function') {
        throw new Error(`Tool "${def.name}": handler must be a function`);
    }
    _tools.set(def.name, {
        name: def.name,
        description: def.description || '',
        parameters: def.parameters || {},
        handler: def.handler,
        category: def.category || 'general'
    });
}

/**
 * List all registered tools (without handlers — safe for API response).
 * @returns {object[]}
 */
function list() {
    return Array.from(_tools.values()).map(({ name, description, parameters, category }) => ({
        name, description, parameters, category
    }));
}

/**
 * Execute a tool by name.
 * @param {string} name
 * @param {object} params
 * @returns {Promise<{ success: boolean, result?: any, error?: string }>}
 */
async function execute(name, params = {}) {
    const tool = _tools.get(name);
    if (!tool) {
        return { success: false, error: `Unknown tool: ${name}` };
    }
    try {
        const result = await tool.handler(params);
        return { success: true, result };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Check if a tool is registered.
 * @param {string} name
 * @returns {boolean}
 */
function has(name) {
    return _tools.has(name);
}

/**
 * Remove a tool.
 * @param {string} name
 */
function unregister(name) {
    _tools.delete(name);
}

/**
 * Clear all tools (for testing).
 */
function clear() {
    _tools.clear();
}

module.exports = { register, list, execute, has, unregister, clear };
