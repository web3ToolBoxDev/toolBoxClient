'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * Feishu (Lark) Bot adapter.
 *
 * Config: { appId: string, appSecret: string, chatId: string }
 *   OR webhook mode: { webhookUrl: string }
 *
 * Supports:
 * - Interactive message cards with action buttons
 * - File sending via Feishu upload + share API
 * - Webhook inbound event parsing
 */

let _tokenCache = { token: null, expiresAt: 0 };

// ─── Auth ───

async function _getTenantToken(appId, appSecret) {
    if (_tokenCache.token && Date.now() < _tokenCache.expiresAt) {
        return _tokenCache.token;
    }
    const result = await _httpsPost('open.feishu.cn', '/open-apis/auth/v3/tenant_access_token/internal', {
        app_id: appId,
        app_secret: appSecret
    });
    if (result.code !== 0) throw new Error(`Feishu auth failed: ${result.msg}`);
    _tokenCache = {
        token: result.tenant_access_token,
        expiresAt: Date.now() + (result.expire - 300) * 1000 // refresh 5min early
    };
    return _tokenCache.token;
}

// ─── Send Message ───

/**
 * Send notification as interactive card with optional buttons.
 */
async function send(config, message) {
    // Webhook mode (simple, no auth)
    if (config.webhookUrl) {
        return _sendWebhook(config.webhookUrl, message);
    }

    // App mode (full API with buttons)
    const token = await _getTenantToken(config.appId, config.appSecret);
    const icon = message.priority === 'high' ? '🔴' : message.priority === 'normal' ? '🔵' : 'ℹ️';

    const card = {
        config: { wide_screen_mode: true },
        header: {
            title: { tag: 'plain_text', content: `${icon} ${message.title || 'Notification'}` },
            template: message.priority === 'high' ? 'red' : 'blue'
        },
        elements: [
            { tag: 'div', text: { tag: 'plain_text', content: message.body || '' } }
        ]
    };

    // Add action buttons
    if (message.actions && message.actions.length > 0) {
        card.elements.push({
            tag: 'action',
            actions: message.actions.map(a => ({
                tag: 'button',
                text: { tag: 'plain_text', content: a.label },
                type: 'primary',
                value: { callback: a.callback || a.label }
            }))
        });
    }

    const body = {
        receive_id: config.chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card)
    };

    const result = await _httpsPost('open.feishu.cn', '/open-apis/im/v1/messages?receive_id_type=chat_id', body, {
        Authorization: `Bearer ${token}`
    });

    if (result.code !== 0) throw new Error(`Feishu send failed: ${result.msg}`);
    return { messageId: result.data?.message_id || null };
}

/**
 * Simple webhook send (no buttons, just text + card).
 */
async function _sendWebhook(webhookUrl, message) {
    const url = new URL(webhookUrl);
    const icon = message.priority === 'high' ? '🔴' : '🔵';
    const body = {
        msg_type: 'interactive',
        card: {
            header: {
                title: { tag: 'plain_text', content: `${icon} ${message.title || 'Notification'}` },
                template: message.priority === 'high' ? 'red' : 'blue'
            },
            elements: [
                { tag: 'div', text: { tag: 'plain_text', content: message.body || '' } }
            ]
        }
    };

    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
            timeout: 15000
        }, (res) => {
            let buf = '';
            res.on('data', c => { buf += c; });
            res.on('end', () => {
                try {
                    const r = JSON.parse(buf);
                    if (r.code === 0 || r.StatusCode === 0) resolve({ messageId: null });
                    else reject(new Error(r.msg || 'Feishu webhook error'));
                } catch (_) { reject(new Error('Invalid Feishu response')); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Feishu webhook timeout')); });
        req.write(data);
        req.end();
    });
}

/**
 * Send file via Feishu (upload + share).
 */
async function sendFile(config, file) {
    if (config.webhookUrl) {
        // Webhook mode can't send files — send text fallback
        return send(config, {
            type: 'info',
            title: 'File Available',
            body: `📎 ${file.fileName || path.basename(file.filePath)}\n${file.caption || ''}`,
            actions: [],
            priority: 'low'
        });
    }

    // TODO: Implement Feishu file upload API when needed
    // For now, send text notification about the file
    return send(config, {
        type: 'info',
        title: '📎 File Ready',
        body: `${file.fileName || path.basename(file.filePath)}\n${file.caption || ''}`,
        actions: [],
        priority: 'low'
    });
}

/**
 * Parse incoming Feishu event callback.
 */
function parseWebhook(body, headers) {
    // Challenge verification
    if (body.challenge) {
        return { type: 'challenge', challenge: body.challenge };
    }

    // Card action callback
    if (body.action) {
        return {
            type: 'callback',
            userId: body.operator?.user_id || body.user_id || '',
            messageId: body.token || '',
            callbackData: body.action?.value?.callback || JSON.stringify(body.action?.value || {}),
            text: body.action?.value?.callback || ''
        };
    }

    // Message event
    if (body.event?.message) {
        const msg = body.event.message;
        let text = '';
        try { text = JSON.parse(msg.content || '{}').text || ''; } catch (_) {}
        return {
            type: 'message',
            userId: body.event.sender?.sender_id?.user_id || '',
            messageId: msg.message_id || '',
            callbackData: null,
            text
        };
    }

    return null;
}

// ─── Helpers ───

function _httpsPost(hostname, path, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = https.request({
            hostname,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                ...extraHeaders
            },
            timeout: 15000
        }, (res) => {
            let buf = '';
            res.on('data', c => { buf += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(buf)); }
                catch (_) { reject(new Error('Invalid response')); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
        req.write(data);
        req.end();
    });
}

module.exports = { send, sendFile, parseWebhook };
