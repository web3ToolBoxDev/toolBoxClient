'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'channels.json');

// Registered channel adapters: type → adapter module
const _adapters = new Map();

// Configured channels: id → { id, type, enabled, config, configuredAt }
const _channels = new Map();

function _genId() {
    return 'ch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

/**
 * Register a channel adapter.
 * @param {string} type - e.g., 'telegram', 'feishu'
 * @param {object} adapter - { send(config, message), sendFile?(config, file), parseWebhook?(body, headers) }
 */
function registerAdapter(type, adapter) {
    _adapters.set(type, adapter);
}

/**
 * Get adapter for a channel type.
 */
function getAdapter(type) {
    return _adapters.get(type) || null;
}

/**
 * Add a channel configuration.
 */
function add(type, config) {
    if (!_adapters.has(type)) throw new Error(`Unknown channel type: ${type}`);
    const id = _genId();
    const channel = {
        id,
        type,
        enabled: true,
        config,
        configuredAt: new Date().toISOString()
    };
    _channels.set(id, channel);
    _save();
    return channel;
}

/**
 * Remove a channel by ID.
 */
function remove(id) {
    const deleted = _channels.delete(id);
    if (deleted) _save();
    return deleted;
}

/**
 * List all configured channels.
 */
function list() {
    return Array.from(_channels.values());
}

/**
 * Get a channel by ID.
 */
function get(id) {
    return _channels.get(id) || null;
}

/**
 * Enable/disable a channel.
 */
function setEnabled(id, enabled) {
    const ch = _channels.get(id);
    if (!ch) return false;
    ch.enabled = enabled;
    _save();
    return true;
}

/**
 * Load channel configs from disk.
 */
function load() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return;
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        for (const ch of (data.channels || [])) {
            if (ch.id && ch.type) _channels.set(ch.id, ch);
        }
        console.log(`[channelRegistry] Loaded ${_channels.size} channel(s)`);
    } catch (err) {
        console.warn('[channelRegistry] Load failed:', err.message);
    }
}

/**
 * Save channel configs to disk.
 */
function _save() {
    try {
        const dir = path.dirname(CONFIG_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const data = { channels: Array.from(_channels.values()).map(ch => ({
            ...ch,
            config: { ...ch.config } // shallow copy to avoid reference issues
        })) };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('[channelRegistry] Save failed:', err.message);
    }
}

/**
 * Clear all channels (for testing).
 */
function clear() {
    _channels.clear();
}

module.exports = { registerAdapter, getAdapter, add, remove, list, get, setEnabled, load, clear };
