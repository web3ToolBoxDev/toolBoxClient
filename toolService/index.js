'use strict';

const express = require('express');
const toolRegistry = require('./lib/toolRegistry');

const PORT = parseInt(process.env.TOOL_SERVICE_PORT || '30004', 10);
const CHROME_PATH = process.env.TOOL_SERVICE_CHROME_PATH || '';
const SAVE_PATH = process.env.TOOL_SERVICE_SAVE_PATH || '';
const FP_CHROMIUM_PATH = process.env.FP_CHROMIUM_PATH || '';
if (FP_CHROMIUM_PATH) {
    console.log(`[toolService] Fingerprint Chromium path: ${FP_CHROMIUM_PATH}`);
}

const app = express();
app.use(express.json({ limit: '10mb' }));

// ─── Health ───
app.get('/health', (_req, res) => {
    res.json({ success: true, service: 'toolService', tools: toolRegistry.list().length });
});

// ─── Tool Registry API ───

// Register a tool (used by agents or built-in modules)
app.post('/tools/register', (req, res) => {
    try {
        const { name, description, parameters, category } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'name is required' });
        // Remote tools get a proxy handler that the caller must invoke via /tools/execute
        // For built-in tools, handler is set directly via toolRegistry.register()
        // For remote registration, we store a placeholder handler
        toolRegistry.register({
            name,
            description: description || '',
            parameters: parameters || {},
            category: category || 'domain',
            handler: async (params) => {
                // Placeholder — remote-registered tools must be called via /tools/execute
                // with the agent providing the actual execution
                return { placeholder: true, message: `Tool "${name}" is agent-managed` };
            }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// List all registered tools
app.get('/tools/list', (_req, res) => {
    res.json({ success: true, tools: toolRegistry.list() });
});

// Execute a tool
app.post('/tools/execute', async (req, res) => {
    const { name, params } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });
    const result = await toolRegistry.execute(name, params || {});
    res.json(result);
});

// ─── Config endpoint (browser paths etc.) ───
app.get('/config', (_req, res) => {
    res.json({
        chromePath: CHROME_PATH,
        savePath: SAVE_PATH
    });
});

// ─── Helpers ───
const http = require('http');

/**
 * Fetch env data from main backend by ID.
 * @param {string} envId
 * @returns {Promise<object|null>}
 */
async function fetchEnvById(envId) {
    const backendPort = process.env.BACKEND_PORT || '30001';
    return new Promise((resolve) => {
        http.get(`http://127.0.0.1:${backendPort}/api/getEnvById/${envId}`, (resp) => {
            let data = '';
            resp.on('data', chunk => data += chunk);
            resp.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const env = parsed.data || parsed;
                    if (env && (env.id || env._id)) {
                        if (!env.id) env.id = env._id;
                        resolve(env);
                    } else {
                        resolve(null);
                    }
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// ─── Browser Pool endpoints ───
const browserPool = require('./lib/browserPool');
const walletTools = require('./lib/walletTools');

// Launch browser, navigate to URL, return title
// Accepts either full `env` object or `envId` string (auto-loads from main backend)
app.post('/browser/launch', async (req, res) => {
    try {
        let { env, envId, headless, keepAlive, walletExtensionPath, useFingerprintChromium, fingerprintSeed } = req.body;

        // If envId provided but no full env, fetch from main backend
        if (!env && envId) {
            env = await fetchEnvById(envId);
            if (!env) console.warn('[browser/launch] Failed to fetch env by ID:', envId);
        }

        if (env && fingerprintSeed) env._fingerprintSeed = fingerprintSeed;

        const actualChromePath = (useFingerprintChromium && FP_CHROMIUM_PATH) ? FP_CHROMIUM_PATH : CHROME_PATH;
        const { browserId, mode } = await browserPool.launch({
            chromePath: actualChromePath,
            savePath: SAVE_PATH,
            env: env || undefined,
            headless: headless !== false,
            walletExtensionPath: walletExtensionPath || undefined,
            keepAlive: !!keepAlive,
            useFingerprintChromium: !!useFingerprintChromium
        });

        // Auto-remove from pool on browser disconnect
        browserPool.onDisconnected(browserId);

        res.json({ success: true, browserId, mode });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Close browser
app.post('/browser/close', async (req, res) => {
    try {
        await browserPool.close(req.body.browserId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// List active browsers
app.get('/browser/list', (_req, res) => {
    res.json({ success: true, browsers: browserPool.listBrowsers() });
});

// Set keepAlive on browser (prevent idle cleanup during long AI operations)
app.post('/browser/keepalive', (req, res) => {
    const { browserId, keepAlive } = req.body;
    if (!browserId) return res.status(400).json({ success: false, error: 'browserId required' });
    browserPool.setKeepAlive(browserId, keepAlive !== false);
    res.json({ success: true, browserId, keepAlive: keepAlive !== false });
});

// ─── Migrated script routes ───

// POST /browser/open-chrome — opens Chrome with fingerprint env, keeps alive
app.post('/browser/open-chrome', async (req, res) => {
    try {
        let { env, envId, keepAlive } = req.body;
        if (!env && envId) {
            env = await fetchEnvById(envId);
        }
        if (!env || !env.id) {
            return res.status(400).json({ success: false, error: 'env or envId is required' });
        }

        const { browserId, mode } = await browserPool.launch({
            chromePath: CHROME_PATH,
            savePath: SAVE_PATH,
            env,
            headless: false,
            keepAlive: keepAlive !== false // default true
        });

        browserPool.onDisconnected(browserId);
        res.json({ success: true, browserId, mode });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /browser/open-wallet — opens Chrome with MetaMask, unlocks wallet
app.post('/browser/open-wallet', async (req, res) => {
    try {
        let { env, envId, walletPassword, walletExtensionPath } = req.body;
        if (!env && envId) {
            env = await fetchEnvById(envId);
        }
        if (!env || !env.id) {
            return res.status(400).json({ success: false, error: 'env or envId is required' });
        }

        const extPath = walletExtensionPath || '';
        const { browserId, mode } = await browserPool.launch({
            chromePath: CHROME_PATH,
            savePath: SAVE_PATH,
            env,
            headless: false,
            walletExtensionPath: extPath,
            keepAlive: true
        });

        browserPool.onDisconnected(browserId);

        // Wait for MetaMask extension to load, then unlock
        const browser = browserPool.getBrowser(browserId);
        const password = walletPassword || 'web3toolbox';
        let unlocked = false;

        // Wait for MetaMask page to appear (extension opens a tab)
        for (let attempt = 0; attempt < 30; attempt++) {
            await new Promise(r => setTimeout(r, 1000));
            const pages = await browser.pages();
            if (pages.length >= 2) {
                const page = pages[pages.length - 1];
                const extensionId = await walletTools.loadMetaMaskId(browserId, browser);
                let retries = 0;
                while (retries < 3) {
                    try {
                        await page.goto(`chrome-extension://${extensionId}/home.html#unlock`);
                        await walletTools.unlockWallet(page, password);
                        unlocked = true;
                        break;
                    } catch (e) {
                        retries++;
                        console.log(`[open-wallet] Unlock attempt ${retries} failed:`, e.message);
                    }
                }
                break;
            }
        }

        res.json({ success: true, browserId, mode, unlocked });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /browser/init-wallet — opens Chrome with MetaMask, runs full onboarding
app.post('/browser/init-wallet', async (req, res) => {
    try {
        let { env, envId, seedPhrase, password, walletExtensionPath } = req.body;
        if (!env && envId) {
            env = await fetchEnvById(envId);
        }
        if (!env || !env.id) {
            return res.status(400).json({ success: false, error: 'env or envId is required' });
        }
        if (!seedPhrase) {
            return res.status(400).json({ success: false, error: 'seedPhrase is required' });
        }

        const extPath = walletExtensionPath || '';
        const { browserId, mode } = await browserPool.launch({
            chromePath: CHROME_PATH,
            savePath: SAVE_PATH,
            env,
            headless: false,
            walletExtensionPath: extPath,
            keepAlive: true
        });

        browserPool.onDisconnected(browserId);

        const browser = browserPool.getBrowser(browserId);
        const walletPassword = password || 'web3toolbox';
        const extensionId = await walletTools.loadMetaMaskId(browserId, browser);

        const page = await browser.newPage();
        await page.goto(`chrome-extension://${extensionId}/home.html#onboarding/welcome`);

        let initialized = false;
        try {
            await walletTools.initWalletOnPage(page, seedPhrase, walletPassword);
            initialized = true;
        } catch (err) {
            console.error('[init-wallet] Onboarding failed:', err.message);
            // Close browser on failure
            await browserPool.close(browserId);
            return res.status(500).json({ success: false, error: 'MetaMask onboarding failed: ' + err.message });
        }

        res.json({ success: true, browserId, mode, initialized });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /email/send — send email via SMTP
app.post('/email/send', async (req, res) => {
    try {
        const result = await toolRegistry.execute('email_send', req.body);
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// E2E test endpoint — launch, navigate, get title, close
app.post('/test/browser-launch', async (req, res) => {
    try {
        const { url, env, headless } = req.body;
        const { browserId, mode } = await browserPool.launch({
            chromePath: CHROME_PATH,
            savePath: SAVE_PATH,
            env: env || undefined,
            headless: headless !== false
        });
        const page = await browserPool.getPage(browserId);
        await page.goto(url || 'about:blank', { waitUntil: 'domcontentloaded', timeout: 30000 });
        const title = await page.title();
        res.json({ success: true, browserId, mode, title });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/test/browser-close', async (req, res) => {
    try {
        await browserPool.close(req.body.browserId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Register built-in tools ───
const browserTools = require('./lib/browserTools');
browserTools.registerAll();

const httpFetcher = require('./lib/httpFetcher');
httpFetcher.registerAll();

const captchaSolver = require('./lib/captchaSolver');
captchaSolver.registerAll();

const artifactRenderer = require('./lib/artifactRenderer');
artifactRenderer.registerAll();

walletTools.registerAll();

const emailTools = require('./lib/emailTools');
emailTools.registerAll();

// ─── Start ───
const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`[toolService] running on 127.0.0.1:${PORT}`);
    console.log(`[toolService] chromePath=${CHROME_PATH || '(not set)'}`);
    console.log(`[toolService] savePath=${SAVE_PATH || '(not set)'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[toolService] SIGTERM received, shutting down');
    server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
    server.close(() => process.exit(0));
});

module.exports = app; // for testing
