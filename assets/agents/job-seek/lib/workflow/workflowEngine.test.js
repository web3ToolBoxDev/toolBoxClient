'use strict';

const engine = require('./workflowEngine');
const store = require('./workflowStore');
const { buildDefaultConfig } = require('./workflowConfig');

describe('workflowEngine', () => {
    const SESSION = 'engine-test-' + Date.now();

    afterEach(async () => {
        engine.stop(SESSION);
        // Allow async pipeline to settle
        await new Promise(r => setTimeout(r, 100));
        store.clearSession(SESSION);
    });

    describe('getStatus', () => {
        test('returns idle for unknown session', () => {
            const status = engine.getStatus('nonexistent');
            expect(status.status).toBe('idle');
            expect(status.steps).toEqual([]);
        });
    });

    describe('start', () => {
        test('rejects invalid config', async () => {
            const result = await engine.start(SESSION, { sources: [], steps: [] }, {});
            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
        });

        test('starts pipeline with valid config', async () => {
            const config = buildDefaultConfig('Toronto');
            const context = {
                direction: { q_job_title: 'Developer', q_location: 'Toronto' },
                profile: { basic: 'John Doe', skills: 'JavaScript, Node.js' }
            };

            const result = await engine.start(SESSION, config, context);
            expect(result.success).toBe(true);
            expect(result.run).toBeTruthy();

            // Stop immediately to prevent background execution
            engine.stop(SESSION);
        });

        test('rejects duplicate start', async () => {
            const config = buildDefaultConfig('Toronto');
            const context = {
                direction: { q_job_title: 'Developer' },
                profile: { basic: 'test' }
            };

            await engine.start(SESSION, config, context);
            const result2 = await engine.start(SESSION, config, context);
            expect(result2.success).toBe(false);
            expect(result2.error).toMatch(/already running/i);

            engine.stop(SESSION);
        });
    });

    describe('stop', () => {
        test('returns error for unknown session', () => {
            const result = engine.stop('nonexistent');
            expect(result.success).toBe(false);
        });

        test('stops running workflow', async () => {
            const config = buildDefaultConfig('Toronto');
            const context = {
                direction: { q_job_title: 'Developer' },
                profile: { basic: 'test' }
            };

            await engine.start(SESSION, config, context);
            const result = engine.stop(SESSION);
            expect(result.success).toBe(true);

            const status = engine.getStatus(SESSION);
            expect(status.status).toBe('paused');
        });
    });

    describe('checkLoginStatus', () => {
        test('returns not_required for sources without login', async () => {
            const status = await engine.checkLoginStatus('indeed');
            expect(status).toBe('not_required');
        });

        test('returns unknown for sources with login requirement', async () => {
            const status = await engine.checkLoginStatus('linkedin');
            expect(status).toBe('unknown');
        });

        test('returns unknown for nonexistent source', async () => {
            const status = await engine.checkLoginStatus('fakesource');
            expect(status).toBe('unknown');
        });
    });

    describe('setLoginStatus', () => {
        test('updates cached login status', async () => {
            engine.setLoginStatus('linkedin', 'logged_in');
            const status = await engine.checkLoginStatus('linkedin');
            expect(status).toBe('logged_in');
        });
    });
});
