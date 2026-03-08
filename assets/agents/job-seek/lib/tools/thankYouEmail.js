'use strict';

/**
 * thank_you_email domain tool — Generate a post-interview thank-you email.
 */

const TOOL_DEF = {
    name: 'thank_you_email',
    description: 'Generate a post-interview thank-you email based on interview notes and job context. Returns Markdown text.',
    parameters: {
        type: 'object',
        properties: {
            profile: { type: 'object', description: 'User profile (basic info for name)' },
            jobTitle: { type: 'string', description: 'Job title interviewed for' },
            company: { type: 'string', description: 'Company name' },
            interviewerName: { type: 'string', description: 'Interviewer name' },
            interviewNotes: { type: 'string', description: 'Notes from the interview: topics discussed, key points' },
            interviewDate: { type: 'string', description: 'Interview date' }
        },
        required: ['jobTitle']
    },
    category: 'job-seek'
};

/**
 * Generate thank-you email as Markdown.
 */
function handler({ profile, jobTitle, company, interviewerName, interviewNotes, interviewDate }) {
    if (!jobTitle) throw new Error('jobTitle is required');

    const basic = profile?.basic || '';
    const nameMatch = basic.match(/^([^,\n]+)/);
    const senderName = nameMatch ? nameMatch[1].trim() : '[Your Name]';

    const greeting = interviewerName
        ? `Dear ${interviewerName},`
        : 'Dear Interviewer,';

    const sections = [];

    // Subject line
    sections.push(`**Subject:** Thank You — ${jobTitle} Interview${company ? ` at ${company}` : ''}`);
    sections.push('');

    // Greeting
    sections.push(greeting);
    sections.push('');

    // Opening
    const dateRef = interviewDate
        ? ` on ${interviewDate}`
        : ' today';
    sections.push(`Thank you for taking the time to speak with me${dateRef} about the **${jobTitle}** position${company ? ` at **${company}**` : ''}. I truly enjoyed our conversation and learning more about the role and the team.`);
    sections.push('');

    // Reference interview discussion
    if (interviewNotes) {
        const points = interviewNotes.split(/[.\n]/)
            .map(s => s.trim())
            .filter(s => s.length > 10)
            .slice(0, 3);
        if (points.length) {
            sections.push(`I was particularly interested in our discussion about ${points[0].toLowerCase()}. ${points.length > 1 ? `The topics around ${points[1].toLowerCase()} also resonated with my experience.` : ''}`);
            sections.push('');
        }
    }

    // Closing
    sections.push('I am very enthusiastic about the opportunity and confident that my skills would be a valuable addition to your team. Please do not hesitate to reach out if you need any additional information.');
    sections.push('');
    sections.push('Best regards,');
    sections.push(senderName);

    const markdown = sections.join('\n');

    return {
        markdown,
        format: 'markdown',
        targetJob: jobTitle,
        targetCompany: company || '',
        generatedAt: new Date().toISOString()
    };
}

module.exports = { TOOL_DEF, handler };
