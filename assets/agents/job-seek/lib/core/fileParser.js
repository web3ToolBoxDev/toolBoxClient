'use strict';

/**
 * General-purpose file content extractor.
 * Converts PDF, DOCX, and text files from base64 to plain text.
 * Images are returned as data URIs for vision AI processing.
 */

/**
 * Extract text content from a base64-encoded file.
 *
 * @param {string} contentBase64 - Base64 data (may include data URI prefix)
 * @param {string} mimeType - MIME type of the file
 * @param {string} [fileName] - Original file name (for extension-based fallback)
 * @returns {Promise<{ text: string, kind: 'text'|'image', mimeType: string }>}
 */
async function extractText(contentBase64, mimeType, fileName = '') {
    const mime = String(mimeType || '').toLowerCase();
    const name = String(fileName || '').toLowerCase();

    // Strip data URI prefix if present
    const raw = stripDataUriPrefix(contentBase64);

    if (isPdf(mime, name)) {
        return { text: await parsePdf(raw), kind: 'text', mimeType: mime };
    }
    if (isDocx(mime, name)) {
        return { text: await parseDocx(raw), kind: 'text', mimeType: mime };
    }
    if (isImage(mime, name)) {
        // Return data URI for vision API consumption
        const effectiveMime = (mime && !mime.includes('octet-stream')) ? mime : (guessMimeFromName(name) || 'image/png');
        return { text: '', kind: 'image', mimeType: effectiveMime, dataUri: `data:${effectiveMime};base64,${raw}` };
    }
    if (isText(mime, name)) {
        return { text: Buffer.from(raw, 'base64').toString('utf-8'), kind: 'text', mimeType: mime };
    }

    // Fallback: try to decode as UTF-8 text
    try {
        const decoded = Buffer.from(raw, 'base64').toString('utf-8');
        if (decoded && !decoded.includes('\ufffd')) {
            return { text: decoded, kind: 'text', mimeType: mime };
        }
    } catch (_) {}

    return { text: '', kind: 'text', mimeType: mime };
}

function stripDataUriPrefix(base64) {
    if (typeof base64 !== 'string') return '';
    const idx = base64.indexOf(',');
    if (idx > 0 && idx < 100 && base64.startsWith('data:')) {
        return base64.slice(idx + 1);
    }
    return base64;
}

function isPdf(mime, name) {
    return mime.includes('pdf') || /\.pdf$/.test(name);
}

function isDocx(mime, name) {
    return mime.includes('wordprocessingml') || mime.includes('msword') || /\.docx?$/.test(name);
}

function isImage(mime, name) {
    return mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/.test(name);
}

function isText(mime, name) {
    return mime.startsWith('text/') || /\.(txt|md|json|csv|html?)$/.test(name);
}

function guessMimeFromName(name) {
    if (/\.png$/.test(name)) return 'image/png';
    if (/\.jpe?g$/.test(name)) return 'image/jpeg';
    if (/\.webp$/.test(name)) return 'image/webp';
    if (/\.gif$/.test(name)) return 'image/gif';
    return '';
}

async function parsePdf(base64) {
    const { PDFParse } = require('pdf-parse');
    const buffer = Buffer.from(base64, 'base64');
    const result = await PDFParse(buffer);
    return (result?.text || '').trim();
}

async function parseDocx(base64) {
    const mammoth = require('mammoth');
    const buffer = Buffer.from(base64, 'base64');
    const result = await mammoth.extractRawText({ buffer });
    return (result?.value || '').trim();
}

module.exports = { extractText, stripDataUriPrefix };
