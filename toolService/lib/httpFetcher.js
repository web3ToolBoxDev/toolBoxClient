'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const toolRegistry = require('./toolRegistry');

/**
 * HTTP Fetcher — Axios-based scraping with retry, proxy, HTML→text extraction.
 * Registered as built-in tools at toolService startup.
 */

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
};

/**
 * Fetch a URL with retry logic.
 * @param {object} params
 * @param {string} params.url
 * @param {string} [params.method='GET']
 * @param {object} [params.headers]
 * @param {object} [params.data] - POST body
 * @param {string} [params.proxy] - proxy URL (http://host:port)
 * @param {number} [params.retries=2]
 * @param {number} [params.timeout=15000]
 * @returns {Promise<{ status: number, headers: object, data: string, contentType: string }>}
 */
async function fetchUrl({ url, method = 'GET', headers, data, proxy, retries = 2, timeout = 15000 }) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const config = {
                url,
                method,
                headers: { ...DEFAULT_HEADERS, ...headers },
                timeout,
                maxRedirects: 5,
                responseType: 'text'
            };
            if (data) config.data = data;
            if (proxy) {
                const proxyUrl = new URL(proxy);
                config.proxy = {
                    host: proxyUrl.hostname,
                    port: parseInt(proxyUrl.port, 10),
                    protocol: proxyUrl.protocol
                };
            }
            const resp = await axios(config);
            return {
                status: resp.status,
                headers: resp.headers,
                data: resp.data,
                contentType: resp.headers['content-type'] || ''
            };
        } catch (err) {
            lastError = err;
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            }
        }
    }
    throw lastError;
}

/**
 * Extract structured content from HTML using CSS selectors.
 * @param {string} html - Raw HTML
 * @param {object} [selectors] - { key: 'css selector' } map
 * @returns {object} Extracted data
 */
function extractFromHtml(html, selectors) {
    const $ = cheerio.load(html);
    if (!selectors) {
        // Default: return page title + body text
        return {
            title: $('title').text().trim(),
            text: $('body').text().replace(/\s+/g, ' ').trim().slice(0, 5000),
            links: $('a[href]').map((_, el) => ({
                text: $(el).text().trim(),
                href: $(el).attr('href')
            })).get().slice(0, 50)
        };
    }
    const result = {};
    for (const [key, selector] of Object.entries(selectors)) {
        const els = $(selector);
        if (els.length === 1) {
            result[key] = els.text().trim();
        } else {
            result[key] = els.map((_, el) => $(el).text().trim()).get();
        }
    }
    return result;
}

/**
 * Register HTTP fetcher tools.
 */
function registerAll() {
    toolRegistry.register({
        name: 'http_fetch',
        description: 'Fetch a URL via HTTP. Returns status, headers, and body text. Supports retry and proxy.',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL to fetch' },
                method: { type: 'string', description: 'HTTP method (default GET)' },
                headers: { type: 'object', description: 'Extra headers' },
                proxy: { type: 'string', description: 'Proxy URL (optional)' },
                retries: { type: 'number', description: 'Number of retries (default 2)' },
                extract: { type: 'boolean', description: 'Auto-extract title, text, links from HTML (default false)' }
            },
            required: ['url']
        },
        category: 'http',
        handler: async (params) => {
            const resp = await fetchUrl(params);
            if (params.extract && resp.contentType.includes('text/html')) {
                const extracted = extractFromHtml(resp.data);
                return { status: resp.status, ...extracted };
            }
            // Truncate large responses
            const body = typeof resp.data === 'string' ? resp.data.slice(0, 10000) : resp.data;
            return { status: resp.status, contentType: resp.contentType, body };
        }
    });

    toolRegistry.register({
        name: 'http_extract',
        description: 'Fetch a URL and extract content using CSS selectors. Returns structured data.',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL to fetch' },
                selectors: { type: 'object', description: 'Map of { key: "css selector" } to extract' },
                proxy: { type: 'string', description: 'Proxy URL (optional)' }
            },
            required: ['url']
        },
        category: 'http',
        handler: async ({ url, selectors, proxy }) => {
            const resp = await fetchUrl({ url, proxy });
            const extracted = extractFromHtml(resp.data, selectors);
            return { status: resp.status, ...extracted };
        }
    });

    console.log('[httpFetcher] Registered 2 HTTP tools');
}

module.exports = { fetchUrl, extractFromHtml, registerAll };
