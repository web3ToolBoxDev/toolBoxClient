'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const config = require('../../config').getInstance();

const NOTIFY_PORT = 30005;
const NOTIFY_URL = `http://127.0.0.1:${NOTIFY_PORT}`;

let notifyProcess = null;
let isStarting = false;

/**
 * Spawn the notifyService process.
 */
function startNotifyService() {
    if (notifyProcess || isStarting) return;
    isStarting = true;

    const execPath = config.getDefaultExecPath();
    const isBuild = config.getIsBuild();
    const servicePath = isBuild
        ? path.resolve(__dirname, '../../../notifyService/index.js')
        : path.resolve(__dirname, '../../notifyService/index.js');

    const env = {
        ...process.env,
        NOTIFY_SERVICE_PORT: String(NOTIFY_PORT)
    };

    // Ensure ComSpec on Windows (same pattern as taskService)
    if (process.platform === 'win32' && !env.ComSpec && !env.COMSPEC) {
        env.ComSpec = `${process.env.SystemRoot || 'C:\\Windows'}\\system32\\cmd.exe`;
    }

    console.log(`[notifyServiceManager] Spawning: ${execPath} ${servicePath}`);

    notifyProcess = spawn(execPath, [servicePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        windowsHide: true
    });

    notifyProcess.stdout.on('data', (data) => {
        console.log(`[notifyService] ${data.toString().trim()}`);
    });
    notifyProcess.stderr.on('data', (data) => {
        console.error(`[notifyService:err] ${data.toString().trim()}`);
    });
    notifyProcess.on('exit', (code, signal) => {
        console.log(`[notifyServiceManager] exited (code=${code}, signal=${signal})`);
        notifyProcess = null;
        isStarting = false;
    });
    notifyProcess.on('error', (err) => {
        console.error('[notifyServiceManager] Spawn failed:', err.message);
        notifyProcess = null;
        isStarting = false;
    });

    isStarting = false;
}

/**
 * Stop the notifyService.
 */
function stopNotifyService() {
    if (notifyProcess) {
        notifyProcess.kill('SIGTERM');
        notifyProcess = null;
    }
}

/**
 * Check if notifyService is running and responsive.
 */
function healthCheck() {
    return new Promise((resolve) => {
        const req = http.get(`${NOTIFY_URL}/notify/status`, { timeout: 3000 }, (res) => {
            let buf = '';
            res.on('data', c => { buf += c; });
            res.on('end', () => {
                try {
                    const r = JSON.parse(buf);
                    resolve({ healthy: r.status === 'ok', data: r });
                } catch (_) { resolve({ healthy: false }); }
            });
        });
        req.on('error', () => resolve({ healthy: false }));
        req.on('timeout', () => { req.destroy(); resolve({ healthy: false }); });
    });
}

// ─── HTTP Client (for other services to send notifications) ───

/**
 * Send a notification via the notifyService HTTP API.
 * @param {object} payload - { type, title, body, actions, priority, channels, metadata }
 * @returns {Promise<object>}
 */
function send(payload) {
    return _post('/notify/send', payload);
}

/**
 * Send a file notification.
 * @param {object} payload - { filePath, fileName, caption, channels, metadata }
 */
function sendFile(payload) {
    return _post('/notify/send-file', payload);
}

function _post(urlPath, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(`${NOTIFY_URL}${urlPath}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
            timeout: 10000
        }, (res) => {
            let buf = '';
            res.on('data', c => { buf += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(buf)); }
                catch (_) { resolve({ success: false, error: 'Invalid response' }); }
            });
        });
        req.on('error', (err) => resolve({ success: false, error: err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
        req.write(data);
        req.end();
    });
}

module.exports = {
    startNotifyService,
    stopNotifyService,
    healthCheck,
    send,
    sendFile,
    NOTIFY_PORT,
    NOTIFY_URL
};
