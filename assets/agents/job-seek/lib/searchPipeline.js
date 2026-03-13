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
const { handler: mockInterviewHandler } = require('./tools/mockInterview');
const { getSourcesForLocation } = require('./sources/locationSources');
const dashboardServer = require('./dashboardServer');

// Lazy-loaded to avoid circular deps
let _scriptBuilder = null;
function getScriptBuilder() {
    if (!_scriptBuilder) _scriptBuilder = require('./workflow/scriptBuilder');
    return _scriptBuilder;
}
let _platformStore = null;
function getPlatformStore() {
    if (!_platformStore) _platformStore = require('./workflow/platformStore');
    return _platformStore;
}
let _platformService = null;
function getPlatformService() {
    if (!_platformService) _platformService = require('./workflow/platformService');
    return _platformService;
}

// Active pipeline runs: sessionId → PipelineState
const _pipelines = new Map();

// Source name → platform URL pattern mapping
const SOURCE_URL_PATTERNS = {
    indeed:   /indeed\./i,
    linkedin: /linkedin\./i,
    jobbank:  /jobbank/i,
    google:   /google\./i,
    glassdoor: /glassdoor\./i,
    seek:     /seek\.com/i,
    reed:     /reed\.co/i,
    stepstone: /stepstone/i,
    naukri:   /naukri\./i,
    boss:     /zhipin\./i,
    lagou:    /lagou\./i
};

/**
 * Build a map of source → platform for platforms with ready search tools.
 * @param {string} sessionId
 * @param {string[]} selectedPlatformIds - Platform IDs selected in workflow editor (empty = all)
 * @returns {Object<string, {id, name, url}>}
 */
function _buildPlatformToolMap(sessionId, selectedPlatformIds) {
    const map = {};
    try {
        const platforms = getPlatformStore().getPlatforms(sessionId);
        for (const p of platforms) {
            // If user selected specific platforms, filter
            if (selectedPlatformIds.length > 0 && !selectedPlatformIds.includes(p.id)) continue;
            // Only use platforms with ready search tools
            if (!p.tools || !p.tools.search || p.tools.search.status !== 'ready') continue;
            // Map to source name by URL pattern
            for (const [source, pattern] of Object.entries(SOURCE_URL_PATTERNS)) {
                if (pattern.test(p.url || '')) {
                    map[source] = { id: p.id, name: p.name, url: p.url };
                    break;
                }
            }
        }
    } catch (err) {
        console.error('[searchPipeline] Error building platform tool map:', err.message);
    }
    return map;
}

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
    const rawSkills = profile.skills || '';
    const skills = (Array.isArray(rawSkills) ? rawSkills : rawSkills.split(/[,，\n]/)).map(s => String(s).trim()).filter(Boolean).slice(0, 3);

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
            envId: config.envId || null,
            platforms: config.platforms || []   // platform IDs from workflow editor
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

    // Phase 1: Search — uses platform tool scripts only (no API fallback)
    pipeline.progress.phase = 'searching';
    const allListings = [];
    const seenUrls = new Set();

    // Resolve available platform tools for search
    const platformToolMap = _buildPlatformToolMap(sessionId, config.platforms || []);
    if (Object.keys(platformToolMap).length > 0) {
        _log(`Platform tools available: ${Object.entries(platformToolMap).map(([src, p]) => `${src}→${p.name}`).join(', ')}`);
    }

    // ── Pre-search validation: verify browser & login for each platform ──
    const _checkedPlatforms = new Set();
    const _blockedSources = new Set();

    for (const [source, pt] of Object.entries(platformToolMap)) {
        if (_checkedPlatforms.has(pt.id)) continue;
        _checkedPlatforms.add(pt.id);

        const platform = getPlatformStore().getPlatform(sessionId, pt.id);
        if (!platform) {
            _log(`⚠ [${source}] Platform "${pt.name}" not found — skipping`);
            _blockedSources.add(source);
            continue;
        }

        // Check 1: Browser open?
        if (!platform._browserId) {
            _log(`⚠ [${source}] No browser open for "${pt.name}" — cannot search`);
            dashboardServer.updatePlatformCell(sessionId, pt.id, {
                cell: 'login', status: 'error',
                message: 'Browser not open. Launch login first.'
            });
            _blockedSources.add(source);
            continue;
        }

        // Check 2: Login verified?
        try {
            const loginResult = await getPlatformService().verifyLogin(sessionId, pt.id);
            if (loginResult.status === 'not_logged_in' || loginResult.status === 'no_browser') {
                _log(`⚠ [${source}] Not logged in on "${pt.name}" — cannot search`);
                dashboardServer.updatePlatformCell(sessionId, pt.id, {
                    cell: 'login', status: 'error',
                    message: 'Not logged in. Please login first.'
                });
                _blockedSources.add(source);
                continue;
            }
            if (loginResult.status === 'logged_in') {
                _log(`✓ [${source}] Login verified on "${pt.name}"`);
            } else {
                _log(`? [${source}] Login status unknown on "${pt.name}" — proceeding anyway`);
            }
        } catch (err) {
            _log(`⚠ [${source}] Login check failed for "${pt.name}": ${err.message}`);
        }
    }

    if (_blockedSources.size > 0 && Object.keys(platformToolMap).length > 0) {
        const allBlocked = Object.keys(platformToolMap).every(s => _blockedSources.has(s));
        if (allBlocked) {
            _log('ERROR: All platform sources are blocked (browser not open or not logged in). Aborting search.');
            pipeline.progress.errors.push('All platforms blocked — browser not open or not logged in');
            _finishPipeline(sessionId, 'error');
            return;
        }
    }

    const _failedSources = new Set(); // Track sources that failed — skip subsequent queries

    for (const q of queries) {
        if (!pipeline.running) break; // Check for stop signal

        const platformTool = platformToolMap[q.source];

        // Skip blocked sources (pre-search validation failed)
        if (platformTool && _blockedSources.has(q.source)) {
            _log(`⊘ [${q.source}] Skipped — browser/login not ready`);
            continue;
        }

        // Skip sources that already failed (fail-fast: don't retry same platform)
        if (_failedSources.has(q.source)) {
            _log(`⊘ [${q.source}] Skipped — previous query on this source failed`);
            continue;
        }

        const method = platformTool ? 'platform tool' : 'skip (no tool)';
        _log(`Searching [${q.source}] "${q.query}" @ ${q.location || 'remote'} via ${method}...`);

        try {
            let listings = [];

            if (platformTool) {
                // Use the persisted platform search script
                const scriptResult = await getScriptBuilder().executeSearchScript(
                    sessionId,
                    platformTool.id,
                    { keywords: q.query, location: q.location },
                    { envId: q.envId || config.envId, maxResults: Math.ceil(config.maxResults / queries.length) }
                );
                if (scriptResult.success && scriptResult.jobs) {
                    listings = scriptResult.jobs.map(j => ({
                        title: j.title || '',
                        company: j.company || '',
                        location: j.location || q.location || '',
                        url: j.url || j.link || '',
                        salary: j.salary || '',
                        source: q.source
                    }));
                    _log(`[${q.source}] Platform tool returned ${listings.length} results`);
                } else {
                    // Platform tool failed — do NOT fall back to API.
                    // Mark login cell as error and skip all subsequent queries for this source.
                    const errMsg = scriptResult.error || 'unknown error';
                    _log(`✗ [${q.source}] Platform tool failed: ${errMsg}`);
                    _failedSources.add(q.source);
                    dashboardServer.updatePlatformCell(sessionId, platformTool.id, {
                        cell: 'login', status: 'error',
                        message: 'Search failed: ' + errMsg
                    });
                    pipeline.progress.errors.push(`[${q.source}] Search tool failed: ${errMsg}`);
                }
            } else {
                // No platform tool available for this source — skip silently
                _log(`[${q.source}] No platform tool available — skipped`);
                continue;
            }

            const newCount = listings.filter(l => l.url && !seenUrls.has(l.url)).length;
            _log(`[${q.source}] Found ${listings.length} results (${newCount} new)`);

            for (const listing of listings) {
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
 * Generate interview prep questions for a specific job.
 */
async function generateInterviewPrep(sessionId, jobUrl, profile) {
    const cards = dashboardServer.getJobCards(sessionId);
    const job = cards.find(c => c.url === jobUrl);
    if (!job) return { error: 'Job not found' };

    try {
        const result = mockInterviewHandler({
            action: 'generate',
            profile,
            jobTitle: job.title,
            requirements: job.artifacts?.requirements || {},
            count: 5
        });

        dashboardServer.upsertJobCard(sessionId, {
            url: jobUrl,
            artifacts: { interviewPrep: result.questions ? 'generated' : null }
        });

        return { success: true, questions: result.questions, job };
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
    generateInterviewPrep,
    markApplied,
    getHistory,
    buildSearchQueries
};
