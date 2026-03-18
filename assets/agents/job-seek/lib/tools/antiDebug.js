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
    return { hasTraps: traps.length > 0, details: traps };
})()`;

/**
 * Detect if the page has debugger traps.
 * @param {string} browserId
 * @param {number} pageIndex
 * @returns {Promise<{hasTraps: boolean, details: string[]}>}
 */
async function detectDebugTraps(browserId, pageIndex) {
    try {
        const result = await _toolCall('page_evaluate', { browserId, pageIndex, expression: _detectScript }, 15000);
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
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
    if (window.__antiDebugPatched) return { injected: false, alreadyPatched: true };
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
    return { injected: true, alreadyPatched: false };
})()`;

/**
 * Inject anti-debug patches into the page (idempotent).
 * @param {string} browserId
 * @param {number} pageIndex
 * @returns {Promise<{injected: boolean, alreadyPatched: boolean}>}
 */
async function injectAntiDebug(browserId, pageIndex) {
    try {
        const result = await _toolCall('page_evaluate', { browserId, pageIndex, expression: _injectScript }, 15000);
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
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
async function ensureAntiDebug(browserId, pageIndex) {
    const detection = await detectDebugTraps(browserId, pageIndex);
    if (!detection.hasTraps) {
        return { detected: false, injected: false, details: detection.details };
    }
    const injection = await injectAntiDebug(browserId, pageIndex);
    return {
        detected: true,
        injected: injection.injected,
        details: detection.details
    };
}

module.exports = { detectDebugTraps, injectAntiDebug, ensureAntiDebug };
