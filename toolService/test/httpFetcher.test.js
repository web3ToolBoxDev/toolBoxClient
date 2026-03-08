'use strict';

const { fetchUrl, extractFromHtml } = require('../lib/httpFetcher');
const toolRegistry = require('../lib/toolRegistry');

// Mock axios
jest.mock('axios', () => {
    const mock = jest.fn();
    return mock;
});
const axios = require('axios');

describe('httpFetcher', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    // ─── fetchUrl ───

    describe('fetchUrl', () => {
        test('returns status, headers, data, contentType on success', async () => {
            axios.mockResolvedValueOnce({
                status: 200,
                headers: { 'content-type': 'text/html; charset=utf-8' },
                data: '<html><body>Hello</body></html>'
            });

            const result = await fetchUrl({ url: 'http://example.com' });
            expect(result.status).toBe(200);
            expect(result.contentType).toContain('text/html');
            expect(result.data).toContain('Hello');
            expect(axios).toHaveBeenCalledTimes(1);
        });

        test('retries on failure and succeeds', async () => {
            axios.mockRejectedValueOnce(new Error('timeout'));
            axios.mockResolvedValueOnce({
                status: 200,
                headers: { 'content-type': 'text/plain' },
                data: 'ok'
            });

            const result = await fetchUrl({ url: 'http://example.com', retries: 1, timeout: 1000 });
            expect(result.status).toBe(200);
            expect(axios).toHaveBeenCalledTimes(2);
        });

        test('throws after all retries exhausted', async () => {
            axios.mockRejectedValue(new Error('network error'));

            await expect(
                fetchUrl({ url: 'http://example.com', retries: 1, timeout: 100 })
            ).rejects.toThrow('network error');
            expect(axios).toHaveBeenCalledTimes(2); // initial + 1 retry
        });

        test('sends correct method and headers', async () => {
            axios.mockResolvedValueOnce({
                status: 201,
                headers: { 'content-type': 'application/json' },
                data: '{"ok":true}'
            });

            await fetchUrl({
                url: 'http://example.com/api',
                method: 'POST',
                headers: { 'X-Custom': 'test' },
                data: { key: 'value' },
                retries: 0
            });

            const config = axios.mock.calls[0][0];
            expect(config.method).toBe('POST');
            expect(config.headers['X-Custom']).toBe('test');
            expect(config.headers['User-Agent']).toBeTruthy();
            expect(config.data).toEqual({ key: 'value' });
        });

        test('configures proxy when provided', async () => {
            axios.mockResolvedValueOnce({
                status: 200,
                headers: { 'content-type': 'text/plain' },
                data: 'ok'
            });

            await fetchUrl({
                url: 'http://example.com',
                proxy: 'http://proxy.local:8080',
                retries: 0
            });

            const config = axios.mock.calls[0][0];
            expect(config.proxy.host).toBe('proxy.local');
            expect(config.proxy.port).toBe(8080);
        });

        test('handles missing content-type header', async () => {
            axios.mockResolvedValueOnce({
                status: 200,
                headers: {},
                data: 'data'
            });

            const result = await fetchUrl({ url: 'http://example.com', retries: 0 });
            expect(result.contentType).toBe('');
        });
    });

    // ─── extractFromHtml ───

    describe('extractFromHtml', () => {
        const html = `
            <html>
            <head><title>Test Page</title></head>
            <body>
                <h1>Hello World</h1>
                <p class="desc">A description paragraph.</p>
                <a href="/page1">Link 1</a>
                <a href="/page2">Link 2</a>
                <ul>
                    <li class="item">Item A</li>
                    <li class="item">Item B</li>
                    <li class="item">Item C</li>
                </ul>
            </body>
            </html>
        `;

        test('extracts title, text, links by default (no selectors)', () => {
            const result = extractFromHtml(html);
            expect(result.title).toBe('Test Page');
            expect(result.text).toContain('Hello World');
            expect(result.text).toContain('A description paragraph');
            expect(result.links).toBeInstanceOf(Array);
            expect(result.links.length).toBe(2);
            expect(result.links[0].href).toBe('/page1');
        });

        test('extracts custom selectors (single element)', () => {
            const result = extractFromHtml(html, { heading: 'h1', desc: '.desc' });
            expect(result.heading).toBe('Hello World');
            expect(result.desc).toBe('A description paragraph.');
        });

        test('extracts custom selectors (multiple elements)', () => {
            const result = extractFromHtml(html, { items: '.item' });
            expect(result.items).toEqual(['Item A', 'Item B', 'Item C']);
        });

        test('returns empty for non-matching selectors', () => {
            const result = extractFromHtml(html, { missing: '.nonexistent' });
            expect(result.missing).toEqual([]);
        });

        test('truncates body text to 5000 chars', () => {
            const longHtml = `<html><body>${'x'.repeat(10000)}</body></html>`;
            const result = extractFromHtml(longHtml);
            expect(result.text.length).toBeLessThanOrEqual(5000);
        });
    });

    // ─── registerAll ───

    describe('registerAll', () => {
        beforeEach(() => {
            toolRegistry.clear();
        });

        test('registers http_fetch and http_extract tools', () => {
            const { registerAll } = require('../lib/httpFetcher');
            registerAll();

            const tools = toolRegistry.list();
            const names = tools.map(t => t.name);
            expect(names).toContain('http_fetch');
            expect(names).toContain('http_extract');
        });

        test('http_fetch tool has correct category and parameters', () => {
            const { registerAll } = require('../lib/httpFetcher');
            registerAll();

            const tool = toolRegistry.list().find(t => t.name === 'http_fetch');
            expect(tool.category).toBe('http');
            expect(tool.parameters.required).toEqual(['url']);
        });

        test('http_fetch handler calls fetchUrl and returns result', async () => {
            const { registerAll } = require('../lib/httpFetcher');
            registerAll();

            axios.mockResolvedValueOnce({
                status: 200,
                headers: { 'content-type': 'text/plain' },
                data: 'hello world'
            });

            const result = await toolRegistry.execute('http_fetch', { url: 'http://test.com' });
            expect(result.success).toBe(true);
            expect(result.result.status).toBe(200);
            expect(result.result.body).toBe('hello world');
        });

        test('http_fetch with extract=true returns extracted data', async () => {
            const { registerAll } = require('../lib/httpFetcher');
            registerAll();

            axios.mockResolvedValueOnce({
                status: 200,
                headers: { 'content-type': 'text/html' },
                data: '<html><head><title>Test</title></head><body>Body text</body></html>'
            });

            const result = await toolRegistry.execute('http_fetch', {
                url: 'http://test.com',
                extract: true
            });
            expect(result.success).toBe(true);
            expect(result.result.title).toBe('Test');
            expect(result.result.text).toContain('Body text');
        });

        test('http_extract handler fetches and extracts with selectors', async () => {
            const { registerAll } = require('../lib/httpFetcher');
            registerAll();

            axios.mockResolvedValueOnce({
                status: 200,
                headers: { 'content-type': 'text/html' },
                data: '<html><body><h1>Title</h1><p class="x">Data</p></body></html>'
            });

            const result = await toolRegistry.execute('http_extract', {
                url: 'http://test.com',
                selectors: { heading: 'h1', content: '.x' }
            });
            expect(result.success).toBe(true);
            expect(result.result.heading).toBe('Title');
            expect(result.result.content).toBe('Data');
        });
    });
});
