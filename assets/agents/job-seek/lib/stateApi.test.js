'use strict';

const http = require('http');
const stateApi = require('./stateApi');

// ─── Mock HTTP server ───────────────────────────────────────

let mockServer;
let mockPort;
let requestLog = [];
let mockHandler = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: {} }));
};

beforeAll((done) => {
    mockServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            requestLog.push({
                method: req.method,
                url: req.url,
                body: body ? JSON.parse(body) : null
            });
            mockHandler(req, res);
        });
    });
    mockServer.listen(0, () => {
        mockPort = mockServer.address().port;
        done();
    });
});

afterAll((done) => {
    mockServer.close(done);
});

beforeEach(() => {
    requestLog = [];
    mockHandler = (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: {} }));
    };
});

// ─── Helper: override BASE_URL for tests ────────────────────

// Since stateApi uses hardcoded localhost:30001, we test the _request function
// directly with our mock server port. For higher-level functions, we'll mock.

describe('stateApi._request', () => {
    test('rejects when server is unreachable', async () => {
        // Port 30001 is not running in test — should reject with connection error
        await expect(stateApi._request('GET', '/app/language', null, 1000))
            .rejects.toThrow(/failed/i);
    });
});

describe('stateApi._withRetry', () => {
    test('retries on failure and eventually succeeds', async () => {
        let attempts = 0;
        const fn = async () => {
            attempts++;
            if (attempts < 3) throw new Error('fail');
            return 'ok';
        };
        const result = await stateApi._withRetry(fn, 3, 50);
        expect(result).toBe('ok');
        expect(attempts).toBe(3);
    });

    test('throws after max attempts exhausted', async () => {
        let attempts = 0;
        const fn = async () => {
            attempts++;
            throw new Error('always fail');
        };
        await expect(stateApi._withRetry(fn, 2, 50)).rejects.toThrow('always fail');
        expect(attempts).toBe(2);
    });

    test('returns immediately on first success', async () => {
        let attempts = 0;
        const fn = async () => {
            attempts++;
            return 42;
        };
        const result = await stateApi._withRetry(fn, 3, 50);
        expect(result).toBe(42);
        expect(attempts).toBe(1);
    });
});

describe('stateApi.subscribeSSE', () => {
    let sseServer;
    let ssePort;
    let sseRes;

    beforeAll((done) => {
        sseServer = http.createServer((req, res) => {
            if (req.url.startsWith('/api/state/subscribe')) {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });
                res.write(':ok\n\n');
                sseRes = res;
                // Don't end — keep stream open
            } else {
                res.writeHead(404);
                res.end();
            }
        });
        sseServer.listen(0, () => {
            ssePort = sseServer.address().port;
            done();
        });
    });

    afterAll((done) => {
        if (sseRes) try { sseRes.end(); } catch {}
        sseServer.close(done);
    });

    test('close() stops the subscription without errors', () => {
        // Test that subscribeSSE returns a handle with close()
        // We can't easily test the actual connection since BASE_URL is hardcoded,
        // but we verify the API contract
        const sub = stateApi.subscribeSSE({
            topics: 'test',
            onEvent: () => {},
            onError: () => {} // suppress expected connection error
        });
        expect(sub).toHaveProperty('close');
        expect(typeof sub.close).toBe('function');
        sub.close(); // should not throw
    });
});

describe('stateApi module exports', () => {
    test('exports all required functions', () => {
        expect(typeof stateApi.fetchSessions).toBe('function');
        expect(typeof stateApi.fetchSession).toBe('function');
        expect(typeof stateApi.createSession).toBe('function');
        expect(typeof stateApi.deleteSession).toBe('function');
        expect(typeof stateApi.switchSession).toBe('function');
        expect(typeof stateApi.fetchSnapshot).toBe('function');
        expect(typeof stateApi.getState).toBe('function');
        expect(typeof stateApi.setState).toBe('function');
        expect(typeof stateApi.batchSetState).toBe('function');
        expect(typeof stateApi.deleteState).toBe('function');
        expect(typeof stateApi.pushFullState).toBe('function');
        expect(typeof stateApi.subscribeSSE).toBe('function');
        expect(typeof stateApi.isAvailable).toBe('function');
    });

    test('AGENT_ID is jobSeekAgent', () => {
        expect(stateApi.AGENT_ID).toBe('jobSeekAgent');
    });
});
