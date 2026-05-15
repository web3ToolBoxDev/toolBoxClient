'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const DBSERVICE_PORT = 30002;
const DBSERVICE_URL = `http://127.0.0.1:${DBSERVICE_PORT}`;

let dbProcess = null;
let isStarting = false;

/**
 * Spawn the dbservice process using the bundled Node.js.
 * Called once during server startup.
 */
function startDbService() {
    if (dbProcess || isStarting) return;
    isStarting = true;
    const config = require('../../config').getInstance();

    const execPath = config.getDefaultExecPath();
    const isBuild = config.getIsBuild();
    const dbservicePath = isBuild
        ? path.resolve(__dirname, '../../../dbservice/index.js')
        : path.resolve(__dirname, '../../dbservice/index.js');

    const savePath = config.getSavePath();
    const env = {
        ...process.env,
        DBSERVICE_PORT: String(DBSERVICE_PORT),
        DBSERVICE_SAVE_PATH: (savePath && savePath.path) || ''
    };

    console.log(`[memoryService] Spawning dbservice: ${execPath} ${dbservicePath}`);

    dbProcess = spawn(execPath, [dbservicePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        windowsHide: true
    });

    dbProcess.stdout.on('data', (data) => {
        console.log(`[dbservice] ${data.toString().trim()}`);
    });
    dbProcess.stderr.on('data', (data) => {
        console.error(`[dbservice:err] ${data.toString().trim()}`);
    });
    dbProcess.on('exit', (code, signal) => {
        console.log(`[memoryService] dbservice exited (code=${code}, signal=${signal})`);
        dbProcess = null;
        isStarting = false;
        if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
            console.log('[memoryService] Auto-restarting dbservice in 2s...');
            setTimeout(() => startDbService(), 2000);
        }
    });
    dbProcess.on('error', (err) => {
        console.error('[memoryService] Failed to spawn dbservice:', err.message);
        dbProcess = null;
        isStarting = false;
    });

    isStarting = false;
}

/**
 * Stop the dbservice process.
 */
function stopDbService() {
    if (dbProcess) {
        dbProcess.kill('SIGTERM');
        dbProcess = null;
    }
}

/**
 * Forward an HTTP request to the dbservice.
 */
function proxyToDbService(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1',
            port: DBSERVICE_PORT,
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

        req.on('error', (err) => {
            reject(err);
        });
        req.setTimeout(120000, () => {
            req.destroy(new Error('Proxy request to dbservice timed out'));
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

// --- Express route handlers ---

async function handleHealth(req, res) {
    try {
        const result = await proxyToDbService('GET', '/health');
        res.status(result.statusCode).json(result.data);
    } catch (err) {
        res.status(503).json({ success: false, error: 'Memory service unavailable', detail: err.message });
    }
}

async function handleStore(req, res) {
    try {
        const result = await proxyToDbService('POST', '/memory/store', req.body);
        res.status(result.statusCode).json(result.data);
    } catch (err) {
        res.status(503).json({ success: false, error: 'Memory service unavailable', detail: err.message });
    }
}

async function handleSearch(req, res) {
    try {
        const result = await proxyToDbService('POST', '/memory/search', req.body);
        res.status(result.statusCode).json(result.data);
    } catch (err) {
        res.status(503).json({ success: false, error: 'Memory service unavailable', detail: err.message });
    }
}

async function handleClear(req, res) {
    try {
        const result = await proxyToDbService('DELETE', '/memory/clear', req.body);
        res.status(result.statusCode).json(result.data);
    } catch (err) {
        res.status(503).json({ success: false, error: 'Memory service unavailable', detail: err.message });
    }
}

/**
 * Restart dbservice with updated savePath.
 * Called when user changes savePath in settings.
 */
async function restartDbService() {
    console.log('[memoryService] Restarting dbservice (savePath changed)...');
    stopDbService();
    // Wait for process to fully exit
    await new Promise(resolve => setTimeout(resolve, 500));
    startDbService();
    // Wait for dbservice to be ready
    for (let i = 0; i < 10; i++) {
        try {
            const result = await proxyToDbService('GET', '/health');
            if (result.statusCode === 200) {
                console.log('[memoryService] dbservice restarted successfully');
                return { success: true };
            }
        } catch { /* not ready yet */ }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.error('[memoryService] dbservice did not become healthy after restart');
    return { success: false, error: 'dbservice did not become healthy after restart' };
}

module.exports = {
    startDbService,
    stopDbService,
    restartDbService,
    handleHealth,
    handleStore,
    handleSearch,
    handleClear
};
