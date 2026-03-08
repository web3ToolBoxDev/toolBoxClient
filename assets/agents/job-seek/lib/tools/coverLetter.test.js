'use strict';

const { TOOL_DEF, handler } = require('./coverLetter');

describe('cover_letter tool', () => {

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('cover_letter');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires profile and jobTitle', () => {
            expect(TOOL_DEF.parameters.required).toEqual(['profile', 'jobTitle']);
        });
    });

    describe('handler', () => {
        test('throws when profile is missing', () => {
            expect(() => handler({ jobTitle: 'Dev' })).toThrow('profile is required');
        });

        test('throws when jobTitle is missing', () => {
            expect(() => handler({ profile: {} })).toThrow('jobTitle is required');
        });

        test('generates cover letter with name and job title', () => {
            const result = handler({
                profile: {
                    basic: 'Alice Chen, alice@email.com',
                    skills: 'React, TypeScript, Node.js'
                },
                jobTitle: 'Frontend Developer',
                company: 'TechCorp'
            });

            expect(result.markdown).toContain('Alice Chen');
            expect(result.markdown).toContain('Frontend Developer');
            expect(result.markdown).toContain('TechCorp');
            expect(result.markdown).toContain('Dear Hiring Manager');
            expect(result.markdown).toContain('Sincerely');
            expect(result.format).toBe('markdown');
        });

        test('uses hiring manager name when provided', () => {
            const result = handler({
                profile: { basic: 'Bob' },
                jobTitle: 'QA',
                hiringManager: 'Dr. Smith'
            });
            expect(result.markdown).toContain('Dear Dr. Smith');
        });

        test('includes skills in body', () => {
            const result = handler({
                profile: {
                    basic: 'Test',
                    skills: 'Python, Django, PostgreSQL, Docker, AWS'
                },
                jobTitle: 'Backend Engineer'
            });
            expect(result.markdown).toContain('Python');
        });

        test('respects tone setting', () => {
            const enthusiastic = handler({
                profile: { basic: 'Name' },
                jobTitle: 'Dev',
                tone: 'enthusiastic'
            });
            expect(enthusiastic.markdown).toContain('thrilled');
            expect(enthusiastic.tone).toBe('enthusiastic');

            const concise = handler({
                profile: { basic: 'Name' },
                jobTitle: 'Dev',
                tone: 'concise'
            });
            expect(concise.markdown).not.toContain('thrilled');
        });

        test('returns metadata', () => {
            const result = handler({
                profile: { basic: 'Name' },
                jobTitle: 'Engineer',
                company: 'ACME'
            });
            expect(result.targetJob).toBe('Engineer');
            expect(result.targetCompany).toBe('ACME');
            expect(result.generatedAt).toBeTruthy();
        });
    });
});
