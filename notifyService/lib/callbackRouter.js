'use strict';

const http = require('http');
const channelRegistry = require('./channelRegistry');

// Callback target URL — workflow engine receives resolved actions
let _callbackUrl = process.env.NOTIFY_CALLBACK_URL || 'http://127.0.0.1:30003/api/notify/callback';

/**
 * Set callback URL (where to forward parsed actions).
 */
function setCallbackUrl(url) {
    _callbackUrl = url;
}

/**
 * Handle incoming webhook from a channel.
 * Parses the platform-specific payload and forwards the action to the callback URL.
 *
 * @param {string} channelType - 'telegram' | 'feishu'
 * @param {object} body - Raw webhook body
 * @param {object} headers - Request headers (for signature verification)
 * @returns {Promise<object>} - { forwarded, action?, error? }
 */
async function handle(channelType, body, headers) {
    const adapter = channelRegistry.getAdapter(channelType);
    if (!adapter || !adapter.parseWebhook) {
        return { forwarded: false, error: `No webhook parser for ${channelType}` };
    }

    const parsed = adapter.parseWebhook(body, headers);
    if (!parsed) {
        return { forwarded: false, error: 'Could not parse webhook payload' };
    }

    // Forward to workflow engine
    try {
        const result = await _forwardCallback({
            source: channelType,
            userId: parsed.userId,
            messageId: parsed.messageId,
            text: parsed.text,
            callbackData: parsed.callbackData,
            timestamp: new Date().toISOString()
        });
        return { forwarded: true, action: parsed.callbackData || parsed.text, result };
    } catch (err) {
        console.error(`[callbackRouter] Forward failed:`, err.message);
        return { forwarded: false, error: err.message };
    }
}

/**
 * Forward parsed callback to the workflow engine.
 */
function _forwardCallback(payload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const url = new URL(_callbackUrl);
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
            timeout: 10000
        }, (res) => {
            let buf = '';
            res.on('data', c => { buf += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(buf)); }
                catch (_) { resolve({ raw: buf }); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Callback forward timeout')); });
        req.write(data);
        req.end();
    });
}

module.exports = { handle, setCallbackUrl };
