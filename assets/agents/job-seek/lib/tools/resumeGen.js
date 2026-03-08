'use strict';

/**
 * tailor_resume domain tool — Generate a tailored resume based on profile + job requirements.
 *
 * Uses AI to rewrite profile sections to match the target JD.
 * Returns Markdown artifact ready for rendering.
 */

const TOOL_DEF = {
    name: 'tailor_resume',
    description: 'Generate a tailored resume from user profile matched against job requirements. Returns resume in Markdown format.',
    parameters: {
        type: 'object',
        properties: {
            profile: {
                type: 'object',
                description: 'User profile: { basic, skills, experience, education, highlights }'
            },
            requirements: {
                type: 'object',
                description: 'Job requirements from parse_listing'
            },
            matchResult: {
                type: 'object',
                description: 'Match result from match_profile (optional, for emphasis guidance)'
            },
            jobTitle: { type: 'string', description: 'Target job title' },
            company: { type: 'string', description: 'Target company name' },
            style: { type: 'string', description: 'Resume style: professional (default), academic, creative' }
        },
        required: ['profile']
    },
    category: 'job-seek'
};

/**
 * Generate tailored resume as Markdown.
 * @param {object} params
 * @returns {object} { markdown, summary }
 */
function handler({ profile, requirements, matchResult, jobTitle, company, style = 'professional' }) {
    if (!profile) throw new Error('profile is required');

    const basic = profile.basic || '';
    const skills = profile.skills || '';
    const experience = profile.experience || '';
    const education = profile.education || '';
    const highlights = profile.highlights || '';

    // Determine which skills to emphasize based on match result
    const matchedSkills = matchResult?.breakdown?.skills?.matched || [];
    const targetTitle = jobTitle || requirements?.title || '';
    const targetCompany = company || '';

    // Build resume sections
    const sections = [];

    // Header
    const nameMatch = basic.match(/^([^,\n]+)/);
    const name = nameMatch ? nameMatch[1].trim() : 'Name';
    sections.push(`# ${name}`);

    if (targetTitle) {
        sections.push(`**${targetTitle}${targetCompany ? ` — Target: ${targetCompany}` : ''}**`);
    }

    // Contact info (from basic, after first line)
    const contactInfo = basic.split(/[,\n]/).slice(1).map(s => s.trim()).filter(Boolean);
    if (contactInfo.length) {
        sections.push(contactInfo.join(' | '));
    }
    sections.push('');

    // Professional Summary / Highlights
    if (highlights) {
        sections.push('## Summary');
        sections.push(highlights);
        sections.push('');
    } else if (targetTitle && skills) {
        // Auto-generate a brief summary
        const topSkills = skills.split(/[,\n]/).slice(0, 5).map(s => s.trim().replace(/^[-•]\s*/, '')).filter(Boolean);
        sections.push('## Summary');
        sections.push(`Experienced professional with expertise in ${topSkills.join(', ')}${targetTitle ? `, seeking a ${targetTitle} role` : ''}.`);
        sections.push('');
    }

    // Skills — emphasize matched ones
    if (skills) {
        sections.push('## Skills');
        const skillList = skills.split(/[,\n]/).map(s => s.trim().replace(/^[-•]\s*/, '')).filter(Boolean);

        if (matchedSkills.length > 0) {
            // Group: matched first, then others
            const matched = [];
            const other = [];
            for (const s of skillList) {
                const isMatched = matchedSkills.some(ms =>
                    s.toLowerCase().includes(ms.toLowerCase()) || ms.toLowerCase().includes(s.toLowerCase())
                );
                if (isMatched) {
                    matched.push(`**${s}**`);
                } else {
                    other.push(s);
                }
            }
            sections.push([...matched, ...other].map(s => `- ${s}`).join('\n'));
        } else {
            sections.push(skillList.map(s => `- ${s}`).join('\n'));
        }
        sections.push('');
    }

    // Experience
    if (experience) {
        sections.push('## Experience');
        sections.push(formatMultiLine(experience));
        sections.push('');
    }

    // Education
    if (education) {
        sections.push('## Education');
        sections.push(formatMultiLine(education));
        sections.push('');
    }

    const markdown = sections.join('\n');

    return {
        markdown,
        format: 'markdown',
        targetJob: targetTitle,
        targetCompany,
        style,
        generatedAt: new Date().toISOString()
    };
}

/**
 * Format multi-line content (experience, education) for resume display.
 */
function formatMultiLine(text) {
    if (!text) return '';
    // If already has bullet points or newlines, preserve structure
    if (text.includes('\n')) {
        return text.split('\n').map(line => {
            line = line.trim();
            if (!line) return '';
            if (line.startsWith('-') || line.startsWith('•') || line.startsWith('*')) return line;
            return `- ${line}`;
        }).filter(Boolean).join('\n');
    }
    // Single line — just return as-is
    return text;
}

module.exports = { TOOL_DEF, handler, formatMultiLine };
