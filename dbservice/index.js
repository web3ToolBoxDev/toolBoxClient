'use strict';

const http = require('http');
const path = require('path');
const { TransformersEmbedder } = require('./lib/transformersEmbedder');
const { BridgeLLM } = require('./lib/bridgeLLM');

const PORT = parseInt(process.env.DBSERVICE_PORT || '30002', 10);
const SAVE_PATH = process.env.DBSERVICE_SAVE_PATH || '';

// Patch mem0 factories to support our custom embedder/LLM
const oss = require('mem0ai/oss');
const { Memory, EmbedderFactory, LLMFactory } = oss;

// Store custom instances to inject via factory
let _customEmbedder = null;
let _customLLM = null;

const _origEmbedderCreate = EmbedderFactory.create;
EmbedderFactory.create = function (provider, config) {
    if (provider === 'custom') return _customEmbedder;
    return _origEmbedderCreate.call(this, provider, config);
};

const _origLLMCreate = LLMFactory.create;
LLMFactory.create = function (provider, config) {
    if (provider === 'custom') return _customLLM;
    return _origLLMCreate.call(this, provider, config);
};

let memoryInstance = null;
let initPromise = null;
let initError = null;

// --------------- lazy init ---------------

async function getMemory(llmConfig = {}) {
    if (memoryInstance) return memoryInstance;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            _customEmbedder = new TransformersEmbedder();
            _customLLM = new BridgeLLM(llmConfig);

            const historyDbPath = SAVE_PATH
                ? path.join(SAVE_PATH, 'db', 'mem0_history.db')
                : path.join(__dirname, 'mem0_history.db');

            memoryInstance = new Memory({
                embedder: { provider: 'custom', config: {} },
                llm: { provider: 'custom', config: {} },
                vectorStore: {
                    provider: 'memory',
                    config: { collectionName: 'toolbox-memories', dimension: 384 }
                },
                historyDbPath,
                disableHistory: false
            });

            console.log(`[dbservice] Memory initialized (historyDb: ${historyDbPath})`);
            return memoryInstance;
        } catch (err) {
            initError = err;
            initPromise = null;
            console.error('[dbservice] Memory init failed:', err.message);
            throw err;
        }
    })();

    return initPromise;
}

// --------------- HTTP helpers ---------------

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => {
            try { resolve(JSON.parse(data)); } catch { resolve({}); }
        });
        req.on('error', reject);
    });
}

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

// --------------- routes ---------------

async function handleStore(req, res) {
    const body = await readBody(req);
    const { namespace, text, role, metadata, llmConfig } = body;

    if (!namespace || !text) {
        return sendJSON(res, 400, { success: false, error: 'namespace and text are required' });
    }

    try {
        // Update LLM config if provided (allows agent to pass its current provider)
        if (llmConfig && _customLLM) {
            if (llmConfig.apiKey) _customLLM.apiKey = llmConfig.apiKey;
            if (llmConfig.model) _customLLM.model = llmConfig.model;
            if (llmConfig.provider) _customLLM.provider = llmConfig.provider;
            if (llmConfig.baseURL) _customLLM.baseURL = llmConfig.baseURL;
        }
        const memory = await getMemory(llmConfig || {});
        const result = await memory.add(text, {
            userId: namespace,
            metadata: { role: role || 'user', ...metadata, timestamp: Date.now() }
        });
        sendJSON(res, 200, { success: true, result });
    } catch (err) {
        console.error('[dbservice] store error:', err.message);
        sendJSON(res, 500, { success: false, error: err.message });
    }
}

async function handleSearch(req, res) {
    const body = await readBody(req);
    const { namespace, query, topK } = body;

    if (!namespace || !query) {
        return sendJSON(res, 400, { success: false, error: 'namespace and query are required' });
    }

    try {
        const memory = await getMemory({});
        const results = await memory.search(query, {
            userId: namespace,
            limit: topK || 5
        });
        sendJSON(res, 200, { success: true, results: results || [] });
    } catch (err) {
        console.error('[dbservice] search error:', err.message);
        sendJSON(res, 500, { success: false, error: err.message });
    }
}

async function handleClear(req, res) {
    const body = await readBody(req);
    const { namespace } = body;

    if (!namespace) {
        return sendJSON(res, 400, { success: false, error: 'namespace is required' });
    }

    try {
        const memory = await getMemory({});
        await memory.deleteAll({ userId: namespace });
        sendJSON(res, 200, { success: true });
    } catch (err) {
        console.error('[dbservice] clear error:', err.message);
        sendJSON(res, 500, { success: false, error: err.message });
    }
}

async function handleHealth(req, res) {
    sendJSON(res, 200, {
        success: true,
        status: memoryInstance ? 'ready' : (initError ? 'error' : 'initializing'),
        error: initError ? initError.message : undefined,
        port: PORT,
        savePath: SAVE_PATH || '(default)'
    });
}

// --------------- server ---------------

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const url = req.url?.split('?')[0];

    try {
        if (url === '/health' && req.method === 'GET') {
            return await handleHealth(req, res);
        }
        if (url === '/memory/store' && req.method === 'POST') {
            return await handleStore(req, res);
        }
        if (url === '/memory/search' && req.method === 'POST') {
            return await handleSearch(req, res);
        }
        if (url === '/memory/clear' && req.method === 'DELETE') {
            return await handleClear(req, res);
        }
        sendJSON(res, 404, { success: false, error: 'Not found' });
    } catch (err) {
        console.error('[dbservice] Unhandled error:', err);
        sendJSON(res, 500, { success: false, error: err.message });
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[dbservice] Memory service listening on http://127.0.0.1:${PORT}`);
    // Pre-warm: start loading the embedding model in background
    getMemory({}).catch(() => {});
});

process.on('SIGTERM', () => {
    console.log('[dbservice] Received SIGTERM, shutting down');
    server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
    console.log('[dbservice] Received SIGINT, shutting down');
    server.close(() => process.exit(0));
});
