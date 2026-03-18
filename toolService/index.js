'use strict';

const express = require('express');
const toolRegistry = require('./lib/toolRegistry');

const PORT = parseInt(process.env.TOOL_SERVICE_PORT || '30004', 10);
const CHROME_PATH = process.env.TOOL_SERVICE_CHROME_PATH || '';
const SAVE_PATH = process.env.TOOL_SERVICE_SAVE_PATH || '';

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

// ─── Browser Pool endpoints ───
const browserPool = require('./lib/browserPool');

// Launch browser, navigate to URL, return title
app.post('/browser/launch', async (req, res) => {
    try {
        const { env, headless } = req.body;
        const { browserId, mode } = await browserPool.launch({
            chromePath: CHROME_PATH,
            savePath: SAVE_PATH,
            env: env || undefined,
            headless: headless !== false
        });
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
