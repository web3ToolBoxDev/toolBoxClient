'use strict';

const { TOOL_DEF, handler, diffListings, checkJob, getChanges, clearChanges } = require('./jdTracker');

jest.mock('../core/knowledgeClient', () => ({
    find: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({ success: true })
}));

jest.mock('../core/toolServiceClient', () => ({
    executeTool: jest.fn().mockResolvedValue({ success: false })
}));

const knowledgeClient = require('../core/knowledgeClient');
const toolServiceClient = require('../core/toolServiceClient');

describe('jd_tracker tool', () => {
    beforeEach(() => {
        clearChanges();
        jest.clearAllMocks();
    });

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('jd_tracker');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires action', () => {
            expect(TOOL_DEF.parameters.required).toContain('action');
        });
    });

    describe('diffListings', () => {
        test('returns empty array for identical listings', () => {
            const a = { title: 'Dev', company: 'Acme', salary: '100k' };
            expect(diffListings(a, a)).toHaveLength(0);
        });

        test('detects title change', () => {
            const a = { title: 'Dev' };
            const b = { title: 'Senior Dev' };
            const diffs = diffListings(a, b);
            expect(diffs).toHaveLength(1);
            expect(diffs[0].field).toBe('title');
            expect(diffs[0].old).toBe('Dev');
            expect(diffs[0].new).toBe('Senior Dev');
        });

        test('detects multiple changes', () => {
            const a = { title: 'Dev', salary: '100k', location: 'NYC' };
            const b = { title: 'Dev', salary: '120k', location: 'LA' };
            const diffs = diffListings(a, b);
            expect(diffs).toHaveLength(2);
        });

        test('handles missing fields gracefully', () => {
            const a = {};
            const b = { salary: '100k' };
            const diffs = diffListings(a, b);
            expect(diffs).toHaveLength(1);
            expect(diffs[0].field).toBe('salary');
        });
    });

    describe('checkJob', () => {
        test('returns not_tracked when job not in store', async () => {
            knowledgeClient.find.mockResolvedValue([]);
            const result = await checkJob('https://example.com/job/1');
            expect(result.status).toBe('not_tracked');
        });

        test('returns possibly_removed when fetch fails', async () => {
            knowledgeClient.find.mockResolvedValue([
                { content: { url: 'https://example.com/job/2', title: 'Dev' } }
            ]);
            toolServiceClient.executeTool.mockResolvedValue({ success: false });

            const result = await checkJob('https://example.com/job/2');
            expect(result.status).toBe('possibly_removed');
        });

        test('returns unchanged when no diffs', async () => {
            knowledgeClient.find.mockResolvedValue([
                { content: { url: 'https://example.com/job/3', title: 'Dev' } }
            ]);
            toolServiceClient.executeTool.mockResolvedValue({
                success: true,
                result: { title: 'Dev' }
            });

            const result = await checkJob('https://example.com/job/3');
            expect(result.status).toBe('unchanged');
        });

        test('detects and records changes', async () => {
            knowledgeClient.find.mockResolvedValue([
                { refId: 'j1', content: { url: 'https://example.com/job/4', title: 'Dev', salary: '100k' }, tags: [] }
            ]);
            toolServiceClient.executeTool.mockResolvedValue({
                success: true,
                result: { title: 'Dev', salary: '120k' }
            });

            const result = await checkJob('https://example.com/job/4');
            expect(result.status).toBe('updated');
            expect(result.changes).toHaveLength(1);
            expect(result.changes[0].field).toBe('salary');
        });
    });

    describe('getChanges', () => {
        test('returns empty array initially', () => {
            expect(getChanges()).toHaveLength(0);
        });

        test('returns changes for specific URL', async () => {
            knowledgeClient.find.mockResolvedValue([
                { content: { url: 'https://example.com/j5', title: 'Dev' } }
            ]);
            toolServiceClient.executeTool.mockResolvedValue({ success: false });
            await checkJob('https://example.com/j5');

            const changes = getChanges('https://example.com/j5');
            expect(changes).toHaveLength(1);
            expect(changes[0].type).toBe('possibly_removed');
        });
    });

    describe('handler', () => {
        test('track action calls checkJob', async () => {
            knowledgeClient.find.mockResolvedValue([]);
            const result = await handler({ action: 'track', jobUrl: 'https://x.com' });
            expect(result.status).toBe('not_tracked');
        });

        test('list_changes action', async () => {
            const result = await handler({ action: 'list_changes' });
            expect(result.changes).toBeDefined();
        });

        test('throws without jobUrl for track', async () => {
            await expect(handler({ action: 'track' })).rejects.toThrow('jobUrl is required');
        });

        test('throws on unknown action', async () => {
            await expect(handler({ action: 'bad' })).rejects.toThrow('Unknown action');
        });
    });
});
