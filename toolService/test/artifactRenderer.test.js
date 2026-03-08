'use strict';

const { markdownToHtml, registerAll } = require('../lib/artifactRenderer');
const toolRegistry = require('../lib/toolRegistry');

describe('artifactRenderer', () => {

    describe('markdownToHtml', () => {
        test('converts headers', () => {
            const html = markdownToHtml('# Title\n## Section\n### Sub');
            expect(html).toContain('<h1>Title</h1>');
            expect(html).toContain('<h2>Section</h2>');
            expect(html).toContain('<h3>Sub</h3>');
        });

        test('converts bold and italic', () => {
            const html = markdownToHtml('**bold** and *italic* and ***both***');
            expect(html).toContain('<strong>bold</strong>');
            expect(html).toContain('<em>italic</em>');
            expect(html).toContain('<strong><em>both</em></strong>');
        });

        test('converts unordered lists', () => {
            const html = markdownToHtml('- Item A\n- Item B\n- Item C');
            expect(html).toContain('<ul>');
            expect(html).toContain('<li>Item A</li>');
            expect(html).toContain('<li>Item B</li>');
            expect(html).toContain('</ul>');
        });

        test('converts links', () => {
            const html = markdownToHtml('[Google](https://google.com)');
            expect(html).toContain('<a href="https://google.com">Google</a>');
        });

        test('converts inline code', () => {
            const html = markdownToHtml('Use `npm install` to install');
            expect(html).toContain('<code>npm install</code>');
        });

        test('converts code blocks', () => {
            const html = markdownToHtml('```js\nconst x = 1;\n```');
            expect(html).toContain('<pre><code');
            expect(html).toContain('const x = 1;');
        });

        test('converts horizontal rules', () => {
            const html = markdownToHtml('---');
            expect(html).toContain('<hr>');
        });

        test('wraps in full document when title provided', () => {
            const html = markdownToHtml('# Test', { title: 'My Doc' });
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<title>My Doc</title>');
            expect(html).toContain('<style>');
            expect(html).toContain('<h1>Test</h1>');
        });

        test('returns empty for null/empty input', () => {
            expect(markdownToHtml('')).toBe('');
            expect(markdownToHtml(null)).toBe('');
        });

        test('escapes HTML entities', () => {
            const html = markdownToHtml('a < b > c & d');
            expect(html).toContain('&lt;');
            expect(html).toContain('&gt;');
            expect(html).toContain('&amp;');
        });
    });

    describe('registerAll', () => {
        beforeEach(() => toolRegistry.clear());

        test('registers render_markdown tool', () => {
            registerAll();
            const names = toolRegistry.list().map(t => t.name);
            expect(names).toContain('render_markdown');
        });

        test('render_markdown handler converts markdown', async () => {
            registerAll();
            const result = await toolRegistry.execute('render_markdown', {
                markdown: '# Hello\n\nWorld'
            });
            expect(result.success).toBe(true);
            expect(result.result.html).toContain('<h1>Hello</h1>');
        });
    });
});
