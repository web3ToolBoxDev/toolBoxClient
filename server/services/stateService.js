/**
 * StateService — Unified state management singleton for multi-agent architecture.
 *
 * Modules:
 *   EventBus    — Node EventEmitter, domain events pub/sub, circular event log (100)
 *   StateStore  — Path-based state tree, namespaced by agentId
 *   Persistence — Per-agent JSON file, 2s debounce, atomic write (.tmp → rename)
 *   AgentBridge — Stubs for Phase 2 WS integration
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

// ─── Helpers ───────────────────────────────────────────────

/**
 * Get a value from an object by dot-path.
 * @param {Object} obj
 * @param {string} dotPath - e.g. 'a.b.c'
 * @returns {*}
 */
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

/**
 * Set a value on an object by dot-path, creating intermediate objects as needed.
 * @param {Object} obj
 * @param {string} dotPath
 * @param {*} value
 */
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

/**
 * Delete a key on an object by dot-path.
 * @param {Object} obj
 * @param {string} dotPath
 * @returns {boolean} true if key existed and was deleted
 */
function deleteByPath(obj, dotPath) {
    const parts = dotPath.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] == null || typeof current[part] !== 'object') return false;
        current = current[part];
    }
    const lastKey = parts[parts.length - 1];
    if (!(lastKey in current)) return false;
    delete current[lastKey];
    return true;
}

/**
 * Deep merge source into target (mutates target).
 * Arrays are replaced, not merged.
 * @param {Object} target
 * @param {Object} source
 * @returns {Object} target
 */
function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        if (
            source[key] &&
            typeof source[key] === 'object' &&
            !Array.isArray(source[key]) &&
            target[key] &&
            typeof target[key] === 'object' &&
            !Array.isArray(target[key])
        ) {
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

/**
 * Deep clone via JSON serialization (sufficient for plain state data).
 */
function deepClone(obj) {
    if (obj === undefined) return undefined;
    return JSON.parse(JSON.stringify(obj));
}

// ─── EventBus ──────────────────────────────────────────────

class EventBus extends EventEmitter {
    constructor(maxLogSize = 100) {
        super();
        this._log = [];
        this._maxLogSize = maxLogSize;
    }

    /**
     * Emit an event and record it in the circular log.
     */
    emit(eventName, ...args) {
        const entry = {
            event: eventName,
            timestamp: Date.now(),
            data: args.length === 1 ? args[0] : args
        };
        this._log.push(entry);
        if (this._log.length > this._maxLogSize) {
            this._log.shift();
        }
        return super.emit(eventName, ...args);
    }

    /**
     * Return a copy of the event log.
     */
    getLog() {
        return [...this._log];
    }

    /**
     * Clear the event log.
     */
    clearLog() {
        this._log = [];
    }
}

// ─── StateStore ────────────────────────────────────────────

class StateStore {
    constructor(eventBus) {
        this._state = {};       // root state tree
        this._eventBus = eventBus;
        this._subscriptions = []; // {pathPrefix, callback}
    }

    /**
     * Get value by dot-path.
     * @param {string} dotPath - e.g. 'jobSeekAgent.session_xxx.direction.jobTitle'
     * @returns {*} deep-cloned value (isolation)
     */
    get(dotPath) {
        const raw = getByPath(this._state, dotPath);
        return deepClone(raw);
    }

    /**
     * Set value at dot-path. Emits `state.changed` event.
     * @param {string} dotPath
     * @param {*} value
     */
    set(dotPath, value) {
        const oldValue = deepClone(getByPath(this._state, dotPath));
        setByPath(this._state, dotPath, deepClone(value));
        const changeEvent = { path: dotPath, value: deepClone(value), oldValue };
        this._eventBus.emit('state.changed', changeEvent);
        this._notifySubscribers(dotPath, changeEvent);
    }

    /**
     * Deep merge a partial object at dot-path. Emits `state.changed`.
     * @param {string} dotPath
     * @param {Object} partial
     */
    merge(dotPath, partial) {
        const oldValue = deepClone(getByPath(this._state, dotPath));
        let current = getByPath(this._state, dotPath);
        if (current == null || typeof current !== 'object') {
            current = {};
        } else {
            // Work on the actual reference so deepMerge mutates state in-place
            // We already have oldValue cloned above
        }
        // Ensure the path exists in state tree
        if (getByPath(this._state, dotPath) === undefined) {
            setByPath(this._state, dotPath, {});
        }
        const target = getByPath(this._state, dotPath);
        deepMerge(target, deepClone(partial));

        const newValue = deepClone(getByPath(this._state, dotPath));
        const changeEvent = { path: dotPath, value: newValue, oldValue };
        this._eventBus.emit('state.changed', changeEvent);
        this._notifySubscribers(dotPath, changeEvent);
    }

    /**
     * Delete a key at dot-path. Emits `state.changed` with value=undefined.
     * @param {string} dotPath
     * @returns {boolean}
     */
    delete(dotPath) {
        const oldValue = deepClone(getByPath(this._state, dotPath));
        const deleted = deleteByPath(this._state, dotPath);
        if (deleted) {
            const changeEvent = { path: dotPath, value: undefined, oldValue };
            this._eventBus.emit('state.changed', changeEvent);
            this._notifySubscribers(dotPath, changeEvent);
        }
        return deleted;
    }

    /**
     * Subscribe to changes under a path prefix.
     * @param {string} pathPrefix - e.g. 'jobSeekAgent' or 'jobSeekAgent.session_1'
     * @param {Function} callback - receives {path, value, oldValue}
     * @returns {Function} unsubscribe function
     */
    subscribe(pathPrefix, callback) {
        const sub = { pathPrefix, callback };
        this._subscriptions.push(sub);
        return () => {
            const idx = this._subscriptions.indexOf(sub);
            if (idx !== -1) this._subscriptions.splice(idx, 1);
        };
    }

    /**
     * Return a deep clone of the full state for a given agentId.
     * @param {string} agentId
     * @returns {Object}
     */
    snapshot(agentId) {
        return deepClone(this._state[agentId]) || {};
    }

    /**
     * Bulk restore state for an agent (e.g., on restart recovery).
     * @param {string} agentId
     * @param {Object} data
     */
    restore(agentId, data) {
        this._state[agentId] = deepClone(data);
        this._eventBus.emit('state.changed', {
            path: agentId,
            value: deepClone(data),
            oldValue: undefined
        });
    }

    /**
     * Notify subscribers whose pathPrefix matches the changed path.
     * A subscriber matches if the changed path starts with its prefix or vice versa.
     */
    _notifySubscribers(changedPath, changeEvent) {
        for (const sub of this._subscriptions) {
            if (
                changedPath.startsWith(sub.pathPrefix) ||
                sub.pathPrefix.startsWith(changedPath)
            ) {
                try {
                    sub.callback(changeEvent);
                } catch (err) {
                    console.error(`[StateStore] Subscriber error for prefix "${sub.pathPrefix}":`, err);
                }
            }
        }
    }
}

// ─── Persistence ───────────────────────────────────────────

class Persistence {
    /**
     * @param {string} basePath - e.g. assets/agents
     * @param {number} debounceMs - write debounce in ms (default 2000)
     */
    constructor(basePath, debounceMs = 2000) {
        this._basePath = basePath;
        this._debounceMs = debounceMs;
        this._timers = {};    // agentName → timeout id
        this._loaded = {};    // agentName → boolean
    }

    /**
     * Resolve path to an agent's state file.
     * @param {string} agentName - e.g. 'job-seek'
     * @returns {string}
     */
    getFilePath(agentName) {
        return path.join(this._basePath, agentName, 'data', 'state.json');
    }

    /**
     * Load state from JSON file. Returns {} if file doesn't exist.
     * @param {string} agentName
     * @returns {Object}
     */
    load(agentName) {
        const filePath = this.getFilePath(agentName);
        try {
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, 'utf-8');
                this._loaded[agentName] = true;
                return JSON.parse(raw);
            }
        } catch (err) {
            console.error(`[Persistence] Failed to load state for "${agentName}":`, err.message);
        }
        this._loaded[agentName] = true;
        return {};
    }

    /**
     * Schedule a debounced save. Only the last call within the debounce window fires.
     * @param {string} agentName
     * @param {Object} data
     */
    scheduleSave(agentName, data) {
        if (this._timers[agentName]) {
            clearTimeout(this._timers[agentName]);
        }
        this._timers[agentName] = setTimeout(() => {
            this._atomicWrite(agentName, data);
            delete this._timers[agentName];
        }, this._debounceMs);
    }

    /**
     * Force immediate save (bypass debounce). Used for shutdown.
     * @param {string} agentName
     * @param {Object} data
     */
    saveNow(agentName, data) {
        if (this._timers[agentName]) {
            clearTimeout(this._timers[agentName]);
            delete this._timers[agentName];
        }
        this._atomicWrite(agentName, data);
    }

    /**
     * Atomic write: write to .tmp then rename.
     * @param {string} agentName
     * @param {Object} data
     */
    _atomicWrite(agentName, data) {
        const filePath = this.getFilePath(agentName);
        const tmpPath = filePath + '.tmp';
        try {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
            fs.renameSync(tmpPath, filePath);
        } catch (err) {
            console.error(`[Persistence] Atomic write failed for "${agentName}":`, err.message);
            // Clean up tmp file if rename failed
            try { fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
        }
    }

    /**
     * Cancel all pending debounce timers.
     */
    cancelAll() {
        for (const agentName of Object.keys(this._timers)) {
            clearTimeout(this._timers[agentName]);
        }
        this._timers = {};
    }

    /**
     * Check if a given agent's state has been loaded.
     */
    isLoaded(agentName) {
        return !!this._loaded[agentName];
    }
}

// ─── StateService (Singleton) ──────────────────────────────

class StateService {
    static instance = null;

    constructor() {
        if (StateService.instance) {
            return StateService.instance;
        }
        StateService.instance = this;

        this.eventBus = new EventBus(100);
        this.store = new StateStore(this.eventBus);

        // Resolve base path for agents directory
        const Config = require('../../config');
        const config = Config.getInstance();
        this.persistence = new Persistence(config.defaultAgentPath);

        // Auto-persist on state changes
        this.eventBus.on('state.changed', (changeEvent) => {
            const agentId = changeEvent.path.split('.')[0];
            if (agentId) {
                this._schedulePersist(agentId);
            }
        });
    }

    static getInstance() {
        if (!StateService.instance) {
            StateService.instance = new StateService();
        }
        return StateService.instance;
    }

    /**
     * Reset singleton (for testing).
     */
    static _reset() {
        if (StateService.instance) {
            StateService.instance.persistence.cancelAll();
            StateService.instance.eventBus.removeAllListeners();
            // Clean up SSE state
            if (StateService.instance._sseDebounceTimer) {
                clearTimeout(StateService.instance._sseDebounceTimer);
            }
            if (StateService.instance._sseConnections) {
                StateService.instance._sseConnections.clear();
            }
            StateService.instance._sseBroadcastInitialized = false;
        }
        StateService.instance = null;
    }

    // ── State accessors (delegate to store) ──

    get(dotPath) {
        // Auto-load from disk on first access for the agent
        const agentId = dotPath.split('.')[0];
        this._ensureLoaded(agentId);
        return this.store.get(dotPath);
    }

    set(dotPath, value) {
        const agentId = dotPath.split('.')[0];
        this._ensureLoaded(agentId);
        return this.store.set(dotPath, value);
    }

    merge(dotPath, partial) {
        const agentId = dotPath.split('.')[0];
        this._ensureLoaded(agentId);
        return this.store.merge(dotPath, partial);
    }

    delete(dotPath) {
        const agentId = dotPath.split('.')[0];
        this._ensureLoaded(agentId);
        return this.store.delete(dotPath);
    }

    subscribe(pathPrefix, callback) {
        return this.store.subscribe(pathPrefix, callback);
    }

    snapshot(agentId) {
        this._ensureLoaded(agentId);
        return this.store.snapshot(agentId);
    }

    restore(agentId, data) {
        return this.store.restore(agentId, data);
    }

    // ── Session CRUD (Phase A3) ──

    /**
     * List all sessions for an agent.
     * @param {string} agentId
     * @returns {{ sessions: Array, activeSessionId: string|null }}
     */
    listSessions(agentId) {
        this._ensureLoaded(agentId);
        const sessions = this.store.get(`${agentId}.sessions`) || [];
        const activeSessionId = this.store.get(`${agentId}.activeSessionId`) || null;
        return { sessions, activeSessionId };
    }

    /**
     * Get a single session by ID, including its conversations.
     * @param {string} agentId
     * @param {string} sessionId
     * @returns {Object|null}
     */
    getSession(agentId, sessionId) {
        this._ensureLoaded(agentId);
        const sessions = this.store.get(`${agentId}.sessions`) || [];
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return null;
        const conversations = this.store.get(`${agentId}.conversations.${sessionId}`) || [];
        return { ...session, conversations };
    }

    /**
     * Create a new session. Idempotent on name.
     * @param {string} agentId
     * @param {string} [name]
     * @returns {Object} the created (or existing) session
     */
    createSession(agentId, name) {
        this._ensureLoaded(agentId);
        const sessions = this.store.get(`${agentId}.sessions`) || [];
        const sessionName = name || `Session ${sessions.length + 1}`;

        // Idempotent: return existing session with same name
        const existing = sessions.find(s => s.name === sessionName);
        if (existing) return existing;

        const newSession = {
            id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: sessionName,
            createdAt: new Date().toISOString()
        };
        sessions.push(newSession);
        this.set(`${agentId}.sessions`, sessions);
        if (!this.store.get(`${agentId}.activeSessionId`)) {
            this.set(`${agentId}.activeSessionId`, newSession.id);
        }
        // Initialize empty conversations array for this session
        this.set(`${agentId}.conversations.${newSession.id}`, []);
        return newSession;
    }

    /**
     * Delete a session by ID.
     * @param {string} agentId
     * @param {string} sessionId
     * @returns {boolean}
     */
    deleteSession(agentId, sessionId) {
        this._ensureLoaded(agentId);
        const sessions = this.store.get(`${agentId}.sessions`) || [];
        const idx = sessions.findIndex(s => s.id === sessionId);
        if (idx === -1) return false;

        sessions.splice(idx, 1);
        this.set(`${agentId}.sessions`, sessions);
        // Clean up conversations
        this.delete(`${agentId}.conversations.${sessionId}`);

        // If deleted session was active, switch to another or null
        const activeId = this.store.get(`${agentId}.activeSessionId`);
        if (activeId === sessionId) {
            const newActiveId = sessions.length > 0 ? sessions[0].id : null;
            this.set(`${agentId}.activeSessionId`, newActiveId);
        }
        return true;
    }

    /**
     * Switch the active session.
     * @param {string} agentId
     * @param {string} sessionId
     * @returns {boolean}
     */
    switchSession(agentId, sessionId) {
        this._ensureLoaded(agentId);
        const sessions = this.store.get(`${agentId}.sessions`) || [];
        const exists = sessions.some(s => s.id === sessionId);
        if (!exists) return false;
        this.set(`${agentId}.activeSessionId`, sessionId);
        return true;
    }

    // ── Language preference (Phase A4) ──

    /**
     * Get the app language preference.
     * @returns {string} 'en' or 'zh-CN'
     */
    getLanguage() {
        const lang = this.store.get('app.language');
        return lang || 'zh-CN';
    }

    /**
     * Set the app language preference.
     * @param {string} language - 'en' or 'zh-CN'
     * @returns {boolean} true if valid language
     */
    setLanguage(language) {
        const valid = ['en', 'zh-CN'];
        if (!valid.includes(language)) return false;
        this.set('app.language', language);
        return true;
    }

    // ── SSE Broadcast (Phase B) ──

    /**
     * Add an SSE connection to the tracked set.
     * @param {Object} connection - { res, topics: Set<string> }
     */
    addSSEConnection(connection) {
        if (!this._sseConnections) this._sseConnections = new Set();
        this._sseConnections.add(connection);
        console.log(`[stateService:sse] Client connected (topics: ${[...connection.topics].join(',')}). Total: ${this._sseConnections.size}`);
    }

    /**
     * Remove an SSE connection from the tracked set.
     * @param {Object} connection
     */
    removeSSEConnection(connection) {
        if (!this._sseConnections) return;
        this._sseConnections.delete(connection);
        console.log(`[stateService:sse] Client disconnected. Total: ${this._sseConnections.size}`);
    }

    /**
     * Get the number of active SSE connections.
     * @returns {number}
     */
    getSSEConnectionCount() {
        return this._sseConnections ? this._sseConnections.size : 0;
    }

    /**
     * Determine the SSE topic from a state change path.
     * First path segment, or 'app' for app.* paths.
     * @param {string} changePath
     * @returns {string}
     */
    _getTopicFromPath(changePath) {
        const firstSegment = changePath.split('.')[0];
        return firstSegment;
    }

    /**
     * Broadcast a state change event to all matching SSE connections.
     * Called internally by the debounced broadcaster.
     * @param {Object} changeEvent - { path, value, oldValue }
     */
    _broadcastSSE(changeEvent) {
        if (!this._sseConnections || this._sseConnections.size === 0) return;

        const topic = this._getTopicFromPath(changeEvent.path);
        const op = changeEvent.value === undefined ? 'delete' : (changeEvent.oldValue === undefined ? 'create' : 'set');

        const sseData = JSON.stringify({
            topic,
            path: changeEvent.path,
            value: changeEvent.value,
            op,
            timestamp: Date.now()
        });

        const message = `event: state_change\ndata: ${sseData}\n\n`;

        let sentCount = 0;
        for (const conn of this._sseConnections) {
            // Topic filtering: if connection specifies topics, only send if matching
            if (conn.topics.size > 0 && !conn.topics.has(topic)) {
                continue;
            }
            try {
                conn.res.write(message);
                sentCount++;
            } catch (err) {
                console.error(`[stateService:sse] Write error, removing connection:`, err.message);
                this._sseConnections.delete(conn);
            }
        }
        if (sentCount > 0) {
            console.log(`[stateService:sse] Broadcast topic="${topic}" op="${op}" to ${sentCount} client(s)`);
        }
    }

    /**
     * Initialize SSE broadcast wiring — listen to state.changed events
     * and debounce broadcasts to SSE connections.
     * Called once when the SSE route is first set up.
     */
    initSSEBroadcast() {
        if (this._sseBroadcastInitialized) return;
        this._sseBroadcastInitialized = true;
        this._sseConnections = this._sseConnections || new Set();
        this._ssePendingChanges = [];
        this._sseDebounceTimer = null;

        this.eventBus.on('state.changed', (changeEvent) => {
            this._ssePendingChanges.push(changeEvent);
            if (!this._sseDebounceTimer) {
                this._sseDebounceTimer = setTimeout(() => {
                    this._flushSSEChanges();
                    this._sseDebounceTimer = null;
                }, 100); // 100ms debounce
            }
        });

        console.log('[stateService:sse] SSE broadcast wiring initialized');
    }

    /**
     * Flush all pending SSE changes, deduplicating by path (latest wins).
     */
    _flushSSEChanges() {
        if (!this._ssePendingChanges || this._ssePendingChanges.length === 0) return;

        // Deduplicate: latest change per path wins
        const byPath = new Map();
        for (const change of this._ssePendingChanges) {
            byPath.set(change.path, change);
        }
        this._ssePendingChanges = [];

        for (const change of byPath.values()) {
            this._broadcastSSE(change);
        }
    }

    // ── AgentBridge stubs (Phase 2) ──

    /**
     * Process incoming WS state_sync_* messages from an agent child process.
     * @param {string} agentId
     * @param {Object} message - parsed WS message with type and payload
     * @param {Object} [options] - { sendToTask: fn } for responding back to agent
     */
    handleMessage(agentId, message, options = {}) {
        if (!message || !message.type) return;

        switch (message.type) {
            case 'state_sync_snapshot': {
                // Full state restore from agent
                const data = message.data;
                if (data && typeof data === 'object') {
                    this.restore(agentId, data);
                    console.log(`[StateService] Restored snapshot for agent "${agentId}", keys: ${Object.keys(data).length}`);
                }
                break;
            }
            case 'state_sync_patch': {
                // Array of operations: { op, path, value/partial }
                const ops = Array.isArray(message.ops) ? message.ops : [];
                for (const op of ops) {
                    const fullPath = agentId + '.' + op.path;
                    switch (op.op) {
                        case 'set':
                            this.set(fullPath, op.value);
                            break;
                        case 'merge':
                            this.merge(fullPath, op.partial || op.value);
                            break;
                        case 'delete':
                            this.delete(fullPath);
                            break;
                        default:
                            console.warn(`[StateService] Unknown patch op "${op.op}" for agent "${agentId}"`);
                    }
                }
                break;
            }
            case 'state_sync_set': {
                // Single set operation
                const path = message.path;
                if (path) {
                    this.set(agentId + '.' + path, message.value);
                }
                break;
            }
            case 'state_sync_request': {
                // Agent requests full snapshot — respond via sendToTask callback
                const snapshot = this.snapshot(agentId);
                const response = {
                    type: 'state_sync_response',
                    data: snapshot
                };
                if (typeof options.sendToTask === 'function') {
                    options.sendToTask(response);
                } else {
                    console.warn(`[StateService] state_sync_request received but no sendToTask callback for agent "${agentId}"`);
                }
                break;
            }
            default:
                console.log(`[StateService] Unhandled message type "${message.type}" for agent "${agentId}"`);
        }
    }

    /**
     * Push a state change event to the frontend via WebSocket.
     * Called by the WebSocket integration layer when state.changed fires.
     * @param {string} agentId
     * @param {Object} changeEvent - { path, value, oldValue }
     */
    broadcastToFrontend(agentId, changeEvent) {
        try {
            const WebSocketService = require('./webSocketService');
            const wsService = WebSocketService.getInstance();
            wsService.sendToFront({
                type: 'agent_state_patch',
                agentId,
                path: changeEvent.path,
                value: changeEvent.value,
                op: changeEvent.value === undefined ? 'delete' : 'set',
                time: new Date().toLocaleString()
            });
        } catch (err) {
            console.error(`[StateService] broadcastToFrontend failed for agent "${agentId}":`, err.message);
        }
    }

    // ── Internal ──

    /**
     * Map agentId (e.g. 'jobSeekAgent') to directory name (e.g. 'job-seek').
     * Convention: agentId uses camelCase, directory uses kebab-case.
     * Override this mapping as needed.
     */
    _agentIdToName(agentId) {
        // Simple mapping — extend as more agents are added
        const map = {
            'jobSeekAgent': 'job-seek'
        };
        return map[agentId] || agentId;
    }

    _ensureLoaded(agentId) {
        const agentName = this._agentIdToName(agentId);
        if (!this.persistence.isLoaded(agentName)) {
            const data = this.persistence.load(agentName);
            if (data && Object.keys(data).length > 0) {
                // Restore without emitting change events to avoid re-persist loop
                this.store._state[agentId] = data;
            }
        }
    }

    _schedulePersist(agentId) {
        const agentName = this._agentIdToName(agentId);
        const data = this.store.snapshot(agentId);
        this.persistence.scheduleSave(agentName, data);
    }

    /**
     * Flush all pending writes immediately (call on shutdown).
     */
    flushAll() {
        // Persist all known agents
        for (const agentId of Object.keys(this.store._state)) {
            const agentName = this._agentIdToName(agentId);
            this.persistence.saveNow(agentName, this.store.snapshot(agentId));
        }
    }
}

// Export classes for testing and the singleton accessor
module.exports = {
    StateService,
    EventBus,
    StateStore,
    Persistence,
    // Helper functions exported for unit testing
    _helpers: { getByPath, setByPath, deleteByPath, deepMerge, deepClone }
};
