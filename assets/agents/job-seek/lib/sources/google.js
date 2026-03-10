'use strict';

/**
 * Google Job Search Source Adapter — Uses Google search to find job listings.
 *
 * Strategy: search "job title location site:linkedin.com OR site:glassdoor.com"
 * then parse Google search results for job listing links.
 *
 * More reliable than direct Indeed scraping since Google search pages
 * are simpler HTML and less aggressively anti-bot.
 */

const toolServiceClient = require('../core/toolServiceClient');

/**
 * Build Google search URL for job listings.
 */
function buildSearchUrl({ query, location }) {
    const terms = [query];
    if (location) terms.push(location);
    terms.push('job');
    const q = terms.join(' ');
    return `https://www.google.com/search?q=${encodeURIComponent(q)}&num=20`;
}

/**
 * Parse Google search results HTML for job-like entries.
 * @param {string} html
 * @returns {Array<object>}
 */
function parseGoogleResults(html) {
    if (!html || typeof html !== 'string') return [];

    const listings = [];

    // Extract search result blocks — look for anchor tags with /url?q= pattern
    const linkPattern = /href="\/url\?q=(https?[^"&]+)[^"]*"[^>]*>([^<]+)/gi;
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
        const url = decodeURIComponent(match[1]);
        const text = match[2].replace(/<[^>]*>/g, '').trim();

        // Filter for job-related URLs
        if (isJobUrl(url) && text.length > 5) {
            listings.push({
                url: cleanUrl(url),
                title: extractTitle(text),
                company: '',
                location: '',
                salary: '',
                snippet: '',
                source: 'google',
                scrapedAt: new Date().toISOString()
            });
        }
    }

    // Also try to extract from structured text blocks
    const titlePattern = /<h3[^>]*>(.*?)<\/h3>/gi;
    while ((match = titlePattern.exec(html)) !== null) {
        const title = match[1].replace(/<[^>]*>/g, '').trim();
        if (title.length > 5 && title.length < 200) {
            // Find the link before this h3
            const before = html.substring(Math.max(0, match.index - 500), match.index);
            const linkMatch = before.match(/href="(https?:\/\/[^"]+)"/);
            if (linkMatch && isJobUrl(linkMatch[1])) {
                const url = cleanUrl(decodeURIComponent(linkMatch[1]));
                if (!listings.some(l => l.url === url)) {
                    listings.push({
                        url,
                        title: extractTitle(title),
                        company: extractCompanyFromUrl(url),
                        location: '',
                        salary: '',
                        snippet: '',
                        source: 'google',
                        scrapedAt: new Date().toISOString()
                    });
                }
            }
        }
    }

    return listings;
}

function isJobUrl(url) {
    const jobDomains = ['linkedin.com', 'glassdoor.com', 'indeed.com', 'monster.com',
        'ziprecruiter.com', 'dice.com', 'angel.co', 'wellfound.com',
        'lever.co', 'greenhouse.io', 'workday.com', 'jobs.', 'careers.'];
    return jobDomains.some(d => url.includes(d));
}

function cleanUrl(url) {
    try {
        const u = new URL(url);
        // Remove tracking params
        u.searchParams.delete('utm_source');
        u.searchParams.delete('utm_medium');
        u.searchParams.delete('utm_campaign');
        return u.toString();
    } catch { return url; }
}

function extractTitle(text) {
    // Remove common suffixes like "| LinkedIn", "- Glassdoor"
    return text.replace(/\s*[|–-]\s*(LinkedIn|Glassdoor|Indeed|Monster|ZipRecruiter).*$/i, '').trim();
}

function extractCompanyFromUrl(url) {
    try {
        const hostname = new URL(url).hostname;
        // For company career pages: careers.company.com
        const match = hostname.match(/(?:careers?|jobs)\.([\w-]+)\./);
        if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1);
        return '';
    } catch { return ''; }
}

/**
 * Search via Google HTTP fetch.
 */
async function searchViaHttp({ query, location, maxResults = 10 }) {
    const searchUrl = buildSearchUrl({ query, location });

    const result = await toolServiceClient.executeTool('http_fetch', {
        url: searchUrl,
        extract: false,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
        }
    });

    if (!result.success) {
        throw new Error(`Google search failed: ${result.error}`);
    }

    const html = result.result?.body || result.result?.text || '';
    const listings = parseGoogleResults(html);

    return {
        listings: listings.slice(0, maxResults),
        searchUrl,
        method: 'http'
    };
}

/**
 * Search via browser (fallback).
 */
async function searchViaBrowser({ query, location, maxResults = 10, envId }) {
    const searchUrl = buildSearchUrl({ query, location });

    const launchParams = { headless: !envId };
    if (envId) launchParams.envId = envId;
    const launch = await toolServiceClient.executeTool('browser_launch', launchParams);
    if (!launch.success) throw new Error(`Browser launch failed: ${launch.error}`);
    const browserId = launch.result.browserId;

    try {
        await toolServiceClient.executeTool('page_goto', { browserId, url: searchUrl, waitFor: 3000 });
        const extract = await toolServiceClient.executeTool('page_extract', { browserId, selector: 'body' });

        const html = extract.success ? (extract.result?.result || '') : '';
        const listings = parseGoogleResults(html);

        return {
            listings: listings.slice(0, maxResults),
            searchUrl,
            method: envId ? 'fingerprint-browser' : 'browser'
        };
    } finally {
        await toolServiceClient.executeTool('browser_close', { browserId });
    }
}

/**
 * Search with HTTP-first, browser fallback.
 */
async function search(params) {
    if (params.browserOnly || params.envId) return searchViaBrowser(params);

    try {
        const result = await searchViaHttp(params);
        if (result.listings.length > 0) return result;
        return await searchViaBrowser(params);
    } catch (httpErr) {
        try {
            return await searchViaBrowser(params);
        } catch (browserErr) {
            throw new Error(`Google search failed. HTTP: ${httpErr.message}. Browser: ${browserErr.message}`);
        }
    }
}

module.exports = {
    search,
    searchViaHttp,
    searchViaBrowser,
    buildSearchUrl,
    parseGoogleResults,
    isJobUrl,
    extractTitle
};
