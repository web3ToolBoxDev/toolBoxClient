'use strict';

/**
 * Search Pipeline — Dashboard-driven automated job search.
 *
 * Orchestrates: job_search → parse_listing → match_profile
 * Runs asynchronously, updates dashboard state via dashboardServer.
 * Configurable: minScore, targetCount, sources.
 */

const { handler: jobSearchHandler } = require('./tools/jobSearch');
const { handler: parseListingHandler } = require('./tools/parseListing');
const { handler: matchProfileHandler } = require('./tools/matchProfile');
const { handler: resumeGenHandler } = require('./tools/resumeGen');
const { handler: coverLetterHandler } = require('./tools/coverLetter');
const dashboardServer = require('./dashboardServer');

// Active pipeline runs: sessionId → PipelineState
const _pipelines = new Map();

/**
 * Generate search queries based on user's direction (job title, location, skills).
 * Returns an array of query objects for different job sites.
 */
function buildSearchQueries(direction, profile) {
    const queries = [];
    const jobTitle = direction.q_job_title || direction.jobTitle || '';
    const location = direction.q_location || direction.location || '';
    const skills = (profile.skills || '').split(/[,，\n]/).map(s => s.trim()).filter(Boolean).slice(0, 3);

    if (!jobTitle) return queries;

    // Primary query: exact job title
    queries.push({ query: jobTitle, location, source: 'indeed' });

    // Skill-augmented query
    if (skills.length > 0) {
        queries.push({ query: `${jobTitle} ${skills[0]}`, location, source: 'indeed' });
    }

    // Broader query without location (remote jobs)
    if (location) {
        queries.push({ query: jobTitle, location: '', source: 'indeed' });
    }

    return queries;
}

/**
 * Start a search pipeline.
 * @param {string} sessionId
 * @param {object} config - { minScore, targetCount, maxResults }
 * @param {object} direction - { q_job_title, q_location, q_work_mode, q_salary }
 * @param {object} profile - { basic, skills, experience, education }
 * @returns {object} Pipeline state
 */
function startPipeline(sessionId, config, direction, profile) {
    if (_pipelines.has(sessionId) && _pipelines.get(sessionId).running) {
        return { error: 'Pipeline already running', running: true };
    }

    const pipeline = {
        sessionId,
        running: true,
        startedAt: new Date().toISOString(),
        config: {
            minScore: config.minScore || 60,
            targetCount: config.targetCount || 10,
            maxResults: config.maxResults || 30
        },
        direction,
        profile,
        progress: {
            phase: 'searching',
            searched: 0,
            parsed: 0,
            matched: 0,
            qualified: 0,
            total: 0,
            errors: []
        },
        stoppedAt: null
    };

    _pipelines.set(sessionId, pipeline);

    // Run asynchronously
    _runPipeline(sessionId).catch(err => {
        console.error(`[searchPipeline] Error in pipeline ${sessionId}:`, err.message);
        const p = _pipelines.get(sessionId);
        if (p) {
            p.running = false;
            p.progress.phase = 'error';
            p.progress.errors.push(err.message);
        }
    });

    return { running: true, config: pipeline.config };
}

/**
 * Internal: execute the pipeline steps.
 */
async function _runPipeline(sessionId) {
    const pipeline = _pipelines.get(sessionId);
    if (!pipeline) return;

    const { config, direction, profile } = pipeline;
    const queries = buildSearchQueries(direction, profile);

    if (queries.length === 0) {
        pipeline.running = false;
        pipeline.progress.phase = 'error';
        pipeline.progress.errors.push('No job title set — cannot search');
        return;
    }

    // Phase 1: Search
    pipeline.progress.phase = 'searching';
    const allListings = [];
    const seenUrls = new Set();

    for (const q of queries) {
        if (!pipeline.running) break; // Check for stop signal

        try {
            const result = await jobSearchHandler({
                query: q.query,
                location: q.location,
                maxResults: Math.ceil(config.maxResults / queries.length),
                source: q.source
            });

            for (const listing of (result.listings || [])) {
                if (listing.url && !seenUrls.has(listing.url)) {
                    seenUrls.add(listing.url);
                    allListings.push(listing);

                    // Record as discovered
                    dashboardServer.upsertJobCard(sessionId, {
                        url: listing.url,
                        title: listing.title,
                        company: listing.company,
                        location: listing.location,
                        salary: listing.salary,
                        status: 'discovered'
                    });
                }
            }

            pipeline.progress.searched++;
            pipeline.progress.total = allListings.length;
        } catch (err) {
            pipeline.progress.errors.push(`Search error: ${err.message}`);
        }
    }

    if (!pipeline.running) { _finishPipeline(sessionId, 'stopped'); return; }

    // Phase 2: Parse & Match
    pipeline.progress.phase = 'matching';

    for (const listing of allListings) {
        if (!pipeline.running) break;
        if (pipeline.progress.qualified >= config.targetCount) break;

        try {
            // Parse listing requirements
            let requirements = null;
            try {
                const parsed = await parseListingHandler({
                    url: listing.url,
                    rawHtml: listing.description || '',
                    mode: 'http'
                });
                requirements = parsed;
                pipeline.progress.parsed++;

                dashboardServer.updateJobStatus(sessionId, listing.url, 'parsed');
            } catch {
                // Parse failure is non-fatal, use what we have
            }

            // Match against profile
            const matchResult = await matchProfileHandler({
                profile,
                jobRequirements: requirements || {
                    technical: [],
                    experience: [],
                    education: [],
                    title: listing.title || ''
                },
                jobTitle: listing.title
            });

            const score = matchResult.overall || 0;
            pipeline.progress.matched++;

            // Update job card with score
            dashboardServer.upsertJobCard(sessionId, {
                url: listing.url,
                matchScore: score,
                status: score >= config.minScore ? 'matched' : 'discovered',
                artifacts: requirements ? { requirements: true } : {}
            });

            if (score >= config.minScore) {
                pipeline.progress.qualified++;
            }
        } catch (err) {
            pipeline.progress.errors.push(`Match error (${listing.url}): ${err.message}`);
        }
    }

    _finishPipeline(sessionId, pipeline.progress.qualified >= config.targetCount ? 'completed' : 'done');
}

function _finishPipeline(sessionId, reason) {
    const pipeline = _pipelines.get(sessionId);
    if (!pipeline) return;
    pipeline.running = false;
    pipeline.progress.phase = reason;
    pipeline.stoppedAt = new Date().toISOString();
}

/**
 * Stop a running pipeline.
 */
function stopPipeline(sessionId) {
    const pipeline = _pipelines.get(sessionId);
    if (!pipeline) return { error: 'No pipeline found' };
    pipeline.running = false;
    return { stopped: true };
}

/**
 * Get pipeline status.
 */
function getPipelineStatus(sessionId) {
    const pipeline = _pipelines.get(sessionId);
    if (!pipeline) return { running: false, progress: null };
    return {
        running: pipeline.running,
        config: pipeline.config,
        progress: pipeline.progress,
        startedAt: pipeline.startedAt,
        stoppedAt: pipeline.stoppedAt
    };
}

/**
 * Generate a tailored resume for a specific job.
 */
async function generateResume(sessionId, jobUrl, profile) {
    const cards = dashboardServer.getJobCards(sessionId);
    const job = cards.find(c => c.url === jobUrl);
    if (!job) return { error: 'Job not found' };

    try {
        const result = await resumeGenHandler({
            profile,
            jobTitle: job.title,
            jobRequirements: job.artifacts?.requirements || {},
            matchedSkills: []
        });

        dashboardServer.upsertJobCard(sessionId, {
            url: jobUrl,
            status: 'tailored',
            artifacts: { resume: result.markdown ? 'generated' : null }
        });

        return { success: true, markdown: result.markdown, job };
    } catch (err) {
        return { error: err.message };
    }
}

/**
 * Generate a cover letter for a specific job.
 */
async function generateCoverLetter(sessionId, jobUrl, profile) {
    const cards = dashboardServer.getJobCards(sessionId);
    const job = cards.find(c => c.url === jobUrl);
    if (!job) return { error: 'Job not found' };

    try {
        const result = await coverLetterHandler({
            profile,
            company: job.company,
            jobTitle: job.title,
            jobRequirements: job.artifacts?.requirements || {}
        });

        dashboardServer.upsertJobCard(sessionId, {
            url: jobUrl,
            artifacts: { coverLetter: result.markdown ? 'generated' : null }
        });

        return { success: true, markdown: result.markdown, job };
    } catch (err) {
        return { error: err.message };
    }
}

/**
 * Mark a job as applied.
 */
function markApplied(sessionId, jobUrl, note) {
    dashboardServer.updateJobStatus(sessionId, jobUrl, 'submitted');
    dashboardServer.upsertJobCard(sessionId, {
        url: jobUrl,
        artifacts: { appliedAt: new Date().toISOString(), applyNote: note || '' }
    });
    return { success: true };
}

/**
 * Get application history (submitted + followed_up jobs).
 */
function getHistory(sessionId) {
    const cards = dashboardServer.getJobCards(sessionId);
    return cards.filter(c => ['submitted', 'followed_up', 'archived'].includes(c.status));
}

module.exports = {
    startPipeline,
    stopPipeline,
    getPipelineStatus,
    generateResume,
    generateCoverLetter,
    markApplied,
    getHistory,
    buildSearchQueries
};
