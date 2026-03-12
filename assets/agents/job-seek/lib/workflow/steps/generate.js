'use strict';

/**
 * Step: Generate — creates tailored resumes and cover letters for matched jobs.
 *
 * Iterates over qualified (matched) jobs and generates documents.
 */

const searchPipeline = require('../../searchPipeline');
const dashboardServer = require('../../dashboardServer');

/**
 * Execute the generate step.
 * @param {object} params
 * @param {string} params.sessionId
 * @param {object} params.context - { profile }
 * @returns {object} Generation results summary
 */
async function execute({ sessionId, config, context }) {
    const { profile } = context;

    // Get matched jobs from dashboard
    const cards = dashboardServer.getJobCards(sessionId);
    const qualifiedJobs = cards.filter(c => c.status === 'matched' && (c.matchScore || 0) >= (config.search?.minScore || 60));

    if (qualifiedJobs.length === 0) {
        return { generated: 0, summary: 'No qualified jobs to generate documents for' };
    }

    let generated = 0;
    const errors = [];

    for (const job of qualifiedJobs) {
        try {
            const resumeResult = await searchPipeline.generateResume(sessionId, job.url, profile);
            if (resumeResult.error) {
                errors.push(`Resume for ${job.title}: ${resumeResult.error}`);
            }

            const coverResult = await searchPipeline.generateCoverLetter(sessionId, job.url, profile);
            if (coverResult.error) {
                errors.push(`Cover letter for ${job.title}: ${coverResult.error}`);
            }

            if (!resumeResult.error || !coverResult.error) {
                generated++;
            }
        } catch (err) {
            errors.push(`${job.title}: ${err.message}`);
        }
    }

    return {
        generated,
        total: qualifiedJobs.length,
        errors,
        summary: `Generated documents for ${generated}/${qualifiedJobs.length} jobs${errors.length ? ` (${errors.length} errors)` : ''}`
    };
}

module.exports = { execute };
