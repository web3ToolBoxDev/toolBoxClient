'use strict';

/**
 * linkedin_optimizer domain tool — Compare LinkedIn profile against target roles.
 *
 * Analyzes profile text vs job requirements and suggests improvements
 * for headline, summary, skills, and experience sections.
 */

const TOOL_DEF = {
    name: 'linkedin_optimizer',
    description: 'Analyze a LinkedIn profile against target job roles and suggest improvements for headline, summary, skills, and experience.',
    parameters: {
        type: 'object',
        properties: {
            profile: { type: 'object', description: 'User profile: { basic, skills, experience, education }' },
            targetRoles: { type: 'array', description: 'Array of target job titles or descriptions' },
            currentHeadline: { type: 'string', description: 'Current LinkedIn headline' },
            currentSummary: { type: 'string', description: 'Current LinkedIn summary/about section' }
        },
        required: ['profile']
    },
    category: 'job-seek'
};

/**
 * Extract keywords from text, filtering common words.
 */
function extractKeywords(text) {
    if (!text) return [];
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
        'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can',
        'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
        'he', 'she', 'it', 'they', 'them', 'its', 'not', 'no', 'so', 'if', 'as', 'up',
        'out', 'about', 'into', 'over', 'after', 'all', 'also', 'new', 'more', 'very',
        'just', 'than', 'then', 'now', 'here', 'there', 'when', 'who', 'how', 'what'
    ]);
    return text.toLowerCase()
        .replace(/[^\w\s+#.]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w))
        .reduce((acc, w) => {
            if (!acc.includes(w)) acc.push(w);
            return acc;
        }, []);
}

/**
 * Analyze headline effectiveness.
 */
function analyzeHeadline(headline, targetRoles, profileSkills) {
    const suggestions = [];
    const score = { current: 0, issues: [] };

    if (!headline) {
        score.issues.push('No headline set');
        suggestions.push('Add a headline that includes your key role and top skills');
        return { score: 0, suggestions, issues: score.issues };
    }

    const words = headline.split(/\s+/).length;

    // Length check (ideal: 5-15 words)
    if (words < 3) {
        score.issues.push('Headline too short');
        suggestions.push('Expand headline to include skills and value proposition');
    } else if (words > 20) {
        score.issues.push('Headline too long');
        suggestions.push('Shorten headline — keep it under 15 words');
    } else {
        score.current += 25;
    }

    // Check for target role keywords
    const headlineLower = headline.toLowerCase();
    const roleKeywords = extractKeywords((targetRoles || []).join(' '));
    const matchedRoleKeywords = roleKeywords.filter(k => headlineLower.includes(k));
    if (matchedRoleKeywords.length > 0) {
        score.current += 35;
    } else if (targetRoles && targetRoles.length > 0) {
        suggestions.push(`Include target role keywords: ${roleKeywords.slice(0, 3).join(', ')}`);
    }

    // Check for skill keywords
    const skillKeywords = extractKeywords(profileSkills || '');
    const matchedSkills = skillKeywords.filter(k => headlineLower.includes(k));
    if (matchedSkills.length > 0) {
        score.current += 25;
    } else if (skillKeywords.length > 0) {
        suggestions.push(`Add top skills: ${skillKeywords.slice(0, 3).join(', ')}`);
    }

    // Value proposition check
    const valueWords = ['expert', 'specialist', 'passionate', 'experienced', 'lead', 'senior', 'building', 'driving', 'helping'];
    if (valueWords.some(v => headlineLower.includes(v))) {
        score.current += 15;
    } else {
        suggestions.push('Add a value-oriented word (e.g., "experienced", "specialist", "building")');
    }

    return { score: Math.min(100, score.current), suggestions, issues: score.issues };
}

/**
 * Analyze skills coverage.
 */
function analyzeSkills(profileSkills, targetRoles) {
    const profileTokens = extractKeywords(profileSkills || '');
    const roleTokens = extractKeywords((targetRoles || []).join(' '));

    const matched = roleTokens.filter(t => profileTokens.includes(t));
    const missing = roleTokens.filter(t => !profileTokens.includes(t));
    const coverage = roleTokens.length > 0 ? Math.round((matched.length / roleTokens.length) * 100) : 0;

    const suggestions = [];
    if (missing.length > 0) {
        suggestions.push(`Add missing skills if applicable: ${missing.slice(0, 5).join(', ')}`);
    }
    if (profileTokens.length < 5) {
        suggestions.push('Add more skills — aim for at least 10-15 relevant skills');
    }

    return {
        coverage,
        matched,
        missing: missing.slice(0, 10),
        totalProfileSkills: profileTokens.length,
        suggestions
    };
}

/**
 * Generate overall optimization report.
 */
function generateReport({ profile, targetRoles, currentHeadline, currentSummary }) {
    if (!profile) throw new Error('profile is required');

    const headlineAnalysis = analyzeHeadline(currentHeadline, targetRoles, profile.skills);
    const skillsAnalysis = analyzeSkills(profile.skills, targetRoles);

    const summarySuggestions = [];
    if (!currentSummary) {
        summarySuggestions.push('Add a LinkedIn summary/about section');
        summarySuggestions.push('Include: your professional background, key achievements, and career goals');
    } else {
        const summaryWords = currentSummary.split(/\s+/).length;
        if (summaryWords < 50) summarySuggestions.push('Expand your summary — aim for 150-300 words');
        if (summaryWords > 500) summarySuggestions.push('Consider shortening your summary — keep it under 400 words');
        if (!/\d/.test(currentSummary)) summarySuggestions.push('Add specific metrics and achievements to your summary');
    }

    const experienceSuggestions = [];
    if (!profile.experience) {
        experienceSuggestions.push('Add work experience with specific achievements');
    } else {
        if (!/\d+/.test(profile.experience)) {
            experienceSuggestions.push('Add quantifiable achievements (e.g., "improved performance by 40%")');
        }
        if (targetRoles && targetRoles.length > 0) {
            const roleKw = extractKeywords(targetRoles.join(' '));
            const expKw = extractKeywords(profile.experience);
            const missingInExp = roleKw.filter(k => !expKw.includes(k)).slice(0, 3);
            if (missingInExp.length > 0) {
                experienceSuggestions.push(`Consider highlighting experience with: ${missingInExp.join(', ')}`);
            }
        }
    }

    const overallScore = Math.round(
        headlineAnalysis.score * 0.3 +
        skillsAnalysis.coverage * 0.4 +
        (currentSummary ? 60 : 0) * 0.15 +
        (profile.experience ? 70 : 0) * 0.15
    );

    return {
        overallScore,
        rating: overallScore >= 80 ? 'strong' : overallScore >= 60 ? 'good' : overallScore >= 40 ? 'needs_work' : 'weak',
        headline: headlineAnalysis,
        skills: skillsAnalysis,
        summary: { suggestions: summarySuggestions },
        experience: { suggestions: experienceSuggestions },
        topActions: [
            ...headlineAnalysis.suggestions.slice(0, 1),
            ...skillsAnalysis.suggestions.slice(0, 1),
            ...summarySuggestions.slice(0, 1),
            ...experienceSuggestions.slice(0, 1)
        ].slice(0, 5)
    };
}

/**
 * Handler for the domain tool.
 */
async function handler(params) {
    return generateReport(params);
}

module.exports = { TOOL_DEF, handler, generateReport, analyzeHeadline, analyzeSkills, extractKeywords };
