'use strict';

/**
 * DOCX Builder — Converts resume/cover-letter markdown to Word DOCX format.
 *
 * The markdown input comes from resumeGen.js / coverLetter.js and uses only:
 *   H1 (#), H2 (##), bullets (- item), bold (**text**), plain paragraphs.
 *
 * Output: { buffer: Buffer, filename: string }
 */

let Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, TabStopPosition, TabStopType;
try {
    ({ Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, TabStopPosition, TabStopType } = require('docx'));
} catch (err) {
    console.warn('[docxBuilder] "docx" module not installed. Run: npm install docx --save --legacy-peer-deps');
}

// ─── Style constants ───
const FONT = 'Calibri';
const COLOR_PRIMARY = '2B579A';   // Dark blue for headers
const COLOR_ACCENT = '404040';    // Dark gray for body
const FONT_SIZE_NAME = 28;        // 14pt (half-points)
const FONT_SIZE_H2 = 22;         // 11pt
const FONT_SIZE_BODY = 20;       // 10pt
const FONT_SIZE_CONTACT = 18;    // 9pt

/**
 * Parse bold markers (**text**) into TextRun array.
 * @param {string} text - Line of text potentially containing **bold** markers
 * @param {object} [baseStyle] - Base style to apply to all runs
 * @returns {TextRun[]}
 */
function parseBoldRuns(text, baseStyle = {}) {
    const runs = [];
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    for (const part of parts) {
        if (!part) continue;
        if (part.startsWith('**') && part.endsWith('**')) {
            runs.push(new TextRun({
                text: part.slice(2, -2),
                bold: true,
                font: FONT,
                size: FONT_SIZE_BODY,
                ...baseStyle
            }));
        } else {
            runs.push(new TextRun({
                text: part,
                font: FONT,
                size: FONT_SIZE_BODY,
                ...baseStyle
            }));
        }
    }
    return runs;
}

/**
 * Convert resume/cover-letter markdown to a DOCX Document.
 * @param {string} markdown - Markdown content from resumeGen or coverLetter
 * @param {object} [meta] - { company, title } for filename generation
 * @returns {Promise<{ buffer: Buffer, filename: string }>}
 */
async function markdownToDocx(markdown, meta = {}) {
    if (!Document) {
        throw new Error('docx module not installed. Run: npm install docx --save --legacy-peer-deps');
    }
    if (!markdown || !markdown.trim()) {
        // Minimal empty doc
        const emptyDoc = new Document({
            sections: [{
                children: [new Paragraph({ children: [new TextRun({ text: '' })] })]
            }]
        });
        const buffer = await Packer.toBuffer(emptyDoc);
        return { buffer, filename: _buildFilename(meta) };
    }

    const lines = markdown.split('\n');
    const children = [];
    let isFirstLine = true;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip empty lines (spacing handled by paragraph spacing)
        if (!trimmed) continue;

        // H1 — Name header
        if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
            const text = trimmed.slice(2).trim();
            children.push(new Paragraph({
                children: [new TextRun({
                    text,
                    bold: true,
                    font: FONT,
                    size: FONT_SIZE_NAME,
                    color: COLOR_PRIMARY
                })],
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                spacing: { after: 80 }
            }));
            isFirstLine = false;
            continue;
        }

        // H2 — Section header
        if (trimmed.startsWith('## ')) {
            const text = trimmed.slice(3).trim();
            children.push(new Paragraph({
                children: [new TextRun({
                    text: text.toUpperCase(),
                    bold: true,
                    font: FONT,
                    size: FONT_SIZE_H2,
                    color: COLOR_PRIMARY
                })],
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 200, after: 80 },
                border: {
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: COLOR_PRIMARY }
                }
            }));
            continue;
        }

        // Subtitle line (bold line right after H1, e.g., "**Job Title — Target: Company**")
        if (isFirstLine === false && trimmed.startsWith('**') && trimmed.endsWith('**') && children.length <= 2) {
            const text = trimmed.slice(2, -2);
            children.push(new Paragraph({
                children: [new TextRun({
                    text,
                    bold: true,
                    font: FONT,
                    size: FONT_SIZE_BODY,
                    color: COLOR_ACCENT,
                    italics: true
                })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 }
            }));
            continue;
        }

        // Contact line (contains | separator, early in doc)
        if (trimmed.includes(' | ') && children.length <= 4) {
            children.push(new Paragraph({
                children: [new TextRun({
                    text: trimmed,
                    font: FONT,
                    size: FONT_SIZE_CONTACT,
                    color: COLOR_ACCENT
                })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 120 }
            }));
            continue;
        }

        // Bullet item (- text or • text or * text)
        if (/^[-•*]\s/.test(trimmed)) {
            const bulletText = trimmed.replace(/^[-•*]\s+/, '');
            children.push(new Paragraph({
                children: parseBoldRuns(bulletText),
                bullet: { level: 0 },
                spacing: { after: 40 }
            }));
            continue;
        }

        // Plain paragraph (may contain **bold**)
        children.push(new Paragraph({
            children: parseBoldRuns(trimmed),
            spacing: { after: 80 }
        }));
    }

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: { font: FONT, size: FONT_SIZE_BODY }
                }
            }
        },
        sections: [{
            properties: {
                page: {
                    margin: { top: 720, right: 720, bottom: 720, left: 720 } // 0.5 inch margins
                }
            },
            children
        }]
    });

    const buffer = await Packer.toBuffer(doc);
    return { buffer, filename: _buildFilename(meta) };
}

/**
 * Build a safe filename from metadata.
 * @param {object} meta - { company, title, type }
 * @returns {string}
 */
function _buildFilename(meta = {}) {
    const type = meta.type || 'Resume';
    const company = (meta.company || 'Company').replace(/[^a-zA-Z0-9_-]/g, '_');
    const title = (meta.title || 'Job').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    return `${type}_${company}_${title}.docx`;
}

module.exports = { markdownToDocx, parseBoldRuns, _buildFilename };
