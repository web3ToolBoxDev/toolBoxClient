'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('memoryRelations', () => {
    let knowledgeStore;
    let memoryRelations;
    let tmpDir;

    beforeAll(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-test-'));
        knowledgeStore = require('./knowledgeStore');
        knowledgeStore._reset();
        await knowledgeStore.init(tmpDir);
        memoryRelations = require('./memoryRelations');
        // memoryRelations.init() is called inside knowledgeStore.init()
    });

    afterAll(() => {
        knowledgeStore.close();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    });

    describe('Relations', () => {
        test('addRelation creates a new relation', () => {
            const id = memoryRelations.addRelation('user_1', 'HAS_SKILL', 'skill_react');
            expect(id).toBeGreaterThan(0);
        });

        test('addRelation deduplicates identical relations', () => {
            const id1 = memoryRelations.addRelation('user_2', 'HAS_SKILL', 'skill_vue');
            const id2 = memoryRelations.addRelation('user_2', 'HAS_SKILL', 'skill_vue');
            expect(id1).toBe(id2);
        });

        test('findRelationsFrom returns outgoing relations', () => {
            memoryRelations.addRelation('user_3', 'HAS_SKILL', 'skill_ts');
            memoryRelations.addRelation('user_3', 'HAS_EXPERIENCE', 'exp_acme');
            const rels = memoryRelations.findRelationsFrom('user_3');
            expect(rels.length).toBeGreaterThanOrEqual(2);
        });

        test('findRelationsFrom filters by relation type', () => {
            memoryRelations.addRelation('user_4', 'HAS_SKILL', 'skill_py');
            memoryRelations.addRelation('user_4', 'APPLIED_TO', 'job_1');
            const skills = memoryRelations.findRelationsFrom('user_4', 'HAS_SKILL');
            expect(skills.every(r => r.relation === 'HAS_SKILL')).toBe(true);
        });

        test('findRelationsTo returns incoming relations', () => {
            memoryRelations.addRelation('job_listing_1', 'REQUIRES_SKILL', 'skill_react');
            const rels = memoryRelations.findRelationsTo('skill_react');
            expect(rels.length).toBeGreaterThanOrEqual(1);
        });

        test('findByRelation returns all of one type', () => {
            memoryRelations.addRelation('x1', 'LIKES', 'y1');
            memoryRelations.addRelation('x2', 'LIKES', 'y2');
            const rels = memoryRelations.findByRelation('LIKES');
            expect(rels.length).toBeGreaterThanOrEqual(2);
        });

        test('removeRelation removes by ID', () => {
            const id = memoryRelations.addRelation('rm_from', 'TEST', 'rm_to');
            memoryRelations.removeRelation(id);
            const rels = memoryRelations.findRelationsFrom('rm_from', 'TEST');
            expect(rels).toHaveLength(0);
        });

        test('removeRelationsFor removes all involving refId', () => {
            memoryRelations.addRelation('cleanup_1', 'A', 'other');
            memoryRelations.addRelation('other2', 'B', 'cleanup_1');
            const removed = memoryRelations.removeRelationsFor('cleanup_1');
            expect(removed).toBeGreaterThanOrEqual(2);
        });

        test('addRelation stores metadata', () => {
            memoryRelations.addRelation('meta_from', 'META_REL', 'meta_to', { score: 95 });
            const rels = memoryRelations.findRelationsFrom('meta_from', 'META_REL');
            expect(rels[0].metadata).toEqual({ score: 95 });
        });

        test('throws without required fields', () => {
            expect(() => memoryRelations.addRelation('', 'REL', 'to')).toThrow();
            expect(() => memoryRelations.addRelation('from', '', 'to')).toThrow();
        });
    });

    describe('Events', () => {
        test('logEvent creates an event', () => {
            const id = memoryRelations.logEvent('profile_updated', { refId: 'doc_1', actorId: 'agent:job-seek' });
            expect(id).toBeGreaterThan(0);
        });

        test('getEvents returns events for refId', () => {
            memoryRelations.logEvent('test_event', { refId: 'evt_doc' });
            const events = memoryRelations.getEvents('evt_doc');
            expect(events.length).toBeGreaterThanOrEqual(1);
            expect(events[0].eventType).toBe('test_event');
        });

        test('getEventsByType returns events by type', () => {
            memoryRelations.logEvent('status_changed', { detail: 'discovered -> matched' });
            const events = memoryRelations.getEventsByType('status_changed');
            expect(events.length).toBeGreaterThanOrEqual(1);
        });

        test('getEventsByActor returns events by actor', () => {
            memoryRelations.logEvent('search_run', { actorId: 'agent:scheduler' });
            const events = memoryRelations.getEventsByActor('agent:scheduler');
            expect(events.length).toBeGreaterThanOrEqual(1);
        });

        test('logEvent stores metadata', () => {
            memoryRelations.logEvent('match_score', { refId: 'score_doc', metadata: { score: 85 } });
            const events = memoryRelations.getEvents('score_doc');
            expect(events[0].metadata).toEqual({ score: 85 });
        });

        test('throws without eventType', () => {
            expect(() => memoryRelations.logEvent('')).toThrow('eventType is required');
        });
    });
});
