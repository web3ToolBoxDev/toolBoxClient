'use strict';

const express = require('express');
const channelRegistry = require('./lib/channelRegistry');
const callbackRouter = require('./lib/callbackRouter');
const rateLimiter = require('./lib/rateLimiter');
const templateEngine = require('./lib/templateEngine');

const PORT = parseInt(process.env.NOTIFY_SERVICE_PORT || '30005', 10);
const app = express();
app.use(express.json({ limit: '10mb' }));

// ─── Health ───

app.get('/notify/status', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        channels: channelRegistry.list().map(c => ({ id: c.id, type: c.type, enabled: c.enabled }))
    });
});

// ─── Send Notification ───

app.post('/notify/send', async (req, res) => {
    try {
        const { type, title, body, actions, priority, channels, metadata, lang } = req.body;
        if (!body && !title) return res.status(400).json({ success: false, error: 'title or body required' });

        // Resolve target channels
        const targets = channels
            ? channelRegistry.list().filter(c => c.enabled && channels.includes(c.type))
            : channelRegistry.list().filter(c => c.enabled);

        if (targets.length === 0) {
            return res.json({ success: true, deliveries: [], warning: 'No enabled channels configured' });
        }

        const deliveries = [];
        for (const channel of targets) {
            // Rate limit check
            if (!rateLimiter.allow(channel.id)) {
                deliveries.push({ channel: channel.type, status: 'rate_limited' });
                continue;
            }

            try {
                const adapter = channelRegistry.getAdapter(channel.type);
                if (!adapter) {
                    deliveries.push({ channel: channel.type, status: 'no_adapter' });
                    continue;
                }

                const result = await adapter.send(channel.config, {
                    type: type || 'info',
                    title: title || '',
                    body: body || '',
                    actions: actions || [],
                    priority: priority || 'normal',
                    metadata: metadata || {}
                });

                deliveries.push({ channel: channel.type, status: 'sent', messageId: result.messageId || null });
            } catch (err) {
                deliveries.push({ channel: channel.type, status: 'error', error: err.message });
            }
        }

        res.json({ success: true, deliveries });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Send File ───

app.post('/notify/send-file', async (req, res) => {
    try {
        const { filePath, fileName, caption, channels, metadata } = req.body;
        if (!filePath) return res.status(400).json({ success: false, error: 'filePath required' });

        const targets = channels
            ? channelRegistry.list().filter(c => c.enabled && channels.includes(c.type))
            : channelRegistry.list().filter(c => c.enabled);

        const deliveries = [];
        for (const channel of targets) {
            if (!rateLimiter.allow(channel.id)) {
                deliveries.push({ channel: channel.type, status: 'rate_limited' });
                continue;
            }
            try {
                const adapter = channelRegistry.getAdapter(channel.type);
                if (!adapter || !adapter.sendFile) {
                    deliveries.push({ channel: channel.type, status: 'file_not_supported' });
                    continue;
                }
                const result = await adapter.sendFile(channel.config, { filePath, fileName, caption, metadata });
                deliveries.push({ channel: channel.type, status: 'sent', messageId: result.messageId || null });
            } catch (err) {
                deliveries.push({ channel: channel.type, status: 'error', error: err.message });
            }
        }
        res.json({ success: true, deliveries });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Channel Management ───

app.get('/notify/channels', (_req, res) => {
    res.json({ success: true, channels: channelRegistry.list() });
});

app.post('/notify/channels', async (req, res) => {
    try {
        const { type, config } = req.body;
        if (!type || !config) return res.status(400).json({ success: false, error: 'type and config required' });

        const channel = channelRegistry.add(type, config);

        // Send test message
        let testResult = null;
        try {
            const adapter = channelRegistry.getAdapter(type);
            if (adapter) {
                testResult = await adapter.send(config, {
                    type: 'info',
                    title: 'Notification Service Connected',
                    body: `✅ ${type} channel configured successfully.`,
                    actions: [],
                    priority: 'low',
                    metadata: {}
                });
            }
        } catch (err) {
            testResult = { error: err.message };
        }

        res.json({ success: true, channel, testResult });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.delete('/notify/channels/:id', (req, res) => {
    const removed = channelRegistry.remove(req.params.id);
    res.json({ success: removed });
});

// ─── Webhooks (inbound from Telegram/Feishu) ───

app.post('/notify/webhook/:channel', async (req, res) => {
    try {
        const result = await callbackRouter.handle(req.params.channel, req.body, req.headers);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ─── Start Server ───

if (require.main === module) {
    channelRegistry.load(); // Load saved channel configs
    app.listen(PORT, '127.0.0.1', () => {
        console.log(`[notifyService] Running on port ${PORT}`);
    });
}

module.exports = app; // For testing
