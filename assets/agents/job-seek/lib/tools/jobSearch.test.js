'use strict';

const { TOOL_DEF, handler } = require('./jobSearch');

// Mock all source adapters
jest.mock('../sources/indeed', () => ({
    search: jest.fn().mockResolvedValue({ listings: [], method: 'http' })
}));
jest.mock('../sources/google', () => ({
    search: jest.fn().mockResolvedValue({ listings: [], method: 'http' })
}));
jest.mock('../sources/linkedin', () => ({
    search: jest.fn().mockResolvedValue({ listings: [], method: 'http' })
}));
jest.mock('../sources/jobbank', () => ({
    search: jest.fn().mockResolvedValue({ listings: [], method: 'http' })
}));

const indeed = require('../sources/indeed');
const linkedin = require('../sources/linkedin');
const jobbank = require('../sources/jobbank');
const google = require('../sources/google');

describe('job_search tool', () => {

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('job_search');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires query parameter', () => {
            expect(TOOL_DEF.parameters.required).toEqual(['query']);
        });

        test('has envId parameter for fingerprint browser', () => {
            expect(TOOL_DEF.parameters.properties.envId).toBeDefined();
        });

        test('includes linkedin and jobbank sources', () => {
            expect(TOOL_DEF.description).toContain('linkedin');
            expect(TOOL_DEF.description).toContain('jobbank');
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

            const result = await handler({ query: 'engineer', location: 'Toronto', maxResults: 5, source: 'indeed' });
            expect(indeed.search).toHaveBeenCalledWith(
                expect.objectContaining({ query: 'engineer', location: 'Toronto', maxResults: 5 })
            );
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

            const result = await handler({ query: 'dev', source: 'indeed' });
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

            const result = await handler({ query: 'qa', source: 'indeed' });
            expect(result.totalFound).toBe(1);
            expect(result.listings[0].title).toBe('Has URL');
        });

        test('respects maxResults limit', async () => {
            const many = Array.from({ length: 20 }, (_, i) => ({
                title: `Job ${i}`, company: 'C', url: `http://job${i}.com`
            }));
            indeed.search.mockResolvedValueOnce({ listings: many, method: 'http' });

            const result = await handler({ query: 'test', maxResults: 3, source: 'indeed' });
            expect(result.listings).toHaveLength(3);
        });

        test('indicates source used in result', async () => {
            indeed.search.mockResolvedValueOnce({
                listings: [{ title: 'X', company: 'Y', url: 'http://x.com' }],
                method: 'browser'
            });

            const result = await handler({ query: 'eng', source: 'indeed' });
            expect(result.source).toBe('indeed');
        });

        test('defaults location to any', async () => {
            const result = await handler({ query: 'test', source: 'indeed' });
            expect(result.location).toBe('any');
        });

        // Location-based source selection tests
        test('uses indeed first for Toronto (Canada) with source=all', async () => {
            indeed.search.mockResolvedValueOnce({
                listings: [{ title: 'Dev', company: 'A', url: 'http://a.com' }],
                method: 'http'
            });

            const result = await handler({ query: 'developer', location: 'Toronto, Canada' });
            expect(indeed.search).toHaveBeenCalled();
            expect(result.source).toBe('indeed');
        });

        test('falls back to linkedin when indeed returns empty for Canada', async () => {
            // indeed returns empty, linkedin returns results
            linkedin.search.mockResolvedValueOnce({
                listings: [{ title: 'Dev', company: 'B', url: 'http://b.com' }],
                method: 'browser'
            });

            const result = await handler({ query: 'developer', location: 'Toronto, Canada' });
            expect(linkedin.search).toHaveBeenCalled();
            expect(result.source).toBe('linkedin');
        });

        test('passes envId to source adapter', async () => {
            indeed.search.mockResolvedValueOnce({
                listings: [{ title: 'Job', company: 'C', url: 'http://c.com' }],
                method: 'fingerprint-browser'
            });

            await handler({ query: 'dev', source: 'indeed', envId: 'fp-123' });
            expect(indeed.search).toHaveBeenCalledWith(
                expect.objectContaining({ envId: 'fp-123' })
            );
        });

        test('returns sourceOrder on failure', async () => {
            const result = await handler({ query: 'nothing', location: 'Toronto, Canada' });
            expect(result.sourceOrder).toBeDefined();
            expect(result.sourceOrder).toContain('indeed');
            expect(result.sourceOrder).toContain('linkedin');
            expect(result.sourceOrder).toContain('jobbank');
        });

        test('shows fallback notation when primary fails', async () => {
            // indeed fails, linkedin succeeds
            indeed.search.mockResolvedValueOnce({ listings: [], method: 'http' });
            linkedin.search.mockResolvedValueOnce({
                listings: [{ title: 'Job', company: 'X', url: 'http://x.com' }],
                method: 'http'
            });

            const result = await handler({ query: 'dev', source: 'indeed' });
            expect(result.source).toBe('indeed→linkedin');
        });
    });
});
