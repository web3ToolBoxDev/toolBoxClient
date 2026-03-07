'use strict';

const { parse, applyAdd, applyRemove } = require('./markerParser');

describe('markerParser', () => {
    describe('parse', () => {
        it('parses PROFILE_SET marker', () => {
            const { markers, cleanText } = parse('Updated your name. [PROFILE_SET:basic=Zhang Ying, London ON]');
            expect(markers).toHaveLength(1);
            expect(markers[0]).toEqual({ type: 'profile', op: 'SET', field: 'basic', value: 'Zhang Ying, London ON' });
            expect(cleanText).toBe('Updated your name.');
        });

        it('parses PROFILE_ADD marker', () => {
            const { markers } = parse('Added K8s to your skills. [PROFILE_ADD:skills=K8s]');
            expect(markers).toHaveLength(1);
            expect(markers[0]).toEqual({ type: 'profile', op: 'ADD', field: 'skills', value: 'K8s' });
        });

        it('parses PROFILE_REMOVE marker', () => {
            const { markers } = parse('Removed Vue. [PROFILE_REMOVE:skills=Vue]');
            expect(markers).toHaveLength(1);
            expect(markers[0]).toEqual({ type: 'profile', op: 'REMOVE', field: 'skills', value: 'Vue' });
        });

        it('parses DIRECTION marker', () => {
            const { markers } = parse('Updated your target. [DIRECTION:q_job_title=Backend Engineer]');
            expect(markers).toHaveLength(1);
            expect(markers[0]).toEqual({ type: 'direction', op: 'SET', field: 'q_job_title', value: 'Backend Engineer' });
        });

        it('parses ANSWER marker for direction fields as direction type', () => {
            const { markers } = parse('Got it! [ANSWER:q_location=Toronto]');
            expect(markers).toHaveLength(1);
            // ANSWER with known direction field is treated as direction update
            expect(markers[0]).toEqual({ type: 'direction', op: 'SET', field: 'q_location', value: 'Toronto' });
        });

        it('parses PROFILE_COMPLETE signal', () => {
            const { markers } = parse('Profile is ready! [PROFILE_COMPLETE]');
            expect(markers).toHaveLength(1);
            expect(markers[0]).toEqual({ type: 'profile_complete', op: 'SIGNAL', field: '', value: '' });
        });

        it('parses multiple markers', () => {
            const text = 'Done! [PROFILE_ADD:skills=K8s] [PROFILE_ADD:skills=Docker] [DIRECTION:q_location=Shanghai]';
            const { markers, cleanText } = parse(text);
            expect(markers).toHaveLength(3);
            expect(markers[0].value).toBe('K8s');
            expect(markers[1].value).toBe('Docker');
            expect(markers[2].type).toBe('direction');
            expect(cleanText).toBe('Done!');
        });

        it('ignores invalid profile section', () => {
            const { markers } = parse('[PROFILE_ADD:hobbies=gaming]');
            expect(markers).toHaveLength(0);
        });

        it('strips markers from clean text', () => {
            const { cleanText } = parse('I added React.\n[PROFILE_ADD:skills=React]\n\nLet me know if you need more.');
            expect(cleanText).toBe('I added React.\n\nLet me know if you need more.');
            expect(cleanText).not.toContain('[PROFILE_ADD');
        });

        it('returns empty for null/empty input', () => {
            expect(parse('').markers).toHaveLength(0);
            expect(parse(null).markers).toHaveLength(0);
        });

        it('handles markers with multiline text around them', () => {
            const text = 'Here is what I did:\n\n[PROFILE_SET:skills=React, Vue, TypeScript]\n\nAll set!';
            const { markers, cleanText } = parse(text);
            expect(markers).toHaveLength(1);
            expect(markers[0].value).toBe('React, Vue, TypeScript');
            expect(cleanText).toContain('Here is what I did:');
            expect(cleanText).toContain('All set!');
        });

        it('parses combined PROFILE and PROFILE_COMPLETE markers', () => {
            const text = 'Profile complete! [PROFILE_SET:basic=John Doe] [PROFILE_COMPLETE]';
            const { markers } = parse(text);
            expect(markers).toHaveLength(2);
            expect(markers[0].type).toBe('profile');
            expect(markers[1].type).toBe('profile_complete');
        });
    });

    describe('applyAdd — flat comma list', () => {
        it('adds to empty content', () => {
            expect(applyAdd('', 'K8s')).toBe('K8s');
        });

        it('appends to existing comma list', () => {
            expect(applyAdd('React, Vue', 'K8s')).toBe('React, Vue, K8s');
        });

        it('does not duplicate existing item (case-insensitive)', () => {
            expect(applyAdd('React, Vue', 'react')).toBe('React, Vue');
        });

        it('handles whitespace in existing content', () => {
            expect(applyAdd('  React ,  Vue  ', 'Angular')).toBe('React, Vue, Angular');
        });
    });

    describe('applyAdd — multi-line bullet content', () => {
        const multiLine = '- Frontend: React, Vue\n- Backend: Node.js\n- DevOps: Docker';

        it('adds new line with bullet prefix', () => {
            const result = applyAdd(multiLine, 'K8s');
            expect(result).toContain('- K8s');
            expect(result.split('\n')).toHaveLength(4);
        });

        it('does not duplicate existing line (substring match)', () => {
            const result = applyAdd(multiLine, 'Backend: Node.js');
            // Should not add because "- Backend: Node.js" already exists
            expect(result).toBe(multiLine);
        });

        it('preserves newline structure', () => {
            const result = applyAdd(multiLine, 'Testing: Playwright');
            const lines = result.split('\n');
            expect(lines[0]).toBe('- Frontend: React, Vue');
            expect(lines[1]).toBe('- Backend: Node.js');
            expect(lines[2]).toBe('- DevOps: Docker');
            expect(lines[3]).toBe('- Testing: Playwright');
        });
    });

    describe('applyRemove — flat comma list', () => {
        it('removes item from comma list', () => {
            expect(applyRemove('React, Vue, Angular', 'Vue')).toBe('React, Angular');
        });

        it('removes case-insensitively', () => {
            expect(applyRemove('React, vue, Angular', 'Vue')).toBe('React, Angular');
        });

        it('returns empty when removing last item', () => {
            expect(applyRemove('React', 'React')).toBe('');
        });

        it('returns unchanged if item not found', () => {
            expect(applyRemove('React, Vue', 'Angular')).toBe('React, Vue');
        });

        it('handles empty input', () => {
            expect(applyRemove('', 'React')).toBe('');
        });
    });

    describe('applyRemove — multi-line bullet content', () => {
        const multiLine = [
            '- QA Automation / SDET — 10 years experience',
            '- ToolBoxClient (Founder) — 260+ Stars',
            '- web3toolbox.app: React + Rust backend, Docker, Jenkins CI/CD'
        ].join('\n');

        it('removes line by substring match', () => {
            const result = applyRemove(multiLine, 'web3toolbox.app');
            expect(result).not.toContain('web3toolbox');
            expect(result).toContain('QA Automation');
            expect(result).toContain('ToolBoxClient');
            expect(result.split('\n')).toHaveLength(2);
        });

        it('removes line by full content match', () => {
            const result = applyRemove(multiLine, '- ToolBoxClient (Founder) — 260+ Stars');
            expect(result).not.toContain('ToolBoxClient');
            expect(result.split('\n')).toHaveLength(2);
        });

        it('removes case-insensitively', () => {
            const result = applyRemove(multiLine, 'WEB3TOOLBOX.APP');
            expect(result).not.toContain('web3toolbox');
        });

        it('returns unchanged if not found', () => {
            const result = applyRemove(multiLine, 'nonexistent project');
            expect(result).toBe(multiLine);
        });

        it('preserves remaining lines structure', () => {
            const result = applyRemove(multiLine, 'ToolBoxClient');
            const lines = result.split('\n');
            expect(lines[0]).toBe('- QA Automation / SDET — 10 years experience');
            expect(lines[1]).toBe('- web3toolbox.app: React + Rust backend, Docker, Jenkins CI/CD');
        });
    });
});
