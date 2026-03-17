'use strict';

const { EventEmitter } = require('events');

// --- Mocks (must use `mock` prefix for out-of-scope references) ---

const mockSpawnFn = jest.fn();
jest.mock('child_process', () => ({
    spawn: (...args) => mockSpawnFn(...args)
}));

jest.mock('http', () => ({
    request: jest.fn()
}));

jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn()
}));

jest.mock('../../config', () => ({
    getInstance: () => ({
        getDefaultExecPath: () => '/usr/bin/node',
        getSavePath: () => ({ path: '/save/path' }),
        getChromePath: () => ({ path: '/chrome/path' })
    })
}));

const http = require('http');
const fs = require('fs');

// Helper: build a fake child process returned by spawn
function createMockChildProcess() {
    const cp = new EventEmitter();
    cp.stdout = new EventEmitter();
    cp.stderr = new EventEmitter();
    cp.kill = jest.fn();
    cp.pid = Math.floor(Math.random() * 10000);
    return cp;
}

// Helper: build mock Express res
function mockRes() {
    const res = {
        _status: 200,
        _json: null,
        status(code) { res._status = code; return res; },
        json(data) { res._json = data; return res; }
    };
    jest.spyOn(res, 'status');
    jest.spyOn(res, 'json');
    return res;
}

// Helper: set up http.request to return a successful response
function mockHttpSuccess(statusCode, responseBody) {
    http.request.mockImplementation((options, cb) => {
        const fakeRes = new EventEmitter();
        fakeRes.statusCode = statusCode;
        const req = {
            on: jest.fn(),
            setTimeout: jest.fn(),
            write: jest.fn(),
            end: jest.fn(),
            destroy: jest.fn()
        };
        process.nextTick(() => {
            cb(fakeRes);
            fakeRes.emit('data', typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody));
            fakeRes.emit('end');
        });
        return req;
    });
}

// Helper: set up http.request to return an error
function mockHttpError(errorMessage) {
    http.request.mockImplementation(() => {
        const req = {
            on: jest.fn((event, handler) => {
                if (event === 'error') {
                    process.nextTick(() => handler(new Error(errorMessage)));
                }
            }),
            setTimeout: jest.fn(),
            write: jest.fn(),
            end: jest.fn(),
            destroy: jest.fn()
        };
        return req;
    });
}

// We load the module fresh for each test to reset toolProcess/isStarting
let manager;
function loadManager() {
    let mod;
    jest.isolateModules(() => {
        mod = require('./toolServiceManager');
    });
    return mod;
}

// ---- Tests ----

describe('toolServiceManager', () => {
    let spawnedProcesses;

    beforeEach(() => {
        jest.clearAllMocks();
        spawnedProcesses = [];
        mockSpawnFn.mockImplementation(() => {
            const cp = createMockChildProcess();
            spawnedProcesses.push(cp);
            return cp;
        });
        manager = loadManager();
    });

    // ---- startToolService ----

    describe('startToolService', () => {
        it('spawns a child process with the correct arguments and env', () => {
            manager.startToolService();

            expect(mockSpawnFn).toHaveBeenCalledTimes(1);
            const [execPath, args, options] = mockSpawnFn.mock.calls[0];
            expect(execPath).toBe('/usr/bin/node');
            expect(args[0]).toContain('toolService');
            expect(args[0]).toContain('index.js');
            expect(options.stdio).toEqual(['ignore', 'pipe', 'pipe']);
            expect(options.windowsHide).toBe(true);
            expect(options.env.TOOL_SERVICE_PORT).toBe('30004');
            expect(options.env.TOOL_SERVICE_CHROME_PATH).toBe('/chrome/path');
            expect(options.env.TOOL_SERVICE_SAVE_PATH).toBe('/save/path');
        });

        it('does not spawn twice if already running', () => {
            manager.startToolService();
            manager.startToolService();

            expect(mockSpawnFn).toHaveBeenCalledTimes(1);
        });

        it('sets toolProcess to null on exit event, allowing restart', () => {
            manager.startToolService();
            expect(mockSpawnFn).toHaveBeenCalledTimes(1);

            // Simulate process exit
            spawnedProcesses[0].emit('exit', 0, null);

            // Now startToolService should spawn again
            manager.startToolService();
            expect(mockSpawnFn).toHaveBeenCalledTimes(2);
        });

        it('sets toolProcess to null on error event, allowing restart', () => {
            const errSpy = jest.spyOn(console, 'error').mockImplementation();

            manager.startToolService();
            expect(mockSpawnFn).toHaveBeenCalledTimes(1);

            spawnedProcesses[0].emit('error', new Error('spawn failed'));

            manager.startToolService();
            expect(mockSpawnFn).toHaveBeenCalledTimes(2);

            errSpy.mockRestore();
        });

        it('reads chromePath from savePath.json fallback when config returns empty', () => {
            jest.isolateModules(() => {
                jest.doMock('../../config', () => ({
                    getInstance: () => ({
                        getDefaultExecPath: () => 'node',
                        getSavePath: () => ({ path: '' }),
                        getChromePath: () => ({ path: '' })
                    })
                }));
                const fsMod = require('fs');
                fsMod.existsSync.mockReturnValue(true);
                fsMod.readFileSync.mockReturnValue(JSON.stringify({
                    chromePath: '/fallback/chrome',
                    path: '/fallback/save'
                }));

                const freshManager = require('./toolServiceManager');
                freshManager.startToolService();

                const lastCall = mockSpawnFn.mock.calls[mockSpawnFn.mock.calls.length - 1];
                const envUsed = lastCall[2].env;
                expect(envUsed.TOOL_SERVICE_CHROME_PATH).toBe('/fallback/chrome');
                expect(envUsed.TOOL_SERVICE_SAVE_PATH).toBe('/fallback/save');
            });
        });

        it('handles config methods throwing gracefully', () => {
            jest.isolateModules(() => {
                jest.doMock('../../config', () => ({
                    getInstance: () => ({
                        getDefaultExecPath: () => 'node',
                        getSavePath: () => { throw new Error('no save path'); },
                        getChromePath: () => { throw new Error('no chrome path'); }
                    })
                }));
                const fsMod = require('fs');
                fsMod.existsSync.mockReturnValue(false);

                const freshManager = require('./toolServiceManager');
                // Should not throw
                expect(() => freshManager.startToolService()).not.toThrow();
                expect(mockSpawnFn).toHaveBeenCalled();

                const envUsed = mockSpawnFn.mock.calls[mockSpawnFn.mock.calls.length - 1][2].env;
                expect(envUsed.TOOL_SERVICE_CHROME_PATH).toBe('');
                expect(envUsed.TOOL_SERVICE_SAVE_PATH).toBe('');
            });
        });

        it('handles stdout and stderr data without throwing', () => {
            const logSpy = jest.spyOn(console, 'log').mockImplementation();
            const errSpy = jest.spyOn(console, 'error').mockImplementation();

            manager.startToolService();
            const cp = spawnedProcesses[0];
            cp.stdout.emit('data', Buffer.from('ready'));
            cp.stderr.emit('data', Buffer.from('warning'));

            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ready'));
            expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('warning'));
            logSpy.mockRestore();
            errSpy.mockRestore();
        });
    });

    // ---- stopToolService ----

    describe('stopToolService', () => {
        it('kills the process with SIGTERM', () => {
            manager.startToolService();
            const cp = spawnedProcesses[0];

            manager.stopToolService();

            expect(cp.kill).toHaveBeenCalledWith('SIGTERM');
        });

        it('does nothing if no process is running', () => {
            expect(() => manager.stopToolService()).not.toThrow();
        });

        it('allows starting again after stop', () => {
            manager.startToolService();
            manager.stopToolService();
            manager.startToolService();

            expect(mockSpawnFn).toHaveBeenCalledTimes(2);
        });
    });

    // ---- restartToolService ----

    describe('restartToolService', () => {
        it('stops, waits, starts, then polls health and returns success', async () => {
            manager.startToolService();

            mockHttpSuccess(200, { status: 'ok' });

            const result = await manager.restartToolService();
            expect(result).toEqual({ success: true });
            // Should have spawned twice (initial + restart)
            expect(mockSpawnFn).toHaveBeenCalledTimes(2);
            // First process should have been killed
            expect(spawnedProcesses[0].kill).toHaveBeenCalledWith('SIGTERM');
        }, 30000);

        it('returns failure if health never responds 200', async () => {
            manager.startToolService();

            mockHttpError('ECONNREFUSED');

            const result = await manager.restartToolService();
            expect(result).toEqual({
                success: false,
                error: 'toolService did not become healthy after restart'
            });
        }, 30000);
    });

    // ---- proxyToToolService (tested via handlers) ----

    describe('proxyToToolService', () => {
        it('resolves with statusCode and parsed JSON data on success', async () => {
            mockHttpSuccess(200, { tools: ['a', 'b'] });

            const res = mockRes();
            await manager.handleListTools({}, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ tools: ['a', 'b'] });
        });

        it('resolves with raw string when response is not valid JSON', async () => {
            http.request.mockImplementation((options, cb) => {
                const fakeRes = new EventEmitter();
                fakeRes.statusCode = 200;
                const req = {
                    on: jest.fn(),
                    setTimeout: jest.fn(),
                    write: jest.fn(),
                    end: jest.fn(),
                    destroy: jest.fn()
                };
                process.nextTick(() => {
                    cb(fakeRes);
                    fakeRes.emit('data', 'not-json');
                    fakeRes.emit('end');
                });
                return req;
            });

            const res = mockRes();
            await manager.handleHealth({}, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith('not-json');
        });

        it('rejects on request error', async () => {
            mockHttpError('ECONNREFUSED');

            const res = mockRes();
            await manager.handleHealth({}, res);

            expect(res.status).toHaveBeenCalledWith(503);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: 'Tool service unavailable'
            }));
        });

        it('writes body when provided (POST requests)', async () => {
            let capturedOptions;
            let capturedReq;
            http.request.mockImplementation((options, cb) => {
                capturedOptions = options;
                const fakeRes = new EventEmitter();
                fakeRes.statusCode = 200;
                capturedReq = {
                    on: jest.fn(),
                    setTimeout: jest.fn(),
                    write: jest.fn(),
                    end: jest.fn(),
                    destroy: jest.fn()
                };
                process.nextTick(() => {
                    cb(fakeRes);
                    fakeRes.emit('data', JSON.stringify({ ok: true }));
                    fakeRes.emit('end');
                });
                return capturedReq;
            });

            const body = { name: 'myTool', script: 'echo hello' };
            const res = mockRes();
            await manager.handleRegisterTool({ body }, res);

            expect(capturedOptions.method).toBe('POST');
            expect(capturedOptions.path).toBe('/tools/register');
            expect(capturedReq.write).toHaveBeenCalledWith(JSON.stringify(body));
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('sets a 120s timeout on the request', async () => {
            let capturedReq;
            http.request.mockImplementation((options, cb) => {
                const fakeRes = new EventEmitter();
                fakeRes.statusCode = 200;
                capturedReq = {
                    on: jest.fn(),
                    setTimeout: jest.fn(),
                    write: jest.fn(),
                    end: jest.fn(),
                    destroy: jest.fn()
                };
                process.nextTick(() => {
                    cb(fakeRes);
                    fakeRes.emit('data', JSON.stringify({ ok: true }));
                    fakeRes.emit('end');
                });
                return capturedReq;
            });

            const res = mockRes();
            await manager.handleHealth({}, res);

            expect(capturedReq.setTimeout).toHaveBeenCalledWith(120000, expect.any(Function));
        });

        it('sends request to 127.0.0.1 on port 30004', async () => {
            let capturedOptions;
            http.request.mockImplementation((options, cb) => {
                capturedOptions = options;
                const fakeRes = new EventEmitter();
                fakeRes.statusCode = 200;
                const req = {
                    on: jest.fn(), setTimeout: jest.fn(),
                    write: jest.fn(), end: jest.fn(), destroy: jest.fn()
                };
                process.nextTick(() => {
                    cb(fakeRes);
                    fakeRes.emit('data', JSON.stringify({}));
                    fakeRes.emit('end');
                });
                return req;
            });

            const res = mockRes();
            await manager.handleHealth({}, res);

            expect(capturedOptions.hostname).toBe('127.0.0.1');
            expect(capturedOptions.port).toBe(30004);
            expect(capturedOptions.headers['Content-Type']).toBe('application/json');
        });
    });

    // ---- Express handlers ----

    describe('handleHealth', () => {
        it('proxies GET /health and returns result', async () => {
            let capturedOptions;
            http.request.mockImplementation((options, cb) => {
                capturedOptions = options;
                const fakeRes = new EventEmitter();
                fakeRes.statusCode = 200;
                const req = {
                    on: jest.fn(), setTimeout: jest.fn(),
                    write: jest.fn(), end: jest.fn(), destroy: jest.fn()
                };
                process.nextTick(() => {
                    cb(fakeRes);
                    fakeRes.emit('data', JSON.stringify({ status: 'ok' }));
                    fakeRes.emit('end');
                });
                return req;
            });

            const res = mockRes();
            await manager.handleHealth({}, res);

            expect(capturedOptions.method).toBe('GET');
            expect(capturedOptions.path).toBe('/health');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
        });

        it('returns 503 when tool service is unavailable', async () => {
            mockHttpError('connect refused');

            const res = mockRes();
            await manager.handleHealth({}, res);

            expect(res.status).toHaveBeenCalledWith(503);
            expect(res._json).toMatchObject({
                success: false,
                error: 'Tool service unavailable',
                detail: 'connect refused'
            });
        });
    });

    describe('handleListTools', () => {
        it('proxies GET /tools/list', async () => {
            mockHttpSuccess(200, { tools: ['screenshot', 'click'] });

            const res = mockRes();
            await manager.handleListTools({}, res);

            expect(res.json).toHaveBeenCalledWith({ tools: ['screenshot', 'click'] });
        });

        it('returns 503 when service is down', async () => {
            mockHttpError('ECONNREFUSED');

            const res = mockRes();
            await manager.handleListTools({}, res);

            expect(res.status).toHaveBeenCalledWith(503);
        });
    });

    describe('handleRegisterTool', () => {
        it('proxies POST /tools/register with request body', async () => {
            let capturedOptions;
            http.request.mockImplementation((options, cb) => {
                capturedOptions = options;
                const fakeRes = new EventEmitter();
                fakeRes.statusCode = 201;
                const req = {
                    on: jest.fn(), setTimeout: jest.fn(),
                    write: jest.fn(), end: jest.fn(), destroy: jest.fn()
                };
                process.nextTick(() => {
                    cb(fakeRes);
                    fakeRes.emit('data', JSON.stringify({ registered: true }));
                    fakeRes.emit('end');
                });
                return req;
            });

            const res = mockRes();
            await manager.handleRegisterTool({ body: { name: 'newTool' } }, res);

            expect(capturedOptions.method).toBe('POST');
            expect(capturedOptions.path).toBe('/tools/register');
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({ registered: true });
        });
    });

    describe('handleExecuteTool', () => {
        it('proxies POST /tools/execute with request body', async () => {
            let capturedOptions;
            http.request.mockImplementation((options, cb) => {
                capturedOptions = options;
                const fakeRes = new EventEmitter();
                fakeRes.statusCode = 200;
                const req = {
                    on: jest.fn(), setTimeout: jest.fn(),
                    write: jest.fn(), end: jest.fn(), destroy: jest.fn()
                };
                process.nextTick(() => {
                    cb(fakeRes);
                    fakeRes.emit('data', JSON.stringify({ result: 'done' }));
                    fakeRes.emit('end');
                });
                return req;
            });

            const res = mockRes();
            await manager.handleExecuteTool({ body: { tool: 'screenshot', params: {} } }, res);

            expect(capturedOptions.method).toBe('POST');
            expect(capturedOptions.path).toBe('/tools/execute');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ result: 'done' });
        });

        it('returns 503 on connection error', async () => {
            mockHttpError('timeout');

            const res = mockRes();
            await manager.handleExecuteTool({ body: { tool: 'click' } }, res);

            expect(res.status).toHaveBeenCalledWith(503);
            expect(res._json.detail).toBe('timeout');
        });
    });

    describe('handleRestart', () => {
        it('calls restartToolService and returns the result', async () => {
            manager.startToolService();
            mockHttpSuccess(200, { status: 'ok' });

            const res = mockRes();
            await manager.handleRestart({}, res);

            expect(res.json).toHaveBeenCalledWith({ success: true });
        }, 30000);

        it('returns 500 when restartToolService throws', async () => {
            manager.startToolService();
            const cp = spawnedProcesses[0];
            cp.kill.mockImplementation(() => { throw new Error('kill failed'); });

            const res = mockRes();
            await manager.handleRestart({}, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res._json).toMatchObject({
                success: false,
                error: 'kill failed'
            });
        });
    });
});
