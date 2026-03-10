'use strict';

const { getSourcesForLocation, detectRegion, REGION_SOURCES } = require('./locationSources');

describe('locationSources', () => {
    describe('detectRegion', () => {
        test('detects Canada from city names', () => {
            expect(detectRegion('Toronto, Canada')).toBe('canada');
            expect(detectRegion('Vancouver, BC')).toBe('canada');
            expect(detectRegion('Montreal, QC')).toBe('canada');
            expect(detectRegion('Ottawa')).toBe('canada');
        });

        test('detects US from city and state names', () => {
            expect(detectRegion('New York, NY')).toBe('us');
            expect(detectRegion('San Francisco, California')).toBe('us');
            expect(detectRegion('Seattle, WA')).toBe('us');
            expect(detectRegion('Austin, Texas')).toBe('us');
        });

        test('detects China from Chinese city names', () => {
            expect(detectRegion('北京')).toBe('china');
            expect(detectRegion('上海')).toBe('china');
            expect(detectRegion('Shenzhen, China')).toBe('china');
        });

        test('detects UK', () => {
            expect(detectRegion('London, UK')).toBe('uk');
            expect(detectRegion('Manchester, England')).toBe('uk');
        });

        test('returns _default for unknown locations', () => {
            expect(detectRegion('Mars Colony')).toBe('_default');
            expect(detectRegion('')).toBe('_default');
            expect(detectRegion(null)).toBe('_default');
            expect(detectRegion(undefined)).toBe('_default');
        });

        test('is case-insensitive', () => {
            expect(detectRegion('TORONTO')).toBe('canada');
            expect(detectRegion('tokyo')).toBe('japan');
        });
    });

    describe('getSourcesForLocation', () => {
        test('returns Canada sources for Toronto', () => {
            const sources = getSourcesForLocation('Toronto, Canada');
            expect(sources).toEqual(['indeed', 'linkedin', 'jobbank', 'google']);
        });

        test('returns US sources for New York', () => {
            const sources = getSourcesForLocation('New York');
            expect(sources).toEqual(['indeed', 'linkedin', 'google']);
        });

        test('does not include jobbank for non-Canada locations', () => {
            const sources = getSourcesForLocation('London, UK');
            expect(sources).not.toContain('jobbank');
        });

        test('returns default sources for unknown location', () => {
            const sources = getSourcesForLocation('');
            expect(sources).toEqual(REGION_SOURCES._default);
        });

        test('all region configs have at least one source', () => {
            for (const [region, sources] of Object.entries(REGION_SOURCES)) {
                expect(sources.length).toBeGreaterThan(0);
            }
        });
    });
});
