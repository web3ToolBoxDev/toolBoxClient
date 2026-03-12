'use strict';

const { detectIntent } = require('./knowledgeClient');

describe('detectIntent', () => {
    test('"who am I" → returns ["profile"]', () => {
        expect(detectIntent('who am I')).toEqual(['profile']);
    });

    test('"what are my skills" → returns ["profile"]', () => {
        expect(detectIntent('what are my skills')).toEqual(['profile']);
    });

    test('"我的技能" → returns ["profile"]', () => {
        expect(detectIntent('我的技能')).toEqual(['profile']);
    });

    test('"work experience" → returns ["profile"]', () => {
        expect(detectIntent('work experience')).toEqual(['profile']);
    });

    test('"my target direction" → returns ["direction", "profile"]', () => {
        expect(detectIntent('my target direction')).toEqual(['direction', 'profile']);
    });

    test('"match this JD" → returns ["profile", "job_listing"]', () => {
        expect(detectIntent('match this JD')).toEqual(['profile', 'job_listing']);
    });

    test('"remote salary preference" → returns ["preference", "direction"]', () => {
        expect(detectIntent('remote salary preference')).toEqual(['preference', 'direction']);
    });

    test('"random unrelated question" → returns null', () => {
        expect(detectIntent('random unrelated question')).toBeNull();
    });

    test('"generate resume" → returns ["profile", "direction"]', () => {
        expect(detectIntent('generate resume')).toEqual(['profile', 'direction']);
    });
});
