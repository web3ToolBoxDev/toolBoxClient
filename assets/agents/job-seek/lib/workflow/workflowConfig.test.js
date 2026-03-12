'use strict';

const {
    buildDefaultConfig,
    validateConfig,
    mergeConfig,
    getSourceMeta,
    VALID_STEPS,
    SOURCE_META
} = require('./workflowConfig');

describe('workflowConfig', () => {

    describe('buildDefaultConfig', () => {
        test('returns config with correct sources for Toronto, Canada', () => {
            const cfg = buildDefaultConfig('Toronto, Canada');
            expect(cfg.region).toBe('canada');
            expect(cfg.location).toBe('Toronto, Canada');
            expect(cfg.sources.map(s => s.name)).toEqual(['indeed', 'linkedin', 'jobbank', 'google']);
            expect(cfg.sources.find(s => s.name === 'linkedin').loginRequired).toBe(true);
            expect(cfg.sources.find(s => s.name === 'indeed').loginRequired).toBe(false);
        });

        test('returns default sources for unknown location', () => {
            const cfg = buildDefaultConfig('Mars');
            expect(cfg.region).toBe('_default');
            expect(cfg.sources.map(s => s.name)).toEqual(['indeed', 'linkedin', 'google']);
        });

        test('has all 4 steps in order', () => {
            const cfg = buildDefaultConfig('New York');
            expect(cfg.steps.map(s => s.name)).toEqual(VALID_STEPS);
            expect(cfg.steps.every(s => s.enabled)).toBe(true);
        });

        test('applies search overrides', () => {
            const cfg = buildDefaultConfig('Toronto', { search: { minScore: 80 } });
            expect(cfg.search.minScore).toBe(80);
            expect(cfg.search.targetCount).toBe(10); // default preserved
        });

        test('applies step overrides', () => {
            const cfg = buildDefaultConfig('Toronto', {
                steps: { generate: { enabled: false } }
            });
            const gen = cfg.steps.find(s => s.name === 'generate');
            expect(gen.enabled).toBe(false);
        });

        test('handles empty location', () => {
            const cfg = buildDefaultConfig('');
            expect(cfg.region).toBe('_default');
            expect(cfg.location).toBe('');
            expect(cfg.sources.length).toBeGreaterThan(0);
        });
    });

    describe('validateConfig', () => {
        test('valid config passes', () => {
            const cfg = buildDefaultConfig('Toronto');
            const result = validateConfig(cfg);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('rejects null config', () => {
            const result = validateConfig(null);
            expect(result.valid).toBe(false);
        });

        test('rejects empty sources', () => {
            const cfg = buildDefaultConfig('Toronto');
            cfg.sources = [];
            const result = validateConfig(cfg);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toMatch(/source/i);
        });

        test('rejects all disabled sources', () => {
            const cfg = buildDefaultConfig('Toronto');
            cfg.sources.forEach(s => { s.enabled = false; });
            const result = validateConfig(cfg);
            expect(result.valid).toBe(false);
        });

        test('rejects invalid minScore', () => {
            const cfg = buildDefaultConfig('Toronto');
            cfg.search.minScore = 150;
            const result = validateConfig(cfg);
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toMatch(/minScore/);
        });

        test('rejects unknown step names', () => {
            const cfg = buildDefaultConfig('Toronto');
            cfg.steps.push({ name: 'nonexistent', enabled: true });
            const result = validateConfig(cfg);
            expect(result.valid).toBe(false);
        });
    });

    describe('mergeConfig', () => {
        test('merges source toggles', () => {
            const base = buildDefaultConfig('Toronto');
            const merged = mergeConfig(base, {
                sources: [{ name: 'linkedin', enabled: false }]
            });
            expect(merged.sources.find(s => s.name === 'linkedin').enabled).toBe(false);
            expect(merged.sources.find(s => s.name === 'indeed').enabled).toBe(true);
        });

        test('merges step toggles (object form)', () => {
            const base = buildDefaultConfig('Toronto');
            const merged = mergeConfig(base, {
                steps: { generate: { enabled: false } }
            });
            expect(merged.steps.find(s => s.name === 'generate').enabled).toBe(false);
            expect(merged.steps.find(s => s.name === 'search').enabled).toBe(true);
        });

        test('merges search params', () => {
            const base = buildDefaultConfig('Toronto');
            const merged = mergeConfig(base, {
                search: { minScore: 75 }
            });
            expect(merged.search.minScore).toBe(75);
            expect(merged.search.targetCount).toBe(10);
        });

        test('increments version', () => {
            const base = buildDefaultConfig('Toronto');
            const merged = mergeConfig(base, {});
            expect(merged.version).toBe(base.version + 1);
        });
    });

    describe('getSourceMeta', () => {
        test('returns metadata for known source', () => {
            const meta = getSourceMeta('linkedin');
            expect(meta.label).toBe('LinkedIn');
            expect(meta.loginRequired).toBe(true);
        });

        test('returns null for unknown source', () => {
            expect(getSourceMeta('fakesource')).toBeNull();
        });
    });
});
