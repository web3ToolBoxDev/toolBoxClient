'use strict';

const { TOOL_DEF, handler, formatMultiLine } = require('./resumeGen');

describe('tailor_resume tool', () => {

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('tailor_resume');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires profile', () => {
            expect(TOOL_DEF.parameters.required).toEqual(['profile']);
        });
    });

    describe('formatMultiLine', () => {
        test('preserves existing bullet points', () => {
            const result = formatMultiLine('- Item A\n- Item B');
            expect(result).toContain('- Item A');
            expect(result).toContain('- Item B');
        });

        test('adds bullet points to plain lines', () => {
            const result = formatMultiLine('Line A\nLine B');
            expect(result).toContain('- Line A');
            expect(result).toContain('- Line B');
        });

        test('handles empty string', () => {
            expect(formatMultiLine('')).toBe('');
        });

        test('returns single line as-is', () => {
            expect(formatMultiLine('Single line')).toBe('Single line');
        });
    });

    describe('handler', () => {
        test('throws when profile is missing', () => {
            expect(() => handler({})).toThrow('profile is required');
        });

        test('generates basic resume markdown', () => {
            const result = handler({
                profile: {
                    basic: 'John Doe, Toronto, john@email.com',
                    skills: 'React, Node.js, Python',
                    experience: 'Software Engineer at TechCo (2020-2024)\nBuilt web applications',
                    education: 'Bachelor in CS, University of Toronto'
                },
                jobTitle: 'Senior Frontend Engineer'
            });

            expect(result.markdown).toContain('# John Doe');
            expect(result.markdown).toContain('Senior Frontend Engineer');
            expect(result.markdown).toContain('## Skills');
            expect(result.markdown).toContain('React');
            expect(result.markdown).toContain('## Experience');
            expect(result.markdown).toContain('## Education');
            expect(result.format).toBe('markdown');
            expect(result.generatedAt).toBeTruthy();
        });

        test('emphasizes matched skills in bold', () => {
            const result = handler({
                profile: {
                    basic: 'Jane',
                    skills: 'React, Vue, Docker, Python'
                },
                matchResult: {
                    breakdown: {
                        skills: {
                            matched: ['react', 'docker'],
                            missing: ['typescript']
                        }
                    }
                }
            });

            expect(result.markdown).toContain('**React**');
            expect(result.markdown).toContain('**Docker**');
            expect(result.markdown).not.toContain('**Vue**');
        });

        test('includes highlights as summary', () => {
            const result = handler({
                profile: {
                    basic: 'Test User',
                    highlights: 'Award-winning developer with 10 years experience'
                }
            });
            expect(result.markdown).toContain('## Summary');
            expect(result.markdown).toContain('Award-winning');
        });

        test('auto-generates summary when no highlights', () => {
            const result = handler({
                profile: {
                    basic: 'User',
                    skills: 'Java, Spring, MySQL'
                },
                jobTitle: 'Backend Developer'
            });
            expect(result.markdown).toContain('## Summary');
            expect(result.markdown).toContain('Backend Developer');
        });

        test('includes contact info from basic', () => {
            const result = handler({
                profile: {
                    basic: 'Alice, alice@email.com, 555-1234'
                }
            });
            expect(result.markdown).toContain('alice@email.com');
            expect(result.markdown).toContain('555-1234');
        });

        test('returns targetJob and targetCompany', () => {
            const result = handler({
                profile: { basic: 'User' },
                jobTitle: 'SRE',
                company: 'Google'
            });
            expect(result.targetJob).toBe('SRE');
            expect(result.targetCompany).toBe('Google');
        });
    });
});
