'use strict';

const { TOOL_DEF, handler, parseCompanyInfo, buildBrief } = require('./companyResearch');

jest.mock('../core/toolServiceClient', () => ({
    executeTool: jest.fn().mockResolvedValue({ success: false })
}));

jest.mock('../core/knowledgeClient', () => ({
    upsert: jest.fn().mockResolvedValue({ success: true })
}));

const toolServiceClient = require('../core/toolServiceClient');
const knowledgeClient = require('../core/knowledgeClient');

describe('company_research tool', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('company_research');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires company', () => {
            expect(TOOL_DEF.parameters.required).toContain('company');
        });
    });

    describe('parseCompanyInfo', () => {
        test('extracts company name', () => {
            const info = parseCompanyInfo({}, 'Acme Corp');
            expect(info.name).toBe('Acme Corp');
        });

        test('extracts description', () => {
            const info = parseCompanyInfo({ description: 'We build great stuff' }, 'Acme');
            expect(info.description).toBe('We build great stuff');
        });

        test('detects industry from text', () => {
            const info = parseCompanyInfo({ about: 'Leading technology company' }, 'Tech Co');
            expect(info.industry).toBe('technology');
        });

        test('detects tech stack keywords', () => {
            const info = parseCompanyInfo({ about: 'We use react, node, and kubernetes' }, 'Co');
            expect(info.techStack).toContain('react');
            expect(info.techStack).toContain('node');
            expect(info.techStack).toContain('kubernetes');
        });

        test('extracts company size', () => {
            const info = parseCompanyInfo({ about: 'We have 5,000 employees worldwide' }, 'Big Co');
            expect(info.size).toContain('5,000');
        });

        test('handles null extracted data', () => {
            const info = parseCompanyInfo(null, 'Empty');
            expect(info.name).toBe('Empty');
            expect(info.description).toBe('');
        });
    });

    describe('buildBrief', () => {
        test('generates markdown with company name', () => {
            const brief = buildBrief({ name: 'Acme', description: '', industry: '', size: '', techStack: [], values: [] });
            expect(brief).toContain('# Acme');
        });

        test('includes overview section', () => {
            const brief = buildBrief({ name: 'Co', description: 'Great company', industry: '', size: '', techStack: [], values: [] });
            expect(brief).toContain('## Overview');
            expect(brief).toContain('Great company');
        });

        test('includes tech stack section', () => {
            const brief = buildBrief({ name: 'Co', description: '', techStack: ['react', 'node'], values: [] });
            expect(brief).toContain('## Tech Stack');
            expect(brief).toContain('- react');
        });

        test('includes interview tips', () => {
            const brief = buildBrief({ name: 'Co', description: '', techStack: ['react'], values: [] });
            expect(brief).toContain('## Interview Preparation Tips');
            expect(brief).toContain('react');
        });

        test('skips empty sections', () => {
            const brief = buildBrief({ name: 'Co', description: '', techStack: [], values: [] });
            expect(brief).not.toContain('## Tech Stack');
        });
    });

    describe('handler', () => {
        test('researches company and stores result', async () => {
            toolServiceClient.executeTool.mockResolvedValue({
                success: true,
                result: { description: 'A technology company using react and python' }
            });

            const result = await handler({ company: 'TestCo' });
            expect(result.company).toBe('TestCo');
            expect(result.brief).toContain('TestCo');
            expect(result.stored).toBe(true);
            expect(knowledgeClient.upsert).toHaveBeenCalled();
        });

        test('throws without company name', async () => {
            await expect(handler({})).rejects.toThrow('company name is required');
        });

        test('works even when web fetch fails', async () => {
            toolServiceClient.executeTool.mockResolvedValue({ success: false });
            const result = await handler({ company: 'OfflineCo' });
            expect(result.company).toBe('OfflineCo');
            expect(result.brief).toContain('OfflineCo');
        });
    });
});
