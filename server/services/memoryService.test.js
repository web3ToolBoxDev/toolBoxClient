'use strict';

const memoryService = require('./memoryService');

jest.mock('http', () => {
    const actual = jest.requireActual('http');
    return {
        ...actual,
        request: jest.fn()
    };
});

const http = require('http');

describe('memoryService', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    function mockHttpResponse(statusCode, body) {
        const mockReq = {
            on: jest.fn(),
            setTimeout: jest.fn(),
            write: jest.fn(),
            end: jest.fn(),
            destroy: jest.fn()
        };
        http.request.mockImplementation((options, callback) => {
            const mockRes = {
                statusCode,
                on: jest.fn((event, handler) => {
                    if (event === 'data') handler(JSON.stringify(body));
                    if (event === 'end') handler();
                })
            };
            callback(mockRes);
            return mockReq;
        });
        return mockReq;
    }

    test('handleHealth proxies to dbservice', async () => {
        mockHttpResponse(200, { success: true, status: 'ready' });

        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await memoryService.handleHealth({}, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ success: true, status: 'ready' });
    });

    test('handleStore proxies POST to dbservice', async () => {
        const mockReq = mockHttpResponse(200, { success: true, result: { results: [] } });

        const req = { body: { namespace: 'test:s1', text: 'hello', role: 'user' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await memoryService.handleStore(req, res);
        expect(mockReq.write).toHaveBeenCalledWith(JSON.stringify(req.body));
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('handleSearch proxies POST to dbservice', async () => {
        mockHttpResponse(200, { success: true, results: { results: [{ memory: 'test' }] } });

        const req = { body: { namespace: 'test:s1', query: 'hello', topK: 3 } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await memoryService.handleSearch(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('handleClear proxies DELETE to dbservice', async () => {
        mockHttpResponse(200, { success: true });

        const req = { body: { namespace: 'test:s1' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await memoryService.handleClear(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    test('returns 503 when dbservice is unavailable', async () => {
        const mockReq = {
            on: jest.fn((event, handler) => {
                if (event === 'error') handler(new Error('ECONNREFUSED'));
            }),
            setTimeout: jest.fn(),
            write: jest.fn(),
            end: jest.fn(),
            destroy: jest.fn()
        };
        http.request.mockImplementation(() => mockReq);

        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await memoryService.handleHealth({}, res);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false, error: 'Memory service unavailable' })
        );
    });
});
