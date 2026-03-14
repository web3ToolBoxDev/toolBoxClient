'use strict';

/**
 * cover_letter domain tool — Generate a personalized cover letter.
 */

const TOOL_DEF = {
    name: 'cover_letter',
    description: 'Generate a personalized cover letter based on user profile, job requirements, and company info. Returns Markdown text.',
    parameters: {
        type: 'object',
        properties: {
            profile: { type: 'object', description: 'User profile: { basic, skills, experience, education, highlights }' },
            requirements: { type: 'object', description: 'Job requirements from parse_listing' },
            jobTitle: { type: 'string', description: 'Target job title' },
            company: { type: 'string', description: 'Company name' },
            tone: { type: 'string', description: 'Tone: professional (default), enthusiastic, concise' },
            hiringManager: { type: 'string', description: 'Hiring manager name (optional)' }
        },
        required: ['profile', 'jobTitle']
    },
    category: 'job-seek'
};

/**
 * Generate cover letter as Markdown.
 */
function handler({ profile, requirements, jobTitle, company, tone = 'professional', hiringManager }) {
    if (!profile) throw new Error('profile is required');
    if (!jobTitle) throw new Error('jobTitle is required');

    const basic = profile.basic || '';
    const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : (profile.skills || '');
    const experience = Array.isArray(profile.experience) ? profile.experience.join('\n') : (profile.experience || '');
    const highlights = profile.highlights || '';

    const nameMatch = basic.match(/^([^,\n]+)/);
    const name = nameMatch ? nameMatch[1].trim() : '';
    const contactInfo = basic.split(/[,\n]/).slice(1).map(s => s.trim()).filter(Boolean);

    const greeting = hiringManager
        ? `Dear ${hiringManager},`
        : 'Dear Hiring Manager,';

    // Extract top skills for the letter
    const topSkills = skills.split(/[,\n]/)
        .map(s => s.trim().replace(/^[-•]\s*/, ''))
        .filter(Boolean)
        .slice(0, 5);

    // Build letter sections
    const sections = [];

    // Header
    if (name) sections.push(name);
    if (contactInfo.length) sections.push(contactInfo.join(' | '));
    sections.push('');
    sections.push(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    sections.push('');

    // Greeting
    sections.push(greeting);
    sections.push('');

    // Opening paragraph
    const openingStyle = tone === 'enthusiastic'
        ? `I am thrilled to apply for the **${jobTitle}** position${company ? ` at **${company}**` : ''}. `
        : tone === 'concise'
        ? `I am writing to apply for the **${jobTitle}** role${company ? ` at **${company}**` : ''}. `
        : `I am writing to express my strong interest in the **${jobTitle}** position${company ? ` at **${company}**` : ''}. `;

    sections.push(openingStyle + (highlights
        ? highlights.split(/[.!?。]/)[0].trim() + '.'
        : `With experience in ${topSkills.slice(0, 3).join(', ')}, I believe I am well-suited for this role.`));
    sections.push('');

    // Skills & experience paragraph
    if (topSkills.length > 0) {
        sections.push(`My technical expertise includes ${topSkills.join(', ')}. `
            + (experience
                ? `In my previous roles, ${experience.split(/[.\n]/).filter(s => s.trim().length > 20).slice(0, 2).map(s => s.trim().replace(/^[-•]\s*/, '')).join('. ')}.`
                : ''));
        sections.push('');
    }

    // Alignment paragraph
    if (requirements?.sections?.technical) {
        const reqSkills = requirements.sections.technical.split(/[,;.\n]/).slice(0, 3).map(s => s.trim()).filter(Boolean);
        if (reqSkills.length) {
            sections.push(`Your requirements for ${reqSkills.join(', ')} align well with my background and I am eager to contribute to your team.`);
            sections.push('');
        }
    }

    // Closing
    sections.push('I would welcome the opportunity to discuss how my skills and experience can benefit your organization. Thank you for your time and consideration.');
    sections.push('');
    sections.push('Sincerely,');
    sections.push(name || '[Your Name]');

    const markdown = sections.join('\n');

    return {
        markdown,
        format: 'markdown',
        targetJob: jobTitle,
        targetCompany: company || '',
        tone,
        generatedAt: new Date().toISOString()
    };
}

module.exports = { TOOL_DEF, handler };
