'use strict';

const browserPool = require('./browserPool');
const toolRegistry = require('./toolRegistry');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ensure a page is active (bring to front, small wait).
 */
async function ensurePageActive(page) {
    if (!page || page.isClosed()) return;
    try {
        await sleep(1000);
        await page.bringToFront();
        await sleep(300);
    } catch (error) {
        const message = error?.message || String(error || '');
        if (!message.includes('LavaMoat')) {
            console.warn('[walletTools] Failed to ensure page is active:', message);
        }
    }
}

/**
 * Get MetaMask extension ID by navigating to chrome://extensions/.
 */
async function getMetaMaskId(browser) {
    const page = await browser.newPage();
    await page.goto('chrome://extensions/');
    await sleep(5000);
    const extensionId = await page.evaluate(() => {
        const extensions = document.querySelectorAll('extensions-manager');
        const extension = extensions[0].shadowRoot
            .querySelector('extensions-item-list').shadowRoot
            .querySelector('extensions-item').getAttribute('id');
        return extension;
    });
    await page.close();
    return extensionId;
}

/**
 * Load MetaMask ID — uses a cached map per browserId to avoid re-querying.
 */
const _extensionIdCache = new Map();

async function loadMetaMaskId(browserId, browser) {
    if (_extensionIdCache.has(browserId)) {
        return _extensionIdCache.get(browserId);
    }
    const id = await getMetaMaskId(browser);
    _extensionIdCache.set(browserId, id);
    return id;
}

/**
 * Unlock MetaMask wallet on a given page.
 * @param {object} page - Puppeteer page
 * @param {string} password - Wallet password
 */
async function unlockWallet(page, password) {
    await page.bringToFront();
    console.log('[walletTools] Starting wallet unlock');

    const passwordInput = await page.waitForSelector('input[data-testid="unlock-password"]', {
        visible: true,
        timeout: 30000
    });
    await passwordInput.type(password, { delay: 100 });

    const unlockButton = await page.waitForSelector('button[data-testid="unlock-submit"]', { visible: true });
    await unlockButton.click();
    return true;
}

/**
 * Full MetaMask onboarding/import flow.
 * @param {object} page - Puppeteer page
 * @param {string} seedPhrase - Mnemonic seed phrase
 * @param {string} password - Wallet password to set
 */
async function initWalletOnPage(page, seedPhrase, password) {
    // Get Started phase
    await ensurePageActive(page);
    try {
        const startButton = await page.waitForSelector('[data-testid="onboarding-get-started-button"]', { visible: true, timeout: 10000 });
        await ensurePageActive(page);
        await startButton.click();

        const termCheckbox = await page.waitForSelector('.terms-of-use__checkbox', { visible: true });
        await ensurePageActive(page);
        await termCheckbox.click();

        await page.evaluate(() => {
            const termsBox = document.querySelector('.terms-of-use-popup__body');
            termsBox.scrollTop = termsBox.scrollHeight;
        });

        const acceptButton = await page.waitForSelector('button[data-testid="terms-of-use-agree-button"]', { visible: true });
        await page.evaluate((button) => button.removeAttribute('disabled'), acceptButton);
        await ensurePageActive(page);
        await acceptButton.click();
    } catch (error) {
        console.log('[walletTools] Get Started phase may already be passed:', error.message);
    }

    // Import wallet
    const importWalletButton = await page.waitForSelector('[data-testid="onboarding-import-wallet"]', { visible: true });
    await ensurePageActive(page);
    await importWalletButton.click();

    const importWithSeedPhraseButton = await page.waitForSelector('[data-testid="onboarding-import-with-srp-button"]', { visible: true });
    await ensurePageActive(page);
    await importWithSeedPhraseButton.click();

    // Enter seed phrase
    const seedPhraseInput = await page.waitForSelector('textarea[data-testid="srp-input-import__srp-note"]', { visible: true });
    await ensurePageActive(page);
    await seedPhraseInput.type(seedPhrase, { delay: 100 });

    const srpConfirmButton = await page.waitForSelector('button[data-testid="import-srp-confirm"]', { visible: true });
    await ensurePageActive(page);
    await srpConfirmButton.click();

    // Create password
    const passwordInput = await page.waitForSelector('input[data-testid="create-password-new-input"]', { visible: true });
    await ensurePageActive(page);
    await passwordInput.type(password, { delay: 100 });

    const passwordConfirmInput = await page.waitForSelector('input[data-testid="create-password-confirm-input"]', { visible: true });
    await ensurePageActive(page);
    await passwordConfirmInput.type(password, { delay: 100 });

    const termsCheckbox = await page.waitForSelector('input[data-testid="create-password-terms"]', { visible: true });
    await ensurePageActive(page);
    await termsCheckbox.click();

    const passwordSubmitButton = await page.waitForSelector('button[data-testid="create-password-submit"]', { visible: true });
    await ensurePageActive(page);
    await passwordSubmitButton.click();

    // No thanks to metrics
    const noThanksButton = await page.waitForSelector('button[data-testid="metametrics-no-thanks"]', { visible: true });
    await ensurePageActive(page);
    await noThanksButton.click();

    // All done
    const allDoneButton = await page.waitForSelector('button[data-testid="onboarding-complete-done"]', { visible: true });
    await ensurePageActive(page);
    await allDoneButton.click();

    // Continue / Download app
    const continueButton = await page.waitForSelector('button[data-testid="download-app-continue"]', { visible: true });
    await ensurePageActive(page);
    await continueButton.click();

    // Pin extension done
    const pinDoneButton = await page.waitForSelector('button[data-testid="pin-extension-done"]', { visible: true });
    await ensurePageActive(page);
    await pinDoneButton.click();

    await sleep(3000);
}

function registerAll() {
    toolRegistry.register({
        name: 'wallet_unlock',
        description: 'Unlock MetaMask wallet on an already-open browser.',
        parameters: {
            type: 'object',
            properties: {
                browserId: { type: 'string', description: 'Browser instance ID' },
                password: { type: 'string', description: 'Wallet password' }
            },
            required: ['browserId', 'password']
        },
        category: 'wallet',
        handler: async ({ browserId, password }) => {
            const browser = browserPool.getBrowser(browserId);
            if (!browser) throw new Error(`Browser ${browserId} not found`);
            const extensionId = await loadMetaMaskId(browserId, browser);
            const page = await browserPool.getPage(browserId);
            await page.goto(`chrome-extension://${extensionId}/home.html#unlock`);
            await unlockWallet(page, password);
            return { unlocked: true, extensionId };
        }
    });

    toolRegistry.register({
        name: 'wallet_init',
        description: 'Run full MetaMask onboarding/import on an already-open browser.',
        parameters: {
            type: 'object',
            properties: {
                browserId: { type: 'string', description: 'Browser instance ID' },
                seedPhrase: { type: 'string', description: 'Mnemonic seed phrase' },
                password: { type: 'string', description: 'Wallet password to set' }
            },
            required: ['browserId', 'seedPhrase', 'password']
        },
        category: 'wallet',
        handler: async ({ browserId, seedPhrase, password }) => {
            const browser = browserPool.getBrowser(browserId);
            if (!browser) throw new Error(`Browser ${browserId} not found`);
            const extensionId = await loadMetaMaskId(browserId, browser);
            const page = await browser.newPage();
            await page.goto(`chrome-extension://${extensionId}/home.html#onboarding/welcome`);
            await initWalletOnPage(page, seedPhrase, password);
            return { initialized: true, extensionId };
        }
    });

    console.log('[walletTools] Registered 2 wallet tools');
}

module.exports = {
    registerAll,
    // Exported for direct use by routes
    unlockWallet,
    initWalletOnPage,
    loadMetaMaskId,
    ensurePageActive
};
