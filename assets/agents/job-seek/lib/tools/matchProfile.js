'use strict';

/**
 * match_profile domain tool — Compare user profile against job requirements.
 *
 * Performs keyword-based scoring (no AI call needed for basic matching).
 * Returns match score (0-100), matched skills, missing skills, and recommendations.
 */

const TOOL_DEF = {
    name: 'match_profile',
    description: 'Compare user profile against job requirements. Returns match score (0-100), matched skills, gaps, and recommendations.',
    parameters: {
        type: 'object',
        properties: {
            profile: {
                type: 'object',
                description: 'User profile with sections: basic, skills, experience, education, highlights'
            },
            requirements: {
                type: 'object',
                description: 'Job requirements from parse_listing: title, sections (technical, experience, education, soft_skills)'
            },
            jobTitle: { type: 'string', description: 'Job title for context' },
            jobUrl: { type: 'string', description: 'Job listing URL for reference' }
        },
        required: ['profile', 'requirements']
    },
    category: 'job-seek'
};

/**
 * Extract individual skill tokens from a text block.
 * @param {string} text
 * @returns {string[]} Normalized skill tokens
 */
function extractSkillTokens(text) {
    if (!text) return [];

    // Split by common delimiters and clean up
    const raw = text
        .replace(/[-–•·]/g, ',')  // bullet points
        .replace(/\n/g, ',')
        .split(/[,;|/]+/)
        .map(s => s.trim().toLowerCase())
        .filter(s => s.length > 1 && s.length < 50);

    // Deduplicate
    return [...new Set(raw)];
}

/**
 * Calculate match score between profile skills and requirement skills.
 * @param {string[]} profileTokens
 * @param {string[]} requirementTokens
 * @returns {{ score: number, matched: string[], missing: string[] }}
 */
function calculateSkillMatch(profileTokens, requirementTokens) {
    if (!requirementTokens.length) {
        return { score: 50, matched: [], missing: [] }; // neutral if no requirements
    }

    const matched = [];
    const missing = [];

    for (const req of requirementTokens) {
        const found = profileTokens.some(p =>
            p.includes(req) || req.includes(p) ||
            // Handle common abbreviations
            normalizeSkill(p) === normalizeSkill(req)
        );
        if (found) {
            matched.push(req);
        } else {
            missing.push(req);
        }
    }

    const score = Math.round((matched.length / requirementTokens.length) * 100);
    return { score, matched, missing };
}

/**
 * Normalize a skill name for comparison.
 */
function normalizeSkill(s) {
    return s.toLowerCase()
        .replace(/\.js$/i, '')
        .replace(/\.io$/i, '')
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9+#]/gi, '');
}

/**
 * Calculate experience match.
 * @param {string} profileExp - User's experience text
 * @param {string} reqExp - Required experience text
 * @returns {{ score: number, detail: string }}
 */
function calculateExperienceMatch(profileExp, reqExp) {
    if (!reqExp) return { score: 50, detail: 'No experience requirement specified' };

    // Try to extract years from requirement
    const reqYearsMatch = reqExp.match(/(\d+)\+?\s*(?:years?|yrs?|年)/i);
    const reqYears = reqYearsMatch ? parseInt(reqYearsMatch[1]) : 0;

    if (!reqYears) return { score: 50, detail: 'Could not determine required years' };

    // Try to extract years from profile
    const profileYearsMatch = (profileExp || '').match(/(\d+)\+?\s*(?:years?|yrs?|年)/i);
    const profileYears = profileYearsMatch ? parseInt(profileYearsMatch[1]) : 0;

    if (!profileYears) {
        // Count distinct companies/roles as rough estimate
        const roleCount = ((profileExp || '').match(/(?:worked|engineer|developer|manager|analyst|at\s)/gi) || []).length;
        const estimatedYears = roleCount * 2;
        if (estimatedYears >= reqYears) {
            return { score: 70, detail: `Estimated ${estimatedYears} years from ${roleCount} roles (needed: ${reqYears}+)` };
        }
        return { score: 30, detail: `Cannot determine experience years (needed: ${reqYears}+)` };
    }

    if (profileYears >= reqYears) {
        return { score: 100, detail: `${profileYears} years meets ${reqYears}+ requirement` };
    } else if (profileYears >= reqYears - 1) {
        return { score: 70, detail: `${profileYears} years close to ${reqYears}+ requirement` };
    } else {
        return { score: Math.round((profileYears / reqYears) * 100), detail: `${profileYears} years below ${reqYears}+ requirement` };
    }
}

/**
 * Execute profile matching.
 * @param {object} params
 * @param {object} params.profile - { basic, skills, experience, education, highlights }
 * @param {object} params.requirements - { title, sections: { technical, experience, education, soft_skills } }
 * @param {string} [params.jobTitle]
 * @param {string} [params.jobUrl]
 * @returns {object}
 */
function handler({ profile, requirements, jobTitle, jobUrl }) {
    if (!profile) throw new Error('profile is required');
    if (!requirements) throw new Error('requirements is required');

    const sections = requirements.sections || {};

    // Skill matching
    const profileSkills = extractSkillTokens(profile.skills || '');
    const reqSkills = extractSkillTokens(sections.technical || '');
    const skillMatch = calculateSkillMatch(profileSkills, reqSkills);

    // Experience matching
    const expMatch = calculateExperienceMatch(
        profile.experience || '',
        sections.experience || ''
    );

    // Education matching (simple keyword check)
    const profileEdu = (profile.education || '').toLowerCase();
    const reqEdu = (sections.education || '').toLowerCase();
    let eduScore = 50;
    let eduDetail = 'No education requirement specified';
    if (reqEdu) {
        if (reqEdu.includes('phd') || reqEdu.includes('博士')) {
            eduScore = profileEdu.includes('phd') || profileEdu.includes('博士') ? 100 : 30;
        } else if (reqEdu.includes('master') || reqEdu.includes('硕士')) {
            eduScore = (profileEdu.includes('master') || profileEdu.includes('phd') || profileEdu.includes('硕士') || profileEdu.includes('博士')) ? 100 : 50;
        } else if (reqEdu.includes('bachelor') || reqEdu.includes('本科') || reqEdu.includes('degree')) {
            eduScore = (profileEdu.includes('bachelor') || profileEdu.includes('master') || profileEdu.includes('phd') ||
                       profileEdu.includes('本科') || profileEdu.includes('硕士') || profileEdu.includes('博士') ||
                       profileEdu.includes('degree')) ? 100 : 40;
        }
        eduDetail = `Education match: ${eduScore}%`;
    }

    // Weighted overall score
    const overallScore = Math.round(
        skillMatch.score * 0.5 +
        expMatch.score * 0.3 +
        eduScore * 0.2
    );

    return {
        jobTitle: jobTitle || requirements.title || '',
        jobUrl: jobUrl || '',
        overallScore,
        breakdown: {
            skills: { score: skillMatch.score, matched: skillMatch.matched, missing: skillMatch.missing },
            experience: { score: expMatch.score, detail: expMatch.detail },
            education: { score: eduScore, detail: eduDetail }
        },
        matchedAt: new Date().toISOString()
    };
}

module.exports = {
    TOOL_DEF,
    handler,
    extractSkillTokens,
    calculateSkillMatch,
    calculateExperienceMatch,
    normalizeSkill
};
