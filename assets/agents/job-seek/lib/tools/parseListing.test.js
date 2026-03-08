'use strict';

const { TOOL_DEF, handler, extractRequirements, extractSection } = require('./parseListing');

// Mock toolServiceClient
jest.mock('../core/toolServiceClient', () => ({
    executeTool: jest.fn()
}));
const toolServiceClient = require('../core/toolServiceClient');

describe('parse_listing tool', () => {

    describe('TOOL_DEF', () => {
        test('has correct name and category', () => {
            expect(TOOL_DEF.name).toBe('parse_listing');
            expect(TOOL_DEF.category).toBe('job-seek');
        });

        test('requires url parameter', () => {
            expect(TOOL_DEF.parameters.required).toEqual(['url']);
        });
    });

    describe('extractSection', () => {
        test('extracts relevant sentences by keyword', () => {
            const text = 'We need a developer. Required skills include React and Node. Good communication is a plus. Experience with Docker preferred.';
            const result = extractSection(text, ['skills', 'requirements']);
            expect(result).toContain('Required skills include React and Node');
        });

        test('returns empty for no matches', () => {
            expect(extractSection('Hello world test.', ['nonexistent'])).toBe('');
        });

        test('handles empty text', () => {
            expect(extractSection('', ['test'])).toBe('');
        });

        test('case-insensitive matching', () => {
            const text = 'Education: Bachelor degree in CS required. Other stuff here.';
            const result = extractSection(text, ['education']);
            expect(result).toContain('Bachelor degree');
        });
    });

    describe('extractRequirements', () => {
        test('extracts sections from job description', () => {
            const fetchResult = {
                title: 'Senior Software Engineer',
                text: 'We are hiring a senior engineer. Requirements: 5 years experience in Python. Education: Bachelor in CS. Skills: React, Node, Docker. Good communication and team work needed. Responsibilities include building APIs.',
                body: ''
            };
            const req = extractRequirements(fetchResult);
            expect(req.title).toBe('Senior Software Engineer');
            expect(req.sections.technical).toContain('React');
            expect(req.sections.experience).toContain('5 years');
            expect(req.sections.education).toContain('Bachelor');
            expect(req.sections.soft_skills).toContain('communication');
        });

        test('extracts salary from text', () => {
            const fetchResult = {
                title: 'Dev',
                text: 'Salary: $80,000 - $120,000 per year. Great benefits.',
            };
            const req = extractRequirements(fetchResult);
            expect(req.salary).toContain('$80,000');
        });

        test('handles K salary format', () => {
            const fetchResult = {
                title: 'Dev',
                text: 'Compensation: 100K – 150K plus bonus.',
            };
            const req = extractRequirements(fetchResult);
            expect(req.salary).toContain('100K');
        });

        test('truncates fullText to 5000 chars', () => {
            const fetchResult = {
                title: 'Test',
                text: 'x'.repeat(10000),
            };
            const req = extractRequirements(fetchResult);
            expect(req.fullText.length).toBeLessThanOrEqual(5000);
        });
    });

    describe('handler', () => {
        afterEach(() => jest.clearAllMocks());

        test('throws when url is missing', async () => {
            await expect(handler({})).rejects.toThrow('url is required');
        });

        test('uses HTTP mode by default', async () => {
            toolServiceClient.executeTool.mockResolvedValueOnce({
                success: true,
                result: {
                    title: 'Engineer at TechCo',
                    text: 'Requirements: 3 years experience. Skills: Java, Python.',
                    status: 200
                }
            });

            const result = await handler({ url: 'https://example.com/job/123' });
            expect(toolServiceClient.executeTool).toHaveBeenCalledWith('http_fetch', expect.objectContaining({
                url: 'https://example.com/job/123',
                extract: true
            }));
            expect(result.url).toBe('https://example.com/job/123');
            expect(result.parsedAt).toBeTruthy();
            expect(result.sections.technical).toContain('Java');
        });

        test('uses browser mode when useBrowser=true', async () => {
            toolServiceClient.executeTool
                .mockResolvedValueOnce({ success: true, result: { browserId: 'b1', mode: 'headless' } }) // browser_launch
                .mockResolvedValueOnce({ success: true, result: { title: 'Job Page', url: 'https://example.com/job' } }) // page_goto
                .mockResolvedValueOnce({ success: true, result: { result: 'Skills: Python. Education: MS degree.' } }) // page_extract
                .mockResolvedValueOnce({ success: true }); // browser_close

            const result = await handler({ url: 'https://example.com/job', useBrowser: true });
            expect(toolServiceClient.executeTool).toHaveBeenCalledWith('browser_launch', { headless: true });
            expect(result.sections.education).toContain('MS degree');
        });

        test('throws when HTTP fetch fails', async () => {
            toolServiceClient.executeTool.mockResolvedValueOnce({
                success: false,
                error: 'Connection refused'
            });

            await expect(handler({ url: 'http://bad.com' })).rejects.toThrow('HTTP fetch failed');
        });

        test('closes browser even on navigation failure', async () => {
            toolServiceClient.executeTool
                .mockResolvedValueOnce({ success: true, result: { browserId: 'b2' } }) // launch
                .mockResolvedValueOnce({ success: false, error: 'timeout' }); // goto fails

            // browser_close should still be called
            toolServiceClient.executeTool.mockResolvedValueOnce({ success: true }); // close

            await expect(handler({ url: 'http://bad.com', useBrowser: true })).rejects.toThrow('Navigation failed');
            // Verify browser_close was called
            const closeCalls = toolServiceClient.executeTool.mock.calls.filter(c => c[0] === 'browser_close');
            expect(closeCalls.length).toBe(1);
        });
    });
});
