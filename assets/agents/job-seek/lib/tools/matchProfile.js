'use strict';

/**
 * match_profile domain tool — Compare user profile against job requirements.
 *
 * Three-level matching with AI-generated skill taxonomy:
 *   1. Exact match (normalized)     → 1.0 credit
 *   2. Same-category match (taxonomy) → 0.6 credit (partial)
 *   3. No match                     → 0.0 credit
 *
 * Core skills (appear in job title) get weight × 1.5.
 * Nice-to-Have skills get weight × 0.5.
 */

const {
    BASE_TAXONOMY, BASE_ALIASES,
    resolveAlias, findCategory, isSameCategory, mergeTaxonomy
} = require('./skillTaxonomy');

const TOOL_DEF = {
    name: 'match_profile',
    description: 'Compare user profile against job requirements. Returns match score (0-100), matched/similar/missing skills, and interview prep suggestions.',
    parameters: {
        type: 'object',
        properties: {
            profile: {
                type: 'object',
                description: 'User profile with sections: basic, skills, experience, education, highlights'
            },
            requirements: {
                type: 'object',
                description: 'Job requirements from parse_listing: title, sections (technical, experience, education, soft_skills, niceToHave)'
            },
            jobTitle: { type: 'string', description: 'Job title for context' },
            jobUrl: { type: 'string', description: 'Job listing URL for reference' },
            skillTaxonomy: {
                type: 'object',
                description: 'AI-generated skill taxonomy { taxonomy, aliases } for smart matching'
            }
        },
        required: ['profile', 'requirements']
    },
    category: 'job-seek'
};

// ─── Skill extraction ───

/**
 * Extract individual skill tokens from a text block.
 * Returns array of { normalized, original } objects.
 * @param {string|string[]} text
 * @param {object} [aliases] - alias map for normalization
 * @returns {{ normalized: string, original: string }[]}
 */
function extractSkillTokens(text, aliases) {
    if (!text) return [];

    let rawTokens;
    if (Array.isArray(text)) {
        rawTokens = text.map(s => String(s).trim()).filter(Boolean);
    } else {
        if (typeof text !== 'string') text = String(text);
        rawTokens = text
            .replace(/[-–•·]/g, ',')  // bullet points
            .replace(/\n/g, ',')
            .split(/[,;|]+/)          // removed / from split — avoid splitting "CI/CD"
            .map(s => s.trim())
            .filter(s => s.length > 1 && s.length < 50);
    }

    // Normalize and deduplicate
    const seen = new Set();
    const result = [];
    for (const raw of rawTokens) {
        const lower = raw.toLowerCase();
        const norm = resolveAlias(lower, aliases);
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        result.push({ normalized: norm, original: lower });
    }
    return result;
}

/**
 * Normalize a skill name for comparison (legacy compat + used internally).
 */
function normalizeSkill(s) {
    return resolveAlias(s.toLowerCase());
}

// ─── Smart skill matching ───

/**
 * Check if a skill is a "core" skill based on job title.
 * Core skills appear in the job title and get higher weight.
 * @param {string} skill — normalized skill
 * @param {string} jobTitle — raw job title
 * @param {object} [aliases]
 * @returns {boolean}
 */
function isCoreSkill(skill, jobTitle, aliases) {
    if (!jobTitle) return false;
    const titleLower = jobTitle.toLowerCase();
    const titleTokens = titleLower.split(/[\s,/&+()-]+/).map(t => resolveAlias(t.trim(), aliases)).filter(Boolean);
    return titleTokens.includes(skill) || titleLower.includes(skill);
}

/**
 * Three-level smart skill matching with taxonomy support.
 * @param {{ normalized: string, original: string }[]} profileTokens
 * @param {{ normalized: string, original: string }[]} reqTokens
 * @param {string} [jobTitle]
 * @param {object} [taxonomy] — merged taxonomy object
 * @param {object} [aliases]
 * @param {{ normalized: string, original: string }[]} [niceToHaveTokens] — nice-to-have skills
 * @returns {{ score: number, matched: string[], similar: object[], missing: string[], niceToHave: { matched: string[], similar: object[], missing: string[] } }}
 */
function calculateSmartSkillMatch(profileTokens, reqTokens, jobTitle, taxonomy, aliases, niceToHaveTokens) {
    const profileNorms = profileTokens.map(t => t.normalized);
    const tax = taxonomy || BASE_TAXONOMY;

    if (!reqTokens.length && (!niceToHaveTokens || !niceToHaveTokens.length)) {
        return { score: 50, matched: [], similar: [], missing: [], niceToHave: { matched: [], similar: [], missing: [] } };
    }

    const matched = [];
    const similar = [];
    const missing = [];
    let totalWeight = 0;
    let earnedWeight = 0;

    // Process required skills
    for (const req of reqTokens) {
        const weight = isCoreSkill(req.normalized, jobTitle, aliases) ? 1.5 : 1.0;
        totalWeight += weight;

        // Level 1: Exact match (normalized comparison)
        if (profileNorms.includes(req.normalized)) {
            earnedWeight += weight * 1.0;
            matched.push(req.original);
            continue;
        }

        // Level 2: Same-category match (taxonomy-based partial credit)
        let foundSimilar = false;
        for (const pNorm of profileNorms) {
            const result = isSameCategory(req.normalized, pNorm, tax);
            if (result.same) {
                earnedWeight += weight * 0.6;
                similar.push({
                    req: req.original,
                    have: profileTokens.find(t => t.normalized === pNorm)?.original || pNorm,
                    category: result.category
                });
                foundSimilar = true;
                break;
            }
        }
        if (foundSimilar) continue;

        // Level 3: No match
        missing.push(req.original);
    }

    // Process nice-to-have skills (weight × 0.5)
    const nth = { matched: [], similar: [], missing: [] };
    if (niceToHaveTokens && niceToHaveTokens.length) {
        for (const req of niceToHaveTokens) {
            const weight = 0.5;
            totalWeight += weight;

            if (profileNorms.includes(req.normalized)) {
                earnedWeight += weight * 1.0;
                nth.matched.push(req.original);
                continue;
            }

            let foundSimilar = false;
            for (const pNorm of profileNorms) {
                const result = isSameCategory(req.normalized, pNorm, tax);
                if (result.same) {
                    earnedWeight += weight * 0.6;
                    nth.similar.push({
                        req: req.original,
                        have: profileTokens.find(t => t.normalized === pNorm)?.original || pNorm,
                        category: result.category
                    });
                    foundSimilar = true;
                    break;
                }
            }
            if (foundSimilar) continue;

            nth.missing.push(req.original);
        }
    }

    const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 50;
    return { score, matched, similar, missing, niceToHave: nth };
}

// ─── Legacy calculateSkillMatch (kept for backward compat) ───

/**
 * @deprecated Use calculateSmartSkillMatch instead.
 */
function calculateSkillMatch(profileTokens, requirementTokens) {
    if (!requirementTokens.length) {
        return { score: 50, matched: [], missing: [] };
    }
    // Convert string arrays to token objects for smart matching
    const pTokens = (typeof profileTokens[0] === 'string')
        ? profileTokens.map(s => ({ normalized: normalizeSkill(s), original: s }))
        : profileTokens;
    const rTokens = (typeof requirementTokens[0] === 'string')
        ? requirementTokens.map(s => ({ normalized: normalizeSkill(s), original: s }))
        : requirementTokens;

    const result = calculateSmartSkillMatch(pTokens, rTokens);
    return {
        score: result.score,
        matched: result.matched,
        missing: [...result.missing, ...result.similar.map(s => s.req)]
    };
}

// ─── Experience matching (unchanged) ───

/**
 * Calculate experience match.
 * @param {string} profileExp - User's experience text
 * @param {string} reqExp - Required experience text
 * @returns {{ score: number, detail: string }}
 */
function calculateExperienceMatch(profileExp, reqExp) {
    if (!reqExp) return { score: 50, detail: 'No experience requirement specified' };

    const reqYearsMatch = reqExp.match(/(\d+)\+?\s*(?:years?|yrs?|年)/i);
    const reqYears = reqYearsMatch ? parseInt(reqYearsMatch[1]) : 0;

    if (!reqYears) return { score: 50, detail: 'Could not determine required years' };

    const profileYearsMatch = (profileExp || '').match(/(\d+)\+?\s*(?:years?|yrs?|年)/i);
    const profileYears = profileYearsMatch ? parseInt(profileYearsMatch[1]) : 0;

    if (!profileYears) {
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

// ─── Main handler ───

/**
 * Execute profile matching.
 * @param {object} params
 * @param {object} params.profile - { basic, skills, experience, education, highlights }
 * @param {object} params.requirements - { title, sections: { technical, experience, education, soft_skills, niceToHave } }
 * @param {string} [params.jobTitle]
 * @param {string} [params.jobUrl]
 * @param {object} [params.skillTaxonomy] - { taxonomy, aliases } from AI or null
 * @returns {object}
 */
function handler({ profile, requirements, jobTitle, jobUrl, skillTaxonomy }) {
    if (!profile) throw new Error('profile is required');
    if (!requirements) throw new Error('requirements is required');

    const sections = requirements.sections || {};

    // Resolve taxonomy: merge AI-generated with base fallback
    const merged = skillTaxonomy
        ? mergeTaxonomy({ taxonomy: BASE_TAXONOMY, aliases: BASE_ALIASES }, skillTaxonomy)
        : { taxonomy: BASE_TAXONOMY, aliases: BASE_ALIASES };
    const { taxonomy, aliases } = merged;

    // Skill matching (three-level + core skill weighting)
    const profileSkills = extractSkillTokens(profile.skills || '', aliases);
    const reqSkills = extractSkillTokens(sections.technical || '', aliases);
    const niceToHaveSkills = extractSkillTokens(sections.niceToHave || '', aliases);
    const title = jobTitle || requirements.title || '';

    const skillMatch = calculateSmartSkillMatch(
        profileSkills, reqSkills, title, taxonomy, aliases, niceToHaveSkills
    );

    // Experience matching
    const expMatch = calculateExperienceMatch(
        Array.isArray(profile.experience) ? profile.experience.join('; ') : String(profile.experience || ''),
        Array.isArray(sections.experience) ? sections.experience.join('; ') : String(sections.experience || '')
    );

    // Education matching (simple keyword check — unchanged)
    const profileEdu = (Array.isArray(profile.education) ? profile.education.join(' ') : String(profile.education || '')).toLowerCase();
    const reqEdu = (Array.isArray(sections.education) ? sections.education.join(' ') : String(sections.education || '')).toLowerCase();
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

    // Interview prep suggestions
    const interviewPrep = [
        ...skillMatch.similar.map(s =>
            `${s.req} (you know ${s.have}, same category: ${s.category})`
        ),
        ...skillMatch.missing.slice(0, 5).map(m =>
            `${m} (needs learning)`
        ),
        ...skillMatch.niceToHave.similar.map(s =>
            `${s.req} [nice-to-have] (you know ${s.have}, same category: ${s.category})`
        ),
        ...skillMatch.niceToHave.missing.slice(0, 3).map(m =>
            `${m} [nice-to-have] (bonus if learned)`
        )
    ];

    return {
        jobTitle: title,
        jobUrl: jobUrl || '',
        overallScore,
        breakdown: {
            skills: {
                score: skillMatch.score,
                matched: skillMatch.matched,
                similar: skillMatch.similar,
                missing: skillMatch.missing,
                niceToHave: skillMatch.niceToHave
            },
            experience: { score: expMatch.score, detail: expMatch.detail },
            education: { score: eduScore, detail: eduDetail }
        },
        interviewPrep,
        matchedAt: new Date().toISOString()
    };
}

/**
 * Build AI matching prompt — sends profile + full JD to AI for structured scoring.
 * @param {object} profile - { skills, experience, education }
 * @param {string} jdFullText - Full job description text
 * @param {string} jobTitle - Job title
 * @param {object} [taxonomy] - Merged taxonomy { taxonomy: {...}, aliases: {...} }
 * @returns {string} Prompt text
 */
function buildMatchPrompt(profile, jdFullText, jobTitle, taxonomy, userPreferences) {
    const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : (profile.skills || '');
    const experience = Array.isArray(profile.experience) ? profile.experience.join('\n') : (profile.experience || '');
    const education = Array.isArray(profile.education) ? profile.education.join('\n') : (profile.education || '');

    // Build concise taxonomy summary (top categories only, keep prompt short)
    let taxonomySummary = '';
    if (taxonomy && taxonomy.taxonomy) {
        const cats = Object.entries(taxonomy.taxonomy).slice(0, 20);
        taxonomySummary = cats.map(([cat, skills]) =>
            `${cat}: ${skills.slice(0, 8).join(', ')}`
        ).join('\n');
    }

    return `Compare this candidate's profile against a job description and score the match.

## Candidate Profile
Skills: ${skills}
Experience: ${experience.slice(0, 500)}
Education: ${education.slice(0, 300)}

## Job Description
Title: ${jobTitle || 'Unknown'}
${jdFullText.slice(0, 4000)}

${taxonomySummary ? `## Skill Taxonomy (skills in same category are similar/substitutable)\n${taxonomySummary}` : ''}
${userPreferences ? `\n## User Search Preferences\nThe candidate has specified the following preferences that MUST heavily influence scoring:\n${userPreferences}\n\nIf the job conflicts with these preferences, significantly lower the overall score. If the job aligns with these preferences, boost the score.` : ''}

## Scoring Rules
- Overall = skills × 50% + experience × 30% + education × 20%
- Exact skill match = full credit
- Same-category skill (from taxonomy above) = 60% credit → record in "similar" with category name
- Skills mentioned in job title = core skills, weight × 1.5
- "Nice to have" / "preferred" / "bonus" / "a plus" skills = weight × 0.5, track separately in niceToHave
- Experience: 100 if meets/exceeds requirement, 70 if close (within 1 year), 40 if under, 50 if unspecified
- Education: 100 if matches, 40-50 if partial match, 50 if unspecified

## Output
Return ONLY valid JSON (no markdown fences, no explanation):
{"overallScore":0,"breakdown":{"skills":{"score":0,"matched":[],"similar":[{"req":"","have":"","category":""}],"missing":[],"niceToHave":{"matched":[],"similar":[],"missing":[]}},"experience":{"score":0,"detail":""},"education":{"score":0,"detail":""}},"interviewPrep":[]}`;
}

/**
 * Parse AI matching response — extract structured JSON from AI text.
 * @param {string} aiText - Raw AI response
 * @returns {object|null} Parsed match result or null
 */
function parseMatchResponse(aiText) {
    if (!aiText || typeof aiText !== 'string') return null;

    let text = aiText.trim();

    // Strip markdown fences
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) text = fenceMatch[1].trim();

    // Try to find JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
        const parsed = JSON.parse(jsonMatch[0]);

        // Validate required fields
        if (typeof parsed.overallScore !== 'number') return null;
        if (!parsed.breakdown) return null;

        // Ensure structure completeness with defaults
        const b = parsed.breakdown;
        if (!b.skills) b.skills = { score: 0, matched: [], similar: [], missing: [], niceToHave: { matched: [], similar: [], missing: [] } };
        if (!b.skills.niceToHave) b.skills.niceToHave = { matched: [], similar: [], missing: [] };
        if (!b.experience) b.experience = { score: 50, detail: '' };
        if (!b.education) b.education = { score: 50, detail: '' };
        if (!parsed.interviewPrep) parsed.interviewPrep = [];

        // Clamp score
        parsed.overallScore = Math.max(0, Math.min(100, Math.round(parsed.overallScore)));

        return parsed;
    } catch {
        return null;
    }
}

module.exports = {
    TOOL_DEF,
    handler,
    extractSkillTokens,
    calculateSkillMatch,
    calculateSmartSkillMatch,
    calculateExperienceMatch,
    normalizeSkill,
    isCoreSkill,
    buildMatchPrompt,
    parseMatchResponse
};
