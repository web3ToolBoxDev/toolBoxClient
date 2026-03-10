'use strict';

/**
 * LinkedIn Job Source Adapter — Scrapes LinkedIn job search via browser.
 *
 * LinkedIn aggressively blocks HTTP scraping, so we default to browser mode.
 * Supports fingerprint browser via envId for anti-detection.
 *
 * Strategy:
 *   1. HTTP fetch of public LinkedIn job search (limited, often blocked)
 *   2. Browser with fingerprint profile (primary method)
 */

const toolServiceClient = require('../core/toolServiceClient');

const LINKEDIN_BASE = 'https://www.linkedin.com';

/**
 * Build LinkedIn job search URL.
 */
function buildSearchUrl({ query, location }) {
    const params = new URLSearchParams();
    params.set('keywords', query);
    if (location) params.set('location', location);
    params.set('f_TPR', 'r604800'); // Past week
    return `${LINKEDIN_BASE}/jobs/search/?${params.toString()}`;
}

/**
 * Parse LinkedIn job listings from HTML.
 * Works with both server-rendered and browser-extracted HTML.
 */
function parseLinkedInResults(html) {
    if (!html || typeof html !== 'string') return [];

    const listings = [];

    // Pattern 1: Job card links with data
    // LinkedIn renders job cards with specific class patterns
    const cardPattern = /<a[^>]*href="(\/jobs\/view\/[^"?]+)[^"]*"[^>]*>[\s\S]*?<\/a>/gi;
    let match;
    const seenUrls = new Set();

    while ((match = cardPattern.exec(html)) !== null) {
        const path = match[1];
        const url = `${LINKEDIN_BASE}${path}`;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        // Extract text content near this link
        const block = match[0];
        const textContent = block.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

        if (textContent.length > 3) {
            listings.push({
                url,
                title: extractTitleFromText(textContent),
                company: '',
                location: '',
                salary: '',
                snippet: '',
                source: 'linkedin',
                scrapedAt: new Date().toISOString()
            });
        }
    }

    // Pattern 2: JSON-LD structured data (if available)
    const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    while ((match = jsonLdPattern.exec(html)) !== null) {
        try {
            const data = JSON.parse(match[1].replace(/<\/?script[^>]*>/gi, '').trim());
            const jobs = Array.isArray(data) ? data : [data];
            for (const job of jobs) {
                if (job['@type'] === 'JobPosting' && job.url && !seenUrls.has(job.url)) {
                    seenUrls.add(job.url);
                    listings.push({
                        url: job.url,
                        title: job.title || '',
                        company: job.hiringOrganization?.name || '',
                        location: job.jobLocation?.address?.addressLocality || '',
                        salary: '',
                        snippet: (job.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
                        source: 'linkedin',
                        scrapedAt: new Date().toISOString()
                    });
                }
            }
        } catch { /* skip invalid JSON */ }
    }

    // Pattern 3: Simple title extraction from list items
    const titlePattern = /<span[^>]*class="[^"]*job-card[^"]*"[^>]*>(.*?)<\/span>/gi;
    while ((match = titlePattern.exec(html)) !== null) {
        const title = match[1].replace(/<[^>]*>/g, '').trim();
        if (title.length > 3 && title.length < 200) {
            // Find nearby link
            const before = html.substring(Math.max(0, match.index - 500), match.index);
            const linkMatch = before.match(/href="(\/jobs\/view\/[^"?]+)/);
            if (linkMatch) {
                const url = `${LINKEDIN_BASE}${linkMatch[1]}`;
                if (!seenUrls.has(url)) {
                    seenUrls.add(url);
                    listings.push({
                        url,
                        title,
                        company: '',
                        location: '',
                        salary: '',
                        snippet: '',
                        source: 'linkedin',
                        scrapedAt: new Date().toISOString()
                    });
                }
            }
        }
    }

    return listings;
}

function extractTitleFromText(text) {
    // Take first meaningful segment (before company/location info)
    const parts = text.split(/\s{2,}|\n/);
    const title = (parts[0] || '').trim();
    return title.length > 200 ? title.slice(0, 200) : title;
}

/**
 * Search via HTTP (limited — LinkedIn blocks most HTTP requests).
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
        throw new Error(`LinkedIn HTTP fetch failed: ${result.error}`);
    }

    const html = result.result?.body || result.result?.text || '';
    const listings = parseLinkedInResults(html);

    return {
        listings: listings.slice(0, maxResults),
        searchUrl,
        method: 'http'
    };
}

/**
 * Search via browser with optional fingerprint profile.
 * @param {object} params
 * @param {string} [params.envId] - Fingerprint environment ID for anti-detection
 */
async function searchViaBrowser({ query, location, maxResults = 10, envId }) {
    const searchUrl = buildSearchUrl({ query, location });

    const launchParams = { headless: !envId };
    if (envId) launchParams.envId = envId;

    const launch = await toolServiceClient.executeTool('browser_launch', launchParams);
    if (!launch.success) throw new Error(`Browser launch failed: ${launch.error}`);
    const browserId = launch.result.browserId;

    try {
        await toolServiceClient.executeTool('page_goto', {
            browserId,
            url: searchUrl,
            waitFor: 5000
        });

        // Scroll to load more results
        await toolServiceClient.executeTool('page_scroll', {
            browserId,
            direction: 'down',
            amount: 3
        });

        // Wait for content to load after scroll
        await new Promise(r => setTimeout(r, 2000));

        const extract = await toolServiceClient.executeTool('page_extract', {
            browserId,
            selector: 'body'
        });

        const html = extract.success ? (extract.result?.result || '') : '';
        const listings = parseLinkedInResults(html);

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
 * LinkedIn almost always requires browser mode.
 */
async function search(params) {
    if (params.browserOnly || params.envId) {
        return searchViaBrowser(params);
    }

    try {
        const result = await searchViaHttp(params);
        if (result.listings.length > 0) return result;
        return await searchViaBrowser(params);
    } catch (httpErr) {
        try {
            return await searchViaBrowser(params);
        } catch (browserErr) {
            throw new Error(`LinkedIn search failed. HTTP: ${httpErr.message}. Browser: ${browserErr.message}`);
        }
    }
}

module.exports = {
    search,
    searchViaHttp,
    searchViaBrowser,
    buildSearchUrl,
    parseLinkedInResults
};
