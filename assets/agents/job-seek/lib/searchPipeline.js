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
const { getSourcesForLocation } = require('./sources/locationSources');
const dashboardServer = require('./dashboardServer');

// Active pipeline runs: sessionId → PipelineState
const _pipelines = new Map();

/**
 * Generate search queries based on user's direction (job title, location, skills).
 * Returns an array of query objects for different job sites.
 */
/**
 * Generate search queries based on user's direction (job title, location, skills).
 * Dynamically selects job sources based on location.
 * @param {object} direction - { q_job_title, q_location, q_work_mode, q_salary }
 * @param {object} profile - { basic, skills, experience, education }
 * @param {object} [options] - { envId } fingerprint browser env
 * @returns {Array<{query, location, source, envId?}>}
 */
function buildSearchQueries(direction, profile, options = {}) {
    const queries = [];
    const jobTitle = direction.q_job_title || direction.jobTitle || '';
    const location = direction.q_location || direction.location || '';
    const skills = (profile.skills || '').split(/[,，\n]/).map(s => s.trim()).filter(Boolean).slice(0, 3);

    if (!jobTitle) return queries;

    // Get sources based on location (e.g. Canada → indeed, linkedin, jobbank, google)
    const sources = getSourcesForLocation(location);
    const primarySource = sources[0] || 'indeed';

    const base = {};
    if (options.envId) base.envId = options.envId;

    // Primary query: exact job title on best source for this location
    queries.push({ ...base, query: jobTitle, location, source: primarySource });

    // Try second source if available
    if (sources.length > 1) {
        queries.push({ ...base, query: jobTitle, location, source: sources[1] });
    }

    // Skill-augmented query on primary source
    if (skills.length > 0) {
        queries.push({ ...base, query: `${jobTitle} ${skills[0]}`, location, source: primarySource });
    }

    // Broader query without location (remote jobs) on a different source
    if (location && sources.length > 2) {
        queries.push({ ...base, query: jobTitle, location: '', source: sources[2] });
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
            maxResults: config.maxResults || 30,
            envId: config.envId || null
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
            errors: [],
            logs: []
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
    const queries = buildSearchQueries(direction, profile, { envId: config.envId });
    const _log = (msg) => {
        const entry = { time: new Date().toISOString(), msg };
        pipeline.progress.logs.push(entry);
        console.log(`[pipeline:${sessionId.slice(0, 8)}] ${msg}`);
    };

    const jobTitle = direction.q_job_title || direction.jobTitle || '';
    const location = direction.q_location || direction.location || '';
    const mode = config.envId ? 'fingerprint browser' : 'API (HTTP)';
    _log(`Starting search: "${jobTitle}" in "${location || 'any'}" via ${mode}`);
    _log(`Config: minScore=${config.minScore}, target=${config.targetCount}, max=${config.maxResults}`);
    _log(`Queries: ${queries.map(q => `[${q.source}] "${q.query}" @ ${q.location || 'remote'}`).join(' | ')}`);

    if (queries.length === 0) {
        pipeline.running = false;
        pipeline.progress.phase = 'error';
        pipeline.progress.errors.push('No job title set — cannot search');
        _log('ERROR: No job title set — cannot search');
        return;
    }

    // Phase 1: Search
    pipeline.progress.phase = 'searching';
    const allListings = [];
    const seenUrls = new Set();

    for (const q of queries) {
        if (!pipeline.running) break; // Check for stop signal

        _log(`Searching [${q.source}] "${q.query}" @ ${q.location || 'remote'}${q.envId ? ' (fingerprint)' : ''}...`);

        try {
            const result = await jobSearchHandler({
                query: q.query,
                location: q.location,
                maxResults: Math.ceil(config.maxResults / queries.length),
                source: q.source,
                envId: q.envId
            });

            const newCount = (result.listings || []).filter(l => l.url && !seenUrls.has(l.url)).length;
            _log(`[${q.source}] Found ${(result.listings || []).length} results (${newCount} new) via ${result.source || q.source}`);

            for (const listing of (result.listings || [])) {
                if (listing.url && !seenUrls.has(listing.url)) {
                    seenUrls.add(listing.url);
                    allListings.push(listing);

                    _log(`+ "${listing.title}" @ ${listing.company || '?'} (${listing.location || '?'})`);

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
            _log(`ERROR [${q.source}]: ${err.message}`);
            pipeline.progress.errors.push(`Search error: ${err.message}`);
        }
    }

    _log(`Search complete: ${allListings.length} unique listings from ${pipeline.progress.searched} queries`);

    if (!pipeline.running) { _finishPipeline(sessionId, 'stopped'); return; }

    // Phase 2: Parse & Match
    pipeline.progress.phase = 'matching';
    _log(`Matching ${allListings.length} listings against profile (minScore: ${config.minScore}%)...`);

    for (const listing of allListings) {
        if (!pipeline.running) break;
        if (pipeline.progress.qualified >= config.targetCount) break;

        try {
            // Parse listing requirements
            let requirements = null;
            try {
                const parsed = await parseListingHandler({
                    url: listing.url,
                    useBrowser: false
                });
                requirements = parsed;
                pipeline.progress.parsed++;

                dashboardServer.updateJobStatus(sessionId, listing.url, 'parsed');
            } catch {
                // Parse failure is non-fatal, use what we have
            }

            // Match against profile
            const matchResult = matchProfileHandler({
                profile,
                requirements: requirements || {
                    title: listing.title || '',
                    sections: {
                        technical: '',
                        experience: '',
                        education: '',
                        soft_skills: ''
                    }
                },
                jobTitle: listing.title
            });

            const score = matchResult.overallScore || 0;
            pipeline.progress.matched++;

            const qualified = score >= config.minScore;
            _log(`${qualified ? '✓' : '✗'} "${listing.title}" @ ${listing.company || '?'} → score: ${score}%${qualified ? ' QUALIFIED' : ''}`);

            // Update job card with score
            dashboardServer.upsertJobCard(sessionId, {
                url: listing.url,
                matchScore: score,
                status: qualified ? 'matched' : 'discovered',
                artifacts: requirements ? { requirements: true } : {}
            });

            if (qualified) {
                pipeline.progress.qualified++;
            }
        } catch (err) {
            _log(`ERROR matching "${listing.title}": ${err.message}`);
            pipeline.progress.errors.push(`Match error (${listing.url}): ${err.message}`);
        }
    }

    const p = pipeline.progress;
    _log(`Done: ${p.qualified} qualified / ${p.matched} scored / ${allListings.length} found (${p.errors.length} errors)`);
    _finishPipeline(sessionId, p.qualified >= config.targetCount ? 'completed' : 'done');
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
        const result = resumeGenHandler({
            profile,
            jobTitle: job.title,
            company: job.company,
            requirements: job.artifacts?.requirements || {}
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
        const result = coverLetterHandler({
            profile,
            company: job.company,
            jobTitle: job.title,
            requirements: job.artifacts?.requirements || {}
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
