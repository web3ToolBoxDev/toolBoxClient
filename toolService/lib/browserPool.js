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
        // NOTE: --no-sandbox removed — Cloudflare detects it and blocks access (e.g. Indeed)
        '--no-first-run',
        '--no-default-browser-check',
        `--user-agent=${env.user_agent}`,
        `--lang=${env.language_js}`
    ];
    if (options.walletExtensionPath) {
        args.push(`--disable-extensions-except=${options.walletExtensionPath}`);
    }
    // 将新格式 audio: {seed: N} 转为 Chromium 补丁期望的浮点数噪声值
    let audioNoise = env.audio;
    if (audioNoise && typeof audioNoise === 'object' && audioNoise.seed !== undefined) {
        const s = audioNoise.seed;
        audioNoise = ((((s * 1103515245 + 12345) & 0x7fffffff) % 10000) + 1) / 1000000;
    }
    const fingerprints = {
        audio: audioNoise,
        clientRect: env.clientRect,
        webgl: env.webgl,
        canvas: env.canvas,
        hardware: env.hardware,
        screen: env.screen,
        clientHint: env.clientHint,
        // languages_js: (env.language_http || '').split(',').map(s => s.split(';')[0].trim()).join(','),
        languages_http: env.language_http
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
        userDataDir,
        args,
        defaultViewport: null,
        ignoreDefaultArgs: ['--enable-automation']
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
        args: [
            '--no-first-run',
            '--no-default-browser-check'
        ],
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
        args: ['--disable-infobars'],
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
 * Get a page in a browser by optional index.
 * @param {string} browserId
 * @param {number} [pageIndex] - 0-based tab index. If omitted, returns the last (most recent) page.
 * @returns {Promise<object>} Puppeteer page
 */
async function getPage(browserId, pageIndex) {
    const browser = getBrowser(browserId);
    if (!browser) throw new Error(`Browser ${browserId} not found`);
    const pages = await browser.pages();
    if (typeof pageIndex === 'number') {
        if (pageIndex < 0 || pageIndex >= pages.length) {
            throw new Error(`Page index ${pageIndex} out of range (${pages.length} pages open)`);
        }
        return pages[pageIndex];
    }
    // Default: last page, or create one if none
    if (pages.length > 0) return pages[pages.length - 1];
    return browser.newPage();
}

/**
 * Create a new page (tab) in an existing browser.
 * @param {string} browserId
 * @returns {Promise<{ page: object, pageIndex: number }>}
 */
async function newPage(browserId) {
    const browser = getBrowser(browserId);
    if (!browser) throw new Error(`Browser ${browserId} not found`);
    const page = await browser.newPage();
    const pages = await browser.pages();
    const pageIndex = pages.indexOf(page);
    return { page, pageIndex };
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

let _puppeteerInstance = null;
function _getPuppeteer() {
    if (_puppeteerInstance) return _puppeteerInstance;
    // 优先使用 puppeteer-extra（带 stealth 插件，过 Turnstile/Cloudflare 检测）
    try {
        const puppeteerExtra = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        puppeteerExtra.use(StealthPlugin());
        _puppeteerInstance = puppeteerExtra;
        return _puppeteerInstance;
    } catch (_) {}
    // 回退到 puppeteer-core
    try {
        _puppeteerInstance = require('puppeteer-core');
        return _puppeteerInstance;
    } catch (_) {
        try {
            _puppeteerInstance = require('puppeteer');
            return _puppeteerInstance;
        } catch (_2) {
            throw new Error('Neither puppeteer-extra, puppeteer-core, nor puppeteer is installed');
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
    newPage,
    close,
    closeAll,
    listBrowsers,
    size,
    // Exposed for testing / reuse
    buildChromeArgs,
    ensureUserDataDir
};
