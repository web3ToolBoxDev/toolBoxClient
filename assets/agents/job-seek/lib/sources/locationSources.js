'use strict';

/**
 * Location-based job source selection.
 *
 * Maps user location (country/region) to the best job boards for that market.
 * Each source must have a matching adapter in the SOURCES map of jobSearch.js.
 */

/**
 * Region → source list mapping.
 * Order matters: first source is tried first (highest priority).
 */
const REGION_SOURCES = {
    // North America
    canada:  ['indeed', 'linkedin', 'jobbank', 'google'],
    us:      ['indeed', 'linkedin', 'google'],
    usa:     ['indeed', 'linkedin', 'google'],

    // Europe
    uk:      ['indeed', 'linkedin', 'google'],
    germany: ['linkedin', 'indeed', 'google'],
    france:  ['linkedin', 'indeed', 'google'],
    europe:  ['linkedin', 'indeed', 'google'],

    // Asia-Pacific
    china:   ['linkedin', 'google'],
    japan:   ['indeed', 'linkedin', 'google'],
    australia: ['indeed', 'linkedin', 'google'],
    india:   ['indeed', 'linkedin', 'google'],

    // Default fallback
    _default: ['indeed', 'linkedin', 'google']
};

/**
 * Keywords that map to a region key.
 * Matched case-insensitively against the location string.
 */
const LOCATION_KEYWORDS = [
    // Canada
    { keywords: ['canada', 'toronto', 'vancouver', 'montreal', 'ottawa', 'calgary', 'edmonton', 'winnipeg', 'halifax', 'quebec', 'ontario', 'alberta', 'british columbia', 'bc', 'manitoba', 'saskatchewan'], region: 'canada' },
    // US
    { keywords: ['united states', 'usa', 'us', 'new york', 'san francisco', 'los angeles', 'chicago', 'seattle', 'austin', 'boston', 'denver', 'atlanta', 'california', 'texas', 'florida', 'washington'], region: 'us' },
    // UK
    { keywords: ['united kingdom', 'uk', 'london', 'manchester', 'birmingham', 'edinburgh', 'scotland', 'england', 'wales'], region: 'uk' },
    // Germany
    { keywords: ['germany', 'berlin', 'munich', 'hamburg', 'frankfurt', 'deutschland'], region: 'germany' },
    // France
    { keywords: ['france', 'paris', 'lyon', 'marseille'], region: 'france' },
    // China
    { keywords: ['china', '中国', '北京', '上海', '深圳', '广州', '杭州', '成都', '武汉', '南京', 'beijing', 'shanghai', 'shenzhen', 'guangzhou', 'hangzhou'], region: 'china' },
    // Japan
    { keywords: ['japan', 'tokyo', 'osaka', '日本', '東京'], region: 'japan' },
    // Australia
    { keywords: ['australia', 'sydney', 'melbourne', 'brisbane', 'perth'], region: 'australia' },
    // India
    { keywords: ['india', 'bangalore', 'mumbai', 'delhi', 'hyderabad', 'pune', 'chennai'], region: 'india' }
];

/**
 * Detect region from a free-text location string.
 * @param {string} location
 * @returns {string} Region key (e.g. 'canada', 'us', '_default')
 */
function detectRegion(location) {
    if (!location || typeof location !== 'string') return '_default';

    const lower = location.toLowerCase().trim();
    if (!lower) return '_default';

    for (const entry of LOCATION_KEYWORDS) {
        for (const kw of entry.keywords) {
            if (lower.includes(kw)) {
                return entry.region;
            }
        }
    }

    return '_default';
}

/**
 * Get job source names for a given location.
 * @param {string} location - Free-text location (e.g. "Toronto, Canada")
 * @returns {string[]} Source names in priority order
 */
function getSourcesForLocation(location) {
    const region = detectRegion(location);
    return REGION_SOURCES[region] || REGION_SOURCES._default;
}

module.exports = {
    getSourcesForLocation,
    detectRegion,
    REGION_SOURCES,
    LOCATION_KEYWORDS
};
