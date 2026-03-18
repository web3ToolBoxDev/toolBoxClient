'use strict';

const store = require('./workflowStore');
const { buildDefaultConfig } = require('./workflowConfig');

describe('workflowStore', () => {
    const SESSION = 'test-session-' + Date.now();

    afterEach(() => {
        store.clearSession(SESSION);
    });

    describe('config store', () => {
        test('getConfig returns null for unknown session', () => {
            expect(store.getConfig('nonexistent')).toBeNull();
        });

        test('getConfig auto-creates default when location provided', () => {
            const cfg = store.getConfig(SESSION, 'Toronto');
            expect(cfg).not.toBeNull();
            expect(cfg.region).toBe('canada');
        });

        test('saveConfig validates and stores', () => {
            const cfg = buildDefaultConfig('Toronto');
            const result = store.saveConfig(SESSION, cfg);
            expect(result.success).toBe(true);

            const stored = store.getConfig(SESSION);
            expect(stored.region).toBe('canada');
            expect(stored.updatedAt).toBeTruthy();
        });

        test('saveConfig rejects invalid config', () => {
            const result = store.saveConfig(SESSION, { sources: [], steps: [] });
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe('run store', () => {
        test('initRun creates step states', () => {
            const cfg = buildDefaultConfig('Toronto');
            const run = store.initRun(SESSION, cfg);
            expect(run.status).toBe('idle');
            expect(run.steps).toHaveLength(4);
            // apply step defaults to enabled:false (locked for this version) → skipped
            const nonApply = run.steps.filter(s => s.name !== 'apply');
            expect(nonApply.every(s => s.status === 'idle')).toBe(true);
            expect(run.steps.find(s => s.name === 'apply').status).toBe('skipped');
        });

        test('disabled steps are skipped', () => {
            const cfg = buildDefaultConfig('Toronto');
            cfg.steps.find(s => s.name === 'apply').enabled = false;
            const run = store.initRun(SESSION, cfg);
            expect(run.steps.find(s => s.name === 'apply').status).toBe('skipped');
        });

        test('updateRunStatus transitions correctly', () => {
            const cfg = buildDefaultConfig('Toronto');
            store.initRun(SESSION, cfg);

            store.updateRunStatus(SESSION, 'running');
            expect(store.getRun(SESSION).status).toBe('running');
            expect(store.getRun(SESSION).startedAt).toBeTruthy();

            store.updateRunStatus(SESSION, 'completed');
            expect(store.getRun(SESSION).completedAt).toBeTruthy();
        });

        test('updateStepStatus tracks step progress', () => {
            const cfg = buildDefaultConfig('Toronto');
            store.initRun(SESSION, cfg);

            store.updateStepStatus(SESSION, 'search', 'running');
            const run = store.getRun(SESSION);
            expect(run.currentStep).toBe('search');
            const step = run.steps.find(s => s.name === 'search');
            expect(step.status).toBe('running');
            expect(step.startedAt).toBeTruthy();
        });

        test('updateStepStatus records errors', () => {
            const cfg = buildDefaultConfig('Toronto');
            store.initRun(SESSION, cfg);

            store.updateStepStatus(SESSION, 'search', 'error', { error: 'timeout' });
            const step = store.getRun(SESSION).steps.find(s => s.name === 'search');
            expect(step.error).toBe('timeout');
        });
    });

    describe('history store', () => {
        test('archiveRun moves run to history', () => {
            const cfg = buildDefaultConfig('Toronto');
            store.initRun(SESSION, cfg);
            store.updateRunStatus(SESSION, 'running');
            store.updateRunStatus(SESSION, 'completed');

            const record = store.archiveRun(SESSION);
            expect(record).toBeTruthy();
            expect(record.archivedAt).toBeTruthy();

            // Run should be gone
            expect(store.getRun(SESSION)).toBeNull();

            // History should have 1 record
            const history = store.getHistory(SESSION);
            expect(history).toHaveLength(1);
        });
    });
});
