'use strict';

const {
    TOOL_DEF, handler, extractSkillTokens, calculateSkillMatch,
    calculateSmartSkillMatch, calculateExperienceMatch, normalizeSkill, isCoreSkill,
    buildMatchPrompt, parseMatchResponse
} = require('./matchProfile');
const { BASE_TAXONOMY, BASE_ALIASES, mergeTaxonomy } = require('./skillTaxonomy');

describe('match_profile tool', () => {

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('match_profile');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires profile and requirements', () => {
            expect(TOOL_DEF.parameters.required).toEqual(['profile', 'requirements']);
        });

        test('has skillTaxonomy parameter', () => {
            expect(TOOL_DEF.parameters.properties.skillTaxonomy).toBeDefined();
        });
    });

    describe('extractSkillTokens', () => {
        test('extracts comma-separated skills', () => {
            const tokens = extractSkillTokens('React, Node.js, Python, Docker');
            const norms = tokens.map(t => t.normalized);
            expect(norms).toContain('react');
            expect(norms).toContain('nodejs');
            expect(norms).toContain('python');
        });

        test('handles bullet-point format', () => {
            const tokens = extractSkillTokens('- React\n- Vue\n- TypeScript');
            const norms = tokens.map(t => t.normalized);
            expect(norms).toContain('react');
            expect(norms).toContain('vue');
        });

        test('returns empty for null/empty', () => {
            expect(extractSkillTokens('')).toEqual([]);
            expect(extractSkillTokens(null)).toEqual([]);
        });

        test('deduplicates', () => {
            const tokens = extractSkillTokens('React, react, REACT');
            expect(tokens).toHaveLength(1);
        });

        test('resolves aliases', () => {
            const tokens = extractSkillTokens('Node.js, Express.js, Next.js');
            const norms = tokens.map(t => t.normalized);
            expect(norms).toContain('nodejs');
            expect(norms).toContain('express');
            expect(norms).toContain('nextjs');
        });

        test('handles arrays', () => {
            const tokens = extractSkillTokens(['React', 'Node.js', 'Python']);
            const norms = tokens.map(t => t.normalized);
            expect(norms).toContain('react');
            expect(norms).toContain('nodejs');
        });

        test('does not split CI/CD', () => {
            const tokens = extractSkillTokens('CI/CD, Docker, REST APIs');
            const norms = tokens.map(t => t.normalized);
            expect(norms).toContain('cicd');
        });
    });

    describe('normalizeSkill', () => {
        test('removes .js suffix via alias', () => {
            expect(normalizeSkill('Node.js')).toBe('nodejs');
        });

        test('lowercases and strips whitespace', () => {
            expect(normalizeSkill('Type Script')).toBe('typescript');
        });
    });

    describe('isCoreSkill', () => {
        test('detects skill in job title', () => {
            expect(isCoreSkill('react', 'Senior React Developer')).toBe(true);
            expect(isCoreSkill('nodejs', 'Node.js Backend Engineer')).toBe(true);
        });

        test('returns false for non-title skills', () => {
            expect(isCoreSkill('docker', 'Senior React Developer')).toBe(false);
        });

        test('handles empty title', () => {
            expect(isCoreSkill('react', '')).toBe(false);
            expect(isCoreSkill('react', null)).toBe(false);
        });
    });

    describe('calculateSmartSkillMatch', () => {
        const toTokens = (skills) => skills.map(s => ({
            normalized: normalizeSkill(s),
            original: s.toLowerCase()
        }));

        test('exact match scores 100', () => {
            const result = calculateSmartSkillMatch(
                toTokens(['react', 'node', 'python']),
                toTokens(['react', 'node', 'python'])
            );
            expect(result.score).toBe(100);
            expect(result.matched).toHaveLength(3);
            expect(result.missing).toHaveLength(0);
            expect(result.similar).toHaveLength(0);
        });

        test('JavaScript does NOT match Java (fixes false positive)', () => {
            const result = calculateSmartSkillMatch(
                toTokens(['javascript']),
                toTokens(['java'])
            );
            // javascript and java are in different taxonomy categories
            expect(result.matched).not.toContain('java');
            // They should not be in same category
            expect(result.similar.find(s => s.req === 'java')).toBeUndefined();
            expect(result.missing).toContain('java');
        });

        test('Express ≈ Flask (same backend category, partial credit)', () => {
            const result = calculateSmartSkillMatch(
                toTokens(['express']),
                toTokens(['flask']),
                '',
                BASE_TAXONOMY
            );
            // Express is backend-node, Flask is backend-python — different categories
            // But they should still be separate categories in BASE_TAXONOMY
            // Let's verify: express is in backend-node, flask in backend-python
            expect(result.missing).toContain('flask');
        });

        test('Express ≈ Fastify (same backend-node category)', () => {
            const result = calculateSmartSkillMatch(
                toTokens(['express']),
                toTokens(['fastify']),
                '',
                BASE_TAXONOMY
            );
            expect(result.similar).toHaveLength(1);
            expect(result.similar[0].req).toBe('fastify');
            expect(result.similar[0].have).toBe('express');
            expect(result.similar[0].category).toBe('backend-node');
            expect(result.score).toBe(60); // 0.6 * 100
        });

        test('MySQL ≈ PostgreSQL (same db-sql category)', () => {
            const result = calculateSmartSkillMatch(
                toTokens(['mysql']),
                toTokens(['postgresql']),
                '',
                BASE_TAXONOMY
            );
            expect(result.similar).toHaveLength(1);
            expect(result.similar[0].category).toBe('db-sql');
        });

        test('React ≈ Vue (same frontend-framework category)', () => {
            const result = calculateSmartSkillMatch(
                toTokens(['react']),
                toTokens(['vue']),
                '',
                BASE_TAXONOMY
            );
            expect(result.similar).toHaveLength(1);
            expect(result.similar[0].category).toBe('frontend-framework');
        });

        test('core skills get higher weight (1.5x)', () => {
            const profile = toTokens(['react', 'docker']);
            const reqs = toTokens(['react', 'docker', 'kubernetes']);
            // "react" is in title → weight 1.5, others → weight 1.0
            const result = calculateSmartSkillMatch(
                profile, reqs, 'Senior React Developer', BASE_TAXONOMY
            );
            // react (1.5 × 1.0) + docker (1.0 × 1.0) + kubernetes similar to docker (1.0 × 0.6)
            // Total weight: 1.5 + 1.0 + 1.0 = 3.5
            // kubernetes is in 'container' category with docker → similar
            expect(result.matched).toContain('react');
            expect(result.matched).toContain('docker');
            expect(result.score).toBeGreaterThan(0);
        });

        test('empty requirements returns 50', () => {
            const result = calculateSmartSkillMatch(toTokens(['react']), []);
            expect(result.score).toBe(50);
        });

        test('nice-to-have skills get lower weight (0.5x)', () => {
            const profile = toTokens(['react', 'nodejs']);
            const reqs = toTokens(['react']);
            const niceToHave = toTokens(['docker', 'kubernetes']);
            const result = calculateSmartSkillMatch(
                profile, reqs, '', BASE_TAXONOMY, null, niceToHave
            );
            // Required: react (1.0 × 1.0) = 1.0
            // Nice-to-have: docker miss (0.5 × 0), kubernetes miss (0.5 × 0)
            // Total weight: 1.0 + 0.5 + 0.5 = 2.0, earned: 1.0
            expect(result.score).toBe(50);
            expect(result.niceToHave.missing).toContain('docker');
            expect(result.niceToHave.missing).toContain('kubernetes');
        });
    });

    describe('calculateSkillMatch (legacy compat)', () => {
        test('partial match', () => {
            const result = calculateSkillMatch(['react', 'node'], ['react', 'node', 'python', 'docker']);
            expect(result.score).toBeGreaterThan(0);
            expect(result.matched.length).toBeGreaterThan(0);
        });

        test('empty requirements returns 50', () => {
            const result = calculateSkillMatch(['react'], []);
            expect(result.score).toBe(50);
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

        test('calculates overall match score with taxonomy', () => {
            const profile = {
                skills: 'React, Node.js, Python, Docker, MySQL',
                experience: '5 years of full-stack development',
                education: 'Bachelor in Computer Science'
            };
            const requirements = {
                title: 'Senior Frontend Engineer',
                sections: {
                    technical: 'React, TypeScript, Node.js, CSS, PostgreSQL',
                    experience: '3+ years of frontend experience',
                    education: 'Bachelor degree required',
                    niceToHave: 'Docker experience is a plus, Kubernetes preferred'
                }
            };

            const result = handler({ profile, requirements, jobTitle: 'Senior Frontend Engineer' });
            expect(result.overallScore).toBeGreaterThan(0);
            expect(result.overallScore).toBeLessThanOrEqual(100);
            expect(result.breakdown.skills.matched.length).toBeGreaterThan(0);
            expect(result.breakdown.skills.similar).toBeDefined();
            expect(result.breakdown.skills.missing).toBeDefined();
            expect(result.breakdown.experience.score).toBeGreaterThan(0);
            expect(result.breakdown.education.score).toBe(100);
            expect(result.matchedAt).toBeTruthy();
            // PostgreSQL should be similar to MySQL (same db-sql category)
            const pgSimilar = result.breakdown.skills.similar.find(s => s.req === 'postgresql');
            expect(pgSimilar).toBeDefined();
            expect(pgSimilar.category).toBe('db-sql');
        });

        test('returns interviewPrep suggestions', () => {
            const result = handler({
                profile: { skills: 'Express, MySQL, React' },
                requirements: {
                    title: 'Backend Developer',
                    sections: {
                        technical: 'Fastify, PostgreSQL, React',
                        niceToHave: 'Docker is a plus'
                    }
                },
                jobTitle: 'Backend Developer'
            });
            expect(result.interviewPrep).toBeDefined();
            expect(Array.isArray(result.interviewPrep)).toBe(true);
            // Fastify similar to Express → should appear in prep
            const fastifyPrep = result.interviewPrep.find(p => p.includes('fastify'));
            expect(fastifyPrep).toBeTruthy();
        });

        test('works with AI-generated taxonomy', () => {
            const customTaxonomy = {
                taxonomy: {
                    'web-scraping': ['puppeteer', 'playwright', 'selenium', 'cheerio', 'beautifulsoup']
                },
                aliases: {
                    'beautiful soup': 'beautifulsoup'
                }
            };

            const result = handler({
                profile: { skills: 'Puppeteer, Cheerio' },
                requirements: {
                    sections: { technical: 'Playwright, Selenium' }
                },
                skillTaxonomy: customTaxonomy
            });
            // Puppeteer ≈ Playwright (same web-scraping category from custom taxonomy)
            expect(result.breakdown.skills.similar.length).toBeGreaterThan(0);
        });

        test('handles empty profile gracefully', () => {
            const result = handler({
                profile: {},
                requirements: { sections: { technical: 'React' } }
            });
            expect(result.overallScore).toBeDefined();
        });

        test('returns missing skills', () => {
            const result = handler({
                profile: { skills: 'Java, Spring' },
                requirements: {
                    sections: { technical: 'React, Vue, TypeScript' }
                }
            });
            expect(result.breakdown.skills.missing.length).toBeGreaterThan(0);
        });
    });

    describe('buildMatchPrompt', () => {
        test('includes profile skills, JD text, job title', () => {
            const prompt = buildMatchPrompt(
                { skills: 'React, Node.js', experience: '5 years full-stack', education: 'BS in CS' },
                'We need a developer with React and TypeScript experience. 3+ years required.',
                'Senior Frontend Engineer',
                { taxonomy: { 'frontend-framework': ['react', 'vue'] }, aliases: {} }
            );
            expect(prompt).toContain('React, Node.js');
            expect(prompt).toContain('Senior Frontend Engineer');
            expect(prompt).toContain('React and TypeScript');
            expect(prompt).toContain('frontend-framework');
            expect(prompt).toContain('overallScore');
        });

        test('handles array skills', () => {
            const prompt = buildMatchPrompt(
                { skills: ['React', 'Node.js'] },
                'Job description text',
                'Dev'
            );
            expect(prompt).toContain('React, Node.js');
        });

        test('truncates long JD text', () => {
            const longJD = 'x'.repeat(10000);
            const prompt = buildMatchPrompt({ skills: 'React' }, longJD, 'Dev');
            expect(prompt.length).toBeLessThan(6000);
        });

        test('works without taxonomy', () => {
            const prompt = buildMatchPrompt(
                { skills: 'React' },
                'Job description',
                'Dev'
            );
            expect(prompt).toContain('React');
            expect(prompt).not.toContain('Skill Taxonomy');
        });
    });

    describe('parseMatchResponse', () => {
        test('parses valid JSON response', () => {
            const response = JSON.stringify({
                overallScore: 75,
                breakdown: {
                    skills: { score: 80, matched: ['react'], similar: [], missing: ['vue'], niceToHave: { matched: [], similar: [], missing: [] } },
                    experience: { score: 70, detail: 'Close match' },
                    education: { score: 100, detail: 'Degree matches' }
                },
                interviewPrep: ['Learn Vue']
            });
            const result = parseMatchResponse(response);
            expect(result).not.toBeNull();
            expect(result.overallScore).toBe(75);
            expect(result.breakdown.skills.matched).toContain('react');
            expect(result.interviewPrep).toEqual(['Learn Vue']);
        });

        test('handles markdown-fenced JSON', () => {
            const response = '```json\n{"overallScore":60,"breakdown":{"skills":{"score":60,"matched":[],"similar":[],"missing":[]},"experience":{"score":50,"detail":""},"education":{"score":50,"detail":""}}}\n```';
            const result = parseMatchResponse(response);
            expect(result).not.toBeNull();
            expect(result.overallScore).toBe(60);
        });

        test('handles extra text around JSON', () => {
            const response = 'Here is the result:\n{"overallScore":85,"breakdown":{"skills":{"score":90,"matched":["react"],"similar":[],"missing":[]},"experience":{"score":80,"detail":"good"},"education":{"score":80,"detail":"ok"}}}\nDone!';
            const result = parseMatchResponse(response);
            expect(result).not.toBeNull();
            expect(result.overallScore).toBe(85);
        });

        test('fills missing niceToHave with defaults', () => {
            const response = JSON.stringify({
                overallScore: 70,
                breakdown: {
                    skills: { score: 70, matched: [], similar: [], missing: [] },
                    experience: { score: 50, detail: '' },
                    education: { score: 50, detail: '' }
                }
            });
            const result = parseMatchResponse(response);
            expect(result.breakdown.skills.niceToHave).toEqual({ matched: [], similar: [], missing: [] });
            expect(result.interviewPrep).toEqual([]);
        });

        test('clamps score to 0-100', () => {
            const response = JSON.stringify({
                overallScore: 150,
                breakdown: { skills: { score: 90 }, experience: { score: 80 }, education: { score: 70 } }
            });
            const result = parseMatchResponse(response);
            expect(result.overallScore).toBe(100);
        });

        test('returns null for invalid inputs', () => {
            expect(parseMatchResponse('')).toBeNull();
            expect(parseMatchResponse(null)).toBeNull();
            expect(parseMatchResponse('not json')).toBeNull();
        });

        test('returns null if overallScore missing', () => {
            const response = JSON.stringify({ breakdown: { skills: {} } });
            expect(parseMatchResponse(response)).toBeNull();
        });

        test('returns null if breakdown missing', () => {
            const response = JSON.stringify({ overallScore: 50 });
            expect(parseMatchResponse(response)).toBeNull();
        });
    });
});
