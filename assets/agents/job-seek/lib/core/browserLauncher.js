'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

/**
 * Build Chrome launch args from env fingerprint data.
 * Extracted from openChrome.js / openWallet.js patterns.
 *
 * @param {object} env - Fingerprint environment object
 * @param {object} [options] - Extra options
 * @param {string} [options.walletExtensionPath] - Path to MetaMask extension dir
 * @returns {string[]} Chrome args array
 */
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

/**
 * Ensure the user data directory exists.
 * @param {string} savePath - Base save path
 * @param {string} envId - Environment ID (used as subfolder)
 * @returns {string} The full userDataDir path
 */
function ensureUserDataDir(savePath, envId) {
    const userDataDir = path.join(savePath, envId);
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }
    return userDataDir;
}

/**
 * Launch a Chrome browser with fingerprint/proxy configuration.
 * Requires puppeteer-extra to be installed in the calling context.
 *
 * @param {object} params
 * @param {string} params.chromePath - Path to Chrome executable
 * @param {string} params.savePath - Base save path for user data dirs
 * @param {object} params.env - Fingerprint environment object (must have .id, .user_agent, etc.)
 * @param {object} [params.wallet] - Optional wallet data (triggers MetaMask loading)
 * @param {string} [params.walletExtensionPath] - Path to MetaMask extension directory
 * @param {function} [params.onLog] - Callback for log messages
 * @returns {Promise<{browser: object, pages: object[]}>}
 */
async function launchBrowser(params) {
    const { chromePath, savePath, env, wallet, walletExtensionPath, onLog } = params;
    const log = onLog || console.log;

    if (!chromePath) throw new Error('chromePath is required');
    if (!savePath) throw new Error('savePath is required');
    if (!env || !env.id) throw new Error('env with id is required');

    const userDataDir = ensureUserDataDir(savePath, env.id);
    const args = buildChromeArgs(env, {
        walletExtensionPath: wallet ? walletExtensionPath : undefined
    });

    let puppeteer;
    try {
        puppeteer = require('puppeteer-extra');
    } catch (_) {
        puppeteer = require('puppeteer');
    }

    log(`Launching browser for env=${env.id}, proxy=${env.useProxy ? 'yes' : 'no'}, wallet=${wallet ? 'yes' : 'no'}`);

    const browser = await puppeteer.launch({
        headless: false,
        executablePath: chromePath,
        ignoreDefaultArgs: ['--enable-automation'],
        userDataDir,
        args,
        defaultViewport: null
    });

    const pages = await browser.pages();

    if (wallet && walletExtensionPath) {
        log('Loading MetaMask extension...');
        try {
            await unlockMetaMask(browser, log);
        } catch (err) {
            log(`MetaMask unlock failed: ${err.message}`);
        }
    }

    return { browser, pages: await browser.pages() };
}

/**
 * Attempt to unlock MetaMask in the browser.
 * @param {object} browser - Puppeteer browser instance
 * @param {function} log - Log callback
 */
async function unlockMetaMask(browser, log) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Load or discover extension ID
    let extensionId;
    const infoPath = path.join(__dirname, '..', '..', 'extensionInfo.json');
    try {
        const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
        extensionId = info.extensionId;
    } catch (_) {
        // Discover from chrome://extensions
        const extPage = await browser.newPage();
        await extPage.goto('chrome://extensions/');
        await sleep(5000);
        extensionId = await extPage.evaluate(() => {
            const mgr = document.querySelectorAll('extensions-manager');
            return mgr[0]?.shadowRoot?.querySelector('extensions-item-list')
                ?.shadowRoot?.querySelector('extensions-item')?.getAttribute('id') || '';
        });
        await extPage.close();
        if (extensionId) {
            try { fs.writeFileSync(infoPath, JSON.stringify({ extensionId }), 'utf-8'); } catch (_e) {}
        }
    }

    if (!extensionId) {
        throw new Error('Could not find MetaMask extension ID');
    }

    log(`MetaMask ID: ${extensionId}`);

    // Wait for extension page to appear, then unlock
    let unlocked = false;
    for (let attempt = 0; attempt < 3 && !unlocked; attempt++) {
        try {
            const pages = await browser.pages();
            const page = pages[pages.length - 1];
            await page.goto(`chrome-extension://${extensionId}/home.html#unlock`);
            await page.bringToFront();

            const passwordInput = await page.waitForSelector('input[data-testid="unlock-password"]', {
                visible: true,
                timeout: 30000
            });
            await passwordInput.type('web3toolbox', { delay: 100 });

            const unlockButton = await page.waitForSelector('button[data-testid="unlock-submit"]', { visible: true });
            await unlockButton.click();
            unlocked = true;
            log('MetaMask unlocked successfully');
        } catch (err) {
            log(`MetaMask unlock attempt ${attempt + 1} failed: ${err.message}`);
            await sleep(2000);
        }
    }

    if (!unlocked) {
        throw new Error('Failed to unlock MetaMask after 3 attempts');
    }
}

module.exports = { buildChromeArgs, ensureUserDataDir, launchBrowser };
