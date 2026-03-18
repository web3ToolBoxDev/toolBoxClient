'use strict';

/**
 * Alert Service — multi-channel notification dispatch with throttling.
 *
 * Channels:
 *   - SSE (dashboard popup) — always enabled
 *   - Webhook (POST to URL) — configurable
 *   - Desktop notification (via SSE 'desktopNotify' event)
 *
 * Features:
 *   - Per-session alert configuration
 *   - Throttling (configurable interval, default 5 min)
 *   - Consecutive failure tracking
 *   - Auto-retry on stuck detection
 */

const http = require('http');
const https = require('https');
const url = require('url');

// ─── Alert Config Store ───
// sessionId → AlertConfig
const _alertConfigs = new Map();

// ─── Throttle State ───
// sessionId:alertType → lastSentAt (timestamp)
const _throttleState = new Map();

// ─── Failure Counters ───
// sessionId:stepName → consecutive failure count
const _failureCounters = new Map();

// ─── Alert History ───
// sessionId → Array<AlertRecord>
const _alertHistory = new Map();

// SSE broadcaster — injected by dashboardServer
let _sseBroadcaster = null;

/**
 * Default alert configuration.
 */
function buildDefaultAlertConfig() {
    return {
        enabled: true,
        stuckDetection: {
            enabled: true,
            thresholds: {
                customizeProfile: 30,   // seconds
                search: 600,            // 10 min
                generate: 900,          // 15 min
                apply: 1200             // 20 min
            },
            consecutiveFailureTrigger: 3,
            autoRetry: true,
            maxRetries: 2
        },
        channels: {
            dashboard: { enabled: true },   // SSE popup — always on
            desktop: { enabled: true },     // desktop notification via SSE
            webhook: {
                enabled: false,
                url: '',
                secret: ''
            },
            telegram: {
                enabled: false,
                botToken: '',
                chatId: ''
            },
            feishu: {
                enabled: false,
                webhookUrl: '',
                secret: ''
            }
        },
        throttle: {
            intervalSeconds: 300  // 5 minutes between same alert type
        },
        updatedAt: new Date().toISOString()
    };
}

/**
 * Get alert config for a session.
 */
function getAlertConfig(sessionId) {
    if (!_alertConfigs.has(sessionId)) {
        _alertConfigs.set(sessionId, buildDefaultAlertConfig());
    }
    return _alertConfigs.get(sessionId);
}

/**
 * Update alert config (partial merge).
 */
function updateAlertConfig(sessionId, partial) {
    const current = getAlertConfig(sessionId);
    const merged = _deepMerge(current, partial);
    merged.updatedAt = new Date().toISOString();
    _alertConfigs.set(sessionId, merged);
    return merged;
}

/**
 * Inject the SSE broadcaster function from dashboardServer.
 * @param {Function} broadcaster - (sessionId, event, data) => void
 */
function setSSEBroadcaster(broadcaster) {
    _sseBroadcaster = broadcaster;
}

// ─── Alert Dispatch ───

/**
 * Dispatch an alert through all enabled channels.
 * @param {string} sessionId
 * @param {object} alert
 * @param {string} alert.type - 'stuck' | 'failure' | 'completed' | 'info'
 * @param {string} alert.title
 * @param {string} alert.message
 * @param {string} [alert.stepName]
 * @param {object} [alert.meta] - Extra data
 * @returns {{ sent: boolean, channels: string[], throttled: boolean }}
 */
function dispatch(sessionId, alert) {
    const config = getAlertConfig(sessionId);
    if (!config.enabled) return { sent: false, channels: [], throttled: false };

    // Throttle check
    const throttleKey = `${sessionId}:${alert.type}:${alert.stepName || ''}`;
    const lastSent = _throttleState.get(throttleKey);
    const now = Date.now();
    if (lastSent && (now - lastSent) < config.throttle.intervalSeconds * 1000) {
        return { sent: false, channels: [], throttled: true };
    }

    const channels = [];
    const record = {
        ...alert,
        sessionId,
        sentAt: new Date().toISOString(),
        channels: []
    };

    // Dashboard (SSE popup)
    if (config.channels.dashboard.enabled && _sseBroadcaster) {
        try {
            _sseBroadcaster(sessionId, 'alert', {
                type: alert.type,
                title: alert.title,
                message: alert.message,
                stepName: alert.stepName,
                meta: alert.meta
            });
            channels.push('dashboard');
        } catch (e) {
            console.error('[alertService] SSE broadcast error:', e.message);
        }
    }

    // Desktop notification (via SSE desktopNotify event)
    if (config.channels.desktop.enabled && _sseBroadcaster) {
        try {
            _sseBroadcaster(sessionId, 'desktopNotify', {
                title: alert.title,
                body: alert.message,
                tag: `workflow-${alert.type}`
            });
            channels.push('desktop');
        } catch (e) {
            console.error('[alertService] Desktop notify error:', e.message);
        }
    }

    // Webhook
    if (config.channels.webhook.enabled && config.channels.webhook.url) {
        _sendWebhook(config.channels.webhook, {
            sessionId,
            type: alert.type,
            title: alert.title,
            message: alert.message,
            stepName: alert.stepName,
            meta: alert.meta,
            timestamp: record.sentAt
        });
        channels.push('webhook');
    }

    // Telegram
    if (config.channels.telegram?.enabled && config.channels.telegram.botToken) {
        _sendTelegram(config.channels.telegram, {
            type: alert.type,
            title: alert.title,
            message: alert.message,
            meta: alert.meta
        }).then(() => {}).catch(e => console.error('[alertService] Telegram error:', e.message));
        channels.push('telegram');
    }

    // Feishu
    if (config.channels.feishu?.enabled && config.channels.feishu.webhookUrl) {
        _sendFeishu(config.channels.feishu, {
            type: alert.type,
            title: alert.title,
            message: alert.message,
            meta: alert.meta
        }).then(() => {}).catch(e => console.error('[alertService] Feishu error:', e.message));
        channels.push('feishu');
    }

    // Update throttle state
    _throttleState.set(throttleKey, now);

    // Record in history
    record.channels = channels;
    if (!_alertHistory.has(sessionId)) {
        _alertHistory.set(sessionId, []);
    }
    const history = _alertHistory.get(sessionId);
    history.push(record);
    // Keep last 100 alerts
    if (history.length > 100) history.splice(0, history.length - 100);

    return { sent: channels.length > 0, channels, throttled: false };
}

// ─── Stuck Detection Integration ───

/**
 * Check for stuck steps and dispatch alerts.
 * Called periodically by the dashboard polling loop.
 * @param {string} sessionId
 * @param {object} workflowEngine - Reference to workflowEngine module
 * @returns {{ stuckSteps: string[], alerts: number }}
 */
function checkAndAlert(sessionId, workflowEngine) {
    const config = getAlertConfig(sessionId);
    if (!config.stuckDetection.enabled) return { stuckSteps: [], alerts: 0 };

    const { stuckSteps } = workflowEngine.checkStuckSteps(sessionId);
    let alertCount = 0;

    for (const stepName of stuckSteps) {
        const result = dispatch(sessionId, {
            type: 'stuck',
            title: `Step "${stepName}" is stuck`,
            message: `The "${stepName}" step has exceeded its timeout threshold and appears stuck.`,
            stepName,
            meta: { threshold: config.stuckDetection.thresholds[stepName] }
        });
        if (result.sent) alertCount++;
    }

    return { stuckSteps, alerts: alertCount };
}

/**
 * Track step failure and dispatch alert on consecutive threshold.
 * @param {string} sessionId
 * @param {string} stepName
 * @param {string} errorMessage
 */
function trackFailure(sessionId, stepName, errorMessage) {
    const config = getAlertConfig(sessionId);
    const key = `${sessionId}:${stepName}`;
    const count = (_failureCounters.get(key) || 0) + 1;
    _failureCounters.set(key, count);

    if (count >= config.stuckDetection.consecutiveFailureTrigger) {
        dispatch(sessionId, {
            type: 'failure',
            title: `Step "${stepName}" failed ${count} times`,
            message: `Consecutive failures: ${count}. Last error: ${errorMessage}`,
            stepName,
            meta: { failureCount: count, lastError: errorMessage }
        });
    }
}

/**
 * Reset failure counter (e.g., after successful run).
 */
function resetFailureCounter(sessionId, stepName) {
    _failureCounters.delete(`${sessionId}:${stepName}`);
}

// ─── History ───

/**
 * Get alert history for a session.
 */
function getAlertHistory(sessionId) {
    return _alertHistory.get(sessionId) || [];
}

/**
 * Clear alert history for a session.
 */
function clearAlertHistory(sessionId) {
    _alertHistory.delete(sessionId);
}

// ─── Telegram Sender ───

const TELEGRAM_TYPE_EMOJI = {
    stuck: '\u26a0\ufe0f',
    failure: '\u274c',
    completed: '\u2705',
    info: '\u2139\ufe0f'
};

/**
 * Send alert to Telegram bot.
 * If screenshot data is available, sends as photo with caption.
 * Otherwise sends as text message.
 * @param {{ botToken: string, chatId: string }} config
 * @param {{ type: string, title: string, message: string, meta?: object }} payload
 */
async function _sendTelegram(config, payload) {
    const { botToken, chatId } = config;
    if (!botToken || !chatId) return;

    const emoji = TELEGRAM_TYPE_EMOJI[payload.type] || '\u2139\ufe0f';
    const jobInfo = payload.meta?.company && payload.meta?.title
        ? `\n\ud83d\udcce ${payload.meta.company} \u2014 ${payload.meta.title}`
        : '';
    const urlInfo = payload.meta?.url ? `\n\ud83d\udd17 ${payload.meta.url}` : '';
    const text = `${emoji} *${_escapeMarkdown(payload.title)}*\n${_escapeMarkdown(payload.message)}${jobInfo}${urlInfo}`;

    if (payload.meta?.screenshotBase64) {
        // Send photo with caption
        const boundary = '----TelegramBoundary' + Date.now();
        const imageBuffer = Buffer.from(payload.meta.screenshotBase64, 'base64');

        const parts = [
            `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`,
            `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${text}\r\n`,
            `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n`,
            `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="screenshot.png"\r\nContent-Type: image/png\r\n\r\n`
        ];
        const bodyStart = Buffer.from(parts.join(''));
        const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`);
        const body = Buffer.concat([bodyStart, imageBuffer, bodyEnd]);

        const opts = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${botToken}/sendPhoto`,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(opts, (res) => {
                res.resume();
                if (res.statusCode >= 400) {
                    reject(new Error(`Telegram sendPhoto returned ${res.statusCode}`));
                } else {
                    resolve();
                }
            });
            req.on('error', reject);
            req.setTimeout(15000, () => { req.destroy(); reject(new Error('Telegram timeout')); });
            req.write(body);
            req.end();
        });
    } else {
        // Text-only message
        const body = JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown'
        });

        const opts = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${botToken}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(opts, (res) => {
                res.resume();
                if (res.statusCode >= 400) {
                    reject(new Error(`Telegram sendMessage returned ${res.statusCode}`));
                } else {
                    resolve();
                }
            });
            req.on('error', reject);
            req.setTimeout(10000, () => { req.destroy(); reject(new Error('Telegram timeout')); });
            req.write(body);
            req.end();
        });
    }
}

/**
 * Escape special characters for Telegram Markdown.
 */
function _escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

// ─── Feishu (Lark) Sender ───

/**
 * Send alert to Feishu webhook as interactive card.
 * @param {{ webhookUrl: string, secret?: string }} config
 * @param {{ type: string, title: string, message: string, meta?: object }} payload
 */
async function _sendFeishu(config, payload) {
    const { webhookUrl, secret } = config;
    if (!webhookUrl) return;

    const emoji = TELEGRAM_TYPE_EMOJI[payload.type] || '\u2139\ufe0f';
    const elements = [
        { tag: 'div', text: { content: payload.message, tag: 'plain_text' } }
    ];

    // Job info
    if (payload.meta?.company && payload.meta?.title) {
        elements.push({
            tag: 'div',
            text: { content: `\ud83d\udcce ${payload.meta.company} \u2014 ${payload.meta.title}`, tag: 'plain_text' }
        });
    }
    if (payload.meta?.url) {
        elements.push({
            tag: 'div',
            text: { content: `\ud83d\udd17 ${payload.meta.url}`, tag: 'plain_text' }
        });
    }

    // Note about screenshot (Feishu webhook can't embed images directly without app token)
    if (payload.meta?.screenshotBase64) {
        elements.push({
            tag: 'note',
            elements: [{ tag: 'plain_text', content: '\ud83d\udcf8 Screenshot available in dashboard' }]
        });
    }

    const cardBody = {
        msg_type: 'interactive',
        card: {
            header: {
                title: { content: `${emoji} ${payload.title}`, tag: 'plain_text' },
                template: payload.type === 'completed' ? 'green'
                    : payload.type === 'failure' ? 'red'
                    : payload.type === 'stuck' ? 'orange'
                    : 'blue'
            },
            elements
        }
    };

    // Sign if secret configured
    if (secret) {
        const crypto = require('crypto');
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const stringToSign = timestamp + '\n' + secret;
        const hmac = crypto.createHmac('sha256', stringToSign).update('').digest('base64');
        cardBody.timestamp = timestamp;
        cardBody.sign = hmac;
    }

    const body = JSON.stringify(cardBody);
    const parsed = new URL(webhookUrl);

    const opts = {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(opts, (res) => {
            res.resume();
            if (res.statusCode >= 400) {
                reject(new Error(`Feishu webhook returned ${res.statusCode}`));
            } else {
                resolve();
            }
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Feishu timeout')); });
        req.write(body);
        req.end();
    });
}

// ─── Webhook Sender ───

function _sendWebhook(webhookConfig, payload) {
    try {
        const parsed = new URL(webhookConfig.url);
        const isHttps = parsed.protocol === 'https:';
        const mod = isHttps ? https : http;
        const data = JSON.stringify(payload);

        const opts = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                'User-Agent': 'WorkflowAlertService/1.0'
            }
        };

        if (webhookConfig.secret) {
            opts.headers['X-Webhook-Secret'] = webhookConfig.secret;
        }

        const req = mod.request(opts, (res) => {
            res.resume(); // drain response
            if (res.statusCode >= 400) {
                console.warn(`[alertService] Webhook returned ${res.statusCode}`);
            }
        });

        req.on('error', (e) => {
            console.error('[alertService] Webhook error:', e.message);
        });

        req.setTimeout(10000, () => {
            req.destroy();
            console.warn('[alertService] Webhook timeout');
        });

        req.write(data);
        req.end();
    } catch (e) {
        console.error('[alertService] Webhook send failed:', e.message);
    }
}

// ─── Utility ───

function _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = _deepMerge(result[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

module.exports = {
    // Config
    buildDefaultAlertConfig,
    getAlertConfig,
    updateAlertConfig,
    // SSE
    setSSEBroadcaster,
    // Dispatch
    dispatch,
    // Stuck integration
    checkAndAlert,
    trackFailure,
    resetFailureCounter,
    // History
    getAlertHistory,
    clearAlertHistory
};
