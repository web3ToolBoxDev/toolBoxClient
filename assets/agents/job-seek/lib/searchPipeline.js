'use strict';

/**
 * Search Pipeline — Dashboard-driven automated job search.
 *
 * Orchestrates: job_search → parse_listing → match_profile
 * Runs asynchronously, updates dashboard state via dashboardServer.
 * Configurable: minScore, targetCount, sources.
 */

const { handler: jobSearchHandler } = require('./tools/jobSearch');
const { handler: parseListingHandler, extractRequirements } = require('./tools/parseListing');
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

// ─── S1: Gap Analyzer ───
/**
 * Analyze which sources still need more qualified results.
 * @param {Map} pipelines - The _pipelines map
 * @param {string} sessionId
 * @returns {Object<string, {qualified, target, deficit, resultCount}>} gap per source
 */
function _analyzeGap(pipelines, sessionId) {
    const pipeline = pipelines.get(sessionId);
    if (!pipeline) return {};
    const gap = {};
    const targetCount = pipeline.config.targetCount;
    const sourceQualified = pipeline._sourceQualified || {};
    const sourceResultCount = pipeline._sourceResultCount || {};

    // Check all sources that had results
    for (const source of Object.keys(sourceResultCount)) {
        const qualified = sourceQualified[source] || 0;
        if (qualified < targetCount) {
            gap[source] = {
                qualified,
                target: targetCount,
                deficit: targetCount - qualified,
                resultCount: sourceResultCount[source] || 0
            };
        }
    }
    return gap;
}

// ─── S2b: Query Expansion (async, AI-powered + deterministic fallback) ───
/**
 * Parse skills string into array.
 */
function _parseSkills(skillsRaw) {
    if (!skillsRaw) return [];
    const str = Array.isArray(skillsRaw) ? skillsRaw.join(',') : String(skillsRaw);
    return str.split(/[,，\n]/).map(s => s.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
}

/**
 * Generate expanded search queries based on gap analysis.
 * Uses AI (via injected callback) for industry-aware alternatives,
 * with deterministic fallbacks (skill rotation + seniority drop).
 *
 * @param {object} direction - { q_job_title, q_location }
 * @param {object} profile - { skills, highlights, experience }
 * @param {Object} gap - from _analyzeGap()
 * @param {Array} previousQueries - all queries tried so far
 * @param {Function} [aiExpander] - async callback for AI-powered expansion
 * @returns {Promise<Array<{query, location, source}>>}
 */
async function _expandQueries(direction, profile, gap, previousQueries, aiExpander) {
    const jobTitle = direction.q_job_title || direction.jobTitle || '';
    const location = direction.q_location || direction.location || '';
    const skills = _parseSkills(profile.skills);
    const previousKeywords = new Set(previousQueries.map(q => (q.query || q).toString().toLowerCase()));
    const newQueries = [];

    // ── Strategy A: Deterministic skill rotation (no AI needed) ──
    const gapSources = Object.keys(gap);
    for (const source of gapSources) {
        for (let i = 1; i < Math.min(skills.length, 4); i++) {
            const candidate = `${jobTitle} ${skills[i]}`;
            if (!previousKeywords.has(candidate.toLowerCase())) {
                newQueries.push({ query: candidate, location, source });
                previousKeywords.add(candidate.toLowerCase());
                break; // one per source
            }
        }
    }

    // ── Strategy B: AI-generated alternatives (industry-aware) ──
    if (typeof aiExpander === 'function') {
        const profileSummary = [
            profile.highlights || '',
            `Skills: ${(profile.skills || '').toString().slice(0, 200)}`,
            `Experience: ${(profile.experience || '').toString().slice(0, 200)}`
        ].filter(Boolean).join('\n');

        try {
            const aiSuggestions = await aiExpander({
                jobTitle,
                location,
                profileSummary,
                previousQueries: previousQueries.map(q => q.query || q),
                gap
            });
            for (const suggestion of (aiSuggestions || [])) {
                if (typeof suggestion === 'string' && suggestion.trim() && !previousKeywords.has(suggestion.toLowerCase())) {
                    // Distribute across gap sources round-robin
                    const targetSource = gapSources[newQueries.length % gapSources.length] || gapSources[0] || 'indeed';
                    newQueries.push({ query: suggestion.trim(), location, source: targetSource });
                    previousKeywords.add(suggestion.toLowerCase());
                }
            }
        } catch (err) {
            console.log('[expandQueries] AI expansion failed:', err.message);
        }
    }

    // ── Strategy C: Drop seniority prefix (deterministic fallback) ──
    const seniority = /^(senior|sr\.?|junior|jr\.?|lead|staff|principal)\s+/i;
    if (seniority.test(jobTitle)) {
        const broader = jobTitle.replace(seniority, '').trim();
        if (!previousKeywords.has(broader.toLowerCase())) {
            newQueries.push({ query: broader, location, source: gapSources[0] || 'indeed' });
        }
    }

    return newQueries;
}

// Seen jobs: sessionId → Set<url> — persists across pipeline runs within a session
const _seenJobs = new Map();

function _getSeenJobs(sessionId) {
    if (!_seenJobs.has(sessionId)) _seenJobs.set(sessionId, new Set());
    return _seenJobs.get(sessionId);
}

function _addSeenJob(sessionId, url) {
    _getSeenJobs(sessionId).add(url);
}

function _clearSeenJobs(sessionId) {
    _seenJobs.delete(sessionId);
}

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
            platforms: config.platforms || [],   // platform IDs from workflow editor
            maxSearchRounds: config.maxSearchRounds || 3,
            aiExpander: config.aiExpander || null  // injected AI callback for query expansion
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
            logs: [],
            searchRound: 1
        },
        // Adaptive search tracking
        _searchRound: 1,
        _allQueries: [],        // all queries tried across rounds (for dedup)
        _sourceQualified: {},   // source → number of qualified jobs (persisted across rounds)
        _sourceResultCount: {}, // source → number of results fetched (persisted across rounds)
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
    const initialQueries = buildSearchQueries(direction, profile, { envId: config.envId });
    pipeline._allQueries = initialQueries.slice(); // track for adaptive dedup
    const _log = (msg, meta) => {
        const entry = { time: new Date().toISOString(), msg, ...(meta || {}) };
        pipeline.progress.logs.push(entry);
        console.log(`[pipeline:${sessionId.slice(0, 8)}] ${msg}`);
    };
    const queries = initialQueries;

    const jobTitle = direction.q_job_title || direction.jobTitle || '';
    const location = direction.q_location || direction.location || '';
    const mode = config.envId ? 'fingerprint browser' : 'API (HTTP)';
    _log(`Starting search: "${jobTitle}" in "${location || 'any'}" via ${mode}`);
    _log(`Config: minScore=${config.minScore}, targetCount=${config.targetCount}/platform, maxResults=${config.maxResults}/platform`);
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
    // Merge previously seen job URLs so we skip already-parsed jobs
    const previouslySeen = _getSeenJobs(sessionId);
    const seenUrls = new Set(previouslySeen);
    if (previouslySeen.size > 0) {
        _log(`Loaded ${previouslySeen.size} previously seen job URLs — will skip`);
    }

    // Resolve available platform tools for search
    const platformToolMap = _buildPlatformToolMap(sessionId, config.platforms || []);
    if (Object.keys(platformToolMap).length > 0) {
        _log(`Platform tools available: ${Object.entries(platformToolMap).map(([src, p]) => `${src}→${p.name}`).join(', ')}`);
    }

    // ── Group queries by source so all queries for one platform complete before the next ──
    const sourceOrder = [];
    const sourceQueries = {};
    for (const q of queries) {
        if (!sourceQueries[q.source]) {
            sourceQueries[q.source] = [];
            sourceOrder.push(q.source);
        }
        sourceQueries[q.source].push(q);
    }

    // ── Shared tracking state ──
    const _checkedPlatforms = new Set();  // platforms already validated
    const _blockedSources = new Set();    // sources that failed validation
    const _failedSources = new Set();     // sources whose search query failed at runtime
    // Use pipeline-level tracking for adaptive search support
    const _sourceResultCount = pipeline._sourceResultCount;

    const runnableQueryCount = queries.filter(q => platformToolMap[q.source]).length;
    _log(`Runnable queries: ${runnableQueryCount} of ${queries.length}, maxResults per platform: ${config.maxResults}`);

    // ── Helper: validate browser & login for a platform (once per platform) ──
    async function _validatePlatform(source, platformTool) {
        if (_checkedPlatforms.has(platformTool.id)) return !_blockedSources.has(source);
        _checkedPlatforms.add(platformTool.id);

        const platform = getPlatformStore().getPlatform(sessionId, platformTool.id);
        if (!platform) {
            _log(`⚠ [${source}] Platform "${platformTool.name}" not found — skipping`);
            _blockedSources.add(source);
            return false;
        }

        // Check 1: Browser open? Try adopting shared browser or auto-launching.
        if (!platform._browserId) {
            const adopted = await getPlatformService().adoptSharedBrowser(sessionId, platformTool.id);
            if (adopted.success) {
                _log(`↗ [${source}] Adopted shared browser for "${platformTool.name}" (tab ${adopted.pageIndex})`);
            } else if (platform.envId) {
                _log(`🚀 [${source}] No browser open for "${platformTool.name}" — auto-launching...`);
                dashboardServer.updatePlatformCell(sessionId, platformTool.id, {
                    cell: 'login', status: 'running',
                    message: 'Auto-launching browser...'
                });
                try {
                    const launchResult = await getPlatformService().launchLogin(sessionId, platformTool.id);
                    if (launchResult.success && launchResult.browserId) {
                        _log(`✓ [${source}] Browser launched for "${platformTool.name}"`);
                        dashboardServer.updatePlatformCell(sessionId, platformTool.id, {
                            cell: 'login', status: 'ok',
                            message: 'Browser launched'
                        });
                    } else {
                        _log(`⚠ [${source}] Auto-launch failed for "${platformTool.name}": ${launchResult.error || 'unknown'}`);
                        dashboardServer.updatePlatformCell(sessionId, platformTool.id, {
                            cell: 'login', status: 'error',
                            message: 'Auto-launch failed: ' + (launchResult.error || 'unknown')
                        });
                        _blockedSources.add(source);
                        return false;
                    }
                } catch (launchErr) {
                    _log(`⚠ [${source}] Auto-launch error for "${platformTool.name}": ${launchErr.message}`);
                    dashboardServer.updatePlatformCell(sessionId, platformTool.id, {
                        cell: 'login', status: 'error',
                        message: 'Auto-launch error: ' + launchErr.message
                    });
                    _blockedSources.add(source);
                    return false;
                }
            } else {
                _log(`⚠ [${source}] No browser open for "${platformTool.name}" and no envId — cannot search`);
                dashboardServer.updatePlatformCell(sessionId, platformTool.id, {
                    cell: 'login', status: 'error',
                    message: 'Browser not open. Launch login first.'
                });
                _blockedSources.add(source);
                return false;
            }
        }

        // Check 2: Login verified?
        try {
            const loginResult = await getPlatformService().verifyLogin(sessionId, platformTool.id);
            if (loginResult.status === 'not_logged_in' || loginResult.status === 'no_browser') {
                _log(`⚠ [${source}] Not logged in on "${platformTool.name}" — cannot search`);
                dashboardServer.updatePlatformCell(sessionId, platformTool.id, {
                    cell: 'login', status: 'error',
                    message: 'Not logged in. Please login first.'
                });
                _blockedSources.add(source);
                return false;
            }
            if (loginResult.status === 'logged_in') {
                _log(`✓ [${source}] Login verified on "${platformTool.name}"`);
            } else {
                _log(`? [${source}] Login status unknown on "${platformTool.name}" — proceeding anyway`);
            }
        } catch (err) {
            _log(`⚠ [${source}] Login check failed for "${platformTool.name}": ${err.message}`);
        }
        return true;
    }

    // ── Helper: run all queries for a single source sequentially ──
    async function _runSourceQueries(source) {
        const sqList = sourceQueries[source] || [];
        for (const q of sqList) {
            if (!pipeline.running) break;

            const platformTool = platformToolMap[q.source];

            if (platformTool && _blockedSources.has(q.source)) {
                _log(`⊘ [${q.source}] Skipped — browser/login not ready`);
                continue;
            }
            if (_failedSources.has(q.source)) {
                _log(`⊘ [${q.source}] Skipped — previous query on this source failed`);
                continue;
            }
            const srcCount = _sourceResultCount[q.source] || 0;
            if (srcCount >= config.maxResults) {
                _log(`⊘ [${q.source}] Skipped — already fetched ${srcCount}/${config.maxResults} results`);
                continue;
            }

            // Just-in-time platform validation
            if (platformTool) {
                const ok = await _validatePlatform(q.source, platformTool);
                if (!ok) continue;
            }

            const method = platformTool ? 'platform tool' : 'skip (no tool)';
            _log(`Searching [${q.source}] "${q.query}" @ ${q.location || 'remote'} via ${method}...`);

            try {
                let listings = [];

                if (platformTool) {
                    const remaining = config.maxResults - (_sourceResultCount[q.source] || 0);
                    const scriptResult = await getScriptBuilder().executeSearchScript(
                        sessionId,
                        platformTool.id,
                        { keywords: q.query, location: q.location },
                        { envId: q.envId || config.envId, maxResults: Math.min(remaining, config.maxResults) }
                    );
                    if (scriptResult.success && scriptResult.jobs) {
                        listings = scriptResult.jobs.map(j => ({
                            title: j.title || '',
                            company: j.company || '',
                            location: j.location || q.location || '',
                            url: j.url || j.link || '',
                            salary: j.salary || '',
                            source: q.source,
                            fullText: j.fullText || ''
                        }));
                        _log(`[${q.source}] Platform tool returned ${listings.length} results`);
                    } else {
                        const errMsg = scriptResult.error || 'unknown error';
                        _log(`✗ [${q.source}] Platform tool failed: ${errMsg}`);
                        _failedSources.add(q.source);
                        dashboardServer.updatePlatformCell(sessionId, platformTool.id, {
                            cell: 'search', status: 'error',
                            message: 'Search failed: ' + errMsg
                        });
                        pipeline.progress.errors.push(`[${q.source}] Search tool failed: ${errMsg}`);
                    }
                } else {
                    _log(`[${q.source}] No platform tool available — skipped`);
                    continue;
                }

                const newCount = listings.filter(l => l.url && !seenUrls.has(l.url)).length;
                _log(`[${q.source}] Found ${listings.length} results (${newCount} new)`);

                for (const listing of listings) {
                    if (listing.url && !seenUrls.has(listing.url)) {
                        seenUrls.add(listing.url);
                        allListings.push(listing);
                        _sourceResultCount[q.source] = (_sourceResultCount[q.source] || 0) + 1;
                        _log(`+ "${listing.title}" @ ${listing.company || '?'} (${listing.location || '?'})`);
                    }
                }

                pipeline.progress.searched++;
                pipeline.progress.total = allListings.length;
            } catch (err) {
                _log(`ERROR [${q.source}]: ${err.message}`);
                pipeline.progress.errors.push(`Search error: ${err.message}`);
            }
        }
    }

    // ── Execute: sequential only (browser can only operate one active tab at a time) ──
    for (const source of sourceOrder) {
        if (!pipeline.running) break;
        await _runSourceQueries(source);
    }

    _log(`Search complete: ${allListings.length} unique listings from ${pipeline.progress.searched} queries`);

    if (!pipeline.running) { _finishPipeline(sessionId, 'stopped'); return; }

    // Phase 2: Parse & Match (targetCount is per-platform)
    pipeline.progress.phase = 'matching';
    _log(`Matching ${allListings.length} listings against profile (minScore: ${config.minScore}%, targetCount per platform: ${config.targetCount})...`);
    // Use pipeline-level qualified tracking for adaptive rounds
    const _sourceQualified = pipeline._sourceQualified;

    for (const listing of allListings) {
        if (!pipeline.running) break;

        // Per-platform targetCount: skip if this source already has enough qualified jobs
        const srcQual = _sourceQualified[listing.source] || 0;
        if (srcQual >= config.targetCount) {
            _log(`⊘ [${listing.source}] Skipped matching — already ${srcQual}/${config.targetCount} qualified`);
            continue;
        }

        try {
            // Parse listing requirements — prefer fullText from search script
            let requirements = null;
            if (listing.fullText) {
                // JD already fetched by search script Phase 2
                requirements = extractRequirements({ text: listing.fullText, title: listing.title || '' });
                pipeline.progress.parsed++;
                dashboardServer.updateJobStatus(sessionId, listing.url, 'parsed');
                _log(`  Parsed JD from search script fullText (${listing.fullText.length} chars)`);
            } else {
                // Fallback: try HTTP fetch (may be blocked by anti-bot)
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
            _log(`${qualified ? '✓' : '✗'} "${listing.title}" @ ${listing.company || '?'} → score: ${score}%${qualified ? ' QUALIFIED' : ''}`, {
                url: listing.url, score, title: listing.title, company: listing.company || '?'
            });

            // Only store qualified jobs (score >= minScore)
            if (qualified) {
                dashboardServer.upsertJobCard(sessionId, {
                    url: listing.url,
                    title: listing.title,
                    company: listing.company,
                    location: listing.location,
                    salary: listing.salary,
                    fullText: listing.fullText || '',
                    matchScore: score,
                    status: 'matched',
                    artifacts: requirements ? { requirements } : {},
                    matchBreakdown: matchResult.breakdown || null
                });
                pipeline.progress.qualified++;
                _sourceQualified[listing.source] = (_sourceQualified[listing.source] || 0) + 1;
            }

            // Track this URL as seen (persisted across pipeline runs)
            _addSeenJob(sessionId, listing.url);
        } catch (err) {
            _log(`ERROR matching "${listing.title}": ${err.message}`);
            pipeline.progress.errors.push(`Match error (${listing.url}): ${err.message}`);
        }
    }

    const p = pipeline.progress;
    const srcSummary = Object.entries(_sourceQualified).map(([s, n]) => `${s}: ${n}/${config.targetCount}`).join(', ');
    _log(`Round ${pipeline._searchRound}: ${p.qualified} qualified / ${p.matched} scored / ${allListings.length} found (${p.errors.length} errors)`);
    _log(`Per-platform qualified: ${srcSummary || 'none'}`);

    // ─── Adaptive expansion: retry if results insufficient ───
    const gap = _analyzeGap(_pipelines, sessionId);
    const hasGap = Object.keys(gap).length > 0;
    const round = pipeline._searchRound;

    if (hasGap && round < config.maxSearchRounds && pipeline.running) {
        pipeline._searchRound = round + 1;
        pipeline.progress.searchRound = round + 1;
        _log(`Gap detected: ${Object.entries(gap).map(([s, g]) => `${s}: ${g.qualified}/${g.target}`).join(', ')}`);

        const newQueries = await _expandQueries(
            direction, profile, gap,
            pipeline._allQueries,
            config.aiExpander
        );

        if (newQueries.length > 0) {
            _log(`Round ${round + 1}: ${newQueries.length} expanded queries → ${newQueries.map(q => `[${q.source}] "${q.query}"`).join(', ')}`);
            pipeline.progress.phase = 'search_expand';
            dashboardServer.updatePipelineProgress(sessionId, {
                phase: 'search_expand',
                message: `Round ${round + 1}: trying ${newQueries.length} alternative queries...`,
                round: round + 1
            });

            // Track all queries for dedup
            pipeline._allQueries.push(...newQueries);

            // Group new queries by source
            const newSourceQueries = {};
            const newSourceOrder = [];
            for (const q of newQueries) {
                if (!newSourceQueries[q.source]) {
                    newSourceQueries[q.source] = [];
                    newSourceOrder.push(q.source);
                }
                newSourceQueries[q.source].push(q);
            }

            // Inject into the sourceQueries structure for _runSourceQueries
            for (const [src, qList] of Object.entries(newSourceQueries)) {
                sourceQueries[src] = qList;
            }

            // Phase 1 again: run new queries (only for gap sources)
            pipeline.progress.phase = 'searching';
            for (const source of newSourceOrder) {
                if (!pipeline.running) break;
                await _runSourceQueries(source);
            }

            if (!pipeline.running) { _finishPipeline(sessionId, 'stopped'); return; }

            // Phase 2 again: match new results only
            const newListings = allListings.filter(l => !_getSeenJobs(sessionId).has(l.url));
            if (newListings.length > 0) {
                pipeline.progress.phase = 'matching';
                _log(`Matching ${newListings.length} new listings from round ${round + 1}...`);

                for (const listing of newListings) {
                    if (!pipeline.running) break;
                    const srcQual = _sourceQualified[listing.source] || 0;
                    if (srcQual >= config.targetCount) continue;

                    try {
                        let requirements = null;
                        if (listing.fullText) {
                            requirements = extractRequirements({ text: listing.fullText, title: listing.title || '' });
                            pipeline.progress.parsed++;
                            dashboardServer.updateJobStatus(sessionId, listing.url, 'parsed');
                        }

                        const matchResult = matchProfileHandler({
                            profile,
                            requirements: requirements || {
                                title: listing.title || '',
                                sections: { technical: '', experience: '', education: '', soft_skills: '' }
                            },
                            jobTitle: listing.title
                        });

                        const score = matchResult.overallScore || 0;
                        pipeline.progress.matched++;
                        const qualified = score >= config.minScore;
                        _log(`${qualified ? '✓' : '✗'} "${listing.title}" @ ${listing.company || '?'} → score: ${score}%${qualified ? ' QUALIFIED' : ''}`, {
                            url: listing.url, score, title: listing.title, company: listing.company || '?'
                        });

                        if (qualified) {
                            dashboardServer.upsertJobCard(sessionId, {
                                url: listing.url,
                                title: listing.title,
                                company: listing.company,
                                location: listing.location,
                                salary: listing.salary,
                                fullText: listing.fullText || '',
                                matchScore: score,
                                status: 'matched',
                                artifacts: requirements ? { requirements } : {},
                                matchBreakdown: matchResult.breakdown || null
                            });
                            pipeline.progress.qualified++;
                            _sourceQualified[listing.source] = (_sourceQualified[listing.source] || 0) + 1;
                        }
                        _addSeenJob(sessionId, listing.url);
                    } catch (err) {
                        _log(`ERROR matching "${listing.title}": ${err.message}`);
                        pipeline.progress.errors.push(`Match error (${listing.url}): ${err.message}`);
                    }
                }
            }

            // Check if another round is needed (recursive gap check, capped by maxSearchRounds)
            const nextGap = _analyzeGap(_pipelines, sessionId);
            const nextHasGap = Object.keys(nextGap).length > 0;
            if (nextHasGap && pipeline._searchRound < config.maxSearchRounds && pipeline.running) {
                // Log and continue (will be handled by next iteration if we refactor to loop)
                const nextSrcSummary = Object.entries(_sourceQualified).map(([s, n]) => `${s}: ${n}/${config.targetCount}`).join(', ');
                _log(`After round ${pipeline._searchRound}: ${nextSrcSummary} — still has gap, but max rounds reached or will try next round`);
            }
        } else {
            _log(`Round ${round + 1}: no new queries generated — finishing`);
        }
    }

    // Final completion
    const finalGap = _analyzeGap(_pipelines, sessionId);
    const allMet = Object.keys(finalGap).length === 0 && Object.keys(_sourceResultCount).length > 0;
    const finalSummary = Object.entries(_sourceQualified).map(([s, n]) => `${s}: ${n}/${config.targetCount}`).join(', ');
    _log(`Final (${pipeline._searchRound} round${pipeline._searchRound > 1 ? 's' : ''}): ${p.qualified} qualified — ${finalSummary || 'none'}`);
    _finishPipeline(sessionId, allMet ? 'completed' : 'done');
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
 * Format interview prep questions into markdown.
 */
function _formatInterviewPrep(questions) {
    if (!Array.isArray(questions) || questions.length === 0) return '';
    return questions.map((q, i) => {
        let md = `### Q${i + 1}: ${q.question || q}`;
        if (q.category || q.type) md += `\n**Category:** ${q.category || q.type}`;
        if (q.hint) md += `\n**Hint:** ${q.hint}`;
        if (q.sampleAnswer) md += `\n\n**Sample Answer:**\n${q.sampleAnswer}`;
        return md;
    }).join('\n\n---\n\n');
}

/**
 * Generate a tailored resume for a specific job.
 * Two-stage: uses sessionProfile (already tailored for role) if available,
 * then applies JD-specific emphasis via matchResult.
 *
 * @param {string} sessionId
 * @param {string} jobUrl
 * @param {object} profile - Raw profile (fallback)
 * @param {object} [sessionProfile] - Session-tailored profile (preferred)
 */
async function generateResume(sessionId, jobUrl, profile, sessionProfile) {
    const cards = dashboardServer.getJobCards(sessionId);
    const job = cards.find(c => c.url === jobUrl);
    if (!job) return { error: 'Job not found' };

    try {
        const result = resumeGenHandler({
            profile,
            sessionProfile: sessionProfile || null,
            jobTitle: job.title,
            company: job.company,
            requirements: job.artifacts?.requirements || {},
            matchResult: job.matchBreakdown ? { breakdown: job.matchBreakdown } : undefined
        });

        // Generate DOCX buffer for auto-apply file upload
        let resumeDocx = null;
        try {
            const { markdownToDocx } = require('./tools/docxBuilder');
            const docxResult = await markdownToDocx(result.markdown, {
                type: 'Resume', company: job.company, title: job.title
            });
            resumeDocx = docxResult.buffer.toString('base64');
        } catch (docxErr) {
            console.error('[pipeline:resume] DOCX generation failed:', docxErr.message);
        }

        dashboardServer.upsertJobCard(sessionId, {
            url: jobUrl,
            status: 'tailored',
            artifacts: { resume: result.markdown || null, resumeDocx }
        });

        // Store resume variant in knowledge store for history & dedup
        const knowledgeClient = require('./core/knowledgeClient');
        const crypto = require('crypto');
        const urlHash = crypto.createHash('md5').update(jobUrl).digest('hex').slice(0, 12);
        knowledgeClient.upsert({
            refId: `resume_${urlHash}`,
            type: 'resume_variant',
            scope: `session:${sessionId}`,
            content: result.markdown || '',
            summary: `${job.title} @ ${job.company}`,
            tags: ['resume', job.company || 'unknown'],
            metadata: {
                jobUrl,
                jobTitle: job.title,
                company: job.company,
                matchScore: job.matchScore || 0,
                derivationChain: result.derivationChain || [],
                generatedAt: result.generatedAt
            }
        }).catch(err => {
            console.error('[pipeline:resume] Failed to store resume variant:', err.message);
        });

        return {
            success: true,
            markdown: result.markdown,
            derivationChain: result.derivationChain,
            job
        };
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

        // Generate DOCX buffer for cover letter
        let coverLetterDocx = null;
        try {
            const { markdownToDocx } = require('./tools/docxBuilder');
            const docxResult = await markdownToDocx(result.markdown, {
                type: 'CoverLetter', company: job.company, title: job.title
            });
            coverLetterDocx = docxResult.buffer.toString('base64');
        } catch (docxErr) {
            console.error('[pipeline:coverLetter] DOCX generation failed:', docxErr.message);
        }

        dashboardServer.upsertJobCard(sessionId, {
            url: jobUrl,
            artifacts: { coverLetter: result.markdown || null, coverLetterDocx }
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
        const result = await mockInterviewHandler({
            action: 'generate',
            profile,
            jobTitle: job.title,
            requirements: job.artifacts?.requirements || {},
            count: 5
        });

        const prepMarkdown = result.questions ? _formatInterviewPrep(result.questions) : null;

        dashboardServer.upsertJobCard(sessionId, {
            url: jobUrl,
            artifacts: { interviewPrep: prepMarkdown }
        });

        return { success: true, questions: result.questions, markdown: prepMarkdown, job };
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
    buildSearchQueries,
    clearSeenJobs: _clearSeenJobs,
    // Exported for testing
    _analyzeGap,
    _expandQueries,
    _parseSkills
};
