'use strict';

/**
 * company_research domain tool — Generate company research briefs.
 *
 * Fetches publicly available information about a company and
 * synthesizes a structured brief for interview preparation.
 */

const toolServiceClient = require('../core/toolServiceClient');
const knowledgeClient = require('../core/knowledgeClient');

const TOOL_DEF = {
    name: 'company_research',
    description: 'Research a company and generate a structured brief including overview, culture, tech stack, recent news, and interview tips.',
    parameters: {
        type: 'object',
        properties: {
            company: { type: 'string', description: 'Company name to research' },
            jobUrl: { type: 'string', description: 'Job listing URL for additional context' },
            scope: { type: 'string', description: 'Knowledge store scope (default user:global)' }
        },
        required: ['company']
    },
    category: 'job-seek'
};

/**
 * Extract company info from a fetched page.
 * @param {object} extracted - Result from http_extract
 * @param {string} company
 * @returns {object}
 */
function parseCompanyInfo(extracted, company) {
    const info = {
        name: company,
        description: '',
        industry: '',
        size: '',
        founded: '',
        headquarters: '',
        website: '',
        techStack: [],
        values: [],
        recentNews: []
    };

    if (!extracted) return info;

    // Extract description
    const desc = extracted.description || extracted.about || extracted.overview || '';
    info.description = desc.slice(0, 500);

    // Look for common patterns
    const text = JSON.stringify(extracted).toLowerCase();

    // Industry detection
    const industries = ['technology', 'finance', 'healthcare', 'education', 'retail', 'manufacturing', 'consulting', 'media', 'energy', 'automotive'];
    info.industry = industries.find(i => text.includes(i)) || '';

    // Company size patterns
    const sizeMatch = text.match(/(\d[\d,]+)\s*(employees|people|team members)/);
    if (sizeMatch) info.size = sizeMatch[0];

    // Tech stack detection
    const techKeywords = ['react', 'angular', 'vue', 'node', 'python', 'java', 'go', 'rust', 'kubernetes', 'docker',
        'aws', 'azure', 'gcp', 'typescript', 'postgresql', 'mongodb', 'redis', 'graphql', 'microservices'];
    info.techStack = techKeywords.filter(t => text.includes(t));

    return info;
}

/**
 * Build a research brief in Markdown.
 * @param {object} info - Parsed company info
 * @returns {string}
 */
function buildBrief(info) {
    const sections = [];

    sections.push(`# ${info.name} — Company Research Brief`);
    sections.push('');

    if (info.description) {
        sections.push('## Overview');
        sections.push(info.description);
        sections.push('');
    }

    const details = [];
    if (info.industry) details.push(`- **Industry:** ${info.industry}`);
    if (info.size) details.push(`- **Size:** ${info.size}`);
    if (info.founded) details.push(`- **Founded:** ${info.founded}`);
    if (info.headquarters) details.push(`- **HQ:** ${info.headquarters}`);
    if (info.website) details.push(`- **Website:** ${info.website}`);

    if (details.length > 0) {
        sections.push('## Details');
        sections.push(details.join('\n'));
        sections.push('');
    }

    if (info.techStack.length > 0) {
        sections.push('## Tech Stack');
        sections.push(info.techStack.map(t => `- ${t}`).join('\n'));
        sections.push('');
    }

    if (info.values.length > 0) {
        sections.push('## Values & Culture');
        sections.push(info.values.map(v => `- ${v}`).join('\n'));
        sections.push('');
    }

    sections.push('## Interview Preparation Tips');
    sections.push('- Research the company\'s recent product launches and announcements');
    sections.push('- Prepare questions about team structure and engineering practices');
    if (info.techStack.length > 0) {
        sections.push(`- Review your experience with: ${info.techStack.join(', ')}`);
    }
    sections.push('- Understand the company\'s position in the market');
    sections.push('');

    return sections.join('\n');
}

/**
 * Research a company.
 */
async function researchCompany(company, jobUrl, scope = 'user:global') {
    if (!company) throw new Error('company name is required');

    let extracted = null;

    // Try to fetch company info from the web
    try {
        // Try company website or job page
        const targetUrl = jobUrl || `https://www.google.com/search?q=${encodeURIComponent(company + ' company about')}`;
        const result = await toolServiceClient.executeTool('http_extract', {
            url: targetUrl,
            selectors: {
                description: '.about, .company-description, .overview, [data-testid="about"], p',
                about: '.about-us, #about, .company-info',
                overview: '.overview, .mission, .values'
            }
        });

        if (result.success) {
            extracted = result.result;
        }
    } catch {
        // Continue without web data
    }

    const info = parseCompanyInfo(extracted, company);
    const brief = buildBrief(info);

    // Store in knowledge store
    await knowledgeClient.upsert({
        refId: `company_${company.toLowerCase().replace(/\s+/g, '_')}`,
        type: 'company_info',
        content: info,
        summary: `Research brief for ${company}`,
        tags: [company, info.industry].filter(Boolean),
        scope,
        source: 'company_research'
    });

    return {
        company,
        brief,
        info,
        stored: true
    };
}

/**
 * Handler for the domain tool.
 */
async function handler(params) {
    return await researchCompany(params.company, params.jobUrl, params.scope);
}

module.exports = { TOOL_DEF, handler, parseCompanyInfo, buildBrief, researchCompany };
