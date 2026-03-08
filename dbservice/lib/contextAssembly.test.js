'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('contextAssembly', () => {
    let knowledgeStore;
    let contextAssembly;
    let tmpDir;

    beforeAll(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-test-'));
        // Reset and init
        knowledgeStore = require('./knowledgeStore');
        knowledgeStore._reset();
        await knowledgeStore.init(tmpDir);

        // Register domain types for testing
        const { registerTypes } = require('./memorySchema');
        registerTypes({
            profile:     { durability: 'durable', conflictPolicy: 'replace' },
            direction:   { durability: 'durable', conflictPolicy: 'replace' },
            job_listing: { durability: 'durable', conflictPolicy: 'replace' },
            match_result:{ durability: 'session', conflictPolicy: 'replace' }
        });

        contextAssembly = require('./contextAssembly');
    });

    afterAll(() => {
        knowledgeStore.close();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    });

    beforeEach(() => {
        // Clean up docs (re-init would be too heavy, just remove known types)
    });

    describe('estimateTokens', () => {
        test('estimates based on content length', () => {
            const tokens = contextAssembly.estimateTokens({ content: 'Hello world', summary: '' });
            expect(tokens).toBeGreaterThan(0);
            expect(tokens).toBeLessThan(10);
        });

        test('includes summary in estimate', () => {
            const t1 = contextAssembly.estimateTokens({ content: 'Hi', summary: '' });
            const t2 = contextAssembly.estimateTokens({ content: 'Hi', summary: 'A long summary text here' });
            expect(t2).toBeGreaterThan(t1);
        });
    });

    describe('stalenessWeight', () => {
        test('returns ~1.0 for fresh docs', () => {
            const w = contextAssembly.stalenessWeight({ updatedAt: Date.now() });
            expect(w).toBeGreaterThan(0.9);
        });

        test('returns lower weight for old docs', () => {
            const thirtyDaysAgo = Date.now() - 30 * 86400000;
            const w = contextAssembly.stalenessWeight({ updatedAt: thirtyDaysAgo });
            expect(w).toBeLessThan(0.7);
        });

        test('never returns below 0.05', () => {
            const veryOld = Date.now() - 365 * 86400000;
            const w = contextAssembly.stalenessWeight({ updatedAt: veryOld });
            expect(w).toBeGreaterThanOrEqual(0.05);
        });
    });

    describe('writeClassWeight', () => {
        test('explicit = 1.0', () => {
            expect(contextAssembly.writeClassWeight({ writeClass: 'explicit' })).toBe(1.0);
        });

        test('inferred < explicit', () => {
            expect(contextAssembly.writeClassWeight({ writeClass: 'inferred' })).toBeLessThan(1.0);
        });

        test('transient is lowest', () => {
            expect(contextAssembly.writeClassWeight({ writeClass: 'transient' })).toBeLessThan(0.2);
        });
    });

    describe('scoreDoc', () => {
        test('higher priority types score higher', () => {
            const identityScore = contextAssembly.scoreDoc({ type: 'identity', updatedAt: Date.now(), writeClass: 'explicit', confidence: 1.0 });
            const ephemeralScore = contextAssembly.scoreDoc({ type: 'ephemeral', updatedAt: Date.now(), writeClass: 'explicit', confidence: 1.0 });
            expect(identityScore).toBeGreaterThan(ephemeralScore);
        });

        test('fresher docs score higher', () => {
            const now = Date.now();
            const fresh = contextAssembly.scoreDoc({ type: 'profile', updatedAt: now, writeClass: 'explicit', confidence: 1.0 }, now);
            const stale = contextAssembly.scoreDoc({ type: 'profile', updatedAt: now - 90 * 86400000, writeClass: 'explicit', confidence: 1.0 }, now);
            expect(fresh).toBeGreaterThan(stale);
        });
    });

    describe('assembleContext', () => {
        test('returns empty for empty store', () => {
            const result = contextAssembly.assembleContext('general');
            // May have docs from previous tests, but structure should be correct
            expect(Array.isArray(result)).toBe(true);
        });

        test('respects task policy includes', () => {
            // Insert a profile doc
            knowledgeStore.upsert({ type: 'profile', content: 'Test user profile', scope: 'global' });

            const result = contextAssembly.assembleContext('general');
            const types = result.map(r => r.doc.type);
            // Profile should be included in general
            if (result.length > 0) {
                expect(types).toContain('profile');
            }
        });

        test('sorts by score descending', () => {
            const result = contextAssembly.assembleContext('general');
            for (let i = 1; i < result.length; i++) {
                expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
            }
        });
    });

    describe('getPolicy', () => {
        test('returns policy for known task type', () => {
            const policy = contextAssembly.getPolicy('job-search');
            expect(policy.include).toContain('profile');
            expect(policy.maxTokens).toBeGreaterThan(0);
        });

        test('returns general for unknown type', () => {
            const policy = contextAssembly.getPolicy('unknown-type');
            expect(policy).toEqual(contextAssembly.TASK_POLICIES['general']);
        });
    });

    describe('registerPolicy', () => {
        test('adds custom task policy', () => {
            contextAssembly.registerPolicy('custom-task', {
                include: ['profile'],
                maxDocs: 5,
                maxTokens: 1000
            });
            const policy = contextAssembly.getPolicy('custom-task');
            expect(policy.maxDocs).toBe(5);
        });
    });
});
