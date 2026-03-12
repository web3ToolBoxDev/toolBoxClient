'use strict';

/**
 * Workflow View Model — stable DTO for the diagram panel.
 *
 * Combines config + run state into a single serializable object
 * that the frontend can render without further logic.
 */

const store = require('./workflowStore');
const { getSourceMeta } = require('./workflowConfig');

/**
 * Build the view model for a session's workflow.
 * @param {string} sessionId
 * @returns {object} View model DTO
 */
function buildViewModel(sessionId) {
    const config = store.getConfig(sessionId);
    const run = store.getRun(sessionId);

    if (!config) {
        return {
            configured: false,
            status: 'unconfigured',
            steps: [],
            sources: [],
            search: {},
            currentStep: null
        };
    }

    // Build step view
    const steps = (config.steps || []).map(stepCfg => {
        const runStep = run?.steps?.find(s => s.name === stepCfg.name);
        return {
            name: stepCfg.name,
            enabled: stepCfg.enabled !== false,
            order: stepCfg.order,
            status: runStep?.status || 'idle',
            startedAt: runStep?.startedAt || null,
            completedAt: runStep?.completedAt || null,
            error: runStep?.error || null,
            result: runStep?.result || null
        };
    });

    // Build source view
    const sources = (config.sources || []).map(src => {
        const meta = getSourceMeta(src.name);
        return {
            name: src.name,
            label: src.label || meta?.label || src.name,
            enabled: src.enabled !== false,
            loginRequired: src.loginRequired || false,
            loginStatus: 'unknown',
            capabilities: src.capabilities || meta?.capabilities || ['search']
        };
    });

    return {
        configured: true,
        status: run?.status || 'idle',
        region: config.region,
        location: config.location,
        steps,
        sources,
        search: config.search || {},
        generate: config.generate || {},
        currentStep: run?.currentStep || null,
        startedAt: run?.startedAt || null,
        completedAt: run?.completedAt || null
    };
}

module.exports = { buildViewModel };
