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

// ---------------------------------------------------------------------------
// Helper: extract and parse the --toolbox JSON from a Chrome args array
// ---------------------------------------------------------------------------
function getToolboxPayload(args) {
    const toolboxArg = args.find((a) => a.startsWith('--toolbox='));
    if (!toolboxArg) throw new Error('--toolbox arg not found');
    return JSON.parse(toolboxArg.replace('--toolbox=', ''));
}

// ---------------------------------------------------------------------------
// Helper: audio seed → float conversion formula (from openChrome.js L218-219)
// ---------------------------------------------------------------------------
function audioSeedToFloat(seed) {
    return ((((seed * 1103515245 + 12345) & 0x7fffffff) % 10000) + 1) / 1000000;
}

// Shared base env for the new test groups
const sharedBaseEnv = {
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
    useProxy: false
};

// ---------------------------------------------------------------------------
// Group 1: languages_js consistency
// ---------------------------------------------------------------------------
describe('languages_js consistency', () => {
    it('strips q-values from language_http to produce languages_js', () => {
        const env = { ...sharedBaseEnv, language_http: 'en-US,en;q=0.9,zh;q=0.8' };
        const fp = getToolboxPayload(buildChromeArgs(env));
        expect(fp.languages_js).toBe('en-US,en,zh');
    });

    it('--lang flag matches the first item of languages_js', () => {
        const env = { ...sharedBaseEnv, language_js: 'en-US', language_http: 'en-US,en;q=0.9,zh;q=0.8' };
        const args = buildChromeArgs(env);
        const fp = getToolboxPayload(args);
        const langFlag = args.find((a) => a.startsWith('--lang='));
        const firstLang = fp.languages_js.split(',')[0];
        expect(langFlag).toBe(`--lang=${firstLang}`);
    });

    it('does not crash when language_http is undefined', () => {
        const env = { ...sharedBaseEnv, language_http: undefined };
        expect(() => buildChromeArgs(env)).not.toThrow();
        const fp = getToolboxPayload(buildChromeArgs(env));
        expect(fp.languages_js).toBe('');
    });
});

// ---------------------------------------------------------------------------
// Group 2: audio seed → float conversion (standalone formula tests)
// ---------------------------------------------------------------------------
describe('audio seed to float conversion', () => {
    it('seed 12345 produces a deterministic float in range (0.00001, 0.01)', () => {
        const result = audioSeedToFloat(12345);
        expect(result).toBeGreaterThan(0.00001);
        expect(result).toBeLessThan(0.01);
    });

    it('same seed always produces the same float', () => {
        const a = audioSeedToFloat(12345);
        const b = audioSeedToFloat(12345);
        expect(a).toBe(b);
    });

    it('different seeds produce different floats', () => {
        const a = audioSeedToFloat(12345);
        const b = audioSeedToFloat(99999);
        expect(a).not.toBe(b);
    });
});

// ---------------------------------------------------------------------------
// Group 3: fpPayload completeness
// ---------------------------------------------------------------------------
describe('fpPayload completeness', () => {
    it('without proxy: payload must NOT contain position, timeZone, webrtc_public', () => {
        const env = { ...sharedBaseEnv, useProxy: false };
        const fp = getToolboxPayload(buildChromeArgs(env));
        expect(fp).not.toHaveProperty('position');
        expect(fp).not.toHaveProperty('timeZone');
        expect(fp).not.toHaveProperty('webrtc_public');
    });

    it('with proxy: payload MUST contain position, timeZone, webrtc_public', () => {
        const env = {
            ...sharedBaseEnv,
            useProxy: true,
            proxyUrl: 'http://proxy:9090',
            position: '35.6,139.7',
            timeZone: 'Asia/Tokyo',
            webrtc_public: '5.6.7.8'
        };
        const fp = getToolboxPayload(buildChromeArgs(env));
        expect(fp.position).toBe('35.6,139.7');
        expect(fp.timeZone).toBe('Asia/Tokyo');
        expect(fp.webrtc_public).toBe('5.6.7.8');
    });
});

// ---------------------------------------------------------------------------
// Group 4: canvas data integrity
// ---------------------------------------------------------------------------
describe('canvas data integrity', () => {
    it('preserves object canvas with toDataUrl and seed fields', () => {
        const env = { ...sharedBaseEnv, canvas: { toDataUrl: 3.14, seed: 999 } };
        const fp = getToolboxPayload(buildChromeArgs(env));
        expect(fp.canvas).toEqual({ toDataUrl: 3.14, seed: 999 });
    });

    it('preserves plain number canvas (old format)', () => {
        const env = { ...sharedBaseEnv, canvas: 42 };
        const fp = getToolboxPayload(buildChromeArgs(env));
        expect(fp.canvas).toBe(42);
    });
});
