'use strict';

/**
 * stateApi.js — HTTP + SSE client for agent ↔ stateService communication.
 *
 * Phase C: Replaces sessionStore.load/save and StateClient WS protocol
 * with plain HTTP CRUD + SSE subscriptions.
 *
 * Uses Node.js built-in `http` module (no external dependencies for HTTP).
 * SSE client is implemented with `http` module as well (no eventsource package).
 */

const http = require('http');

const BASE_URL = 'http://localhost:30001/api/state';
const AGENT_ID = 'jobSeekAgent';
const LOG_PREFIX = '[agent:stateApi]';

// ─── HTTP helpers ───────────────────────────────────────────

/**
 * Make an HTTP request and return parsed JSON.
 * @param {string} method - GET, POST, DELETE
 * @param {string} urlPath - path after /api/state (e.g. /sessions/jobSeekAgent)
 * @param {Object} [body] - JSON body for POST/DELETE
 * @param {number} [timeoutMs=5000] - request timeout
 * @returns {Promise<Object>} parsed response body
 */
function request(method, urlPath, body = null, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE_URL + urlPath);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: { 'Content-Type': 'application/json' },
            timeout: timeoutMs
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (err) {
                    reject(new Error(`${LOG_PREFIX} Invalid JSON response: ${data.slice(0, 200)}`));
                }
            });
        });

        req.on('error', (err) => {
            reject(new Error(`${LOG_PREFIX} HTTP ${method} ${urlPath} failed: ${err.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`${LOG_PREFIX} HTTP ${method} ${urlPath} timed out after ${timeoutMs}ms`));
        });

        if (body !== null) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

/**
 * Retry wrapper for HTTP requests.
 * @param {Function} fn - async function to retry
 * @param {number} [maxAttempts=3]
 * @param {number} [delayMs=1000]
 * @returns {Promise<*>}
 */
async function withRetry(fn, maxAttempts = 3, delayMs = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < maxAttempts) {
                console.warn(`${LOG_PREFIX} Attempt ${attempt}/${maxAttempts} failed: ${err.message}, retrying in ${delayMs}ms...`);
                await new Promise(r => setTimeout(r, delayMs));
            }
        }
    }
    throw lastError;
}

// ─── Session CRUD ───────────────────────────────────────────

/**
 * Fetch all sessions from stateService.
 * @returns {Promise<{sessions: Array, activeSessionId: string|null}>}
 */
async function fetchSessions() {
    const res = await withRetry(() => request('GET', `/sessions/${AGENT_ID}`));
    if (!res.success) {
        throw new Error(`${LOG_PREFIX} fetchSessions failed: ${res.message || 'unknown error'}`);
    }
    return res.data;
}

/**
 * Fetch a single session by ID.
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
async function fetchSession(sessionId) {
    const res = await request('GET', `/sessions/${AGENT_ID}/${sessionId}`);
    if (!res.success) return null;
    return res.data;
}

/**
 * Create a new session via stateService.
 * @param {string} [name]
 * @returns {Promise<Object>} the created session
 */
async function createSession(name) {
    const res = await request('POST', `/sessions/${AGENT_ID}`, { name });
    if (!res.success) {
        throw new Error(`${LOG_PREFIX} createSession failed: ${res.message || 'unknown error'}`);
    }
    return res.data;
}

/**
 * Delete a session via stateService.
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
async function deleteSession(sessionId) {
    const res = await request('DELETE', `/sessions/${AGENT_ID}/${sessionId}`);
    return res.success === true;
}

/**
 * Switch active session via stateService.
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
async function switchSession(sessionId) {
    const res = await request('POST', `/sessions/${AGENT_ID}/switch`, { sessionId });
    return res.success === true;
}

// ─── State get/set ──────────────────────────────────────────

/**
 * Get full agent snapshot from stateService.
 * @returns {Promise<Object>}
 */
async function fetchSnapshot() {
    const res = await request('GET', `/${AGENT_ID}`);
    if (!res.success) {
        throw new Error(`${LOG_PREFIX} fetchSnapshot failed: ${res.message || 'unknown error'}`);
    }
    return res.data;
}

/**
 * Get a value at a dot-path from stateService.
 * @param {string} dotPath - e.g. 'conversations.session_123'
 * @returns {Promise<*>}
 */
async function getState(dotPath) {
    const urlPath = `/${AGENT_ID}/${dotPath.replace(/\./g, '/')}`;
    const res = await request('GET', urlPath);
    if (!res.success) {
        throw new Error(`${LOG_PREFIX} getState(${dotPath}) failed: ${res.message || 'unknown error'}`);
    }
    return res.data;
}

/**
 * Set a value at a dot-path via stateService.
 * @param {string} dotPath - e.g. 'conversations.session_123'
 * @param {*} value
 * @returns {Promise<void>}
 */
async function setState(dotPath, value) {
    const res = await request('POST', `/${AGENT_ID}/set`, { path: dotPath, value });
    if (!res.success) {
        throw new Error(`${LOG_PREFIX} setState(${dotPath}) failed: ${res.message || 'unknown error'}`);
    }
}

/**
 * Batch set multiple state paths at once.
 * @param {Array<{path: string, value: *}>} entries
 * @returns {Promise<void>}
 */
async function batchSetState(entries) {
    // stateService doesn't have a batch endpoint, so we fire in parallel
    await Promise.all(entries.map(({ path, value }) => setState(path, value)));
}

/**
 * Delete a value at a dot-path via stateService.
 * @param {string} dotPath
 * @returns {Promise<boolean>}
 */
async function deleteState(dotPath) {
    const res = await request('DELETE', `/${AGENT_ID}`, { path: dotPath });
    return res.success === true;
}

// ─── Bulk push (migration) ──────────────────────────────────

/**
 * Push full agent state to stateService (used for initial migration from sessionStore).
 * Uses the generic set endpoint to populate all persisted keys.
 * @param {Object} stateData - the full agent state object
 * @param {Array<string>} keys - keys to push
 * @returns {Promise<void>}
 */
async function pushFullState(stateData, keys) {
    console.log(`${LOG_PREFIX} Pushing ${keys.length} state keys to stateService...`);
    const entries = [];
    for (const key of keys) {
        if (stateData[key] !== undefined) {
            entries.push({ path: key, value: stateData[key] });
        }
    }
    // Push in batches of 5 to avoid overwhelming the server
    const BATCH_SIZE = 5;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        await batchSetState(batch);
    }
    console.log(`${LOG_PREFIX} Pushed ${entries.length} keys to stateService`);
}

// ─── SSE subscription ───────────────────────────────────────

/**
 * Connect to the stateService SSE endpoint.
 * Implements reconnection with exponential backoff.
 *
 * @param {Object} options
 * @param {string} [options.topics='sessions,app'] - comma-separated topics
 * @param {Function} options.onEvent - called with {topic, path, value, op, timestamp}
 * @param {Function} [options.onConnect] - called when SSE connection is established
 * @param {Function} [options.onError] - called on connection error
 * @returns {{ close: Function }} — call close() to disconnect
 */
function subscribeSSE(options = {}) {
    const {
        topics = 'sessions,app',
        onEvent,
        onConnect,
        onError
    } = options;

    let destroyed = false;
    let currentReq = null;
    let reconnectTimer = null;
    let reconnectDelay = 1000; // exponential backoff starting at 1s
    const MAX_RECONNECT_DELAY = 30000;

    function connect() {
        if (destroyed) return;

        const url = new URL(`${BASE_URL}/subscribe?topics=${encodeURIComponent(topics)}`);
        const reqOptions = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: 'GET',
            headers: { 'Accept': 'text/event-stream' }
        };

        console.log(`${LOG_PREFIX} SSE connecting to ${url.pathname}${url.search}`);

        currentReq = http.request(reqOptions, (res) => {
            if (res.statusCode !== 200) {
                console.error(`${LOG_PREFIX} SSE unexpected status: ${res.statusCode}`);
                res.resume(); // drain
                scheduleReconnect();
                return;
            }

            // Connected successfully — reset backoff
            reconnectDelay = 1000;
            console.log(`${LOG_PREFIX} SSE connected`);
            if (onConnect) onConnect();

            res.setEncoding('utf-8');

            let buffer = '';
            let currentEvent = '';
            let currentData = '';

            res.on('data', (chunk) => {
                buffer += chunk;
                // Parse SSE protocol: lines separated by \n
                const lines = buffer.split('\n');
                // Keep incomplete last line in buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        currentEvent = line.slice(7).trim();
                    } else if (line.startsWith('data: ')) {
                        currentData = line.slice(6);
                    } else if (line === '' && currentEvent) {
                        // Empty line = end of event
                        if (currentEvent === 'state_change' && currentData && onEvent) {
                            try {
                                const parsed = JSON.parse(currentData);
                                onEvent(parsed);
                            } catch (err) {
                                console.warn(`${LOG_PREFIX} SSE parse error: ${err.message}`);
                            }
                        }
                        // Reset for next event
                        currentEvent = '';
                        currentData = '';
                    } else if (line.startsWith(':')) {
                        // SSE comment (heartbeat) — ignore
                    }
                }
            });

            res.on('end', () => {
                console.log(`${LOG_PREFIX} SSE connection ended`);
                if (!destroyed) scheduleReconnect();
            });

            res.on('error', (err) => {
                console.error(`${LOG_PREFIX} SSE stream error: ${err.message}`);
                if (onError) onError(err);
                if (!destroyed) scheduleReconnect();
            });
        });

        currentReq.on('error', (err) => {
            console.error(`${LOG_PREFIX} SSE request error: ${err.message}`);
            if (onError) onError(err);
            if (!destroyed) scheduleReconnect();
        });

        currentReq.end();
    }

    function scheduleReconnect() {
        if (destroyed) return;
        console.log(`${LOG_PREFIX} SSE reconnecting in ${reconnectDelay}ms...`);
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, reconnectDelay);
        // Exponential backoff with cap
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    }

    function close() {
        destroyed = true;
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (currentReq) {
            try { currentReq.destroy(); } catch {}
            currentReq = null;
        }
        console.log(`${LOG_PREFIX} SSE closed`);
    }

    // Start connection
    connect();

    return { close };
}

// ─── Health check ───────────────────────────────────────────

/**
 * Check if stateService is reachable.
 * @param {number} [timeoutMs=2000]
 * @returns {Promise<boolean>}
 */
async function isAvailable(timeoutMs = 2000) {
    try {
        await request('GET', `/app/language`, null, timeoutMs);
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    fetchSessions,
    fetchSession,
    createSession,
    deleteSession,
    switchSession,
    fetchSnapshot,
    getState,
    setState,
    batchSetState,
    deleteState,
    pushFullState,
    subscribeSSE,
    isAvailable,
    // Exposed for testing
    _request: request,
    _withRetry: withRetry,
    AGENT_ID,
    LOG_PREFIX
};
