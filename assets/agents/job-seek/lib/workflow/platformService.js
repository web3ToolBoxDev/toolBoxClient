'use strict';

/**
 * Platform Service — business logic for platform operations.
 *
 * DashboardServer is a pure UI/routing layer. All platform logic
 * (browser launch, login, tool building) lives here.
 *
 * General tools (browser_launch, page_goto) → toolServiceClient → toolService (port 30004)
 * Domain tools (resume_gen, job_search)     → job-seek/lib/tools/
 */

const http = require('http');
const toolServiceClient = require('../core/toolServiceClient');
const platformStore = require('./platformStore');

const MAIN_SERVER = process.env.MAIN_SERVER_URL || 'http://127.0.0.1:30001';

// Lazy-require dashboardServer to bridge platform status updates to the UI grid.
let _dashboardServer = null;
function getDashboardServer() {
    if (!_dashboardServer) _dashboardServer = require('../dashboardServer');
    return _dashboardServer;
}

/**
 * Sync a platform's status to the dashboard grid.
 * Safe to call even if dashboardServer hasn't started — silently no-ops.
 */
function _syncToDashboard(sessionId, platformId, update) {
    try { getDashboardServer().updatePlatformCell(sessionId, platformId, update); }
    catch (_) { /* dashboardServer not ready yet */ }
}

/**
 * Shared browser tracking: envId → browserId.
 * When multiple platforms share the same envId, they share the same browser
 * process with different tabs (pages). Each platform tracks its own _pageIndex.
 */
const _envBrowsers = new Map(); // envId → browserId

/**
 * Clear stale _browserId from all platforms in a session that reference a dead browser.
 */
function _clearStaleBrowserId(sessionId, deadBrowserId) {
    try {
        const platforms = platformStore.getPlatforms(sessionId);
        for (const p of platforms) {
            if (p._browserId === deadBrowserId) {
                console.log(`[platformService] Clearing stale _browserId on platform ${p.id}`);
                delete p._browserId;
                delete p._pageIndex;
            }
        }
    } catch (_) { /* ignore */ }
}

/**
 * Screenshot verifier — a function that analyzes a screenshot to determine login status.
 * Set by the agent/dashboard via setScreenshotVerifier().
 *
 * Signature: async (base64png: string, platformLabel: string) => { loggedIn: boolean, reasoning: string }
 *
 * This decouples platformService from specific AI providers.
 * The agent wraps its active provider (api-key, claude-code, codex-cli) into this function.
 *
 * @type {Function|null}
 */
let _screenshotVerifier = null;

/**
 * Set the screenshot verifier function.
 * @param {Function|null} fn - async (base64png, platformLabel) => { loggedIn, reasoning }
 */
function setScreenshotVerifier(fn) {
    _screenshotVerifier = fn;
}

/**
 * Fetch JSON from the main Express server (port 30001).
 * Used to get env data, chromePath, savePath without passing through params.
 * @param {string} urlPath
 * @param {string} [method='GET']
 * @param {object} [body]
 */
function fetchFromServer(urlPath, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, MAIN_SERVER);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { resolve(null); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

/**
 * Fetch full fingerprint env data by ID from the main server.
 * @param {string} envId
 * @returns {Promise<object|null>} env data or null
 */
async function fetchEnvData(envId) {
    const result = await fetchFromServer(`/api/getEnvById/${encodeURIComponent(envId)}`);
    if (result && result.success && result.data) return result.data;
    return null;
}

/**
 * Fetch chromePath and savePath from the main server config.
 * @returns {Promise<{ chromePath: string, savePath: string }>}
 */
async function fetchPaths() {
    const [chromeRes, saveRes] = await Promise.all([
        fetchFromServer('/api/getChromePath'),
        fetchFromServer('/api/getSavePath')
    ]);
    return {
        chromePath: chromeRes?.path || '',
        savePath: saveRes?.path || ''
    };
}

/**
 * Login detection selectors per platform domain.
 *
 * Each entry maps a URL pattern (matched against platform.url or platform.loginUrl)
 * to a CSS selector that exists only when the user is logged in.
 *
 * Strategy: use page_extract to check if the selector matches any element.
 * If found → logged in. If not found → not logged in.
 */
const LOGIN_DETECTORS = [
    // ─── Global ───
    { pattern: 'indeed.com',    selector: '[data-gnav-element-name="AccountMenu"], .gnav-AccountMenu',  loginRequired: false, label: 'Indeed' },
    { pattern: 'linkedin.com',  selector: '.global-nav__me-photo, .feed-identity-module__actor-image',  loginRequired: true,  label: 'LinkedIn' },
    { pattern: 'glassdoor.com', selector: '.HeaderProfile, [data-test="header-profile"]',               loginRequired: true,  label: 'Glassdoor' },
    { pattern: 'reed.co.uk',    selector: '.header-logged-in, .profile-menu',                           loginRequired: true,  label: 'Reed' },
    { pattern: 'stepstone.de',  selector: '[data-testid="header-user-menu"], .user-menu',               loginRequired: true,  label: 'StepStone' },
    { pattern: 'seek.com.au',   selector: '[data-automation="signed-in-header"], .user-panel',          loginRequired: true,  label: 'Seek' },
    { pattern: 'naukri.com',    selector: '.nI-gNb-drawer__icon, .user-icon',                           loginRequired: true,  label: 'Naukri' },
    { pattern: 'rikunabi.com',  selector: '.rn3-header__loginMenu--loggedIn, .mypage-link',             loginRequired: false,  label: 'Rikunabi' },
    { pattern: 'dice.com',      selector: '.header-user-info, [data-testid="user-menu"]',               loginRequired: true,  label: 'Dice' },

    // ─── China ───
    { pattern: 'zhipin.com',    selector: '.user-nav .user-info, .nav-figure img, [ka="header-login"]', loginRequired: true,  label: 'Boss直聘' },
    { pattern: 'lagou.com',     selector: '.user_name, .header_person img, .lg-header__user',           loginRequired: true,  label: '拉勾' },
    { pattern: '51job.com',     selector: '.uname, .p_cboxnav .username',                               loginRequired: true,  label: '前程无忧' },
    { pattern: 'zhaopin.com',   selector: '.rd-header__user-name, .userinfo-name',                      loginRequired: true,  label: '智联招聘' },
    { pattern: 'liepin.com',    selector: '.header-user-name, .user-info-name',                         loginRequired: true,  label: '猎聘' },

    // ─── Screenshot + AI verification ───
    { pattern: 'jobbank.gc.ca', selector: null, loginRequired: false, verifyMethod: 'screenshot', label: 'Job Bank' },

    // ─── No login needed ───
    { pattern: 'google.com',    selector: null,                                                          loginRequired: false, label: 'Google' },
];

/**
 * Find the login detector config for a platform by matching its URL.
 * @param {object} platform
 * @returns {object|null} detector entry or null
 */
function getDetector(platform) {
    const urls = [platform.url, platform.loginUrl].filter(Boolean).join(' ');
    return LOGIN_DETECTORS.find(d => urls.includes(d.pattern)) || null;
}

/**
 * Verify login via screenshot + AI.
 *
 * Takes a screenshot of the platform tab, passes it to the registered
 * screenshot verifier function (provided by the agent/dashboard).
 *
 * @param {string} browserId
 * @param {number|undefined} pageIndex
 * @param {string} platformLabel
 * @returns {Promise<{ loggedIn: boolean, reasoning: string }>}
 */
async function _screenshotAIVerify(browserId, pageIndex, platformLabel) {
    if (!_screenshotVerifier) {
        throw new Error('Screenshot verifier not set. Call setScreenshotVerifier() first.');
    }

    // Take screenshot of the specific tab
    const screenshotParams = { browserId };
    if (typeof pageIndex === 'number') {
        screenshotParams.pageIndex = pageIndex;
    }
    const ssResult = await toolServiceClient.executeTool('page_screenshot', screenshotParams);
    if (!ssResult.success || !ssResult.result || !ssResult.result.screenshot) {
        throw new Error('Screenshot failed');
    }

    return _screenshotVerifier(ssResult.result.screenshot, platformLabel);
}

/**
 * Stale selector hints — tracks platforms where DOM selector failed but
 * screenshot AI confirmed login. This means the selector is outdated.
 * Key: detector.pattern, Value: { label, flaggedAt, pageHTML? }
 *
 * When the agent runs tool generation, it can read this map and ask AI
 * to suggest updated selectors based on the current page DOM.
 */
const _staleSelectorHints = new Map();

/**
 * Get all platforms with stale selectors (for AI-powered selector update).
 * @returns {Array<{ pattern: string, label: string, selector: string, flaggedAt: number }>}
 */
function getStaleSelectorHints() {
    const hints = [];
    for (const [pattern, info] of _staleSelectorHints) {
        const det = LOGIN_DETECTORS.find(d => d.pattern === pattern);
        if (det) hints.push({ pattern, label: info.label, selector: det.selector, flaggedAt: info.flaggedAt });
    }
    return hints;
}

/**
 * Clear a stale selector hint after the selector has been updated.
 * @param {string} pattern - detector URL pattern
 */
function clearStaleSelectorHint(pattern) {
    _staleSelectorHints.delete(pattern);
}

/**
 * Verify login status using cascading strategy:
 *
 * 1. DOM selector (fast, free) — if selector exists + browser open
 * 2. Screenshot + AI fallback — if DOM fails or no selector, and verifier is set
 * 3. If screenshot passes but DOM failed → flag selector as stale for later AI update
 *
 * When user clicks "Verify Login", they believe they're logged in.
 * DOM is tried first for speed; screenshot is the safety net.
 *
 * @param {string} sessionId
 * @param {string} platformId
 * @returns {Promise<object>} { success, status: 'logged_in'|'not_logged_in'|'unknown'|'no_browser', method?, staleSelector? }
 */
async function verifyLogin(sessionId, platformId) {
    const platform = platformStore.getPlatform(sessionId, platformId);
    if (!platform) {
        return { success: false, error: 'Platform not found' };
    }

    const detector = getDetector(platform);

    // No detector found — unknown platform, can't auto-verify
    if (!detector) {
        return { success: true, status: 'unknown', message: 'No login detector for this platform. Use manual confirmation.' };
    }

    // ─── No browser open ───
    if (!platform._browserId) {
        // Auto-connect if login not required
        if (!detector.loginRequired) {
            platformStore.updateConnectionStatus(sessionId, platformId, 'connected');
            return { success: true, status: 'logged_in', message: detector.label + ' does not require login.' };
        }
        return { success: true, status: 'no_browser', message: 'No browser open. Launch login first.' };
    }

    // ─── Step 1: Try DOM selector (fast, free) ───
    let domPassed = false;
    if (detector.selector) {
        try {
            const extractParams = {
                browserId: platform._browserId,
                selector: detector.selector,
                attribute: 'outerHTML',
                all: true
            };
            if (typeof platform._pageIndex === 'number') {
                extractParams.pageIndex = platform._pageIndex;
            }
            const result = await toolServiceClient.executeTool('page_extract', extractParams);
            const extracted = result.result || {};
            // count > 0 means selectors matched elements (even if attribute extraction returns null)
            if (result.success && extracted.count > 0) {
                domPassed = true;
            }
        } catch (_) {
            // DOM check failed — fall through to screenshot
        }
    }

    if (domPassed) {
        // DOM matched — confirmed logged in, clear any stale hint
        platformStore.updateConnectionStatus(sessionId, platformId, 'connected');
        _staleSelectorHints.delete(detector.pattern);
        _syncToDashboard(sessionId, platformId, { cell: 'login', status: 'verified', message: 'Login verified on ' + detector.label });
        return { success: true, status: 'logged_in', method: 'dom', message: 'Login verified on ' + detector.label };
    }

    // ─── Step 2: Screenshot + AI fallback ───
    if (_screenshotVerifier) {
        try {
            const { loggedIn, reasoning } = await _screenshotAIVerify(
                platform._browserId, platform._pageIndex, detector.label
            );
            if (loggedIn) {
                platformStore.updateConnectionStatus(sessionId, platformId, 'connected');
                _syncToDashboard(sessionId, platformId, { cell: 'login', status: 'verified', message: 'AI verified login on ' + detector.label });

                // DOM failed but screenshot passed → selector is stale
                if (detector.selector) {
                    _staleSelectorHints.set(detector.pattern, {
                        label: detector.label,
                        flaggedAt: Date.now()
                    });
                    console.log(`[platformService] Stale selector flagged for ${detector.label} (${detector.pattern})`);
                    return {
                        success: true, status: 'logged_in', method: 'screenshot',
                        staleSelector: true,
                        message: 'AI verified login on ' + detector.label + ' (DOM selector may be outdated)',
                        reasoning
                    };
                }
                return { success: true, status: 'logged_in', method: 'screenshot', message: 'AI verified login on ' + detector.label, reasoning };
            }
            return { success: true, status: 'not_logged_in', method: 'screenshot', message: 'AI: not logged in on ' + detector.label, reasoning };
        } catch (err) {
            // Screenshot also failed — if we have no selector at all, report the error
            if (!detector.selector) {
                return { success: false, error: 'Screenshot verify failed: ' + err.message };
            }
            // Had selector but DOM failed, screenshot also failed → not logged in
        }
    }

    // ─── No selector and no verifier → can't verify ───
    if (!detector.selector) {
        if (!detector.loginRequired) {
            platformStore.updateConnectionStatus(sessionId, platformId, 'connected');
            return { success: true, status: 'logged_in', message: detector.label + ' does not require login.' };
        }
        return { success: true, status: 'unknown', message: 'No verification method available for ' + detector.label + '. Use manual confirmation.' };
    }

    // DOM failed, no screenshot verifier (or screenshot also failed)
    return { success: true, status: 'not_logged_in', message: 'Not logged in yet on ' + detector.label + '. Please complete login in the browser.' };
}

/**
 * Launch login flow for a platform.
 *
 * Resolves envId hierarchy: platform-level > session-level.
 * - If envId present: launches fingerprint browser via toolService, navigates to loginUrl.
 * - If no envId: returns plain URL for the frontend to window.open().
 *
 * @param {string} sessionId
 * @param {string} platformId
 * @param {object} [options]
 * @param {string} [options.sessionEnvId] - session-level fallback envId
 * @returns {Promise<object>} { method: 'fingerprint'|'url', ... }
 */
async function launchLogin(sessionId, platformId, options = {}) {
    const platform = platformStore.getPlatform(sessionId, platformId);
    if (!platform) {
        return { success: false, error: 'Platform not found' };
    }

    const envId = platform.envId || options.sessionEnvId || null;
    const loginUrl = platform.loginUrl || platform.url;

    if (!loginUrl) {
        return { success: false, error: 'No login URL configured for this platform' };
    }

    if (!envId) {
        // No fingerprint env — frontend opens URL in plain browser
        return { success: true, method: 'url', url: loginUrl };
    }

    // Fetch full env data from fingerPrintService via main server API
    const envData = await fetchEnvData(envId);
    if (!envData) {
        return { success: false, error: 'Fingerprint env not found: ' + envId + '. Check that the env exists in Chrome Manager.' };
    }

    // Fetch chromePath and savePath from server config
    const { chromePath, savePath } = await fetchPaths();
    if (!chromePath) {
        return { success: false, error: 'Chrome path not configured. Set it in Settings first.' };
    }

    // Build full env object with id for browserPool
    const env = { id: envId, ...envData };

    // If env has proxy configured, start the proxy and set proxyUrl/useProxy
    if (env.proxy && env.proxy.ipHost && env.proxy.ipPort) {
        const proxyRes = await fetchFromServer(`/api/startProxyForEnv/${encodeURIComponent(envId)}`, 'POST');
        if (proxyRes && proxyRes.success && proxyRes.data) {
            env.useProxy = true;
            env.proxyUrl = proxyRes.data.url;
            env.position = proxyRes.data.position || env.position;
            env.timeZone = proxyRes.data.timeZone || env.timeZone;
            env.webrtc_public = proxyRes.data.ip || env.webrtc_public;
        }
    }

    // Check if a browser already exists for this envId (shared browser)
    const existingBrowserId = _envBrowsers.get(envId);
    let browserId;
    let pageIndex;

    if (existingBrowserId) {
        // Reuse existing browser — open a new tab
        const newTab = await toolServiceClient.executeTool('page_new', {
            browserId: existingBrowserId,
            url: loginUrl,
            waitUntil: 'domcontentloaded'
        });
        if (!newTab.success) {
            // Browser dead — clean up stale reference, will launch fresh below
            console.log(`[platformService] Browser ${existingBrowserId} is dead, cleaning up`);
            _envBrowsers.delete(envId);
            // Also clear _browserId on any platforms that referenced it
            _clearStaleBrowserId(sessionId, existingBrowserId);
        } else {
            browserId = existingBrowserId;
            pageIndex = newTab.result.pageIndex;
        }
    }

    if (!browserId || pageIndex === undefined) {
        // Launch new fingerprint browser via toolService
        let launch = await toolServiceClient.executeTool('browser_launch', {
            env,
            chromePath,
            savePath,
            headless: false
        });

        // If launch failed (e.g. user data dir locked by existing browser),
        // try to recover: list active browsers and attempt to reuse one,
        // or close all and retry launch.
        if (!launch.success) {
            console.log(`[platformService] browser_launch failed: ${launch.error}, attempting recovery...`);
            try {
                // Ask toolService for active browsers — one might be the orphaned instance
                const listRes = await toolServiceClient.request('GET', '/browser/list');
                if (listRes.success && listRes.browsers && listRes.browsers.length > 0) {
                    // Try the most recent browser — open a new tab to test
                    const candidate = listRes.browsers[listRes.browsers.length - 1];
                    console.log(`[platformService] Found existing browser ${candidate.id}, attempting reuse...`);
                    const testTab = await toolServiceClient.executeTool('page_new', {
                        browserId: candidate.id,
                        url: loginUrl,
                        waitUntil: 'domcontentloaded'
                    });
                    if (testTab.success) {
                        browserId = candidate.id;
                        _envBrowsers.set(envId, browserId);
                        pageIndex = testTab.result.pageIndex;
                        console.log(`[platformService] Recovered orphaned browser ${browserId}`);
                    }
                }
            } catch (recoveryErr) {
                console.log(`[platformService] Recovery failed: ${recoveryErr.message}`);
            }

            // If still no browser, close all known browsers and retry
            if (!browserId) {
                try {
                    const allBrowsers = await toolServiceClient.request('GET', '/browser/list');
                    if (allBrowsers.browsers) {
                        for (const b of allBrowsers.browsers) {
                            try { await toolServiceClient.executeTool('browser_close', { browserId: b.id }); } catch (_) {}
                        }
                    }
                } catch (_) {}
                launch = await toolServiceClient.executeTool('browser_launch', {
                    env, chromePath, savePath, headless: false
                });
                if (!launch.success) {
                    return { success: false, error: 'Browser launch failed: ' + (launch.error || 'unknown') };
                }
                browserId = launch.result.browserId;
                _envBrowsers.set(envId, browserId);
            }
        } else {
            browserId = launch.result.browserId;
            _envBrowsers.set(envId, browserId);
        }

        if (pageIndex === undefined) {
            // Navigate to login page on the default tab
            await toolServiceClient.executeTool('page_goto', {
                browserId,
                url: loginUrl,
                waitFor: 3000
            });
            pageIndex = 0;
        }
    }

    // Store browserId + pageIndex on platform object for subsequent operations
    platform._browserId = browserId;
    platform._pageIndex = pageIndex;

    // Auto-verify: cookies from previous session may still be valid
    _syncToDashboard(sessionId, platformId, {
        cell: 'login', status: 'verifying',
        name: platform.name, icon: platform.icon, url: platform.url,
        message: 'Checking login status...'
    });

    try {
        const verifyResult = await verifyLogin(sessionId, platformId);
        if (verifyResult.status === 'logged_in') {
            // Cookie still valid — auto-verified, no manual action needed
            console.log(`[platformService] Auto-verified login on ${platform.name}: ${verifyResult.message}`);
            return {
                success: true,
                method: 'fingerprint',
                autoVerified: true,
                envId, browserId, pageIndex, loginUrl,
                message: verifyResult.message
            };
        }
    } catch (verifyErr) {
        console.log(`[platformService] Auto-verify failed for ${platform.name}: ${verifyErr.message}`);
    }

    // Not auto-verified — user needs to log in manually then click Confirm
    _syncToDashboard(sessionId, platformId, {
        cell: 'login', status: 'verifying',
        name: platform.name, icon: platform.icon, url: platform.url,
        message: 'Browser opened — log in then click Confirm'
    });

    return {
        success: true,
        method: 'fingerprint',
        autoVerified: false,
        envId, browserId, pageIndex, loginUrl,
        message: 'Please log in manually, then click Confirm.'
    };
}

/**
 * Confirm login — mark platform as connected.
 *
 * @param {string} sessionId
 * @param {string} platformId
 * @returns {object} { success, platform? }
 */
function confirmLogin(sessionId, platformId) {
    const result = platformStore.updateConnectionStatus(sessionId, platformId, 'connected');
    if (result.success) {
        _syncToDashboard(sessionId, platformId, { cell: 'login', status: 'verified', message: 'Login confirmed manually' });
    }
    return result;
}

/**
 * Bind a fingerprint environment to a platform.
 *
 * @param {string} sessionId
 * @param {string} platformId
 * @param {string|null} envId
 * @returns {object} { success, platform? }
 */
function bindEnv(sessionId, platformId, envId) {
    return platformStore.updatePlatform(sessionId, platformId, { envId: envId || null });
}

/**
 * Get the active browser for a platform (if fingerprint login was done).
 *
 * @param {string} sessionId
 * @param {string} platformId
 * @returns {string|null} browserId
 */
function getActiveBrowser(sessionId, platformId) {
    const platform = platformStore.getPlatform(sessionId, platformId);
    return platform ? (platform._browserId || null) : null;
}

/**
 * Close the active browser for a platform.
 *
 * @param {string} sessionId
 * @param {string} platformId
 * @returns {Promise<object>}
 */
async function closeBrowser(sessionId, platformId) {
    const platform = platformStore.getPlatform(sessionId, platformId);
    if (!platform || !platform._browserId) {
        return { success: false, error: 'No active browser for this platform' };
    }

    const browserId = platform._browserId;
    platform._browserId = null;
    platform._pageIndex = undefined;
    platformStore.updateConnectionStatus(sessionId, platformId, 'disconnected');

    // Check if any other platform in this session still uses the same browser
    const allPlatforms = platformStore.getPlatforms(sessionId) || [];
    const otherUsing = allPlatforms.some(p => p._browserId === browserId && p.id !== platformId);

    if (otherUsing) {
        // Other platforms still using this browser — don't close it
        return { success: true, message: 'Platform disconnected. Browser kept open for other platforms.' };
    }

    // No other platform uses this browser — close it and clean up env mapping
    for (const [envId, bid] of _envBrowsers) {
        if (bid === browserId) { _envBrowsers.delete(envId); break; }
    }

    const result = await toolServiceClient.executeTool('browser_close', {
        browserId
    });

    return result;
}

/**
 * Try to adopt a shared browser for a platform that has no _browserId.
 * If another platform with the same envId already has a browser open,
 * open a new tab in that browser for this platform.
 * Returns { success, browserId, pageIndex } or { success: false }.
 */
async function adoptSharedBrowser(sessionId, platformId) {
    const platform = platformStore.getPlatform(sessionId, platformId);
    if (!platform || platform._browserId) return { success: false };

    const envId = platform.envId;
    if (!envId) return { success: false };

    const sharedBrowserId = _envBrowsers.get(envId);
    if (!sharedBrowserId) return { success: false };

    try {
        const newTab = await toolServiceClient.executeTool('page_new', {
            browserId: sharedBrowserId,
            url: platform.url,
            waitUntil: 'networkidle'
        });
        if (!newTab.success) return { success: false };

        // Wait for dynamic content to render (login state, SPA hydration)
        await new Promise(r => setTimeout(r, 3000));

        platform._browserId = sharedBrowserId;
        platform._pageIndex = newTab.result.pageIndex;
        console.log(`[platformService] Adopted shared browser ${sharedBrowserId} for ${platform.name} (tab ${platform._pageIndex})`);
        return { success: true, browserId: sharedBrowserId, pageIndex: platform._pageIndex };
    } catch (err) {
        console.log(`[platformService] adoptSharedBrowser failed for ${platform.name}: ${err.message}`);
        return { success: false };
    }
}

module.exports = {
    launchLogin,
    verifyLogin,
    confirmLogin,
    bindEnv,
    getActiveBrowser,
    closeBrowser,
    adoptSharedBrowser,
    getDetector,
    setScreenshotVerifier,
    getStaleSelectorHints,
    clearStaleSelectorHint,
    LOGIN_DETECTORS,
    _envBrowsers,          // exposed for testing
    _staleSelectorHints    // exposed for testing
};
