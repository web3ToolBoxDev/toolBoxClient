'use strict';

const {
    BASE_TAXONOMY, BASE_ALIASES,
    resolveAlias, findCategory, isSameCategory,
    buildTaxonomyPrompt, parseTaxonomyResponse, mergeTaxonomy
} = require('./skillTaxonomy');

describe('skillTaxonomy', () => {

    describe('BASE_TAXONOMY', () => {
        test('has expected categories', () => {
            expect(BASE_TAXONOMY['frontend-framework']).toBeDefined();
            expect(BASE_TAXONOMY['backend-node']).toBeDefined();
            expect(BASE_TAXONOMY['db-sql']).toBeDefined();
            expect(BASE_TAXONOMY['lang-js']).toBeDefined();
        });

        test('categories contain expected skills', () => {
            expect(BASE_TAXONOMY['frontend-framework']).toContain('react');
            expect(BASE_TAXONOMY['backend-node']).toContain('express');
            expect(BASE_TAXONOMY['db-sql']).toContain('mysql');
        });
    });

    describe('resolveAlias', () => {
        test('resolves Node.js → nodejs', () => {
            expect(resolveAlias('node.js')).toBe('nodejs');
        });

        test('resolves k8s → kubernetes', () => {
            expect(resolveAlias('k8s')).toBe('kubernetes');
        });

        test('resolves ci/cd → cicd', () => {
            expect(resolveAlias('ci/cd')).toBe('cicd');
        });

        test('uses custom aliases first', () => {
            const custom = { 'mylib': 'customlib' };
            expect(resolveAlias('mylib', custom)).toBe('customlib');
        });

        test('falls back to BASE_ALIASES', () => {
            expect(resolveAlias('mongo')).toBe('mongodb');
        });

        test('handles empty/null', () => {
            expect(resolveAlias('')).toBe('');
            expect(resolveAlias(null)).toBe('');
        });
    });

    describe('findCategory', () => {
        test('finds react in frontend-framework', () => {
            expect(findCategory('react')).toBe('frontend-framework');
        });

        test('finds express in backend-node', () => {
            expect(findCategory('express')).toBe('backend-node');
        });

        test('returns null for unknown skills', () => {
            expect(findCategory('unknownskill123')).toBeNull();
        });

        test('uses custom taxonomy', () => {
            const custom = { 'my-cat': ['foo', 'bar'] };
            expect(findCategory('foo', custom)).toBe('my-cat');
        });
    });

    describe('isSameCategory', () => {
        test('express and fastify are same category (backend-node)', () => {
            const result = isSameCategory('express', 'fastify');
            expect(result.same).toBe(true);
            expect(result.category).toBe('backend-node');
        });

        test('mysql and postgresql are same category (db-sql)', () => {
            const result = isSameCategory('mysql', 'postgresql');
            expect(result.same).toBe(true);
            expect(result.category).toBe('db-sql');
        });

        test('react and vue are same category (frontend-framework)', () => {
            const result = isSameCategory('react', 'vue');
            expect(result.same).toBe(true);
            expect(result.category).toBe('frontend-framework');
        });

        test('react and express are NOT same category', () => {
            const result = isSameCategory('react', 'express');
            expect(result.same).toBe(false);
        });

        test('javascript and java are NOT same category', () => {
            const result = isSameCategory('javascript', 'java');
            expect(result.same).toBe(false);
        });
    });

    describe('buildTaxonomyPrompt', () => {
        test('includes profile skills and direction', () => {
            const prompt = buildTaxonomyPrompt(
                { skills: 'React, Node.js', experience: '5 years full-stack' },
                { q_job_title: 'Senior Frontend Engineer', q_location: 'Toronto' }
            );
            expect(prompt).toContain('React, Node.js');
            expect(prompt).toContain('Senior Frontend Engineer');
            expect(prompt).toContain('Toronto');
            expect(prompt).toContain('JSON');
        });

        test('handles array skills', () => {
            const prompt = buildTaxonomyPrompt(
                { skills: ['React', 'Node.js'] },
                { q_job_title: 'Dev' }
            );
            expect(prompt).toContain('React, Node.js');
        });
    });

    describe('parseTaxonomyResponse', () => {
        test('parses valid JSON response', () => {
            const response = JSON.stringify({
                taxonomy: { 'frontend': ['react', 'vue'] },
                aliases: { 'react.js': 'react' }
            });
            const result = parseTaxonomyResponse(response);
            expect(result).not.toBeNull();
            expect(result.taxonomy.frontend).toEqual(['react', 'vue']);
            expect(result.aliases['react.js']).toBe('react');
        });

        test('handles markdown-fenced JSON', () => {
            const response = '```json\n{"taxonomy": {"cat": ["a", "b"]}, "aliases": {}}\n```';
            const result = parseTaxonomyResponse(response);
            expect(result).not.toBeNull();
            expect(result.taxonomy.cat).toEqual(['a', 'b']);
        });

        test('handles extra text around JSON', () => {
            const response = 'Here is the taxonomy:\n{"taxonomy": {"cat": ["x"]}, "aliases": {}}\nHope this helps!';
            const result = parseTaxonomyResponse(response);
            expect(result).not.toBeNull();
        });

        test('returns null for invalid input', () => {
            expect(parseTaxonomyResponse('')).toBeNull();
            expect(parseTaxonomyResponse(null)).toBeNull();
            expect(parseTaxonomyResponse('not json at all')).toBeNull();
        });

        test('returns null if no taxonomy key', () => {
            const response = '{"aliases": {"a": "b"}}';
            expect(parseTaxonomyResponse(response)).toBeNull();
        });
    });

    describe('mergeTaxonomy', () => {
        test('merges AI taxonomy with base', () => {
            const aiGenerated = {
                taxonomy: { 'custom-cat': ['skill1', 'skill2'] },
                aliases: { 'sk1': 'skill1' }
            };
            const merged = mergeTaxonomy(
                { taxonomy: BASE_TAXONOMY, aliases: BASE_ALIASES },
                aiGenerated
            );
            // Should have base categories + custom
            expect(merged.taxonomy['frontend-framework']).toBeDefined();
            expect(merged.taxonomy['custom-cat']).toEqual(['skill1', 'skill2']);
            expect(merged.aliases['sk1']).toBe('skill1');
            // Base aliases preserved
            expect(merged.aliases['node.js']).toBe('nodejs');
        });

        test('returns base when AI is null', () => {
            const merged = mergeTaxonomy({ taxonomy: BASE_TAXONOMY, aliases: BASE_ALIASES }, null);
            expect(merged.taxonomy).toEqual(BASE_TAXONOMY);
        });

        test('extends existing categories', () => {
            const aiGenerated = {
                taxonomy: { 'frontend-framework': ['solidjs', 'qwik'] },
                aliases: {}
            };
            const merged = mergeTaxonomy(
                { taxonomy: BASE_TAXONOMY, aliases: BASE_ALIASES },
                aiGenerated
            );
            // Should contain both base and new skills
            expect(merged.taxonomy['frontend-framework']).toContain('react');
            expect(merged.taxonomy['frontend-framework']).toContain('solidjs');
            expect(merged.taxonomy['frontend-framework']).toContain('qwik');
        });
    });
});
