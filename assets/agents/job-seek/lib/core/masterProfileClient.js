'use strict';

const knowledgeClient = require('./knowledgeClient');
const { applyAdd } = require('../markerParser');
const { types: TYPES } = require('../memoryPack');

/**
 * Master Profile Client — CRUD for the user's total (master) profile.
 *
 * The master profile is stored in the knowledge store with:
 *   type: 'profile', scope: 'user:<userId>'
 *
 * Each subType (basic, skills, experience, ...) is a separate document.
 * The hot cache is held externally in state.masterProfile.
 */

/** All valid profile section names (from memoryPack) */
const ALL_SECTIONS = TYPES.profile.subTypes;

/**
 * Load the master profile from the knowledge store.
 * Does NOT use findFresh — master profile has no staleness window.
 * @param {string} userId
 * @returns {Promise<object>} - { basic: '...', skills: '...', ... }
 */
async function loadMaster(userId) {
    if (!userId) return _emptyProfile();
    try {
        const docs = await knowledgeClient.find({
            type: 'profile',
            scope: `user:${userId}`
        });
        const profile = _emptyProfile();
        for (const doc of (docs || [])) {
            const sub = doc.subType || doc.sub_type;
            if (sub && doc.content) {
                profile[sub] = doc.content;
            }
        }
        return profile;
    } catch (err) {
        console.error(`[masterProfile] loadMaster failed for ${userId}:`, err.message);
        return _emptyProfile();
    }
}

/**
 * Save a single section of the master profile to the knowledge store.
 * @param {string} userId
 * @param {string} subType - e.g., 'skills', 'experience'
 * @param {string} content
 */
async function saveMasterSection(userId, subType, content) {
    if (!userId || !subType) return;
    try {
        await knowledgeClient.upsert({
            refId: `master_profile_${userId}_${subType}`,
            type: 'profile',
            subType,
            scope: `user:${userId}`,
            content: content || '',
            tags: ['master_profile']
        });
    } catch (err) {
        console.error(`[masterProfile] saveMasterSection failed (${subType}):`, err.message);
    }
}

/**
 * Save all sections of the master profile to the knowledge store.
 * @param {string} userId
 * @param {object} profile - { basic, skills, experience, ... }
 */
async function saveAllSections(userId, profile) {
    if (!userId || !profile) return;
    for (const sub of ALL_SECTIONS) {
        if (profile[sub] !== undefined) {
            await saveMasterSection(userId, sub, profile[sub]);
        }
    }
}

/**
 * Merge new sections into an existing master profile (additive).
 * Uses applyAdd for list-like sections (skills, certifications, etc.),
 * and replace for singular sections (basic, highlights).
 * @param {object} existing - Current master profile
 * @param {object} incoming - Sections to merge
 * @returns {object} - The merged profile
 */
function mergeMaster(existing, incoming) {
    const merged = { ...existing };
    const ADDITIVE_SECTIONS = new Set([
        'skills', 'certifications', 'projects', 'publications',
        'languages', 'volunteering'
    ]);

    for (const [key, value] of Object.entries(incoming)) {
        if (!value) continue;
        if (ADDITIVE_SECTIONS.has(key) && merged[key]) {
            // Additive merge: append new items without duplicates
            merged[key] = applyAdd(merged[key], value);
        } else {
            // Replace: use the new value (for basic, experience, education, highlights, summary_templates)
            merged[key] = value;
        }
    }
    return merged;
}

/**
 * Return an empty profile template with all section keys.
 * @returns {object}
 */
function _emptyProfile() {
    const profile = {};
    for (const sub of ALL_SECTIONS) {
        profile[sub] = '';
    }
    return profile;
}

/**
 * Get an empty profile template (exposed for API use).
 * @returns {object}
 */
function getEmptyTemplate() {
    return _emptyProfile();
}

module.exports = {
    loadMaster,
    saveMasterSection,
    saveAllSections,
    mergeMaster,
    getEmptyTemplate,
    ALL_SECTIONS
};
