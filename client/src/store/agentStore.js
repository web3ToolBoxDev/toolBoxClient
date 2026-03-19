import { create } from 'zustand';

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
 * Returns a new root object (immutable style for Zustand).
 * @param {Object} obj
 * @param {string} dotPath
 * @param {*} value
 * @returns {Object} new root
 */
function setByPath(obj, dotPath, value) {
    const parts = dotPath.split('.');
    const root = { ...obj };
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        current[part] = current[part] != null && typeof current[part] === 'object'
            ? { ...current[part] }
            : {};
        current = current[part];
    }
    current[parts[parts.length - 1]] = value;
    return root;
}

/**
 * Delete a key on an object by dot-path (immutable style).
 * @param {Object} obj
 * @param {string} dotPath
 * @returns {Object} new root
 */
function deleteByPath(obj, dotPath) {
    const parts = dotPath.split('.');
    const root = { ...obj };
    let current = root;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] == null || typeof current[part] !== 'object') return root;
        current[part] = { ...current[part] };
        current = current[part];
    }
    delete current[parts[parts.length - 1]];
    return root;
}

/**
 * Deep merge source into target (immutable — returns new object).
 * Arrays are replaced, not merged.
 */
function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (
            source[key] &&
            typeof source[key] === 'object' &&
            !Array.isArray(source[key]) &&
            result[key] &&
            typeof result[key] === 'object' &&
            !Array.isArray(result[key])
        ) {
            result[key] = deepMerge(result[key], source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

/**
 * Immutable merge at a dot-path within an object tree.
 * @param {Object} obj - root state
 * @param {string} dotPath
 * @param {Object} partial - object to merge at the path
 * @returns {Object} new root
 */
function mergeByPath(obj, dotPath, partial) {
    const existing = getByPath(obj, dotPath);
    const merged = (existing != null && typeof existing === 'object')
        ? deepMerge(existing, partial)
        : partial;
    return setByPath(obj, dotPath, merged);
}

// ─── Store ─────────────────────────────────────────────────

const useAgentStore = create((set, get) => ({
    /**
     * Root agent state tree, namespaced by agentId.
     * Structure mirrors server StateService:
     *   { [agentId]: { [sessionId]: { direction, profile, platforms, env, subtasks, ... } } }
     */
    agentState: {},

    // ── Convenience selectors ──

    getDirection: (sessionId) => {
        const state = get().agentState;
        for (const agentId of Object.keys(state)) {
            const val = getByPath(state, `${agentId}.${sessionId}.direction`);
            if (val !== undefined) return val;
        }
        return undefined;
    },

    getProfile: (sessionId) => {
        const state = get().agentState;
        for (const agentId of Object.keys(state)) {
            const val = getByPath(state, `${agentId}.${sessionId}.profile`);
            if (val !== undefined) return val;
        }
        return undefined;
    },

    getPlatforms: (sessionId) => {
        const state = get().agentState;
        for (const agentId of Object.keys(state)) {
            const val = getByPath(state, `${agentId}.${sessionId}.platforms`);
            if (val !== undefined) return val;
        }
        return undefined;
    },

    getEnv: (sessionId) => {
        const state = get().agentState;
        for (const agentId of Object.keys(state)) {
            const val = getByPath(state, `${agentId}.${sessionId}.env`);
            if (val !== undefined) return val;
        }
        return undefined;
    },

    getSubtasks: (sessionId) => {
        const state = get().agentState;
        for (const agentId of Object.keys(state)) {
            const val = getByPath(state, `${agentId}.${sessionId}.subtasks`);
            if (val !== undefined) return val;
        }
        return undefined;
    },

    // ── Actions ──

    /**
     * Apply a single patch operation from the server.
     * Patch format: { op: 'set'|'merge'|'delete', path: 'agentId.session.x.y', value?: any }
     */
    applyPatch: (patch) => {
        if (!patch || !patch.op || !patch.path) return;

        set((prev) => {
            let next;
            switch (patch.op) {
                case 'set':
                    next = setByPath(prev.agentState, patch.path, patch.value);
                    break;
                case 'merge':
                    next = mergeByPath(prev.agentState, patch.path, patch.value);
                    break;
                case 'delete':
                    next = deleteByPath(prev.agentState, patch.path);
                    break;
                default:
                    return prev;
            }
            return { agentState: next };
        });
    },

    /**
     * Replace the full state tree for a specific agent (snapshot restore).
     * @param {string} agentId
     * @param {Object} snapshot
     */
    applySnapshot: (agentId, snapshot) => {
        if (!agentId) return;
        set((prev) => ({
            agentState: {
                ...prev.agentState,
                [agentId]: snapshot != null ? snapshot : {}
            }
        }));
    },

    /**
     * Clear all agent state.
     */
    reset: () => set({ agentState: {} }),
}));

// Export helpers for testing
export { getByPath, setByPath, deleteByPath, deepMerge, mergeByPath };

export default useAgentStore;
