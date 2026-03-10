'use strict';

const { buildSearchUrl, parseLinkedInResults } = require('./linkedin');

describe('linkedin source adapter', () => {
    describe('buildSearchUrl', () => {
        test('builds URL with query and location', () => {
            const url = buildSearchUrl({ query: 'React Developer', location: 'Toronto' });
            expect(url).toContain('linkedin.com/jobs/search');
            expect(url).toContain('keywords=React+Developer');
            expect(url).toContain('location=Toronto');
        });

        test('builds URL without location', () => {
            const url = buildSearchUrl({ query: 'Engineer' });
            expect(url).toContain('keywords=Engineer');
            expect(url).not.toContain('location=');
        });

        test('includes time filter for past week', () => {
            const url = buildSearchUrl({ query: 'test' });
            expect(url).toContain('f_TPR=r604800');
        });
    });

    describe('parseLinkedInResults', () => {
        test('returns empty array for null/empty input', () => {
            expect(parseLinkedInResults(null)).toEqual([]);
            expect(parseLinkedInResults('')).toEqual([]);
            expect(parseLinkedInResults(123)).toEqual([]);
        });

        test('extracts job listings from job card links', () => {
            const html = `
                <div>
                    <a href="/jobs/view/12345-react-developer" class="job-card">React Developer at Shopify</a>
                    <a href="/jobs/view/67890-frontend-eng" class="job-card">Frontend Engineer at Wealthsimple</a>
                </div>
            `;
            const listings = parseLinkedInResults(html);
            expect(listings.length).toBeGreaterThanOrEqual(2);
            expect(listings[0].url).toContain('linkedin.com/jobs/view/12345');
            expect(listings[0].source).toBe('linkedin');
        });

        test('deduplicates by URL', () => {
            const html = `
                <a href="/jobs/view/12345-job" class="x">Job A</a>
                <a href="/jobs/view/12345-job" class="y">Job A copy</a>
            `;
            const listings = parseLinkedInResults(html);
            const urls = listings.map(l => l.url);
            const unique = new Set(urls);
            expect(unique.size).toBe(urls.length);
        });

        test('parses JSON-LD structured data', () => {
            const html = `
                <script type="application/ld+json">
                {
                    "@type": "JobPosting",
                    "title": "Senior Developer",
                    "url": "https://linkedin.com/jobs/view/99999",
                    "hiringOrganization": { "name": "Acme Corp" },
                    "jobLocation": { "address": { "addressLocality": "Toronto" } }
                }
                </script>
            `;
            const listings = parseLinkedInResults(html);
            expect(listings.length).toBe(1);
            expect(listings[0].title).toBe('Senior Developer');
            expect(listings[0].company).toBe('Acme Corp');
            expect(listings[0].location).toBe('Toronto');
        });
    });
});
