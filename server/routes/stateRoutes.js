/**
 * stateRoutes.js — HTTP CRUD + SSE routes for stateService.
 *
 * Phase A Endpoints:
 *   A1 (Read):
 *     GET  /api/state/:agentId           — Full snapshot for agent
 *     GET  /api/state/:agentId/*         — Value at dot-path (wildcard)
 *
 *   A2 (Write):
 *     POST   /api/state/:agentId/set     — { path, value }
 *     POST   /api/state/:agentId/merge   — { path, partial }
 *     DELETE  /api/state/:agentId        — { path }
 *
 *   A3 (Session CRUD):
 *     GET    /api/state/sessions/:agentId               — List sessions
 *     GET    /api/state/sessions/:agentId/:sessionId    — Get single session
 *     POST   /api/state/sessions/:agentId               — Create session { name }
 *     DELETE  /api/state/sessions/:agentId/:sessionId   — Delete session
 *     POST   /api/state/sessions/:agentId/switch        — { sessionId }
 *
 *   A4 (Language):
 *     GET    /api/state/app/language      — Get language
 *     POST   /api/state/app/language      — Set language { language }
 *
 * Phase B Endpoints:
 *   B1 (SSE Subscribe):
 *     GET    /api/state/subscribe?topics=sessions,language  — SSE stream
 */

const express = require('express');
const router = express.Router();
const { StateService } = require('../services/stateService');

function getStateService() {
    return StateService.getInstance();
}

// ── B1: SSE Subscribe Endpoint (must be before :agentId wildcard) ──

router.get('/subscribe', (req, res) => {
    const svc = getStateService();

    // Parse topics from query param
    const topicsParam = req.query.topics || '';
    const topics = new Set(
        topicsParam.split(',').map(t => t.trim()).filter(Boolean)
    );

    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable nginx buffering if present
    });

    // Send initial :ok comment
    res.write(':ok\n\n');

    // Initialize SSE broadcast wiring if not already done
    svc.initSSEBroadcast();

    // Create connection object
    const connection = { res, topics };
    svc.addSSEConnection(connection);

    // Heartbeat every 15s
    const heartbeatInterval = setInterval(() => {
        try {
            res.write(':heartbeat\n\n');
        } catch (err) {
            console.error('[stateService:sse] Heartbeat write error:', err.message);
            clearInterval(heartbeatInterval);
            svc.removeSSEConnection(connection);
        }
    }, 15000);

    // Clean up on client disconnect
    req.on('close', () => {
        clearInterval(heartbeatInterval);
        svc.removeSSEConnection(connection);
    });
});

// ── Flush: force-persist all pending state writes (called by Electron before-quit) ──

router.post('/flush', (req, res) => {
    try {
        const svc = getStateService();
        svc.flushAll();
        console.log('[stateRoutes] Flush completed');
        res.json({ success: true });
    } catch (err) {
        console.error('[stateRoutes] Flush failed:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── A4: Language preference (must be before :agentId wildcard) ──

router.get('/app/language', (req, res) => {
    try {
        const svc = getStateService();
        const language = svc.getLanguage();
        res.json({ success: true, language });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/app/language', (req, res) => {
    try {
        const { language } = req.body || {};
        if (!language) {
            return res.status(400).json({ success: false, message: 'Missing required field: language' });
        }
        const svc = getStateService();
        const ok = svc.setLanguage(language);
        if (!ok) {
            return res.status(400).json({ success: false, message: 'Invalid language. Must be "en" or "zh-CN".' });
        }
        res.json({ success: true, language });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── A3: Session CRUD (must be before :agentId wildcard) ──

router.get('/sessions/:agentId', (req, res) => {
    try {
        const svc = getStateService();
        const result = svc.listSessions(req.params.agentId);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/sessions/:agentId/:sessionId', (req, res) => {
    try {
        const svc = getStateService();
        const session = svc.getSession(req.params.agentId, req.params.sessionId);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        res.json({ success: true, data: session });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/sessions/:agentId', (req, res) => {
    try {
        const { name } = req.body || {};
        const svc = getStateService();
        const session = svc.createSession(req.params.agentId, name);
        res.json({ success: true, data: session });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/sessions/:agentId/:sessionId', (req, res) => {
    try {
        const svc = getStateService();
        const deleted = svc.deleteSession(req.params.agentId, req.params.sessionId);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/sessions/:agentId/switch', (req, res) => {
    try {
        const { sessionId } = req.body || {};
        if (!sessionId) {
            return res.status(400).json({ success: false, message: 'Missing required field: sessionId' });
        }
        const svc = getStateService();
        const switched = svc.switchSession(req.params.agentId, sessionId);
        if (!switched) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── A2: State write routes (must be before :agentId GET wildcard) ──

router.post('/:agentId/set', (req, res) => {
    try {
        const { path, value } = req.body || {};
        if (!path) {
            return res.status(400).json({ success: false, message: 'Missing required field: path' });
        }
        if (value === undefined) {
            return res.status(400).json({ success: false, message: 'Missing required field: value' });
        }
        const svc = getStateService();
        const fullPath = `${req.params.agentId}.${path}`;
        svc.set(fullPath, value);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/:agentId/merge', (req, res) => {
    try {
        const { path, partial } = req.body || {};
        if (!path) {
            return res.status(400).json({ success: false, message: 'Missing required field: path' });
        }
        if (!partial || typeof partial !== 'object') {
            return res.status(400).json({ success: false, message: 'Missing or invalid field: partial (must be an object)' });
        }
        const svc = getStateService();
        const fullPath = `${req.params.agentId}.${path}`;
        svc.merge(fullPath, partial);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── A2: State delete (uses body.path) ──

router.delete('/:agentId', (req, res) => {
    try {
        const { path } = req.body || {};
        if (!path) {
            return res.status(400).json({ success: false, message: 'Missing required field: path' });
        }
        const svc = getStateService();
        const fullPath = `${req.params.agentId}.${path}`;
        const deleted = svc.delete(fullPath);
        res.json({ success: true, deleted });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ── A1: State read routes ──

router.get('/:agentId', (req, res) => {
    try {
        const svc = getStateService();
        const data = svc.snapshot(req.params.agentId);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Wildcard: GET /state/:agentId/some/dot/path
router.get('/:agentId/*', (req, res) => {
    try {
        const svc = getStateService();
        // req.params[0] captures the wildcard portion (e.g. "sessions" or "config/model")
        const subPath = req.params[0].replace(/\//g, '.');
        const fullPath = `${req.params.agentId}.${subPath}`;
        const data = svc.get(fullPath);
        res.json({ success: true, data: data !== undefined ? data : null });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
