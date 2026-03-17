'use strict';

/**
 * Unit tests for searchPipeline — the dashboard-driven automated job search engine.
 */

// Mock all domain tool handlers
jest.mock('./tools/jobSearch', () => ({
    handler: jest.fn()
}));
jest.mock('./tools/parseListing', () => ({
    handler: jest.fn(),
    extractRequirements: jest.fn()
}));
jest.mock('./tools/matchProfile', () => ({
    handler: jest.fn(),
    buildMatchPrompt: jest.fn(() => 'mock match prompt'),
    parseMatchResponse: jest.fn(() => ({ overallScore: 75, breakdown: {}, interviewPrep: [] }))
}));
jest.mock('./tools/resumeGen', () => ({
    handler: jest.fn()
}));
jest.mock('./tools/coverLetter', () => ({
    handler: jest.fn()
}));
jest.mock('./tools/mockInterview', () => ({
    handler: jest.fn()
}));
jest.mock('./dashboardServer', () => ({
    upsertJobCard: jest.fn(),
    updateJobStatus: jest.fn(),
    updatePlatformCell: jest.fn(),
    updatePipelineProgress: jest.fn(),
    getJobCards: jest.fn(() => [])
}));

// Mock platform infrastructure for pipeline execution
const mockPlatformList = [];
jest.mock('./workflow/platformStore', () => ({
    getPlatforms: jest.fn(() => mockPlatformList),
    getPlatform: jest.fn((sid, pid) => mockPlatformList.find(p => p.id === pid) || null)
}));
jest.mock('./workflow/platformService', () => ({
    adoptSharedBrowser: jest.fn().mockResolvedValue({ success: true, pageIndex: 0 }),
    verifyLogin: jest.fn().mockResolvedValue({ success: true, status: 'logged_in' }),
    launchLogin: jest.fn().mockResolvedValue({ success: true, browserId: 'br_mock' })
}));
const mockExecuteSearch = jest.fn();
jest.mock('./workflow/scriptBuilder', () => ({
    executeSearchScript: mockExecuteSearch
}));

const { handler: jobSearchHandler } = require('./tools/jobSearch');
const { handler: parseListingHandler } = require('./tools/parseListing');
const { handler: matchProfileHandler } = require('./tools/matchProfile');
const { handler: resumeGenHandler } = require('./tools/resumeGen');
const { handler: coverLetterHandler } = require('./tools/coverLetter');
const dashboardServer = require('./dashboardServer');
const pipeline = require('./searchPipeline');

const PROFILE = {
    basic: 'John Doe',
    skills: 'React, Node, TypeScript',
    experience: 'ACME Corp, 2020-2024',
    education: 'CS, MIT, 2019'
};

const DIRECTION = {
    q_job_title: 'Frontend Engineer',
    q_location: 'Toronto'
};

describe('searchPipeline', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ─── buildSearchQueries ───
    describe('buildSearchQueries', () => {
        it('returns empty for missing job title', () => {
            const queries = pipeline.buildSearchQueries({}, PROFILE);
            expect(queries).toEqual([]);
        });

        it('generates primary query from job title', () => {
            const queries = pipeline.buildSearchQueries({ q_job_title: 'Dev' }, PROFILE);
            expect(queries.length).toBeGreaterThanOrEqual(1);
            expect(queries[0].query).toBe('Dev');
            expect(queries[0].source).toBe('indeed');
        });

        it('generates skill-augmented query', () => {
            const queries = pipeline.buildSearchQueries(DIRECTION, PROFILE);
            const skillQuery = queries.find(q => q.query.includes('React'));
            expect(skillQuery).toBeDefined();
        });

        it('generates remote query when location set', () => {
            const queries = pipeline.buildSearchQueries(DIRECTION, PROFILE);
            const remoteQuery = queries.find(q => q.location === '');
            expect(remoteQuery).toBeDefined();
        });

        it('skips remote query when no location', () => {
            const queries = pipeline.buildSearchQueries({ q_job_title: 'Dev' }, PROFILE);
            // All queries should have empty location (since no location set)
            const withLocation = queries.filter(q => q.location !== '');
            expect(withLocation).toHaveLength(0);
        });

        it('supports jobTitle alias', () => {
            const queries = pipeline.buildSearchQueries({ jobTitle: 'QA' }, PROFILE);
            expect(queries[0].query).toBe('QA');
        });

        it('rotates skill in augmented query based on totalRuns', () => {
            const prof = { skills: 'React, Node, TypeScript' };
            const dir = { q_job_title: 'Dev', q_location: 'Toronto' };

            const run0 = pipeline.buildSearchQueries(dir, prof, { totalRuns: 0 });
            const run1 = pipeline.buildSearchQueries(dir, prof, { totalRuns: 1 });
            const run2 = pipeline.buildSearchQueries(dir, prof, { totalRuns: 2 });
            const run3 = pipeline.buildSearchQueries(dir, prof, { totalRuns: 3 });

            const skillQ0 = run0.find(q => q.query.includes('React'));
            const skillQ1 = run1.find(q => q.query.includes('Node'));
            const skillQ2 = run2.find(q => q.query.includes('TypeScript'));
            const skillQ3 = run3.find(q => q.query.includes('React')); // wraps around

            expect(skillQ0).toBeDefined();
            expect(skillQ1).toBeDefined();
            expect(skillQ2).toBeDefined();
            expect(skillQ3).toBeDefined();
        });

        it('attaches pageOffset from history', () => {
            const dir = { q_job_title: 'Dev', q_location: 'Toronto' };
            const pageOffsets = { 'indeed|Dev|Toronto': 3 };
            const queries = pipeline.buildSearchQueries(dir, PROFILE, { pageOffsets });
            const indeedPrimary = queries.find(q => q.source === 'indeed' && q.query === 'Dev');
            expect(indeedPrimary.pageOffset).toBe(3);
        });
    });

    // ─── startPipeline ───
    describe('startPipeline', () => {
        it('returns running state with config', () => {
            jobSearchHandler.mockResolvedValue({ listings: [] });
            const result = pipeline.startPipeline('start-test-1', { minScore: 70, targetCount: 5 }, DIRECTION, PROFILE);
            expect(result.running).toBe(true);
            expect(result.config.minScore).toBe(70);
            expect(result.config.targetCount).toBe(5);
        });

        it('prevents duplicate pipeline runs', () => {
            jobSearchHandler.mockResolvedValue(new Promise(() => {})); // Never resolves
            pipeline.startPipeline('dup-test-1', { aiMatcher: jest.fn() }, DIRECTION, PROFILE);
            const dup = pipeline.startPipeline('dup-test-1', { aiMatcher: jest.fn() }, DIRECTION, PROFILE);
            expect(dup.error).toMatch(/already running/i);
        });

        it('uses default config values', () => {
            jobSearchHandler.mockResolvedValue({ listings: [] });
            const result = pipeline.startPipeline('default-cfg-1', {}, DIRECTION, PROFILE);
            expect(result.config.minScore).toBe(60);
            expect(result.config.targetCount).toBe(10);
            expect(result.config.maxResults).toBe(30);
        });
    });

    // ─── getPipelineStatus ───
    describe('getPipelineStatus', () => {
        it('returns null progress for unknown session', () => {
            const status = pipeline.getPipelineStatus('unknown-session');
            expect(status.running).toBe(false);
            expect(status.progress).toBeNull();
        });

        it('returns progress for active session', () => {
            jobSearchHandler.mockResolvedValue(new Promise(() => {}));
            pipeline.startPipeline('status-test-1', { aiMatcher: jest.fn() }, DIRECTION, PROFILE);
            const status = pipeline.getPipelineStatus('status-test-1');
            expect(status.running).toBe(true);
            expect(status.progress).toBeDefined();
            expect(status.progress.phase).toBe('searching');
        });
    });

    // ─── stopPipeline ───
    describe('stopPipeline', () => {
        it('returns error for unknown session', () => {
            const result = pipeline.stopPipeline('no-such-session');
            expect(result.error).toMatch(/no pipeline/i);
        });

        it('stops a running pipeline', () => {
            jobSearchHandler.mockResolvedValue(new Promise(() => {}));
            pipeline.startPipeline('stop-test-1', { aiMatcher: jest.fn() }, DIRECTION, PROFILE);
            const result = pipeline.stopPipeline('stop-test-1');
            expect(result.stopped).toBe(true);
        });
    });

    // ─── _runPipeline (integration via startPipeline) ───
    describe('pipeline execution', () => {
        // Set up mock platforms with ready search tools so the pipeline can run
        beforeEach(() => {
            mockPlatformList.length = 0;
            mockPlatformList.push(
                { id: 'plat_indeed', name: 'Indeed', url: 'https://ca.indeed.com/jobs', tools: { search: { status: 'ready', script: 'test' } }, _browserId: 'br_mock', _pageIndex: 0 },
                { id: 'plat_linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com/jobs', tools: { search: { status: 'ready', script: 'test' } }, _browserId: 'br_mock', _pageIndex: 1 },
                { id: 'plat_jobbank', name: 'Job Bank', url: 'https://www.jobbank.gc.ca/jobsearch', tools: { search: { status: 'ready', script: 'test' } }, _browserId: 'br_mock', _pageIndex: 2 }
            );
            mockExecuteSearch.mockReset();
        });

        afterEach(() => {
            mockPlatformList.length = 0;
        });

        it('records matched jobs to dashboard', async () => {
            mockExecuteSearch.mockResolvedValue({
                success: true,
                jobs: [
                    { url: 'https://j.com/1', title: 'Dev', company: 'Acme', fullText: 'Full stack developer needed' },
                    { url: 'https://j.com/2', title: 'SWE', company: 'BigCo', fullText: 'Software engineer position' }
                ]
            });
            matchProfileHandler.mockReturnValue({ overallScore: 75 });

            pipeline.startPipeline('exec-test-1', { minScore: 50, targetCount: 5, aiMatcher: matchProfileHandler }, DIRECTION, PROFILE);
            // Wait for async pipeline
            await new Promise(r => setTimeout(r, 500));

            expect(dashboardServer.upsertJobCard).toHaveBeenCalledWith('exec-test-1',
                expect.objectContaining({ url: 'https://j.com/1', status: 'matched' })
            );
        });

        it('deduplicates listings by URL', async () => {
            mockExecuteSearch.mockResolvedValue({
                success: true,
                jobs: [
                    { url: 'https://dup.com/1', title: 'Dev', fullText: 'Developer role' },
                    { url: 'https://dup.com/1', title: 'Dev duplicate', fullText: 'Developer role' }
                ]
            });
            matchProfileHandler.mockReturnValue({ overallScore: 80 });

            pipeline.startPipeline('dedup-test-1', { minScore: 50, aiMatcher: matchProfileHandler }, DIRECTION, PROFILE);
            await new Promise(r => setTimeout(r, 500));

            const matchedCalls = dashboardServer.upsertJobCard.mock.calls
                .filter(c => c[1]?.url === 'https://dup.com/1' && c[1]?.status === 'matched');
            expect(matchedCalls).toHaveLength(1);
        });

        it('handles error in job title gracefully', async () => {
            pipeline.startPipeline('no-title-1', {}, {}, PROFILE);
            await new Promise(r => setTimeout(r, 100));

            const status = pipeline.getPipelineStatus('no-title-1');
            expect(status.running).toBe(false);
            expect(status.progress.phase).toBe('error');
            expect(status.progress.errors).toContain('No job title set — cannot search');
        });

        it('stops early when targetCount qualified reached', async () => {
            const jobs = [];
            for (let i = 0; i < 20; i++) {
                jobs.push({ url: `https://target.com/${i}`, title: `Job ${i}`, fullText: `Job description ${i}` });
            }
            mockExecuteSearch.mockResolvedValue({ success: true, jobs });
            matchProfileHandler.mockReturnValue({ overallScore: 90 });

            pipeline.startPipeline('target-test-1', { minScore: 50, targetCount: 3, aiMatcher: matchProfileHandler }, DIRECTION, PROFILE);
            await new Promise(r => setTimeout(r, 1000));

            const status = pipeline.getPipelineStatus('target-test-1');
            expect(status.progress.qualified).toBeGreaterThanOrEqual(3);
            expect(status.progress.phase).toBe('completed');
        });

        it('handles search errors without crashing', async () => {
            mockExecuteSearch.mockResolvedValue({
                success: false,
                error: 'Network timeout'
            });

            pipeline.startPipeline('err-test-1', { aiMatcher: matchProfileHandler }, DIRECTION, PROFILE);
            await new Promise(r => setTimeout(r, 500));

            const status = pipeline.getPipelineStatus('err-test-1');
            expect(status.running).toBe(false);
            expect(status.progress.errors.some(e => e.includes('Network timeout'))).toBe(true);
        });

        it('handles match errors without crashing', async () => {
            mockExecuteSearch.mockResolvedValue({
                success: true,
                jobs: [{ url: 'https://matcherr.com/1', title: 'Dev', fullText: 'Developer role description' }]
            });
            matchProfileHandler.mockImplementation(() => { throw new Error('AI unavailable'); });

            pipeline.startPipeline('matcherr-test-1', { aiMatcher: matchProfileHandler }, DIRECTION, PROFILE);
            await new Promise(r => setTimeout(r, 500));

            const status = pipeline.getPipelineStatus('matcherr-test-1');
            expect(status.progress.errors.some(e => e.includes('AI unavailable'))).toBe(true);
        });
    });

    // ─── generateResume ───
    describe('generateResume', () => {
        it('returns error for unknown job', async () => {
            dashboardServer.getJobCards.mockReturnValue([]);
            const result = await pipeline.generateResume('gen-resume-1', 'https://nope.com', PROFILE);
            expect(result.error).toMatch(/not found/i);
        });

        it('generates resume for known job', async () => {
            dashboardServer.getJobCards.mockReturnValue([
                { url: 'https://gen.com/1', title: 'Dev', artifacts: { requirements: {} } }
            ]);
            resumeGenHandler.mockReturnValue({ markdown: '# Resume\n\nTailored content' });

            const result = await pipeline.generateResume('gen-resume-2', 'https://gen.com/1', PROFILE);
            expect(result.success).toBe(true);
            expect(result.markdown).toContain('Resume');
            expect(dashboardServer.upsertJobCard).toHaveBeenCalledWith('gen-resume-2',
                expect.objectContaining({ status: 'tailored' })
            );
        });

        it('returns error on handler failure', async () => {
            dashboardServer.getJobCards.mockReturnValue([
                { url: 'https://gen.com/2', title: 'Dev' }
            ]);
            resumeGenHandler.mockImplementation(() => { throw new Error('AI down'); });

            const result = await pipeline.generateResume('gen-resume-3', 'https://gen.com/2', PROFILE);
            expect(result.error).toBe('AI down');
        });
    });

    // ─── generateCoverLetter ───
    describe('generateCoverLetter', () => {
        it('returns error for unknown job', async () => {
            dashboardServer.getJobCards.mockReturnValue([]);
            const result = await pipeline.generateCoverLetter('gen-cl-1', 'https://nope.com', PROFILE);
            expect(result.error).toMatch(/not found/i);
        });

        it('generates cover letter for known job', async () => {
            dashboardServer.getJobCards.mockReturnValue([
                { url: 'https://cl.com/1', title: 'Dev', company: 'Acme', artifacts: {} }
            ]);
            coverLetterHandler.mockReturnValue({ markdown: '# Cover Letter\n\nDear Hiring Manager' });

            const result = await pipeline.generateCoverLetter('gen-cl-2', 'https://cl.com/1', PROFILE);
            expect(result.success).toBe(true);
            expect(result.markdown).toContain('Cover Letter');
        });
    });

    // ─── markApplied ───
    describe('markApplied', () => {
        it('marks job as submitted with note', () => {
            const result = pipeline.markApplied('apply-1', 'https://applied.com/1', 'Applied via website');
            expect(result.success).toBe(true);
            expect(dashboardServer.updateJobStatus).toHaveBeenCalledWith('apply-1', 'https://applied.com/1', 'submitted');
            expect(dashboardServer.upsertJobCard).toHaveBeenCalledWith('apply-1',
                expect.objectContaining({
                    url: 'https://applied.com/1',
                    artifacts: expect.objectContaining({ applyNote: 'Applied via website' })
                })
            );
        });

        it('marks job without note', () => {
            const result = pipeline.markApplied('apply-2', 'https://applied.com/2');
            expect(result.success).toBe(true);
        });
    });

    // ─── getHistory ───
    describe('getHistory', () => {
        it('returns only submitted/followed_up/archived jobs', () => {
            dashboardServer.getJobCards.mockReturnValue([
                { url: 'https://h.com/1', status: 'submitted' },
                { url: 'https://h.com/2', status: 'discovered' },
                { url: 'https://h.com/3', status: 'followed_up' },
                { url: 'https://h.com/4', status: 'matched' },
                { url: 'https://h.com/5', status: 'archived' }
            ]);
            const history = pipeline.getHistory('hist-1');
            expect(history).toHaveLength(3);
            expect(history.map(j => j.status)).toEqual(['submitted', 'followed_up', 'archived']);
        });

        it('returns empty for no history', () => {
            dashboardServer.getJobCards.mockReturnValue([]);
            expect(pipeline.getHistory('empty-hist')).toEqual([]);
        });
    });

    // ─── _parseSkills ───
    describe('_parseSkills', () => {
        it('parses comma-separated skills', () => {
            expect(pipeline._parseSkills('React, Node, TypeScript')).toEqual(['React', 'Node', 'TypeScript']);
        });
        it('parses newline-separated skills', () => {
            expect(pipeline._parseSkills('React\nNode\nTS')).toEqual(['React', 'Node', 'TS']);
        });
        it('handles arrays', () => {
            expect(pipeline._parseSkills(['React', 'Node'])).toEqual(['React', 'Node']);
        });
        it('strips bullet prefixes', () => {
            expect(pipeline._parseSkills('- React\n• Node\n* TS')).toEqual(['React', 'Node', 'TS']);
        });
        it('returns empty for falsy input', () => {
            expect(pipeline._parseSkills(null)).toEqual([]);
            expect(pipeline._parseSkills('')).toEqual([]);
        });
    });

    // ─── _analyzeGap ───
    describe('_analyzeGap', () => {
        it('returns empty when no pipeline exists', () => {
            const gap = pipeline._analyzeGap(new Map(), 'no-exist');
            expect(gap).toEqual({});
        });

        it('identifies sources below target', () => {
            const pipelines = new Map();
            pipelines.set('gap-test', {
                config: { targetCount: 10 },
                _sourceQualified: { indeed: 3, linkedin: 10 },
                _sourceResultCount: { indeed: 15, linkedin: 20 }
            });
            const gap = pipeline._analyzeGap(pipelines, 'gap-test');
            expect(gap.indeed).toBeDefined();
            expect(gap.indeed.deficit).toBe(7);
            expect(gap.linkedin).toBeUndefined();
        });

        it('handles sources with zero qualified', () => {
            const pipelines = new Map();
            pipelines.set('gap-zero', {
                config: { targetCount: 5 },
                _sourceQualified: {},
                _sourceResultCount: { indeed: 10 }
            });
            const gap = pipeline._analyzeGap(pipelines, 'gap-zero');
            expect(gap.indeed.qualified).toBe(0);
            expect(gap.indeed.deficit).toBe(5);
        });
    });

    // ─── _expandQueries ───
    describe('_expandQueries', () => {
        it('generates skill rotation queries', async () => {
            const direction = { q_job_title: 'Frontend Engineer', q_location: 'Toronto' };
            const prof = { skills: 'React, Node, TypeScript, Vue' };
            const gap = { indeed: { qualified: 2, target: 10, deficit: 8 } };
            const prev = [{ query: 'Frontend Engineer' }, { query: 'Frontend Engineer React' }];

            const result = await pipeline._expandQueries(direction, prof, gap, prev, null);
            // Should generate skill rotation with Node or TypeScript (not React, already used)
            const skillQueries = result.filter(q => q.query.includes('Node') || q.query.includes('TypeScript'));
            expect(skillQueries.length).toBeGreaterThanOrEqual(1);
        });

        it('drops seniority prefix as fallback', async () => {
            const direction = { q_job_title: 'Senior QA Engineer', q_location: 'Vancouver' };
            const prof = { skills: 'Selenium, Python' };
            const gap = { indeed: { qualified: 1, target: 5, deficit: 4 } };
            const prev = [{ query: 'Senior QA Engineer' }];

            const result = await pipeline._expandQueries(direction, prof, gap, prev, null);
            const broader = result.find(q => q.query === 'QA Engineer');
            expect(broader).toBeDefined();
        });

        it('uses AI expander when provided', async () => {
            const direction = { q_job_title: 'Nurse', q_location: 'Calgary' };
            const prof = { skills: 'Patient Care, Triage', highlights: 'Emergency nursing' };
            const gap = { indeed: { qualified: 0, target: 5, deficit: 5 } };
            const prev = [{ query: 'Nurse' }];

            const mockAi = jest.fn().mockResolvedValue(['RN', 'Registered Nurse', 'Staff Nurse ICU']);
            const result = await pipeline._expandQueries(direction, prof, gap, prev, mockAi);

            expect(mockAi).toHaveBeenCalledWith(expect.objectContaining({
                jobTitle: 'Nurse',
                location: 'Calgary'
            }));
            const aiQueries = result.filter(q => ['RN', 'Registered Nurse', 'Staff Nurse ICU'].includes(q.query));
            expect(aiQueries.length).toBe(3);
        });

        it('handles AI expander failure gracefully', async () => {
            const direction = { q_job_title: 'Chef', q_location: '' };
            const prof = { skills: 'French cuisine, Pastry' };
            const gap = { indeed: { qualified: 0, target: 5, deficit: 5 } };
            const prev = [{ query: 'Chef' }];

            const failingAi = jest.fn().mockRejectedValue(new Error('API error'));
            const result = await pipeline._expandQueries(direction, prof, gap, prev, failingAi);
            // Should still return deterministic results (skill rotation)
            expect(result.length).toBeGreaterThanOrEqual(1);
        });

        it('deduplicates against previous queries', async () => {
            const direction = { q_job_title: 'Dev', q_location: '' };
            const prof = { skills: 'JS, Python' };
            const gap = { indeed: { qualified: 0, target: 5, deficit: 5 } };
            const prev = [{ query: 'Dev' }, { query: 'Dev JS' }];

            const result = await pipeline._expandQueries(direction, prof, gap, prev, null);
            // 'Dev JS' already in previous, should not appear again
            const dupJS = result.filter(q => q.query.toLowerCase() === 'dev js');
            expect(dupJS).toHaveLength(0);
        });
    });

    // ─── aiInvoke propagation ───
    describe('startPipeline config propagation', () => {
        it('copies aiInvoke into pipeline.config', () => {
            const mockAiInvoke = jest.fn();
            const result = pipeline.startPipeline('ai-invoke-prop-1', {
                aiInvoke: mockAiInvoke,
                aiMatcher: jest.fn(),
                aiExpander: jest.fn()
            }, DIRECTION, PROFILE);
            expect(result.config.aiInvoke).toBe(mockAiInvoke);
        });

        it('copies aiMatcher and aiExpander into pipeline.config', () => {
            const mockMatcher = jest.fn();
            const mockExpander = jest.fn();
            const result = pipeline.startPipeline('ai-all-prop-1', {
                aiInvoke: jest.fn(),
                aiMatcher: mockMatcher,
                aiExpander: mockExpander
            }, DIRECTION, PROFILE);
            expect(result.config.aiMatcher).toBe(mockMatcher);
            expect(result.config.aiExpander).toBe(mockExpander);
        });

        it('defaults aiInvoke to null when not provided', () => {
            const result = pipeline.startPipeline('ai-null-prop-1', {}, DIRECTION, PROFILE);
            expect(result.config.aiInvoke).toBeNull();
        });
    });

    // ─── low/zero result error marking (no auto-heal, user rebuilds manually) ───
    describe('low result error marking', () => {
        beforeEach(() => {
            mockPlatformList.length = 0;
            mockPlatformList.push(
                { id: 'plat_linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com/jobs', tools: { search: { status: 'ready', script: 'test' } }, _browserId: 'br_mock', _pageIndex: 0 }
            );
            mockExecuteSearch.mockReset();
        });

        afterEach(() => {
            mockPlatformList.length = 0;
        });

        it('marks search cell as error when results < LOW_RESULT_THRESHOLD', async () => {
            // Return 1 result (below threshold of 3)
            mockExecuteSearch.mockResolvedValue({
                success: true,
                jobs: [{ url: 'https://ln.com/1', title: 'Développeur ServiceNow', fullText: 'some text' }]
            });
            matchProfileHandler.mockReturnValue({ overallScore: 25 });

            pipeline.startPipeline('low-err-1', {
                minScore: 60, targetCount: 10,
                aiInvoke: jest.fn(),
                platforms: ['plat_linkedin']
            }, { q_job_title: 'Fullstack', q_location: 'Ontario' }, PROFILE);

            await new Promise(r => setTimeout(r, 1000));

            // Verify cell marked as error with rebuild message
            const errorCalls = dashboardServer.updatePlatformCell.mock.calls
                .filter(c => c[2]?.status === 'error' && c[2]?.message?.includes('Rebuild'));
            expect(errorCalls.length).toBeGreaterThanOrEqual(1);
        });

        it('marks search cell as error on 0 results', async () => {
            mockExecuteSearch.mockResolvedValue({
                success: true,
                jobs: []
            });

            pipeline.startPipeline('zero-err-1', {
                minScore: 60, targetCount: 10,
                aiInvoke: jest.fn(),
                platforms: ['plat_linkedin']
            }, { q_job_title: 'Fullstack', q_location: 'Ontario' }, PROFILE);

            await new Promise(r => setTimeout(r, 1000));

            // Should mark error for 0 results
            const errorCalls = dashboardServer.updatePlatformCell.mock.calls
                .filter(c => c[2]?.status === 'error' && c[2]?.message?.includes('Rebuild'));
            expect(errorCalls.length).toBeGreaterThanOrEqual(1);
        });

        it('marks error even when aiInvoke is null (no auto-heal dependency)', async () => {
            mockExecuteSearch.mockResolvedValue({
                success: true,
                jobs: [{ url: 'https://ln.com/2', title: 'Dev', fullText: 'text' }]
            });
            matchProfileHandler.mockReturnValue({ overallScore: 25 });

            pipeline.startPipeline('low-null-1', {
                minScore: 60, targetCount: 10,
                aiInvoke: null,
                aiMatcher: matchProfileHandler,
                platforms: ['plat_linkedin']
            }, { q_job_title: 'Fullstack', q_location: 'Ontario' }, PROFILE);

            await new Promise(r => setTimeout(r, 1000));

            // Should still mark error — no longer depends on aiInvoke
            const errorCalls = dashboardServer.updatePlatformCell.mock.calls
                .filter(c => c[2]?.status === 'error' && c[2]?.message?.includes('Rebuild'));
            expect(errorCalls.length).toBeGreaterThanOrEqual(1);
        });

        it('does not block other platforms when one has low results', async () => {
            // Add Indeed platform
            mockPlatformList.push(
                { id: 'plat_indeed', name: 'Indeed', url: 'https://ca.indeed.com/jobs', tools: { search: { status: 'ready', script: 'test' } }, _browserId: 'br_mock', _pageIndex: 1 }
            );

            let callCount = 0;
            mockExecuteSearch.mockImplementation(async () => {
                callCount++;
                if (callCount <= 1) {
                    // LinkedIn: 0 results
                    return { success: true, jobs: [] };
                }
                // Indeed: normal results
                return {
                    success: true,
                    jobs: [
                        { url: 'https://indeed.com/j1', title: 'Dev', fullText: 'Developer role description text' },
                        { url: 'https://indeed.com/j2', title: 'SWE', fullText: 'Software engineer role description text2' }
                    ]
                };
            });
            matchProfileHandler.mockReturnValue({ overallScore: 75 });

            pipeline.startPipeline('noblock-1', {
                minScore: 60, targetCount: 10,
                aiMatcher: matchProfileHandler,
                platforms: ['plat_linkedin', 'plat_indeed']
            }, { q_job_title: 'Fullstack', q_location: 'Ontario' }, PROFILE);

            await new Promise(r => setTimeout(r, 1500));

            // Indeed jobs should still be matched despite LinkedIn failure
            const indeedJobs = dashboardServer.upsertJobCard.mock.calls
                .filter(c => c[1]?.status === 'matched');
            expect(indeedJobs.length).toBeGreaterThanOrEqual(1);
        });
    });
});
