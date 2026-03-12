'use strict';

const http = require('http');
const { EventEmitter } = require('events');

jest.mock('http');

const { store, search, clear } = require('./memoryClient');

function mockHttpRequest(statusCode, responseBody) {
    const mockReq = {
        on: jest.fn(),
        setTimeout: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn(),
    };
    http.request.mockImplementation((url, opts, cb) => {
        const mockRes = new EventEmitter();
        mockRes.statusCode = statusCode;
        process.nextTick(() => {
            cb(mockRes);
            mockRes.emit('data', JSON.stringify(responseBody));
            mockRes.emit('end');
        });
        return mockReq;
    });
    return mockReq;
}

function mockHttpError(errorMessage) {
    const mockReq = {
        on: jest.fn(),
        setTimeout: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn(),
    };
    http.request.mockImplementation((url, opts, cb) => {
        process.nextTick(() => {
            const errorHandler = mockReq.on.mock.calls.find(c => c[0] === 'error');
            if (errorHandler) errorHandler[1](new Error(errorMessage));
        });
        return mockReq;
    });
    return mockReq;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
});

describe('store', () => {
    test('sends correct POST body to /memory/store', async () => {
        const mockReq = mockHttpRequest(200, { success: true });

        const result = await store('test-ns', 'hello world', { role: 'assistant', metadata: { key: 'val' } });

        expect(result).toEqual({ success: true });
        expect(http.request).toHaveBeenCalledTimes(1);

        const [url, opts] = http.request.mock.calls[0];
        expect(url).toBe('http://127.0.0.1:30002/memory/store');
        expect(opts.method).toBe('POST');
        expect(opts.headers['Content-Type']).toBe('application/json');

        const writtenBody = JSON.parse(mockReq.write.mock.calls[0][0]);
        expect(writtenBody).toEqual({
            namespace: 'test-ns',
            text: 'hello world',
            role: 'assistant',
            metadata: { key: 'val' },
            llmConfig: undefined,
        });
    });

    test('returns {success: false} on network error', async () => {
        mockHttpError('ECONNREFUSED');

        const result = await store('test-ns', 'hello');

        expect(result).toEqual({ success: false, error: 'ECONNREFUSED' });
    });
});

describe('search', () => {
    test('filters results by MIN_SCORE (0.15) and MIN_LENGTH (10)', async () => {
        mockHttpRequest(200, {
            results: {
                results: [
                    { score: 0.5, memory: 'This is a valid memory result' },
                    { score: 0.1, memory: 'Below score threshold text' },
                    { score: 0.3, memory: 'short' },
                    { score: 0.8, memory: 'Another valid memory text here' },
                ],
            },
        });

        const result = await search('test-ns', 'query');

        expect(result).toEqual([
            'This is a valid memory result',
            'Another valid memory text here',
        ]);
    });

    test('deduplicates identical texts', async () => {
        mockHttpRequest(200, {
            results: {
                results: [
                    { score: 0.5, memory: 'Duplicate memory text here' },
                    { score: 0.6, memory: 'Duplicate memory text here' },
                    { score: 0.4, memory: 'Unique memory text here' },
                ],
            },
        });

        const result = await search('test-ns', 'query');

        expect(result).toEqual([
            'Duplicate memory text here',
            'Unique memory text here',
        ]);
    });

    test('returns empty array on error', async () => {
        mockHttpError('ECONNREFUSED');

        const result = await search('test-ns', 'query');

        expect(result).toEqual([]);
    });
});

describe('clear', () => {
    test('sends correct POST body to /memory/clear', async () => {
        const mockReq = mockHttpRequest(200, { success: true });

        const result = await clear('test-ns');

        expect(result).toEqual({ success: true });
        expect(http.request).toHaveBeenCalledTimes(1);

        const [url, opts] = http.request.mock.calls[0];
        expect(url).toBe('http://127.0.0.1:30002/memory/clear');
        expect(opts.method).toBe('POST');

        const writtenBody = JSON.parse(mockReq.write.mock.calls[0][0]);
        expect(writtenBody).toEqual({ namespace: 'test-ns' });
    });
});
