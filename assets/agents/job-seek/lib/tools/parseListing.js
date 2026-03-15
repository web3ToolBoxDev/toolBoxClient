'use strict';

/**
 * parse_listing domain tool — Fetch a job listing URL and extract structured requirements.
 *
 * Flow: URL → http_fetch (extract) → parse requirements → return structured data
 */

const toolServiceClient = require('../core/toolServiceClient');

const TOOL_DEF = {
    name: 'parse_listing',
    description: 'Fetch a job listing page and extract structured job requirements including title, company, location, salary, required skills, experience level, education, and full description.',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'URL of the job listing to parse' },
            useBrowser: { type: 'boolean', description: 'Force browser mode instead of HTTP (default false)' }
        },
        required: ['url']
    },
    category: 'job-seek'
};

/**
 * Extract structured requirements from fetched page content.
 * @param {object} fetchResult - Result from http_fetch or page_extract
 * @returns {object} Structured requirements
 */
function extractRequirements(fetchResult) {
    const text = fetchResult.text || fetchResult.body || '';
    const title = fetchResult.title || '';

    // Extract sections from description text
    const requirements = {
        title: title,
        fullText: text.slice(0, 5000),
        sections: {
            technical: extractSection(text, ['skills', 'requirements', 'qualifications', 'technical', 'technologies', '技能', '要求', '资质']),
            experience: extractSection(text, ['experience', 'years', '经验', '年']),
            education: extractSection(text, ['education', 'degree', 'bachelor', 'master', 'phd', '学历', '学位']),
            soft_skills: extractSection(text, ['communication', 'team', 'leadership', 'collaboration', '沟通', '团队', '领导力']),
            responsibilities: extractSection(text, ['responsibilities', 'duties', 'role', 'what you', '职责', '负责']),
            benefits: extractSection(text, ['benefits', 'perks', 'offer', 'we provide', '福利', '待遇']),
            niceToHave: extractNiceToHave(text)
        }
    };

    // Remove nice-to-have skills from technical to avoid double-counting
    if (requirements.sections.niceToHave && requirements.sections.technical) {
        const nthLower = requirements.sections.niceToHave.toLowerCase();
        if (nthLower) {
            // Filter out sentences that appear in niceToHave from technical
            const nthSentences = new Set(nthLower.split(/[.。]+/).map(s => s.trim()).filter(Boolean));
            const techSentences = requirements.sections.technical.split(/\.\s*/);
            const filtered = techSentences.filter(s => !nthSentences.has(s.trim().toLowerCase()));
            requirements.sections.technical = filtered.join('. ').trim();
        }
    }

    // Extract salary mentions
    const salaryMatch = text.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\s*(?:per|\/)\s*(?:year|yr|hour|hr|month|annum))?/i)
        || text.match(/[\d,]+\s*[kK]\s*[-–]\s*[\d,]+\s*[kK]/);
    if (salaryMatch) {
        requirements.salary = salaryMatch[0].trim();
    }

    return requirements;
}

/**
 * Extract "Nice to Have" / "Bonus" / "Preferred" skills from text.
 * Looks for headed sections AND inline markers like "X is a plus".
 * @param {string} text
 * @returns {string}
 */
function extractNiceToHave(text) {
    if (!text) return '';

    const results = [];

    // Strategy 1: Find headed sections (e.g. "Nice to Have:", "Bonus:", "Preferred Qualifications:")
    const headingPattern = /(?:nice\s*(?:to\s*)?have|bonus|preferred|preferred\s+qualifications?|a?\s*plus|加分项|优先|额外)[:\s]*\n?([\s\S]*?)(?=\n\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*:|$))/gi;
    let headMatch;
    while ((headMatch = headingPattern.exec(text)) !== null) {
        const body = headMatch[1].trim();
        if (body.length > 5 && body.length < 2000) {
            results.push(body);
        }
    }

    // Strategy 2: Find inline markers ("X is a plus", "X preferred", "bonus: X")
    const sentences = text.split(/[.!?。！？\n]+/).filter(s => s.trim().length > 10);
    const inlinePatterns = [
        /(?:is\s+a\s+plus|is\s+a\s+bonus|nice\s+to\s+have|preferred|would\s+be\s+a\s+(?:plus|bonus)|advantageous|desirable|a\s+plus)/i,
        /(?:加分|优先|额外|更好)/
    ];
    for (const s of sentences) {
        if (inlinePatterns.some(p => p.test(s))) {
            const trimmed = s.trim();
            // Avoid duplicates with headed sections
            if (!results.some(r => r.includes(trimmed))) {
                results.push(trimmed);
            }
        }
    }

    return results.join('. ').slice(0, 1000) || '';
}

/**
 * Extract relevant sentences from text for a given topic.
 * @param {string} text
 * @param {string[]} keywords
 * @returns {string}
 */
function extractSection(text, keywords) {
    if (!text) return '';

    const sentences = text.split(/[.!?。！？\n]+/).filter(s => s.trim().length > 10);
    const relevant = sentences.filter(s => {
        const lower = s.toLowerCase();
        return keywords.some(kw => lower.includes(kw.toLowerCase()));
    });

    return relevant.map(s => s.trim()).join('. ').slice(0, 1000) || '';
}

/**
 * Execute parse_listing.
 * @param {object} params
 * @param {string} params.url
 * @param {boolean} [params.useBrowser=false]
 * @returns {Promise<object>}
 */
async function handler({ url, useBrowser = false }) {
    if (!url) throw new Error('url is required');

    let fetchResult;

    if (useBrowser) {
        // Browser mode
        const launch = await toolServiceClient.executeTool('browser_launch', { headless: true });
        if (!launch.success) throw new Error(`Browser launch failed: ${launch.error}`);
        const browserId = launch.result.browserId;

        try {
            const goto = await toolServiceClient.executeTool('page_goto', { browserId, url });
            if (!goto.success) throw new Error(`Navigation failed: ${goto.error}`);

            const extract = await toolServiceClient.executeTool('page_extract', { browserId, selector: 'body' });
            fetchResult = {
                title: goto.result?.title || '',
                text: extract.success ? extract.result?.result || '' : '',
                url: goto.result?.url || url
            };
        } finally {
            await toolServiceClient.executeTool('browser_close', { browserId });
        }
    } else {
        // HTTP mode
        const result = await toolServiceClient.executeTool('http_fetch', {
            url,
            extract: true,
            retries: 1
        });

        if (!result.success) {
            throw new Error(`HTTP fetch failed: ${result.error}`);
        }

        fetchResult = {
            title: result.result?.title || '',
            text: result.result?.text || result.result?.body || '',
            url
        };
    }

    const requirements = extractRequirements(fetchResult);
    requirements.url = url;
    requirements.parsedAt = new Date().toISOString();

    return requirements;
}

module.exports = { TOOL_DEF, handler, extractRequirements, extractSection, extractNiceToHave };
