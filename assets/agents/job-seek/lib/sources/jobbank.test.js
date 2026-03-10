'use strict';

const { buildSearchUrl, parseJobBankResults } = require('./jobbank');

describe('jobbank source adapter', () => {
    describe('buildSearchUrl', () => {
        test('builds URL with query and location', () => {
            const url = buildSearchUrl({ query: 'Developer', location: 'Toronto' });
            expect(url).toContain('jobbank.gc.ca/jobsearch/jobsearch');
            expect(url).toContain('searchstring=Developer');
            expect(url).toContain('locationstring=Toronto');
        });

        test('builds URL without location', () => {
            const url = buildSearchUrl({ query: 'Nurse' });
            expect(url).toContain('searchstring=Nurse');
            expect(url).not.toContain('locationstring=');
        });

        test('includes relevance sort', () => {
            const url = buildSearchUrl({ query: 'test' });
            expect(url).toContain('sort=M');
        });
    });

    describe('parseJobBankResults', () => {
        test('returns empty array for null/empty input', () => {
            expect(parseJobBankResults(null)).toEqual([]);
            expect(parseJobBankResults('')).toEqual([]);
        });

        test('extracts job listings from job posting links', () => {
            const html = `
                <div class="results">
                    <a href="/jobsearch/jobposting/12345?source=search">Software Developer</a>
                    <span class="employer">Shopify</span>
                    <span class="location">Toronto, ON</span>
                </div>
                <div class="results">
                    <a href="/jobsearch/jobposting/67890">Data Analyst</a>
                </div>
            `;
            const listings = parseJobBankResults(html);
            expect(listings.length).toBe(2);
            expect(listings[0].url).toContain('jobbank.gc.ca/jobsearch/jobposting/12345');
            expect(listings[0].title).toBe('Software Developer');
            expect(listings[0].source).toBe('jobbank');
            // URL should be cleaned (no query params)
            expect(listings[0].url).not.toContain('?source=search');
        });

        test('deduplicates by URL', () => {
            const html = `
                <a href="/jobsearch/jobposting/12345">Job A</a>
                <a href="/jobsearch/jobposting/12345?page=2">Job A again</a>
            `;
            const listings = parseJobBankResults(html);
            expect(listings.length).toBe(1);
        });

        test('parses JSON-LD structured data', () => {
            const html = `
                <script type="application/ld+json">
                {
                    "@type": "JobPosting",
                    "title": "Nurse Practitioner",
                    "url": "https://www.jobbank.gc.ca/jobsearch/jobposting/99999",
                    "hiringOrganization": { "name": "Toronto General Hospital" },
                    "jobLocation": { "address": { "addressLocality": "Toronto" } },
                    "baseSalary": { "currency": "CAD", "value": { "value": 85000 } }
                }
                </script>
            `;
            const listings = parseJobBankResults(html);
            expect(listings.length).toBe(1);
            expect(listings[0].title).toBe('Nurse Practitioner');
            expect(listings[0].company).toBe('Toronto General Hospital');
            expect(listings[0].salary).toContain('CAD');
        });
    });
});
