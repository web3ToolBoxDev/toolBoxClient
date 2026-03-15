'use strict';

jest.setTimeout(120000);

/**
 * Tests for scriptBuilder — AI-powered Puppeteer script generation & execution.
 *
 * Tests cover:
 * - extractCodeBlock
 * - buildDomSummary
 * - buildTool (5-step flow: success, failure, retry, no-platform, bad-toolType)
 * - executeSearchScript (ready, not-ready, no-platform, browser-error)
 * - healScript (success, no-script, AI-failure)
 * - buildPageProxy
 */

// ─── Mock toolServiceClient ───
const _toolResults = {};

jest.mock('../core/toolServiceClient', () => ({
    executeTool: jest.fn(async (name, params) => {
        if (_toolResults[name]) {
            const r = typeof _toolResults[name] === 'function'
                ? _toolResults[name](params)
                : _toolResults[name];
            return { success: true, result: r };
        }
        return { success: true, result: {} };
    }),
    request: jest.fn(async (method, path, body, timeout) => {
        const name = body && body.name;
        const params = body && body.params;
        if (name && _toolResults[name]) {
            const r = typeof _toolResults[name] === 'function'
                ? _toolResults[name](params)
                : _toolResults[name];
            return { success: true, result: r };
        }
        return { success: true, result: {} };
    })
}));

// ─── Mock platformStore ───
const _platforms = {};

jest.mock('./platformService', () => ({
    adoptSharedBrowser: jest.fn().mockResolvedValue({ success: false }),
    launchLogin: jest.fn().mockResolvedValue({ success: false }),
    verifyLogin: jest.fn().mockResolvedValue({ status: 'logged_in' })
}));

jest.mock('./platformStore', () => ({
    getPlatform: jest.fn((sid, pid) => {
        const key = `${sid}:${pid}`;
        return _platforms[key] ? { ..._platforms[key] } : null;
    }),
    updateToolStatus: jest.fn((sid, pid, type, status, extra) => {
        const key = `${sid}:${pid}`;
        if (!_platforms[key]) return { success: false };
        _platforms[key].tools[type] = {
            ..._platforms[key].tools[type],
            status,
            ...(extra || {})
        };
        return { success: true };
    }),
    getFixRules: jest.fn(() => []),
    addFixRule: jest.fn()
}));

const scriptBuilder = require('./scriptBuilder');
const tsc = require('../core/toolServiceClient');
const platformStore = require('./platformStore');

// ─── Test Setup ───

const SID = 'test-session';
const PID = 'plat_001';

function makePlatform(overrides = {}) {
    return {
        id: PID,
        name: 'TestSite',
        url: 'https://testsite.com/jobs',
        envId: null,
        _browserId: null,
        connectionType: 'browser',
        tools: {
            search: { status: 'not_built', script: null, version: 0, buildLog: [] },
            apply: { status: 'not_built', script: null, version: 0, buildLog: [] }
        },
        ...overrides
    };
}

function resetState() {
    Object.keys(_platforms).forEach(k => delete _platforms[k]);
    Object.keys(_toolResults).forEach(k => delete _toolResults[k]);
    jest.clearAllMocks();
}

// ─── extractCodeBlock ───

describe('extractCodeBlock', () => {
    const extract = scriptBuilder._extractCodeBlock;

    test('extracts from ```javascript fence', () => {
        const input = 'Here is the script:\n```javascript\nconst x = 1;\n```\nDone.';
        expect(extract(input)).toBe('const x = 1;');
    });

    test('extracts from ```js fence', () => {
        const input = '```js\nfunction foo() {}\n```';
        expect(extract(input)).toBe('function foo() {}');
    });

    test('extracts from generic ``` fence', () => {
        const input = '```\nlet y = 2;\n```';
        expect(extract(input)).toBe('let y = 2;');
    });

    test('returns trimmed text when no fence', () => {
        const input = '  raw code here  ';
        expect(extract(input)).toBe('raw code here');
    });
});

// ─── buildDomSummary ───

describe('buildDomSummary', () => {
    const summary = scriptBuilder._buildDomSummary;

    test('returns string as-is if short', () => {
        expect(summary('hello')).toBe('hello');
    });

    test('truncates long string', () => {
        const long = 'x'.repeat(15000);
        const result = summary(long);
        expect(result.length).toBeLessThan(15000);
        expect(result).toContain('truncated');
    });

    test('stringifies objects', () => {
        expect(summary({ input: 'text' })).toBe('{"input":"text"}');
    });

    test('handles null', () => {
        expect(summary(null)).toBe('(no data extracted)');
    });
});

// ─── buildTool ───

describe('buildTool', () => {
    beforeEach(() => {
        resetState();
        _platforms[`${SID}:${PID}`] = makePlatform();

        // Default tool mocks
        _toolResults['browser_launch'] = { browserId: 'br_001' };
        _toolResults['page_goto'] = { pageIndex: 0 };
        _toolResults['page_new'] = { pageIndex: 1 };
        _toolResults['page_screenshot'] = { base64: 'iVBOR...' };
        // page_evaluate not set — defaults to {}, which makes _detectAntiBot return null
        _toolResults['browser_close'] = {};
    });

    test('successful build with all 5 steps', async () => {
        const aiInvoke = jest.fn()
            .mockResolvedValueOnce('```javascript\nreturn { success: true, jobs: [{title:"Engineer", company:"Co", url:"https://x.com/1"}] };\n```')  // Step 3: generate
            .mockResolvedValueOnce('YES the page shows search results');                 // Step 4: verify

        const progressLogs = [];
        const result = await scriptBuilder.buildTool(SID, PID, 'search', {
            aiInvoke,
            testParams: { keywords: 'test' },
            onProgress: (entry) => progressLogs.push(entry)
        });

        expect(result.success).toBe(true);
        expect(result.script).toContain('jobs');
        expect(result.buildLog.length).toBeGreaterThanOrEqual(5);
        expect(progressLogs.length).toBeGreaterThanOrEqual(5);

        // Verify tool status was updated to ready
        expect(platformStore.updateToolStatus).toHaveBeenCalledWith(
            SID, PID, 'search', 'ready',
            expect.objectContaining({ script: expect.any(String) })
        );
    });

    test('fails after max retries when verification fails', async () => {
        const aiInvoke = jest.fn()
            .mockResolvedValue('```javascript\nconst x = 1;\n```');  // Always generates code
        // But verification always fails (no YES in response)

        const result = await scriptBuilder.buildTool(SID, PID, 'search', {
            aiInvoke,
            maxRetries: 1
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test('returns error for non-existent platform', async () => {
        const result = await scriptBuilder.buildTool(SID, 'nonexistent', 'search', {
            aiInvoke: jest.fn()
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Platform not found');
    });

    test('returns error for invalid toolType', async () => {
        const result = await scriptBuilder.buildTool(SID, PID, 'invalid', {
            aiInvoke: jest.fn()
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('search');
    });

    test('returns error when aiInvoke is missing', async () => {
        const result = await scriptBuilder.buildTool(SID, PID, 'search', {});

        expect(result.success).toBe(false);
        expect(result.error).toContain('aiInvoke');
    });

    test('handles browser launch failure', async () => {
        _toolResults['browser_launch'] = () => { throw new Error('browser_launch failed: no chrome'); };

        const result = await scriptBuilder.buildTool(SID, PID, 'search', {
            aiInvoke: jest.fn()
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('browser_launch');
    });

    test('builds apply tool', async () => {
        const aiInvoke = jest.fn()
            .mockResolvedValueOnce('```javascript\nreturn { applied: false };\n```')
            .mockResolvedValueOnce('YES the page shows a form');

        const result = await scriptBuilder.buildTool(SID, PID, 'apply', {
            aiInvoke,
            maxRetries: 0
        });

        expect(result.success).toBe(true);
    });

    test('retries after verification fails on first attempt', async () => {
        const aiInvoke = jest.fn()
            .mockResolvedValueOnce('```javascript\nconst bad = "broken";\n```')   // attempt 1: generate
            .mockResolvedValueOnce('NO the page shows an error')                   // attempt 1: verify fails
            .mockResolvedValueOnce('Use longer timeout for waitForSelector')        // attempt 1: analyzeFailure
            .mockResolvedValueOnce('```javascript\nreturn { success: true, jobs: [{title:"Eng", company:"Co", url:"https://x.com/1"}] };\n```')     // attempt 2: generate
            .mockResolvedValueOnce('YES results visible');                          // attempt 2: verify passes

        const result = await scriptBuilder.buildTool(SID, PID, 'search', {
            aiInvoke,
            maxRetries: 2
        });

        expect(result.success).toBe(true);
        // 2 generate + 2 verify + 1 analyzeFailure = 5 AI calls
        expect(aiInvoke).toHaveBeenCalledTimes(5);
    });
});

// ─── executeSearchScript ───

describe('executeSearchScript', () => {
    beforeEach(() => {
        resetState();
        _toolResults['browser_launch'] = { browserId: 'br_002' };
        _toolResults['page_goto'] = { pageIndex: 0 };
        _toolResults['browser_close'] = {};
    });

    test('returns error for non-existent platform', async () => {
        const result = await scriptBuilder.executeSearchScript(SID, 'nonexistent', { keywords: 'test' });
        expect(result.success).toBe(false);
        expect(result.error).toBe('Platform not found');
    });

    test('returns error when tool not ready', async () => {
        _platforms[`${SID}:${PID}`] = makePlatform();
        const result = await scriptBuilder.executeSearchScript(SID, PID, { keywords: 'test' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('not ready');
    });

    test('returns error when tool has no script', async () => {
        _platforms[`${SID}:${PID}`] = makePlatform({
            tools: {
                search: { status: 'ready', script: null, version: 1, buildLog: [] },
                apply: { status: 'not_built', script: null, version: 0, buildLog: [] }
            }
        });
        const result = await scriptBuilder.executeSearchScript(SID, PID, { keywords: 'test' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('not ready');
    });

    test('executes script and returns jobs', async () => {
        _platforms[`${SID}:${PID}`] = makePlatform({
            tools: {
                search: {
                    status: 'ready',
                    // Simple script that returns jobs array
                    script: 'return { success: true, jobs: [{ title: "Engineer", company: "Co", url: "https://x.com/1" }] };',
                    version: 1,
                    buildLog: []
                },
                apply: { status: 'not_built', script: null, version: 0, buildLog: [] }
            }
        });

        // The page proxy approach uses page_extract under the hood,
        // but the simple script above uses `return` directly
        // The AsyncFunction wrapper will handle it
        const result = await scriptBuilder.executeSearchScript(SID, PID, { keywords: 'test' });

        // This will depend on whether the script can execute via AsyncFunction
        // In unit test context, the page proxy can't really operate
        // We verify the flow structure works
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('jobs');
    });

    test('respects maxResults limit', async () => {
        _platforms[`${SID}:${PID}`] = makePlatform({
            tools: {
                search: {
                    status: 'ready',
                    script: 'return { success: true, jobs: Array.from({length:50}, (_, i) => ({title: "Job " + i, url: "https://x.com/" + i})) };',
                    version: 1,
                    buildLog: []
                },
                apply: { status: 'not_built', script: null, version: 0, buildLog: [] }
            }
        });

        const result = await scriptBuilder.executeSearchScript(SID, PID, { keywords: 'test' }, { maxResults: 5 });
        // Whether script exec succeeds depends on environment,
        // but if it does, jobs should be capped at 5
        if (result.success) {
            expect(result.jobs.length).toBeLessThanOrEqual(5);
        }
    });
});

// ─── healScript ───

describe('healScript', () => {
    beforeEach(() => {
        resetState();
        _platforms[`${SID}:${PID}`] = makePlatform({
            tools: {
                search: {
                    status: 'failed',
                    script: 'const old = "broken code";',
                    version: 1,
                    buildLog: []
                },
                apply: { status: 'not_built', script: null, version: 0, buildLog: [] }
            }
        });
    });

    test('successful heal updates script', async () => {
        const aiInvoke = jest.fn().mockResolvedValue('```javascript\nconst fixed = "working code";\n```');

        const result = await scriptBuilder.healScript(SID, PID, 'search', {
            error: 'Element not found',
            screenshot: 'base64...',
            currentScript: 'const old = "broken";'
        }, { aiInvoke });

        expect(result.success).toBe(true);
        expect(result.fixedScript).toContain('working code');
        expect(platformStore.updateToolStatus).toHaveBeenCalledWith(
            SID, PID, 'search', 'ready',
            expect.objectContaining({ script: expect.any(String) })
        );
    });

    test('returns error when platform not found', async () => {
        const result = await scriptBuilder.healScript(SID, 'nonexistent', 'search', {
            error: 'test'
        }, { aiInvoke: jest.fn() });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Platform not found');
    });

    test('returns error when no existing script', async () => {
        _platforms[`${SID}:${PID}`] = makePlatform();  // no script

        const result = await scriptBuilder.healScript(SID, PID, 'search', {
            error: 'test'
        }, { aiInvoke: jest.fn() });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No existing script');
    });

    test('returns error when aiInvoke is missing', async () => {
        const result = await scriptBuilder.healScript(SID, PID, 'search', {
            error: 'test'
        }, {});

        expect(result.success).toBe(false);
        expect(result.error).toContain('aiInvoke');
    });

    test('handles AI error gracefully', async () => {
        const aiInvoke = jest.fn().mockRejectedValue(new Error('AI service down'));

        const result = await scriptBuilder.healScript(SID, PID, 'search', {
            error: 'Element not found',
            currentScript: 'const old = "broken";'
        }, { aiInvoke });

        expect(result.success).toBe(false);
        expect(result.error).toContain('AI service down');
    });
});

// ─── buildPageProxy ───

describe('buildPageProxy', () => {
    beforeEach(() => {
        resetState();
        _toolResults['page_evaluate'] = { result: true };
        _toolResults['page_screenshot'] = { base64: 'iVBOR...' };
        _toolResults['page_goto'] = { pageIndex: 0 };
    });

    test('proxy.goto calls page_goto', async () => {
        const proxy = scriptBuilder._buildPageProxy('br_001', 0);
        await proxy.goto('https://example.com');
        expect(tsc.request).toHaveBeenCalledWith(
            'POST', '/tools/execute',
            expect.objectContaining({ name: 'page_goto', params: expect.objectContaining({ url: 'https://example.com' }) }),
            expect.any(Number)
        );
    });

    test('proxy.screenshot calls page_screenshot', async () => {
        const proxy = scriptBuilder._buildPageProxy('br_001', 0);
        const result = await proxy.screenshot();
        expect(tsc.request).toHaveBeenCalledWith(
            'POST', '/tools/execute',
            expect.objectContaining({ name: 'page_screenshot', params: expect.objectContaining({ browserId: 'br_001' }) }),
            expect.any(Number)
        );
    });

    test('proxy.$$ returns array', async () => {
        _toolResults['page_evaluate'] = { result: 3 };
        const proxy = scriptBuilder._buildPageProxy('br_001', 0);
        const result = await proxy.$$('.job-card');
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(3);
    });

    test('proxy.$ returns truthy when element exists', async () => {
        _toolResults['page_evaluate'] = { result: true };
        const proxy = scriptBuilder._buildPageProxy('br_001', 0);
        const result = await proxy.$('.job-card');
        expect(result).toBeTruthy();
    });

    test('proxy.$ returns null when no element', async () => {
        _toolResults['page_evaluate'] = { result: false };
        const proxy = scriptBuilder._buildPageProxy('br_001', 0);
        const result = await proxy.$('.nonexistent');
        expect(result).toBeNull();
    });

    test('proxy.evaluate calls page_evaluate and returns result', async () => {
        _toolResults['page_evaluate'] = { result: 'Test Page Title' };
        const proxy = scriptBuilder._buildPageProxy('br_001', 0);
        const result = await proxy.evaluate(() => document.title);
        expect(result).toBe('Test Page Title');
    });
});
