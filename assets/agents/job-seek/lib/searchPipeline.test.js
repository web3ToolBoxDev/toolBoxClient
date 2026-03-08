'use strict';

/**
 * Unit tests for searchPipeline — the dashboard-driven automated job search engine.
 */

// Mock all domain tool handlers
jest.mock('./tools/jobSearch', () => ({
    handler: jest.fn()
}));
jest.mock('./tools/parseListing', () => ({
    handler: jest.fn()
}));
jest.mock('./tools/matchProfile', () => ({
    handler: jest.fn()
}));
jest.mock('./tools/resumeGen', () => ({
    handler: jest.fn()
}));
jest.mock('./tools/coverLetter', () => ({
    handler: jest.fn()
}));
jest.mock('./dashboardServer', () => ({
    upsertJobCard: jest.fn(),
    updateJobStatus: jest.fn(),
    getJobCards: jest.fn(() => [])
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
            pipeline.startPipeline('dup-test-1', {}, DIRECTION, PROFILE);
            const dup = pipeline.startPipeline('dup-test-1', {}, DIRECTION, PROFILE);
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
            pipeline.startPipeline('status-test-1', {}, DIRECTION, PROFILE);
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
            pipeline.startPipeline('stop-test-1', {}, DIRECTION, PROFILE);
            const result = pipeline.stopPipeline('stop-test-1');
            expect(result.stopped).toBe(true);
        });
    });

    // ─── _runPipeline (integration via startPipeline) ───
    describe('pipeline execution', () => {
        it('records discovered jobs to dashboard', async () => {
            jobSearchHandler.mockResolvedValue({
                listings: [
                    { url: 'https://j.com/1', title: 'Dev', company: 'Acme' },
                    { url: 'https://j.com/2', title: 'SWE', company: 'BigCo' }
                ]
            });
            matchProfileHandler.mockResolvedValue({ overall: 75 });

            pipeline.startPipeline('exec-test-1', { minScore: 50, targetCount: 5 }, DIRECTION, PROFILE);
            // Wait for async pipeline
            await new Promise(r => setTimeout(r, 200));

            expect(dashboardServer.upsertJobCard).toHaveBeenCalledWith('exec-test-1',
                expect.objectContaining({ url: 'https://j.com/1', status: 'discovered' })
            );
        });

        it('deduplicates listings by URL', async () => {
            jobSearchHandler.mockResolvedValue({
                listings: [
                    { url: 'https://dup.com/1', title: 'Dev' },
                    { url: 'https://dup.com/1', title: 'Dev duplicate' }
                ]
            });
            matchProfileHandler.mockResolvedValue({ overall: 80 });

            pipeline.startPipeline('dedup-test-1', { minScore: 50 }, DIRECTION, PROFILE);
            await new Promise(r => setTimeout(r, 200));

            const discoveredCalls = dashboardServer.upsertJobCard.mock.calls
                .filter(c => c[1]?.url === 'https://dup.com/1' && c[1]?.status === 'discovered');
            expect(discoveredCalls).toHaveLength(1);
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
            const listings = [];
            for (let i = 0; i < 20; i++) {
                listings.push({ url: `https://target.com/${i}`, title: `Job ${i}` });
            }
            jobSearchHandler.mockResolvedValue({ listings });
            matchProfileHandler.mockResolvedValue({ overall: 90 });

            pipeline.startPipeline('target-test-1', { minScore: 50, targetCount: 3 }, DIRECTION, PROFILE);
            await new Promise(r => setTimeout(r, 500));

            const status = pipeline.getPipelineStatus('target-test-1');
            expect(status.progress.qualified).toBeGreaterThanOrEqual(3);
            expect(status.progress.phase).toBe('completed');
        });

        it('handles search errors without crashing', async () => {
            jobSearchHandler.mockRejectedValue(new Error('Network timeout'));

            pipeline.startPipeline('err-test-1', {}, DIRECTION, PROFILE);
            await new Promise(r => setTimeout(r, 200));

            const status = pipeline.getPipelineStatus('err-test-1');
            expect(status.running).toBe(false);
            expect(status.progress.errors.some(e => e.includes('Network timeout'))).toBe(true);
        });

        it('handles match errors without crashing', async () => {
            jobSearchHandler.mockResolvedValue({
                listings: [{ url: 'https://matcherr.com/1', title: 'Dev' }]
            });
            matchProfileHandler.mockRejectedValue(new Error('AI unavailable'));

            pipeline.startPipeline('matcherr-test-1', {}, DIRECTION, PROFILE);
            await new Promise(r => setTimeout(r, 200));

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
            resumeGenHandler.mockResolvedValue({ markdown: '# Resume\n\nTailored content' });

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
            resumeGenHandler.mockRejectedValue(new Error('AI down'));

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
            coverLetterHandler.mockResolvedValue({ markdown: '# Cover Letter\n\nDear Hiring Manager' });

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
});
