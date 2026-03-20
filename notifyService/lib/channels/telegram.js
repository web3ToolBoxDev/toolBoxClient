'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.telegram.org/bot';

/**
 * Telegram Bot API adapter.
 *
 * Config: { botToken: string, chatId: string }
 */

function _request(botToken, method, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const url = `${API_BASE}${botToken}/${method}`;
        const parsed = new URL(url);
        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
            timeout: 15000
        }, (res) => {
            let buf = '';
            res.on('data', c => { buf += c; });
            res.on('end', () => {
                try {
                    const r = JSON.parse(buf);
                    if (r.ok) resolve(r.result);
                    else reject(new Error(r.description || 'Telegram API error'));
                } catch (e) { reject(new Error('Invalid Telegram response')); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Telegram request timeout')); });
        req.write(data);
        req.end();
    });
}

/**
 * Send a notification message with optional inline keyboard buttons.
 */
async function send(config, message) {
    const { botToken, chatId } = config;
    if (!botToken || !chatId) throw new Error('Telegram: botToken and chatId required');

    // Build message text
    const icon = message.priority === 'high' ? '🔴' : message.priority === 'normal' ? '🔵' : 'ℹ️';
    let text = `${icon} *${_escape(message.title || 'Notification')}*\n\n${_escape(message.body || '')}`;

    // Inline keyboard from actions
    let reply_markup;
    if (message.actions && message.actions.length > 0) {
        reply_markup = {
            inline_keyboard: [message.actions.map(a => ({
                text: a.label,
                callback_data: a.callback || a.label
            }))]
        };
    }

    const body = {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        ...(reply_markup ? { reply_markup } : {})
    };

    const result = await _request(botToken, 'sendMessage', body);
    return { messageId: String(result.message_id) };
}

/**
 * Send a file via Telegram sendDocument.
 */
async function sendFile(config, file) {
    const { botToken, chatId } = config;
    if (!botToken || !chatId) throw new Error('Telegram: botToken and chatId required');
    if (!file.filePath || !fs.existsSync(file.filePath)) throw new Error('File not found: ' + file.filePath);

    // Telegram sendDocument requires multipart/form-data
    const boundary = '----NotifyBoundary' + Date.now();
    const fileName = file.fileName || path.basename(file.filePath);
    const fileData = fs.readFileSync(file.filePath);
    const caption = file.caption || '';

    const parts = [];
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}`);
    if (caption) parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}`);
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
    const ending = `\r\n--${boundary}--\r\n`;

    const preFile = Buffer.from(parts.join('\r\n') + '\r\n');
    const postFile = Buffer.from(ending);
    const body = Buffer.concat([preFile, fileData, postFile]);

    return new Promise((resolve, reject) => {
        const url = `${API_BASE}${botToken}/sendDocument`;
        const parsed = new URL(url);
        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length
            },
            timeout: 30000
        }, (res) => {
            let buf = '';
            res.on('data', c => { buf += c; });
            res.on('end', () => {
                try {
                    const r = JSON.parse(buf);
                    if (r.ok) resolve({ messageId: String(r.result.message_id) });
                    else reject(new Error(r.description || 'Telegram sendDocument error'));
                } catch (e) { reject(new Error('Invalid Telegram response')); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Telegram file send timeout')); });
        req.write(body);
        req.end();
    });
}

/**
 * Parse incoming Telegram webhook (callback_query or message).
 */
function parseWebhook(body) {
    // Inline button callback
    if (body.callback_query) {
        return {
            type: 'callback',
            userId: String(body.callback_query.from.id),
            messageId: String(body.callback_query.message?.message_id || ''),
            callbackData: body.callback_query.data || '',
            text: body.callback_query.data || ''
        };
    }
    // Text message
    if (body.message?.text) {
        return {
            type: 'message',
            userId: String(body.message.from.id),
            messageId: String(body.message.message_id),
            callbackData: null,
            text: body.message.text
        };
    }
    return null;
}

/**
 * Answer callback query (dismiss loading spinner on button).
 */
async function answerCallback(config, callbackQueryId, text) {
    return _request(config.botToken, 'answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: text || 'OK'
    });
}

// Escape Markdown special chars
function _escape(text) {
    return String(text || '').replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

module.exports = { send, sendFile, parseWebhook, answerCallback };
