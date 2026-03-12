'use strict';

/**
 * Workflow Configuration — builds default configs and validates overrides.
 *
 * 4-step pipeline: customizeProfile → search → generate → apply
 * Sources are location-aware with login metadata.
 */

const { getSourcesForLocation, detectRegion } = require('../sources/locationSources');

/** Source metadata: login requirements, rate limits, capabilities. */
const SOURCE_META = {
    indeed:   { label: 'Indeed',   loginRequired: false, rateLimit: 10, capabilities: ['search', 'parse'] },
    linkedin: { label: 'LinkedIn', loginRequired: true,  rateLimit: 5,  capabilities: ['search', 'parse'] },
    jobbank:  { label: 'Job Bank', loginRequired: false, rateLimit: 15, capabilities: ['search', 'parse'] },
    google:   { label: 'Google',   loginRequired: false, rateLimit: 20, capabilities: ['search'] }
};

/** Step definitions with defaults. */
const STEP_DEFAULTS = {
    customizeProfile: { enabled: true, order: 0 },
    search:           { enabled: true, order: 1 },
    generate:         { enabled: true, order: 2 },
    apply:            { enabled: true, order: 3 }
};

const VALID_STEPS = Object.keys(STEP_DEFAULTS);

/**
 * Build default workflow config for a given location.
 * @param {string} location - Free-text location (e.g. "Toronto, Canada")
 * @param {object} [overrides] - Partial config overrides
 * @returns {object} Complete workflow config
 */
function buildDefaultConfig(location, overrides = {}) {
    const region = detectRegion(location);
    const sourceNames = getSourcesForLocation(location);

    const sources = sourceNames.map(name => ({
        name,
        enabled: true,
        ...(SOURCE_META[name] || { label: name, loginRequired: false, rateLimit: 10, capabilities: ['search'] })
    }));

    const steps = VALID_STEPS.map(name => ({
        name,
        ...STEP_DEFAULTS[name],
        ...(overrides.steps?.[name] || {})
    }));

    return {
        region,
        location: location || '',
        sources,
        steps,
        search: {
            minScore: 60,
            targetCount: 10,
            maxResults: 30,
            ...(overrides.search || {})
        },
        generate: {
            resumeFormat: 'markdown',
            coverLetterFormat: 'markdown',
            ...(overrides.generate || {})
        },
        createdAt: new Date().toISOString(),
        version: 1
    };
}

/**
 * Validate a workflow config object.
 * @param {object} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateConfig(config) {
    const errors = [];

    if (!config || typeof config !== 'object') {
        return { valid: false, errors: ['Config must be an object'] };
    }

    if (!Array.isArray(config.sources) || config.sources.length === 0) {
        errors.push('At least one source is required');
    } else {
        const enabledSources = config.sources.filter(s => s.enabled);
        if (enabledSources.length === 0) {
            errors.push('At least one source must be enabled');
        }
    }

    if (!Array.isArray(config.steps)) {
        errors.push('Steps must be an array');
    } else {
        for (const step of config.steps) {
            if (!VALID_STEPS.includes(step.name)) {
                errors.push(`Unknown step: ${step.name}`);
            }
        }
    }

    if (config.search) {
        if (typeof config.search.minScore === 'number' && (config.search.minScore < 0 || config.search.minScore > 100)) {
            errors.push('minScore must be 0-100');
        }
        if (typeof config.search.targetCount === 'number' && config.search.targetCount < 1) {
            errors.push('targetCount must be >= 1');
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Merge user overrides into an existing config.
 * @param {object} base - Existing config
 * @param {object} patch - Partial updates
 * @returns {object} Merged config
 */
function mergeConfig(base, patch) {
    const merged = { ...base };

    if (patch.sources && Array.isArray(patch.sources)) {
        merged.sources = base.sources.map(s => {
            const override = patch.sources.find(p => p.name === s.name);
            return override ? { ...s, ...override } : s;
        });
    }

    if (patch.steps) {
        if (typeof patch.steps === 'object' && !Array.isArray(patch.steps)) {
            // Object form: { search: { enabled: false } }
            merged.steps = base.steps.map(s => ({
                ...s,
                ...(patch.steps[s.name] || {})
            }));
        }
    }

    if (patch.search) {
        merged.search = { ...base.search, ...patch.search };
    }

    if (patch.generate) {
        merged.generate = { ...base.generate, ...patch.generate };
    }

    merged.version = (base.version || 0) + 1;
    return merged;
}

/**
 * Get source metadata by name.
 */
function getSourceMeta(name) {
    return SOURCE_META[name] || null;
}

module.exports = {
    buildDefaultConfig,
    validateConfig,
    mergeConfig,
    getSourceMeta,
    SOURCE_META,
    STEP_DEFAULTS,
    VALID_STEPS
};
