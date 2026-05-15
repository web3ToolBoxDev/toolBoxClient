'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const config = require('../../config').getInstance();

const TOOL_SERVICE_PORT = 30004;
const TOOL_SERVICE_URL = `http://127.0.0.1:${TOOL_SERVICE_PORT}`;

let toolProcess = null;
let isStarting = false;

/**
 * Spawn the toolService process using the bundled Node.js.
 * Same pattern as memoryService.js → dbservice.
 */
function startToolService() {
    if (toolProcess || isStarting) return;
    isStarting = true;

    const execPath = config.getDefaultExecPath();
    // In packaged app: toolService is in extraResources (resources/toolService/)
    // In dev: toolService is at repo root (../../toolService/)
    const isBuild = config.getIsBuild();
    const toolServicePath = isBuild
        ? path.resolve(__dirname, '../../../toolService/index.js')
        : path.resolve(__dirname, '../../toolService/index.js');

    // Read chromePath from savePath.json
    let chromePath = '';
    let savePath = '';
    try {
        const savePathConfig = config.getSavePath();
        savePath = (savePathConfig && savePathConfig.path) || '';
    } catch (_) {}
    try {
        const chromePathConfig = config.getChromePath();
        chromePath = (chromePathConfig && chromePathConfig.path) || '';
    } catch (_) {}

    // Fallback: read from assets/savePath.json directly
    if (!chromePath) {
        try {
            const savePathJson = path.resolve(__dirname, '../../assets/savePath.json');
            if (fs.existsSync(savePathJson)) {
                const data = JSON.parse(fs.readFileSync(savePathJson, 'utf-8'));
                chromePath = data.chromePath || '';
                if (!savePath) savePath = data.path || '';
            }
        } catch (_) {}
    }

    // Fallback: read from %APPDATA%/web3toolbox/savePath.json (dev mode without APP_USER_DATA)
    if (!chromePath || !savePath) {
        try {
            const appData = process.env.APPDATA || (process.platform === 'darwin'
                ? path.join(require('os').homedir(), 'Library', 'Application Support')
                : path.join(require('os').homedir(), '.config'));
            const userDataJson = path.join(appData, 'web3toolbox', 'savePath.json');
            if (fs.existsSync(userDataJson)) {
                const data = JSON.parse(fs.readFileSync(userDataJson, 'utf-8'));
                if (!chromePath) chromePath = data.chromePath || '';
                if (!savePath) savePath = data.path || '';
            }
        } catch (_) {}
    }

    const config = require('../../config').getInstance();
    const fpChromRes = config.getFingerprintChromiumPath();
    const env = {
        ...process.env,
        TOOL_SERVICE_PORT: String(TOOL_SERVICE_PORT),
        TOOL_SERVICE_CHROME_PATH: chromePath,
        TOOL_SERVICE_SAVE_PATH: savePath,
        FP_CHROMIUM_PATH: fpChromRes.success ? fpChromRes.path : ''
    };

    console.log(`[toolServiceManager] Spawning toolService: ${execPath} ${toolServicePath}`);
    console.log(`[toolServiceManager] chromePath=${chromePath ? '(set)' : '(empty)'}, savePath=${savePath ? '(set)' : '(empty)'}`);

    toolProcess = spawn(execPath, [toolServicePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        windowsHide: true
    });

    toolProcess.stdout.on('data', (data) => {
        console.log(`[toolService] ${data.toString().trim()}`);
    });
    toolProcess.stderr.on('data', (data) => {
        console.error(`[toolService:err] ${data.toString().trim()}`);
    });
    toolProcess.on('exit', (code, signal) => {
        console.log(`[toolServiceManager] toolService exited (code=${code}, signal=${signal})`);
        toolProcess = null;
        isStarting = false;
    });
    toolProcess.on('error', (err) => {
        console.error('[toolServiceManager] Failed to spawn toolService:', err.message);
        toolProcess = null;
        isStarting = false;
    });

    isStarting = false;
}

/**
 * Stop the toolService process.
 */
function stopToolService() {
    if (toolProcess) {
        toolProcess.kill('SIGTERM');
        toolProcess = null;
    }
}

/**
 * Restart toolService (stop + start). For dev hot-reload of toolService code.
 */
async function restartToolService() {
    stopToolService();
    // Wait for process to exit
    await new Promise(r => setTimeout(r, 1000));
    startToolService();
    // Wait for it to be ready
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        try {
            const result = await proxyToToolService('GET', '/health');
            if (result.statusCode === 200) return { success: true };
        } catch {}
    }
    return { success: false, error: 'toolService did not become healthy after restart' };
}

/**
 * Forward an HTTP request to the toolService.
 */
function proxyToToolService(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1',
            port: TOOL_SERVICE_PORT,
            path: urlPath,
            method,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
                } catch {
                    resolve({ statusCode: res.statusCode, data });
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.setTimeout(120000, () => {
            req.destroy(new Error('Proxy request to toolService timed out'));
        });

        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// --- Express route handlers (proxy to toolService) ---

async function handleHealth(req, res) {
    try {
        const result = await proxyToToolService('GET', '/health');
        res.status(result.statusCode).json(result.data);
    } catch (err) {
        res.status(503).json({ success: false, error: 'Tool service unavailable', detail: err.message });
    }
}

async function handleListTools(req, res) {
    try {
        const result = await proxyToToolService('GET', '/tools/list');
        res.status(result.statusCode).json(result.data);
    } catch (err) {
        res.status(503).json({ success: false, error: 'Tool service unavailable', detail: err.message });
    }
}

async function handleRegisterTool(req, res) {
    try {
        const result = await proxyToToolService('POST', '/tools/register', req.body);
        res.status(result.statusCode).json(result.data);
    } catch (err) {
        res.status(503).json({ success: false, error: 'Tool service unavailable', detail: err.message });
    }
}

async function handleExecuteTool(req, res) {
    try {
        const result = await proxyToToolService('POST', '/tools/execute', req.body);
        res.status(result.statusCode).json(result.data);
    } catch (err) {
        res.status(503).json({ success: false, error: 'Tool service unavailable', detail: err.message });
    }
}

async function handleRestart(req, res) {
    try {
        const result = await restartToolService();
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

module.exports = {
    startToolService,
    stopToolService,
    restartToolService,
    handleHealth,
    handleListTools,
    handleRegisterTool,
    handleExecuteTool,
    handleRestart
};
