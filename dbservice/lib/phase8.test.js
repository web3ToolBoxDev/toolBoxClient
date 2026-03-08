'use strict';

/**
 * Phase 8 integration tests — Advanced schema features, cross-agent sharing,
 * hot memory cleanup.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Phase 8: Advanced Features', () => {
    let knowledgeStore;
    let memorySchema;
    let tmpDir;

    beforeAll(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8-test-'));
        knowledgeStore = require('./knowledgeStore');
        knowledgeStore._reset();
        await knowledgeStore.init(tmpDir);

        memorySchema = require('./memorySchema');
        memorySchema.registerTypes({
            profile:     { durability: 'durable', conflictPolicy: 'replace' },
            direction:   { durability: 'durable', conflictPolicy: 'replace' },
            job_listing: { durability: 'durable', conflictPolicy: 'replace' }
        });
    });

    afterAll(() => {
        knowledgeStore.close();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    });

    // ─── Story 8.3: Cross-Agent Memory Sharing ───
    describe('Cross-Agent Sharing (8.3)', () => {
        describe('canRead', () => {
            test('any agent can read user:global', () => {
                expect(memorySchema.canRead('agent:code-review', 'user:global')).toBe(true);
            });

            test('any agent can read global', () => {
                expect(memorySchema.canRead('agent:job-seek', 'global')).toBe(true);
            });

            test('agent can read own scope', () => {
                expect(memorySchema.canRead('agent:job-seek', 'agent:job-seek')).toBe(true);
            });

            test('agent can read session scopes', () => {
                expect(memorySchema.canRead('agent:job-seek', 'session:abc')).toBe(true);
            });
        });

        describe('canWrite', () => {
            test('any agent can write to user:global', () => {
                expect(memorySchema.canWrite('agent:job-seek', 'user:global')).toBe(true);
            });

            test('agent can write to own scope', () => {
                expect(memorySchema.canWrite('agent:job-seek', 'agent:job-seek')).toBe(true);
            });
        });

        describe('actorId in documents', () => {
            test('stores and retrieves actorId', () => {
                const refId = knowledgeStore.upsert({
                    type: 'profile',
                    content: 'Cross-agent test',
                    actorId: 'agent:job-seek',
                    scope: 'user:global'
                });
                const doc = knowledgeStore.findByRef(refId);
                expect(doc.actorId).toBe('agent:job-seek');
            });

            test('findByActor returns docs by actor', () => {
                knowledgeStore.upsert({
                    refId: 'actor_test_1',
                    type: 'profile',
                    content: 'Written by code-review',
                    actorId: 'agent:code-review'
                });
                const docs = knowledgeStore.findByActor('agent:code-review');
                expect(docs.some(d => d.refId === 'actor_test_1')).toBe(true);
            });
        });
    });

    // ─── Story 8.4: Advanced Schema Features ───
    describe('Advanced Schema (8.4)', () => {
        describe('sourceType validation', () => {
            test('accepts valid sourceType', () => {
                const result = memorySchema.validateDoc({ type: 'profile', content: 'test', sourceType: 'user_explicit' });
                expect(result.valid).toBe(true);
            });

            test('rejects invalid sourceType', () => {
                const result = memorySchema.validateDoc({ type: 'profile', content: 'test', sourceType: 'invalid_type' });
                expect(result.valid).toBe(false);
                expect(result.errors.some(e => e.includes('sourceType'))).toBe(true);
            });
        });

        describe('payload validation', () => {
            test('accepts object payload', () => {
                const result = memorySchema.validateDoc({ type: 'profile', content: 'test', payload: { key: 'value' } });
                expect(result.valid).toBe(true);
            });

            test('accepts JSON string payload', () => {
                const result = memorySchema.validateDoc({ type: 'profile', content: 'test', payload: '{"key":"value"}' });
                expect(result.valid).toBe(true);
            });

            test('rejects invalid JSON string payload', () => {
                const result = memorySchema.validateDoc({ type: 'profile', content: 'test', payload: 'not json' });
                expect(result.valid).toBe(false);
            });
        });

        describe('tags validation', () => {
            test('accepts array of strings', () => {
                const result = memorySchema.validateDoc({ type: 'profile', content: 'test', tags: ['tag1', 'tag2'] });
                expect(result.valid).toBe(true);
            });

            test('rejects non-string tags', () => {
                const result = memorySchema.validateDoc({ type: 'profile', content: 'test', tags: [1, 2] });
                expect(result.valid).toBe(false);
            });
        });

        describe('memoryKey', () => {
            test('stores and retrieves memoryKey', () => {
                const refId = knowledgeStore.upsert({
                    type: 'profile',
                    content: 'Memory key test',
                    memoryKey: 'user:profile:main'
                });
                const doc = knowledgeStore.findByRef(refId);
                expect(doc.memoryKey).toBe('user:profile:main');
            });

            test('findByMemoryKey returns doc', () => {
                knowledgeStore.upsert({
                    refId: 'mk_test_1',
                    type: 'profile',
                    content: 'Find by key',
                    memoryKey: 'user:skills:primary'
                });
                const doc = knowledgeStore.findByMemoryKey('user:skills:primary');
                expect(doc).not.toBeNull();
                expect(doc.refId).toBe('mk_test_1');
            });

            test('findByMemoryKey returns null for nonexistent', () => {
                const doc = knowledgeStore.findByMemoryKey('nonexistent:key');
                expect(doc).toBeNull();
            });
        });

        describe('payload storage', () => {
            test('stores and retrieves object payload', () => {
                const refId = knowledgeStore.upsert({
                    type: 'profile',
                    content: 'Payload test',
                    payload: { skills: ['react', 'node'], years: 5 }
                });
                const doc = knowledgeStore.findByRef(refId);
                expect(doc.payload).toEqual({ skills: ['react', 'node'], years: 5 });
            });
        });

        describe('sourceType storage', () => {
            test('stores and retrieves sourceType', () => {
                const refId = knowledgeStore.upsert({
                    type: 'profile',
                    content: 'Source type test',
                    sourceType: 'system_extracted'
                });
                const doc = knowledgeStore.findByRef(refId);
                expect(doc.sourceType).toBe('system_extracted');
            });

            test('defaults to user_explicit', () => {
                const refId = knowledgeStore.upsert({
                    type: 'profile',
                    content: 'Default source type'
                });
                const doc = knowledgeStore.findByRef(refId);
                expect(doc.sourceType).toBe('user_explicit');
            });
        });

        describe('VALID_SOURCE_TYPES', () => {
            test('includes all 4 source types', () => {
                expect(memorySchema.VALID_SOURCE_TYPES.has('user_explicit')).toBe(true);
                expect(memorySchema.VALID_SOURCE_TYPES.has('assistant_inferred')).toBe(true);
                expect(memorySchema.VALID_SOURCE_TYPES.has('system_extracted')).toBe(true);
                expect(memorySchema.VALID_SOURCE_TYPES.has('imported')).toBe(true);
            });
        });
    });

    // ─── Story 8.5: Hot Memory Cleanup ───
    describe('Hot Memory Cleanup (8.5)', () => {
        test('findColdMemories returns unused docs', () => {
            // Insert a doc that will never be accessed
            knowledgeStore.upsert({
                refId: 'cold_doc_1',
                type: 'job_listing',
                content: 'Very old listing',
                scope: 'global'
            }, { skipValidation: true });

            // Force lastUsedAt to 0 and accessCount to 0
            const db = knowledgeStore._getDb();
            db.run('UPDATE documents SET lastUsedAt = 0, accessCount = 0 WHERE refId = ?', ['cold_doc_1']);

            const cold = knowledgeStore.findColdMemories({ lastUsedDays: 0, maxAccessCount: 0 });
            expect(cold.some(d => d.refId === 'cold_doc_1')).toBe(true);
        });

        test('findColdMemories excludes protected types', () => {
            knowledgeStore.upsert({
                refId: 'protected_doc',
                type: 'identity',
                subType: 'name',
                content: 'John Doe'
            });
            const db = knowledgeStore._getDb();
            db.run('UPDATE documents SET lastUsedAt = 0, accessCount = 0 WHERE refId = ?', ['protected_doc']);

            const cold = knowledgeStore.findColdMemories({ lastUsedDays: 0, maxAccessCount: 0, excludeTypes: ['identity'] });
            expect(cold.some(d => d.refId === 'protected_doc')).toBe(false);
        });

        test('cleanupColdMemories archives cold docs', () => {
            knowledgeStore.upsert({
                refId: 'archive_me',
                type: 'job_listing',
                content: 'Old job'
            }, { skipValidation: true });
            const db = knowledgeStore._getDb();
            db.run('UPDATE documents SET lastUsedAt = 0, accessCount = 0 WHERE refId = ?', ['archive_me']);

            const result = knowledgeStore.cleanupColdMemories({ lastUsedDays: 0, maxAccessCount: 0 });
            expect(result.archived).toBeGreaterThanOrEqual(1);
            expect(result.refIds).toContain('archive_me');

            // Verify doc is now deleted
            const doc = knowledgeStore.findByRef('archive_me');
            expect(doc.status).toBe('deleted');
        });

        test('cleanupColdMemories creates audit trail', () => {
            const audit = knowledgeStore.getAuditLog('archive_me');
            const cleanupEntry = audit.find(a => a.action === 'cold_cleanup');
            expect(cleanupEntry).toBeDefined();
        });
    });
});
