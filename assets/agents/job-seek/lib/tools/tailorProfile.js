'use strict';

/**
 * Profile Tailoring — deterministic v1 (no AI call).
 *
 * Takes a master (total) profile and a target direction (job title, location, etc.),
 * produces a session-tailored profile with:
 *   - Skills reordered by relevance to target role
 *   - Experience entries reordered by relevance
 *   - Summary generated from highlights + target role
 *   - Certifications/projects filtered by relevance
 */

const TOOL_DEF = {
    name: 'tailor_profile',
    description: 'Tailor master profile for a specific job target + location',
    parameters: {
        type: 'object',
        properties: {
            masterProfile: { type: 'object', description: 'The full master profile sections' },
            targetRole: { type: 'string', description: 'Target job title' },
            targetLocation: { type: 'string', description: 'Target location' },
            workMode: { type: 'string', description: 'remote/onsite/hybrid' },
            salaryRange: { type: 'string', description: 'Expected salary range' }
        },
        required: ['masterProfile', 'targetRole']
    }
};

/**
 * Build keyword set from target role for relevance matching.
 * E.g., "Senior Frontend Engineer" → ['senior', 'frontend', 'engineer', 'react', 'javascript', ...]
 */
function buildRoleKeywords(targetRole) {
    const words = targetRole.toLowerCase().split(/[\s,/\-_]+/).filter(w => w.length > 2);

    // Common role → skill keyword expansion
    const ROLE_SKILL_MAP = {
        frontend: ['react', 'vue', 'angular', 'css', 'html', 'javascript', 'typescript', 'ui', 'ux', 'responsive', 'webpack', 'sass', 'tailwind'],
        backend: ['node', 'express', 'api', 'rest', 'graphql', 'database', 'sql', 'nosql', 'microservice', 'server'],
        fullstack: ['react', 'node', 'api', 'database', 'javascript', 'typescript', 'full-stack'],
        devops: ['docker', 'kubernetes', 'ci/cd', 'aws', 'azure', 'gcp', 'terraform', 'jenkins', 'pipeline', 'deploy'],
        data: ['python', 'sql', 'machine learning', 'analytics', 'pandas', 'spark', 'etl', 'statistics'],
        mobile: ['ios', 'android', 'react native', 'flutter', 'swift', 'kotlin'],
        qa: ['test', 'selenium', 'cypress', 'automation', 'quality', 'playwright', 'jest', 'testing'],
        automation: ['selenium', 'cypress', 'playwright', 'puppeteer', 'test', 'ci/cd', 'scripting'],
        engineer: ['software', 'development', 'programming', 'coding', 'design'],
        manager: ['leadership', 'team', 'agile', 'scrum', 'stakeholder', 'roadmap', 'strategy'],
        designer: ['figma', 'sketch', 'ui', 'ux', 'wireframe', 'prototype', 'user research'],
        analyst: ['data', 'sql', 'excel', 'reporting', 'analysis', 'visualization', 'tableau', 'power bi']
    };

    const expanded = new Set(words);
    for (const word of words) {
        if (ROLE_SKILL_MAP[word]) {
            for (const skill of ROLE_SKILL_MAP[word]) {
                expanded.add(skill);
            }
        }
    }
    return expanded;
}

/**
 * Score a text block's relevance to the role keywords.
 * Returns a value between 0 and 1.
 */
function scoreRelevance(text, keywords) {
    if (!text) return 0;
    const lower = text.toLowerCase();
    let hits = 0;
    for (const kw of keywords) {
        if (lower.includes(kw)) hits++;
    }
    return keywords.size > 0 ? hits / keywords.size : 0;
}

/**
 * Split a multi-line section into individual entries.
 * Supports bullet lists (- item) and double-newline-separated blocks.
 */
function splitEntries(text) {
    if (!text || !text.trim()) return [];
    // Check if it's a bullet list
    if (/^[-•*]\s/m.test(text)) {
        return text.split('\n').reduce((acc, line) => {
            if (/^[-•*]\s/.test(line.trim())) {
                acc.push(line);
            } else if (acc.length > 0) {
                acc[acc.length - 1] += '\n' + line;
            }
            return acc;
        }, []);
    }
    // Double-newline separated blocks (experience entries)
    const blocks = text.split(/\n\n+/);
    if (blocks.length > 1) return blocks.filter(b => b.trim());
    // Single block — return as-is
    return [text];
}

/**
 * Reorder entries by relevance score (most relevant first).
 */
function reorderByRelevance(entries, keywords) {
    return entries
        .map(entry => ({ entry, score: scoreRelevance(entry, keywords) }))
        .sort((a, b) => b.score - a.score)
        .map(e => e.entry);
}

/**
 * Filter entries: keep items with non-zero relevance, or top N if all have some relevance.
 * Always keeps at least minKeep items.
 */
function filterByRelevance(entries, keywords, minKeep = 3) {
    if (entries.length <= minKeep) return { kept: entries, dropped: [] };
    const scored = entries.map(entry => ({ entry, score: scoreRelevance(entry, keywords) }));
    scored.sort((a, b) => b.score - a.score);
    // Keep items with any relevance, or at least minKeep
    const cutoff = Math.max(
        scored.findIndex(s => s.score === 0),
        minKeep
    );
    const kept = scored.slice(0, cutoff === -1 ? scored.length : cutoff).map(s => s.entry);
    const dropped = scored.slice(cutoff === -1 ? scored.length : cutoff).map(s => s.entry);
    return { kept, dropped };
}

/**
 * Generate a tailored summary from highlights and target role.
 */
function generateSummary(masterProfile, targetRole, targetLocation) {
    const highlights = masterProfile.highlights || masterProfile.summary_templates || '';
    if (!highlights) {
        // Generate a basic summary from available data
        const parts = [];
        if (masterProfile.basic) {
            const firstLine = masterProfile.basic.split('\n')[0];
            if (firstLine) parts.push(firstLine);
        }
        if (targetRole) parts.push(`seeking ${targetRole} opportunities`);
        if (targetLocation) parts.push(`in ${targetLocation}`);
        return parts.join(' — ');
    }
    // Prepend role-specific framing to existing highlights
    return highlights;
}

/**
 * Main handler: tailor a master profile for a specific target.
 * @param {object} params
 * @param {object} params.masterProfile
 * @param {string} params.targetRole
 * @param {string} [params.targetLocation]
 * @param {string} [params.workMode]
 * @param {string} [params.salaryRange]
 * @returns {{ tailoredSections: object, relevanceScores: object, droppedItems: string[] }}
 */
function handler(params) {
    const { masterProfile, targetRole, targetLocation, workMode, salaryRange } = params;
    if (!masterProfile || !targetRole) {
        return { tailoredSections: masterProfile || {}, relevanceScores: {}, droppedItems: [] };
    }

    const keywords = buildRoleKeywords(targetRole);
    const tailored = {};
    const relevanceScores = {};
    const droppedItems = [];

    // Copy basic info as-is (name, contact — not filterable)
    tailored.basic = masterProfile.basic || '';

    // Reorder skills by relevance
    if (masterProfile.skills) {
        const isCommaList = !masterProfile.skills.includes('\n');
        if (isCommaList) {
            const skills = masterProfile.skills.split(',').map(s => s.trim()).filter(Boolean);
            const reordered = reorderByRelevance(skills, keywords);
            tailored.skills = reordered.join(', ');
        } else {
            const entries = splitEntries(masterProfile.skills);
            tailored.skills = reorderByRelevance(entries, keywords).join('\n');
        }
        relevanceScores.skills = scoreRelevance(tailored.skills, keywords);
    }

    // Reorder experience by relevance
    if (masterProfile.experience) {
        const entries = splitEntries(masterProfile.experience);
        tailored.experience = reorderByRelevance(entries, keywords).join('\n\n');
        relevanceScores.experience = scoreRelevance(tailored.experience, keywords);
    }

    // Education — copy as-is (usually all relevant)
    tailored.education = masterProfile.education || '';

    // Generate tailored summary
    tailored.highlights = generateSummary(masterProfile, targetRole, targetLocation);

    // Filter certifications by relevance
    if (masterProfile.certifications) {
        const entries = splitEntries(masterProfile.certifications);
        const { kept, dropped } = filterByRelevance(entries, keywords, 2);
        tailored.certifications = kept.join('\n');
        droppedItems.push(...dropped.map(d => `cert: ${d.slice(0, 50)}`));
        relevanceScores.certifications = scoreRelevance(tailored.certifications, keywords);
    }

    // Filter projects by relevance
    if (masterProfile.projects) {
        const entries = splitEntries(masterProfile.projects);
        const { kept, dropped } = filterByRelevance(entries, keywords, 2);
        tailored.projects = kept.join('\n\n');
        droppedItems.push(...dropped.map(d => `project: ${d.split('\n')[0].slice(0, 50)}`));
        relevanceScores.projects = scoreRelevance(tailored.projects, keywords);
    }

    // Copy remaining sections as-is
    for (const key of ['publications', 'languages', 'volunteering', 'summary_templates']) {
        if (masterProfile[key]) {
            tailored[key] = masterProfile[key];
        }
    }

    return { tailoredSections: tailored, relevanceScores, droppedItems };
}

module.exports = { TOOL_DEF, handler, buildRoleKeywords, scoreRelevance };
