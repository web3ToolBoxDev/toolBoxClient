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

const VALID_PROFILE_SECTIONS = new Set(['basic', 'skills', 'experience', 'education']);
const VALID_DIRECTION_FIELDS = new Set(['q_job_title', 'q_location', 'q_work_mode', 'q_salary']);

const MARKER_REGEX = /\[(?:PROFILE_(SET|ADD|REMOVE)|DIRECTION|ANSWER):([^\]=]+)=([^\]]*)\]/g;
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
        const [, profileOp, field, value] = match;
        if (profileOp) {
            // PROFILE_SET / PROFILE_ADD / PROFILE_REMOVE
            const section = field.trim().toLowerCase();
            if (VALID_PROFILE_SECTIONS.has(section)) {
                markers.push({
                    type: 'profile',
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
        .replace(/\[(?:PROFILE_(?:SET|ADD|REMOVE)|DIRECTION|ANSWER):[^\]]*\]/g, '')
        .replace(/\[PROFILE_COMPLETE\]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return { markers, cleanText };
}

/**
 * Apply a PROFILE_ADD operation: append value to comma-separated content.
 * @param {string} existing - Current section content
 * @param {string} value - Value to add
 * @returns {string}
 */
function applyAdd(existing, value) {
    if (!existing || !existing.trim()) return value;
    const items = existing.split(',').map(s => s.trim()).filter(Boolean);
    const newItem = value.trim();
    if (items.some(item => item.toLowerCase() === newItem.toLowerCase())) {
        return existing; // already exists
    }
    items.push(newItem);
    return items.join(', ');
}

/**
 * Apply a PROFILE_REMOVE operation: remove value from comma-separated content.
 * @param {string} existing - Current section content
 * @param {string} value - Value to remove
 * @returns {string}
 */
function applyRemove(existing, value) {
    if (!existing) return '';
    const target = value.trim().toLowerCase();
    const items = existing.split(',').map(s => s.trim()).filter(Boolean);
    const filtered = items.filter(item => item.toLowerCase() !== target);
    return filtered.join(', ');
}

module.exports = {
    parse,
    applyAdd,
    applyRemove,
    VALID_PROFILE_SECTIONS,
    VALID_DIRECTION_FIELDS
};
