/**
 * Anti-Debug Tool — generic utility to detect and neutralize debugger traps.
 *
 * Many job sites (Indeed, etc.) inject `debugger` statements via setInterval/Function
 * to freeze page execution when Chrome DevTools Protocol (CDP) is connected.
 * This tool detects and patches these traps on demand.
 *
 * Usage:
 *   const { ensureAntiDebug } = require('./tools/antiDebug');
 *   const result = await ensureAntiDebug(browserId, pageIndex);
 *   // result: { detected: boolean, injected: boolean, details: string[] }
 */

'use strict';

const fs = require('fs');
const path = require('path');

let _tsc = null;
function getTSC() {
    if (!_tsc) _tsc = require('../core/toolServiceClient');
    return _tsc;
}

async function _toolCall(name, params, timeout) {
    const tsc = getTSC();
    const res = timeout
        ? await tsc.request('POST', '/tools/execute', { name, params }, timeout)
        : await tsc.executeTool(name, params);
    if (res && res.success === false) {
        throw new Error(`Tool ${name} failed: ${res.error || 'unknown'}`);
    }
    return res.result !== undefined ? res.result : res;
}

// ─── Domain Memory (persisted to platform-tools.json) ───
// Remembers which domains have debugger traps so we can pre-inject on subsequent visits.
// Persisted under a top-level "__antiDebugDomains" key in platform-tools.json.
const _domainTraps = new Map(); // domain → { detected: true, at: timestamp }

const TOOLS_FILE = 'platform-tools.json';

function _dataDir() {
    return path.join(__dirname, '..', '..', 'data');
}

/**
 * Load persisted anti-debug domains from platform-tools.json into _domainTraps.
 * Called once at module load time.
 */
function _loadPersistedDomains() {
    try {
        const filePath = path.join(_dataDir(), TOOLS_FILE);
        if (!fs.existsSync(filePath)) return;
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const saved = data && data.__antiDebugDomains;
        if (saved && typeof saved === 'object') {
            for (const [domain, info] of Object.entries(saved)) {
                _domainTraps.set(domain, info);
            }
            if (_domainTraps.size > 0) {
                console.log(`[anti-debug] Loaded ${_domainTraps.size} persisted trap domains: ${Array.from(_domainTraps.keys()).join(', ')}`);
            }
        }
    } catch (err) {
        console.error('[anti-debug] Failed to load persisted domains:', err.message);
    }
}

/**
 * Save current _domainTraps to platform-tools.json under "__antiDebugDomains".
 */
function _persistDomains() {
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

        // Serialize Map to plain object
        const domains = {};
        for (const [domain, info] of _domainTraps.entries()) {
            domains[domain] = info;
        }
        data.__antiDebugDomains = domains;

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        console.error('[anti-debug] Failed to persist domains:', err.message);
    }
}

// Load on module init
_loadPersistedDomains();

/**
 * Record that a domain has debugger traps.
 * Persists to platform-tools.json so it survives app restarts.
 * @param {string} url - Any URL from the domain
 */
function rememberDomain(url) {
    try {
        const domain = new URL(url).hostname;
        const isNew = !_domainTraps.has(domain);
        _domainTraps.set(domain, { detected: true, at: Date.now() });
        console.log(`[anti-debug] remembered domain: ${domain}`);
        // Persist to disk when a new domain is detected
        if (isNew) {
            _persistDomains();
        }
    } catch (_) {}
}

/**
 * Check if a domain is known to have debugger traps.
 * @param {string} url - Any URL from the domain
 * @returns {boolean}
 */
function isKnownTrapDomain(url) {
    try {
        const domain = new URL(url).hostname;
        return _domainTraps.has(domain);
    } catch (_) {
        return false;
    }
}

/**
 * Pre-inject anti-debug if this domain is known to have traps.
 * Skips detection (fast path). Returns true if injected.
 * @param {string} browserId
 * @param {number} pageIndex
 * @param {string} url - Current page URL
 * @returns {Promise<boolean>} true if pre-injected
 */
async function preInjectIfKnown(browserId, pageIndex, url) {
    if (!isKnownTrapDomain(url)) return false;
    try {
        const domain = new URL(url).hostname;
        console.log(`[anti-debug] known trap domain: ${domain} — pre-injecting...`);
        await injectAntiDebug(browserId, pageIndex);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Get all known trap domains (for debugging/logging).
 * @returns {string[]}
 */
function getKnownDomains() {
    return Array.from(_domainTraps.keys());
}

// ─── Helpers ───

/**
 * Robustly parse page_evaluate result — handles string, JSON, wrapped parens, or direct object.
 */
function _parseEvalResult(raw, fallback) {
    if (raw == null) return fallback;
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        // Already an object (e.g. { hasTraps: true, details: [] })
        if (Object.keys(raw).length > 0) return raw;
    }
    if (typeof raw === 'string') {
        let s = raw.trim();
        // Strip wrapping parens: ({"key":...}) → {"key":...}
        if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1);
        try { return JSON.parse(s); } catch (_) {}
    }
    return fallback;
}

// ─── Detection ───

const _detectScript = `(function() {
    var traps = [];
    // Check if setInterval/setTimeout have been used with debugger callbacks
    // We can't inspect existing timers, but we can check for common patterns:
    // 1. Look for scripts containing debugger in the page
    var scripts = document.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
        var text = scripts[i].textContent || '';
        if (text.includes('debugger') && (text.includes('setInterval') || text.includes('setTimeout') || text.includes('Function'))) {
            traps.push('inline-script-debugger');
            break;
        }
    }
    // 2. Check if Function constructor has been tampered (after our patch)
    if (window.__antiDebugPatched) {
        traps.push('already-patched');
    }
    // 3. Timing-based detection: run a quick eval and check if it takes too long
    // (debugger pauses would cause > 100ms for a trivial eval)
    var t0 = performance.now();
    try { eval('1+1'); } catch(e) {}
    var elapsed = performance.now() - t0;
    if (elapsed > 100) {
        traps.push('eval-delayed-' + Math.round(elapsed) + 'ms');
    }
    return JSON.stringify({ hasTraps: traps.length > 0, details: traps });
})()`;

/**
 * Detect if the page has debugger traps.
 * @param {string} browserId
 * @param {number} pageIndex
 * @returns {Promise<{hasTraps: boolean, details: string[]}>}
 */
async function detectDebugTraps(browserId, pageIndex) {
    try {
        const raw = await _toolCall('page_evaluate', { browserId, pageIndex, expression: _detectScript }, 15000);
        const parsed = _parseEvalResult(raw, { hasTraps: false, details: [] });
        console.log(`[anti-debug] detect: hasTraps=${parsed.hasTraps}, details=[${(parsed.details || []).join(', ')}]`);
        return parsed;
    } catch (err) {
        // If evaluate itself times out, that's a strong signal of debugger traps
        const msg = (err && err.message) || '';
        if (msg.includes('timed out') || msg.includes('timeout')) {
            console.log('[anti-debug] detect: page_evaluate timed out — likely debugger trap active');
            return { hasTraps: true, details: ['evaluate-timeout'] };
        }
        console.log(`[anti-debug] detect: error — ${msg}`);
        return { hasTraps: false, details: [] };
    }
}

// ─── Injection ───

const _injectScript = `(function() {
    if (window.__antiDebugPatched) return JSON.stringify({ injected: false, alreadyPatched: true });
    window.__antiDebugPatched = true;
    var origSI = window.setInterval, origST = window.setTimeout;
    function hasTrap(fn) {
        try { var s = typeof fn === 'function' ? fn.toString() : String(fn); return s.includes('debugger'); }
        catch(e) { return false; }
    }
    window.setInterval = function(fn) { return hasTrap(fn) ? 0 : origSI.apply(this, arguments); };
    window.setTimeout = function(fn) { return hasTrap(fn) ? 0 : origST.apply(this, arguments); };
    // Clear any existing debugger intervals (brute-force: clear recent interval IDs)
    var maxId = origSI(function(){}, 9999);
    origSI(function(){}, 9999); // get next ID
    for (var id = maxId - 200; id <= maxId; id++) { clearInterval(id); }
    clearInterval(maxId); clearInterval(maxId + 1);
    try {
        var OF = Function;
        window.Function = function() {
            var a = Array.from(arguments);
            var b = a.length ? a[a.length - 1] : '';
            if (typeof b === 'string' && b.includes('debugger')) {
                a[a.length - 1] = b.replace(/debugger/g, 'void 0');
            }
            return OF.apply(this, a);
        };
        window.Function.prototype = OF.prototype;
    } catch(e) {}
    return JSON.stringify({ injected: true, alreadyPatched: false });
})()`;

/**
 * Inject anti-debug patches into the page (idempotent).
 * @param {string} browserId
 * @param {number} pageIndex
 * @returns {Promise<{injected: boolean, alreadyPatched: boolean}>}
 */
async function injectAntiDebug(browserId, pageIndex) {
    try {
        const raw = await _toolCall('page_evaluate', { browserId, pageIndex, expression: _injectScript }, 15000);
        const parsed = _parseEvalResult(raw, { injected: false, alreadyPatched: false });
        if (parsed.injected) {
            console.log('[anti-debug] inject: patches applied successfully');
        } else {
            console.log('[anti-debug] inject: already patched (idempotent skip)');
        }
        return parsed;
    } catch (err) {
        const msg = (err && err.message) || '';
        console.log(`[anti-debug] inject: error — ${msg}`);
        // If evaluate times out, the debugger is actively blocking — return failure
        return { injected: false, alreadyPatched: false };
    }
}

// ─── Unified API ───

/**
 * Ensure page is free of debug traps. Detects first, injects only if needed.
 * @param {string} browserId
 * @param {number} pageIndex
 * @returns {Promise<{detected: boolean, injected: boolean, details: string[]}>}
 */
async function ensureAntiDebug(browserId, pageIndex, url) {
    const detection = await detectDebugTraps(browserId, pageIndex);
    if (!detection.hasTraps) {
        return { detected: false, injected: false, details: detection.details };
    }
    // Remember this domain for future pre-injection
    if (url) rememberDomain(url);
    const injection = await injectAntiDebug(browserId, pageIndex);
    return {
        detected: true,
        injected: injection.injected,
        details: detection.details
    };
}

module.exports = {
    detectDebugTraps, injectAntiDebug, ensureAntiDebug,
    rememberDomain, isKnownTrapDomain, preInjectIfKnown, getKnownDomains
};
