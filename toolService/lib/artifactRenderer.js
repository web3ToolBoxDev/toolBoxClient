'use strict';

/**
 * Artifact Renderer — Markdown → HTML conversion for generated documents.
 * Lightweight implementation without external markdown library.
 * Registered as a toolService tool.
 */

const toolRegistry = require('./toolRegistry');

/**
 * Convert Markdown text to HTML.
 * Supports: headers, bold, italic, links, lists, paragraphs, code blocks.
 *
 * @param {string} markdown
 * @param {object} [options]
 * @param {string} [options.title] - HTML page title
 * @param {string} [options.css] - Custom CSS to inject
 * @returns {string} HTML string
 */
function markdownToHtml(markdown, options = {}) {
    if (!markdown) return '';

    let html = markdown
        // Escape HTML entities
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code blocks (``` ... ```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Horizontal rules
    html = html.replace(/^---+$/gm, '<hr>');

    // Unordered lists
    html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>\n${match}</ul>\n`);

    // Paragraphs (lines that aren't already wrapped in tags)
    const lines = html.split('\n');
    const result = [];
    let inParagraph = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            if (inParagraph) {
                result.push('</p>');
                inParagraph = false;
            }
            continue;
        }
        if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('</ul') ||
            trimmed.startsWith('<li') || trimmed.startsWith('<pre') || trimmed.startsWith('</pre') ||
            trimmed.startsWith('<hr') || trimmed.startsWith('<ol')) {
            if (inParagraph) {
                result.push('</p>');
                inParagraph = false;
            }
            result.push(trimmed);
        } else {
            if (!inParagraph) {
                result.push('<p>');
                inParagraph = true;
            }
            result.push(trimmed);
        }
    }
    if (inParagraph) result.push('</p>');

    const body = result.join('\n');

    // Wrap in full HTML document if title provided
    if (options.title || options.css) {
        const css = options.css || getDefaultCss();
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(options.title || 'Document')}</title>
<style>${css}</style>
</head>
<body>
<div class="container">
${body}
</div>
</body>
</html>`;
    }

    return body;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getDefaultCss() {
    return `
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
h1 { border-bottom: 2px solid #333; padding-bottom: 8px; }
h2 { color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 24px; }
h3 { color: #34495e; }
strong { color: #2c3e50; }
ul { padding-left: 20px; }
li { margin: 4px 0; }
code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
pre { background: #f8f8f8; padding: 12px; border-radius: 5px; overflow-x: auto; }
a { color: #3498db; text-decoration: none; }
hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
.container { max-width: 800px; margin: 0 auto; }
@media print { body { font-size: 11pt; } }
`;
}

/**
 * Register artifact renderer tools.
 */
function registerAll() {
    toolRegistry.register({
        name: 'render_markdown',
        description: 'Convert Markdown text to HTML. Optionally wraps in full HTML document with CSS.',
        parameters: {
            type: 'object',
            properties: {
                markdown: { type: 'string', description: 'Markdown text to convert' },
                title: { type: 'string', description: 'HTML page title (creates full document)' },
                css: { type: 'string', description: 'Custom CSS (optional)' }
            },
            required: ['markdown']
        },
        category: 'renderer',
        handler: async ({ markdown, title, css }) => {
            const html = markdownToHtml(markdown, { title, css });
            return { html, length: html.length };
        }
    });

    console.log('[artifactRenderer] Registered 1 renderer tool');
}

module.exports = { markdownToHtml, registerAll, getDefaultCss };
