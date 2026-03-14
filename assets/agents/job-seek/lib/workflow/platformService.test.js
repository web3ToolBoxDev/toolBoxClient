'use strict';

const platformStore = require('./platformStore');

// Mock toolServiceClient — general tool calls go through toolService
jest.mock('../core/toolServiceClient', () => ({
    executeTool: jest.fn(),
    request: jest.fn().mockResolvedValue({ success: false, browsers: [] })
}));
const toolServiceClient = require('../core/toolServiceClient');


// Mock the http module to intercept fetchFromServer calls
jest.mock('http', () => {
    const original = jest.requireActual('http');
    return {
        ...original,
        request: jest.fn()
    };
});
const http = require('http');

const platformService = require('./platformService');

const SESSION = 'platsvc-test-' + Date.now();

// Mock env data — simulates fingerPrintService DB records
const MOCK_ENVS = {
    env_123: { user_agent: 'Mozilla/5.0 Test', audio: '0.1', canvas: 'c1', webgl: 'w1', clientRect: 'cr1', hardware: 'h1', screen: 's1', clientHint: 'ch1', language_js: 'en-US', language_http: 'en', fonts_remove: '' },
    session_env_456: { user_agent: 'Mozilla/5.0 Session', audio: '0.2', canvas: 'c2', webgl: 'w2', clientRect: 'cr2', hardware: 'h2', screen: 's2', clientHint: 'ch2', language_js: 'en-CA', language_http: 'en', fonts_remove: '' },
    plat_env: { user_agent: 'Mozilla/5.0 Plat', audio: '0.3', canvas: 'c3', webgl: 'w3', clientRect: 'cr3', hardware: 'h3', screen: 's3', clientHint: 'ch3', language_js: 'zh-CN', language_http: 'zh', fonts_remove: '' },
    env_fail: { user_agent: 'Mozilla/5.0 Fail', audio: '0.4', canvas: 'c4', webgl: 'w4', clientRect: 'cr4', hardware: 'h4', screen: 's4', clientHint: 'ch4', language_js: 'en', language_http: 'en', fonts_remove: '' },
    env_store: { user_agent: 'Mozilla/5.0 Store', audio: '0.5', canvas: 'c5', webgl: 'w5', clientRect: 'cr5', hardware: 'h5', screen: 's5', clientHint: 'ch5', language_js: 'en', language_http: 'en', fonts_remove: '' },
    env_proxy: { user_agent: 'Mozilla/5.0 Proxy', audio: '0.6', canvas: 'c6', webgl: 'w6', clientRect: 'cr6', hardware: 'h6', screen: 's6', clientHint: 'ch6', language_js: 'en', language_http: 'en', fonts_remove: '', proxy: { ipType: 'http', ipHost: '1.2.3.4', ipPort: '8080', ipUsername: '', ipPassword: '' } },
};

// Helper: mock http.request to return appropriate responses for main server API calls
function mockServerApi() {
    http.request.mockImplementation((options, callback) => {
        const urlPath = options.path || '';
        let responseData;

        if (urlPath.includes('/api/getEnvById/')) {
            const envId = urlPath.split('/api/getEnvById/')[1];
            const env = MOCK_ENVS[decodeURIComponent(envId)];
            responseData = env ? { success: true, data: env } : { success: false };
        } else if (urlPath.includes('/api/getChromePath')) {
            responseData = { success: true, path: 'C:/chrome.exe' };
        } else if (urlPath.includes('/api/getSavePath')) {
            responseData = { success: true, path: 'C:/save' };
        } else if (urlPath.includes('/api/startProxyForEnv/')) {
            const envId = urlPath.split('/api/startProxyForEnv/')[1];
            const env = MOCK_ENVS[decodeURIComponent(envId)];
            if (env && env.proxy) {
                responseData = { success: true, data: { url: 'http://127.0.0.1:8888', ip: '1.2.3.4', position: '40.7,-74.0', timeZone: 'America/New_York' } };
            } else {
                responseData = { success: false, message: 'No proxy configured' };
            }
        } else {
            responseData = { success: false };
        }

        // Simulate Node http.request response stream
        const res = {
            on: jest.fn((event, handler) => {
                if (event === 'data') handler(JSON.stringify(responseData));
                if (event === 'end') handler();
                return res;
            })
        };
        if (callback) callback(res);
        // Return a mock request object with write/end/on methods
        return {
            on: jest.fn().mockReturnThis(),
            write: jest.fn(),
            end: jest.fn()
        };
    });
}

beforeEach(() => {
    platformStore.clearSession(SESSION);
    platformStore.initWithPresets(SESSION, 'Toronto, Canada');
    platformService._envBrowsers.clear();
    platformService._staleSelectorHints.clear();
    platformService.setScreenshotVerifier(null);
    jest.clearAllMocks();
    mockServerApi();
});

afterAll(() => {
    platformStore.clearSession(SESSION);
});

describe('launchLogin', () => {
    test('returns url method when no envId bound', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const indeed = platforms.find(p => p.name === 'Indeed');

        const result = await platformService.launchLogin(SESSION, indeed.id);

        expect(result.success).toBe(true);
        expect(result.method).toBe('url');
        expect(result.url).toContain('indeed.com');
        // Should NOT call toolServiceClient
        expect(toolServiceClient.executeTool).not.toHaveBeenCalled();
    });

    test('launches fingerprint browser when platform has envId', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const indeed = platforms.find(p => p.name === 'Indeed');

        // Bind env to platform
        platformStore.updatePlatform(SESSION, indeed.id, { envId: 'env_123' });

        // Mock toolService responses
        toolServiceClient.executeTool
            .mockResolvedValueOnce({ success: true, result: { browserId: 'br_abc' } })  // browser_launch
            .mockResolvedValueOnce({ success: true })  // page_goto
            .mockResolvedValueOnce({ success: true, result: { results: ['<div>AccountMenu</div>'], count: 1 } });  // auto-verify DOM check

        const result = await platformService.launchLogin(SESSION, indeed.id, {});

        expect(result.success).toBe(true);
        expect(result.method).toBe('fingerprint');
        expect(result.envId).toBe('env_123');
        expect(result.browserId).toBe('br_abc');
        expect(result.loginUrl).toContain('indeed.com');

        // Verify toolService was called with full env object (not just envId string)
        // Calls: browser_launch + page_goto + auto-verify (DOM selector check)
        expect(toolServiceClient.executeTool).toHaveBeenCalledTimes(3);
        expect(toolServiceClient.executeTool).toHaveBeenCalledWith('browser_launch', expect.objectContaining({
            env: expect.objectContaining({ id: 'env_123', user_agent: 'Mozilla/5.0 Test' }),
            chromePath: 'C:/chrome.exe',
            savePath: 'C:/save',
            headless: false
        }));
        expect(toolServiceClient.executeTool).toHaveBeenCalledWith('page_goto', { browserId: 'br_abc', url: expect.stringContaining('indeed.com'), waitFor: 3000 });
    });

    test('uses session-level envId as fallback', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const linkedin = platforms.find(p => p.name === 'LinkedIn');

        toolServiceClient.executeTool
            .mockResolvedValueOnce({ success: true, result: { browserId: 'br_xyz' } })
            .mockResolvedValueOnce({ success: true });

        const result = await platformService.launchLogin(SESSION, linkedin.id, {
            sessionEnvId: 'session_env_456'
        });

        expect(result.success).toBe(true);
        expect(result.method).toBe('fingerprint');
        expect(result.envId).toBe('session_env_456');
        expect(toolServiceClient.executeTool).toHaveBeenCalledWith('browser_launch', expect.objectContaining({
            env: expect.objectContaining({ id: 'session_env_456', user_agent: 'Mozilla/5.0 Session' }),
            headless: false
        }));
    });

    test('platform envId takes priority over session envId', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const indeed = platforms.find(p => p.name === 'Indeed');

        platformStore.updatePlatform(SESSION, indeed.id, { envId: 'plat_env' });

        toolServiceClient.executeTool
            .mockResolvedValueOnce({ success: true, result: { browserId: 'br_111' } })
            .mockResolvedValueOnce({ success: true });

        const result = await platformService.launchLogin(SESSION, indeed.id, {
            sessionEnvId: 'session_env_456'
        });

        expect(result.envId).toBe('plat_env');
        expect(toolServiceClient.executeTool).toHaveBeenCalledWith('browser_launch', expect.objectContaining({
            env: expect.objectContaining({ id: 'plat_env', language_js: 'zh-CN' })
        }));
    });

    test('returns error when envId not found in fingerprint DB', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const indeed = platforms.find(p => p.name === 'Indeed');
        platformStore.updatePlatform(SESSION, indeed.id, { envId: 'missing_env' });

        const result = await platformService.launchLogin(SESSION, indeed.id);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/env not found/i);
    });

    test('returns error when platform not found', async () => {
        const result = await platformService.launchLogin(SESSION, 'nonexistent');
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not found/);
    });

    test('returns error when browser launch fails', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const indeed = platforms.find(p => p.name === 'Indeed');
        platformStore.updatePlatform(SESSION, indeed.id, { envId: 'env_fail' });

        // First launch fails, recovery path retries and also fails
        toolServiceClient.executeTool
            .mockResolvedValueOnce({ success: false, error: 'Chrome not found' })   // browser_launch (1st attempt)
            .mockResolvedValueOnce({ success: false, error: 'Chrome not found' });  // browser_launch (retry after recovery)

        const result = await platformService.launchLogin(SESSION, indeed.id, {});
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Browser launch failed/);
    });

    test('launches browser with proxy when env has proxy configured', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const indeed = platforms.find(p => p.name === 'Indeed');

        // Bind env that has proxy config
        platformStore.updatePlatform(SESSION, indeed.id, { envId: 'env_proxy' });

        toolServiceClient.executeTool
            .mockResolvedValueOnce({ success: true, result: { browserId: 'br_proxy' } })  // browser_launch
            .mockResolvedValueOnce({ success: true });  // page_goto

        const result = await platformService.launchLogin(SESSION, indeed.id, {});

        expect(result.success).toBe(true);
        expect(result.method).toBe('fingerprint');
        expect(result.browserId).toBe('br_proxy');

        // Verify browser_launch was called with proxy fields set on env
        const launchCall = toolServiceClient.executeTool.mock.calls[0];
        expect(launchCall[0]).toBe('browser_launch');
        const envArg = launchCall[1].env;
        expect(envArg.id).toBe('env_proxy');
        expect(envArg.useProxy).toBe(true);
        expect(envArg.proxyUrl).toBe('http://127.0.0.1:8888');
        expect(envArg.position).toBe('40.7,-74.0');
        expect(envArg.timeZone).toBe('America/New_York');
        expect(envArg.webrtc_public).toBe('1.2.3.4');

        // Verify startProxyForEnv was called (POST request to proxy endpoint)
        const proxyCall = http.request.mock.calls.find(c => c[0].path.includes('/api/startProxyForEnv/'));
        expect(proxyCall).toBeTruthy();
        expect(proxyCall[0].method).toBe('POST');
    });

    test('launches browser without proxy when env has no proxy config', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const indeed = platforms.find(p => p.name === 'Indeed');

        // Bind env WITHOUT proxy
        platformStore.updatePlatform(SESSION, indeed.id, { envId: 'env_123' });

        toolServiceClient.executeTool
            .mockResolvedValueOnce({ success: true, result: { browserId: 'br_noproxy' } })
            .mockResolvedValueOnce({ success: true });

        await platformService.launchLogin(SESSION, indeed.id, {});

        // Verify env does NOT have proxy fields
        const launchCall = toolServiceClient.executeTool.mock.calls[0];
        const envArg = launchCall[1].env;
        expect(envArg.useProxy).toBeUndefined();
        expect(envArg.proxyUrl).toBeUndefined();

        // Verify startProxyForEnv was NOT called
        const proxyCall = http.request.mock.calls.find(c => c[0].path.includes('/api/startProxyForEnv/'));
        expect(proxyCall).toBeUndefined();
    });

    test('stores browserId and pageIndex on platform after fingerprint login', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const indeed = platforms.find(p => p.name === 'Indeed');
        platformStore.updatePlatform(SESSION, indeed.id, { envId: 'env_store' });

        toolServiceClient.executeTool
            .mockResolvedValueOnce({ success: true, result: { browserId: 'br_stored' } })
            .mockResolvedValueOnce({ success: true });

        const result = await platformService.launchLogin(SESSION, indeed.id, {});

        expect(platformService.getActiveBrowser(SESSION, indeed.id)).toBe('br_stored');
        expect(result.pageIndex).toBe(0);
        expect(indeed._pageIndex).toBe(0);
        // Browser should be tracked in _envBrowsers
        expect(platformService._envBrowsers.get('env_store')).toBe('br_stored');
    });

    test('reuses browser for second platform with same envId (new tab)', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const indeed = platforms.find(p => p.name === 'Indeed');
        const linkedin = platforms.find(p => p.name === 'LinkedIn');

        // Both platforms use the same env
        platformStore.updatePlatform(SESSION, indeed.id, { envId: 'env_123' });
        platformStore.updatePlatform(SESSION, linkedin.id, { envId: 'env_123' });

        // First launch: browser_launch + page_goto
        toolServiceClient.executeTool
            .mockResolvedValueOnce({ success: true, result: { browserId: 'br_shared' } })
            .mockResolvedValueOnce({ success: true });

        const r1 = await platformService.launchLogin(SESSION, indeed.id, {});
        expect(r1.browserId).toBe('br_shared');
        expect(r1.pageIndex).toBe(0);

        jest.clearAllMocks();
        mockServerApi();

        // Second launch: page_new (reuse browser, open new tab)
        toolServiceClient.executeTool
            .mockResolvedValueOnce({ success: true, result: { pageIndex: 1, url: 'https://www.linkedin.com/' } });

        const r2 = await platformService.launchLogin(SESSION, linkedin.id, {});
        expect(r2.browserId).toBe('br_shared');
        expect(r2.pageIndex).toBe(1);

        // Should NOT have called browser_launch again
        expect(toolServiceClient.executeTool).toHaveBeenCalledWith('page_new', expect.objectContaining({
            browserId: 'br_shared',
            url: expect.stringContaining('linkedin.com')
        }));
        expect(toolServiceClient.executeTool).not.toHaveBeenCalledWith('browser_launch', expect.anything());
    });
});

describe('confirmLogin', () => {
    test('marks platform as connected', () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const result = platformService.confirmLogin(SESSION, platforms[0].id);
        expect(result.success).toBe(true);
        expect(result.platform.status).toBe('connected');
    });

    test('returns error for unknown platform', () => {
        const result = platformService.confirmLogin(SESSION, 'fake');
        expect(result.success).toBe(false);
    });
});

describe('bindEnv', () => {
    test('binds envId to platform', () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const result = platformService.bindEnv(SESSION, platforms[0].id, 'env_bound');
        expect(result.success).toBe(true);

        const updated = platformStore.getPlatform(SESSION, platforms[0].id);
        expect(updated.envId).toBe('env_bound');
    });

    test('clears envId with null', () => {
        const platforms = platformStore.getPlatforms(SESSION);
        platformStore.updatePlatform(SESSION, platforms[0].id, { envId: 'env_old' });

        platformService.bindEnv(SESSION, platforms[0].id, null);
        const updated = platformStore.getPlatform(SESSION, platforms[0].id);
        expect(updated.envId).toBeNull();
    });
});

describe('closeBrowser', () => {
    test('closes browser and disconnects platform', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const pid = platforms[0].id;

        // Simulate a browser session
        platforms[0]._browserId = 'br_close_me';
        platforms[0]._pageIndex = 0;
        platforms[0].status = 'connected';

        toolServiceClient.executeTool.mockResolvedValueOnce({ success: true });

        const result = await platformService.closeBrowser(SESSION, pid);
        expect(result.success).toBe(true);
        expect(toolServiceClient.executeTool).toHaveBeenCalledWith('browser_close', { browserId: 'br_close_me' });

        const updated = platformStore.getPlatform(SESSION, pid);
        expect(updated._browserId).toBeNull();
        expect(updated._pageIndex).toBeUndefined();
        expect(updated.status).toBe('disconnected');
    });

    test('keeps browser open when other platforms still use it', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const indeed = platforms.find(p => p.name === 'Indeed');
        const linkedin = platforms.find(p => p.name === 'LinkedIn');

        // Both share the same browser
        indeed._browserId = 'br_shared';
        indeed._pageIndex = 0;
        indeed.status = 'connected';
        linkedin._browserId = 'br_shared';
        linkedin._pageIndex = 1;
        linkedin.status = 'connected';
        platformService._envBrowsers.set('shared_env', 'br_shared');

        const result = await platformService.closeBrowser(SESSION, indeed.id);
        expect(result.success).toBe(true);
        expect(result.message).toMatch(/kept open/);

        // Should NOT call browser_close
        expect(toolServiceClient.executeTool).not.toHaveBeenCalled();

        // Indeed disconnected, LinkedIn still has browser
        expect(indeed._browserId).toBeNull();
        expect(linkedin._browserId).toBe('br_shared');
        // _envBrowsers still has the mapping
        expect(platformService._envBrowsers.get('shared_env')).toBe('br_shared');
    });

    test('closes browser when last platform disconnects', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const indeed = platforms.find(p => p.name === 'Indeed');

        indeed._browserId = 'br_last';
        indeed._pageIndex = 0;
        indeed.status = 'connected';
        platformService._envBrowsers.set('last_env', 'br_last');

        toolServiceClient.executeTool.mockResolvedValueOnce({ success: true });

        await platformService.closeBrowser(SESSION, indeed.id);
        expect(toolServiceClient.executeTool).toHaveBeenCalledWith('browser_close', { browserId: 'br_last' });
        expect(platformService._envBrowsers.has('last_env')).toBe(false);
    });

    test('returns error when no active browser', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const result = await platformService.closeBrowser(SESSION, platforms[0].id);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/No active browser/);
    });
});

describe('getActiveBrowser', () => {
    test('returns null when no browser active', () => {
        const platforms = platformStore.getPlatforms(SESSION);
        expect(platformService.getActiveBrowser(SESSION, platforms[0].id)).toBeNull();
    });

    test('returns browserId when set', () => {
        const platforms = platformStore.getPlatforms(SESSION);
        platforms[0]._browserId = 'br_active';
        expect(platformService.getActiveBrowser(SESSION, platforms[0].id)).toBe('br_active');
    });
});

describe('verifyLogin', () => {
    // ─── No browser open ───

    test('auto-connects Indeed (no login required, no browser)', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const indeed = platforms.find(p => p.name === 'Indeed');

        const result = await platformService.verifyLogin(SESSION, indeed.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('logged_in');
        expect(platformStore.getPlatform(SESSION, indeed.id).status).toBe('connected');
        expect(toolServiceClient.executeTool).not.toHaveBeenCalled();
    });

    test('returns no_browser for LinkedIn (login required, no browser)', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const linkedin = platforms.find(p => p.name === 'LinkedIn');

        const result = await platformService.verifyLogin(SESSION, linkedin.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('no_browser');
    });

    test('auto-connects Job Bank (no login required, no browser)', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const jobbank = platforms.find(p => p.name === 'Job Bank');

        const result = await platformService.verifyLogin(SESSION, jobbank.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('logged_in');
    });

    // ─── Step 1: DOM selector (fast, free) ───

    test('DOM pass → logged_in immediately (Indeed with browser)', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const indeed = platforms.find(p => p.name === 'Indeed');
        indeed._browserId = 'br_indeed_ok';
        indeed._pageIndex = 0;

        toolServiceClient.executeTool.mockResolvedValueOnce({
            success: true,
            result: { results: ['<div data-gnav-element-name="AccountMenu">'], count: 1 }
        });

        const result = await platformService.verifyLogin(SESSION, indeed.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('logged_in');
        expect(result.method).toBe('dom');
        expect(platformStore.getPlatform(SESSION, indeed.id).status).toBe('connected');
    });

    test('DOM pass → logged_in for LinkedIn (skips screenshot)', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const linkedin = platforms.find(p => p.name === 'LinkedIn');
        linkedin._browserId = 'br_li_dom';
        linkedin._pageIndex = 0;

        // DOM succeeds — should NOT call screenshot at all
        toolServiceClient.executeTool.mockResolvedValueOnce({
            success: true,
            result: { results: ['<img class="global-nav__me-photo">'], count: 1 }
        });

        const mockVerifier = jest.fn();
        platformService.setScreenshotVerifier(mockVerifier);

        const result = await platformService.verifyLogin(SESSION, linkedin.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('logged_in');
        expect(result.method).toBe('dom');
        expect(mockVerifier).not.toHaveBeenCalled(); // screenshot skipped
    });

    test('DOM pass clears stale selector hint', async () => {
        // Pre-flag a stale hint
        platformService._staleSelectorHints.set('linkedin.com', { label: 'LinkedIn', flaggedAt: Date.now() });

        const platforms = platformStore.getPlatforms(SESSION);
        const linkedin = platforms.find(p => p.name === 'LinkedIn');
        linkedin._browserId = 'br_li_clear';
        linkedin._pageIndex = 0;

        toolServiceClient.executeTool.mockResolvedValueOnce({
            success: true,
            result: { results: ['<img class="global-nav__me-photo">'], count: 1 }
        });

        await platformService.verifyLogin(SESSION, linkedin.id);
        expect(platformService._staleSelectorHints.has('linkedin.com')).toBe(false);
    });

    // ─── Step 2: DOM fail → screenshot fallback ───

    test('DOM fail + screenshot pass → logged_in + staleSelector flagged (LinkedIn)', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const linkedin = platforms.find(p => p.name === 'LinkedIn');
        linkedin._browserId = 'br_li_stale';
        linkedin._pageIndex = 1;

        // DOM returns empty
        toolServiceClient.executeTool
            .mockResolvedValueOnce({ success: true, result: { results: [], count: 0 } })
            // Screenshot
            .mockResolvedValueOnce({ success: true, result: { screenshot: 'base64png' } });

        platformService.setScreenshotVerifier(async (base64, label) => {
            expect(label).toBe('LinkedIn');
            return { loggedIn: true, reasoning: 'Profile photo visible' };
        });

        const result = await platformService.verifyLogin(SESSION, linkedin.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('logged_in');
        expect(result.method).toBe('screenshot');
        expect(result.staleSelector).toBe(true);
        expect(platformStore.getPlatform(SESSION, linkedin.id).status).toBe('connected');

        // Stale hint flagged
        expect(platformService._staleSelectorHints.has('linkedin.com')).toBe(true);
        const hint = platformService._staleSelectorHints.get('linkedin.com');
        expect(hint.label).toBe('LinkedIn');
    });

    test('DOM fail + screenshot fail → not_logged_in (LinkedIn)', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const linkedin = platforms.find(p => p.name === 'LinkedIn');
        linkedin._browserId = 'br_li_nope';
        linkedin._pageIndex = 0;

        // DOM empty
        toolServiceClient.executeTool
            .mockResolvedValueOnce({ success: true, result: { results: [], count: 0 } })
            // Screenshot
            .mockResolvedValueOnce({ success: true, result: { screenshot: 'base64png' } });

        platformService.setScreenshotVerifier(async () => ({ loggedIn: false, reasoning: 'Login form' }));

        const result = await platformService.verifyLogin(SESSION, linkedin.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('not_logged_in');
        expect(result.method).toBe('screenshot');
    });

    test('DOM fail + no verifier → not_logged_in (Indeed with browser)', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const indeed = platforms.find(p => p.name === 'Indeed');
        indeed._browserId = 'br_indeed_login';
        indeed._pageIndex = 0;

        toolServiceClient.executeTool.mockResolvedValueOnce({
            success: true,
            result: { results: [], count: 0 }
        });

        // No screenshot verifier set
        const result = await platformService.verifyLogin(SESSION, indeed.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('not_logged_in');
    });

    // ─── No selector, screenshot only (Job Bank) ───

    test('no selector + screenshot pass → logged_in (Job Bank with browser)', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const jobbank = platforms.find(p => p.name === 'Job Bank');
        jobbank._browserId = 'br_jobbank';
        jobbank._pageIndex = 2;

        const mockVerifier = jest.fn().mockResolvedValue({
            loggedIn: true, reasoning: 'User avatar visible'
        });
        platformService.setScreenshotVerifier(mockVerifier);

        toolServiceClient.executeTool.mockResolvedValueOnce({
            success: true,
            result: { screenshot: 'base64screenshotdata' }
        });

        const result = await platformService.verifyLogin(SESSION, jobbank.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('logged_in');
        expect(result.method).toBe('screenshot');
        expect(result.staleSelector).toBeUndefined(); // no selector → no stale flag
        expect(mockVerifier).toHaveBeenCalledWith('base64screenshotdata', 'Job Bank');
    });

    test('no selector + screenshot fail → not_logged_in (Job Bank)', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const jobbank = platforms.find(p => p.name === 'Job Bank');
        jobbank._browserId = 'br_jobbank2';
        jobbank._pageIndex = 0;

        platformService.setScreenshotVerifier(jest.fn().mockResolvedValue({
            loggedIn: false, reasoning: 'Login page shown'
        }));

        toolServiceClient.executeTool.mockResolvedValueOnce({
            success: true,
            result: { screenshot: 'base64data' }
        });

        const result = await platformService.verifyLogin(SESSION, jobbank.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('not_logged_in');
        expect(result.method).toBe('screenshot');
    });

    test('no selector + no verifier + no login required → auto-connect (Job Bank with browser)', async () => {
        const platforms = platformStore.getPlatforms(SESSION);
        const jobbank = platforms.find(p => p.name === 'Job Bank');
        jobbank._browserId = 'br_jobbank3';

        // Job Bank doesn't require login → auto-connects even without verifier
        const result = await platformService.verifyLogin(SESSION, jobbank.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('logged_in');
    });

    // ─── DOM-only platforms (Glassdoor) ───

    test('DOM pass → logged_in (Glassdoor)', async () => {
        platformStore.addPlatform(SESSION, {
            name: 'Glassdoor', url: 'https://www.glassdoor.com/', loginUrl: 'https://www.glassdoor.com/profile/login', enabled: true
        });
        const platforms = platformStore.getPlatforms(SESSION);
        const glassdoor = platforms.find(p => p.name === 'Glassdoor');
        glassdoor._browserId = 'br_gd_ok';
        glassdoor._pageIndex = 0;

        toolServiceClient.executeTool.mockResolvedValueOnce({
            success: true,
            result: { results: ['<div class="HeaderProfile">User</div>'], count: 1 }
        });

        const result = await platformService.verifyLogin(SESSION, glassdoor.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('logged_in');
        expect(result.method).toBe('dom');
    });

    test('DOM fail + no verifier → not_logged_in (Glassdoor)', async () => {
        platformStore.addPlatform(SESSION, {
            name: 'Glassdoor2', url: 'https://www.glassdoor.com/reviews', loginUrl: 'https://www.glassdoor.com/profile/login', enabled: true
        });
        const platforms = platformStore.getPlatforms(SESSION);
        const glassdoor = platforms.find(p => p.name === 'Glassdoor2');
        glassdoor._browserId = 'br_gd_fail';
        glassdoor._pageIndex = 0;

        toolServiceClient.executeTool.mockResolvedValueOnce({
            success: true,
            result: { results: [], count: 0 }
        });

        const result = await platformService.verifyLogin(SESSION, glassdoor.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('not_logged_in');
    });

    test('DOM fail + screenshot fallback pass → logged_in + staleSelector (Glassdoor)', async () => {
        platformStore.addPlatform(SESSION, {
            name: 'Glassdoor3', url: 'https://www.glassdoor.com/jobs', loginUrl: 'https://www.glassdoor.com/profile/login', enabled: true
        });
        const platforms = platformStore.getPlatforms(SESSION);
        const glassdoor = platforms.find(p => p.name === 'Glassdoor3');
        glassdoor._browserId = 'br_gd_stale';
        glassdoor._pageIndex = 0;

        // DOM empty, then screenshot
        toolServiceClient.executeTool
            .mockResolvedValueOnce({ success: true, result: { results: [], count: 0 } })
            .mockResolvedValueOnce({ success: true, result: { screenshot: 'base64png' } });

        platformService.setScreenshotVerifier(async () => ({ loggedIn: true, reasoning: 'Profile menu visible' }));

        const result = await platformService.verifyLogin(SESSION, glassdoor.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('logged_in');
        expect(result.method).toBe('screenshot');
        expect(result.staleSelector).toBe(true);
        expect(platformService._staleSelectorHints.has('glassdoor.com')).toBe(true);
    });

    // ─── getStaleSelectorHints / clearStaleSelectorHint ───

    test('getStaleSelectorHints returns flagged detectors', () => {
        platformService._staleSelectorHints.set('linkedin.com', { label: 'LinkedIn', flaggedAt: 1000 });
        platformService._staleSelectorHints.set('glassdoor.com', { label: 'Glassdoor', flaggedAt: 2000 });

        const hints = platformService.getStaleSelectorHints();
        expect(hints).toHaveLength(2);
        expect(hints[0]).toMatchObject({ pattern: 'linkedin.com', label: 'LinkedIn' });
        expect(hints[0].selector).toContain('global-nav__me-photo');
    });

    test('clearStaleSelectorHint removes a hint', () => {
        platformService._staleSelectorHints.set('linkedin.com', { label: 'LinkedIn', flaggedAt: 1000 });
        platformService.clearStaleSelectorHint('linkedin.com');
        expect(platformService._staleSelectorHints.has('linkedin.com')).toBe(false);
    });

    test('returns unknown for custom platforms without detector', async () => {
        platformStore.addPlatform(SESSION, {
            name: 'CustomSite',
            url: 'https://www.custom-jobs.example.com'
        });
        const platforms = platformStore.getPlatforms(SESSION);
        const custom = platforms.find(p => p.name === 'CustomSite');

        const result = await platformService.verifyLogin(SESSION, custom.id);
        expect(result.success).toBe(true);
        expect(result.status).toBe('unknown');
    });

    test('returns error for nonexistent platform', async () => {
        const result = await platformService.verifyLogin(SESSION, 'fake');
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not found/);
    });
});

describe('getDetector', () => {
    test('matches Indeed by URL pattern', () => {
        const d = platformService.getDetector({ url: 'https://ca.indeed.com/jobs', loginUrl: '' });
        expect(d).toBeTruthy();
        expect(d.label).toBe('Indeed');
        expect(d.loginRequired).toBe(false);
    });

    test('matches Boss直聘 by URL pattern', () => {
        const d = platformService.getDetector({ url: 'https://www.zhipin.com/web/geek/job', loginUrl: 'https://login.zhipin.com/' });
        expect(d).toBeTruthy();
        expect(d.label).toBe('Boss直聘');
        expect(d.loginRequired).toBe(true);
    });

    test('matches 拉勾 by URL pattern', () => {
        const d = platformService.getDetector({ url: 'https://www.lagou.com/zhaopin/' });
        expect(d).toBeTruthy();
        expect(d.label).toBe('拉勾');
    });

    test('matches 前程无忧 by URL pattern', () => {
        const d = platformService.getDetector({ url: 'https://www.51job.com/jobs' });
        expect(d).toBeTruthy();
        expect(d.label).toBe('前程无忧');
    });

    test('matches 智联招聘 by URL pattern', () => {
        const d = platformService.getDetector({ url: 'https://www.zhaopin.com/jobs' });
        expect(d).toBeTruthy();
        expect(d.label).toBe('智联招聘');
    });

    test('matches 猎聘 by URL pattern', () => {
        const d = platformService.getDetector({ url: 'https://www.liepin.com/jobs' });
        expect(d).toBeTruthy();
        expect(d.label).toBe('猎聘');
    });

    test('returns null for unknown URLs', () => {
        const d = platformService.getDetector({ url: 'https://www.random-site.com' });
        expect(d).toBeNull();
    });
});
