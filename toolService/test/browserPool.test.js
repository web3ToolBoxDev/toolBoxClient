'use strict';

const { buildChromeArgs, ensureUserDataDir } = require('../lib/browserPool');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('browserPool — buildChromeArgs', () => {
    const baseEnv = {
        id: 'env_001',
        user_agent: 'Mozilla/5.0 TestAgent',
        language_js: 'en-US',
        language_http: 'en-US,en;q=0.9',
        audio: 'audio_hash',
        clientRect: 'rect_data',
        webgl: 'webgl_data',
        canvas: 'canvas_data',
        hardware: 'hw_data',
        screen: '1920x1080',
        clientHint: 'hint',
        fonts_remove: 'Arial',
        useProxy: false
    };

    test('builds basic args without proxy', () => {
        const args = buildChromeArgs(baseEnv);
        // --no-sandbox removed to avoid Cloudflare detection
        expect(args).not.toContain('--no-sandbox');
        expect(args).toContain('--disable-blink-features=AutomationControlled');
        expect(args.some(a => a.includes('--user-agent='))).toBe(true);
        expect(args.some(a => a.includes('--toolbox='))).toBe(true);
        expect(args.some(a => a.includes('--proxy-server='))).toBe(false);
    });

    test('adds proxy when useProxy is true', () => {
        const env = { ...baseEnv, useProxy: true, proxyUrl: 'socks5://127.0.0.1:1080', position: 'pos', timeZone: 'UTC', webrtc_public: '1.2.3.4' };
        const args = buildChromeArgs(env);
        expect(args.some(a => a.includes('--proxy-server=socks5://127.0.0.1:1080'))).toBe(true);
        const toolboxArg = args.find(a => a.startsWith('--toolbox='));
        const toolbox = JSON.parse(toolboxArg.replace('--toolbox=', ''));
        expect(toolbox.position).toBe('pos');
        expect(toolbox.timeZone).toBe('UTC');
    });

    test('adds wallet extension path', () => {
        const args = buildChromeArgs(baseEnv, { walletExtensionPath: '/ext/metamask' });
        expect(args.some(a => a.includes('--disable-extensions-except=/ext/metamask'))).toBe(true);
    });
});

describe('browserPool — ensureUserDataDir', () => {
    test('creates directory if not exists', () => {
        const tmpDir = path.join(os.tmpdir(), `bp_test_${Date.now()}`);
        const result = ensureUserDataDir(tmpDir, 'env_42');
        expect(result).toBe(path.join(tmpDir, 'env_42'));
        expect(fs.existsSync(result)).toBe(true);
        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
});

describe('browserPool — launch/close lifecycle', () => {
    const pool = require('../lib/browserPool');

    afterAll(async () => {
        await pool.closeAll();
    });

    test('size starts at 0', () => {
        expect(pool.size()).toBe(0);
    });

    test('listBrowsers returns empty array', () => {
        expect(pool.listBrowsers()).toEqual([]);
    });

    // NOTE: Actual launch tests require puppeteer + Chrome installed.
    // They are covered by E2E tests (test/tool-service-browser.spec.js).
    // Here we only test the pure functions.
});
