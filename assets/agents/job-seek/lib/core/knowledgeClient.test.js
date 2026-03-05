'use strict';

const http = require('http');
const knowledgeClient = require('./knowledgeClient');

// Mock HTTP to avoid needing a real server
let mockResponse = {};
let lastRequest = null;

jest.mock('http', () => {
    const actual = jest.requireActual('http');
    return {
        ...actual,
        request: jest.fn((url, options, callback) => {
            const mockRes = {
                on: jest.fn((event, handler) => {
                    if (event === 'data') handler(JSON.stringify(mockResponse));
                    if (event === 'end') handler();
                }),
                statusCode: 200
            };
            // Capture request body
            const mockReq = {
                on: jest.fn(),
                setTimeout: jest.fn(),
                write: jest.fn((data) => { lastRequest = JSON.parse(data); }),
                end: jest.fn(() => callback(mockRes)),
                destroy: jest.fn()
            };
            return mockReq;
        })
    };
});

beforeEach(() => {
    mockResponse = {};
    lastRequest = null;
});

describe('knowledgeClient', () => {
    describe('upsert', () => {
        it('sends document to /knowledge/upsert', async () => {
            mockResponse = { success: true, refId: 'doc_001' };
            const result = await knowledgeClient.upsert({
                type: 'profile',
                subType: 'basic',
                content: 'Name: Zhang Ying'
            });
            expect(result.success).toBe(true);
            expect(result.refId).toBe('doc_001');
            expect(lastRequest.type).toBe('profile');
            expect(lastRequest.content).toBe('Name: Zhang Ying');
        });
    });

    describe('search', () => {
        it('returns search results', async () => {
            mockResponse = {
                success: true,
                results: [
                    { doc: { refId: 'doc_001', type: 'profile', content: 'React skills' }, rank: 0 }
                ]
            };
            const results = await knowledgeClient.search('React', ['profile']);
            expect(results.length).toBe(1);
            expect(results[0].doc.content).toContain('React');
        });

        it('returns empty array on error', async () => {
            // Force error by making mock throw
            http.request.mockImplementationOnce(() => {
                throw new Error('connection refused');
            });
            const results = await knowledgeClient.search('test');
            expect(results).toEqual([]);
        });
    });

    describe('find', () => {
        it('finds by type', async () => {
            mockResponse = {
                success: true,
                results: [
                    { refId: 'doc_001', type: 'profile', subType: 'skills', content: 'React' },
                    { refId: 'doc_002', type: 'profile', subType: 'experience', content: 'ByteDance' }
                ]
            };
            const results = await knowledgeClient.find({ type: 'profile' });
            expect(results.length).toBe(2);
            expect(lastRequest.type).toBe('profile');
        });
    });

    describe('expand', () => {
        it('expands types to related documents', async () => {
            mockResponse = {
                success: true,
                results: [
                    { refId: 'doc_001', type: 'profile', content: 'Name' },
                    { refId: 'doc_002', type: 'profile', content: 'Skills' },
                    { refId: 'dir_001', type: 'direction', content: 'Frontend target' }
                ]
            };
            const results = await knowledgeClient.expand(['direction']);
            expect(results.length).toBe(3);
        });
    });

    describe('detectIntent', () => {
        it('detects profile intent from identity questions', () => {
            expect(knowledgeClient.detectIntent('who am i?')).toEqual(['profile']);
            expect(knowledgeClient.detectIntent('我是谁')).toEqual(['profile']);
        });

        it('detects profile intent from skill questions', () => {
            expect(knowledgeClient.detectIntent('what skills do I have')).toEqual(['profile']);
            expect(knowledgeClient.detectIntent('我有什么技能')).toEqual(['profile']);
        });

        it('detects resume intent', () => {
            expect(knowledgeClient.detectIntent('generate a resume')).toEqual(['profile', 'direction']);
        });

        it('returns null for unrelated queries', () => {
            expect(knowledgeClient.detectIntent('hello')).toBeNull();
            expect(knowledgeClient.detectIntent('what time is it')).toBeNull();
        });
    });

    describe('searchAndExpand', () => {
        it('searches and expands on FTS hit', async () => {
            let callCount = 0;
            http.request.mockImplementation((url, options, callback) => {
                callCount++;
                const response = callCount === 1
                    ? { success: true, results: [{ doc: { refId: 'p1', type: 'profile', content: 'React' }, rank: 0 }] }
                    : { success: true, results: [
                        { refId: 'p1', type: 'profile', content: 'React' },
                        { refId: 'p2', type: 'profile', content: 'Name' }
                    ] };

                const mockRes = {
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler(JSON.stringify(response));
                        if (event === 'end') handler();
                    })
                };
                const mockReq = {
                    on: jest.fn(),
                    setTimeout: jest.fn(),
                    write: jest.fn((data) => { lastRequest = JSON.parse(data); }),
                    end: jest.fn(() => callback(mockRes)),
                    destroy: jest.fn()
                };
                return mockReq;
            });

            const result = await knowledgeClient.searchAndExpand('React skills');
            expect(result.source).toBe('fts');
            expect(result.docs.length).toBe(2);
        });

        it('falls back to intent detection when FTS misses', async () => {
            let callCount = 0;
            http.request.mockImplementation((url, options, callback) => {
                callCount++;
                // First call (search): empty results
                // Second call (expand via intent): return profile docs
                const response = callCount === 1
                    ? { success: true, results: [] }
                    : { success: true, results: [
                        { refId: 'p1', type: 'profile', subType: 'basic', content: 'Name: Zhang Ying' },
                        { refId: 'p2', type: 'profile', subType: 'skills', content: 'React, Vue' }
                    ] };

                const mockRes = {
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler(JSON.stringify(response));
                        if (event === 'end') handler();
                    })
                };
                const mockReq = {
                    on: jest.fn(),
                    setTimeout: jest.fn(),
                    write: jest.fn(),
                    end: jest.fn(() => callback(mockRes)),
                    destroy: jest.fn()
                };
                return mockReq;
            });

            const result = await knowledgeClient.searchAndExpand('who am i?');
            expect(result.source).toBe('intent');
            expect(result.docs.length).toBe(2);
        });

        it('returns empty when no FTS hits and no intent match', async () => {
            http.request.mockImplementation((url, options, callback) => {
                const response = { success: true, results: [] };
                const mockRes = {
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler(JSON.stringify(response));
                        if (event === 'end') handler();
                    })
                };
                const mockReq = {
                    on: jest.fn(),
                    setTimeout: jest.fn(),
                    write: jest.fn(),
                    end: jest.fn(() => callback(mockRes)),
                    destroy: jest.fn()
                };
                return mockReq;
            });
            const result = await knowledgeClient.searchAndExpand('hello there');
            expect(result.source).toBe('none');
            expect(result.docs.length).toBe(0);
        });
    });
});
