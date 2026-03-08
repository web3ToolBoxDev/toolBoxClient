'use strict';

const http = require('http');
const registry = require('../lib/toolRegistry');

let server;
const PORT = 30099; // test port

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1', port: PORT, path, method,
            headers: { 'Content-Type': 'application/json' }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

beforeAll((done) => {
    process.env.TOOL_SERVICE_PORT = String(PORT);
    registry.clear();
    // Re-require to pick up port
    delete require.cache[require.resolve('../index')];
    const app = require('../index');
    // The app auto-listens, find the server
    // Wait a bit for listen
    setTimeout(() => {
        server = app;
        done();
    }, 500);
});

afterAll((done) => {
    // Close the server if possible
    try {
        const s = require('http');
        // app.listen returns server stored in module — just close via process
    } catch {}
    done();
});

describe('toolService HTTP API', () => {
    test('GET /health returns success', async () => {
        const res = await request('GET', '/health');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.service).toBe('toolService');
    });

    test('POST /tools/register adds a tool', async () => {
        const res = await request('POST', '/tools/register', {
            name: 'http_test_tool',
            description: 'Test tool via HTTP',
            parameters: { type: 'object' },
            category: 'test'
        });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('GET /tools/list includes registered tool', async () => {
        const res = await request('GET', '/tools/list');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        const names = res.body.tools.map(t => t.name);
        expect(names).toContain('http_test_tool');
    });

    test('POST /tools/execute runs a tool', async () => {
        // Register a tool with a real handler directly
        registry.register({
            name: 'math_add',
            description: 'Add two numbers',
            handler: async ({ a, b }) => ({ sum: a + b })
        });
        const res = await request('POST', '/tools/execute', {
            name: 'math_add',
            params: { a: 10, b: 20 }
        });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.result.sum).toBe(30);
    });

    test('POST /tools/execute returns error for unknown tool', async () => {
        const res = await request('POST', '/tools/execute', {
            name: 'nonexistent'
        });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('Unknown tool');
    });

    test('POST /tools/register rejects missing name', async () => {
        const res = await request('POST', '/tools/register', {
            description: 'no name'
        });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('GET /config returns paths', async () => {
        const res = await request('GET', '/config');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('chromePath');
        expect(res.body).toHaveProperty('savePath');
    });
});
