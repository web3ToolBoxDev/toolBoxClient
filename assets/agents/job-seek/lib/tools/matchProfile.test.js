'use strict';

const { TOOL_DEF, handler, extractSkillTokens, calculateSkillMatch, calculateExperienceMatch, normalizeSkill } = require('./matchProfile');

describe('match_profile tool', () => {

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('match_profile');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires profile and requirements', () => {
            expect(TOOL_DEF.parameters.required).toEqual(['profile', 'requirements']);
        });
    });

    describe('extractSkillTokens', () => {
        test('extracts comma-separated skills', () => {
            const tokens = extractSkillTokens('React, Node.js, Python, Docker');
            expect(tokens).toContain('react');
            expect(tokens).toContain('node.js');
            expect(tokens).toContain('python');
        });

        test('handles bullet-point format', () => {
            const tokens = extractSkillTokens('- React\n- Vue\n- TypeScript');
            expect(tokens).toContain('react');
            expect(tokens).toContain('vue');
        });

        test('returns empty for null/empty', () => {
            expect(extractSkillTokens('')).toEqual([]);
            expect(extractSkillTokens(null)).toEqual([]);
        });

        test('deduplicates', () => {
            const tokens = extractSkillTokens('React, react, REACT');
            expect(tokens).toHaveLength(1);
        });
    });

    describe('normalizeSkill', () => {
        test('removes .js suffix', () => {
            expect(normalizeSkill('Node.js')).toBe('node');
        });

        test('lowercases and strips whitespace', () => {
            expect(normalizeSkill('Type Script')).toBe('typescript');
        });
    });

    describe('calculateSkillMatch', () => {
        test('perfect match', () => {
            const result = calculateSkillMatch(['react', 'node', 'python'], ['react', 'node', 'python']);
            expect(result.score).toBe(100);
            expect(result.matched).toHaveLength(3);
            expect(result.missing).toHaveLength(0);
        });

        test('partial match', () => {
            const result = calculateSkillMatch(['react', 'node'], ['react', 'node', 'python', 'docker']);
            expect(result.score).toBe(50);
            expect(result.matched).toEqual(['react', 'node']);
            expect(result.missing).toEqual(['python', 'docker']);
        });

        test('no match', () => {
            const result = calculateSkillMatch(['java', 'spring'], ['react', 'node']);
            expect(result.score).toBe(0);
            expect(result.missing).toEqual(['react', 'node']);
        });

        test('empty requirements returns 50', () => {
            const result = calculateSkillMatch(['react'], []);
            expect(result.score).toBe(50);
        });

        test('substring matching works', () => {
            const result = calculateSkillMatch(['javascript'], ['java']);
            expect(result.score).toBe(100);
            expect(result.matched).toContain('java');
        });
    });

    describe('calculateExperienceMatch', () => {
        test('sufficient experience', () => {
            const result = calculateExperienceMatch('8 years of development experience', '5+ years required');
            expect(result.score).toBe(100);
        });

        test('close to requirement', () => {
            const result = calculateExperienceMatch('4 years experience', '5 years required');
            expect(result.score).toBe(70);
        });

        test('insufficient experience', () => {
            const result = calculateExperienceMatch('2 years experience', '5 years required');
            expect(result.score).toBe(40);
        });

        test('no requirement specified', () => {
            const result = calculateExperienceMatch('5 years', '');
            expect(result.score).toBe(50);
        });
    });

    describe('handler', () => {
        test('throws when profile is missing', () => {
            expect(() => handler({ requirements: {} })).toThrow('profile is required');
        });

        test('throws when requirements is missing', () => {
            expect(() => handler({ profile: {} })).toThrow('requirements is required');
        });

        test('calculates overall match score', () => {
            const profile = {
                skills: 'React, Node.js, Python, Docker',
                experience: '5 years of full-stack development',
                education: 'Bachelor in Computer Science'
            };
            const requirements = {
                title: 'Senior Frontend Engineer',
                sections: {
                    technical: 'React, TypeScript, Node.js, CSS',
                    experience: '3+ years of frontend experience',
                    education: 'Bachelor degree required'
                }
            };

            const result = handler({ profile, requirements, jobTitle: 'Senior Frontend Engineer' });
            expect(result.overallScore).toBeGreaterThan(0);
            expect(result.overallScore).toBeLessThanOrEqual(100);
            expect(result.breakdown.skills.matched.length).toBeGreaterThan(0);
            expect(result.breakdown.experience.score).toBeGreaterThan(0);
            expect(result.breakdown.education.score).toBe(100);
            expect(result.matchedAt).toBeTruthy();
        });

        test('returns missing skills', () => {
            const result = handler({
                profile: { skills: 'Java, Spring' },
                requirements: {
                    sections: { technical: 'React, Vue, TypeScript' }
                }
            });
            expect(result.breakdown.skills.missing.length).toBe(3);
            expect(result.breakdown.skills.score).toBe(0);
        });

        test('handles empty profile gracefully', () => {
            const result = handler({
                profile: {},
                requirements: { sections: { technical: 'React' } }
            });
            expect(result.overallScore).toBeDefined();
        });
    });
});
