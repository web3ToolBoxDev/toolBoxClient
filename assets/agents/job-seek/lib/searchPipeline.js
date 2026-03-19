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
const { handler: matchProfileHandler, buildMatchPrompt, parseMatchResponse } = require('./tools/matchProfile');
const { handler: resumeGenHandler } = require('./tools/resumeGen');
const { handler: coverLetterHandler } = require('./tools/coverLetter');
const { handler: mockInterviewHandler } = require('./tools/mockInterview');
const { getSourcesForLocation } = require('./sources/locationSources');
const dashboardServer = require('./dashboardServer');
const alertService = require('./workflow/alertService');

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

// ─── Cloudflare Detection ───
const _CLOUDFLARE_SIGNATURES = [
    'cloudflare', 'just a moment', 'checking your browser',
    'cf-browser-verification', 'attention required',
    'ray id', 'blocked by anti-bot'
];

/**
 * Check if an error message indicates a Cloudflare challenge/block.
 * @param {string} errorMsg - Error message from script execution
 * @returns {boolean}
 */
function _isCloudflareError(errorMsg) {
    if (!errorMsg) return false;
    const lower = errorMsg.toLowerCase();
    return _CLOUDFLARE_SIGNATURES.some(sig => lower.includes(sig));
}

/**
 * Check if page content (HTML/text) matches known Cloudflare challenge patterns.
 * Use this to detect Cloudflare blocks from raw page content returned by search scripts.
 * @param {string} pageContent - Raw HTML or text content from a page
 * @returns {boolean}
 */
function _isCloudflareChallenge(pageContent) {
    if (!pageContent || typeof pageContent !== 'string') return false;
    const lower = pageContent.toLowerCase();
    // Check for Cloudflare-specific markers
    const cfMarkers = [
        'cf-browser-verification',
        'cf-challenge-running',
        'cf_chl_opt',
        'challenges.cloudflare.com',
        'cdn-cgi/challenge-platform',
        'checking if the site connection is secure'
    ];
    const titleMarkers = ['just a moment', 'attention required'];
    // Title check: look for <title>Just a moment...</title>
    const titleMatch = lower.match(/<title[^>]*>(.*?)<\/title>/);
    if (titleMatch && titleMarkers.some(m => titleMatch[1].includes(m))) return true;
    // Body marker check
    return cfMarkers.some(m => lower.includes(m));
}

// Track Cloudflare-blocked platforms per pipeline run
const _cloudflareBlocked = new Map(); // sessionId → Set<source>

/**
 * Attempt to resolve Cloudflare Turnstile challenge by clicking the checkbox.
 * Returns true if challenge was resolved, false otherwise.
 */
async function _handleCloudflareChallenge(sessionId, platformTool, browserId, pageIndex, _log) {
    const toolClient = require('./core/toolServiceClient');

    _log(`🛡 [${platformTool.name}] Attempting Cloudflare auto-resolve...`);

    // Step 1: Screenshot to confirm challenge page
    await toolClient.executeTool('page_screenshot', { browserId, pageIndex });

    // Step 2: Try clicking the Turnstile checkbox
    // Turnstile renders in an iframe — try multiple selectors
    const clickSelectors = [
        'iframe[src*="challenges.cloudflare.com"]',
        '#turnstile-wrapper input[type="checkbox"]',
        '.cf-turnstile input',
        'input[type="checkbox"]'
    ];

    let clicked = false;
    for (const selector of clickSelectors) {
        try {
            const clickResult = await toolClient.executeTool('page_click', {
                browserId, pageIndex, selector
            });
            if (clickResult.success !== false) {
                clicked = true;
                _log(`🛡 [${platformTool.name}] Clicked: ${selector}`);
                break;
            }
        } catch (_) { /* try next selector */ }
    }

    if (!clicked) {
        _log(`✗ [${platformTool.name}] Could not find Turnstile checkbox`);
        return false;
    }

    // Step 3: Wait for challenge resolution (5 seconds)
    await new Promise(r => setTimeout(r, 5000));

    // Step 4: Check if challenge is resolved
    try {
        const checkResult = await toolClient.executeTool('page_evaluate', {
            browserId, pageIndex,
            expression: `(() => {
                const body = document.body?.innerText || '';
                const hasCF = body.includes('Verify you are human') ||
                              body.includes('Just a moment') ||
                              body.includes('Checking your browser') ||
                              document.querySelector('iframe[src*="challenges.cloudflare.com"]') !== null;
                return { resolved: !hasCF, url: window.location.href };
            })()`
        });

        const evalData = checkResult.result || checkResult;
        if (evalData.resolved) {
            _log(`✓ [${platformTool.name}] Cloudflare challenge passed`);
            return true;
        } else {
            _log(`✗ [${platformTool.name}] Cloudflare challenge still present after click`);
            return false;
        }
    } catch (evalErr) {
        _log(`✗ [${platformTool.name}] Could not verify Cloudflare resolution: ${evalErr.message}`);
        return false;
    }
}

// ─── Markdown → Display JSON ───
/**
 * Parse markdown into structured sections for in-page display.
 * Each section gets a `type` for differentiated rendering.
 */
function _markdownToSections(md, docType) {
    if (!md) return [];
    const SECTION_TYPE_MAP = {
        'summary': 'summary', 'professional summary': 'summary', 'highlights': 'summary',
        'skills': 'skills', 'key skills': 'skills', 'technical skills': 'skills', 'core competencies': 'skills',
        'experience': 'experience', 'work experience': 'experience', 'professional experience': 'experience',
        'education': 'education',
        'opening': 'letter', 'body': 'letter', 'closing': 'letter',
        'why': 'letter', 'sincerely': 'letter',
    };
    function detectType(title) {
        const t = title.toLowerCase();
        if (docType === 'interviewPrep' || /^q\d+|question \d+/i.test(title)) return 'qa';
        for (const key of Object.keys(SECTION_TYPE_MAP)) {
            if (t.includes(key)) return SECTION_TYPE_MAP[key];
        }
        if (docType === 'coverLetter') return 'letter';
        return 'text';
    }
    const lines = md.split('\n');
    const sections = [];
    let current = null;
    for (const line of lines) {
        const h = line.match(/^#{1,3}\s+(.+)/);
        if (h) {
            if (current) sections.push({ title: current.title, content: current.content.trim(), type: detectType(current.title) });
            current = { title: h[1].trim(), content: '' };
        } else if (current) {
            current.content += line + '\n';
        } else if (!sections.length && line.trim()) {
            current = { title: 'Overview', content: line + '\n' };
        }
    }
    if (current && current.content.trim()) sections.push({ title: current.title, content: current.content.trim(), type: detectType(current.title) });
    return sections;
}

// ─── Self-Heal Helper ───
/**
 * Analyze a search failure/anomaly, heal the script via AI, and retry once.
 *
 * Flow: analyzeFailure() → addFixRule() → healScript() → executeSearchScript()
 *
 * @param {string} sessionId
 * @param {object} platformTool - { id, name, url }
 * @param {object} query - { query, location, source, envId, pageOffset }
 * @param {object} config - pipeline config (needs aiInvoke, envId, maxResults)
 * @param {string} errorMsg - the failure description
 * @param {string|null} screenshot - base64 screenshot at failure time
 * @param {Function} _log - pipeline logger
 * @returns {Array|null} healed listings or null if heal failed
 */
async function _selfHealAndRetry(sessionId, platformTool, query, config, errorMsg, screenshot, _log) {
    try {
        const fullPlatform = getPlatformStore().getPlatform(sessionId, platformTool.id);
        const currentScript = fullPlatform?.tools?.search?.script || '';

        // Step 1: Analyze failure → generate fix rule
        const analysis = await getScriptBuilder().analyzeFailure(
            platformTool.name, platformTool.url, 'search',
            { error: errorMsg, script: currentScript, screenshot, promptRules: '' },
            { aiInvoke: config.aiInvoke }
        );
        if (analysis.rule) {
            getPlatformStore().addFixRule(platformTool.url, 'search', analysis.rule);
            _log(`  Fix rule: ${analysis.rule}`);
        }

        // Step 2: Heal the script using AI
        const healResult = await getScriptBuilder().healScript(
            sessionId, platformTool.id, 'search',
            { error: errorMsg, screenshot, currentScript },
            { aiInvoke: config.aiInvoke }
        );
        if (!healResult.success) {
            _log(`  healScript failed: ${healResult.error}`);
            return null;
        }
        _log(`  Script healed — retrying search...`);

        // Step 3: Retry search with healed script
        const remaining = config.maxResults - (config._sourceResultCount?.[query.source] || 0);
        const retryResult = await getScriptBuilder().executeSearchScript(
            sessionId,
            platformTool.id,
            { keywords: query.query, location: query.location, pageOffset: query.pageOffset || 0 },
            { envId: query.envId || config.envId, maxResults: Math.min(remaining, config.maxResults) }
        );

        if (retryResult.success && retryResult.jobs) {
            return retryResult.jobs.map(j => ({
                title: j.title || '',
                company: j.company || '',
                location: j.location || query.location || '',
                url: normalizeJobUrl(j.url || j.link || ''),
                salary: j.salary || '',
                jobType: j.jobType || '',
                source: query.source,
                fullText: j.fullText || ''
            }));
        }
        _log(`  Retry after heal also failed: ${retryResult.error || 'no results'}`);
        return null;
    } catch (err) {
        _log(`  Self-heal error: ${err.message}`);
        return null;
    }
}

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

// ─── URL Normalization ───
// Indeed/LinkedIn URLs contain tracking params that make the same job look different.
// Normalize to canonical form for dedup.
const _STRIP_PARAMS = new Set(['from', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'ref', 'refcode', 'trk', 'trackingId', 'currentJobId', 'eBP', 'recommendedFlavor',
    'fccid', 'vjs', 'vjk', 'advn', 'sjdu', 'tk', 'fromage', 'attributionid']);

function normalizeJobUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
        const u = new URL(rawUrl);
        // Indeed: extract jk param as canonical key
        if (u.hostname.includes('indeed.com') && u.searchParams.has('jk')) {
            return `${u.origin}${u.pathname}?jk=${u.searchParams.get('jk')}`;
        }
        // LinkedIn: strip tracking, keep job ID in path
        if (u.hostname.includes('linkedin.com')) {
            return `${u.origin}${u.pathname}`;
        }
        // Generic: strip known tracking params
        for (const p of _STRIP_PARAMS) u.searchParams.delete(p);
        return u.toString();
    } catch {
        return rawUrl; // not a valid URL, use as-is
    }
}

// Seen jobs: sessionId → Set<normalizedUrl> — persists across pipeline runs within a session
const _seenJobs = new Map();

function _getSeenJobs(sessionId) {
    if (!_seenJobs.has(sessionId)) _seenJobs.set(sessionId, new Set());
    return _seenJobs.get(sessionId);
}

function _addSeenJob(sessionId, url) {
    _getSeenJobs(sessionId).add(normalizeJobUrl(url));
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
 * Strip markdown formatting from text to produce clean search-friendly strings.
 * Removes: bold (**), italic (*), headers (#), list markers (- ), backticks, links.
 * @param {string} text
 * @returns {string}
 */
function _stripMarkdownFormatting(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/\*\*([^*]+)\*\*/g, '$1')   // **bold** → bold
        .replace(/\*([^*]+)\*/g, '$1')         // *italic* → italic
        .replace(/`([^`]+)`/g, '$1')           // `code` → code
        .replace(/^#{1,6}\s+/gm, '')           // # heading → heading
        .replace(/^\s*[-*+]\s+/gm, '')         // - list item → list item
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // ![alt](url) → remove images
        .replace(/~~([^~]+)~~/g, '$1')         // ~~strikethrough~~ → strikethrough
        .replace(/\s+/g, ' ')                  // collapse whitespace
        .trim();
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
    const jobTitle = _stripMarkdownFormatting(direction.q_job_title || direction.jobTitle || '');
    const location = _stripMarkdownFormatting(direction.q_location || direction.location || '');
    const rawSkills = profile.skills || '';
    const skills = (Array.isArray(rawSkills) ? rawSkills : rawSkills.split(/[,，\n]/))
        .map(s => _stripMarkdownFormatting(String(s).trim()))
        .filter(Boolean)
        .slice(0, 6);
    const pageOffsets = options.pageOffsets || {};
    const totalRuns = options.totalRuns || 0;  // how many previous pipeline runs

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

    // Skill-augmented query on primary source — rotate skill on repeat runs
    if (skills.length > 0) {
        const skillIdx = totalRuns % skills.length;
        const chosenSkill = skills[skillIdx];
        queries.push({ ...base, query: `${jobTitle} ${chosenSkill}`, location, source: primarySource });
    }

    // Broader query without location (remote jobs) on a different source
    if (location && sources.length > 2) {
        queries.push({ ...base, query: jobTitle, location: '', source: sources[2] });
    }

    // Attach pageOffset from history for each query
    for (const q of queries) {
        const key = `${q.source}|${q.query}|${q.location}`;
        q.pageOffset = pageOffsets[key] || 0;
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

    // ── Restore search history from previous runs (if any) ──
    const history = config.searchHistory || {};

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
            aiExpander: config.aiExpander || null,  // injected AI callback for query expansion
            aiMatcher: config.aiMatcher || null,    // injected AI callback for full-JD matching
            aiInvoke: config.aiInvoke || null,      // injected AI callback for self-heal (analyzeFailure + healScript)
            skillTaxonomy: config.skillTaxonomy || null,  // AI-generated skill taxonomy for smart matching
            onHistorySave: config.onHistorySave || null,  // callback to persist search history
            generateInline: config.generateInline || false,  // merge match + generate into one AI call
            generateOpts: config.generateOpts || {},         // { tailorResume, coverLetter, interviewPrep }
            userPreferences: config.userPreferences || config.search?.userPreferences || '',  // user-defined match preferences
            _prevTotalRuns: config.searchHistory?.totalRuns || 0
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
        _allQueries: (history.queries || []).slice(),   // restore previous keywords
        _pageOffsets: { ...(history.pageOffsets || {}) }, // restore page offsets per query key
        _sourceQualified: {},   // source → number of qualified jobs (persisted across rounds)
        _sourceResultCount: {}, // source → number of results fetched (persisted across rounds)
        _selfHealAttempts: {},  // source → number of self-heal attempts (max 2 per source)
        _prevFailedSources: history.failedSources || [],  // sources that failed in previous run (for retry)
        stoppedAt: null
    };

    // Restore previously seen URLs so we skip already-processed jobs
    if (history.seenUrls?.length) {
        const seen = _getSeenJobs(sessionId);
        for (const url of history.seenUrls) seen.add(normalizeJobUrl(url));
        console.log(`[searchPipeline] Restored ${history.seenUrls.length} seen URLs + ${pipeline._allQueries.length} previous keywords + ${Object.keys(pipeline._pageOffsets).length} page offsets`);
    }

    _pipelines.set(sessionId, pipeline);

    // Run asynchronously — _finishPipeline is guaranteed via try/finally inside _runPipeline,
    // but add a safety catch here in case something goes wrong before the try block.
    _runPipeline(sessionId).catch(err => {
        console.error(`[searchPipeline] Error in pipeline ${sessionId}:`, err.message);
        const p = _pipelines.get(sessionId);
        if (p) {
            p.progress.errors.push(err.message);
            _finishPipeline(sessionId, 'error');
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
    const totalRuns = config._prevTotalRuns || 0;

    // On repeat runs (totalRuns > 0): auto-advance pageOffset for primary queries
    // so we fetch page 2, 3, etc. instead of always page 1
    if (totalRuns > 0) {
        const primaryQueries = buildSearchQueries(direction, profile, { envId: config.envId, pageOffsets: {} });
        for (const q of primaryQueries) {
            const key = `${q.source}|${q.query}|${q.location}`;
            if (!pipeline._pageOffsets[key]) {
                pipeline._pageOffsets[key] = totalRuns; // advance by number of runs
            }
        }
    }

    // Pre-load seen URLs for history diagnostics and overlap detection
    const previouslySeen = _getSeenJobs(sessionId);
    const seenUrls = new Set(previouslySeen);

    const initialQueries = buildSearchQueries(direction, profile, { envId: config.envId, pageOffsets: pipeline._pageOffsets, totalRuns });
    pipeline._allQueries.push(...initialQueries); // track for adaptive dedup (append to restored history)
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
    _log(`AI: aiMatcher=${config.aiMatcher ? 'SET' : 'NULL'}, aiInvoke=${config.aiInvoke ? 'SET' : 'NULL'}, aiExpander=${config.aiExpander ? 'SET' : 'NULL'}`);
    // Log previously-failed sources that will be retried in this run
    const prevFailedSources = pipeline._prevFailedSources || [];
    if (prevFailedSources.length > 0) {
        _log(`Retrying ${prevFailedSources.length} previously-failed source(s): ${prevFailedSources.join(', ')}`);
        // Ensure failed sources have queries generated for this run.
        // If a previously-failed source has no queries yet, add a primary query for it.
        const existingSources = new Set(queries.map(q => q.source));
        for (const failedSource of prevFailedSources) {
            if (!existingSources.has(failedSource)) {
                const retryQuery = { query: jobTitle, location, source: failedSource };
                if (config.envId) retryQuery.envId = config.envId;
                queries.push(retryQuery);
                _log(`+ Added retry query for failed source: [${failedSource}] "${jobTitle}"`);
            }
        }
    }

    _log(`History: run #${totalRuns + 1}, ${previouslySeen.size} seen URLs, ${Object.keys(pipeline._pageOffsets).length} page offsets`);
    _log(`Queries: ${queries.map(q => `[${q.source}] "${q.query}" @ ${q.location || 'remote'}${q.pageOffset ? ` (page ${q.pageOffset})` : ''}`).join(' | ')}`);

    if (queries.length === 0) {
        pipeline.progress.errors.push('No job title set — cannot search');
        _log('ERROR: No job title set — cannot search');
        _finishPipeline(sessionId, 'error');
        return;
    }

    // AI pre-check: algorithm fallback removed, AI is required
    if (!config.aiMatcher && !config.aiInvoke) {
        pipeline.progress.errors.push('No AI provider configured — AI matching is required');
        _log('ERROR: No AI provider — cannot start (algorithm fallback removed)');
        _finishPipeline(sessionId, 'error');
        return;
    }

    // ── Search + Match (merged): process each job inline as it's found ──
    // Wrap in try/finally to guarantee _finishPipeline is called even on unexpected errors
    try {

    pipeline.progress.phase = 'searching';
    let _totalFetched = 0;  // total listings fetched across all sources (replaces allListings.length)
    if (previouslySeen.size > 0) {
        _log(`Loaded ${previouslySeen.size} previously seen job URLs — will filter duplicates`);
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
    // Store _failedSources on pipeline so _finishPipeline can persist it for next run
    pipeline._failedSources = _failedSources;
    // Use pipeline-level tracking for adaptive search support
    const _sourceResultCount = pipeline._sourceResultCount;
    const _sourceQualified = pipeline._sourceQualified;

    const runnableQueryCount = queries.filter(q => platformToolMap[q.source]).length;
    _log(`Runnable queries: ${runnableQueryCount} of ${queries.length}, maxResults per platform: ${config.maxResults}`);
    if (config.generateInline) {
        _log(`Inline generation ENABLED: match + docs in one AI call`);
    }

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
                        dashboardServer.updatePipelineProgress(sessionId, {
                            phase: 'taskFailed',
                            title: `${platformTool.name} — Login failed`,
                            company: '', platform: source, failPhase: 'search',
                            error: 'Auto-launch failed: ' + (launchResult.error || 'unknown'),
                            at: new Date().toISOString(), currentJob: null
                        });
                        pipeline.progress.errors.push(`[${source}] Login failed: ${launchResult.error || 'unknown'}`);
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
                // Broadcast to Workflow Progress so user can see and retry
                dashboardServer.updatePipelineProgress(sessionId, {
                    phase: 'taskFailed',
                    title: `${platformTool.name} — Login required`,
                    company: '',
                    platform: source,
                    failPhase: 'search',
                    error: `No browser open for "${platformTool.name}" and no envId. Launch login first.`,
                    at: new Date().toISOString(),
                    currentJob: null
                });
                pipeline.progress.errors.push(`[${source}] Login required: no browser`);
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

    // ── Helper: process a single job — match + optional inline generate ──
    // Track consecutive errors — abort pipeline if too many in a row
    let _consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;
    const AI_CALL_TIMEOUT = 120_000; // 2 min max per AI call

    function _withTimeout(promise, ms, label) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms))
        ]);
    }

    async function _processJob(listing) {
        try {
            // Broadcast: currently processing this job
            dashboardServer.updatePipelineProgress(sessionId, {
                phase: config.generateInline ? 'search_generate' : 'matching',
                currentJob: {
                    title: listing.title || 'Unknown',
                    company: listing.company || '?',
                    url: listing.url,
                    phase: config.generateInline ? 'search_generate' : 'search_match'
                }
            });

            // 1. Parse JD
            let requirements = null;
            if (listing.fullText) {
                requirements = extractRequirements({ text: listing.fullText, title: listing.title || '' });
                pipeline.progress.parsed++;
                dashboardServer.updateJobStatus(sessionId, listing.url, 'parsed');
                _log(`  Parsed JD (${listing.fullText.length} chars)`);
            } else {
                try {
                    const parsed = await parseListingHandler({ url: listing.url, useBrowser: false });
                    requirements = parsed;
                    pipeline.progress.parsed++;
                    dashboardServer.updateJobStatus(sessionId, listing.url, 'parsed');
                } catch { /* Parse failure is non-fatal */ }
            }

            // 2. Match — combined AI (match+generate) or match-only
            let matchResult = null;
            let aiResumeMd = null;
            let aiCoverMd = null;
            let aiGenerated = false;

            // Path A: Combined AI call (match + generate in one)
            if (config.generateInline && config.aiInvoke && listing.fullText) {
                try {
                    const combinedPrompt = _buildCombinedPrompt(
                        listing, profile, config.skillTaxonomy,
                        config.generateOpts || {},
                        config.userPreferences || ''
                    );
                    const raw = await _withTimeout(config.aiInvoke(combinedPrompt), AI_CALL_TIMEOUT, 'Combined AI');
                    const parsed = _parseCombinedResponse(raw);
                    matchResult = parsed.matchResult;
                    aiResumeMd = parsed.resume;
                    aiCoverMd = parsed.coverLetter;
                    aiGenerated = !!(aiResumeMd || aiCoverMd);
                    if (matchResult) {
                        _log(`  Combined AI: score=${matchResult.overallScore}%, resume=${aiResumeMd ? 'YES' : 'NO'}, cover=${aiCoverMd ? 'YES' : 'NO'}`);
                    }
                } catch (err) {
                    _log(`  Combined AI failed: ${err.message}, falling back`);
                }
            }

            // Path B: Match-only AI (existing aiMatcher)
            if (!matchResult && config.aiMatcher && listing.fullText) {
                try {
                    matchResult = await _withTimeout(config.aiMatcher(profile, listing, config.skillTaxonomy, config.userPreferences || ''), AI_CALL_TIMEOUT, 'AI match');
                    if (matchResult) {
                        _log(`  AI match: ${matchResult.overallScore}%`);
                    } else {
                        _log(`  AI matcher returned null`);
                    }
                } catch (err) {
                    _log(`  AI match failed: ${err.message}`);
                }
            }

            // No AI result → error state (algorithm fallback removed)
            if (!matchResult) {
                _log(`✗ AI match unavailable for "${listing.title}" — skipping`);
                pipeline.progress.matched++;
                pipeline.progress.errors.push(`AI unavailable: ${listing.title}`);
                dashboardServer.upsertJobCard(sessionId, {
                    url: listing.url,
                    title: listing.title || '',
                    company: listing.company || '',
                    status: 'discovered',
                    taskLog: {
                        search: {
                            status: 'error',
                            at: new Date().toISOString(),
                            source: listing.source || '',
                            error: 'AI matching failed — no result from any AI provider'
                        }
                    }
                });
                // Broadcast failure for Workflow Progress UI
                dashboardServer.updatePipelineProgress(sessionId, {
                    phase: 'taskFailed',
                    jobUrl: listing.url,
                    title: listing.title || '',
                    company: listing.company || '',
                    platform: listing.source || '',
                    failPhase: 'search',
                    error: 'AI matching failed',
                    at: new Date().toISOString()
                });
                return;
            }

            // 3. Score check
            const score = matchResult.overallScore || 0;
            pipeline.progress.matched++;
            const qualified = score >= config.minScore;
            _log(`${qualified ? '✓' : '✗'} "${listing.title}" @ ${listing.company || '?'} → score: ${score}%${qualified ? ' QUALIFIED' : ''}`, {
                url: listing.url, score, title: listing.title, company: listing.company || '?'
            });

            if (!qualified) return;

            // 4. Build job card data
            const taskLog = {
                search: {
                    status: 'ok',
                    at: new Date().toISOString(),
                    source: listing.source || listing.platform || '',
                    aiMatched: !!matchResult.aiMatched
                }
            };

            let status = 'matched';
            const artifacts = requirements ? { requirements } : {};

            // 5. Inline generation: finalize docs for qualified jobs
            if (config.generateInline) {
                const genOpts = config.generateOpts || {};
                const docOutcomes = {};
                const genErrors = [];

                // Resume
                if (genOpts.tailorResume) {
                    let resumeMd = aiResumeMd;
                    if (!resumeMd) {
                        try {
                            const tmpl = resumeGenHandler({
                                profile, sessionProfile: null,
                                jobTitle: listing.title, company: listing.company,
                                requirements: requirements || {},
                                matchResult: matchResult.breakdown ? { breakdown: matchResult.breakdown } : undefined
                            });
                            resumeMd = tmpl.markdown;
                        } catch (err) { genErrors.push(`Resume template: ${err.message}`); }
                    }
                    if (resumeMd) {
                        artifacts.resume = resumeMd;
                        try {
                            const { markdownToDocx } = require('./tools/docxBuilder');
                            const docxResult = await markdownToDocx(resumeMd, { type: 'Resume', company: listing.company, title: listing.title });
                            artifacts.resumeDocx = docxResult.buffer.toString('base64');
                        } catch (docxErr) {
                            _log(`  Resume DOCX failed: ${docxErr.message}`);
                        }
                    }
                    docOutcomes.resume = { ok: !!resumeMd, source: aiResumeMd ? 'ai' : 'template' };
                }

                // Cover letter
                if (genOpts.coverLetter) {
                    let coverMd = aiCoverMd;
                    if (!coverMd) {
                        try {
                            const tmpl = coverLetterHandler({
                                profile, company: listing.company, jobTitle: listing.title,
                                requirements: requirements || {}
                            });
                            coverMd = tmpl.markdown;
                        } catch (err) { genErrors.push(`Cover letter template: ${err.message}`); }
                    }
                    if (coverMd) {
                        artifacts.coverLetter = coverMd;
                        try {
                            const { markdownToDocx } = require('./tools/docxBuilder');
                            const docxResult = await markdownToDocx(coverMd, { type: 'CoverLetter', company: listing.company, title: listing.title });
                            artifacts.coverLetterDocx = docxResult.buffer.toString('base64');
                        } catch (docxErr) {
                            _log(`  Cover letter DOCX failed: ${docxErr.message}`);
                        }
                    }
                    docOutcomes.coverLetter = { ok: !!coverMd, source: aiCoverMd ? 'ai' : 'template' };
                }

                // Interview prep (always template, zero AI cost)
                if (genOpts.interviewPrep) {
                    try {
                        const jobForPrep = { ...listing, matchScore: score, matchBreakdown: matchResult.breakdown, artifacts };
                        artifacts.interviewPrep = _buildInterviewPrompt(jobForPrep, profile);
                        docOutcomes.interviewPrep = { ok: true, source: 'template' };
                    } catch (err) {
                        genErrors.push(`Interview prep: ${err.message}`);
                        docOutcomes.interviewPrep = { ok: false, source: 'template' };
                    }
                }

                const allOk = Object.values(docOutcomes).every(d => d.ok);
                const anyOk = Object.values(docOutcomes).some(d => d.ok);
                const genAt = new Date().toISOString();
                taskLog.generate = {
                    status: allOk ? 'ok' : anyOk ? 'partial' : 'error',
                    at: genAt,
                    aiGenerated,
                    error: genErrors.length > 0 ? genErrors.join('; ') : null,
                    docs: docOutcomes
                };
                status = allOk ? 'tailored' : 'matched'; // partial/error → stay matched
                // Generate displayJson for in-page preview
                artifacts.displayJson = {
                    jd:            listing.fullText ? [{ type: 'text', title: 'Job Description', content: listing.fullText }] : null,
                    resume:        _markdownToSections(artifacts.resume, 'resume'),
                    coverLetter:   _markdownToSections(artifacts.coverLetter, 'coverLetter'),
                    interviewPrep: _markdownToSections(artifacts.interviewPrep, 'interviewPrep')
                };

                // Broadcast generate failure if not all OK
                if (!allOk) {
                    dashboardServer.updatePipelineProgress(sessionId, {
                        phase: 'taskFailed',
                        jobUrl: listing.url,
                        title: listing.title || '',
                        company: listing.company || '',
                        platform: listing.source || '',
                        failPhase: 'generate',
                        error: genErrors.join('; ') || 'Document generation incomplete',
                        at: genAt
                    });
                }
            }

            // 6. Upsert job card
            dashboardServer.upsertJobCard(sessionId, {
                url: listing.url,
                title: listing.title,
                company: listing.company,
                location: listing.location,
                salary: listing.salary,
                jobType: listing.jobType || '',
                fullText: listing.fullText || '',
                matchScore: score,
                status,
                artifacts,
                matchBreakdown: matchResult.breakdown || null,
                taskLog
            });
            pipeline.progress.qualified++;
            _sourceQualified[listing.source] = (_sourceQualified[listing.source] || 0) + 1;

            // SSE broadcast: success + clear currentJob
            dashboardServer.updatePipelineProgress(sessionId, {
                phase: config.generateInline ? 'search_generate' : 'matching',
                message: `${config.generateInline ? 'Matched+Generated' : 'Qualified'}: "${listing.title}" (${score}%)`,
                qualified: pipeline.progress.qualified,
                source: listing.source,
                sourceQualified: _sourceQualified[listing.source],
                targetCount: config.targetCount,
                currentJob: null // done processing this job
            });
            // Reset consecutive error counter on success
            _consecutiveErrors = 0;
        } catch (err) {
            _consecutiveErrors++;
            _log(`ERROR processing "${listing.title}": ${err.message} (consecutive: ${_consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`);
            pipeline.progress.errors.push(`Process error (${listing.url}): ${err.message}`);
            dashboardServer.upsertJobCard(sessionId, {
                url: listing.url,
                title: listing.title || '',
                company: listing.company || '',
                status: 'discovered',
                taskLog: {
                    search: {
                        status: 'error',
                        at: new Date().toISOString(),
                        error: err.message,
                        source: listing.source || listing.platform || ''
                    }
                }
            });
            // Broadcast failure for Workflow Progress UI
            dashboardServer.updatePipelineProgress(sessionId, {
                phase: 'taskFailed',
                jobUrl: listing.url,
                title: listing.title || '',
                company: listing.company || '',
                platform: listing.source || '',
                failPhase: 'search',
                error: err.message,
                at: new Date().toISOString(),
                currentJob: null
            });
            // Abort pipeline if too many consecutive errors (e.g. browser died, AI provider down)
            if (_consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                _log(`ABORT: ${MAX_CONSECUTIVE_ERRORS} consecutive errors — stopping pipeline`);
                pipeline.progress.errors.push(`Pipeline aborted: ${MAX_CONSECUTIVE_ERRORS} consecutive failures`);
                _finishPipeline(sessionId, 'error');
            }
        }
    }

    // ── Helper: run all queries for a single source sequentially ──
    async function _runSourceQueries(source) {
        const sqList = sourceQueries[source] || [];
        for (const q of sqList) {
            if (!pipeline.running) break;

            // Early termination: platform already has enough qualified jobs
            const srcQual = _sourceQualified[q.source] || 0;
            if (srcQual >= config.targetCount) {
                _log(`⊘ [${q.source}] Skipped — already ${srcQual}/${config.targetCount} qualified (targetCount met)`);
                break;
            }

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
                        { keywords: q.query, location: q.location, pageOffset: q.pageOffset || 0 },
                        { envId: q.envId || config.envId, maxResults: Math.min(remaining, config.maxResults) }
                    );
                    if (scriptResult.success && scriptResult.jobs) {
                        listings = scriptResult.jobs.map(j => ({
                            title: j.title || '',
                            company: j.company || '',
                            location: j.location || q.location || '',
                            url: normalizeJobUrl(j.url || j.link || ''),
                            salary: j.salary || '',
                            jobType: j.jobType || '',
                            source: q.source,
                            fullText: j.fullText || ''
                        }));
                        _log(`[${q.source}] Platform tool returned ${listings.length} results`);

                        // ── Low/zero result anomaly: attempt self-heal or mark for rebuild ──
                        const LOW_RESULT_THRESHOLD = 3;
                        if (listings.length < LOW_RESULT_THRESHOLD) {
                            _log(`⚠ [${q.source}] Suspiciously low results (${listings.length}) — attempting self-heal`);

                            // Try self-heal for low-result anomaly (may indicate Cloudflare block)
                            if (config.aiInvoke && !(pipeline._selfHealAttempts?.[q.source] >= 2)) {
                                pipeline._selfHealAttempts = pipeline._selfHealAttempts || {};
                                pipeline._selfHealAttempts[q.source] = (pipeline._selfHealAttempts[q.source] || 0) + 1;
                                const anomalyMsg = `Search returned only ${listings.length} result(s) — possible Cloudflare block or broken selector`;
                                const healedListings = await _selfHealAndRetry(
                                    sessionId, platformTool, q, config, anomalyMsg, null, _log
                                );
                                if (healedListings && healedListings.length > listings.length) {
                                    _log(`✓ [${q.source}] Self-heal improved results: ${listings.length} → ${healedListings.length}`);
                                    listings = healedListings;
                                }
                            }

                            // Still low after heal attempt — mark for manual rebuild
                            if (listings.length < LOW_RESULT_THRESHOLD) {
                                dashboardServer.updatePlatformCell(sessionId, platformTool.id, {
                                    cell: 'search', status: 'error',
                                    message: `Only ${listings.length} result(s) for "${q.query}" — please Rebuild search tool`
                                });
                            }
                        }
                    } else {
                        const errMsg = scriptResult.error || 'unknown error';

                        // ── Cloudflare challenge detection — auto-click Turnstile before giving up ──
                        if (_isCloudflareError(errMsg)) {
                            _log(`🛡 [pipeline] Cloudflare challenge detected on ${q.source} (${platformTool.name})`);

                            // Attempt automatic Turnstile click
                            let cfResolved = false;
                            try {
                                const platform = getPlatformStore().getPlatform(sessionId, platformTool.id);
                                if (platform?._browserId) {
                                    cfResolved = await _handleCloudflareChallenge(
                                        sessionId, platformTool, platform._browserId, platform._pageIndex || 0, _log
                                    );
                                }
                            } catch (cfErr) {
                                _log(`✗ [${q.source}] Cloudflare auto-resolve failed: ${cfErr.message}`);
                            }

                            if (cfResolved) {
                                _log(`✓ [${q.source}] Cloudflare challenge resolved — retrying search`);
                                const remaining = config.maxResults - (_sourceResultCount[q.source] || 0);
                                const retryResult = await getScriptBuilder().executeSearchScript(
                                    sessionId,
                                    platformTool.id,
                                    { keywords: q.query, location: q.location, pageOffset: q.pageOffset || 0 },
                                    { envId: q.envId || config.envId, maxResults: Math.min(remaining, config.maxResults) }
                                );
                                if (retryResult.success && retryResult.jobs) {
                                    listings = retryResult.jobs.map(j => ({
                                        title: j.title || '',
                                        company: j.company || '',
                                        location: j.location || q.location || '',
                                        url: normalizeJobUrl(j.url || j.link || ''),
                                        salary: j.salary || '',
                                        jobType: j.jobType || '',
                                        source: q.source,
                                        fullText: j.fullText || ''
                                    }));
                                    _log(`✓ [${q.source}] Retry after CF resolve returned ${listings.length} results`);
                                } else {
                                    // Still failed after CF resolve
                                    _failedSources.add(q.source);
                                    dashboardServer.updatePlatformCell(sessionId, platformTool.id, {
                                        cell: 'search', status: 'error',
                                        message: `Cloudflare resolved but search still failed — please Rebuild search tool`
                                    });
                                    pipeline.progress.errors.push(`[${q.source}] Cloudflare resolved but search retry failed`);
                                }
                            } else {
                                // Could not resolve — existing failure path
                                if (!_cloudflareBlocked.has(sessionId)) _cloudflareBlocked.set(sessionId, new Set());
                                _cloudflareBlocked.get(sessionId).add(q.source);
                                _failedSources.add(q.source);
                                dashboardServer.updatePlatformCell(sessionId, platformTool.id, {
                                    cell: 'search', status: 'error',
                                    message: `Cloudflare challenge — please open ${platformTool.name} manually and solve the challenge`
                                });
                                dashboardServer.updatePipelineProgress(sessionId, {
                                    phase: 'taskFailed',
                                    title: `${platformTool.name} — Cloudflare blocked`,
                                    company: '', platform: q.source, failPhase: 'search',
                                    error: `Cloudflare anti-bot challenge. Open ${platformTool.name} in your browser and solve it manually, then retry.`,
                                    at: new Date().toISOString(), currentJob: null
                                });
                                alertService.dispatch(sessionId, {
                                    type: 'failure',
                                    title: `Cloudflare Block — ${platformTool.name}`,
                                    message: `${platformTool.name} is blocked by Cloudflare anti-bot protection. Please open it manually to solve the challenge before retrying.`,
                                    stepName: 'search',
                                    meta: { platform: q.source, cloudflareBlocked: true }
                                });
                                pipeline.progress.errors.push(`[${q.source}] Cloudflare challenge — manual intervention required`);
                            }
                        } else {
                            _log(`✗ [${q.source}] Platform tool failed: ${errMsg}`);

                            // ── Self-heal: attempt AI-driven script repair + retry ──
                            let healed = false;
                            if (config.aiInvoke && !(pipeline._selfHealAttempts?.[q.source] >= 2)) {
                                pipeline._selfHealAttempts = pipeline._selfHealAttempts || {};
                                pipeline._selfHealAttempts[q.source] = (pipeline._selfHealAttempts[q.source] || 0) + 1;
                                _log(`🔧 [${q.source}] Self-heal attempt ${pipeline._selfHealAttempts[q.source]}/2...`);

                                let screenshot = null;
                                try {
                                    const platform = getPlatformStore().getPlatform(sessionId, platformTool.id);
                                    if (platform?._browserId) {
                                        const toolClient = require('./core/toolServiceClient');
                                        const ssResult = await toolClient.executeTool('page_screenshot', {
                                            browserId: platform._browserId, pageIndex: platform._pageIndex || 0
                                        });
                                        screenshot = ssResult?.screenshot || ssResult?.result || null;
                                    }
                                } catch (_) { /* screenshot is optional */ }

                                const healedListings = await _selfHealAndRetry(
                                    sessionId, platformTool, q, config, errMsg, screenshot, _log
                                );
                                if (healedListings && healedListings.length > 0) {
                                    healed = true;
                                    listings = healedListings;
                                    _log(`✓ [${q.source}] Self-heal succeeded: ${healedListings.length} results after repair`);
                                } else {
                                    _log(`✗ [${q.source}] Self-heal failed — marking source as failed`);
                                }
                            }

                            if (!healed) {
                            _failedSources.add(q.source);
                            dashboardServer.updatePlatformCell(sessionId, platformTool.id, {
                                cell: 'search', status: 'error',
                                message: `Search failed: ${errMsg} — please Rebuild search tool`
                            });
                            dashboardServer.updatePipelineProgress(sessionId, {
                                phase: 'taskFailed',
                                title: `${platformTool.name} — Search failed`,
                                company: '', platform: q.source, failPhase: 'search',
                                error: errMsg,
                                at: new Date().toISOString(), currentJob: null
                            });
                            pipeline.progress.errors.push(`[${q.source}] Search tool failed: ${errMsg}`);
                        }
                    } // end else (non-Cloudflare)
                    } // end if/else Cloudflare
                } else {
                    _log(`[${q.source}] No platform tool available — skipped`);
                    continue;
                }

                // ── Overlap rate detection ──
                const totalResults = listings.filter(l => l.url).length;
                const seenCount = listings.filter(l => l.url && seenUrls.has(l.url)).length;
                const overlapRate = totalResults > 0 ? seenCount / totalResults : 0;
                const newCount = totalResults - seenCount;

                if (overlapRate >= 0.8 && totalResults > 0) {
                    const offsetKey = `${q.source}|${q.query}|${q.location}`;
                    pipeline._pageOffsets[offsetKey] = (pipeline._pageOffsets[offsetKey] || 0) + 1;
                    _log(`⚡ [${q.source}] High overlap (${Math.round(overlapRate * 100)}%) for "${q.query}" — will use page ${pipeline._pageOffsets[offsetKey]} next time`);
                } else if (overlapRate >= 0.5) {
                    _log(`[${q.source}] Moderate overlap (${Math.round(overlapRate * 100)}%) — filtering old results`);
                }
                _log(`[${q.source}] Found ${totalResults} results (${newCount} new, overlap: ${Math.round(overlapRate * 100)}%)`);

                // ── Process each new listing inline (match + optional generate) ──
                for (const listing of listings) {
                    if (!pipeline.running) break;

                    // Early termination: check targetCount mid-batch
                    if ((_sourceQualified[listing.source] || 0) >= config.targetCount) {
                        _log(`⊘ [${listing.source}] targetCount reached mid-batch — skipping rest`);
                        break;
                    }

                    if (listing.url && !seenUrls.has(listing.url)) {
                        seenUrls.add(listing.url);
                        _addSeenJob(sessionId, listing.url);
                        _sourceResultCount[q.source] = (_sourceResultCount[q.source] || 0) + 1;
                        _totalFetched++;
                        _log(`+ "${listing.title}" @ ${listing.company || '?'} (${listing.location || '?'})`);

                        // Inline match + optional generate
                        await _processJob(listing);
                    }
                }

                pipeline.progress.searched++;
                pipeline.progress.total = _totalFetched;
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

    _log(`Search${config.generateInline ? '+Generate' : ''} complete: ${_totalFetched} unique listings from ${pipeline.progress.searched} queries`);

    if (!pipeline.running) { _finishPipeline(sessionId, 'stopped'); return; }

    const p = pipeline.progress;
    const srcSummary = Object.entries(_sourceQualified).map(([s, n]) => `${s}: ${n}/${config.targetCount}`).join(', ');
    _log(`Round ${pipeline._searchRound}: ${p.qualified} qualified / ${p.matched} scored / ${_totalFetched} found (${p.errors.length} errors)`);
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

            // Run new queries — _runSourceQueries now handles inline match + generate
            pipeline.progress.phase = 'searching';
            for (const source of newSourceOrder) {
                if (!pipeline.running) break;
                await _runSourceQueries(source);
            }

            if (!pipeline.running) { _finishPipeline(sessionId, 'stopped'); return; }

            // Check if another round is needed
            const nextGap = _analyzeGap(_pipelines, sessionId);
            const nextHasGap = Object.keys(nextGap).length > 0;
            if (nextHasGap && pipeline._searchRound < config.maxSearchRounds && pipeline.running) {
                const nextSrcSummary = Object.entries(_sourceQualified).map(([s, n]) => `${s}: ${n}/${config.targetCount}`).join(', ');
                _log(`After round ${pipeline._searchRound}: ${nextSrcSummary} — still has gap`);
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

    } finally {
        // Safety net: if pipeline is still marked as running (e.g. uncaught exception skipped
        // all _finishPipeline calls), force-finish to prevent the workflow step from polling forever.
        if (pipeline.running) {
            console.error(`[searchPipeline] Safety net: pipeline ${sessionId} still running after _runPipeline — force finishing`);
            _finishPipeline(sessionId, 'error');
        }
    }
}

function _finishPipeline(sessionId, reason) {
    const pipeline = _pipelines.get(sessionId);
    if (!pipeline) return;

    // Idempotent: skip if already finished (prevents double history-save)
    if (!pipeline.running && pipeline.stoppedAt) return;

    pipeline.running = false;
    pipeline.progress.phase = reason;
    pipeline.stoppedAt = new Date().toISOString();

    // Clean up Cloudflare tracking for this session
    _cloudflareBlocked.delete(sessionId);

    // ── Persist search history for next run ──
    if (typeof pipeline.config.onHistorySave === 'function') {
        try {
            const seenSet = _getSeenJobs(sessionId);
            pipeline.config.onHistorySave({
                queries: [...new Set(pipeline._allQueries.map(q => typeof q === 'string' ? q : q.query))],
                seenUrls: [...seenSet],
                pageOffsets: pipeline._pageOffsets || {},
                lastRunAt: new Date().toISOString(),
                totalRuns: (pipeline.config._prevTotalRuns || 0) + 1,
                // Persist sources that failed at runtime so the next workflow run retries them
                failedSources: pipeline._failedSources ? [...pipeline._failedSources] : []
            });
            console.log(`[searchPipeline] Saved search history: ${seenSet.size} seen URLs, ${Object.keys(pipeline._pageOffsets || {}).length} page offsets`);
        } catch (err) {
            console.error('[searchPipeline] Failed to save search history:', err.message);
        }
    }
}

/**
 * Stop a running pipeline.
 */
function stopPipeline(sessionId) {
    const pipeline = _pipelines.get(sessionId);
    if (!pipeline) return { error: 'No pipeline found' };
    // Mark as not running — the _runPipeline loop will detect this and call _finishPipeline('stopped').
    // Also call _finishPipeline here as a safety net in case the loop already exited.
    if (pipeline.running) {
        _finishPipeline(sessionId, 'stopped');
    }
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
 * Build a high-quality AI prompt for interview preparation.
 * Users copy this prompt into ChatGPT / Claude to get an interactive interview coach.
 *
 * @param {object} job - job card (title, company, location, fullText, artifacts, matchBreakdown)
 * @param {object} profile - user profile sections
 * @returns {string} complete AI prompt (markdown-formatted)
 */
function _buildInterviewPrompt(job, profile) {
    const req = job.artifacts?.requirements || {};
    const sections = req.sections || {};
    // Try structured sections first, then top-level fields, then fall back to fullText extraction
    let techSkills = (sections.technical || req.technical || []);
    techSkills = (Array.isArray(techSkills) ? techSkills.join(', ') : String(techSkills || '')).trim();
    let responsibilities = (sections.responsibilities || req.responsibilities || []);
    responsibilities = (Array.isArray(responsibilities)
        ? responsibilities.map(r => `- ${r}`).join('\n')
        : String(responsibilities || '')).trim();
    const education = sections.education || req.education || '';
    const experience = sections.experience || req.experience || '';

    // When requirements are empty, extract key info from the raw JD text
    const jdText = job.fullText || req.fullText || '';
    if ((!techSkills || techSkills === 'N/A') && jdText) {
        // Extract lines that mention skills/technologies/requirements
        const skillLines = jdText.split(/[\n.]+/)
            .map(l => l.trim())
            .filter(l => l.length > 5 && /skill|tech|requir|qualif|proficien|experienc|knowledge|familiar/i.test(l))
            .slice(0, 10);
        techSkills = skillLines.join(', ') || 'See job description above';
    }
    if ((!responsibilities || responsibilities === 'N/A') && jdText) {
        // Extract lines that mention responsibilities/duties/role
        const respLines = jdText.split(/[\n.]+/)
            .map(l => l.trim())
            .filter(l => l.length > 10 && /responsib|dut|role|you will|you\'ll|work with|develop|design|implement|manage|lead|build|maintain|creat|collaborat/i.test(l))
            .slice(0, 8);
        responsibilities = respLines.map(r => `- ${r}`).join('\n') || 'See job description above';
    }

    // Build candidate snapshot from profile
    const candidateLines = [];
    if (profile) {
        for (const [section, content] of Object.entries(profile)) {
            if (content && typeof content === 'string' && content.trim()) {
                candidateLines.push(`**${section}:** ${content.trim()}`);
            } else if (content && typeof content === 'object') {
                candidateLines.push(`**${section}:** ${JSON.stringify(content)}`);
            }
        }
    }
    const candidateSnapshot = candidateLines.length > 0
        ? candidateLines.join('\n')
        : 'No candidate profile provided.';

    // Match insights
    const matchInfo = job.matchBreakdown
        ? `Match Score: ${job.matchScore || 'N/A'}%\nBreakdown: ${JSON.stringify(job.matchBreakdown)}`
        : `Match Score: ${job.matchScore || 'N/A'}%`;

    return `# Interview Prep Prompt — Paste into ChatGPT / Claude

> Copy everything below this line into any AI chat to start an interactive interview coaching session.

---

You are an expert interview coach specializing in tech hiring. I am preparing for the following position. Your job is to help me **thoroughly prepare** by creating an interactive coaching session.

## Target Position

- **Title:** ${job.title || 'N/A'}
- **Company:** ${job.company || 'N/A'}
- **Location:** ${job.location || 'N/A'}
- **Salary:** ${job.salary || 'N/A'}

## Job Requirements

**Technical Skills:** ${techSkills || 'N/A'}

**Key Responsibilities:**
${responsibilities || 'N/A'}

**Education:** ${education || 'N/A'}
**Experience:** ${experience || 'N/A'}
${jdText ? `\n**Full Job Description:**\n${jdText.slice(0, 3000)}\n` : ''}
## My Background

${candidateSnapshot}

## Match Analysis

${matchInfo}

---

## Your Task

Please create a **comprehensive, interactive interview preparation session** covering ALL of the following modules. After presenting each module, pause and ask me if I want to:
- (a) Do a practice round for that module
- (b) Skip to the next module
- (c) Deep-dive into a specific topic

### Module 1: Company & Role Research
- What the company likely values based on the JD
- Key talking points to demonstrate culture fit
- Questions I should ask the interviewer about this role

### Module 2: Technical Knowledge Review
For each technical skill listed in the requirements:
- Core concepts I must know (brief refresher)
- Common interview questions for that technology
- My skill gaps based on my background (be honest)
- Suggested study resources for weak areas

### Module 3: Behavioral Interview (STAR Method)
Generate 5 behavioral questions tailored to this specific role's responsibilities. For each:
- The question
- Why an interviewer would ask this for THIS role
- A STAR framework outline I can adapt from my experience
- Common pitfalls to avoid

### Module 4: Technical Interview Simulation
Generate 3 technical scenario questions based on the required skills. For each:
- The problem/scenario
- Expected approach and thought process
- Key points the interviewer is evaluating
- Follow-up questions they might ask

### Module 5: System Design / Architecture (if applicable)
If this is a senior role or mentions system design:
- One system design question relevant to this role
- Walk me through the expected approach
- Key trade-offs to discuss

### Module 6: Salary & Offer Negotiation
- Market salary range for this role + location
- Key negotiation talking points based on my experience
- How to handle "What are your salary expectations?"

### Module 7: Mock Interview Round
After all modules, offer to run a **full mock interview simulation**:
- You play the interviewer
- Ask 8-10 mixed questions (behavioral + technical + situational)
- After each answer I give, score it and provide specific feedback
- At the end, give an overall assessment with a letter grade

---

**Start with Module 1. Present the content, then ask me how I want to proceed.**`;
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
 * Generate interview prep prompt for a specific job.
 */
async function generateInterviewPrep(sessionId, jobUrl, profile) {
    const cards = dashboardServer.getJobCards(sessionId);
    const job = cards.find(c => c.url === jobUrl);
    if (!job) return { error: 'Job not found' };

    try {
        const promptMarkdown = _buildInterviewPrompt(job, profile);

        dashboardServer.upsertJobCard(sessionId, {
            url: jobUrl,
            artifacts: { interviewPrep: promptMarkdown }
        });

        return { success: true, markdown: promptMarkdown, job };
    } catch (err) {
        return { error: err.message };
    }
}

/**
 * Build a combined AI prompt: match scoring + resume + cover letter in ONE call.
 * Used when Generate step is enabled during search to merge match + generate into a single AI invocation.
 *
 * @param {object} listing - { title, company, location, salary, fullText }
 * @param {object} profile - user profile sections
 * @param {object} taxonomy - skill taxonomy for smart matching
 * @param {object} generateOpts - { tailorResume, coverLetter }
 * @returns {string} combined prompt
 */
function _buildCombinedPrompt(listing, profile, taxonomy, generateOpts = {}, userPreferences = '') {
    const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : (profile.skills || '');
    const experience = Array.isArray(profile.experience) ? profile.experience.join('\n') : (profile.experience || '');
    const education = Array.isArray(profile.education) ? profile.education.join('\n') : (profile.education || '');

    let taxonomySummary = '';
    if (taxonomy && taxonomy.taxonomy) {
        const cats = Object.entries(taxonomy.taxonomy).slice(0, 20);
        taxonomySummary = cats.map(([cat, sks]) => `${cat}: ${sks.slice(0, 8).join(', ')}`).join('\n');
    }

    // Candidate snapshot for doc generation
    const candidateLines = [];
    if (profile) {
        for (const [section, content] of Object.entries(profile)) {
            if (content && typeof content === 'string' && content.trim()) {
                candidateLines.push(`**${section}:** ${content.trim()}`);
            } else if (content && typeof content === 'object') {
                candidateLines.push(`**${section}:** ${JSON.stringify(content)}`);
            }
        }
    }
    const candidateSnapshot = candidateLines.length > 0 ? candidateLines.join('\n') : 'No profile provided.';

    const jdText = (listing.fullText || '').slice(0, 3500);
    const jobTitle = listing.title || 'Unknown';

    let prompt = `You are an expert career consultant and job matching specialist. Complete ALL tasks below in a single response.

## Candidate Profile
Skills: ${skills}
Experience: ${experience.slice(0, 500)}
Education: ${education.slice(0, 300)}

## Job Description
Title: ${jobTitle}
Company: ${listing.company || 'N/A'}
Location: ${listing.location || 'N/A'}
${jdText}

${taxonomySummary ? `## Skill Taxonomy (skills in same category are similar/substitutable)\n${taxonomySummary}` : ''}
${userPreferences ? `\n## User Search Preferences\nThe candidate has specified the following preferences that MUST heavily influence scoring:\n${userPreferences}\n\nIf the job conflicts with these preferences, significantly lower the overall score. If the job aligns with these preferences, boost the score.` : ''}

---

## TASK 1: Match Scoring

Score how well the candidate matches this job.

Scoring Rules:
- Overall = skills x 50% + experience x 30% + education x 20%
- Exact skill match = full credit
- Same-category skill (from taxonomy) = 60% credit, record in "similar" with category name
- Skills in job title = core skills, weight x 1.5
- "Nice to have" / "preferred" / "bonus" skills = weight x 0.5, track in niceToHave
- Experience: 100 if meets/exceeds, 70 if close (within 1 yr), 40 if under, 50 if unspecified
- Education: 100 if matches, 40-50 if partial, 50 if unspecified

Output match result between these delimiters:

===MATCH_JSON_START===
Return ONLY valid JSON (no markdown fences):
{"overallScore":0,"breakdown":{"skills":{"score":0,"matched":[],"similar":[{"req":"","have":"","category":""}],"missing":[],"niceToHave":{"matched":[],"similar":[],"missing":[]}},"experience":{"score":0,"detail":""},"education":{"score":0,"detail":""}},"interviewPrep":[]}
===MATCH_JSON_END===`;

    if (generateOpts.tailorResume) {
        prompt += `

## TASK 2: Generate Resume

===RESUME_START===
Generate a professional, ATS-optimized resume in Markdown:
- Candidate name as H1
- Contact info (email, phone, location) on one line
- Professional Summary (2-3 sentences highlighting fit for THIS role)
- Technical Skills section (emphasize skills matching job requirements)
- Work Experience (most relevant first, bullet points with metrics/achievements)
- Education
- Certifications/Projects (if relevant)

Keep it concise (1-2 pages when printed). Tailor every section to match the job requirements.

Candidate Background:
${candidateSnapshot}
===RESUME_END===`;
    }

    if (generateOpts.coverLetter) {
        prompt += `

## TASK ${generateOpts.tailorResume ? '3' : '2'}: Generate Cover Letter

===COVER_LETTER_START===
Generate a professional cover letter in Markdown:
- Date and greeting (Dear Hiring Manager at ${listing.company || 'the company'})
- Opening: Express interest, mention the specific role
- Body 1: Highlight 2-3 technical skills matching requirements with specific examples
- Body 2: Demonstrate understanding of the company/role, explain why great fit
- Closing: Call to action, express enthusiasm
- Professional sign-off

Keep under 400 words. Reference specific requirements from the JD.
===COVER_LETTER_END===`;
    }

    return prompt;
}

/**
 * Strip markdown code fences (```markdown ... ```) that AI sometimes wraps around content.
 */
function _stripMarkdownFence(text) {
    if (!text) return text;
    // Remove opening fence: ```markdown, ```md, or bare ```
    let s = text.replace(/^```(?:markdown|md)?\s*\n?/i, '');
    // Remove closing fence
    s = s.replace(/\n?```\s*$/, '');
    return s.trim();
}

/**
 * Parse a combined AI response that contains match JSON + optional docs.
 * @param {string} raw - AI response text
 * @returns {{ matchResult: object|null, resume: string|null, coverLetter: string|null }}
 */
function _parseCombinedResponse(raw) {
    const result = { matchResult: null, resume: null, coverLetter: null };
    if (!raw || typeof raw !== 'string') return result;

    // Extract match JSON
    const matchBlock = raw.match(/===MATCH_JSON_START===([\s\S]*?)===MATCH_JSON_END===/);
    if (matchBlock) {
        result.matchResult = parseMatchResponse(matchBlock[1].trim());
        if (result.matchResult) result.matchResult.aiMatched = true;
    }

    // Extract docs
    const resumeMatch = raw.match(/===RESUME_START===([\s\S]*?)===RESUME_END===/);
    if (resumeMatch) {
        let resumeText = _stripMarkdownFence(resumeMatch[1].trim());
        const resumeContentStart = resumeText.search(/^#\s/m);
        if (resumeContentStart > 50) {
            resumeText = resumeText.slice(resumeContentStart).trim();
        }
        result.resume = resumeText;
    }

    const coverMatch = raw.match(/===COVER_LETTER_START===([\s\S]*?)===COVER_LETTER_END===/);
    if (coverMatch) {
        let coverText = _stripMarkdownFence(coverMatch[1].trim());
        const coverContentStart = coverText.search(/^[A-Z#\*]/m);
        if (coverContentStart > 50) {
            coverText = coverText.slice(coverContentStart).trim();
        }
        result.coverLetter = coverText;
    }

    return result;
}

/**
 * Build the AI prompt that generates Resume + Cover Letter in one call.
 * Returns a structured prompt with clear delimiters for parsing.
 */
function _buildAiDocPrompt(job, profile) {
    const req = job.artifacts?.requirements || {};
    const sections = req.sections || {};
    let techSkills = (sections.technical || req.technical || []);
    techSkills = (Array.isArray(techSkills) ? techSkills.join(', ') : String(techSkills || '')).trim() || 'N/A';
    let responsibilities = (sections.responsibilities || req.responsibilities || []);
    responsibilities = (Array.isArray(responsibilities)
        ? responsibilities.map(r => `- ${r}`).join('\n')
        : String(responsibilities || '')).trim() || 'N/A';
    const education = sections.education || req.education || 'N/A';
    const experience = sections.experience || req.experience || 'N/A';
    const jdText = job.fullText || req.fullText || '';

    const candidateLines = [];
    if (profile) {
        for (const [section, content] of Object.entries(profile)) {
            if (content && typeof content === 'string' && content.trim()) {
                candidateLines.push(`**${section}:** ${content.trim()}`);
            } else if (content && typeof content === 'object') {
                candidateLines.push(`**${section}:** ${JSON.stringify(content)}`);
            }
        }
    }
    const candidateSnapshot = candidateLines.length > 0 ? candidateLines.join('\n') : 'No profile provided.';

    return `You are an expert career consultant. Generate TWO documents for a job application. Output them in the EXACT format below with the delimiters shown. Do NOT add any text outside the delimiters.

## Target Position
- Title: ${job.title || 'N/A'}
- Company: ${job.company || 'N/A'}
- Location: ${job.location || 'N/A'}

## Job Requirements
Technical Skills: ${techSkills}
Responsibilities:
${responsibilities}
Education: ${education}
Experience: ${experience}
${jdText ? `\nFull Job Description:\n${jdText.slice(0, 2000)}\n` : ''}

## Candidate Background
${candidateSnapshot}

## Match Score: ${job.matchScore || 'N/A'}%

---

Now generate BOTH documents below. Use Markdown formatting.

===RESUME_START===
Generate a professional, ATS-optimized resume in Markdown. Include:
- Candidate name as H1
- Contact info (email, phone, location) on one line
- Professional Summary (2-3 sentences highlighting fit for THIS role)
- Technical Skills section (emphasize skills matching the job requirements)
- Work Experience (most relevant first, use bullet points with metrics/achievements)
- Education
- Certifications/Projects (if relevant)

Keep it concise (1-2 pages when printed). Tailor every section to match the job requirements.
===RESUME_END===

===COVER_LETTER_START===
Generate a professional cover letter in Markdown. Include:
- Date and greeting (Dear Hiring Manager at {Company})
- Opening paragraph: Express interest, mention the specific role
- Body paragraph 1: Highlight 2-3 technical skills that match the requirements, with specific examples
- Body paragraph 2: Demonstrate understanding of the company/role, explain why you're a great fit
- Closing paragraph: Call to action, express enthusiasm
- Professional sign-off

Keep it under 400 words. Professional but not generic — reference specific requirements from the JD.
===COVER_LETTER_END===`;
}

/**
 * Parse AI response to extract resume and cover letter sections.
 */
function _parseAiDocResponse(raw) {
    const result = { resume: null, coverLetter: null };
    const resumeMatch = raw.match(/===RESUME_START===([\s\S]*?)===RESUME_END===/);
    if (resumeMatch) result.resume = resumeMatch[1].trim();
    const coverMatch = raw.match(/===COVER_LETTER_START===([\s\S]*?)===COVER_LETTER_END===/);
    if (coverMatch) result.coverLetter = coverMatch[1].trim();
    return result;
}

/**
 * Generate all documents for a job in one AI call:
 *  - Resume (AI-generated markdown → DOCX)
 *  - Cover Letter (AI-generated markdown → DOCX)
 *  - Interview Prep (prompt template, no AI needed)
 *
 * Falls back to templates if AI is unavailable.
 *
 * @param {string} sessionId
 * @param {string} jobUrl
 * @param {object} profile
 * @param {object} options - { aiInvoke, tailorResume, coverLetter, interviewPrep, sessionProfile }
 */
async function generateAllDocs(sessionId, jobUrl, profile, options = {}) {
    const { aiInvoke, tailorResume = true, coverLetter = true, interviewPrep = true, sessionProfile } = options;

    const cards = dashboardServer.getJobCards(sessionId);
    const job = cards.find(c => c.url === jobUrl);
    if (!job) return { error: 'Job not found' };

    const results = { resume: null, coverLetter: null, interviewPrep: null, aiGenerated: false };
    const errors = [];

    // --- Try AI-powered generation for resume + cover letter ---
    const needAiDocs = tailorResume || coverLetter;
    let aiResumeMd = null;
    let aiCoverMd = null;

    if (needAiDocs && aiInvoke) {
        try {
            console.log(`[generateAllDocs] AI generation for ${job.title} @ ${job.company}`);
            const prompt = _buildAiDocPrompt(job, profile);
            const raw = await aiInvoke(prompt);
            const parsed = _parseAiDocResponse(raw);
            aiResumeMd = parsed.resume;
            aiCoverMd = parsed.coverLetter;
            results.aiGenerated = true;
            console.log(`[generateAllDocs] AI output: resume=${aiResumeMd ? aiResumeMd.length + ' chars' : 'MISS'}, cover=${aiCoverMd ? aiCoverMd.length + ' chars' : 'MISS'}`);
        } catch (err) {
            console.error(`[generateAllDocs] AI failed, falling back to templates: ${err.message}`);
        }
    }

    // --- Resume ---
    if (tailorResume) {
        try {
            let resumeMd = aiResumeMd;
            // Fallback to template if AI didn't produce a resume
            if (!resumeMd) {
                const tmpl = resumeGenHandler({
                    profile, sessionProfile: sessionProfile || null,
                    jobTitle: job.title, company: job.company,
                    requirements: job.artifacts?.requirements || {},
                    matchResult: job.matchBreakdown ? { breakdown: job.matchBreakdown } : undefined
                });
                resumeMd = tmpl.markdown;
            }

            let resumeDocx = null;
            try {
                const { markdownToDocx } = require('./tools/docxBuilder');
                const docxResult = await markdownToDocx(resumeMd, { type: 'Resume', company: job.company, title: job.title });
                resumeDocx = docxResult.buffer.toString('base64');
            } catch (docxErr) {
                console.error('[generateAllDocs] Resume DOCX failed:', docxErr.message);
            }

            dashboardServer.upsertJobCard(sessionId, {
                url: jobUrl, status: 'tailored',
                artifacts: { resume: resumeMd, resumeDocx }
            });

            // Knowledge store
            try {
                const knowledgeClient = require('./core/knowledgeClient');
                const crypto = require('crypto');
                const urlHash = crypto.createHash('md5').update(jobUrl).digest('hex').slice(0, 12);
                knowledgeClient.upsert({
                    refId: `resume_${urlHash}`, type: 'resume_variant', scope: `session:${sessionId}`,
                    content: resumeMd, summary: `${job.title} @ ${job.company}`,
                    tags: ['resume', job.company || 'unknown'],
                    metadata: { jobUrl, jobTitle: job.title, company: job.company, matchScore: job.matchScore || 0, aiGenerated: results.aiGenerated }
                }).catch(() => {});
            } catch (_) {}

            results.resume = { success: true, markdown: resumeMd };
        } catch (err) {
            errors.push(`Resume: ${err.message}`);
            results.resume = { error: err.message };
        }
    }

    // --- Cover Letter ---
    if (coverLetter) {
        try {
            let coverMd = aiCoverMd;
            if (!coverMd) {
                const tmpl = coverLetterHandler({
                    profile, company: job.company, jobTitle: job.title,
                    requirements: job.artifacts?.requirements || {}
                });
                coverMd = tmpl.markdown;
            }

            let coverLetterDocx = null;
            try {
                const { markdownToDocx } = require('./tools/docxBuilder');
                const docxResult = await markdownToDocx(coverMd, { type: 'CoverLetter', company: job.company, title: job.title });
                coverLetterDocx = docxResult.buffer.toString('base64');
            } catch (docxErr) {
                console.error('[generateAllDocs] Cover letter DOCX failed:', docxErr.message);
            }

            dashboardServer.upsertJobCard(sessionId, {
                url: jobUrl,
                artifacts: { coverLetter: coverMd, coverLetterDocx }
            });

            results.coverLetter = { success: true, markdown: coverMd };
        } catch (err) {
            errors.push(`Cover Letter: ${err.message}`);
            results.coverLetter = { error: err.message };
        }
    }

    // --- Interview Prep (always template — it's a prompt for the user to paste into AI) ---
    if (interviewPrep) {
        try {
            const promptMd = _buildInterviewPrompt(job, profile);
            dashboardServer.upsertJobCard(sessionId, {
                url: jobUrl,
                artifacts: { interviewPrep: promptMd }
            });
            results.interviewPrep = { success: true, markdown: promptMd };
        } catch (err) {
            errors.push(`Interview Prep: ${err.message}`);
            results.interviewPrep = { error: err.message };
        }
    }

    // --- Generate displayJson for in-page preview ---
    {
        const updatedJob = (dashboardServer.getJobCards(sessionId) || []).find(c => c.url === jobUrl);
        const arts = updatedJob?.artifacts || {};
        const jdText = updatedJob?.fullText || '';
        dashboardServer.upsertJobCard(sessionId, {
            url: jobUrl,
            artifacts: {
                displayJson: {
                    jd:            jdText ? [{ type: 'text', title: 'Job Description', content: jdText }] : null,
                    resume:        _markdownToSections(arts.resume, 'resume'),
                    coverLetter:   _markdownToSections(arts.coverLetter, 'coverLetter'),
                    interviewPrep: _markdownToSections(arts.interviewPrep, 'interviewPrep')
                }
            }
        });
    }

    // --- Record per-job taskLog for generate phase ---
    const docOutcomes = {};
    if (tailorResume)  docOutcomes.resume = { ok: !!results.resume?.success, source: results.aiGenerated && aiResumeMd ? 'ai' : 'template' };
    if (coverLetter)   docOutcomes.coverLetter = { ok: !!results.coverLetter?.success, source: results.aiGenerated && aiCoverMd ? 'ai' : 'template' };
    if (interviewPrep) docOutcomes.interviewPrep = { ok: !!results.interviewPrep?.success, source: 'template' };

    const allOk = Object.values(docOutcomes).every(d => d.ok);
    const anyOk = Object.values(docOutcomes).some(d => d.ok);

    dashboardServer.upsertJobCard(sessionId, {
        url: jobUrl,
        taskLog: {
            generate: {
                status: allOk ? 'ok' : anyOk ? 'partial' : 'error',
                at: new Date().toISOString(),
                error: errors.length > 0 ? errors.join('; ') : null,
                aiGenerated: !!results.aiGenerated,
                docs: docOutcomes
            }
        }
    });

    // Dispatch alert for generate failures
    if (!allOk) {
        try {
            alertService.dispatch(sessionId, {
                type: 'failure',
                stepName: 'generate',
                title: `Generate ${anyOk ? 'partial' : 'failed'}: ${job.title}`,
                message: errors.join('; '),
                meta: { url: jobUrl, company: job.company, aiGenerated: results.aiGenerated }
            });
        } catch (_) {}
    }

    return { success: true, results, errors, job, aiGenerated: results.aiGenerated };
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
    return cards
        .filter(c => ['submitted', 'followed_up', 'archived'].includes(c.status))
        .map(c => {
            // Ensure displayJson is present for document preview in History page
            const arts = c.artifacts || {};
            if (!arts.displayJson && (arts.resume || arts.coverLetter || arts.interviewPrep)) {
                if (!c.artifacts) c.artifacts = {};
                c.artifacts.displayJson = {
                    jd:            c.fullText ? [{ type: 'text', title: 'Job Description', content: c.fullText }] : null,
                    resume:        _markdownToSections(arts.resume, 'resume'),
                    coverLetter:   _markdownToSections(arts.coverLetter, 'coverLetter'),
                    interviewPrep: _markdownToSections(arts.interviewPrep, 'interviewPrep')
                };
            }
            return c;
        });
}

module.exports = {
    startPipeline,
    stopPipeline,
    getPipelineStatus,
    generateResume,
    generateCoverLetter,
    generateInterviewPrep,
    generateAllDocs,
    markApplied,
    getHistory,
    buildSearchQueries,
    clearSeenJobs: _clearSeenJobs,
    // Exported for testing
    _analyzeGap,
    _expandQueries,
    _parseSkills,
    // Cloudflare detection utilities
    _isCloudflareError,
    _isCloudflareChallenge,
    _handleCloudflareChallenge
};
