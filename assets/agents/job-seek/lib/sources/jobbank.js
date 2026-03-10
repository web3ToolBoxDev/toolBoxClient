'use strict';

/**
 * Job Bank (Canada) Source Adapter — jobbank.gc.ca
 *
 * Canada's official government job board. Provides structured job listings
 * with clean HTML that's relatively easy to parse.
 *
 * Strategy:
 *   1. HTTP fetch (Job Bank is government site, less anti-bot)
 *   2. Browser fallback if HTTP fails
 */

const toolServiceClient = require('../core/toolServiceClient');

const JOBBANK_BASE = 'https://www.jobbank.gc.ca';

/**
 * Build Job Bank search URL.
 */
function buildSearchUrl({ query, location }) {
    const params = new URLSearchParams();
    params.set('searchstring', query);
    if (location) params.set('locationstring', location);
    params.set('sort', 'M'); // Most relevant
    return `${JOBBANK_BASE}/jobsearch/jobsearch?${params.toString()}`;
}

/**
 * Parse Job Bank search results HTML.
 */
function parseJobBankResults(html) {
    if (!html || typeof html !== 'string') return [];

    const listings = [];
    const seenUrls = new Set();

    // Pattern 1: Job title links — Job Bank uses /jobsearch/jobposting/NNNN pattern
    const linkPattern = /href="(\/jobsearch\/jobposting\/\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
        const path = match[1];
        const url = `${JOBBANK_BASE}${path.split('?')[0]}`; // Clean URL
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        const title = match[2].replace(/<[^>]*>/g, '').trim();
        if (title.length < 3 || title.length > 300) continue;

        // Try to find company and location near this match
        const after = html.substring(match.index, match.index + 800);
        const company = extractNearbyText(after, /class="[^"]*employer[^"]*"[^>]*>(.*?)<\//i);
        const location = extractNearbyText(after, /class="[^"]*location[^"]*"[^>]*>(.*?)<\//i);
        const salary = extractNearbyText(after, /class="[^"]*salary[^"]*"[^>]*>(.*?)<\//i);

        listings.push({
            url,
            title,
            company: company || '',
            location: location || '',
            salary: salary || '',
            snippet: '',
            source: 'jobbank',
            scrapedAt: new Date().toISOString()
        });
    }

    // Pattern 2: JSON-LD structured data
    const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    while ((match = jsonLdPattern.exec(html)) !== null) {
        try {
            const data = JSON.parse(match[1].replace(/<\/?script[^>]*>/gi, '').trim());
            const jobs = Array.isArray(data) ? data : [data];
            for (const job of jobs) {
                if (job['@type'] === 'JobPosting' && !seenUrls.has(job.url || '')) {
                    const url = job.url || '';
                    if (url) seenUrls.add(url);
                    listings.push({
                        url,
                        title: job.title || '',
                        company: job.hiringOrganization?.name || '',
                        location: job.jobLocation?.address?.addressLocality || '',
                        salary: job.baseSalary?.value?.value
                            ? `${job.baseSalary.currency || 'CAD'} ${job.baseSalary.value.value}`
                            : '',
                        snippet: (job.description || '').replace(/<[^>]*>/g, '').slice(0, 300),
                        source: 'jobbank',
                        scrapedAt: new Date().toISOString()
                    });
                }
            }
        } catch { /* skip */ }
    }

    return listings;
}

function extractNearbyText(html, pattern) {
    const m = html.match(pattern);
    return m ? m[1].replace(/<[^>]*>/g, '').trim() : '';
}

/**
 * Search via HTTP fetch.
 */
async function searchViaHttp({ query, location, maxResults = 10 }) {
    const searchUrl = buildSearchUrl({ query, location });

    const result = await toolServiceClient.executeTool('http_fetch', {
        url: searchUrl,
        extract: false,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-CA,en;q=0.9,fr-CA;q=0.8'
        }
    });

    if (!result.success) {
        throw new Error(`Job Bank HTTP fetch failed: ${result.error}`);
    }

    const html = result.result?.body || result.result?.text || '';
    const listings = parseJobBankResults(html);

    return {
        listings: listings.slice(0, maxResults),
        searchUrl,
        method: 'http'
    };
}

/**
 * Search via browser with optional fingerprint profile.
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
            waitFor: 3000
        });

        const extract = await toolServiceClient.executeTool('page_extract', {
            browserId,
            selector: 'body'
        });

        const html = extract.success ? (extract.result?.result || '') : '';
        const listings = parseJobBankResults(html);

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
            throw new Error(`Job Bank search failed. HTTP: ${httpErr.message}. Browser: ${browserErr.message}`);
        }
    }
}

module.exports = {
    search,
    searchViaHttp,
    searchViaBrowser,
    buildSearchUrl,
    parseJobBankResults
};
