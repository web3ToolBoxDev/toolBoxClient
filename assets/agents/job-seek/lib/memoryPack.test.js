'use strict';

const { domain, types } = require('./memoryPack');

describe('memoryPack', () => {
    test('domain is job-seek', () => {
        expect(domain).toBe('job-seek');
    });

    test('has all 10 required types', () => {
        const expected = [
            'profile', 'direction', 'job_listing', 'match_result',
            'job_requirement', 'application_record', 'resume_variant',
            'outreach_message', 'company_info', 'tailored_profile'
        ];
        expect(Object.keys(types).sort()).toEqual(expected.sort());
    });

    test('all types have durability, conflictPolicy, description', () => {
        for (const [name, def] of Object.entries(types)) {
            expect(def).toHaveProperty('durability');
            expect(def).toHaveProperty('conflictPolicy');
            expect(def).toHaveProperty('description');
            expect(['durable', 'session']).toContain(def.durability);
            expect(['replace', 'merge', 'append']).toContain(def.conflictPolicy);
            expect(typeof def.description).toBe('string');
        }
    });

    test('profile has correct subTypes', () => {
        expect(types.profile.subTypes).toEqual(['basic', 'skills', 'experience', 'education', 'highlights', 'certifications', 'projects', 'publications', 'languages', 'volunteering', 'summary_templates']);
    });

    test('job_requirement has structured subTypes', () => {
        expect(types.job_requirement.subTypes).toEqual(['technical', 'experience', 'education', 'soft_skills']);
    });

    test('application_record has status subTypes', () => {
        expect(types.application_record.subTypes).toEqual(['submitted', 'in_review', 'interview', 'offer', 'rejected']);
    });

    test('outreach_message has message subTypes', () => {
        expect(types.outreach_message.subTypes).toEqual(['cover_letter', 'thank_you', 'follow_up']);
    });

    test('session-scoped types are match_result, outreach_message, and tailored_profile', () => {
        const sessionTypes = Object.entries(types)
            .filter(([_, def]) => def.durability === 'session')
            .map(([name]) => name)
            .sort();
        expect(sessionTypes).toEqual(['match_result', 'outreach_message', 'tailored_profile']);
    });

    test('durable types persist across sessions', () => {
        const durableTypes = Object.entries(types)
            .filter(([_, def]) => def.durability === 'durable')
            .map(([name]) => name)
            .sort();
        expect(durableTypes).toEqual([
            'application_record', 'company_info', 'direction', 'job_listing',
            'job_requirement', 'profile', 'resume_variant'
        ]);
    });
});
