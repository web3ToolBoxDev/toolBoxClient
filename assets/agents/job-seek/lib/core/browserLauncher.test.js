const { buildChromeArgs, ensureUserDataDir } = require('./browserLauncher');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('browserLauncher', () => {
    describe('buildChromeArgs', () => {
        const baseEnv = {
            id: 'env1',
            user_agent: 'Mozilla/5.0 Test',
            language_js: 'en-US',
            audio: '0.123',
            clientRect: 'cr1',
            webgl: 'wgl1',
            canvas: 'cv1',
            hardware: 'hw1',
            screen: 'scr1',
            clientHint: 'ch1',
            language_http: 'en-US,en',
            fonts_remove: 'Arial',
            useProxy: false
        };

        it('builds basic args without proxy', () => {
            const args = buildChromeArgs(baseEnv);
            expect(args).toContain('--disable-blink-features=AutomationControlled');
            // --no-sandbox removed to avoid Cloudflare detection
            expect(args).not.toContain('--no-sandbox');
            expect(args).toContain(`--user-agent=${baseEnv.user_agent}`);
            expect(args).toContain(`--lang=${baseEnv.language_js}`);
            // Should have --toolbox with fingerprint JSON
            const toolboxArg = args.find((a) => a.startsWith('--toolbox='));
            expect(toolboxArg).toBeDefined();
            const fp = JSON.parse(toolboxArg.replace('--toolbox=', ''));
            expect(fp.audio).toBe('0.123');
            expect(fp.position).toBeUndefined();
        });

        it('includes proxy args when useProxy is true', () => {
            const proxyEnv = {
                ...baseEnv,
                useProxy: true,
                proxyUrl: 'http://proxy:8080',
                position: '40.7,-74.0',
                timeZone: 'America/New_York',
                webrtc_public: '1.2.3.4'
            };
            const args = buildChromeArgs(proxyEnv);
            expect(args).toContain('--proxy-server=http://proxy:8080');
            const toolboxArg = args.find((a) => a.startsWith('--toolbox='));
            const fp = JSON.parse(toolboxArg.replace('--toolbox=', ''));
            expect(fp.position).toBe('40.7,-74.0');
            expect(fp.timeZone).toBe('America/New_York');
        });

        it('includes wallet extension path when provided', () => {
            const args = buildChromeArgs(baseEnv, { walletExtensionPath: '/ext/metamask' });
            expect(args).toContain('--disable-extensions-except=/ext/metamask');
        });

        it('does not include extension arg without walletExtensionPath', () => {
            const args = buildChromeArgs(baseEnv);
            expect(args.some((a) => a.includes('--disable-extensions-except'))).toBe(false);
        });
    });

    describe('ensureUserDataDir', () => {
        let tmpDir;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bl-test-'));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('creates userDataDir if it does not exist', () => {
            const result = ensureUserDataDir(tmpDir, 'env123');
            expect(result).toBe(path.join(tmpDir, 'env123'));
            expect(fs.existsSync(result)).toBe(true);
        });

        it('returns existing dir without error', () => {
            const dir = path.join(tmpDir, 'existing');
            fs.mkdirSync(dir);
            const result = ensureUserDataDir(tmpDir, 'existing');
            expect(result).toBe(dir);
        });
    });
});
