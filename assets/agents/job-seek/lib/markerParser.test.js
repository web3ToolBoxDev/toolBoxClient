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

    describe('applyAdd', () => {
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

    describe('applyRemove', () => {
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
});
