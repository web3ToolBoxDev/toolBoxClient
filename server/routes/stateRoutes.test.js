/**
 * stateRoutes.test.js — HTTP route tests for stateService Phase A + Phase B endpoints.
 *
 * Uses a minimal Express app with the stateRoutes mounted, and node's http module
 * for request testing (no supertest dependency needed).
 */

const http = require('http');
const express = require('express');
const path = require('path');
const os = require('os');

// Mock config before requiring anything that depends on it
const mockAgentPath = path.join(os.tmpdir(), 'stateRoutes-test-' + Date.now());
jest.mock('../../config', () => ({
    getInstance: () => ({
        defaultAgentPath: mockAgentPath,
        getSavePath: () => ({ success: false, path: undefined })
    })
}));

const { StateService } = require('../services/stateService');
const stateRoutes = require('./stateRoutes');

let app, server, baseUrl;

function request(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, baseUrl);
        const bodyStr = body ? JSON.stringify(body) : null;
        const headers = { 'Content-Type': 'application/json' };
        if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method.toUpperCase(),
            headers
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

/**
 * Open an SSE connection and collect events.
 * Returns { req, events, close } where events is an array that grows as events arrive.
 */
function openSSE(urlPath) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, baseUrl);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: 'GET',
            headers: { 'Accept': 'text/event-stream' }
        };
        const req = http.request(options, (res) => {
            const events = [];
            let buffer = '';

            res.on('data', (chunk) => {
                buffer += chunk.toString();
                // Parse SSE events from buffer
                const parts = buffer.split('\n\n');
                buffer = parts.pop(); // Keep incomplete last part
                for (const part of parts) {
                    if (!part.trim()) continue;
                    const lines = part.split('\n');
                    const event = {};
                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            event.event = line.slice(7);
                        } else if (line.startsWith('data: ')) {
                            try {
                                event.data = JSON.parse(line.slice(6));
                            } catch {
                                event.data = line.slice(6);
                            }
                        } else if (line.startsWith(':')) {
                            event.comment = line.slice(1).trim();
                        }
                    }
                    events.push(event);
                }
            });

            // Resolve once we get the initial :ok comment
            const checkReady = setInterval(() => {
                if (events.length > 0) {
                    clearInterval(checkReady);
                    resolve({
                        req,
                        res,
                        events,
                        close: () => {
                            req.destroy();
                        }
                    });
                }
            }, 10);

            // Timeout after 2s
            setTimeout(() => {
                clearInterval(checkReady);
                if (events.length === 0) {
                    reject(new Error('SSE connection timeout'));
                }
            }, 2000);
        });
        req.on('error', (err) => {
            // Ignore ECONNRESET from close()
            if (err.code !== 'ECONNRESET') reject(err);
        });
        req.end();
    });
}

beforeAll((done) => {
    app = express();
    app.use(express.json());
    app.use('/api/state', stateRoutes);
    server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        done();
    });
});

afterAll((done) => {
    StateService._reset();
    server.close(done);
});

beforeEach(() => {
    StateService._reset();
});

// ─── A1: State Read Routes ───

describe('A1: State Read Routes', () => {
    test('GET /api/state/:agentId returns full snapshot', async () => {
        const svc = StateService.getInstance();
        svc.set('testAgent.foo', 'bar');
        svc.set('testAgent.num', 42);

        const res = await request('GET', '/api/state/testAgent');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.foo).toBe('bar');
        expect(res.body.data.num).toBe(42);
    });

    test('GET /api/state/:agentId returns empty object for nonexistent agent', async () => {
        const res = await request('GET', '/api/state/nonexistent');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toEqual({});
    });

    test('GET /api/state/:agentId/path returns value at dot-path', async () => {
        const svc = StateService.getInstance();
        svc.set('testAgent.config.model', 'gpt-4');

        const res = await request('GET', '/api/state/testAgent/config/model');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBe('gpt-4');
    });

    test('GET /api/state/:agentId/nonexistent returns null', async () => {
        const res = await request('GET', '/api/state/testAgent/nope');
        expect(res.status).toBe(200);
        expect(res.body.data).toBeNull();
    });
});

// ─── A2: State Write Routes ───

describe('A2: State Write Routes', () => {
    test('POST /api/state/:agentId/set sets value', async () => {
        const res = await request('POST', '/api/state/testAgent/set', { path: 'color', value: 'blue' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const getRes = await request('GET', '/api/state/testAgent/color');
        expect(getRes.body.data).toBe('blue');
    });

    test('POST /api/state/:agentId/set returns 400 without path', async () => {
        const res = await request('POST', '/api/state/testAgent/set', { value: 'x' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('POST /api/state/:agentId/set returns 400 without value', async () => {
        const res = await request('POST', '/api/state/testAgent/set', { path: 'x' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('POST /api/state/:agentId/merge deep-merges', async () => {
        const svc = StateService.getInstance();
        svc.set('testAgent.config', { a: 1, b: 2 });

        const res = await request('POST', '/api/state/testAgent/merge', {
            path: 'config',
            partial: { b: 99, c: 3 }
        });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const getRes = await request('GET', '/api/state/testAgent/config');
        expect(getRes.body.data).toEqual({ a: 1, b: 99, c: 3 });
    });

    test('POST /api/state/:agentId/merge returns 400 without path', async () => {
        const res = await request('POST', '/api/state/testAgent/merge', { partial: { x: 1 } });
        expect(res.status).toBe(400);
    });

    test('POST /api/state/:agentId/merge returns 400 without partial', async () => {
        const res = await request('POST', '/api/state/testAgent/merge', { path: 'x' });
        expect(res.status).toBe(400);
    });

    test('DELETE /api/state/:agentId removes key at path', async () => {
        const svc = StateService.getInstance();
        svc.set('testAgent.temp', 'gone');

        const res = await request('DELETE', '/api/state/testAgent', { path: 'temp' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deleted).toBe(true);

        const getRes = await request('GET', '/api/state/testAgent/temp');
        expect(getRes.body.data).toBeNull();
    });

    test('DELETE /api/state/:agentId returns 400 without path', async () => {
        const res = await request('DELETE', '/api/state/testAgent', {});
        expect(res.status).toBe(400);
    });
});

// ─── A3: Session CRUD Routes ───

describe('A3: Session CRUD Routes', () => {
    test('GET /api/state/sessions/:agentId lists sessions', async () => {
        const res = await request('GET', '/api/state/sessions/testAgent');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.sessions).toEqual([]);
        expect(res.body.data.activeSessionId).toBeNull();
    });

    test('POST /api/state/sessions/:agentId creates session', async () => {
        const res = await request('POST', '/api/state/sessions/testAgent', { name: 'My Session' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.name).toBe('My Session');
        expect(res.body.data.id).toMatch(/^session_/);
        expect(res.body.data.createdAt).toBeDefined();
    });

    test('GET /api/state/sessions/:agentId/:sessionId returns session', async () => {
        const createRes = await request('POST', '/api/state/sessions/testAgent', { name: 'Detail' });
        const sessionId = createRes.body.data.id;

        const res = await request('GET', `/api/state/sessions/testAgent/${sessionId}`);
        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('Detail');
        expect(res.body.data.conversations).toEqual([]);
    });

    test('GET /api/state/sessions/:agentId/:sessionId returns 404 for missing', async () => {
        const res = await request('GET', '/api/state/sessions/testAgent/nonexistent');
        expect(res.status).toBe(404);
    });

    test('DELETE /api/state/sessions/:agentId/:sessionId deletes session', async () => {
        const createRes = await request('POST', '/api/state/sessions/testAgent', { name: 'ToDelete' });
        const sessionId = createRes.body.data.id;

        const delRes = await request('DELETE', `/api/state/sessions/testAgent/${sessionId}`);
        expect(delRes.status).toBe(200);
        expect(delRes.body.success).toBe(true);

        const listRes = await request('GET', '/api/state/sessions/testAgent');
        expect(listRes.body.data.sessions).toHaveLength(0);
    });

    test('DELETE /api/state/sessions/:agentId/:sessionId returns 404 for missing', async () => {
        const res = await request('DELETE', '/api/state/sessions/testAgent/nonexistent');
        expect(res.status).toBe(404);
    });

    test('POST /api/state/sessions/:agentId/switch switches active session', async () => {
        const s1 = await request('POST', '/api/state/sessions/testAgent', { name: 'S1' });
        const s2 = await request('POST', '/api/state/sessions/testAgent', { name: 'S2' });

        const switchRes = await request('POST', '/api/state/sessions/testAgent/switch', {
            sessionId: s1.body.data.id
        });
        expect(switchRes.status).toBe(200);
        expect(switchRes.body.success).toBe(true);

        const listRes = await request('GET', '/api/state/sessions/testAgent');
        expect(listRes.body.data.activeSessionId).toBe(s1.body.data.id);
    });

    test('POST /api/state/sessions/:agentId/switch returns 400 without sessionId', async () => {
        const res = await request('POST', '/api/state/sessions/testAgent/switch', {});
        expect(res.status).toBe(400);
    });

    test('POST /api/state/sessions/:agentId/switch returns 404 for nonexistent', async () => {
        const res = await request('POST', '/api/state/sessions/testAgent/switch', {
            sessionId: 'nonexistent'
        });
        expect(res.status).toBe(404);
    });

    test('session creation is idempotent on name', async () => {
        const r1 = await request('POST', '/api/state/sessions/testAgent', { name: 'Unique' });
        const r2 = await request('POST', '/api/state/sessions/testAgent', { name: 'Unique' });
        expect(r1.body.data.id).toBe(r2.body.data.id);

        const listRes = await request('GET', '/api/state/sessions/testAgent');
        expect(listRes.body.data.sessions).toHaveLength(1);
    });
});

// ─── A4: Language Preference Routes ───

describe('A4: Language Preference Routes', () => {
    test('GET /api/state/app/language returns default zh-CN', async () => {
        const res = await request('GET', '/api/state/app/language');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.language).toBe('zh-CN');
    });

    test('POST /api/state/app/language sets language', async () => {
        const setRes = await request('POST', '/api/state/app/language', { language: 'en' });
        expect(setRes.status).toBe(200);
        expect(setRes.body.success).toBe(true);
        expect(setRes.body.language).toBe('en');

        const getRes = await request('GET', '/api/state/app/language');
        expect(getRes.body.language).toBe('en');
    });

    test('POST /api/state/app/language returns 400 for invalid language', async () => {
        const res = await request('POST', '/api/state/app/language', { language: 'fr' });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('POST /api/state/app/language returns 400 without language', async () => {
        const res = await request('POST', '/api/state/app/language', {});
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });
});

// ─── B1: SSE Subscribe Endpoint ───

describe('B1: SSE Subscribe Endpoint', () => {
    test('GET /api/state/subscribe opens SSE stream with correct headers', async () => {
        const sse = await openSSE('/api/state/subscribe?topics=sessions');
        try {
            // Check initial :ok comment was received
            expect(sse.events.length).toBeGreaterThanOrEqual(1);
            expect(sse.events[0].comment).toBe('ok');

            // Verify response headers
            expect(sse.res.headers['content-type']).toBe('text/event-stream');
            expect(sse.res.headers['cache-control']).toBe('no-cache');
        } finally {
            sse.close();
        }
    });

    test('SSE connection is tracked and cleaned up on disconnect', async () => {
        const svc = StateService.getInstance();
        svc.initSSEBroadcast();

        const sse = await openSSE('/api/state/subscribe?topics=sessions');
        try {
            // Connection should be tracked
            expect(svc.getSSEConnectionCount()).toBe(1);
        } finally {
            sse.close();
        }

        // Wait for close event to propagate
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(svc.getSSEConnectionCount()).toBe(0);
    });

    test('multiple SSE connections work independently', async () => {
        const svc = StateService.getInstance();
        svc.initSSEBroadcast();

        const sse1 = await openSSE('/api/state/subscribe?topics=sessions');
        const sse2 = await openSSE('/api/state/subscribe?topics=language');
        try {
            expect(svc.getSSEConnectionCount()).toBe(2);
        } finally {
            sse1.close();
            sse2.close();
        }

        await new Promise(resolve => setTimeout(resolve, 100));
        expect(svc.getSSEConnectionCount()).toBe(0);
    });

    test('SSE subscribe with no topics subscribes to all', async () => {
        const svc = StateService.getInstance();
        svc.initSSEBroadcast();

        const sse = await openSSE('/api/state/subscribe');
        try {
            expect(svc.getSSEConnectionCount()).toBe(1);
        } finally {
            sse.close();
        }
    });
});

// ─── B2: EventBus to SSE Broadcast Wiring ───

describe('B2: EventBus to SSE Broadcast', () => {
    test('state changes broadcast to SSE subscribers with matching topic', async () => {
        const svc = StateService.getInstance();
        svc.initSSEBroadcast();

        const sse = await openSSE('/api/state/subscribe?topics=testAgent');
        try {
            // Trigger a state change
            svc.set('testAgent.color', 'red');

            // Wait for debounce (100ms) + propagation
            await new Promise(resolve => setTimeout(resolve, 250));

            // Should have received: :ok comment + state_change event
            const stateChanges = sse.events.filter(e => e.event === 'state_change');
            expect(stateChanges.length).toBeGreaterThanOrEqual(1);

            const change = stateChanges[0];
            expect(change.data.topic).toBe('testAgent');
            expect(change.data.path).toBe('testAgent.color');
            expect(change.data.value).toBe('red');
            expect(change.data.timestamp).toBeDefined();
        } finally {
            sse.close();
        }
    });

    test('SSE subscribers with non-matching topics do NOT receive events', async () => {
        const svc = StateService.getInstance();
        svc.initSSEBroadcast();

        const sse = await openSSE('/api/state/subscribe?topics=language');
        try {
            // Trigger a state change on a different topic
            svc.set('testAgent.color', 'blue');

            // Wait for debounce
            await new Promise(resolve => setTimeout(resolve, 250));

            // Should NOT have received any state_change events
            const stateChanges = sse.events.filter(e => e.event === 'state_change');
            expect(stateChanges).toHaveLength(0);
        } finally {
            sse.close();
        }
    });

    test('SSE subscriber with no topics receives all events', async () => {
        const svc = StateService.getInstance();
        svc.initSSEBroadcast();

        const sse = await openSSE('/api/state/subscribe');
        try {
            svc.set('anyTopic.value', 123);

            await new Promise(resolve => setTimeout(resolve, 250));

            const stateChanges = sse.events.filter(e => e.event === 'state_change');
            expect(stateChanges.length).toBeGreaterThanOrEqual(1);
        } finally {
            sse.close();
        }
    });

    test('broadcast includes path, value, op, and timestamp', async () => {
        const svc = StateService.getInstance();
        svc.initSSEBroadcast();

        const sse = await openSSE('/api/state/subscribe?topics=ag');
        try {
            svc.set('ag.name', 'test');

            await new Promise(resolve => setTimeout(resolve, 250));

            const stateChanges = sse.events.filter(e => e.event === 'state_change');
            expect(stateChanges.length).toBeGreaterThanOrEqual(1);

            const data = stateChanges[0].data;
            expect(data).toHaveProperty('path');
            expect(data).toHaveProperty('value');
            expect(data).toHaveProperty('op');
            expect(data).toHaveProperty('timestamp');
            expect(typeof data.timestamp).toBe('number');
        } finally {
            sse.close();
        }
    });

    test('rapid state changes are debounced (deduplicated by path)', async () => {
        const svc = StateService.getInstance();
        svc.initSSEBroadcast();

        const sse = await openSSE('/api/state/subscribe?topics=ag');
        try {
            // Rapid changes to the same path
            svc.set('ag.counter', 1);
            svc.set('ag.counter', 2);
            svc.set('ag.counter', 3);
            svc.set('ag.counter', 4);
            svc.set('ag.counter', 5);

            // Wait for debounce
            await new Promise(resolve => setTimeout(resolve, 250));

            // Should have received only 1 event for ag.counter (latest value wins)
            const counterChanges = sse.events.filter(
                e => e.event === 'state_change' && e.data && e.data.path === 'ag.counter'
            );
            expect(counterChanges).toHaveLength(1);
            expect(counterChanges[0].data.value).toBe(5); // latest value
        } finally {
            sse.close();
        }
    });

    test('state change via HTTP POST triggers SSE broadcast', async () => {
        const svc = StateService.getInstance();
        svc.initSSEBroadcast();

        const sse = await openSSE('/api/state/subscribe?topics=testAgent');
        try {
            // Modify state via HTTP
            await request('POST', '/api/state/testAgent/set', { path: 'mood', value: 'happy' });

            // Wait for debounce
            await new Promise(resolve => setTimeout(resolve, 250));

            const stateChanges = sse.events.filter(e => e.event === 'state_change');
            expect(stateChanges.length).toBeGreaterThanOrEqual(1);
            const moodChange = stateChanges.find(e => e.data && e.data.path === 'testAgent.mood');
            expect(moodChange).toBeDefined();
            expect(moodChange.data.value).toBe('happy');
        } finally {
            sse.close();
        }
    });

    test('delete operation broadcasts with op=delete', async () => {
        const svc = StateService.getInstance();
        svc.initSSEBroadcast();
        svc.set('ag.temp', 'deleteme');

        const sse = await openSSE('/api/state/subscribe?topics=ag');

        // Clear initial events from set above (if any arrived during connect)
        await new Promise(resolve => setTimeout(resolve, 200));
        const initialLen = sse.events.length;

        try {
            svc.delete('ag.temp');

            await new Promise(resolve => setTimeout(resolve, 250));

            const newEvents = sse.events.slice(initialLen);
            const deleteEvents = newEvents.filter(
                e => e.event === 'state_change' && e.data && e.data.op === 'delete'
            );
            expect(deleteEvents.length).toBeGreaterThanOrEqual(1);
        } finally {
            sse.close();
        }
    });
});
