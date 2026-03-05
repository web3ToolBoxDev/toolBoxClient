'use strict';

const fs = require('fs');
const path = require('path');

const STORE_FILE = 'sessions.json';

/**
 * Keys from agent state that should be persisted across restarts.
 * Runtime-only keys (runtimeLogs, executionStates, apiKeyConfiguredHint, runtimeApiKey) are excluded.
 */
const PERSIST_KEYS = [
    'sessions',
    'activeSessionId',
    'conversations',
    'subtasks',
    'artifacts',
    'prompts',
    'stages',
    'selectedAnswers',
    'runtimeContexts',
    'attachmentKinds',
    'currentModel',
    'currentProvider',
    'currentSubProvider',
    'language'
];

/**
 * Save persistent state to disk.
 * @param {string} dataDir - Absolute path to the data directory (e.g., <agent>/data/)
 * @param {object} state - The full agent state object
 */
function save(dataDir, state) {
    try {
        fs.mkdirSync(dataDir, { recursive: true });
        const snapshot = {};
        for (const key of PERSIST_KEYS) {
            if (state[key] !== undefined) {
                snapshot[key] = state[key];
            }
        }
        snapshot._savedAt = Date.now();
        const filePath = path.join(dataDir, STORE_FILE);
        fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
        console.log(`[sessionStore] Saved ${Object.keys(snapshot).length} keys to ${filePath}`);
    } catch (err) {
        console.error('[sessionStore] Save failed:', err.message);
    }
}

/**
 * Load persistent state from disk.
 * @param {string} dataDir - Absolute path to the data directory
 * @returns {object|null} The saved state snapshot, or null if not found / invalid
 */
function load(dataDir) {
    const filePath = path.join(dataDir, STORE_FILE);
    try {
        if (!fs.existsSync(filePath)) {
            console.log('[sessionStore] No saved state found');
            return null;
        }
        const raw = fs.readFileSync(filePath, 'utf-8');
        const snapshot = JSON.parse(raw);
        if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.sessions)) {
            console.warn('[sessionStore] Invalid saved state, ignoring');
            return null;
        }
        console.log(`[sessionStore] Loaded state: ${snapshot.sessions.length} sessions, saved at ${new Date(snapshot._savedAt).toISOString()}`);
        return snapshot;
    } catch (err) {
        console.error('[sessionStore] Load failed:', err.message);
        return null;
    }
}

module.exports = { save, load, PERSIST_KEYS };
