'use strict';

/**
 * Indeed Job Source Adapter — HTTP scraping with browser fallback.
 *
 * Normalizes Indeed search results to the standard JobListing schema:
 * { title, company, location, salary, url, snippet, postedDate, source }
 *
 * Strategy:
 *   1. HTTP fetch (fast, no browser needed)
 *   2. Browser fallback if HTTP fails (CAPTCHA, JS rendering)
 */

const toolServiceClient = require('../core/toolServiceClient');

const INDEED_BASE_URL = 'https://www.indeed.com';

/**
 * Build Indeed search URL from parameters.
 * @param {object} params
 * @param {string} params.query - Job title or keywords
 * @param {string} [params.location] - Location
 * @param {number} [params.start=0] - Result offset (10 per page)
 * @param {string} [params.sort] - 'date' for newest first
 * @returns {string}
 */
function buildSearchUrl({ query, location, start = 0, sort }) {
    const params = new URLSearchParams();
    params.set('q', query);
    if (location) params.set('l', location);
    if (start > 0) params.set('start', String(start));
    if (sort === 'date') params.set('sort', 'date');
    return `${INDEED_BASE_URL}/jobs?${params.toString()}`;
}

/**
 * Parse Indeed search results HTML into structured JobListing objects.
 * @param {object} extractResult - Result from http_extract or page_extract
 * @returns {Array<object>} JobListing array
 */
function parseSearchResults(extractResult) {
    // extractFromHtml returns structured data from CSS selectors
    const listings = [];

    if (!extractResult) return listings;

    // When using http_extract with specific selectors
    const titles = Array.isArray(extractResult.titles) ? extractResult.titles : [];
    const companies = Array.isArray(extractResult.companies) ? extractResult.companies : [];
    const locations = Array.isArray(extractResult.locations) ? extractResult.locations : [];
    const snippets = Array.isArray(extractResult.snippets) ? extractResult.snippets : [];
    const links = Array.isArray(extractResult.links) ? extractResult.links : [];

    const count = Math.max(titles.length, companies.length, locations.length);

    for (let i = 0; i < count; i++) {
        const title = titles[i] || '';
        const company = companies[i] || '';
        const loc = locations[i] || '';
        const snippet = snippets[i] || '';

        if (!title && !company) continue;

        // Try to find a matching link
        let url = '';
        if (links[i]) {
            const href = typeof links[i] === 'object' ? links[i].href : links[i];
            if (href) {
                url = href.startsWith('http') ? href : `${INDEED_BASE_URL}${href}`;
            }
        }

        listings.push(normalizeJobListing({
            title: title.trim(),
            company: company.trim(),
            location: loc.trim(),
            snippet: snippet.trim(),
            url,
            source: 'indeed'
        }));
    }

    return listings;
}

/**
 * Parse job listings from raw HTML text (fallback when structured extraction fails).
 * Uses regex patterns to extract job cards from Indeed's HTML.
 * @param {string} html
 * @returns {Array<object>}
 */
function parseFromRawHtml(html) {
    if (!html || typeof html !== 'string') return [];

    const listings = [];

    // Indeed job cards have data attributes and specific CSS classes
    // Try to extract from JSON-LD structured data first (most reliable)
    const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
        for (const match of jsonLdMatches) {
            try {
                const content = match.replace(/<\/?script[^>]*>/gi, '').trim();
                const data = JSON.parse(content);
                if (data['@type'] === 'JobPosting') {
                    listings.push(normalizeJobListing({
                        title: data.title || '',
                        company: data.hiringOrganization?.name || '',
                        location: data.jobLocation?.address?.addressLocality || '',
                        salary: data.baseSalary?.value?.value ? `${data.baseSalary.currency || ''} ${data.baseSalary.value.value}` : '',
                        url: data.url || '',
                        snippet: (data.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
                        postedDate: data.datePosted || '',
                        source: 'indeed'
                    }));
                }
                // Handle arrays of job postings
                if (Array.isArray(data)) {
                    for (const item of data) {
                        if (item['@type'] === 'JobPosting') {
                            listings.push(normalizeJobListing({
                                title: item.title || '',
                                company: item.hiringOrganization?.name || '',
                                location: item.jobLocation?.address?.addressLocality || '',
                                url: item.url || '',
                                snippet: (item.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
                                postedDate: item.datePosted || '',
                                source: 'indeed'
                            }));
                        }
                    }
                }
            } catch (_) {
                // Not valid JSON, skip
            }
        }
    }

    return listings;
}

/**
 * Normalize a raw job object into the standard JobListing schema.
 * @param {object} raw
 * @returns {object} Normalized JobListing
 */
function normalizeJobListing(raw) {
    return {
        title: raw.title || '',
        company: raw.company || '',
        location: raw.location || '',
        salary: raw.salary || '',
        url: raw.url || '',
        snippet: raw.snippet || '',
        postedDate: raw.postedDate || '',
        source: raw.source || 'indeed',
        scrapedAt: new Date().toISOString()
    };
}

/**
 * Search Indeed for jobs using HTTP scraping.
 * @param {object} params
 * @param {string} params.query
 * @param {string} [params.location]
 * @param {number} [params.maxResults=10]
 * @returns {Promise<{ listings: Array<object>, searchUrl: string, method: string }>}
 */
async function searchViaHttp({ query, location, maxResults = 10 }) {
    const searchUrl = buildSearchUrl({ query, location });

    const result = await toolServiceClient.executeTool('http_extract', {
        url: searchUrl,
        selectors: {
            titles: '.jobTitle span, .jcs-JobTitle span, h2.jobTitle',
            companies: '.companyName, .company_location .companyName, [data-testid="company-name"]',
            locations: '.companyLocation, .company_location .companyLocation, [data-testid="text-location"]',
            snippets: '.job-snippet, .jobCardShelfContainer, .underShelfFooter',
            links: '.jobTitle a, .jcs-JobTitle a, h2.jobTitle a'
        }
    });

    if (!result.success) {
        throw new Error(`HTTP scrape failed: ${result.error}`);
    }

    let listings = parseSearchResults(result.result);

    // Fallback: try raw HTML parsing if structured extraction got nothing
    if (listings.length === 0 && result.result?.body) {
        listings = parseFromRawHtml(result.result.body);
    }

    return {
        listings: listings.slice(0, maxResults),
        searchUrl,
        method: 'http'
    };
}

/**
 * Search Indeed using browser (fallback for CAPTCHA / JS rendering).
 * @param {object} params
 * @param {string} params.query
 * @param {string} [params.location]
 * @param {number} [params.maxResults=10]
 * @returns {Promise<{ listings: Array<object>, searchUrl: string, method: string }>}
 */
async function searchViaBrowser({ query, location, maxResults = 10, envId }) {
    const searchUrl = buildSearchUrl({ query, location });

    // Launch browser (with fingerprint if envId provided)
    const launchParams = { headless: !envId };
    if (envId) launchParams.envId = envId;
    const launchResult = await toolServiceClient.executeTool('browser_launch', launchParams);
    if (!launchResult.success) {
        throw new Error(`Browser launch failed: ${launchResult.error}`);
    }
    const browserId = launchResult.result.browserId;

    try {
        // Navigate to search page
        const gotoResult = await toolServiceClient.executeTool('page_goto', {
            browserId,
            url: searchUrl,
            waitFor: 3000
        });
        if (!gotoResult.success) {
            throw new Error(`Navigation failed: ${gotoResult.error}`);
        }

        // Extract page content
        const extractResult = await toolServiceClient.executeTool('page_extract', {
            browserId,
            selector: 'body'
        });

        let listings = [];
        if (extractResult.success && extractResult.result?.result) {
            listings = parseFromRawHtml(extractResult.result.result);
        }

        return {
            listings: listings.slice(0, maxResults),
            searchUrl,
            method: envId ? 'fingerprint-browser' : 'browser'
        };
    } finally {
        // Always close browser
        await toolServiceClient.executeTool('browser_close', { browserId });
    }
}

/**
 * Search Indeed with automatic fallback: HTTP first, browser if HTTP fails.
 * @param {object} params
 * @param {string} params.query
 * @param {string} [params.location]
 * @param {number} [params.maxResults=10]
 * @param {boolean} [params.browserOnly=false]
 * @returns {Promise<{ listings: Array<object>, searchUrl: string, method: string }>}
 */
async function search(params) {
    if (params.browserOnly || params.envId) {
        return searchViaBrowser(params);
    }

    try {
        const result = await searchViaHttp(params);
        if (result.listings.length > 0) return result;
        // HTTP succeeded but got no results — try browser
        return await searchViaBrowser(params);
    } catch (httpErr) {
        // HTTP failed — try browser as fallback
        try {
            return await searchViaBrowser(params);
        } catch (browserErr) {
            throw new Error(`Both HTTP and browser search failed. HTTP: ${httpErr.message}. Browser: ${browserErr.message}`);
        }
    }
}

module.exports = {
    search,
    searchViaHttp,
    searchViaBrowser,
    buildSearchUrl,
    parseSearchResults,
    parseFromRawHtml,
    normalizeJobListing
};
