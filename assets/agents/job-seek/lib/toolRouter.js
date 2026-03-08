'use strict';

/**
 * Tool Router — Parse tool calls from AI output, dispatch to toolService or local domain handlers.
 *
 * Supports two modes:
 *   1. CLI markers: [TOOL_CALL:name(param1=val1, param2="val2")]
 *   2. API tool_use: { type: 'tool_use', name, input } from Anthropic/OpenAI/Google
 *
 * Dispatches to:
 *   - toolService (:30004) for general tools (browser_*, http_*, page_*)
 *   - Local domain handlers for job-seek-specific tools (job_search, parse_listing, etc.)
 *
 * Max rounds: 10 (configurable) to prevent infinite tool-call loops.
 */

const toolServiceClient = require('./core/toolServiceClient');

const MAX_ROUNDS = 10;

// ─── Domain tool handlers (registered by domain modules) ───
const _domainHandlers = new Map();

/**
 * Register a local domain tool handler.
 * @param {string} name
 * @param {Function} handler - async (params) => result
 */
function registerDomainTool(name, handler) {
    _domainHandlers.set(name, handler);
}

/**
 * Unregister a domain tool.
 * @param {string} name
 */
function unregisterDomainTool(name) {
    _domainHandlers.delete(name);
}

/**
 * List all registered domain tools.
 * @returns {string[]}
 */
function listDomainTools() {
    return Array.from(_domainHandlers.keys());
}

/**
 * Clear all domain tool registrations.
 */
function clearDomainTools() {
    _domainHandlers.clear();
}

// ─── Marker parsing ───

/**
 * Parse [TOOL_CALL:name(params)] markers from AI text output.
 *
 * Supported formats:
 *   [TOOL_CALL:page_goto(url="https://example.com")]
 *   [TOOL_CALL:http_fetch(url="https://example.com", extract=true)]
 *   [TOOL_CALL:browser_launch(headless=true)]
 *   [TOOL_CALL:job_search(query="software engineer", location="Beijing")]
 *
 * @param {string} text - AI response text
 * @returns {{ toolCalls: Array<{name: string, params: object}>, cleanText: string }}
 */
function parseToolCallMarkers(text) {
    if (!text) return { toolCalls: [], cleanText: '' };

    const toolCalls = [];
    // Match [TOOL_CALL:name(params)] — params can contain nested quotes, commas
    const regex = /\[TOOL_CALL:(\w+)\(([^)]*)\)\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const name = match[1];
        const rawParams = match[2].trim();
        const params = parseParams(rawParams);
        toolCalls.push({ name, params });
    }

    // Remove markers from display text
    const cleanText = text.replace(/\[TOOL_CALL:\w+\([^)]*\)\]\s*/g, '').trim();

    return { toolCalls, cleanText };
}

/**
 * Parse key=value parameter pairs from marker content.
 * Handles: url="https://example.com", extract=true, retries=3
 *
 * @param {string} raw
 * @returns {object}
 */
function parseParams(raw) {
    if (!raw) return {};

    const params = {};
    // State machine parser for key=value pairs with quoted values
    let i = 0;
    const len = raw.length;

    while (i < len) {
        // Skip whitespace and commas
        while (i < len && (raw[i] === ' ' || raw[i] === ',')) i++;
        if (i >= len) break;

        // Read key
        let key = '';
        while (i < len && raw[i] !== '=') {
            key += raw[i];
            i++;
        }
        key = key.trim();
        if (!key || i >= len) break;
        i++; // skip '='

        // Skip whitespace
        while (i < len && raw[i] === ' ') i++;

        // Read value
        let value;
        if (raw[i] === '"' || raw[i] === "'") {
            // Quoted string
            const quote = raw[i];
            i++;
            let val = '';
            while (i < len && raw[i] !== quote) {
                if (raw[i] === '\\' && i + 1 < len) {
                    val += raw[i + 1];
                    i += 2;
                } else {
                    val += raw[i];
                    i++;
                }
            }
            i++; // skip closing quote
            value = val;
        } else {
            // Unquoted value — read until comma or end
            let val = '';
            while (i < len && raw[i] !== ',') {
                val += raw[i];
                i++;
            }
            val = val.trim();
            // Type coercion
            if (val === 'true') value = true;
            else if (val === 'false') value = false;
            else if (val === 'null') value = null;
            else if (/^-?\d+(\.\d+)?$/.test(val)) value = Number(val);
            else value = val;
        }

        params[key] = value;
    }

    return params;
}

// ─── Tool execution dispatch ───

/**
 * Execute a single tool call — dispatch to domain handler or toolService.
 * @param {string} name
 * @param {object} params
 * @returns {Promise<{ success: boolean, result?: any, error?: string }>}
 */
async function executeTool(name, params) {
    // Domain tools take priority
    if (_domainHandlers.has(name)) {
        try {
            const result = await _domainHandlers.get(name)(params);
            return { success: true, result };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // General tools → toolService
    try {
        return await toolServiceClient.executeTool(name, params);
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Execute all tool calls from a parsed AI response.
 * Returns results keyed by index.
 *
 * @param {Array<{name: string, params: object}>} toolCalls
 * @returns {Promise<Array<{ name: string, success: boolean, result?: any, error?: string }>>}
 */
async function executeAll(toolCalls) {
    const results = [];
    for (const tc of toolCalls) {
        const result = await executeTool(tc.name, tc.params);
        results.push({ name: tc.name, ...result });
    }
    return results;
}

/**
 * Format tool results for injection back into AI conversation.
 * @param {Array<{ name: string, success: boolean, result?: any, error?: string }>} results
 * @returns {string}
 */
function formatToolResults(results) {
    return results.map(r => {
        if (r.success) {
            const resultStr = typeof r.result === 'string' ? r.result : JSON.stringify(r.result, null, 2);
            // Truncate very long results
            const truncated = resultStr.length > 3000 ? resultStr.slice(0, 3000) + '\n... (truncated)' : resultStr;
            return `[TOOL_RESULT:${r.name}]\n${truncated}\n[/TOOL_RESULT]`;
        } else {
            return `[TOOL_ERROR:${r.name}]\n${r.error}\n[/TOOL_ERROR]`;
        }
    }).join('\n\n');
}

/**
 * Check if AI response contains tool calls (either marker or API format).
 * @param {string} text
 * @returns {boolean}
 */
function hasToolCalls(text) {
    if (!text) return false;
    return /\[TOOL_CALL:\w+\(/.test(text);
}

/**
 * Get available tool descriptions for AI prompt injection.
 * Fetches from both toolService and local domain handlers.
 * @returns {Promise<Array<{ name: string, description: string, parameters: object, category: string }>>}
 */
async function getAvailableTools() {
    const tools = [];

    // General tools from toolService
    try {
        const resp = await toolServiceClient.listTools();
        if (resp.success && resp.tools) {
            tools.push(...resp.tools);
        }
    } catch (_) {
        // toolService may not be running
    }

    // Domain tools (no descriptions stored — caller should provide via registerDomainTool)
    // Domain tools register with metadata in the future

    return tools;
}

module.exports = {
    // Marker parsing
    parseToolCallMarkers,
    parseParams,
    hasToolCalls,

    // Execution
    executeTool,
    executeAll,
    formatToolResults,

    // Domain tool registration
    registerDomainTool,
    unregisterDomainTool,
    listDomainTools,
    clearDomainTools,

    // Tool discovery
    getAvailableTools,

    // Constants
    MAX_ROUNDS
};
