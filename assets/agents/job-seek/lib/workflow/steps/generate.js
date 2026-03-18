'use strict';

/**
 * Step: Generate — creates tailored resumes, cover letters, and interview prep for matched jobs.
 *
 * Uses AI (aiInvoke from context) to generate resume + cover letter in ONE call.
 * Falls back to templates if AI is unavailable.
 * Interview prep always generates a coaching prompt (not AI content).
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
 * @param {object} params.context - { profile, aiInvoke, ... }
 * @returns {object} Generation results summary
 */
async function execute({ sessionId, config, context }) {
    const { profile, aiInvoke } = context;

    // Read generate step config from workflow editor
    const generateStep = (config.steps || []).find(s => s.name === 'generate');
    const opts = {
        tailorResume:  generateStep?.tailorResume !== false,
        coverLetter:   generateStep?.coverLetter !== false,
        interviewPrep: generateStep?.interviewPrep !== false,
        jobIds:        generateStep?.jobIds || []
    };

    // Get qualified jobs from dashboard (matched or tailored)
    const cards = dashboardServer.getJobCards(sessionId);
    const qualifiedJobs = cards.filter(c =>
        ['matched', 'tailored'].includes(c.status) &&
        (c.matchScore || 0) >= (config.search?.minScore || 60)
    );

    // Filter by jobIds if user selected specific jobs in the editor
    let targetJobs = qualifiedJobs;
    if (opts.jobIds.length > 0) {
        targetJobs = qualifiedJobs.filter(j => opts.jobIds.includes(j.url));
    }

    // Skip jobs already generated inline during search (taskLog.generate.status === 'ok')
    const skippedCount = targetJobs.filter(j => j.taskLog?.generate?.status === 'ok').length;
    targetJobs = targetJobs.filter(job => {
        const genLog = job.taskLog?.generate;
        if (genLog && genLog.status === 'ok') return false; // fully generated inline
        return true; // not generated or partial — process
    });

    if (targetJobs.length === 0) {
        const msg = skippedCount > 0
            ? `All ${skippedCount} jobs already generated inline during search`
            : 'No qualified jobs to generate documents for';
        return { generated: skippedCount, summary: msg };
    }

    let generated = 0;
    let aiUsed = 0;
    const errors = [];

    for (const job of targetJobs) {
        try {
            const result = await searchPipeline.generateAllDocs(sessionId, job.url, profile, {
                aiInvoke,
                tailorResume: opts.tailorResume,
                coverLetter: opts.coverLetter,
                interviewPrep: opts.interviewPrep,
                sessionProfile: context.sessionProfile || null
            });

            if (result.error) {
                errors.push(`${job.title}: ${result.error}`);
            } else {
                // Check individual results for errors
                if (result.results?.resume?.error) errors.push(`Resume for ${job.title}: ${result.results.resume.error}`);
                if (result.results?.coverLetter?.error) errors.push(`Cover letter for ${job.title}: ${result.results.coverLetter.error}`);
                if (result.results?.interviewPrep?.error) errors.push(`Interview prep for ${job.title}: ${result.results.interviewPrep.error}`);

                const hasSuccess = result.results?.resume?.success || result.results?.coverLetter?.success || result.results?.interviewPrep?.success;
                if (hasSuccess) generated++;
                if (result.aiGenerated) aiUsed++;
            }
        } catch (err) {
            errors.push(`${job.title}: ${err.message}`);
        }
    }

    const parts = [];
    if (opts.tailorResume) parts.push('resumes');
    if (opts.coverLetter) parts.push('cover letters');
    if (opts.interviewPrep) parts.push('interview prep');

    const aiNote = aiUsed > 0 ? ` (${aiUsed} AI-generated)` : ' (template fallback)';

    return {
        generated,
        total: targetJobs.length,
        aiUsed,
        errors,
        summary: `Generated ${parts.join(' + ')} for ${generated}/${targetJobs.length} jobs${aiNote}${errors.length ? ` (${errors.length} errors)` : ''}`
    };
}

module.exports = { execute };
