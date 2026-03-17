// proxyService.test.js — unit tests for proxy start/stop/check flows

const mockCreateServer = jest.fn();
const mockStop = jest.fn();

jest.mock('../proxy/index', () => ({
    createServer: mockCreateServer,
    stop: mockStop
}));

const mockAxiosGet = jest.fn();
jest.mock('axios', () => ({
    get: mockAxiosGet
}));

const mockHttpProxyAgent = jest.fn();
jest.mock('http-proxy-agent', () => ({
    HttpProxyAgent: mockHttpProxyAgent
}));

// Use real Mutex for correct async behavior
// (async-mutex is lightweight and deterministic)

const { startProxy, stopProxy, checkAndStartProxy, checkProxy } = require('./proxyService');

describe('proxyService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockHttpProxyAgent.mockImplementation((url) => ({ url }));
    });

    // ====== startProxy ======

    describe('startProxy', () => {
        it('returns proxy URL on success', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');

            const url = await startProxy('task-1', 'http', '1.2.3.4', '8080', 'user', 'pass');

            expect(url).toBe('http://127.0.0.1:30001');
            expect(mockCreateServer).toHaveBeenCalledWith('task-1', 'http', '1.2.3.4', '8080', 'user', 'pass');
        });

        it('returns empty string when ipHost is missing', async () => {
            const url = await startProxy('task-2', 'http', '', '8080', 'user', 'pass');
            expect(url).toBe('');
            expect(mockCreateServer).not.toHaveBeenCalled();
        });

        it('returns empty string when ipPort is missing', async () => {
            const url = await startProxy('task-3', 'http', '1.2.3.4', '', 'user', 'pass');
            expect(url).toBe('');
            expect(mockCreateServer).not.toHaveBeenCalled();
        });

        it('returns empty string when both ipHost and ipPort are null', async () => {
            const url = await startProxy('task-4', 'http', null, null, null, null);
            expect(url).toBe('');
            expect(mockCreateServer).not.toHaveBeenCalled();
        });

        it('returns empty string when ipHost is undefined', async () => {
            const url = await startProxy('task-5', 'http', undefined, '8080', '', '');
            expect(url).toBe('');
            expect(mockCreateServer).not.toHaveBeenCalled();
        });
    });

    // ====== stopProxy ======

    describe('stopProxy', () => {
        it('calls proxyManager.stop with taskId', async () => {
            await stopProxy('task-1');
            expect(mockStop).toHaveBeenCalledWith('task-1');
        });

        it('can be called multiple times', async () => {
            await stopProxy('task-1');
            await stopProxy('task-1');
            expect(mockStop).toHaveBeenCalledTimes(2);
        });
    });

    // ====== checkAndStartProxy ======

    describe('checkAndStartProxy', () => {
        it('returns code 4001 when ipHost is missing', async () => {
            const result = await checkAndStartProxy('task-1', 'http', '', '8080', '', '');
            expect(result.success).toBe(false);
            expect(result.code).toBe(4001);
        });

        it('returns code 4001 when ipPort is missing', async () => {
            const result = await checkAndStartProxy('task-1', 'http', '1.2.3.4', '', '', '');
            expect(result.success).toBe(false);
            expect(result.code).toBe(4001);
        });

        it('returns code 4002 when createServer returns empty URL', async () => {
            mockCreateServer.mockResolvedValue('');

            const result = await checkAndStartProxy('task-1', 'http', '1.2.3.4', '8080', '', '');
            expect(result.success).toBe(false);
            expect(result.code).toBe(4002);
        });

        it('returns code 4003 when HttpProxyAgent constructor throws', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');
            mockHttpProxyAgent.mockImplementation(() => { throw new Error('bad url'); });

            const result = await checkAndStartProxy('task-1', 'http', '1.2.3.4', '8080', '', '');
            expect(result.success).toBe(false);
            expect(result.code).toBe(4003);
            expect(result.message).toContain('bad url');
        });

        it('returns success with ipinfo.io response format (res.data.ip)', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');
            mockAxiosGet.mockResolvedValue({
                status: 200,
                data: {
                    ip: '5.6.7.8',
                    loc: '43.65,-79.38',
                    country: 'CA',
                    timezone: 'America/Toronto'
                }
            });

            const result = await checkAndStartProxy('task-1', 'http', '1.2.3.4', '8080', 'user', 'pass');
            expect(result.success).toBe(true);
            expect(result.data.ip).toBe('5.6.7.8');
            expect(result.data.url).toBe('http://127.0.0.1:30001');
            expect(result.data.position).toEqual({ latitude: '43.65', longitude: '-79.38' });
            expect(result.data.country).toBe('CA');
            expect(result.data.timeZone).toBe('America/Toronto');
        });

        it('returns success with ip-api.com response format (res.data.query)', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');
            mockAxiosGet.mockResolvedValue({
                status: 200,
                data: {
                    query: '9.8.7.6',
                    lat: 35.68,
                    lon: 139.69,
                    countryCode: 'JP',
                    timezone: 'Asia/Tokyo'
                }
            });

            const result = await checkAndStartProxy('task-1', 'http', '1.2.3.4', '8080', '', '');
            expect(result.success).toBe(true);
            expect(result.data.ip).toBe('9.8.7.6');
            expect(result.data.position).toEqual({ latitude: 35.68, longitude: 139.69 });
            expect(result.data.country).toBe('JP');
            expect(result.data.timeZone).toBe('Asia/Tokyo');
        });

        it('returns code 4004 on non-200 HTTP status', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');
            mockAxiosGet.mockResolvedValue({
                status: 502,
                statusText: 'Bad Gateway',
                data: {}
            });

            const result = await checkAndStartProxy('task-1', 'http', '1.2.3.4', '8080', '', '');
            expect(result.success).toBe(false);
            expect(result.code).toBe(4004);
            expect(mockStop).toHaveBeenCalledWith('task-1');
        });

        it('returns code 4005 when response has no ip or query field', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');
            mockAxiosGet.mockResolvedValue({
                status: 200,
                data: { something: 'else' }
            });

            const result = await checkAndStartProxy('task-1', 'http', '1.2.3.4', '8080', '', '');
            expect(result.success).toBe(false);
            expect(result.code).toBe(4005);
            expect(mockStop).toHaveBeenCalledWith('task-1');
        });

        it('retries up to 3 times on network error then returns code 4006', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');
            mockAxiosGet.mockRejectedValue(new Error('ECONNREFUSED'));

            const result = await checkAndStartProxy('task-1', 'http', '1.2.3.4', '8080', '', '');
            expect(result.success).toBe(false);
            expect(result.code).toBe(4006);
            expect(result.message).toBe('ECONNREFUSED');
            // axios.get called twice per attempt (Promise.race), 3 attempts = 6 calls
            expect(mockAxiosGet.mock.calls.length).toBe(6);
            expect(mockStop).toHaveBeenCalledWith('task-1');
        }, 15000);

        it('succeeds on second retry after first failure', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');
            let callCount = 0;
            mockAxiosGet.mockImplementation(() => {
                callCount++;
                // First 2 calls (attempt 1) fail, next calls succeed
                if (callCount <= 2) {
                    return Promise.reject(new Error('timeout'));
                }
                return Promise.resolve({
                    status: 200,
                    data: { ip: '1.1.1.1', loc: '0,0', country: 'US', timezone: 'UTC' }
                });
            });

            const result = await checkAndStartProxy('task-1', 'http', '1.2.3.4', '8080', '', '');
            expect(result.success).toBe(true);
            expect(result.data.ip).toBe('1.1.1.1');
        }, 15000);
    });

    // ====== checkProxy ======

    describe('checkProxy', () => {
        it('returns code 4002 when createServer returns empty URL', async () => {
            mockCreateServer.mockResolvedValue('');

            const result = await checkProxy('http', '1.2.3.4', '8080', '', '');
            expect(result.success).toBe(false);
            expect(result.code).toBe(4002);
            expect(mockStop).toHaveBeenCalledWith('check');
        });

        it('returns code 4003 when HttpProxyAgent constructor throws', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');
            mockHttpProxyAgent.mockImplementation(() => { throw new Error('invalid'); });

            const result = await checkProxy('http', '1.2.3.4', '8080', '', '');
            expect(result.success).toBe(false);
            expect(result.code).toBe(4003);
            expect(mockStop).toHaveBeenCalledWith('check');
        });

        it('returns success and stops proxy after check (ipinfo format)', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');
            mockAxiosGet.mockResolvedValue({
                status: 200,
                data: {
                    ip: '10.20.30.40',
                    loc: '51.50,-0.12',
                    country: 'GB',
                    timezone: 'Europe/London'
                }
            });

            const result = await checkProxy('http', '1.2.3.4', '8080', 'user', 'pass');
            expect(result.success).toBe(true);
            expect(result.data.ip).toBe('10.20.30.40');
            expect(result.data.position).toEqual({ latitude: '51.50', longitude: '-0.12' });
            expect(result.data.country).toBe('GB');
            expect(result.data.timeZone).toBe('Europe/London');
            // checkProxy should NOT return a url field (unlike checkAndStartProxy)
            expect(result.data.url).toBeUndefined();
            // Should stop proxy after successful check
            expect(mockStop).toHaveBeenCalledWith('check');
        });

        it('returns success with ip-api format (query field)', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');
            mockAxiosGet.mockResolvedValue({
                status: 200,
                data: {
                    query: '99.88.77.66',
                    lat: 48.85,
                    lon: 2.35,
                    countryCode: 'FR',
                    timezone: 'Europe/Paris'
                }
            });

            const result = await checkProxy('http', '1.2.3.4', '8080', '', '');
            expect(result.success).toBe(true);
            expect(result.data.ip).toBe('99.88.77.66');
            expect(result.data.country).toBe('FR');
        });

        it('returns code 4004 on non-200 status', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');
            mockAxiosGet.mockResolvedValue({
                status: 403,
                statusText: 'Forbidden',
                data: {}
            });

            const result = await checkProxy('http', '1.2.3.4', '8080', '', '');
            expect(result.success).toBe(false);
            expect(result.code).toBe(4004);
            expect(mockStop).toHaveBeenCalledWith('check');
        });

        it('returns code 4005 when response has no ip/query', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');
            mockAxiosGet.mockResolvedValue({
                status: 200,
                data: { status: 'fail' }
            });

            const result = await checkProxy('http', '1.2.3.4', '8080', '', '');
            expect(result.success).toBe(false);
            expect(result.code).toBe(4005);
            expect(mockStop).toHaveBeenCalledWith('check');
        });

        it('retries 3 times then returns code 4006 on persistent error', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');
            mockAxiosGet.mockRejectedValue(new Error('connection refused'));

            const result = await checkProxy('http', '1.2.3.4', '8080', '', '');
            expect(result.success).toBe(false);
            expect(result.code).toBe(4006);
            expect(result.message).toBe('connection refused');
            expect(mockStop).toHaveBeenCalledWith('check');
        }, 15000);

        it('uses taskId "check" for createServer', async () => {
            mockCreateServer.mockResolvedValue('http://127.0.0.1:30001');
            mockAxiosGet.mockResolvedValue({
                status: 200,
                data: { ip: '1.1.1.1', loc: '0,0', country: 'US', timezone: 'UTC' }
            });

            await checkProxy('socks5', '10.0.0.1', '1080', 'admin', 'secret');
            expect(mockCreateServer).toHaveBeenCalledWith('check', 'socks5', '10.0.0.1', '1080', 'admin', 'secret');
        });

        it('returns empty string from startProxy when host is missing (via internal call)', async () => {
            const result = await checkProxy('http', '', '8080', '', '');
            expect(result.success).toBe(false);
            expect(result.code).toBe(4002);
        });
    });
});
