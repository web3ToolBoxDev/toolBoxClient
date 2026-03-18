'use strict';

const fs = require('fs');
const path = require('path');

const STORE_FILE = 'users.json';

/**
 * Multi-user identity store.
 * Each user has their own master profile, sessions, and resume hashes.
 * Persisted to data/users.json.
 */

let _dataDir = null;
let _users = [];
let _activeUserId = null;

/**
 * Initialize the user store.
 * @param {string} dataDir - Absolute path to the data directory
 * @returns {{ users: Array, activeUserId: string|null }}
 */
function init(dataDir) {
    _dataDir = dataDir;
    const filePath = path.join(dataDir, STORE_FILE);
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw);
            _users = Array.isArray(data.users) ? data.users : [];
            _activeUserId = data.activeUserId || null;
            console.log(`[userStore] Loaded ${_users.length} users, active: ${_activeUserId}`);
        }
    } catch (err) {
        console.error('[userStore] Load failed:', err.message);
    }

    // Auto-create default user if none exist
    if (_users.length === 0) {
        const defaultUser = _createUser('Default User');
        _activeUserId = defaultUser.id;
        _save();
        console.log(`[userStore] Created default user: ${defaultUser.id}`);
    }

    // Ensure activeUserId is valid
    if (!_activeUserId || !_users.find(u => u.id === _activeUserId)) {
        _activeUserId = _users[0].id;
        _save();
    }

    return { users: _users, activeUserId: _activeUserId };
}

/**
 * Create a new user.
 * @param {string} name - Display name
 * @returns {{ id: string, name: string, createdAt: number }}
 */
function createUser(name) {
    const user = _createUser(name);
    _save();
    return user;
}

function _createUser(name) {
    const user = {
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: name || 'User',
        createdAt: Date.now()
    };
    _users.push(user);
    return user;
}

/**
 * Switch to a different active user.
 * @param {string} userId
 * @returns {boolean} true if switched successfully
 */
function switchUser(userId) {
    const user = _users.find(u => u.id === userId);
    if (!user) return false;
    _activeUserId = userId;
    _save();
    console.log(`[userStore] Switched to user: ${user.name} (${userId})`);
    return true;
}

/**
 * Get all users.
 * @returns {Array<{ id: string, name: string, createdAt: number }>}
 */
function listUsers() {
    return _users.slice();
}

/**
 * Get the currently active user ID.
 * @returns {string|null}
 */
function getActiveUserId() {
    return _activeUserId;
}

/**
 * Get the currently active user object.
 * @returns {{ id: string, name: string, createdAt: number }|null}
 */
function getActiveUser() {
    return _users.find(u => u.id === _activeUserId) || null;
}

/**
 * Update a user's name.
 * @param {string} userId
 * @param {string} newName
 * @returns {boolean}
 */
function updateUser(userId, newName) {
    const user = _users.find(u => u.id === userId);
    if (!user) return false;
    user.name = newName;
    _save();
    return true;
}

function _save() {
    if (!_dataDir) return;
    try {
        fs.mkdirSync(_dataDir, { recursive: true });
        const filePath = path.join(_dataDir, STORE_FILE);
        fs.writeFileSync(filePath, JSON.stringify({
            users: _users,
            activeUserId: _activeUserId,
            _savedAt: Date.now()
        }, null, 2), 'utf-8');
    } catch (err) {
        console.error('[userStore] Save failed:', err.message);
    }
}

module.exports = {
    init,
    createUser,
    switchUser,
    listUsers,
    getActiveUserId,
    getActiveUser,
    updateUser
};
