'use strict';

const { TOOL_DEF, handler, createSchedule, runSchedule, listSchedules, removeSchedule, clearAll } = require('./scheduledSearch');

// Mock dependencies
jest.mock('../core/knowledgeClient', () => ({
    find: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({ success: true })
}));

jest.mock('./jobSearch', () => ({
    handler: jest.fn().mockResolvedValue({
        query: 'test',
        totalFound: 2,
        listings: [
            { url: 'https://job.com/1', title: 'Dev A', company: 'Co1', location: 'NYC' },
            { url: 'https://job.com/2', title: 'Dev B', company: 'Co2', location: 'LA' }
        ]
    })
}));

const knowledgeClient = require('../core/knowledgeClient');
const { handler: jobSearchHandler } = require('./jobSearch');

describe('scheduled_search tool', () => {
    beforeEach(() => {
        clearAll();
        jest.clearAllMocks();
    });

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('scheduled_search');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires action', () => {
            expect(TOOL_DEF.parameters.required).toContain('action');
        });
    });

    describe('createSchedule', () => {
        test('creates a schedule with defaults', () => {
            const sched = createSchedule({ query: 'frontend developer' });
            expect(sched.id).toBeDefined();
            expect(sched.query).toBe('frontend developer');
            expect(sched.intervalMs).toBe(86400000);
            expect(sched.active).toBe(true);
            expect(sched.runCount).toBe(0);
        });

        test('accepts custom schedule ID', () => {
            const sched = createSchedule({ scheduleId: 'my-sched', query: 'dev' });
            expect(sched.id).toBe('my-sched');
        });

        test('throws on duplicate ID', () => {
            createSchedule({ scheduleId: 'dup', query: 'dev' });
            expect(() => createSchedule({ scheduleId: 'dup', query: 'dev2' }))
                .toThrow('already exists');
        });

        test('throws without query', () => {
            expect(() => createSchedule({ action: 'create' })).toThrow('query is required');
        });
    });

    describe('listSchedules', () => {
        test('returns empty array initially', () => {
            expect(listSchedules()).toHaveLength(0);
        });

        test('returns all created schedules', () => {
            createSchedule({ scheduleId: 'a', query: 'dev' });
            createSchedule({ scheduleId: 'b', query: 'qa' });
            expect(listSchedules()).toHaveLength(2);
        });
    });

    describe('removeSchedule', () => {
        test('removes existing schedule', () => {
            createSchedule({ scheduleId: 'rm', query: 'dev' });
            expect(removeSchedule('rm')).toBe(true);
            expect(listSchedules()).toHaveLength(0);
        });

        test('returns false for nonexistent', () => {
            expect(removeSchedule('nope')).toBe(false);
        });
    });

    describe('runSchedule', () => {
        test('runs search and stores new listings', async () => {
            createSchedule({ scheduleId: 'run1', query: 'dev', scope: 'user:global' });
            const result = await runSchedule('run1');
            expect(result.newListings).toBe(2);
            expect(result.duplicates).toBe(0);
            expect(knowledgeClient.upsert).toHaveBeenCalledTimes(2);
            expect(jobSearchHandler).toHaveBeenCalled();
        });

        test('deduplicates against existing listings', async () => {
            knowledgeClient.find.mockResolvedValueOnce([
                { content: { url: 'https://job.com/1' } }
            ]);
            createSchedule({ scheduleId: 'run2', query: 'dev' });
            const result = await runSchedule('run2');
            expect(result.newListings).toBe(1);
            expect(result.duplicates).toBe(1);
        });

        test('updates schedule stats after run', async () => {
            createSchedule({ scheduleId: 'run3', query: 'dev' });
            await runSchedule('run3');
            const sched = listSchedules().find(s => s.id === 'run3');
            expect(sched.runCount).toBe(1);
            expect(sched.lastRunAt).toBeDefined();
            expect(sched.totalNewListings).toBe(2);
        });

        test('throws for nonexistent schedule', async () => {
            await expect(runSchedule('nope')).rejects.toThrow('not found');
        });
    });

    describe('handler', () => {
        test('create action', async () => {
            const result = await handler({ action: 'create', query: 'dev' });
            expect(result.id).toBeDefined();
            expect(result.query).toBe('dev');
        });

        test('list action', async () => {
            createSchedule({ query: 'dev' });
            const result = await handler({ action: 'list' });
            expect(result.schedules).toHaveLength(1);
        });

        test('run action', async () => {
            createSchedule({ scheduleId: 'h-run', query: 'dev' });
            const result = await handler({ action: 'run', scheduleId: 'h-run' });
            expect(result.newListings).toBeDefined();
        });

        test('remove action', async () => {
            createSchedule({ scheduleId: 'h-rm', query: 'dev' });
            const result = await handler({ action: 'remove', scheduleId: 'h-rm' });
            expect(result.removed).toBe(true);
        });

        test('throws on unknown action', async () => {
            await expect(handler({ action: 'unknown' })).rejects.toThrow('Unknown action');
        });
    });
});
