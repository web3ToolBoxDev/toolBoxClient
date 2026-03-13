'use strict';

/**
 * Step: Generate — creates tailored resumes, cover letters, and interview prep for matched jobs.
 *
 * Respects Workflow Editor toggles: tailorResume, coverLetter, interviewPrep.
 * Respects jobIds selection: if specified, only generates for those jobs.
 */

const searchPipeline = require('../../searchPipeline');
const dashboardServer = require('../../dashboardServer');

/**
 * Execute the generate step.
 * @param {object} params
 * @param {string} params.sessionId
 * @param {object} params.config - Workflow config
 * @param {object} params.context - { profile }
 * @returns {object} Generation results summary
 */
async function execute({ sessionId, config, context }) {
    const { profile } = context;

    // Read generate step config from workflow editor
    const generateStep = (config.steps || []).find(s => s.name === 'generate');
    const opts = {
        tailorResume:  generateStep?.tailorResume !== false,
        coverLetter:   generateStep?.coverLetter !== false,
        interviewPrep: generateStep?.interviewPrep !== false,
        jobIds:        generateStep?.jobIds || []
    };

    // Get matched jobs from dashboard
    const cards = dashboardServer.getJobCards(sessionId);
    const qualifiedJobs = cards.filter(c => c.status === 'matched' && (c.matchScore || 0) >= (config.search?.minScore || 60));

    // Filter by jobIds if user selected specific jobs in the editor
    let targetJobs = qualifiedJobs;
    if (opts.jobIds.length > 0) {
        targetJobs = qualifiedJobs.filter(j => opts.jobIds.includes(j.url));
    }

    if (targetJobs.length === 0) {
        return { generated: 0, summary: 'No qualified jobs to generate documents for' };
    }

    let generated = 0;
    const errors = [];

    for (const job of targetJobs) {
        try {
            let jobSuccess = false;

            // Resume
            if (opts.tailorResume) {
                const resumeResult = await searchPipeline.generateResume(sessionId, job.url, profile);
                if (resumeResult.error) {
                    errors.push(`Resume for ${job.title}: ${resumeResult.error}`);
                } else {
                    jobSuccess = true;
                }
            }

            // Cover letter
            if (opts.coverLetter) {
                const coverResult = await searchPipeline.generateCoverLetter(sessionId, job.url, profile);
                if (coverResult.error) {
                    errors.push(`Cover letter for ${job.title}: ${coverResult.error}`);
                } else {
                    jobSuccess = true;
                }
            }

            // Interview prep
            if (opts.interviewPrep) {
                const prepResult = await searchPipeline.generateInterviewPrep(sessionId, job.url, profile);
                if (prepResult.error) {
                    errors.push(`Interview prep for ${job.title}: ${prepResult.error}`);
                } else {
                    jobSuccess = true;
                }
            }

            if (jobSuccess) {
                generated++;
            }
        } catch (err) {
            errors.push(`${job.title}: ${err.message}`);
        }
    }

    const parts = [];
    if (opts.tailorResume) parts.push('resumes');
    if (opts.coverLetter) parts.push('cover letters');
    if (opts.interviewPrep) parts.push('interview prep');

    return {
        generated,
        total: targetJobs.length,
        errors,
        summary: `Generated ${parts.join(' + ')} for ${generated}/${targetJobs.length} jobs${errors.length ? ` (${errors.length} errors)` : ''}`
    };
}

module.exports = { execute };
