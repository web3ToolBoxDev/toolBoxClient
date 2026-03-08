'use strict';

const browserPool = require('./browserPool');
const toolRegistry = require('./toolRegistry');

/**
 * Built-in browser tools — registered at toolService startup.
 * Each tool operates on a browserId from the pool.
 */

function registerAll() {
    toolRegistry.register({
        name: 'browser_launch',
        description: 'Launch a browser instance. Returns browserId for subsequent operations.',
        parameters: {
            type: 'object',
            properties: {
                headless: { type: 'boolean', description: 'Run headless (default true)' },
                envId: { type: 'string', description: 'Fingerprint environment ID (optional)' }
            }
        },
        category: 'browser',
        handler: async (params) => {
            const chromePath = process.env.TOOL_SERVICE_CHROME_PATH || '';
            const savePath = process.env.TOOL_SERVICE_SAVE_PATH || '';
            const { browserId, mode } = await browserPool.launch({
                chromePath,
                savePath,
                env: params.env || undefined,
                headless: params.headless !== false
            });
            return { browserId, mode };
        }
    });

    toolRegistry.register({
        name: 'browser_close',
        description: 'Close a browser instance by ID.',
        parameters: {
            type: 'object',
            properties: {
                browserId: { type: 'string', description: 'Browser instance ID' }
            },
            required: ['browserId']
        },
        category: 'browser',
        handler: async ({ browserId }) => {
            await browserPool.close(browserId);
            return { closed: true };
        }
    });

    toolRegistry.register({
        name: 'page_goto',
        description: 'Navigate to a URL in the browser.',
        parameters: {
            type: 'object',
            properties: {
                browserId: { type: 'string' },
                url: { type: 'string', description: 'URL to navigate to' },
                waitUntil: { type: 'string', description: 'domcontentloaded | networkidle0 | load' }
            },
            required: ['browserId', 'url']
        },
        category: 'browser',
        handler: async ({ browserId, url, waitUntil }) => {
            const page = await browserPool.getPage(browserId);
            await page.goto(url, {
                waitUntil: waitUntil || 'domcontentloaded',
                timeout: 30000
            });
            return { url: page.url(), title: await page.title() };
        }
    });

    toolRegistry.register({
        name: 'page_click',
        description: 'Click an element on the page by CSS selector or text content.',
        parameters: {
            type: 'object',
            properties: {
                browserId: { type: 'string' },
                selector: { type: 'string', description: 'CSS selector' },
                text: { type: 'string', description: 'Click element containing this text (alternative to selector)' }
            },
            required: ['browserId']
        },
        category: 'browser',
        handler: async ({ browserId, selector, text }) => {
            const page = await browserPool.getPage(browserId);
            if (selector) {
                await page.click(selector);
                return { clicked: selector };
            }
            if (text) {
                // Find element by text content using XPath
                const [el] = await page.$x(`//*[contains(text(), "${text.replace(/"/g, '\\"')}")]`);
                if (!el) throw new Error(`No element found with text "${text}"`);
                await el.click();
                return { clicked: `text:${text}` };
            }
            throw new Error('Either selector or text is required');
        }
    });

    toolRegistry.register({
        name: 'page_type',
        description: 'Type text into an input element.',
        parameters: {
            type: 'object',
            properties: {
                browserId: { type: 'string' },
                selector: { type: 'string', description: 'CSS selector for the input' },
                text: { type: 'string', description: 'Text to type' },
                clear: { type: 'boolean', description: 'Clear the field first (default false)' },
                delay: { type: 'number', description: 'Delay between keystrokes in ms (default 0)' }
            },
            required: ['browserId', 'selector', 'text']
        },
        category: 'browser',
        handler: async ({ browserId, selector, text, clear, delay }) => {
            const page = await browserPool.getPage(browserId);
            if (clear) {
                await page.click(selector, { clickCount: 3 });
                await page.keyboard.press('Backspace');
            }
            await page.type(selector, text, { delay: delay || 0 });
            return { typed: text, into: selector };
        }
    });

    toolRegistry.register({
        name: 'page_screenshot',
        description: 'Take a screenshot of the current page. Returns base64 PNG.',
        parameters: {
            type: 'object',
            properties: {
                browserId: { type: 'string' },
                fullPage: { type: 'boolean', description: 'Capture full page (default false)' },
                selector: { type: 'string', description: 'Screenshot a specific element (optional)' }
            },
            required: ['browserId']
        },
        category: 'browser',
        handler: async ({ browserId, fullPage, selector }) => {
            const page = await browserPool.getPage(browserId);
            let buffer;
            if (selector) {
                const el = await page.$(selector);
                if (!el) throw new Error(`Element not found: ${selector}`);
                buffer = await el.screenshot({ encoding: 'base64' });
            } else {
                buffer = await page.screenshot({ fullPage: !!fullPage, encoding: 'base64' });
            }
            return { screenshot: buffer, format: 'base64/png' };
        }
    });

    toolRegistry.register({
        name: 'page_extract',
        description: 'Extract text content from elements matching a CSS selector.',
        parameters: {
            type: 'object',
            properties: {
                browserId: { type: 'string' },
                selector: { type: 'string', description: 'CSS selector to extract text from' },
                attribute: { type: 'string', description: 'Extract attribute value instead of text (e.g. "href")' },
                all: { type: 'boolean', description: 'Extract from all matching elements (default false, returns first)' }
            },
            required: ['browserId', 'selector']
        },
        category: 'browser',
        handler: async ({ browserId, selector, attribute, all }) => {
            const page = await browserPool.getPage(browserId);
            if (all) {
                const results = await page.$$eval(selector, (els, attr) => {
                    return els.map(el => attr ? el.getAttribute(attr) : el.textContent?.trim());
                }, attribute || null);
                return { results, count: results.length };
            }
            const result = await page.$eval(selector, (el, attr) => {
                return attr ? el.getAttribute(attr) : el.textContent?.trim();
            }, attribute || null);
            return { result };
        }
    });

    toolRegistry.register({
        name: 'page_scroll',
        description: 'Scroll the page by a specified amount or to an element.',
        parameters: {
            type: 'object',
            properties: {
                browserId: { type: 'string' },
                direction: { type: 'string', description: '"down" | "up" | "bottom" | "top"' },
                pixels: { type: 'number', description: 'Scroll by N pixels (alternative to direction)' },
                selector: { type: 'string', description: 'Scroll to this element (alternative)' }
            },
            required: ['browserId']
        },
        category: 'browser',
        handler: async ({ browserId, direction, pixels, selector }) => {
            const page = await browserPool.getPage(browserId);
            if (selector) {
                await page.$eval(selector, el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
                return { scrolledTo: selector };
            }
            const scrollMap = {
                down: 'window.scrollBy(0, 500)',
                up: 'window.scrollBy(0, -500)',
                bottom: 'window.scrollTo(0, document.body.scrollHeight)',
                top: 'window.scrollTo(0, 0)'
            };
            if (direction && scrollMap[direction]) {
                await page.evaluate(scrollMap[direction]);
                return { scrolled: direction };
            }
            if (typeof pixels === 'number') {
                await page.evaluate((px) => window.scrollBy(0, px), pixels);
                return { scrolled: `${pixels}px` };
            }
            // Default: scroll down
            await page.evaluate('window.scrollBy(0, 500)');
            return { scrolled: 'down (default)' };
        }
    });

    console.log(`[browserTools] Registered ${8} built-in browser tools`);
}

module.exports = { registerAll };
