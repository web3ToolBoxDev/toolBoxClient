'use strict';

/**
 * Step: Search — runs the search pipeline with configured sources.
 *
 * Delegates to searchPipeline.startPipeline() and waits for completion.
 */

const searchPipeline = require('../../searchPipeline');

/**
 * Execute the search step.
 * @param {object} params
 * @param {string} params.sessionId
 * @param {object} params.config - Workflow config
 * @param {object} params.context - { direction, profile, envId }
 * @returns {object} Search results summary
 */
async function execute({ sessionId, config, context }) {
    const { direction, profile } = context;

    const searchConfig = {
        minScore: config.search?.minScore || 60,
        targetCount: config.search?.targetCount || 10,
        maxResults: config.search?.maxResults || 30,
        envId: context.envId || null
    };

    // Start pipeline
    const result = searchPipeline.startPipeline(sessionId, searchConfig, direction, profile);

    if (result.error) {
        throw new Error(result.error);
    }

    // Wait for pipeline to complete (poll every 2s, max 5 min)
    const maxWait = 300_000;
    const pollInterval = 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
        const status = searchPipeline.getPipelineStatus(sessionId);
        if (!status.running) {
            return {
                ...status.progress,
                summary: `Found ${status.progress?.qualified || 0} qualified jobs out of ${status.progress?.total || 0} searched`
            };
        }
        await new Promise(r => setTimeout(r, pollInterval));
    }

    // Timeout — stop pipeline
    searchPipeline.stopPipeline(sessionId);
    const finalStatus = searchPipeline.getPipelineStatus(sessionId);
    return {
        ...finalStatus.progress,
        summary: `Search timed out. Found ${finalStatus.progress?.qualified || 0} qualified jobs`,
        timedOut: true
    };
}

module.exports = { execute };
