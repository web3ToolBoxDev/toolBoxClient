'use strict';

/**
 * Platform Store — CRUD for user-added job platforms.
 *
 * Each platform represents a job website column in the Workflow Grid.
 * Supports dynamic addition/removal and location-based presets.
 *
 * Tool scripts (search/apply) are persisted to disk keyed by platform URL,
 * so they survive session restarts without needing to re-build.
 */

const fs = require('fs');
const path = require('path');
const { detectRegion } = require('../sources/locationSources');

// In-memory store: sessionId → Platform[]
const _platforms = new Map();

let _idCounter = 0;
function nextId() { return `plat_${Date.now()}_${++_idCounter}`; }

// ---------------------------------------------------------------------------
// Tool script persistence
// ---------------------------------------------------------------------------

const TOOLS_FILE = 'platform-tools.json';

/**
 * Resolve the data directory (sibling to the agent's lib/ folder).
 * Layout: <agent>/data/platform-tools.json
 */
function _dataDir() {
    return path.join(__dirname, '..', '..', 'data');
}

/**
 * Load saved tool scripts from disk.
 * Returns Map<url, { search: {script,version}, apply: {script,version} }>
 */
function _loadToolCache() {
    try {
        const filePath = path.join(_dataDir(), TOOLS_FILE);
        if (!fs.existsSync(filePath)) return {};
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return {};
        return data;
    } catch (err) {
        console.error('[platformStore] Failed to load tool cache:', err.message);
        return {};
    }
}

/**
 * Save a platform's tool script to disk (keyed by URL for cross-session matching).
 */
function _saveToolScript(platformUrl, toolType, script, version, jdVerified) {
    try {
        const dir = _dataDir();
        fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, TOOLS_FILE);

        let data = {};
        try {
            if (fs.existsSync(filePath)) {
                data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) || {};
            }
        } catch (_) { /* start fresh */ }

        if (!data[platformUrl]) data[platformUrl] = {};
        data[platformUrl][toolType] = {
            script,
            version: version || 1,
            jdVerified: jdVerified || false,
            savedAt: new Date().toISOString()
        };

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`[platformStore] Saved ${toolType} script for ${platformUrl} (v${version || 1}, ${script.length} chars)`);
    } catch (err) {
        console.error('[platformStore] Failed to save tool script:', err.message);
    }
}

/**
 * Add an AI-generated fix rule for a platform tool (learned from failure analysis).
 * Rules are persisted across rebuilds — they represent permanent lessons.
 * @param {string} platformUrl - Platform URL key
 * @param {string} toolType - 'search' or 'apply'
 * @param {string} rule - One-sentence imperative rule
 */
function addFixRule(platformUrl, toolType, rule) {
    try {
        const dir = _dataDir();
        fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, TOOLS_FILE);

        let data = {};
        try {
            if (fs.existsSync(filePath)) {
                data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) || {};
            }
        } catch (_) { /* start fresh */ }

        if (!data[platformUrl]) data[platformUrl] = {};
        if (!data[platformUrl][toolType]) data[platformUrl][toolType] = {};
        const toolData = data[platformUrl][toolType];
        if (!Array.isArray(toolData.fixRules)) toolData.fixRules = [];

        // Dedup: skip if a very similar rule already exists (>60% word overlap)
        const ruleWords = new Set(rule.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const isDuplicate = toolData.fixRules.some(existing => {
            const existWords = new Set(existing.toLowerCase().split(/\s+/).filter(w => w.length > 3));
            const overlap = [...ruleWords].filter(w => existWords.has(w)).length;
            return ruleWords.size > 0 && overlap / ruleWords.size > 0.6;
        });
        if (isDuplicate) {
            console.log(`[platformStore] Fix rule skipped (duplicate): ${rule.slice(0, 80)}...`);
            return;
        }

        toolData.fixRules.push(rule);

        // Rolling cap: keep max 5 rules
        while (toolData.fixRules.length > 5) {
            toolData.fixRules.shift();
        }

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`[platformStore] Added fix rule for ${platformUrl}/${toolType}: ${rule.slice(0, 80)}...`);
    } catch (err) {
        console.error('[platformStore] Failed to add fix rule:', err.message);
    }
}

/**
 * Get AI-generated fix rules for a platform tool.
 * @param {string} platformUrl - Platform URL key
 * @param {string} toolType - 'search' or 'apply'
 * @returns {string[]} Array of rule strings
 */
function getFixRules(platformUrl, toolType) {
    const cache = _loadToolCache();

    let entry = cache[platformUrl];
    // Fuzzy match by domain (same as _restoreTools)
    if (!entry) {
        try {
            const platHost = new URL(platformUrl).hostname;
            const platBase = platHost.split('.').slice(-2).join('.');
            for (const [cachedUrl, cachedData] of Object.entries(cache)) {
                const cachedHost = new URL(cachedUrl).hostname;
                const cachedBase = cachedHost.split('.').slice(-2).join('.');
                if (cachedBase === platBase) { entry = cachedData; break; }
            }
        } catch (_) {}
    }

    if (!entry || !entry[toolType]) return [];
    return Array.isArray(entry[toolType].fixRules) ? entry[toolType].fixRules : [];
}

/**
 * Restore saved tool scripts onto a platform object.
 * Matches by exact URL first, then falls back to domain-based matching
 * (e.g. ca.indeed.com matches saved script for www.indeed.com).
 */
function _restoreTools(platform) {
    const cache = _loadToolCache();
    let saved = cache[platform.url];

    // Fuzzy match: find a cached entry whose domain shares the same base
    // e.g. ca.indeed.com/jobs → indeed.com, www.indeed.com → indeed.com
    if (!saved) {
        try {
            const platHost = new URL(platform.url).hostname;
            const platBase = platHost.split('.').slice(-2).join('.');
            for (const [cachedUrl, cachedData] of Object.entries(cache)) {
                const cachedHost = new URL(cachedUrl).hostname;
                const cachedBase = cachedHost.split('.').slice(-2).join('.');
                if (cachedBase === platBase) { saved = cachedData; break; }
            }
        } catch (_) { /* ignore parse errors */ }
    }

    if (!saved) return;

    for (const toolType of ['search', 'apply']) {
        if (saved[toolType] && saved[toolType].script) {
            platform.tools[toolType].script = saved[toolType].script;
            platform.tools[toolType].version = saved[toolType].version || 1;
            platform.tools[toolType].jdVerified = saved[toolType].jdVerified || false;
            platform.tools[toolType].status = 'ready';
            console.log(`[platformStore] Restored ${toolType} tool for ${platform.name} (v${platform.tools[toolType].version}, jdVerified=${platform.tools[toolType].jdVerified})`);
        }
    }
}

// ---------------------------------------------------------------------------
// Login status persistence
// Keyed by platformUrl → { envId, verifiedAt }
// Stored in the same data dir as tools.
// ---------------------------------------------------------------------------

const LOGIN_FILE = 'platform-login.json';

function _loadLoginCache() {
    try {
        const filePath = path.join(_dataDir(), LOGIN_FILE);
        if (!fs.existsSync(filePath)) return {};
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) || {};
    } catch (_) {
        return {};
    }
}

/**
 * Record that a platform+env login succeeded (cookies persisted in fingerprint browser).
 * @param {string} platformUrl
 * @param {string} envId
 */
function saveLoginStatus(platformUrl, envId) {
    try {
        const dir = _dataDir();
        fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, LOGIN_FILE);

        let data = {};
        try { if (fs.existsSync(filePath)) data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) || {}; } catch (_) {}

        data[platformUrl] = { envId, verifiedAt: new Date().toISOString() };
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`[platformStore] Saved login status for ${platformUrl} (env: ${envId})`);
    } catch (err) {
        console.error('[platformStore] Failed to save login status:', err.message);
    }
}

/**
 * Clear persisted login for a platform (e.g. when cookies expired).
 * @param {string} platformUrl
 */
function clearLoginStatus(platformUrl) {
    try {
        const filePath = path.join(_dataDir(), LOGIN_FILE);
        if (!fs.existsSync(filePath)) return;
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) || {};
        delete data[platformUrl];
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`[platformStore] Cleared login status for ${platformUrl}`);
    } catch (_) {}
}

/**
 * Get persisted login info for a platform URL.
 * @param {string} platformUrl
 * @returns {{ envId: string, verifiedAt: string } | null}
 */
function getLoginStatus(platformUrl) {
    const cache = _loadLoginCache();
    return cache[platformUrl] || null;
}

/**
 * Restore login status onto a platform object if previously verified.
 * Returns the saved login info, or null.
 */
function _restoreLogin(platform) {
    const saved = getLoginStatus(platform.url);
    if (!saved) return null;
    console.log(`[platformStore] Restored login for ${platform.name} (env: ${saved.envId}, verified: ${saved.verifiedAt})`);
    return saved;
}

// ---------------------------------------------------------------------------
// Preset websites per region
// ---------------------------------------------------------------------------

const REGION_PRESETS = {
    canada: [
        { name: 'Indeed',   url: 'https://ca.indeed.com/jobs',       loginUrl: 'https://secure.indeed.com/auth', icon: '💼', connectionType: 'browser' },
        { name: 'LinkedIn', url: 'https://www.linkedin.com/jobs',    loginUrl: 'https://www.linkedin.com/login',  icon: '🔗', connectionType: 'browser' },
        { name: 'Job Bank', url: 'https://www.jobbank.gc.ca/jobsearch', loginUrl: '', icon: '🏛️', connectionType: 'browser' }
    ],
    us: [
        { name: 'Indeed',    url: 'https://www.indeed.com/jobs',      loginUrl: 'https://secure.indeed.com/auth', icon: '💼', connectionType: 'browser' },
        { name: 'LinkedIn',  url: 'https://www.linkedin.com/jobs',    loginUrl: 'https://www.linkedin.com/login',  icon: '🔗', connectionType: 'browser' },
        { name: 'Glassdoor', url: 'https://www.glassdoor.com/Job',    loginUrl: 'https://www.glassdoor.com/profile/login', icon: '🪟', connectionType: 'browser' }
    ],
    uk: [
        { name: 'Indeed',   url: 'https://www.indeed.co.uk/jobs',    loginUrl: 'https://secure.indeed.com/auth', icon: '💼', connectionType: 'browser' },
        { name: 'LinkedIn', url: 'https://www.linkedin.com/jobs',    loginUrl: 'https://www.linkedin.com/login',  icon: '🔗', connectionType: 'browser' },
        { name: 'Reed',     url: 'https://www.reed.co.uk/jobs',      loginUrl: 'https://www.reed.co.uk/account/signin', icon: '📰', connectionType: 'browser' }
    ],
    germany: [
        { name: 'LinkedIn',  url: 'https://www.linkedin.com/jobs',   loginUrl: 'https://www.linkedin.com/login',  icon: '🔗', connectionType: 'browser' },
        { name: 'Indeed',    url: 'https://de.indeed.com/jobs',      loginUrl: 'https://secure.indeed.com/auth', icon: '💼', connectionType: 'browser' },
        { name: 'StepStone', url: 'https://www.stepstone.de/jobs',   loginUrl: 'https://www.stepstone.de/login',  icon: '🪨', connectionType: 'browser' }
    ],
    china: [
        { name: 'Boss直聘', url: 'https://www.zhipin.com/web/geek/job', loginUrl: 'https://login.zhipin.com/', icon: '👔', connectionType: 'browser' },
        { name: '拉勾',     url: 'https://www.lagou.com/zhaopin/',     loginUrl: 'https://passport.lagou.com/login/login.html', icon: '🟢', connectionType: 'browser' },
        { name: 'LinkedIn', url: 'https://www.linkedin.com/jobs',      loginUrl: 'https://www.linkedin.com/login', icon: '🔗', connectionType: 'browser' }
    ],
    japan: [
        { name: 'Indeed',   url: 'https://jp.indeed.com/jobs',      loginUrl: 'https://secure.indeed.com/auth', icon: '💼', connectionType: 'browser' },
        { name: 'LinkedIn', url: 'https://www.linkedin.com/jobs',   loginUrl: 'https://www.linkedin.com/login', icon: '🔗', connectionType: 'browser' },
        { name: 'Rikunabi', url: 'https://next.rikunabi.com/',       loginUrl: 'https://next.rikunabi.com/rnc/login/', icon: '🔴', connectionType: 'browser' }
    ],
    australia: [
        { name: 'Indeed',  url: 'https://au.indeed.com/jobs',       loginUrl: 'https://secure.indeed.com/auth', icon: '💼', connectionType: 'browser' },
        { name: 'LinkedIn', url: 'https://www.linkedin.com/jobs',   loginUrl: 'https://www.linkedin.com/login', icon: '🔗', connectionType: 'browser' },
        { name: 'Seek',     url: 'https://www.seek.com.au/',        loginUrl: 'https://www.seek.com.au/oauth/login', icon: '🔍', connectionType: 'browser' }
    ],
    india: [
        { name: 'LinkedIn', url: 'https://www.linkedin.com/jobs',   loginUrl: 'https://www.linkedin.com/login', icon: '🔗', connectionType: 'browser' },
        { name: 'Naukri',   url: 'https://www.naukri.com/',          loginUrl: 'https://www.naukri.com/nlogin/login', icon: '🟠', connectionType: 'browser' },
        { name: 'Indeed',   url: 'https://www.indeed.co.in/jobs',   loginUrl: 'https://secure.indeed.com/auth', icon: '💼', connectionType: 'browser' }
    ],
    _default: [
        { name: 'Indeed',    url: 'https://www.indeed.com/jobs',     loginUrl: 'https://secure.indeed.com/auth', icon: '💼', connectionType: 'browser' },
        { name: 'LinkedIn',  url: 'https://www.linkedin.com/jobs',   loginUrl: 'https://www.linkedin.com/login', icon: '🔗', connectionType: 'browser' },
        { name: 'Glassdoor', url: 'https://www.glassdoor.com/Job',   loginUrl: 'https://www.glassdoor.com/profile/login', icon: '🪟', connectionType: 'browser' }
    ]
};

/**
 * Create a Platform object from raw input.
 */
function createPlatform(input) {
    return {
        id: nextId(),
        name: input.name || '',
        url: input.url || '',
        loginUrl: input.loginUrl || '',
        icon: input.icon || '🌐',
        connectionType: input.connectionType || 'browser',
        status: 'disconnected',
        envId: input.envId || null,
        notes: input.notes || '',
        apiConfig: input.apiConfig || null,
        tools: {
            search: { status: 'not_built', script: null, version: 0, buildLog: [] },
            apply:  { status: 'not_built', script: null, version: 0, buildLog: [] }
        },
        config: {
            step2: { enabled: true, minScore: null, maxSearch: null },
            step3: { tailorResume: true, coverLetter: true },
            step4: { autoApply: true, preApplyConfirm: false }
        },
        preset: input.preset || false,
        createdAt: new Date().toISOString()
    };
}

/**
 * Initialize platforms for a session with location-based presets.
 * Only adds presets if the session has no platforms yet.
 * Restores saved tool scripts from disk automatically.
 * @param {string} sessionId
 * @param {string} location - Free-text location
 * @returns {Platform[]} The session's platforms
 */
function initWithPresets(sessionId, location) {
    if (_platforms.has(sessionId) && _platforms.get(sessionId).length > 0) {
        return _platforms.get(sessionId);
    }

    const region = detectRegion(location);
    const presets = REGION_PRESETS[region] || REGION_PRESETS._default;

    const platforms = presets.map(p => {
        const plat = createPlatform({ ...p, preset: true });
        // Restore any previously built tool scripts from disk
        _restoreTools(plat);
        return plat;
    });
    _platforms.set(sessionId, platforms);
    return platforms;
}

/**
 * Get all platforms for a session.
 */
function getPlatforms(sessionId) {
    return _platforms.get(sessionId) || [];
}

/**
 * Add a new platform to a session.
 * @returns {{ success: boolean, platform?: object, error?: string }}
 */
function addPlatform(sessionId, input) {
    if (!input.name || !input.url) {
        return { success: false, error: 'Name and URL are required' };
    }

    // Check for duplicate URL
    const existing = getPlatforms(sessionId);
    if (existing.some(p => p.url === input.url)) {
        return { success: false, error: `Platform with URL ${input.url} already exists` };
    }

    const platform = createPlatform(input);
    // Restore any previously built tool scripts from disk
    _restoreTools(platform);

    if (!_platforms.has(sessionId)) _platforms.set(sessionId, []);
    _platforms.get(sessionId).push(platform);

    return { success: true, platform };
}

/**
 * Remove a platform from a session.
 */
function removePlatform(sessionId, platformId) {
    const platforms = _platforms.get(sessionId);
    if (!platforms) return { success: false, error: 'Session not found' };

    const idx = platforms.findIndex(p => p.id === platformId);
    if (idx === -1) return { success: false, error: 'Platform not found' };

    const removed = platforms.splice(idx, 1)[0];
    return { success: true, platform: removed };
}

/**
 * Get a single platform by ID.
 */
function getPlatform(sessionId, platformId) {
    const platforms = _platforms.get(sessionId) || [];
    return platforms.find(p => p.id === platformId) || null;
}

/**
 * Update a platform's fields.
 */
function updatePlatform(sessionId, platformId, updates) {
    const platform = getPlatform(sessionId, platformId);
    if (!platform) return { success: false, error: 'Platform not found' };

    // Whitelist updatable fields
    const allowed = ['name', 'url', 'loginUrl', 'icon', 'connectionType', 'status', 'envId', 'notes', 'apiConfig', 'config'];
    for (const key of allowed) {
        if (updates[key] !== undefined) {
            if (key === 'config' && typeof updates.config === 'object') {
                platform.config = { ...platform.config, ...updates.config };
            } else {
                platform[key] = updates[key];
            }
        }
    }

    return { success: true, platform };
}

/**
 * Update a platform's tool status.
 * When status becomes 'ready' with a script, auto-saves to disk for persistence.
 */
function updateToolStatus(sessionId, platformId, toolType, status, extra = {}) {
    const platform = getPlatform(sessionId, platformId);
    if (!platform) return { success: false, error: 'Platform not found' };
    if (!['search', 'apply'].includes(toolType)) return { success: false, error: 'Invalid tool type' };

    const tool = platform.tools[toolType];
    tool.status = status;
    if (extra.script !== undefined) tool.script = extra.script;
    if (extra.buildLog) tool.buildLog = extra.buildLog;
    if (extra.jdVerified !== undefined) tool.jdVerified = extra.jdVerified;
    if (extra.lastFailScreenshot) tool.lastFailScreenshot = extra.lastFailScreenshot;
    if (status === 'ready' && extra.script) {
        tool.version++;
        // Persist script to disk so it survives session restarts
        _saveToolScript(platform.url, toolType, extra.script, tool.version, tool.jdVerified);
    }

    return { success: true, tool };
}

/**
 * Update a platform's connection status.
 */
function updateConnectionStatus(sessionId, platformId, status) {
    const platform = getPlatform(sessionId, platformId);
    if (!platform) return { success: false, error: 'Platform not found' };
    platform.status = status;
    return { success: true, platform };
}

/**
 * Clear all platforms for a session.
 */
function clearSession(sessionId) {
    _platforms.delete(sessionId);
}

/**
 * Get preset definitions for a region.
 */
function getPresetsForRegion(region) {
    return REGION_PRESETS[region] || REGION_PRESETS._default;
}

module.exports = {
    initWithPresets,
    getPlatforms,
    getPlatform,
    addPlatform,
    removePlatform,
    updatePlatform,
    updateToolStatus,
    updateConnectionStatus,
    clearSession,
    getPresetsForRegion,
    saveLoginStatus,
    clearLoginStatus,
    getLoginStatus,
    addFixRule,
    getFixRules,
    REGION_PRESETS
};
