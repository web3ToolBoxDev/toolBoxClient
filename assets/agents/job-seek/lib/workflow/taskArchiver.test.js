'use strict';

const taskManager = require('./taskManager');
const archiver = require('./taskArchiver');

describe('taskArchiver', () => {
    beforeEach(() => {
        taskManager.init({ persist: () => {}, savedTasks: {} });
        archiver.configure({ archiveTtlMs: 100, maxArchivedPerSession: 3 }); // short TTL for tests
    });

    afterEach(() => {
        archiver.stopScheduledScan();
    });

    function createCompletedTask(sessionId, completedAgo = 0) {
        const task = taskManager.createTask({ sessionId, config: { region: 'CA', sources: [{ name: 'indeed', enabled: true }], steps: [{ name: 'search' }] }, context: { direction: { jobTitle: 'Dev' }, profile: { basic: 'Name', skills: 'React' } }, steps: [{ name: 'search', enabled: true }] });
        taskManager.transition(task.id, 'running');
        taskManager.updateStep(task.id, 'search', 'running');
        taskManager.updateStepProgress(task.id, 'search', { searched: 10, matched: 3, seenUrls: ['u1', 'u2'], queries: ['q1'] });
        taskManager.updateStep(task.id, 'search', 'done');
        taskManager.transition(task.id, 'completed');
        // Backdate completedAt
        if (completedAgo > 0) {
            task.completedAt = new Date(Date.now() - completedAgo).toISOString();
        }
        return task;
    }

    describe('stripForArchive', () => {
        it('strips large data and keeps summary', () => {
            const task = createCompletedTask('s1');
            const stripped = archiver.stripForArchive(task);

            expect(stripped.status).toBe('archived');
            expect(stripped.id).toBe(task.id);
            expect(stripped.sessionId).toBe('s1');
            expect(stripped.stats).toBeDefined();
            expect(stripped.archivedAt).toBeTruthy();

            // Config stripped to summary
            expect(stripped.config.sources[0].name).toBe('indeed');

            // Context: profile stripped to section names
            expect(stripped.context.profileSections).toEqual(['basic', 'skills']);

            // Progress stripped: counts kept, arrays dropped
            const sp = stripped.steps[0].progress;
            expect(sp.searched).toBe(10);
            expect(sp.matched).toBe(3);
            expect(sp.seenUrlCount).toBe(2);
            expect(sp.queryCount).toBe(1);
            expect(sp.seenUrls).toBeUndefined(); // stripped
            expect(sp.queries).toBeUndefined(); // stripped
        });
    });

    describe('archiveTask', () => {
        it('archives a completed task', () => {
            const task = createCompletedTask('s1');
            const r = archiver.archiveTask(task.id);
            expect(r.success).toBe(true);
            expect(taskManager.getTask(task.id).status).toBe('archived');
        });

        it('rejects archiving a running task', () => {
            const task = taskManager.createTask({ sessionId: 's1', steps: [] });
            taskManager.transition(task.id, 'running');
            const r = archiver.archiveTask(task.id);
            expect(r.success).toBe(false);
        });
    });

    describe('scanAndArchive', () => {
        it('archives tasks past TTL', () => {
            createCompletedTask('s1', 200); // 200ms ago, TTL=100ms
            createCompletedTask('s1', 50);  // 50ms ago, within TTL

            const r = archiver.scanAndArchive();
            expect(r.archived.length).toBe(1);
        });

        it('prunes excess archived tasks per session', () => {
            // Create 5 completed tasks, all past TTL
            for (let i = 0; i < 5; i++) {
                createCompletedTask('s1', 200 + i);
            }

            const r = archiver.scanAndArchive();
            expect(r.archived.length).toBe(5); // all archived

            // Max 3 per session — 2 should be pruned
            expect(r.pruned.length).toBe(2);
            expect(taskManager.listTasks({ sessionId: 's1', status: 'archived' }).length).toBe(3);
        });
    });

    describe('listArchived / getArchiveSummary', () => {
        it('lists archived tasks for a session', () => {
            const t = createCompletedTask('s1', 200);
            archiver.archiveTask(t.id);

            expect(archiver.listArchived('s1')).toHaveLength(1);
            expect(archiver.listArchived('s2')).toHaveLength(0);
        });

        it('returns archive summary', () => {
            const t1 = createCompletedTask('s1', 200);
            const t2 = createCompletedTask('s2', 200);
            archiver.archiveTask(t1.id);
            archiver.archiveTask(t2.id);

            const summary = archiver.getArchiveSummary();
            expect(summary.total).toBe(2);
            expect(summary.sessions).toBe(2);
        });
    });

    describe('startScheduledScan / stopScheduledScan', () => {
        it('starts and stops without error', () => {
            archiver.configure({ scanIntervalMs: 100000 });
            archiver.startScheduledScan();
            archiver.stopScheduledScan();
        });
    });
});
