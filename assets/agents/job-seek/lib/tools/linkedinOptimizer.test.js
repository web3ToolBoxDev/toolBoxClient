'use strict';

const { TOOL_DEF, handler, generateReport, analyzeHeadline, analyzeSkills, extractKeywords } = require('./linkedinOptimizer');

describe('linkedin_optimizer tool', () => {

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('linkedin_optimizer');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires profile', () => {
            expect(TOOL_DEF.parameters.required).toContain('profile');
        });
    });

    describe('extractKeywords', () => {
        test('extracts meaningful words', () => {
            const kw = extractKeywords('React developer with TypeScript experience');
            expect(kw).toContain('react');
            expect(kw).toContain('developer');
            expect(kw).toContain('typescript');
            expect(kw).toContain('experience');
        });

        test('filters stop words', () => {
            const kw = extractKeywords('the quick brown fox and the dog');
            expect(kw).not.toContain('the');
            expect(kw).not.toContain('and');
        });

        test('deduplicates', () => {
            const kw = extractKeywords('react react react');
            expect(kw.filter(w => w === 'react')).toHaveLength(1);
        });

        test('handles empty input', () => {
            expect(extractKeywords('')).toHaveLength(0);
            expect(extractKeywords(null)).toHaveLength(0);
        });
    });

    describe('analyzeHeadline', () => {
        test('scores 0 for missing headline', () => {
            const result = analyzeHeadline(null, ['dev'], 'react');
            expect(result.score).toBe(0);
            expect(result.suggestions.length).toBeGreaterThan(0);
        });

        test('penalizes short headline', () => {
            const result = analyzeHeadline('Dev', ['developer'], 'react');
            expect(result.issues).toContain('Headline too short');
        });

        test('scores higher with role keywords', () => {
            const withRole = analyzeHeadline('Senior Frontend Developer', ['frontend developer'], 'react');
            const withoutRole = analyzeHeadline('Someone who codes', ['frontend developer'], 'react');
            expect(withRole.score).toBeGreaterThan(withoutRole.score);
        });

        test('rewards skill keywords in headline', () => {
            const result = analyzeHeadline('React and TypeScript Expert', [], 'React, TypeScript');
            expect(result.score).toBeGreaterThan(0);
        });

        test('rewards value proposition words', () => {
            const result = analyzeHeadline('Experienced frontend specialist building great UIs', ['frontend'], 'react');
            expect(result.score).toBeGreaterThan(40);
        });
    });

    describe('analyzeSkills', () => {
        test('calculates coverage percentage', () => {
            const result = analyzeSkills('React, TypeScript, Node.js', ['React developer with TypeScript']);
            expect(result.coverage).toBeGreaterThan(0);
            expect(result.matched.length).toBeGreaterThan(0);
        });

        test('identifies missing skills', () => {
            const result = analyzeSkills('Python', ['React developer with TypeScript and Node.js']);
            expect(result.missing.length).toBeGreaterThan(0);
        });

        test('returns 0 coverage with no target roles', () => {
            const result = analyzeSkills('React', []);
            expect(result.coverage).toBe(0);
        });

        test('suggests adding more skills when few listed', () => {
            const result = analyzeSkills('React', ['dev']);
            expect(result.suggestions.some(s => s.includes('more skills'))).toBe(true);
        });
    });

    describe('generateReport', () => {
        test('generates full report', () => {
            const report = generateReport({
                profile: { skills: 'React, TypeScript', experience: 'Built apps for 5 years' },
                targetRoles: ['Frontend Developer'],
                currentHeadline: 'Experienced React Developer',
                currentSummary: 'I am a frontend developer with expertise in React.'
            });
            expect(report.overallScore).toBeDefined();
            expect(report.rating).toBeDefined();
            expect(report.headline).toBeDefined();
            expect(report.skills).toBeDefined();
            expect(report.summary).toBeDefined();
            expect(report.experience).toBeDefined();
            expect(report.topActions).toBeDefined();
        });

        test('throws without profile', () => {
            expect(() => generateReport({})).toThrow('profile is required');
        });

        test('suggests adding summary when missing', () => {
            const report = generateReport({
                profile: { skills: 'React' },
                currentSummary: ''
            });
            expect(report.summary.suggestions.some(s => s.includes('Add a LinkedIn summary'))).toBe(true);
        });

        test('suggests metrics in experience', () => {
            const report = generateReport({
                profile: { skills: 'React', experience: 'Worked at Acme doing frontend stuff' }
            });
            expect(report.experience.suggestions.some(s => s.includes('quantifiable'))).toBe(true);
        });

        test('rating reflects score', () => {
            const weak = generateReport({ profile: { skills: '' } });
            expect(['weak', 'needs_work']).toContain(weak.rating);
        });
    });

    describe('handler', () => {
        test('returns report', async () => {
            const result = await handler({
                profile: { skills: 'React, Node', experience: 'Dev for 3 years' },
                targetRoles: ['Frontend Dev']
            });
            expect(result.overallScore).toBeDefined();
        });

        test('throws without profile', async () => {
            await expect(handler({})).rejects.toThrow('profile is required');
        });
    });
});
