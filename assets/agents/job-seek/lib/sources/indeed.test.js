'use strict';

const { buildSearchUrl, parseSearchResults, parseFromRawHtml, normalizeJobListing } = require('./indeed');

describe('Indeed source adapter', () => {

    describe('buildSearchUrl', () => {
        test('builds URL with query only', () => {
            const url = buildSearchUrl({ query: 'software engineer' });
            expect(url).toContain('indeed.com/jobs?');
            expect(url).toContain('q=software+engineer');
        });

        test('builds URL with query and location', () => {
            const url = buildSearchUrl({ query: 'developer', location: 'Toronto' });
            expect(url).toContain('q=developer');
            expect(url).toContain('l=Toronto');
        });

        test('includes start offset', () => {
            const url = buildSearchUrl({ query: 'qa', start: 10 });
            expect(url).toContain('start=10');
        });

        test('includes sort=date', () => {
            const url = buildSearchUrl({ query: 'qa', sort: 'date' });
            expect(url).toContain('sort=date');
        });

        test('does not include start when 0', () => {
            const url = buildSearchUrl({ query: 'qa', start: 0 });
            expect(url).not.toContain('start=');
        });
    });

    describe('normalizeJobListing', () => {
        test('normalizes a raw listing with all fields', () => {
            const listing = normalizeJobListing({
                title: 'Software Engineer',
                company: 'Acme Inc',
                location: 'Toronto, ON',
                salary: '$100K',
                url: 'https://indeed.com/job/123',
                snippet: 'Great opportunity',
                postedDate: '2025-01-15',
                source: 'indeed'
            });
            expect(listing.title).toBe('Software Engineer');
            expect(listing.company).toBe('Acme Inc');
            expect(listing.scrapedAt).toBeTruthy();
        });

        test('fills defaults for missing fields', () => {
            const listing = normalizeJobListing({});
            expect(listing.title).toBe('');
            expect(listing.company).toBe('');
            expect(listing.source).toBe('indeed');
            expect(listing.scrapedAt).toBeTruthy();
        });
    });

    describe('parseSearchResults', () => {
        test('parses structured extraction results', () => {
            const result = {
                titles: ['Software Engineer', 'QA Analyst'],
                companies: ['Acme', 'Beta Corp'],
                locations: ['Toronto', 'Vancouver'],
                snippets: ['Build stuff', 'Test stuff'],
                links: [{ href: '/job/1' }, { href: 'https://indeed.com/job/2' }]
            };
            const listings = parseSearchResults(result);
            expect(listings).toHaveLength(2);
            expect(listings[0].title).toBe('Software Engineer');
            expect(listings[0].company).toBe('Acme');
            expect(listings[0].url).toContain('indeed.com');
            expect(listings[1].url).toBe('https://indeed.com/job/2');
        });

        test('returns empty array for null input', () => {
            expect(parseSearchResults(null)).toEqual([]);
        });

        test('skips entries with no title and no company', () => {
            const result = {
                titles: ['', ''],
                companies: ['', ''],
                locations: ['Toronto', 'Vancouver'],
                snippets: [],
                links: []
            };
            expect(parseSearchResults(result)).toHaveLength(0);
        });

        test('handles mismatched array lengths', () => {
            const result = {
                titles: ['Engineer', 'Designer', 'Manager'],
                companies: ['Acme'],
                locations: [],
                snippets: [],
                links: []
            };
            const listings = parseSearchResults(result);
            expect(listings).toHaveLength(3);
            expect(listings[0].company).toBe('Acme');
            expect(listings[1].company).toBe('');
        });
    });

    describe('parseFromRawHtml', () => {
        test('returns empty for null/empty input', () => {
            expect(parseFromRawHtml(null)).toEqual([]);
            expect(parseFromRawHtml('')).toEqual([]);
        });

        test('extracts from JSON-LD structured data', () => {
            const html = `
                <html><body>
                <script type="application/ld+json">
                {
                    "@type": "JobPosting",
                    "title": "Frontend Developer",
                    "hiringOrganization": { "name": "TechCorp" },
                    "jobLocation": { "address": { "addressLocality": "Shanghai" } },
                    "url": "https://indeed.com/job/frontend",
                    "description": "<p>React and Vue experience required</p>",
                    "datePosted": "2025-03-01"
                }
                </script>
                </body></html>
            `;
            const listings = parseFromRawHtml(html);
            expect(listings).toHaveLength(1);
            expect(listings[0].title).toBe('Frontend Developer');
            expect(listings[0].company).toBe('TechCorp');
            expect(listings[0].location).toBe('Shanghai');
            expect(listings[0].snippet).toContain('React and Vue');
            expect(listings[0].snippet).not.toContain('<p>');
        });

        test('handles JSON-LD array of job postings', () => {
            const html = `
                <script type="application/ld+json">
                [
                    { "@type": "JobPosting", "title": "Job A", "hiringOrganization": { "name": "Co A" } },
                    { "@type": "JobPosting", "title": "Job B", "hiringOrganization": { "name": "Co B" } }
                ]
                </script>
            `;
            const listings = parseFromRawHtml(html);
            expect(listings).toHaveLength(2);
        });

        test('ignores invalid JSON in script tags', () => {
            const html = `<script type="application/ld+json">not valid json{}</script>`;
            expect(parseFromRawHtml(html)).toEqual([]);
        });
    });
});
