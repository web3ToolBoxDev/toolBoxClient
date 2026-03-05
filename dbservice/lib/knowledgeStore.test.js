'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const ks = require('./knowledgeStore');

let tmpDir;

beforeAll(async () => {
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
            expect(doc.content).toContain('Zhang Ying');
            expect(doc.tags).toEqual(['personal']);
            expect(doc.version).toBe(1);
            expect(doc.current).toBe(1);
        });

        it('updates existing document and bumps version', () => {
            ks.upsert({
                refId: 'test_001',
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

    describe('findByType', () => {
        beforeAll(() => {
            ks.upsert({ refId: 'prof_skills', type: 'profile', subType: 'skills', content: 'React, Vue.js, TypeScript' });
            ks.upsert({ refId: 'prof_exp', type: 'profile', subType: 'experience', content: 'ByteDance 2019-2022' });
            ks.upsert({ refId: 'prof_edu', type: 'profile', subType: 'education', content: 'B.S. Tsinghua University' });
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
            ks.upsert({ refId: 'dir_fe', type: 'direction', tags: ['frontend'], content: 'Target: Senior Frontend' });
            ks.upsert({ refId: 'dir_fs', type: 'direction', tags: ['fullstack'], content: 'Target: Fullstack Dev' });
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

    describe('FTS5 search', () => {
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

    describe('remove & removeByType', () => {
        it('removes a single document', () => {
            ks.upsert({ refId: 'tmp_rm', type: 'temp', content: 'to be removed' });
            expect(ks.findByRef('tmp_rm')).not.toBeNull();
            ks.remove('tmp_rm');
            expect(ks.findByRef('tmp_rm')).toBeNull();
        });

        it('removes all documents of a type', () => {
            ks.upsert({ refId: 'tmp_a', type: 'temp_batch', content: 'a' });
            ks.upsert({ refId: 'tmp_b', type: 'temp_batch', content: 'b' });
            const count = ks.removeByType('temp_batch');
            expect(count).toBe(2);
            expect(ks.findByType('temp_batch').length).toBe(0);
        });
    });

    describe('expireTTL', () => {
        it('removes expired documents', async () => {
            ks.upsert({ refId: 'ttl_old', type: 'temp', content: 'expired', ttl: 10 });
            expect(ks.findByRef('ttl_old')).not.toBeNull();
            // Wait for TTL to expire
            await new Promise(r => setTimeout(r, 20));
            const expired = ks.expireTTL();
            expect(expired).toBeGreaterThanOrEqual(1);
            expect(ks.findByRef('ttl_old')).toBeNull();
        });
    });

    describe('stats', () => {
        it('returns document counts', () => {
            // Insert a fresh doc to ensure stats has data
            ks.upsert({ refId: 'stat_test', type: 'profile', subType: 'test', content: 'stats test' });
            const s = ks.stats();
            expect(s.total).toBeGreaterThan(0);
            expect(s.byType.profile).toBeGreaterThanOrEqual(1);
            ks.remove('stat_test');
        });
    });

    describe('persistence', () => {
        it('saves and reloads from disk', async () => {
            ks.upsert({ refId: 'persist_test', type: 'test', content: 'survives restart' });
            ks.persist();

            // Close and reinit
            ks.close();
            ks._reset();
            await ks.init(tmpDir);

            const doc = ks.findByRef('persist_test');
            expect(doc).not.toBeNull();
            expect(doc.content).toBe('survives restart');
        });
    });
});
