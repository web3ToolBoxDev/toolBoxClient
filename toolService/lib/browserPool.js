'use strict';

const path = require('path');
const fs = require('fs');

/**
 * Browser Pool — manages Puppeteer browser instances.
 *
 * Supports three launch modes:
 *   1. Fingerprint env → chromePath + fingerprint profile + proxy
 *   2. System Chrome → chromePath only (no fingerprint)
 *   3. Headless fallback → puppeteer-core with bundled/system Chrome
 *
 * Each browser gets a unique ID for lifecycle management.
 */

const _browsers = new Map(); // id → { browser, mode, createdAt, lastUsed }
const _idleTimeoutMs = 5 * 60 * 1000; // 5 min idle cleanup
let _cleanupInterval = null;

const genId = () => `browser_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

// ─── Chrome arg builder (from browserLauncher.js) ───

function buildChromeArgs(env, options = {}) {
    const args = [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disabled-setupid-sandbox',
        '--disable-infobars',
        `--user-agent=${env.user_agent}`,
        `--lang=${env.language_js}`
    ];
    if (options.walletExtensionPath) {
        args.push(`--disable-extensions-except=${options.walletExtensionPath}`);
    }
    const fingerprints = {
        audio: env.audio,
        clientRect: env.clientRect,
        webgl: env.webgl,
        canvas: env.canvas,
        hardware: env.hardware,
        screen: env.screen,
        clientHint: env.clientHint,
        languages_js: env.language_js,
        languages_http: env.language_http,
        fonts_remove: env.fonts_remove
    };
    if (env.useProxy) {
        fingerprints.position = env.position;
        fingerprints.timeZone = env.timeZone;
        fingerprints.webrtc_public = env.webrtc_public;
        args.push(`--proxy-server=${env.proxyUrl}`);
    }
    args.push(`--toolbox=${JSON.stringify(fingerprints)}`);
    return args;
}

function ensureUserDataDir(savePath, envId) {
    const userDataDir = path.join(savePath, envId);
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }
    return userDataDir;
}

// ─── Launch modes ───

/**
 * Launch browser with fingerprint environment.
 * @param {object} params
 * @param {string} params.chromePath
 * @param {string} params.savePath
 * @param {object} params.env - Fingerprint env (must have .id, .user_agent, etc.)
 * @param {boolean} [params.headless=false]
 * @returns {Promise<string>} browserId
 */
async function launchWithFingerprint({ chromePath, savePath, env, headless = false }) {
    if (!chromePath) throw new Error('chromePath is required for fingerprint mode');
    if (!savePath) throw new Error('savePath is required for fingerprint mode');
    if (!env || !env.id) throw new Error('env with id is required');

    const puppeteer = _getPuppeteer();
    const userDataDir = ensureUserDataDir(savePath, env.id);
    const args = buildChromeArgs(env);

    const browser = await puppeteer.launch({
        headless: headless ? 'new' : false,
        executablePath: chromePath,
        ignoreDefaultArgs: ['--enable-automation'],
        userDataDir,
        args,
        defaultViewport: null
    });

    const id = genId();
    _browsers.set(id, { browser, mode: 'fingerprint', createdAt: Date.now(), lastUsed: Date.now() });
    _ensureCleanup();
    return id;
}

/**
 * Launch browser with system Chrome (no fingerprint).
 * @param {object} params
 * @param {string} params.chromePath
 * @param {boolean} [params.headless=false]
 * @returns {Promise<string>} browserId
 */
async function launchWithChrome({ chromePath, headless = false }) {
    if (!chromePath) throw new Error('chromePath is required');
    const puppeteer = _getPuppeteer();

    const browser = await puppeteer.launch({
        headless: headless ? 'new' : false,
        executablePath: chromePath,
        ignoreDefaultArgs: ['--enable-automation'],
        args: ['--no-sandbox', '--disable-infobars'],
        defaultViewport: null
    });

    const id = genId();
    _browsers.set(id, { browser, mode: 'chrome', createdAt: Date.now(), lastUsed: Date.now() });
    _ensureCleanup();
    return id;
}

/**
 * Launch headless browser (puppeteer default, no chromePath needed if puppeteer bundles Chromium).
 * @param {object} [params]
 * @param {string} [params.chromePath] - optional
 * @returns {Promise<string>} browserId
 */
async function launchHeadless({ chromePath } = {}) {
    const puppeteer = _getPuppeteer();
    const launchOpts = {
        headless: 'new',
        args: ['--no-sandbox', '--disable-infobars'],
        defaultViewport: null
    };
    if (chromePath) launchOpts.executablePath = chromePath;

    const browser = await puppeteer.launch(launchOpts);
    const id = genId();
    _browsers.set(id, { browser, mode: 'headless', createdAt: Date.now(), lastUsed: Date.now() });
    _ensureCleanup();
    return id;
}

/**
 * Smart launch — tries fingerprint → chrome → headless based on what's available.
 * @param {object} params
 * @param {string} [params.chromePath]
 * @param {string} [params.savePath]
 * @param {object} [params.env] - Fingerprint env
 * @param {boolean} [params.headless=false]
 * @returns {Promise<{ browserId: string, mode: string }>}
 */
async function launch(params = {}) {
    const { chromePath, savePath, env, headless = false } = params;

    // Mode 1: fingerprint env
    if (env && env.id && chromePath && savePath) {
        const id = await launchWithFingerprint({ chromePath, savePath, env, headless });
        return { browserId: id, mode: 'fingerprint' };
    }

    // Mode 2: system Chrome
    if (chromePath) {
        const id = await launchWithChrome({ chromePath, headless });
        return { browserId: id, mode: 'chrome' };
    }

    // Mode 3: headless fallback
    const id = await launchHeadless({ chromePath });
    return { browserId: id, mode: 'headless' };
}

// ─── Browser lifecycle ───

/**
 * Get a Puppeteer browser instance by ID.
 * @param {string} browserId
 * @returns {object|null} Puppeteer browser
 */
function getBrowser(browserId) {
    const entry = _browsers.get(browserId);
    if (!entry) return null;
    entry.lastUsed = Date.now();
    return entry.browser;
}

/**
 * Get or create a page in a browser.
 * @param {string} browserId
 * @returns {Promise<object>} Puppeteer page
 */
async function getPage(browserId) {
    const browser = getBrowser(browserId);
    if (!browser) throw new Error(`Browser ${browserId} not found`);
    const pages = await browser.pages();
    // Reuse first blank page if available
    if (pages.length === 1) {
        const url = pages[0].url();
        if (url === 'about:blank' || url === '') return pages[0];
    }
    return browser.newPage();
}

/**
 * Close a browser and remove from pool.
 * @param {string} browserId
 */
async function close(browserId) {
    const entry = _browsers.get(browserId);
    if (!entry) return;
    try { await entry.browser.close(); } catch (_) {}
    _browsers.delete(browserId);
}

/**
 * Close all browsers.
 */
async function closeAll() {
    for (const [id, entry] of _browsers) {
        try { await entry.browser.close(); } catch (_) {}
    }
    _browsers.clear();
    if (_cleanupInterval) {
        clearInterval(_cleanupInterval);
        _cleanupInterval = null;
    }
}

/**
 * List active browsers.
 * @returns {object[]}
 */
function listBrowsers() {
    return Array.from(_browsers.entries()).map(([id, e]) => ({
        id, mode: e.mode, createdAt: e.createdAt, lastUsed: e.lastUsed
    }));
}

/**
 * Get pool size.
 * @returns {number}
 */
function size() {
    return _browsers.size;
}

// ─── Internal ───

function _getPuppeteer() {
    try {
        return require('puppeteer-core');
    } catch (_) {
        try {
            return require('puppeteer');
        } catch (_2) {
            throw new Error('Neither puppeteer-core nor puppeteer is installed');
        }
    }
}

function _ensureCleanup() {
    if (_cleanupInterval) return;
    _cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [id, entry] of _browsers) {
            if (now - entry.lastUsed > _idleTimeoutMs) {
                console.log(`[browserPool] Closing idle browser ${id} (mode=${entry.mode})`);
                entry.browser.close().catch(() => {});
                _browsers.delete(id);
            }
        }
        if (_browsers.size === 0 && _cleanupInterval) {
            clearInterval(_cleanupInterval);
            _cleanupInterval = null;
        }
    }, 60_000);
}

module.exports = {
    launch,
    launchWithFingerprint,
    launchWithChrome,
    launchHeadless,
    getBrowser,
    getPage,
    close,
    closeAll,
    listBrowsers,
    size,
    // Exposed for testing / reuse
    buildChromeArgs,
    ensureUserDataDir
};
