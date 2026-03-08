'use strict';

const { TOOL_DEF, handler } = require('./jobSearch');

// Mock the indeed adapter
jest.mock('../sources/indeed', () => ({
    search: jest.fn()
}));
const indeed = require('../sources/indeed');

describe('job_search tool', () => {

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('job_search');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires query parameter', () => {
            expect(TOOL_DEF.parameters.required).toEqual(['query']);
        });

        test('has description', () => {
            expect(TOOL_DEF.description).toBeTruthy();
        });
    });

    describe('handler', () => {
        afterEach(() => jest.clearAllMocks());

        test('throws when query is missing', async () => {
            await expect(handler({})).rejects.toThrow('query is required');
        });

        test('calls indeed.search with correct params', async () => {
            indeed.search.mockResolvedValueOnce({
                listings: [
                    { title: 'Engineer', company: 'A', url: 'http://a.com', location: 'TO' }
                ],
                method: 'http'
            });

            const result = await handler({ query: 'engineer', location: 'Toronto', maxResults: 5 });
            expect(indeed.search).toHaveBeenCalledWith({
                query: 'engineer',
                location: 'Toronto',
                maxResults: 5
            });
            expect(result.query).toBe('engineer');
            expect(result.location).toBe('Toronto');
            expect(result.totalFound).toBe(1);
            expect(result.listings).toHaveLength(1);
        });

        test('deduplicates by URL', async () => {
            indeed.search.mockResolvedValueOnce({
                listings: [
                    { title: 'Job A', company: 'X', url: 'http://same.com' },
                    { title: 'Job B', company: 'Y', url: 'http://same.com' },
                    { title: 'Job C', company: 'Z', url: 'http://other.com' }
                ],
                method: 'http'
            });

            const result = await handler({ query: 'dev' });
            expect(result.totalFound).toBe(2);
            expect(result.listings[0].title).toBe('Job A');
            expect(result.listings[1].title).toBe('Job C');
        });

        test('filters out listings without URL', async () => {
            indeed.search.mockResolvedValueOnce({
                listings: [
                    { title: 'No URL', company: 'X', url: '' },
                    { title: 'Has URL', company: 'Y', url: 'http://y.com' }
                ],
                method: 'http'
            });

            const result = await handler({ query: 'qa' });
            expect(result.totalFound).toBe(1);
            expect(result.listings[0].title).toBe('Has URL');
        });

        test('respects maxResults limit', async () => {
            const many = Array.from({ length: 20 }, (_, i) => ({
                title: `Job ${i}`, company: 'C', url: `http://job${i}.com`
            }));
            indeed.search.mockResolvedValueOnce({ listings: many, method: 'http' });

            const result = await handler({ query: 'test', maxResults: 3 });
            expect(result.listings).toHaveLength(3);
        });

        test('indicates browser method in source', async () => {
            indeed.search.mockResolvedValueOnce({
                listings: [{ title: 'X', company: 'Y', url: 'http://x.com' }],
                method: 'browser'
            });

            const result = await handler({ query: 'eng' });
            expect(result.source).toContain('browser');
        });

        test('defaults location to any', async () => {
            indeed.search.mockResolvedValueOnce({
                listings: [],
                method: 'http'
            });

            const result = await handler({ query: 'test' });
            expect(result.location).toBe('any');
        });
    });
});
