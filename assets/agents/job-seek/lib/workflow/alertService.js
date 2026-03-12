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
