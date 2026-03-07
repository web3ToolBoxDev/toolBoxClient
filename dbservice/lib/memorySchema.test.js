'use strict';

const schema = require('./memorySchema');

// Register job-seek domain pack for tests (simulates what the agent does at startup)
const jobSeekPack = {
    profile:      { durability: 'durable',  conflictPolicy: 'replace', description: 'User career profile section', subTypes: ['basic', 'skills', 'experience', 'education'] },
    direction:    { durability: 'durable',  conflictPolicy: 'replace', description: 'Job search direction', subTypes: ['target'] },
    job_listing:  { durability: 'durable',  conflictPolicy: 'replace', description: 'Scraped job posting', subTypes: [] },
    match_result: { durability: 'session',  conflictPolicy: 'replace', description: 'Job match score', subTypes: [] }
};
schema.registerDomainPack('job-seek', { types: jobSeekPack });

describe('memorySchema', () => {
    describe('getAllTypes', () => {
        it('includes core generic types', () => {
            const types = schema.getAllTypes();
            expect(types.identity).toBeDefined();
            expect(types.preference).toBeDefined();
            expect(types.goal).toBeDefined();
            expect(types.constraint).toBeDefined();
            expect(types.knowledge).toBeDefined();
            expect(types.task_state).toBeDefined();
            expect(types.decision).toBeDefined();
            expect(types.ephemeral).toBeDefined();
        });

        it('does not include domain-pack types by default (must be registered)', () => {
            // After registration they exist — this tests that registerDomainPack worked
            const types = schema.getAllTypes();
            expect(types.profile).toBeDefined();
            expect(types.direction).toBeDefined();
            expect(types.job_listing).toBeDefined();
            expect(types.match_result).toBeDefined();
        });

        it('each type has durability and conflictPolicy', () => {
            const types = schema.getAllTypes();
            for (const [key, def] of Object.entries(types)) {
                expect(def.durability).toBeDefined();
                expect(def.conflictPolicy).toBeDefined();
                expect(def.description).toBeDefined();
            }
        });
    });

    describe('getTypeDef', () => {
        it('returns definition for registered domain type', () => {
            const def = schema.getTypeDef('profile');
            expect(def.durability).toBe('durable');
            expect(def.conflictPolicy).toBe('replace');
            expect(def.subTypes).toContain('skills');
        });

        it('returns null for unknown type', () => {
            expect(schema.getTypeDef('nonexistent')).toBeNull();
        });
    });

    describe('validateDoc', () => {
        it('passes for valid document', () => {
            const result = schema.validateDoc({ type: 'profile', subType: 'skills', content: 'React, Vue' });
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('fails when type is missing', () => {
            const result = schema.validateDoc({ content: 'test' });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('type is required');
        });

        it('fails for unknown type', () => {
            const result = schema.validateDoc({ type: 'bogus', content: 'test' });
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('unknown type');
        });

        it('fails when content is missing', () => {
            const result = schema.validateDoc({ type: 'profile' });
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('content is required');
        });

        it('fails for invalid subType', () => {
            const result = schema.validateDoc({ type: 'profile', subType: 'hobbies', content: 'test' });
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('invalid subType');
        });

        it('passes for valid subType', () => {
            const result = schema.validateDoc({ type: 'profile', subType: 'education', content: 'MIT' });
            expect(result.valid).toBe(true);
        });

        it('passes when type has no subType restrictions', () => {
            const result = schema.validateDoc({ type: 'goal', subType: 'anything', content: 'test' });
            expect(result.valid).toBe(true);
        });

        it('fails for invalid writeClass', () => {
            const result = schema.validateDoc({ type: 'profile', content: 'test', writeClass: 'bad' });
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('invalid writeClass');
        });

        it('passes for valid writeClass', () => {
            const result = schema.validateDoc({ type: 'profile', content: 'test', writeClass: 'candidate' });
            expect(result.valid).toBe(true);
        });

        it('fails for confidence out of range', () => {
            const result = schema.validateDoc({ type: 'profile', content: 'test', confidence: 1.5 });
            expect(result.valid).toBe(false);
        });
    });

    describe('conflict policies', () => {
        it('replace returns new content', () => {
            expect(schema.resolveConflict('replace', 'old', 'new')).toBe('new');
        });

        it('append joins with newline', () => {
            expect(schema.resolveConflict('append', 'line1', 'line2')).toBe('line1\nline2');
        });

        it('append_set deduplicates', () => {
            const result = schema.resolveConflict('append_set', 'React, Vue', 'Vue, Angular');
            expect(result).toContain('React');
            expect(result).toContain('Vue');
            expect(result).toContain('Angular');
            // Vue should appear only once
            expect(result.split('Vue').length - 1).toBe(1);
        });

        it('temporal_replace uses newer doc', () => {
            const result = schema.resolveConflict('temporal_replace', 'old', 'new',
                { updatedAt: 100 }, { updatedAt: 200 });
            expect(result).toBe('new');
        });

        it('temporal_replace keeps old when older', () => {
            const result = schema.resolveConflict('temporal_replace', 'old', 'new',
                { updatedAt: 200 }, { updatedAt: 100 });
            expect(result).toBe('old');
        });

        it('merge_object merges JSON', () => {
            const result = schema.resolveConflict('merge_object',
                JSON.stringify({ a: 1 }), JSON.stringify({ b: 2 }));
            expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
        });

        it('unknown policy defaults to new content', () => {
            expect(schema.resolveConflict('nonexistent', 'old', 'new')).toBe('new');
        });
    });

    describe('registerDomainPack', () => {
        it('registers custom types', () => {
            schema.registerDomainPack('test-agent', {
                types: {
                    custom_type: { durability: 'session', conflictPolicy: 'replace', description: 'Test' }
                }
            });
            const def = schema.getTypeDef('custom_type');
            expect(def).not.toBeNull();
            expect(def.durability).toBe('session');
        });
    });
});
