'use strict';

const taskManager = require('./taskManager');

describe('taskManager', () => {
    let persistedData = null;
    const notifications = [];

    beforeEach(() => {
        persistedData = null;
        notifications.length = 0;
        taskManager.init({
            persist: (data) => { persistedData = JSON.parse(JSON.stringify(data)); },
            notify: (taskId, event, data) => { notifications.push({ taskId, event, data }); },
            savedTasks: {}
        });
    });

    // ─── CRUD ───

    describe('createTask', () => {
        it('creates a task with queued status', () => {
            const task = taskManager.createTask({
                sessionId: 'sess1',
                config: { region: 'CA' },
                context: { direction: { jobTitle: 'Dev' } },
                steps: [{ name: 'search', enabled: true }, { name: 'apply', enabled: false }]
            });

            expect(task.id).toMatch(/^task_/);
            expect(task.status).toBe('queued');
            expect(task.sessionId).toBe('sess1');
            expect(task.steps).toHaveLength(2);
            expect(task.steps[0].status).toBe('idle');
            expect(task.steps[1].status).toBe('skipped');
            expect(persistedData).toBeTruthy();
            expect(persistedData[task.id]).toBeDefined();
        });
    });

    describe('getTask / listTasks / getActiveTask', () => {
        it('retrieves task by ID', () => {
            const task = taskManager.createTask({ sessionId: 's1', steps: [] });
            expect(taskManager.getTask(task.id)).toBe(task);
            expect(taskManager.getTask('nonexistent')).toBeNull();
        });

        it('lists tasks with filters', () => {
            taskManager.createTask({ sessionId: 's1', steps: [] });
            taskManager.createTask({ sessionId: 's2', steps: [] });
            taskManager.createTask({ sessionId: 's1', steps: [] });

            expect(taskManager.listTasks()).toHaveLength(3);
            expect(taskManager.listTasks({ sessionId: 's1' })).toHaveLength(2);
            expect(taskManager.listTasks({ status: 'queued' })).toHaveLength(3);
        });

        it('getActiveTask returns a non-archived task for the session', () => {
            const t1 = taskManager.createTask({ sessionId: 's1', steps: [] });
            taskManager.transition(t1.id, 'running');
            taskManager.transition(t1.id, 'completed');
            taskManager.transition(t1.id, 'archived');

            const t2 = taskManager.createTask({ sessionId: 's1', steps: [] });

            const active = taskManager.getActiveTask('s1');
            expect(active.id).toBe(t2.id); // t1 is archived, only t2 is active
        });
    });

    // ─── State Machine ───

    describe('transition', () => {
        it('follows valid transitions', () => {
            const task = taskManager.createTask({ sessionId: 's1', steps: [] });

            let r = taskManager.transition(task.id, 'running');
            expect(r.success).toBe(true);
            expect(task.status).toBe('running');
            expect(task.startedAt).toBeTruthy();

            r = taskManager.transition(task.id, 'completed');
            expect(r.success).toBe(true);
            expect(task.completedAt).toBeTruthy();
            expect(task.stats.duration).toBeGreaterThanOrEqual(0);
        });

        it('rejects invalid transitions', () => {
            const task = taskManager.createTask({ sessionId: 's1', steps: [] });

            const r = taskManager.transition(task.id, 'completed'); // queued → completed invalid
            expect(r.success).toBe(false);
            expect(r.error).toContain('Invalid transition');
        });

        it('records errors in stats', () => {
            const task = taskManager.createTask({ sessionId: 's1', steps: [] });
            taskManager.transition(task.id, 'running');
            taskManager.transition(task.id, 'failed', { error: 'AI unavailable' });

            expect(task.stats.errors).toHaveLength(1);
            expect(task.stats.errors[0].message).toBe('AI unavailable');
        });

        it('sends notification on status change', () => {
            const task = taskManager.createTask({ sessionId: 's1', steps: [] });
            taskManager.transition(task.id, 'running');

            const n = notifications.find(n => n.event === 'status_change');
            expect(n).toBeDefined();
            expect(n.data.from).toBe('queued');
            expect(n.data.to).toBe('running');
        });
    });

    // ─── Step Progress ───

    describe('updateStep', () => {
        it('updates step status and timestamps', () => {
            const task = taskManager.createTask({
                sessionId: 's1',
                steps: [{ name: 'search', enabled: true }]
            });
            taskManager.transition(task.id, 'running');

            const step = taskManager.updateStep(task.id, 'search', 'running');
            expect(step.status).toBe('running');
            expect(step.startedAt).toBeTruthy();
            expect(task.currentStep).toBe('search');

            taskManager.updateStep(task.id, 'search', 'done', { result: { jobs: 5 } });
            expect(step.status).toBe('done');
            expect(step.completedAt).toBeTruthy();
            expect(step.result).toEqual({ jobs: 5 });
        });
    });

    describe('updateStepProgress', () => {
        it('merges progress data', () => {
            const task = taskManager.createTask({
                sessionId: 's1',
                steps: [{ name: 'search', enabled: true }]
            });

            taskManager.updateStepProgress(task.id, 'search', { searched: 5, matched: 2 });
            expect(task.steps[0].progress).toEqual({ searched: 5, matched: 2 });

            taskManager.updateStepProgress(task.id, 'search', { matched: 3, qualified: 1 });
            expect(task.steps[0].progress).toEqual({ searched: 5, matched: 3, qualified: 1 });
        });
    });

    // ─── Human Intervention ───

    describe('requestHumanIntervention', () => {
        it('transitions to waiting_human with block info', () => {
            const task = taskManager.createTask({ sessionId: 's1', steps: [] });
            taskManager.transition(task.id, 'running');

            const r = taskManager.requestHumanIntervention(task.id, {
                reason: 'login_required',
                platform: 'linkedin',
                message: 'LinkedIn session expired',
                actions: [{ label: 'Re-login', callback: 'relogin' }],
                autoTimeout: 1800000
            });

            expect(r.success).toBe(true);
            expect(task.status).toBe('waiting_human');
            expect(task.humanBlock.reason).toBe('login_required');
            expect(task.humanBlock.platform).toBe('linkedin');

            const n = notifications.find(n => n.event === 'human_intervention');
            expect(n).toBeDefined();
            expect(n.data.reason).toBe('login_required');
        });

        it('rejects if not running', () => {
            const task = taskManager.createTask({ sessionId: 's1', steps: [] });
            const r = taskManager.requestHumanIntervention(task.id, { reason: 'test' });
            expect(r.success).toBe(false);
        });
    });

    describe('resolveHumanBlock', () => {
        it('transitions back to running and clears block', () => {
            const task = taskManager.createTask({ sessionId: 's1', steps: [] });
            taskManager.transition(task.id, 'running');
            taskManager.requestHumanIntervention(task.id, { reason: 'login_required' });

            const r = taskManager.resolveHumanBlock(task.id, 'relogin');
            expect(r.success).toBe(true);
            expect(r.action).toBe('relogin');
            expect(task.status).toBe('running');
            expect(task.humanBlock).toBeNull();
            expect(task._humanBlockHistory).toHaveLength(1);
        });
    });

    // ─── Timeout ───

    describe('checkTimeouts', () => {
        it('fails tasks that exceed autoTimeout', () => {
            const task = taskManager.createTask({ sessionId: 's1', steps: [] });
            taskManager.transition(task.id, 'running');
            taskManager.requestHumanIntervention(task.id, {
                reason: 'captcha_manual',
                autoTimeout: 1 // 1ms — will immediately timeout
            });

            // Force the createdAt to past
            task.humanBlock.createdAt = new Date(Date.now() - 1000).toISOString();

            const timedOut = taskManager.checkTimeouts();
            expect(timedOut).toContain(task.id);
            expect(task.status).toBe('failed');
        });
    });

    // ─── Restart Recovery ───

    describe('recoverFromRestart', () => {
        it('pauses running tasks', () => {
            const t1 = taskManager.createTask({ sessionId: 's1', steps: [] });
            taskManager.transition(t1.id, 'running');
            const t2 = taskManager.createTask({ sessionId: 's2', steps: [] });
            // t2 stays queued

            const paused = taskManager.recoverFromRestart();
            expect(paused).toContain(t1.id);
            expect(paused).not.toContain(t2.id);
            expect(t1.status).toBe('paused');
            expect(t2.status).toBe('queued');
        });
    });

    // ─── Hydration ───

    describe('init with savedTasks', () => {
        it('hydrates from saved state', () => {
            const saved = {
                'task_123': { id: 'task_123', sessionId: 's1', status: 'paused', steps: [], stats: { errors: [] }, createdAt: '2026-01-01' }
            };
            taskManager.init({ persist: () => {}, savedTasks: saved });

            const task = taskManager.getTask('task_123');
            expect(task).toBeTruthy();
            expect(task.status).toBe('paused');
        });
    });

    // ─── Cleanup ───

    describe('deleteTask / clearSession', () => {
        it('deletes a single task', () => {
            const task = taskManager.createTask({ sessionId: 's1', steps: [] });
            expect(taskManager.deleteTask(task.id)).toBe(true);
            expect(taskManager.getTask(task.id)).toBeNull();
        });

        it('clears all tasks for a session', () => {
            taskManager.createTask({ sessionId: 's1', steps: [] });
            taskManager.createTask({ sessionId: 's1', steps: [] });
            taskManager.createTask({ sessionId: 's2', steps: [] });

            expect(taskManager.clearSession('s1')).toBe(2);
            expect(taskManager.listTasks({ sessionId: 's1' })).toHaveLength(0);
            expect(taskManager.listTasks({ sessionId: 's2' })).toHaveLength(1);
        });
    });
});
