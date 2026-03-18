'use strict';

/**
 * Marker Parser — parse AI reply markers for live profile/direction updates.
 *
 * Supported markers:
 *   [PROFILE_SET:section=value]    — replace section content entirely
 *   [PROFILE_ADD:section=value]    — append item to section (e.g., add a skill)
 *   [PROFILE_REMOVE:section=value] — remove item from section
 *   [DIRECTION:field=value]        — update direction field
 *   [PROFILE_COMPLETE]             — signal profile collection is done (existing)
 *   [ANSWER:field=value]           — onboarding answer extraction (existing)
 */

const VALID_PROFILE_SECTIONS = new Set([
    'basic', 'skills', 'experience', 'education', 'highlights',
    'certifications', 'projects', 'publications', 'languages', 'volunteering', 'summary_templates'
]);
const VALID_DIRECTION_FIELDS = new Set(['q_job_title', 'q_location', 'q_work_mode', 'q_salary']);

// PROFILE_* markers update the session-tailored profile
// MASTER_* markers update the master (total) profile directly
const MARKER_REGEX = /\[(?:(?:PROFILE|MASTER)_(SET|ADD|REMOVE)|DIRECTION|ANSWER):([^\]=]+)=([^\]]*)\]/g;
const PROFILE_COMPLETE_REGEX = /\[PROFILE_COMPLETE\]/g;

/**
 * Parse markers from AI reply text.
 * @param {string} text - Raw AI reply
 * @returns {{ markers: Array<{type: string, op: string, field: string, value: string}>, cleanText: string }}
 */
function parse(text) {
    if (!text) return { markers: [], cleanText: '' };

    const markers = [];

    // Parse structured markers
    let match;
    const regex = new RegExp(MARKER_REGEX.source, 'g');
    while ((match = regex.exec(text)) !== null) {
        const [fullMatch, profileOp, field, value] = match;
        if (profileOp) {
            // PROFILE_SET/ADD/REMOVE or MASTER_SET/ADD/REMOVE
            const section = field.trim().toLowerCase();
            if (VALID_PROFILE_SECTIONS.has(section)) {
                const isMaster = fullMatch.startsWith('[MASTER_');
                markers.push({
                    type: isMaster ? 'master_profile' : 'profile',
                    op: profileOp.toUpperCase(),
                    field: section,
                    value: value.trim()
                });
            }
        } else if (VALID_DIRECTION_FIELDS.has(field.trim())) {
            // DIRECTION:field=value
            markers.push({
                type: 'direction',
                op: 'SET',
                field: field.trim(),
                value: value.trim()
            });
        } else if (field.trim().startsWith('q_')) {
            // ANSWER:q_xxx=value (onboarding)
            markers.push({
                type: 'answer',
                op: 'SET',
                field: field.trim(),
                value: value.trim()
            });
        }
    }

    // Detect PROFILE_COMPLETE
    if (PROFILE_COMPLETE_REGEX.test(text)) {
        markers.push({ type: 'profile_complete', op: 'SIGNAL', field: '', value: '' });
    }

    // Strip all markers from displayed text
    let cleanText = text
        .replace(/\[(?:(?:PROFILE|MASTER)_(?:SET|ADD|REMOVE)|DIRECTION|ANSWER):[^\]]*\]/g, '')
        .replace(/\[PROFILE_COMPLETE\]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return { markers, cleanText };
}

/**
 * Detect whether content is multi-line (bullet list) or flat comma-separated.
 * Multi-line uses line-based splitting; flat uses comma-based.
 */
function isMultiLine(text) {
    return /\n/.test(text.trim());
}

/**
 * Normalize a string for fuzzy comparison: lowercase, collapse whitespace.
 */
function normalize(s) {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Split content into items: by newline for multi-line, by comma for flat.
 * Each item is trimmed; for lines, leading "- " bullet prefix is preserved.
 */
function splitItems(text) {
    if (isMultiLine(text)) {
        return text.split('\n').map(s => s.trimEnd()).filter(s => s.trim());
    }
    return text.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Join items back: newline for multi-line, comma for flat.
 */
function joinItems(items, multiLine) {
    return multiLine ? items.join('\n') : items.join(', ');
}

/**
 * Apply a PROFILE_ADD operation: append value to content.
 * For multi-line content, adds as a new "- value" line.
 * For flat content, appends as comma-separated item.
 * @param {string} existing - Current section content
 * @param {string} value - Value to add
 * @returns {string}
 */
function applyAdd(existing, value) {
    if (!existing || !existing.trim()) return value;
    const multiLine = isMultiLine(existing);
    const items = splitItems(existing);
    const newItem = value.trim();
    // Check for duplicates using normalized comparison
    if (items.some(item => normalize(item) === normalize(newItem) ||
                           normalize(item) === normalize('- ' + newItem))) {
        return existing; // already exists
    }
    if (multiLine) {
        items.push('- ' + newItem);
    } else {
        items.push(newItem);
    }
    return joinItems(items, multiLine);
}

/**
 * Apply a PROFILE_REMOVE operation: remove value from content.
 * For multi-line content, removes lines that contain the value (substring match).
 * For flat content, removes exact comma-separated item.
 * @param {string} existing - Current section content
 * @param {string} value - Value to remove
 * @returns {string}
 */
function applyRemove(existing, value) {
    if (!existing) return '';
    const target = normalize(value);
    const multiLine = isMultiLine(existing);
    const items = splitItems(existing);
    const filtered = items.filter(item => {
        const n = normalize(item);
        if (n === target) return false; // exact match
        // For multi-line: also match if line contains the target as substring
        if (multiLine && n.includes(target)) return false;
        return true;
    });
    return joinItems(filtered, multiLine);
}

module.exports = {
    parse,
    applyAdd,
    applyRemove,
    VALID_PROFILE_SECTIONS,
    VALID_DIRECTION_FIELDS
};
