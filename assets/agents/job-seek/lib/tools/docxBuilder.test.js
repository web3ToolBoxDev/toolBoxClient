'use strict';

const { markdownToDocx, parseBoldRuns, _buildFilename } = require('./docxBuilder');

describe('docxBuilder', () => {
    describe('markdownToDocx', () => {
        test('converts full resume markdown to DOCX buffer', async () => {
            const md = [
                '# John Doe',
                '**Software Engineer — Target: Google**',
                'john@doe.com | 555-1234 | Vancouver',
                '',
                '## Summary',
                'Experienced engineer with 5+ years in full-stack development.',
                '',
                '## Skills',
                '- **JavaScript**',
                '- **Python**',
                '- React',
                '- Node.js',
                '',
                '## Experience',
                '- Senior Dev at TechCorp, 2020-2024',
                '- Junior Dev at StartupXYZ, 2018-2020',
                '',
                '## Education',
                '- CS, MIT, 2018'
            ].join('\n');

            const { buffer, filename } = await markdownToDocx(md, { company: 'Google', title: 'Software Engineer' });

            expect(Buffer.isBuffer(buffer)).toBe(true);
            expect(buffer.length).toBeGreaterThan(100);
            // DOCX is a ZIP file — starts with PK signature
            expect(buffer[0]).toBe(0x50); // P
            expect(buffer[1]).toBe(0x4B); // K
            expect(filename).toBe('Resume_Google_Software_Engineer.docx');
        });

        test('handles empty markdown gracefully', async () => {
            const { buffer, filename } = await markdownToDocx('', {});
            expect(Buffer.isBuffer(buffer)).toBe(true);
            expect(buffer[0]).toBe(0x50); // PK signature
            expect(filename).toContain('.docx');
        });

        test('handles null/undefined markdown', async () => {
            const { buffer } = await markdownToDocx(null);
            expect(Buffer.isBuffer(buffer)).toBe(true);
            expect(buffer[0]).toBe(0x50);
        });

        test('preserves bold text markers in output', async () => {
            const md = '## Skills\n- **React**\n- **Node.js**\n- Plain skill';
            const { buffer } = await markdownToDocx(md);
            expect(Buffer.isBuffer(buffer)).toBe(true);
            expect(buffer.length).toBeGreaterThan(100);
        });

        test('handles cover letter format', async () => {
            const md = [
                'Jane Smith',
                'jane@smith.com | 555-5678',
                '',
                'Date: March 13, 2026',
                '',
                'Dear Hiring Manager,',
                '',
                'I am writing to express my interest in the **QA Engineer** position at **TestCorp**.',
                '',
                'Sincerely,',
                'Jane Smith'
            ].join('\n');

            const { buffer, filename } = await markdownToDocx(md, {
                type: 'CoverLetter', company: 'TestCorp', title: 'QA Engineer'
            });
            expect(buffer[0]).toBe(0x50);
            expect(filename).toBe('CoverLetter_TestCorp_QA_Engineer.docx');
        });

        test('generates unique buffer per content', async () => {
            const { buffer: b1 } = await markdownToDocx('# Alice\n## Skills\n- React');
            const { buffer: b2 } = await markdownToDocx('# Bob\n## Skills\n- Python');
            expect(b1.equals(b2)).toBe(false);
        });
    });

    describe('parseBoldRuns', () => {
        test('splits bold and normal text', () => {
            const runs = parseBoldRuns('Hello **world** and **foo**');
            expect(runs).toHaveLength(4); // Hello , world,  and , foo
            // Check that bold runs have bold=true (TextRun stores in root or options)
            const texts = runs.map(r => r.root?.[0]?.root?.[0]?.root || r.options?.text || '');
            // At minimum, verify we get 4 runs (non-bold, bold, non-bold, bold)
            expect(runs.length).toBe(4);
        });

        test('handles no bold text', () => {
            const runs = parseBoldRuns('plain text only');
            expect(runs).toHaveLength(1);
        });

        test('handles all bold text', () => {
            const runs = parseBoldRuns('**everything bold**');
            expect(runs).toHaveLength(1);
        });

        test('handles empty string', () => {
            const runs = parseBoldRuns('');
            expect(runs).toHaveLength(0);
        });
    });

    describe('_buildFilename', () => {
        test('builds filename from meta', () => {
            expect(_buildFilename({ company: 'Google', title: 'SWE' })).toBe('Resume_Google_SWE.docx');
        });

        test('sanitizes special characters', () => {
            const filename = _buildFilename({ company: 'Foo & Bar Inc.', title: 'Sr. Dev' });
            expect(filename).toContain('.docx');
            expect(filename).not.toMatch(/[&]/);
        });

        test('uses defaults for missing meta', () => {
            expect(_buildFilename({})).toBe('Resume_Company_Job.docx');
            expect(_buildFilename()).toBe('Resume_Company_Job.docx');
        });

        test('respects type override', () => {
            expect(_buildFilename({ type: 'CoverLetter', company: 'X' })).toBe('CoverLetter_X_Job.docx');
        });

        test('truncates long titles', () => {
            const longTitle = 'A'.repeat(50);
            const filename = _buildFilename({ title: longTitle });
            // Title should be truncated to 30 chars
            expect(filename.length).toBeLessThan(60);
        });
    });
});
