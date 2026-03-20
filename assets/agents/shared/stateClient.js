/**
 * StateClient — Agent-side SDK for unified state management.
 *
 * Runs inside agent child processes. Communicates with the main-process
 * StateService via WebSocket messages (state_sync_*).
 *
 * Usage in agent code:
 *   const { StateClient } = require('../shared/stateClient');
 *   const stateClient = new StateClient(ws, 'job-seek');
 *   stateClient.state.direction = { jobTitle: 'Engineer' }; // auto-syncs
 *   stateClient.set('session.config.timeout', 5000);        // deep set
 *   stateClient.merge('session.config', { retries: 3 });    // deep merge
 */

// ─── Helpers ───────────────────────────────────────────────

function getByPath(obj, dotPath) {
    if (!dotPath) return obj;
    const parts = dotPath.split('.');
    let current = obj;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[part];
    }
    return current;
}

function setByPath(obj, dotPath, value) {
    const parts = dotPath.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] == null || typeof current[part] !== 'object') {
            current[part] = {};
        }
        current = current[part];
    }
    current[parts[parts.length - 1]] = value;
}

function deepClone(obj) {
    if (obj === undefined) return undefined;
    return JSON.parse(JSON.stringify(obj));
}

// ─── StateClient ───────────────────────────────────────────

class StateClient {
    /**
     * @param {Object} ws - WebSocket connection (must have .send(string) method)
     * @param {string} agentName - agent identifier (e.g. 'job-seek')
     */
    constructor(ws, agentName) {
        this._ws = ws;
        this._agentName = agentName;
        this._data = {};        // local state cache
        this._batching = false; // true during batch()
        this._batchOps = [];    // collected ops during batch

        // Create shallow Proxy for `state` property
        this.state = this._createProxy();
    }

    // ── Proxy ──

    /**
     * Create a shallow Proxy that intercepts top-level property sets
     * and sends state_sync_set messages to the server.
     */
    _createProxy() {
        const self = this;
        return new Proxy(this._data, {
            get(target, prop) {
                if (typeof prop === 'symbol') return target[prop];
                return target[prop];
            },
            set(target, prop, value) {
                if (typeof prop === 'symbol') {
                    target[prop] = value;
                    return true;
                }
                const cloned = deepClone(value);
                target[prop] = cloned;
                self._sendSet(String(prop), cloned);
                return true;
            },
            deleteProperty(target, prop) {
                if (typeof prop === 'symbol') {
                    delete target[prop];
                    return true;
                }
                delete target[prop];
                self._sendPatch({ op: 'delete', path: String(prop) });
                return true;
            }
        });
    }

    // ── Public API ──

    /**
     * Explicit deep set — for paths deeper than one level.
     * @param {string} dotPath - e.g. 'session.config.timeout'
     * @param {*} value
     */
    set(dotPath, value) {
        const cloned = deepClone(value);
        setByPath(this._data, dotPath, cloned);
        if (this._batching) {
            this._batchOps.push({ op: 'set', path: dotPath, value: cloned });
        } else {
            this._sendPatch({ op: 'set', path: dotPath, value: cloned });
        }
    }

    /**
     * Deep merge a partial object at a dot-path.
     * @param {string} dotPath
     * @param {Object} partial
     */
    merge(dotPath, partial) {
        const cloned = deepClone(partial);
        // Apply locally
        let current = getByPath(this._data, dotPath);
        if (current == null || typeof current !== 'object') {
            setByPath(this._data, dotPath, cloned);
        } else {
            Object.assign(current, cloned); // shallow merge at target
        }
        if (this._batching) {
            this._batchOps.push({ op: 'merge', path: dotPath, partial: cloned });
        } else {
            this._sendPatch({ op: 'merge', path: dotPath, partial: cloned });
        }
    }

    /**
     * Collect multiple operations and send as a single WS message.
     * @param {Function} fn - called synchronously; use this.set/merge inside
     */
    batch(fn) {
        this._batching = true;
        this._batchOps = [];
        try {
            fn();
        } finally {
            this._batching = false;
        }
        if (this._batchOps.length > 0) {
            this._send({
                type: 'state_sync_patch',
                agentName: this._agentName,
                ops: this._batchOps
            });
            this._batchOps = [];
        }
    }

    /**
     * Request full state from the server (used on restart/recovery).
     * Server will respond with state_sync_response.
     */
    syncFromServer() {
        this._send({
            type: 'state_sync_request',
            agentName: this._agentName
        });
    }

    /**
     * Process an incoming message from the server.
     * @param {Object} msg - parsed message object
     */
    handleServerMessage(msg) {
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'state_sync_response': {
                // Full state restore from server
                if (msg.data && typeof msg.data === 'object') {
                    // Replace local data while keeping Proxy reference intact
                    const keys = Object.keys(this._data);
                    for (const k of keys) delete this._data[k];
                    Object.assign(this._data, deepClone(msg.data));
                }
                break;
            }
            case 'agent_state_patch': {
                // Incremental update from server (e.g., another source changed state)
                if (msg.op === 'set' && msg.path) {
                    setByPath(this._data, msg.path, deepClone(msg.value));
                } else if (msg.op === 'merge' && msg.path && msg.partial) {
                    let current = getByPath(this._data, msg.path);
                    if (current == null || typeof current !== 'object') {
                        setByPath(this._data, msg.path, deepClone(msg.partial));
                    } else {
                        Object.assign(current, deepClone(msg.partial));
                    }
                } else if (msg.op === 'delete' && msg.path) {
                    // Delete by path
                    const parts = msg.path.split('.');
                    if (parts.length === 1) {
                        delete this._data[parts[0]];
                    } else {
                        const parent = getByPath(this._data, parts.slice(0, -1).join('.'));
                        if (parent && typeof parent === 'object') {
                            delete parent[parts[parts.length - 1]];
                        }
                    }
                }
                break;
            }
        }
    }

    // ── Internal ──

    /**
     * Send a state_sync_set message (triggered by Proxy set).
     */
    _sendSet(path, value) {
        if (this._batching) {
            this._batchOps.push({ op: 'set', path, value });
            return;
        }
        this._send({
            type: 'state_sync_set',
            agentName: this._agentName,
            path,
            value
        });
    }

    /**
     * Send a state_sync_patch message.
     */
    _sendPatch(opObj) {
        this._send({
            type: 'state_sync_patch',
            agentName: this._agentName,
            ops: [opObj]
        });
    }

    /**
     * Low-level WS send. Serializes to JSON string.
     */
    _send(msg) {
        if (this._ws && typeof this._ws.send === 'function') {
            try {
                this._ws.send(JSON.stringify(msg));
            } catch (err) {
                console.error(`[StateClient] Failed to send WS message:`, err.message);
            }
        }
    }
}

module.exports = { StateClient };
