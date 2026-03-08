'use strict';

const { TOOL_DEF, handler } = require('./thankYouEmail');

describe('thank_you_email tool', () => {

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('thank_you_email');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires jobTitle', () => {
            expect(TOOL_DEF.parameters.required).toEqual(['jobTitle']);
        });
    });

    describe('handler', () => {
        test('throws when jobTitle is missing', () => {
            expect(() => handler({})).toThrow('jobTitle is required');
        });

        test('generates thank-you email with job title', () => {
            const result = handler({
                profile: { basic: 'John Doe, john@email.com' },
                jobTitle: 'Software Engineer',
                company: 'Google'
            });

            expect(result.markdown).toContain('Software Engineer');
            expect(result.markdown).toContain('Google');
            expect(result.markdown).toContain('John Doe');
            expect(result.markdown).toContain('Thank you');
            expect(result.markdown).toContain('Subject:');
            expect(result.format).toBe('markdown');
        });

        test('uses interviewer name when provided', () => {
            const result = handler({
                jobTitle: 'Dev',
                interviewerName: 'Ms. Johnson'
            });
            expect(result.markdown).toContain('Dear Ms. Johnson');
        });

        test('references interview notes', () => {
            const result = handler({
                jobTitle: 'Engineer',
                interviewNotes: 'We discussed the microservices architecture. Also talked about team culture and growth opportunities.'
            });
            expect(result.markdown).toContain('microservices architecture');
        });

        test('includes interview date reference', () => {
            const result = handler({
                jobTitle: 'Analyst',
                interviewDate: 'March 5, 2025'
            });
            expect(result.markdown).toContain('March 5, 2025');
        });

        test('handles missing profile gracefully', () => {
            const result = handler({ jobTitle: 'Manager' });
            expect(result.markdown).toContain('[Your Name]');
        });

        test('returns metadata', () => {
            const result = handler({
                jobTitle: 'PM',
                company: 'Meta'
            });
            expect(result.targetJob).toBe('PM');
            expect(result.targetCompany).toBe('Meta');
            expect(result.generatedAt).toBeTruthy();
        });
    });
});
