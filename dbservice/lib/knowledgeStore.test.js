'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const ks = require('./knowledgeStore');
const schema = require('./memorySchema');

let tmpDir;

beforeAll(async () => {
    // Register job-seek domain pack (normally done by agent at startup)
    schema.registerDomainPack('job-seek', {
        types: {
            profile:      { durability: 'durable',  conflictPolicy: 'replace', description: 'User career profile section', subTypes: ['basic', 'skills', 'experience', 'education'] },
            direction:    { durability: 'durable',  conflictPolicy: 'replace', description: 'Job search direction', subTypes: ['target'] },
            job_listing:  { durability: 'durable',  conflictPolicy: 'replace', description: 'Scraped job posting', subTypes: [] },
            match_result: { durability: 'session',  conflictPolicy: 'replace', description: 'Job match score', subTypes: [] }
        }
    });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-test-'));
    await ks.init(tmpDir);
});

afterAll(() => {
    ks.close();
    ks._reset();
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
});

describe('knowledgeStore', () => {
    describe('upsert & findByRef', () => {
        it('inserts a new document and retrieves it', () => {
            const refId = ks.upsert({
                refId: 'test_001',
                type: 'profile',
                subType: 'basic',
                scope: 'agent:job-seek',
                content: 'Name: Zhang Ying, Location: London ON',
                summary: 'Zhang Ying, frontend engineer',
                tags: ['personal'],
                source: 'resume.pdf'
            });
            expect(refId).toBe('test_001');
            const doc = ks.findByRef('test_001');
            expect(doc).not.toBeNull();
            expect(doc.type).toBe('profile');
            expect(doc.subType).toBe('basic');
            expect(doc.scope).toBe('agent:job-seek');
            expect(doc.content).toContain('Zhang Ying');
            expect(doc.tags).toEqual(['personal']);
            expect(doc.version).toBe(1);
            expect(doc.current).toBe(1);
            expect(doc.writeClass).toBe('explicit');
        });

        it('updates existing document and bumps version', () => {
            ks.upsert({
                refId: 'test_001',
                type: 'profile',
                subType: 'basic',
                content: 'Name: Zhang Ying, Location: Toronto ON'
            });
            const doc = ks.findByRef('test_001');
            expect(doc.content).toContain('Toronto');
            expect(doc.version).toBe(2);
        });

        it('auto-generates refId when not provided', () => {
            const refId = ks.upsert({
                type: 'preference',
                content: 'Prefers remote work'
            });
            expect(refId).toMatch(/^preference_\d+_/);
            const doc = ks.findByRef(refId);
            expect(doc.content).toBe('Prefers remote work');
        });
    });

    describe('validation', () => {
        it('rejects document with unknown type', () => {
            expect(() => ks.upsert({
                type: 'bogus_type',
                content: 'test'
            })).toThrow(/unknown type/);
        });

        it('rejects document with invalid subType', () => {
            expect(() => ks.upsert({
                type: 'profile',
                subType: 'hobbies',
                content: 'test'
            })).toThrow(/invalid subType/);
        });

        it('allows skipValidation option', () => {
            const refId = ks.upsert({
                refId: 'skip_val_test',
                type: 'unknown_type',
                content: 'test'
            }, { skipValidation: true });
            expect(refId).toBe('skip_val_test');
            ks.remove('skip_val_test');
        });
    });

    describe('scope', () => {
        it('defaults scope to global for new docs', () => {
            const refId = ks.upsert({
                refId: 'scope_default',
                type: 'knowledge',
                content: 'global fact'
            });
            const doc = ks.findByRef(refId);
            expect(doc.scope).toBe('global');
            ks.remove(refId);
        });

        it('stores explicit scope', () => {
            const refId = ks.upsert({
                refId: 'scope_agent',
                type: 'knowledge',
                scope: 'agent:code-review',
                content: 'repo info'
            });
            const doc = ks.findByRef(refId);
            expect(doc.scope).toBe('agent:code-review');
            ks.remove(refId);
        });
    });

    describe('candidate / promote', () => {
        it('candidate writeClass inserts with current=0', () => {
            ks.upsert({
                refId: 'candidate_test',
                type: 'knowledge',
                content: 'maybe true',
                writeClass: 'candidate'
            });
            const doc = ks.findByRef('candidate_test');
            expect(doc.current).toBe(0);
            expect(doc.writeClass).toBe('candidate');
        });

        it('candidate is not returned by findByType', () => {
            const docs = ks.findByType('knowledge');
            expect(docs.find(d => d.refId === 'candidate_test')).toBeUndefined();
        });

        it('promote makes candidate current', () => {
            const ok = ks.promote('candidate_test');
            expect(ok).toBe(true);
            const doc = ks.findByRef('candidate_test');
            expect(doc.current).toBe(1);
            ks.remove('candidate_test');
        });
    });

    describe('dedup', () => {
        it('skips insert if identical content exists for same type+subType+scope', () => {
            const refId1 = ks.upsert({
                refId: 'dedup_a',
                type: 'knowledge',
                subType: '',
                scope: 'global',
                content: 'duplicate content'
            });
            const refId2 = ks.upsert({
                type: 'knowledge',
                subType: '',
                scope: 'global',
                content: 'duplicate content'
            });
            expect(refId2).toBe('dedup_a');
            ks.remove('dedup_a');
        });
    });

    describe('findByType', () => {
        beforeAll(() => {
            ks.upsert({ refId: 'prof_skills', type: 'profile', subType: 'skills', scope: 'agent:job-seek', content: 'React, Vue.js, TypeScript' });
            ks.upsert({ refId: 'prof_exp', type: 'profile', subType: 'experience', scope: 'agent:job-seek', content: 'ByteDance 2019-2022' });
            ks.upsert({ refId: 'prof_edu', type: 'profile', subType: 'education', scope: 'agent:job-seek', content: 'B.S. Tsinghua University' });
        });

        it('returns all profile documents', () => {
            const docs = ks.findByType('profile');
            expect(docs.length).toBeGreaterThanOrEqual(3);
            const subTypes = docs.map(d => d.subType);
            expect(subTypes).toContain('skills');
            expect(subTypes).toContain('experience');
            expect(subTypes).toContain('education');
        });

        it('filters by subType', () => {
            const docs = ks.findByType('profile', 'skills');
            expect(docs.length).toBe(1);
            expect(docs[0].content).toContain('React');
        });
    });

    describe('findByTags', () => {
        beforeAll(() => {
            ks.upsert({ refId: 'dir_fe', type: 'direction', subType: 'target', scope: 'agent:job-seek', tags: ['frontend'], content: 'Target: Senior Frontend' });
            ks.upsert({ refId: 'dir_fs', type: 'direction', subType: 'target', scope: 'agent:job-seek', tags: ['fullstack'], content: 'Target: Fullstack Dev' });
        });

        it('finds documents by tag', () => {
            const docs = ks.findByTags(['frontend']);
            expect(docs.some(d => d.refId === 'dir_fe')).toBe(true);
        });

        it('finds documents matching any tag', () => {
            const docs = ks.findByTags(['frontend', 'fullstack']);
            expect(docs.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('findResolved (scope hierarchy)', () => {
        beforeAll(() => {
            ks.upsert({ refId: 'res_global', type: 'preference', scope: 'global', content: 'global pref' });
            ks.upsert({ refId: 'res_agent', type: 'preference', scope: 'agent:job-seek', content: 'agent pref' });
            ks.upsert({ refId: 'res_session', type: 'preference', scope: 'session:abc123', content: 'session pref' });
        });

        it('returns most specific scope first', () => {
            const doc = ks.findResolved('preference', '', ['session:abc123', 'agent:job-seek', 'global']);
            expect(doc.refId).toBe('res_session');
        });

        it('falls back to next scope if specific not found', () => {
            const doc = ks.findResolved('preference', '', ['session:nonexistent', 'agent:job-seek', 'global']);
            expect(doc.refId).toBe('res_agent');
        });

        it('falls back to global', () => {
            const doc = ks.findResolved('preference', '', ['session:none', 'agent:none', 'global']);
            expect(doc.refId).toBe('res_global');
        });

        it('returns null when no scope matches', () => {
            const doc = ks.findResolved('preference', '', ['session:none', 'agent:none']);
            expect(doc).toBeNull();
        });

        afterAll(() => {
            ks.remove('res_global');
            ks.remove('res_agent');
            ks.remove('res_session');
        });
    });

    describe('findFresh', () => {
        it('returns recent documents', () => {
            ks.upsert({ refId: 'fresh_1', type: 'knowledge', scope: 'global', content: 'recent fact' });
            const docs = ks.findFresh('knowledge', 'global', 1);
            expect(docs.some(d => d.refId === 'fresh_1')).toBe(true);
            ks.remove('fresh_1');
        });

        it('excludes docs past validUntil', () => {
            ks.upsert({
                refId: 'expired_valid',
                type: 'knowledge',
                scope: 'global',
                content: 'expired',
                validUntil: Date.now() - 1000
            });
            const docs = ks.findFresh('knowledge', 'global', 30);
            expect(docs.find(d => d.refId === 'expired_valid')).toBeUndefined();
            ks.remove('expired_valid');
        });
    });

    describe('FTS search', () => {
        it('finds documents by keyword', () => {
            const results = ks.search('React TypeScript');
            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results[0].doc.content).toContain('React');
        });

        it('finds documents by content keyword', () => {
            const results = ks.search('ByteDance');
            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results[0].doc.subType).toBe('experience');
        });

        it('filters by type', () => {
            const results = ks.search('frontend', ['direction']);
            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results.every(r => r.doc.type === 'direction')).toBe(true);
        });

        it('filters by scope', () => {
            ks.upsert({ refId: 'scope_search', type: 'knowledge', scope: 'agent:test-scope', content: 'unique_keyword_xyz' });
            const all = ks.search('unique_keyword_xyz');
            expect(all.length).toBe(1);
            const scoped = ks.search('unique_keyword_xyz', null, 10, 'agent:other');
            expect(scoped.length).toBe(0);
            const correct = ks.search('unique_keyword_xyz', null, 10, 'agent:test-scope');
            expect(correct.length).toBe(1);
            ks.remove('scope_search');
        });

        it('returns empty for no match', () => {
            const results = ks.search('xyznonexistent');
            expect(results.length).toBe(0);
        });
    });

    describe('expandByTypes', () => {
        it('expands profile type to all profile docs', () => {
            const docs = ks.expandByTypes(['profile']);
            const types = [...new Set(docs.map(d => d.type))];
            expect(types).toEqual(['profile']);
            expect(docs.length).toBeGreaterThanOrEqual(3);
        });

        it('expands direction type to profile + direction docs', () => {
            const docs = ks.expandByTypes(['direction']);
            const types = [...new Set(docs.map(d => d.type))];
            expect(types).toContain('profile');
            expect(types).toContain('direction');
        });
    });

    describe('conflict resolution', () => {
        it('applies replace policy for profile type', () => {
            ks.upsert({ refId: 'conflict_prof', type: 'profile', subType: 'skills', scope: 'agent:job-seek', content: 'React' });
            ks.upsert({ refId: 'conflict_prof', type: 'profile', subType: 'skills', content: 'Vue' });
            const doc = ks.findByRef('conflict_prof');
            expect(doc.content).toBe('Vue');
            ks.remove('conflict_prof');
        });

        it('applies append policy for decision type', () => {
            ks.upsert({ refId: 'conflict_dec', type: 'decision', scope: 'global', content: 'chose A' });
            ks.upsert({ refId: 'conflict_dec', type: 'decision', content: 'chose B' });
            const doc = ks.findByRef('conflict_dec');
            expect(doc.content).toContain('chose A');
            expect(doc.content).toContain('chose B');
            ks.remove('conflict_dec');
        });

        it('applies append_set policy for constraint type', () => {
            ks.upsert({ refId: 'conflict_con', type: 'constraint', scope: 'global', content: 'rule1, rule2' });
            ks.upsert({ refId: 'conflict_con', type: 'constraint', content: 'rule2, rule3' });
            const doc = ks.findByRef('conflict_con');
            expect(doc.content).toContain('rule1');
            expect(doc.content).toContain('rule3');
            // rule2 should not be duplicated
            expect(doc.content.split('rule2').length - 1).toBe(1);
            ks.remove('conflict_con');
        });
    });

    describe('audit trail', () => {
        it('logs create and update actions', () => {
            ks.upsert({ refId: 'audit_test', type: 'knowledge', scope: 'global', content: 'v1' });
            ks.upsert({ refId: 'audit_test', type: 'knowledge', content: 'v2' });
            const log = ks.getAuditLog('audit_test');
            expect(log.length).toBeGreaterThanOrEqual(2);
            const actions = log.map(l => l.action);
            expect(actions).toContain('create');
            expect(actions).toContain('update');
            ks.remove('audit_test');
        });

        it('logs delete action', () => {
            ks.upsert({ refId: 'audit_del', type: 'knowledge', scope: 'global', content: 'temp' });
            ks.remove('audit_del');
            const log = ks.getAuditLog('audit_del');
            expect(log.some(l => l.action === 'delete')).toBe(true);
        });

        it('logs promote action', () => {
            ks.upsert({ refId: 'audit_promo', type: 'knowledge', scope: 'global', content: 'candidate', writeClass: 'candidate' });
            ks.promote('audit_promo');
            const log = ks.getAuditLog('audit_promo');
            expect(log.some(l => l.action === 'promote')).toBe(true);
            ks.remove('audit_promo');
        });
    });

    describe('freshness columns', () => {
        it('stores and retrieves lifecycle fields', () => {
            const now = Date.now();
            ks.upsert({
                refId: 'lifecycle_test',
                type: 'knowledge',
                scope: 'global',
                content: 'test',
                writeClass: 'inferred',
                validFrom: now - 1000,
                validUntil: now + 86400000,
                lastConfirmedAt: now
            });
            const doc = ks.findByRef('lifecycle_test');
            expect(doc.writeClass).toBe('inferred');
            expect(doc.validFrom).toBe(now - 1000);
            expect(doc.validUntil).toBe(now + 86400000);
            expect(doc.lastConfirmedAt).toBe(now);
            ks.remove('lifecycle_test');
        });
    });

    describe('expireTTL', () => {
        it('removes expired documents by TTL', async () => {
            ks.upsert({ refId: 'ttl_old', type: 'ephemeral', scope: 'global', content: 'expired', ttl: 10 });
            expect(ks.findByRef('ttl_old')).not.toBeNull();
            await new Promise(r => setTimeout(r, 20));
            const expired = ks.expireTTL();
            expect(expired).toBeGreaterThanOrEqual(1);
            expect(ks.findByRef('ttl_old')).toBeNull();
        });

        it('removes documents past validUntil', () => {
            ks.upsert({
                refId: 'valid_until_exp',
                type: 'ephemeral',
                scope: 'global',
                content: 'expired',
                validUntil: Date.now() - 1000
            });
            const expired = ks.expireTTL();
            expect(expired).toBeGreaterThanOrEqual(1);
            expect(ks.findByRef('valid_until_exp')).toBeNull();
        });
    });

    describe('remove & removeByType', () => {
        it('removes a single document', () => {
            ks.upsert({ refId: 'tmp_rm', type: 'ephemeral', scope: 'global', content: 'to be removed' });
            expect(ks.findByRef('tmp_rm')).not.toBeNull();
            ks.remove('tmp_rm');
            expect(ks.findByRef('tmp_rm')).toBeNull();
        });

        it('removes all documents of a type', () => {
            ks.upsert({ refId: 'tmp_a', type: 'task_state', scope: 'global', content: 'a' });
            ks.upsert({ refId: 'tmp_b', type: 'task_state', scope: 'global', content: 'b' });
            const count = ks.removeByType('task_state');
            expect(count).toBe(2);
            expect(ks.findByType('task_state').length).toBe(0);
        });
    });

    describe('stats', () => {
        it('returns document counts', () => {
            ks.upsert({ refId: 'stat_test', type: 'profile', subType: 'basic', scope: 'agent:job-seek', content: 'stats test' });
            const s = ks.stats();
            expect(s.total).toBeGreaterThan(0);
            expect(s.byType.profile).toBeGreaterThanOrEqual(1);
            ks.remove('stat_test');
        });
    });

    describe('persistence', () => {
        it('saves and reloads from disk', async () => {
            ks.upsert({ refId: 'persist_test', type: 'knowledge', scope: 'global', content: 'survives restart' });
            ks.persist();

            ks.close();
            ks._reset();
            await ks.init(tmpDir);

            const doc = ks.findByRef('persist_test');
            expect(doc).not.toBeNull();
            expect(doc.content).toBe('survives restart');
        });
    });
});
