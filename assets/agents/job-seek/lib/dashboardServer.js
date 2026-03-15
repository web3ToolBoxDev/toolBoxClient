'use strict';

const http = require('http');
const { spawn, execSync } = require('child_process');
const path = require('path');

const DASHBOARD_PORT = 30003;

// Unique token to identify this server instance (used for takeover)
const _instanceId = `dash_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;

// Lazy-require to break circular dependency (searchPipeline requires dashboardServer)
let _searchPipeline = null;
function getSearchPipeline() {
    if (!_searchPipeline) _searchPipeline = require('./searchPipeline');
    return _searchPipeline;
}

// Lazy-require workflow modules
let _workflowEngine = null;
function getWorkflowEngine() {
    if (!_workflowEngine) _workflowEngine = require('./workflow/workflowEngine');
    return _workflowEngine;
}
let _workflowStore = null;
function getWorkflowStore() {
    if (!_workflowStore) _workflowStore = require('./workflow/workflowStore');
    return _workflowStore;
}
let _workflowConfig = null;
function getWorkflowConfig() {
    if (!_workflowConfig) _workflowConfig = require('./workflow/workflowConfig');
    return _workflowConfig;
}
let _workflowViewModel = null;
function getWorkflowViewModel() {
    if (!_workflowViewModel) _workflowViewModel = require('./workflow/workflowViewModel');
    return _workflowViewModel;
}
let _platformStore = null;
function getPlatformStore() {
    if (!_platformStore) _platformStore = require('./workflow/platformStore');
    return _platformStore;
}
let _platformService = null;
function getPlatformService() {
    if (!_platformService) {
        _platformService = require('./workflow/platformService');
        // Wire up screenshot verifier so verifyLogin can use AI + screenshot
        _platformService.setScreenshotVerifier(async (base64png, platformLabel) => {
            const state = _stateGetter ? _stateGetter() : {};
            const aiInvoke = _createAiInvoke(state);
            const prompt = `Analyze this screenshot of "${platformLabel}". Is the user currently logged in? `
                + 'Look for signs like profile avatars, user menus, dashboard content, or logout buttons. '
                + 'Respond with JSON: { "loggedIn": true/false, "reasoning": "..." }';
            const raw = await aiInvoke(prompt, base64png);
            try {
                const text = typeof raw === 'string' ? raw : (raw.content || raw);
                const match = String(text).match(/\{[\s\S]*\}/);
                if (match) return JSON.parse(match[0]);
            } catch (_) {}
            return { loggedIn: false, reasoning: 'Failed to parse AI response' };
        });
    }
    return _platformService;
}
let _scriptBuilder = null;
function getScriptBuilder() {
    if (!_scriptBuilder) _scriptBuilder = require('./workflow/scriptBuilder');
    return _scriptBuilder;
}
let _scheduleEngine = null;
function getScheduleEngine() {
    if (!_scheduleEngine) _scheduleEngine = require('./workflow/scheduleEngine');
    return _scheduleEngine;
}
let _alertService = null;
function getAlertService() {
    if (!_alertService) {
        _alertService = require('./workflow/alertService');
        _alertService.setSSEBroadcaster(_broadcastSSE);
    }
    return _alertService;
}
let _port = DASHBOARD_PORT;
let _server = null;
let _stateGetter = null; // function that returns current agent state

// ─── CLI auto-detection (mirrors agent.js resolveProvider logic) ───
const _cliCache = {};
function _isCliAvailable(cmd) {
    if (_cliCache[cmd] !== undefined) return _cliCache[cmd];
    try {
        const check = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
        execSync(check, { stdio: 'ignore', timeout: 5000 });
        _cliCache[cmd] = true;
    } catch (_) {
        _cliCache[cmd] = false;
    }
    return _cliCache[cmd];
}

/**
 * Resolve the effective AI provider from state, with CLI auto-detection fallback.
 * Returns { provider, apiKey, isCliProvider } or null if nothing available.
 */
function _resolveAiProvider(state) {
    const provider = state.currentProvider || '';
    const apiKey = state.runtimeApiKey || '';
    const isCliProvider = provider === 'claude-code' || provider === 'codex-cli';

    // If explicitly configured, use that
    if (apiKey || isCliProvider) {
        return { provider, apiKey, isCliProvider };
    }

    // Auto-detect: codex-cli > claude-code (fallback only if user didn't select a provider)
    if (_isCliAvailable('codex')) {
        return { provider: 'codex-cli', apiKey: '', isCliProvider: true };
    }
    if (_isCliAvailable('claude')) {
        return { provider: 'claude-code', apiKey: '', isCliProvider: true };
    }

    console.log(`[_resolveAiProvider] No AI provider found (state.currentProvider='${provider}', runtimeApiKey=${apiKey ? 'SET' : 'EMPTY'}, codex=${_cliCache['codex']}, claude=${_cliCache['claude']})`);
    return null; // No AI backend available
}

/**
 * Build provider-keyed imageContent for aiClient.callAPI.
 * @param {string} base64png - base64-encoded PNG screenshot
 * @param {string} textPrompt - the user prompt text (included alongside image)
 * @returns {{ openai: Array, anthropic: Array, google: Array }}
 */
function _buildImageContent(base64png, textPrompt) {
    return {
        // OpenAI vision format
        openai: [
            { type: 'text', text: textPrompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64png}` } }
        ],
        // Anthropic multimodal format
        anthropic: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64png } },
            { type: 'text', text: textPrompt }
        ],
        // Google Gemini format
        google: [
            { inlineData: { mimeType: 'image/png', data: base64png } },
            { text: textPrompt }
        ]
    };
}

/**
 * Build an AI expander callback for adaptive search query expansion.
 * Uses _stateGetter to get AI credentials at call time (not at creation time).
 *
 * @returns {Function} async ({ jobTitle, location, profileSummary, previousQueries, gap }) => string[]
 */
function _buildAiExpander() {
    return async ({ jobTitle, location, profileSummary, previousQueries, gap }) => {
        const state = _stateGetter ? _stateGetter() : {};
        const resolved = _resolveAiProvider(state);
        if (!resolved) return []; // no AI credentials → skip

        // Override state with resolved provider for _createAiInvoke
        if (resolved.isCliProvider && !state.currentProvider) {
            state.currentProvider = resolved.provider;
        }

        const prompt = `You are a job search optimization assistant.

The user is searching for "${jobTitle}" jobs${location ? ` in ${location}` : ''}.

User's profile summary:
${profileSummary}

Previous search queries tried (not enough results):
${previousQueries.map(q => `- "${q}"`).join('\n')}

Gap info: ${JSON.stringify(gap)}

Generate 3-5 alternative search keyword phrases that would find similar jobs on job boards.
Consider:
- Industry-specific title synonyms (e.g., for nursing: "RN", "Registered Nurse", "Staff Nurse")
- Related roles in the same field
- Technology/skill-specific variations from the user's profile
- Common abbreviations or alternative naming conventions in this industry

Return ONLY a JSON array of strings, each being a search phrase. No explanation.
Example: ["Staff Nurse ICU", "RN Critical Care", "Registered Nurse Hospital"]`;

        try {
            const aiInvoke = _createAiInvoke(state);
            const systemPrefix = 'You output only valid JSON arrays. No markdown, no explanation.\n\n';
            const rawText = await aiInvoke(systemPrefix + prompt);
            const text = (typeof rawText === 'string' ? rawText : (rawText?.content || '')).trim();
            const match = text.match(/\[[\s\S]*\]/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                console.log(`[aiExpander] AI generated ${parsed.length} query suggestions (via ${resolved.isCliProvider ? 'CLI' : 'API'})`);
                return Array.isArray(parsed) ? parsed.filter(s => typeof s === 'string') : [];
            }
            return [];
        } catch (err) {
            console.log('[aiExpander] AI call failed, falling back to deterministic expansion:', err.message);
            return [];
        }
    };
}

/**
 * Build an AI matcher callback for full-JD profile matching.
 * Sends profile + entire JD text to AI for structured scoring.
 * Falls back to null (caller uses algorithmic matching) if AI unavailable.
 *
 * @returns {Function} async (profile, listing, taxonomy) => matchResult|null
 */
function _buildAiMatcher() {
    return async (profile, listing, taxonomy) => {
        const state = _stateGetter ? _stateGetter() : {};
        console.log(`[aiMatcher] state.currentProvider='${state.currentProvider || ''}', state.runtimeApiKey=${state.runtimeApiKey ? 'SET' : 'EMPTY'}`);
        const resolved = _resolveAiProvider(state);
        if (!resolved) {
            console.log('[aiMatcher] No API key and no CLI provider — skipping AI match');
            return null;
        }

        // Override state with resolved provider for _createAiInvoke
        if (resolved.isCliProvider && !state.currentProvider) {
            state.currentProvider = resolved.provider;
        }

        const { buildMatchPrompt, parseMatchResponse } = require('./tools/matchProfile');
        const { mergeTaxonomy, BASE_TAXONOMY, BASE_ALIASES } = require('./tools/skillTaxonomy');

        // Merge AI-generated taxonomy with base
        const merged = taxonomy
            ? mergeTaxonomy({ taxonomy: BASE_TAXONOMY, aliases: BASE_ALIASES }, taxonomy)
            : { taxonomy: BASE_TAXONOMY, aliases: BASE_ALIASES };

        const jdText = listing.fullText || listing.description || '';
        const prompt = buildMatchPrompt(profile, jdText, listing.title || '', merged);

        try {
            // Use _createAiInvoke to support both CLI (claude-code) and API providers
            const aiInvoke = _createAiInvoke(state);
            const systemPrefix = 'You are a job matching expert. Output only valid JSON, no markdown fences, no explanation.\n\n';
            const text = await aiInvoke(systemPrefix + prompt);
            const matchResult = parseMatchResponse(typeof text === 'string' ? text : (text?.content || ''));
            if (matchResult) {
                matchResult.matchedAt = new Date().toISOString();
                matchResult.aiMatched = true;
                console.log(`[aiMatcher] AI match score: ${matchResult.overallScore}% (via ${resolved.isCliProvider ? 'CLI' : 'API'})`);
            } else {
                console.log('[aiMatcher] AI returned unparseable response, falling back to algorithm');
            }
            return matchResult;
        } catch (err) {
            console.log('[aiMatcher] AI call failed:', err.message);
            return null;
        }
    };
}

/**
 * Create an aiInvoke function from the current provider config.
 * Signature: async (prompt: string, screenshot?: string) => string
 *
 * Supports:
 *  - 'claude-code' / 'codex-cli' → spawn CLI with prompt piped via stdin
 *    (screenshots saved to workspace file, path included in prompt for CLI to read)
 *  - API providers (openai, anthropic, google) → use aiClient.callAPI
 */
function _createAiInvoke(state) {
    const provider = state.currentProvider;
    const model = state.currentModel || 'default';
    const subProvider = state.currentSubProvider || '';
    const apiKey = state.runtimeApiKey || '';

    if (provider === 'claude-code' || provider === 'codex-cli') {
        // CLI-based provider — spawn process with prompt on stdin.
        // For screenshots: save to workspace file, include path in prompt
        // so the CLI can read the image via its built-in Read tool.
        // (Same pattern as agent.js invokeCliAsync with resume images)
        const workspaceDir = path.resolve(__dirname, '..', 'workspace');
        return async function aiInvoke(prompt, screenshot) {
            let imgPath = null;
            let fullPrompt = prompt;
            if (screenshot) {
                const fs = require('fs');
                try { fs.mkdirSync(workspaceDir, { recursive: true }); } catch (_) {}
                imgPath = path.join(workspaceDir, `screenshot_${Date.now()}.png`);
                fs.writeFileSync(imgPath, Buffer.from(screenshot, 'base64'));
                fullPrompt = `Look at the screenshot image at ${imgPath}. ${prompt}`;
            }
            return new Promise((resolve, reject) => {
                let bin, args;
                if (provider === 'codex-cli') {
                    bin = 'codex';
                    args = ['exec'];
                    if (model && model !== 'default') args.push('--model', model);
                } else {
                    bin = 'claude';
                    args = ['-p'];
                    if (model && model !== 'default') args.push('--model', model);
                }
                const cleanEnv = { ...process.env };
                delete cleanEnv.CLAUDECODE; // Allow nested Claude Code invocation
                const child = spawn(bin, args, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    timeout: 120000,
                    shell: true,
                    cwd: workspaceDir,
                    env: cleanEnv
                });
                let stdout = '';
                let stderr = '';
                child.stdin.write(fullPrompt);
                child.stdin.end();
                child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
                child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
                child.on('close', (code) => {
                    // Cleanup temp screenshot
                    if (imgPath) { try { require('fs').unlinkSync(imgPath); } catch (_) {} }
                    if (code === 0) {
                        resolve(stdout.trim());
                    } else if (code === null && stdout.trim().length > 50) {
                        // Process killed by signal (e.g. timeout SIGTERM) but produced valid output
                        console.log(`[aiInvoke] ${bin} exited with signal (code=null) but stdout has ${stdout.trim().length} chars — treating as success`);
                        resolve(stdout.trim());
                    } else {
                        reject(new Error(`${bin} exited with code ${code}: ${stderr.trim().slice(0, 500)}`));
                    }
                });
                child.on('error', (err) => {
                    if (imgPath) { try { require('fs').unlinkSync(imgPath); } catch (_) {} }
                    reject(new Error(`${bin} spawn failed: ${err.message}`));
                });
            });
        };
    }

    // API-based provider — use aiClient
    return async function aiInvoke(prompt, screenshot) {
        const aiClient = require('./aiClient');
        const conversationHistory = [{ role: 'user', content: prompt }];
        const imageContent = screenshot ? _buildImageContent(screenshot, prompt) : undefined;
        const result = await aiClient.callAPI({
            subProvider: subProvider || provider,
            apiKey,
            model: model !== 'default' ? model : undefined,
            conversationHistory,
            systemPrompt: 'You are a helpful assistant that generates Puppeteer automation scripts.',
            imageContent
        });
        return typeof result === 'string' ? result : (result.content || '');
    };
}

/**
 * Start a tiny HTTP server that serves dashboard data as JSON
 * and the dashboard HTML page. The HTML fetches data dynamically.
 * @param {Function} getState - returns current agent state
 * @param {number} [port] - optional port override (for testing)
 */
function start(getState, port) {
    _stateGetter = getState; // Always update stateGetter even if server already running
    if (_server) return _port;
    _port = port || DASHBOARD_PORT;

    _server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            return res.end();
        }

        const url = (req.url || '').split('?')[0];

        // GET /api/envs — return fingerprint browser environments
        if (url === '/api/envs' && req.method === 'GET') {
            const state = _stateGetter ? _stateGetter() : {};
            const envs = (state.envs || []).map(e => ({
                id: e.id || e._id,
                name: e.name || e.id || e._id
            }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(envs));
        }

        // GET /api/active-session — return active session id
        if (url === '/api/active-session' && req.method === 'GET') {
            const state = _stateGetter ? _stateGetter() : {};
            const activeId = state.activeSessionId || '';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ sessionId: activeId }));
        }

        // GET /dashboard (no sessionId) — redirect to active session
        if (url === '/dashboard' && req.method === 'GET') {
            const state = _stateGetter ? _stateGetter() : {};
            const activeId = state.activeSessionId || '';
            if (activeId) {
                res.writeHead(302, { 'Location': `/dashboard/${encodeURIComponent(activeId)}` });
                return res.end();
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end('<h2>No active session</h2><p>Start a session in the Agent Workspace first.</p>');
        }

        // GET /api/dashboard/:sessionId — return JSON data
        const apiMatch = url.match(/^\/api\/dashboard\/(.+)$/);
        if (apiMatch && req.method === 'GET') {
            const sessionId = decodeURIComponent(apiMatch[1]);
            const data = getDashboardData(sessionId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(data));
        }

        // POST /api/jobs/:sessionId/status — update job status (must come before /api/jobs/:sessionId)
        const statusMatch = url.match(/^\/api\/jobs\/(.+)\/status$/);
        if (statusMatch && req.method === 'POST') {
            const sessionId = decodeURIComponent(statusMatch[1]);
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { jobUrl, status } = JSON.parse(body);
                    updateJobStatus(sessionId, jobUrl, status);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        }

        // POST /api/jobs/:sessionId — upsert a job card
        const jobsMatch = url.match(/^\/api\/jobs\/(.+)$/);
        if (jobsMatch && req.method === 'POST') {
            const sessionId = decodeURIComponent(jobsMatch[1]);
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const job = JSON.parse(body);
                    upsertJobCard(sessionId, job);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        }

        // ─── Pipeline API routes ───

        // POST /api/pipeline/:sessionId/start — start search pipeline
        const pipeStartMatch = url.match(/^\/api\/pipeline\/(.+)\/start$/);
        if (pipeStartMatch && req.method === 'POST') {
            const sessionId = decodeURIComponent(pipeStartMatch[1]);
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { minScore, targetCount, maxResults, envId, platforms, maxSearchRounds } = JSON.parse(body);
                    const state = _stateGetter ? _stateGetter() : {};
                    const answers = state.selectedAnswers?.[sessionId] || {};
                    const sections = state.profileSections?.[sessionId] || {};

                    // Build AI callbacks for pipeline
                    const aiExpander = _buildAiExpander();
                    const aiMatcher = _buildAiMatcher();

                    // Load search history for dedup + smart pagination
                    const searchHistory = state.searchHistory?.[sessionId] || {};
                    const onHistorySave = (history) => {
                        const st = _stateGetter ? _stateGetter() : {};
                        if (!st.searchHistory) st.searchHistory = {};
                        st.searchHistory[sessionId] = history;
                    };

                    // Build AI invoke for failure analysis (fix rule generation)
                    console.log(`[pipeline:start] state.currentProvider='${state.currentProvider || ''}', state.runtimeApiKey=${state.runtimeApiKey ? 'SET' : 'EMPTY'}`);
                    const aiInvoke = _createAiInvoke(state);

                    const result = getSearchPipeline().startPipeline(
                        sessionId,
                        { minScore, targetCount, maxResults, envId: envId || null, platforms: platforms || [], maxSearchRounds, aiExpander, aiMatcher, aiInvoke, searchHistory, onHistorySave },
                        answers,
                        sections
                    );
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        // POST /api/pipeline/:sessionId/stop — stop pipeline
        const pipeStopMatch = url.match(/^\/api\/pipeline\/(.+)\/stop$/);
        if (pipeStopMatch && req.method === 'POST') {
            const sessionId = decodeURIComponent(pipeStopMatch[1]);
            const result = getSearchPipeline().stopPipeline(sessionId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
        }

        // GET /api/pipeline/:sessionId/status — get pipeline status
        const pipeStatusMatch = url.match(/^\/api\/pipeline\/(.+)\/status$/);
        if (pipeStatusMatch && req.method === 'GET') {
            const sessionId = decodeURIComponent(pipeStatusMatch[1]);
            const result = getSearchPipeline().getPipelineStatus(sessionId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
        }

        // POST /api/pipeline/:sessionId/generate-resume — generate tailored resume
        const genResumeMatch = url.match(/^\/api\/pipeline\/(.+)\/generate-resume$/);
        if (genResumeMatch && req.method === 'POST') {
            const sessionId = decodeURIComponent(genResumeMatch[1]);
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const { jobUrl } = JSON.parse(body);
                    const state = _stateGetter ? _stateGetter() : {};
                    const sessionProfile = state.profileSections?.[sessionId] || {};
                    const masterProfile = state.masterProfile || {};
                    // Two-stage: pass session-tailored profile (preferred) + raw master (fallback)
                    const result = await getSearchPipeline().generateResume(
                        sessionId, jobUrl, masterProfile, sessionProfile
                    );
                    // Enrich with derivation metadata
                    if (result.success) {
                        const userStore = require('./core/userStore');
                        const user = userStore.getActiveUser();
                        const masterKeys = Object.values(masterProfile).filter(v => v && v.trim()).length;
                        const tailoredKeys = Object.values(sessionProfile).filter(v => v && v.trim()).length;
                        result.derivation = {
                            userId: user?.id || '',
                            userName: user?.name || '',
                            masterSections: masterKeys,
                            tailoredSections: tailoredKeys,
                            derivationChain: result.derivationChain || [],
                            targetRole: state.selectedAnswers?.[sessionId]?.q_job_title || '',
                            matchScore: result.job?.matchScore || 0
                        };
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        // POST /api/pipeline/:sessionId/generate-cover-letter — generate cover letter
        const genCoverMatch = url.match(/^\/api\/pipeline\/(.+)\/generate-cover-letter$/);
        if (genCoverMatch && req.method === 'POST') {
            const sessionId = decodeURIComponent(genCoverMatch[1]);
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const { jobUrl } = JSON.parse(body);
                    const state = _stateGetter ? _stateGetter() : {};
                    const sections = state.profileSections?.[sessionId] || {};
                    const result = await getSearchPipeline().generateCoverLetter(sessionId, jobUrl, sections);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        // POST /api/pipeline/:sessionId/mark-applied — mark job as applied
        const markAppliedMatch = url.match(/^\/api\/pipeline\/(.+)\/mark-applied$/);
        if (markAppliedMatch && req.method === 'POST') {
            const sessionId = decodeURIComponent(markAppliedMatch[1]);
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { jobUrl, note } = JSON.parse(body);
                    const result = getSearchPipeline().markApplied(sessionId, jobUrl, note);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        // POST /api/pipeline/:sessionId/apply — trigger batch auto-apply
        const batchApplyMatch = url.match(/^\/api\/pipeline\/(.+)\/apply$/);
        if (batchApplyMatch && req.method === 'POST') {
            const sessionId = decodeURIComponent(batchApplyMatch[1]);
            _readBody(req, async (data) => {
                try {
                    const applyStep = require('./workflow/steps/apply');
                    const state = _stateGetter ? _stateGetter() : {};
                    const sections = state.profileSections?.[sessionId] || {};
                    const config = state.workflowConfigs?.[sessionId] || {};

                    // Override jobIds if provided in request body
                    const applyConfig = { ...config };
                    if (data.jobUrls?.length > 0) {
                        const steps = (applyConfig.steps || []).map(s =>
                            s.name === 'apply' ? { ...s, jobIds: data.jobUrls } : s
                        );
                        applyConfig.steps = steps;
                    }

                    const result = await applyStep.execute({
                        sessionId,
                        config: applyConfig,
                        context: { profile: sections, direction: state.directions?.[sessionId] }
                    });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        // POST /api/pipeline/:sessionId/apply-single/:encodedJobUrl — trigger single job apply
        const singleApplyMatch = url.match(/^\/api\/pipeline\/([^/]+)\/apply-single\/(.+)$/);
        if (singleApplyMatch && req.method === 'POST') {
            const sessionId = decodeURIComponent(singleApplyMatch[1]);
            const jobUrl = decodeURIComponent(singleApplyMatch[2]);
            _readBody(req, async () => {
                try {
                    const applyStep = require('./workflow/steps/apply');
                    const state = _stateGetter ? _stateGetter() : {};
                    const sections = state.profileSections?.[sessionId] || {};
                    const config = state.workflowConfigs?.[sessionId] || {};

                    // Force single job
                    const applyConfig = { ...config };
                    applyConfig.steps = (applyConfig.steps || []).map(s =>
                        s.name === 'apply' ? { ...s, jobIds: [jobUrl], maxApplyPerRun: 1 } : s
                    );

                    const result = await applyStep.execute({
                        sessionId,
                        config: applyConfig,
                        context: { profile: sections, direction: state.directions?.[sessionId] }
                    });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        // GET /api/pipeline/:sessionId/apply-screenshot/:encodedJobUrl — get apply screenshot
        const applySSMatch = url.match(/^\/api\/pipeline\/([^/]+)\/apply-screenshot\/(.+)$/);
        if (applySSMatch && req.method === 'GET') {
            const sessionId = decodeURIComponent(applySSMatch[1]);
            const jobUrl = decodeURIComponent(applySSMatch[2]);
            const cards = getJobCards(sessionId);
            const job = cards.find(c => c.url === jobUrl);
            const screenshot = job?.artifacts?.applyScreenshot;
            if (!screenshot) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'No apply screenshot available' }));
            }
            const imgBuf = Buffer.from(screenshot, 'base64');
            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Length': imgBuf.length,
                'Cache-Control': 'no-cache'
            });
            res.end(imgBuf);
            return;
        }

        // POST /api/pipeline/:sessionId/generate-interview-prep — generate interview prep
        const genPrepMatch = url.match(/^\/api\/pipeline\/(.+)\/generate-interview-prep$/);
        if (genPrepMatch && req.method === 'POST') {
            const sessionId = decodeURIComponent(genPrepMatch[1]);
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const { jobUrl } = JSON.parse(body);
                    const state = _stateGetter ? _stateGetter() : {};
                    const sections = state.profileSections?.[sessionId] || {};
                    const result = await getSearchPipeline().generateInterviewPrep(sessionId, jobUrl, sections);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        // GET /api/pipeline/:sessionId/download/:encodedJobUrl/:type — download generated document
        const downloadMatch = url.match(/^\/api\/pipeline\/([^/]+)\/download\/([^/]+)\/(resume|coverLetter|interviewPrep)$/);
        if (downloadMatch && req.method === 'GET') {
            const sessionId = decodeURIComponent(downloadMatch[1]);
            const jobUrl = decodeURIComponent(downloadMatch[2]);
            const docType = downloadMatch[3];
            const cards = getJobCards(sessionId);
            const job = cards.find(c => c.url === jobUrl);
            if (!job || !job.artifacts?.[docType]) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Document not found' }));
            }
            const content = job.artifacts[docType];
            const safeCompany = (job.company || 'Company').replace(/[^a-zA-Z0-9_-]/g, '_');
            const safeTitle = (job.title || 'Job').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
            const typeLabel = { resume: 'Resume', coverLetter: 'CoverLetter', interviewPrep: 'InterviewPrep' }[docType];

            // Check query param for format override (?format=md for raw markdown)
            const rawQuery = (req.url || '').split('?')[1] || '';
            const queryFormat = new URLSearchParams(rawQuery).get('format');

            // Resume & cover letter → DOCX by default; interviewPrep stays markdown
            if ((docType === 'resume' || docType === 'coverLetter') && queryFormat !== 'md') {
                // Convert markdown → DOCX (async)
                const { markdownToDocx } = require('./tools/docxBuilder');
                (async () => {
                    try {
                        const { buffer, filename } = await markdownToDocx(content, {
                            type: typeLabel,
                            company: job.company,
                            title: job.title
                        });
                        res.writeHead(200, {
                            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            'Content-Disposition': `attachment; filename="${filename}"`,
                            'Content-Length': buffer.length
                        });
                        res.end(buffer);
                    } catch (docxErr) {
                        console.error('[dashboard] DOCX conversion failed, falling back to markdown:', docxErr.message);
                        const filename = `${typeLabel}_${safeCompany}_${safeTitle}.md`;
                        res.writeHead(200, {
                            'Content-Type': 'text/markdown; charset=utf-8',
                            'Content-Disposition': `attachment; filename="${filename}"`
                        });
                        res.end(content);
                    }
                })();
                return;
            }

            // Markdown fallback (interviewPrep, or ?format=md, or DOCX conversion failure)
            const filename = `${typeLabel}_${safeCompany}_${safeTitle}.md`;
            res.writeHead(200, {
                'Content-Type': 'text/markdown; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`
            });
            return res.end(content);
        }

        // GET /api/pipeline/:sessionId/history — get application history
        const historyMatch = url.match(/^\/api\/pipeline\/(.+)\/history$/);
        if (historyMatch && req.method === 'GET') {
            const sessionId = decodeURIComponent(historyMatch[1]);
            const result = getSearchPipeline().getHistory(sessionId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
        }

        // ─── Workflow Status API routes ───

        // GET /api/workflow-status/:sessionId — get all platform cell statuses
        const wfStatusMatch = url.match(/^\/api\/workflow-status\/([^/]+)$/);
        if (wfStatusMatch && req.method === 'GET') {
            const sessionId = decodeURIComponent(wfStatusMatch[1]);
            const platforms = getWorkflowStatus(sessionId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ platforms }));
        }

        // POST /api/workflow-status/:sessionId/:platformId/update — update a cell
        const wfUpdateMatch = url.match(/^\/api\/workflow-status\/([^/]+)\/([^/]+)\/update$/);
        if (wfUpdateMatch && req.method === 'POST') {
            const sessionId = decodeURIComponent(wfUpdateMatch[1]);
            const platformId = decodeURIComponent(wfUpdateMatch[2]);
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const update = JSON.parse(body);
                    updatePlatformCell(sessionId, platformId, update);
                    const platforms = getWorkflowStatus(sessionId);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, platforms }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        }

        // ─── Workflow Engine API routes ───

        // GET /api/workflow/:sid/status — get workflow status (+ pipeline logs)
        const wfEngStatusMatch = url.match(/^\/api\/workflow\/([^/]+)\/status$/);
        if (wfEngStatusMatch && req.method === 'GET') {
            const sid = decodeURIComponent(wfEngStatusMatch[1]);
            const status = getWorkflowEngine().getStatus(sid);
            // Attach pipeline logs so the dashboard can show job URLs + scores
            try {
                const pipeStatus = getSearchPipeline().getPipelineStatus(sid);
                const pipeLogs = pipeStatus && pipeStatus.progress && pipeStatus.progress.logs;
                if (pipeLogs && pipeLogs.length > 0) {
                    status.pipelineLogs = pipeLogs;
                }
            } catch (_) {}
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(status));
        }

        // POST /api/workflow/:sid/start — start workflow
        const wfStartMatch = url.match(/^\/api\/workflow\/([^/]+)\/start$/);
        if (wfStartMatch && req.method === 'POST') {
            const sid = decodeURIComponent(wfStartMatch[1]);
            _readBody(req, async (body) => {
                try {
                    const { config, context } = body;
                    const wfConfig = config || getWorkflowStore().getConfig(sid);
                    if (!wfConfig) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ success: false, error: 'No workflow config. Save config first.' }));
                    }
                    const state = _stateGetter ? _stateGetter() : {};
                    const answers = state.selectedAnswers?.[sid] || {};
                    const sections = state.profileSections?.[sid] || {};
                    const ctx = context || { direction: answers, profile: sections };
                    // Attach AI-generated skill taxonomy if available
                    if (!ctx.skillTaxonomy && state.skillTaxonomy?.[sid]) {
                        ctx.skillTaxonomy = state.skillTaxonomy[sid];
                    }
                    const result = await getWorkflowEngine().start(sid, wfConfig, ctx);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        }

        // POST /api/workflow/:sid/stop — stop workflow
        const wfStopMatch = url.match(/^\/api\/workflow\/([^/]+)\/stop$/);
        if (wfStopMatch && req.method === 'POST') {
            const sid = decodeURIComponent(wfStopMatch[1]);
            const result = getWorkflowEngine().stop(sid);
            const code = result.success ? 200 : 400;
            res.writeHead(code, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
        }

        // POST /api/workflow/:sid/resume — resume workflow
        const wfResumeMatch = url.match(/^\/api\/workflow\/([^/]+)\/resume$/);
        if (wfResumeMatch && req.method === 'POST') {
            const sid = decodeURIComponent(wfResumeMatch[1]);
            _readBody(req, async (body) => {
                try {
                    const wfConfig = getWorkflowStore().getConfig(sid);
                    const state = _stateGetter ? _stateGetter() : {};
                    const answers = state.selectedAnswers?.[sid] || {};
                    const sections = state.profileSections?.[sid] || {};
                    const ctx = body.context || { direction: answers, profile: sections };
                    const result = await getWorkflowEngine().resume(sid, wfConfig, ctx);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        }

        // GET /api/workflow/:sid/config — get workflow config (auto-creates default)
        const wfConfigGetMatch = url.match(/^\/api\/workflow\/([^/]+)\/config$/);
        if (wfConfigGetMatch && req.method === 'GET') {
            const sid = decodeURIComponent(wfConfigGetMatch[1]);
            const wfStore = getWorkflowStore();
            let config = wfStore.getConfig(sid);
            if (!config) {
                const state = _stateGetter ? _stateGetter() : {};
                const location = state.selectedAnswers?.[sid]?.q_location || '';
                config = getWorkflowConfig().buildDefaultConfig(location);
                wfStore.saveConfig(sid, config);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(config));
        }

        // PUT /api/workflow/:sid/config — merge + save workflow config
        const wfConfigPutMatch = url.match(/^\/api\/workflow\/([^/]+)\/config$/);
        if (wfConfigPutMatch && req.method === 'PUT') {
            const sid = decodeURIComponent(wfConfigPutMatch[1]);
            _readBody(req, (body) => {
                try {
                    const wfStore = getWorkflowStore();
                    const wfCfg = getWorkflowConfig();
                    // Get existing or create default
                    let existing = wfStore.getConfig(sid);
                    if (!existing) {
                        const state = _stateGetter ? _stateGetter() : {};
                        const location = state.selectedAnswers?.[sid]?.q_location || '';
                        existing = wfCfg.buildDefaultConfig(location);
                    }
                    // Merge patch into existing
                    const merged = wfCfg.mergeConfig(existing, body);
                    // Validate
                    const { valid, errors } = wfCfg.validateConfig(merged);
                    if (!valid) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ success: false, errors }));
                    }
                    wfStore.saveConfig(sid, merged);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(merged));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            }, (parseErr) => {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Invalid JSON: ' + parseErr.message }));
            });
            return;
        }

        // GET /api/workflow/:sid/view-model — get workflow view model (auto-configures)
        const wfViewModelMatch = url.match(/^\/api\/workflow\/([^/]+)\/view-model$/);
        if (wfViewModelMatch && req.method === 'GET') {
            const sid = decodeURIComponent(wfViewModelMatch[1]);
            // Auto-create config if not exists (so view-model always returns configured=true)
            const wfStore = getWorkflowStore();
            if (!wfStore.getConfig(sid)) {
                const state = _stateGetter ? _stateGetter() : {};
                const location = state.selectedAnswers?.[sid]?.q_location || '';
                const config = getWorkflowConfig().buildDefaultConfig(location);
                wfStore.saveConfig(sid, config);
            }
            const vm = getWorkflowViewModel().buildViewModel(sid);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(vm));
        }

        // GET /api/workflow/:sid/login-status/:source — check login status for a source
        const wfLoginStatusMatch = url.match(/^\/api\/workflow\/([^/]+)\/login-status\/([^/]+)$/);
        if (wfLoginStatusMatch && req.method === 'GET') {
            const sid = decodeURIComponent(wfLoginStatusMatch[1]);
            const source = decodeURIComponent(wfLoginStatusMatch[2]);
            (async () => {
                try {
                    const status = await getWorkflowEngine().checkLoginStatus(source);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ source, status }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ source, status: 'unknown', error: e.message }));
                }
            })();
            return;
        }

        // POST /api/workflow/:sid/login/:source — set login status for a source
        const wfLoginSetMatch = url.match(/^\/api\/workflow\/([^/]+)\/login\/([^/]+)$/);
        if (wfLoginSetMatch && req.method === 'POST') {
            const sid = decodeURIComponent(wfLoginSetMatch[1]);
            const source = decodeURIComponent(wfLoginSetMatch[2]);
            _readBody(req, (body) => {
                getWorkflowEngine().setLoginStatus(source, body.status || 'unknown');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ source, status: body.status || 'unknown' }));
            });
            return;
        }

        // GET /api/workflow/:sid/history — get workflow run history
        const wfHistoryMatch = url.match(/^\/api\/workflow\/([^/]+)\/history$/);
        if (wfHistoryMatch && req.method === 'GET') {
            const sid = decodeURIComponent(wfHistoryMatch[1]);
            const wfStore = getWorkflowStore();
            const history = wfStore.getHistory ? wfStore.getHistory(sid) : [];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(history));
        }

        // GET /api/workflow/:sid/stats — combined dashboard stats
        const wfStatsMatch = url.match(/^\/api\/workflow\/([^/]+)\/stats$/);
        if (wfStatsMatch && req.method === 'GET') {
            const sid = decodeURIComponent(wfStatsMatch[1]);
            const jobStats = getJobStats(sid);
            const platforms = getWorkflowStatus(sid);
            const wfStatus = getWorkflowEngine().getStatus(sid);
            const schedule = getScheduleEngine().getSchedule(sid);

            // Platform stats summary
            let platformsReady = 0, platformsError = 0, platformsTotal = 0;
            for (const p of platforms) {
                platformsTotal++;
                if (p.cells?.login?.status === 'verified' && p.cells?.search?.status === 'ready') platformsReady++;
                if (p.cells?.login?.status === 'error' || p.cells?.search?.status === 'error') platformsError++;
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                jobs: jobStats,
                platforms: { total: platformsTotal, ready: platformsReady, error: platformsError },
                workflow: { status: wfStatus.status, currentStep: wfStatus.currentStep, startedAt: wfStatus.startedAt },
                schedule: schedule || { enabled: false },
                history: (getWorkflowStore().getHistory ? getWorkflowStore().getHistory(sid) : []).length
            }));
        }

        // GET /api/workflow/:sid/stuck — check stuck steps
        const wfStuckMatch = url.match(/^\/api\/workflow\/([^/]+)\/stuck$/);
        if (wfStuckMatch && req.method === 'GET') {
            const sid = decodeURIComponent(wfStuckMatch[1]);
            const result = getWorkflowEngine().checkStuckSteps(sid);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
        }

        // POST /api/workflow/:sid/retry/:stepName — retry a stuck/error step
        const wfRetryMatch = url.match(/^\/api\/workflow\/([^/]+)\/retry\/([^/]+)$/);
        if (wfRetryMatch && req.method === 'POST') {
            const sid = decodeURIComponent(wfRetryMatch[1]);
            const stepName = decodeURIComponent(wfRetryMatch[2]);
            (async () => {
                try {
                    const wfConfig = getWorkflowStore().getConfig(sid);
                    if (!wfConfig) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ success: false, error: 'No workflow config' }));
                    }
                    const state = _stateGetter ? _stateGetter() : {};
                    const ctx = { direction: state.selectedAnswers?.[sid] || {}, profile: state.profileSections?.[sid] || {} };
                    const result = await getWorkflowEngine().retryStep(sid, stepName, wfConfig, ctx);
                    const code = result.success ? 200 : 400;
                    res.writeHead(code, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            })();
            return;
        }

        // POST /api/workflow/:sid/skip/:stepName — skip a step
        const wfSkipMatch = url.match(/^\/api\/workflow\/([^/]+)\/skip\/([^/]+)$/);
        if (wfSkipMatch && req.method === 'POST') {
            const sid = decodeURIComponent(wfSkipMatch[1]);
            const stepName = decodeURIComponent(wfSkipMatch[2]);
            const result = getWorkflowEngine().skipStep(sid, stepName);
            const code = result.success ? 200 : 400;
            res.writeHead(code, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
        }

        // ─── Stale Selector API ───

        // GET /api/workflow/:sid/stale-selectors — get all stale selector hints
        const staleGetMatch = url.match(/^\/api\/workflow\/([^/]+)\/stale-selectors$/);
        if (staleGetMatch && req.method === 'GET') {
            const hints = getPlatformService().getStaleSelectorHints();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ hints }));
        }

        // POST /api/workflow/:sid/stale-selectors/clear — clear a stale selector hint
        const staleClearMatch = url.match(/^\/api\/workflow\/([^/]+)\/stale-selectors\/clear$/);
        if (staleClearMatch && req.method === 'POST') {
            _readBody(req, (body) => {
                if (body.pattern) {
                    getPlatformService().clearStaleSelectorHint(body.pattern);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            });
            return;
        }

        // ─── Alert & Notification API routes ───

        // GET /api/workflow/:sid/alerts/config — get alert configuration
        const alertCfgGetMatch = url.match(/^\/api\/workflow\/([^/]+)\/alerts\/config$/);
        if (alertCfgGetMatch && req.method === 'GET') {
            const sid = decodeURIComponent(alertCfgGetMatch[1]);
            const config = getAlertService().getAlertConfig(sid);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(config));
        }

        // PUT /api/workflow/:sid/alerts/config — update alert configuration
        const alertCfgPutMatch = url.match(/^\/api\/workflow\/([^/]+)\/alerts\/config$/);
        if (alertCfgPutMatch && req.method === 'PUT') {
            const sid = decodeURIComponent(alertCfgPutMatch[1]);
            _readBody(req, (body) => {
                const updated = getAlertService().updateAlertConfig(sid, body);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, config: updated }));
            });
            return;
        }

        // GET /api/workflow/:sid/alerts/history — get alert history
        const alertHistMatch = url.match(/^\/api\/workflow\/([^/]+)\/alerts\/history$/);
        if (alertHistMatch && req.method === 'GET') {
            const sid = decodeURIComponent(alertHistMatch[1]);
            const history = getAlertService().getAlertHistory(sid);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(history));
        }

        // POST /api/workflow/:sid/alerts/test — send test alert
        const alertTestMatch = url.match(/^\/api\/workflow\/([^/]+)\/alerts\/test$/);
        if (alertTestMatch && req.method === 'POST') {
            const sid = decodeURIComponent(alertTestMatch[1]);
            const result = getAlertService().dispatch(sid, {
                type: 'info',
                title: 'Test Alert',
                message: 'This is a test notification from the alert system.'
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, ...result }));
        }

        // POST /api/workflow/:sid/alerts/check — trigger stuck check + alert dispatch
        const alertCheckMatch = url.match(/^\/api\/workflow\/([^/]+)\/alerts\/check$/);
        if (alertCheckMatch && req.method === 'POST') {
            const sid = decodeURIComponent(alertCheckMatch[1]);
            const result = getAlertService().checkAndAlert(sid, getWorkflowEngine());
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
        }

        // DELETE /api/workflow/:sid/alerts/history — clear alert history
        const alertHistClearMatch = url.match(/^\/api\/workflow\/([^/]+)\/alerts\/history$/);
        if (alertHistClearMatch && req.method === 'DELETE') {
            const sid = decodeURIComponent(alertHistClearMatch[1]);
            getAlertService().clearAlertHistory(sid);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true }));
        }

        // ─── Schedule Engine API routes ───

        // GET /api/workflow/:sid/schedule — get schedule
        const schedGetMatch = url.match(/^\/api\/workflow\/([^/]+)\/schedule$/);
        if (schedGetMatch && req.method === 'GET') {
            const sid = decodeURIComponent(schedGetMatch[1]);
            const sched = getScheduleEngine().getSchedule(sid);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(sched || { enabled: false }));
        }

        // POST /api/workflow/:sid/schedule — create/update schedule
        const schedPostMatch = url.match(/^\/api\/workflow\/([^/]+)\/schedule$/);
        if (schedPostMatch && req.method === 'POST') {
            const sid = decodeURIComponent(schedPostMatch[1]);
            _readBody(req, (body) => {
                const state = _stateGetter ? _stateGetter() : {};
                const getContext = () => ({
                    direction: state.selectedAnswers?.[sid] || {},
                    profile: state.profileSections?.[sid] || {}
                });
                const result = getScheduleEngine().createSchedule(sid, { ...body, getContext });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            });
            return;
        }

        // POST /api/workflow/:sid/schedule/pause — pause schedule
        const schedPauseMatch = url.match(/^\/api\/workflow\/([^/]+)\/schedule\/pause$/);
        if (schedPauseMatch && req.method === 'POST') {
            const sid = decodeURIComponent(schedPauseMatch[1]);
            const result = getScheduleEngine().pauseSchedule(sid);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
        }

        // DELETE /api/workflow/:sid/schedule — stop schedule
        const schedDeleteMatch = url.match(/^\/api\/workflow\/([^/]+)\/schedule$/);
        if (schedDeleteMatch && req.method === 'DELETE') {
            const sid = decodeURIComponent(schedDeleteMatch[1]);
            const result = getScheduleEngine().stopSchedule(sid);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
        }

        // ─── Platform CRUD API routes ───

        // GET /api/platforms/:sid — get all platforms (auto-init with presets)
        const platListMatch = url.match(/^\/api\/platforms\/([^/]+)$/);
        if (platListMatch && req.method === 'GET') {
            const sid = decodeURIComponent(platListMatch[1]);
            const pStore = getPlatformStore();
            let platforms = pStore.getPlatforms(sid);
            if (platforms.length === 0) {
                const state = _stateGetter ? _stateGetter() : {};
                const location = state.selectedAnswers?.[sid]?.q_location || '';
                platforms = pStore.initWithPresets(sid, location);
            }
            // Ensure workflow grid is synced when platforms exist
            const wfMap = _getPlatformStatuses(sid);
            if (wfMap.size === 0 && platforms.length > 0) {
                for (const plat of platforms) {
                    updatePlatformCell(sid, plat.id, {
                        name: plat.name, icon: plat.icon, url: plat.url
                    });
                }
                console.log(`[dashboard] Synced ${platforms.length} platforms to workflow grid for ${sid}`);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(platforms));
        }

        // POST /api/platforms/:sid — add platform (201 on success)
        const platAddMatch = url.match(/^\/api\/platforms\/([^/]+)$/);
        if (platAddMatch && req.method === 'POST') {
            const sid = decodeURIComponent(platAddMatch[1]);
            _readBody(req, (body) => {
                try {
                    const result = getPlatformStore().addPlatform(sid, body);
                    if (result.success && result.platform) {
                        updatePlatformCell(sid, result.platform.id, {
                            name: result.platform.name,
                            icon: result.platform.icon,
                            url: result.platform.url
                        });
                    }
                    const code = result.success ? 201 : 400;
                    res.writeHead(code, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        }

        // DELETE /api/platforms/:sid/:pid — remove platform
        const platDeleteMatch = url.match(/^\/api\/platforms\/([^/]+)\/([^/]+)$/);
        if (platDeleteMatch && req.method === 'DELETE') {
            const sid = decodeURIComponent(platDeleteMatch[1]);
            const pid = decodeURIComponent(platDeleteMatch[2]);
            const result = getPlatformStore().removePlatform(sid, pid);
            if (result.success) {
                removePlatformStatus(sid, pid);
                _broadcastSSE(sid, 'platformUpdate', { removed: pid });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
        }

        // ─── Platform Login API routes ───

        // POST /api/platforms/:sid/:pid/login — launch login
        const platLoginMatch = url.match(/^\/api\/platforms\/([^/]+)\/([^/]+)\/login$/);
        if (platLoginMatch && req.method === 'POST') {
            const sid = decodeURIComponent(platLoginMatch[1]);
            const pid = decodeURIComponent(platLoginMatch[2]);
            // Check platform exists first
            const platForLogin = getPlatformStore().getPlatform(sid, pid);
            if (!platForLogin) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, error: 'Platform not found' }));
            }
            _readBody(req, async (body) => {
                try {
                    // Inject session-bound envId if not provided in request body
                    if (!body.sessionEnvId) {
                        const state = _stateGetter ? _stateGetter() : {};
                        const runtimeCtx = state.runtimeContexts?.[sid] || {};
                        // Try envIds first, then fall back to extracting IDs from envs array
                        let boundEnvIds = Array.isArray(runtimeCtx.envIds) ? runtimeCtx.envIds.filter(Boolean) : [];
                        if (boundEnvIds.length === 0 && Array.isArray(runtimeCtx.envs)) {
                            boundEnvIds = runtimeCtx.envs.map(e => e.id || e._id || e.name).filter(Boolean);
                        }
                        console.log(`[dashboard:login] sid=${sid} pid=${pid} envIds=${JSON.stringify(boundEnvIds)} keys=${Object.keys(runtimeCtx).join(',')}`);
                        if (boundEnvIds.length > 0) {
                            body.sessionEnvId = boundEnvIds[0];
                        }
                    }
                    console.log(`[dashboard:login] sessionEnvId=${body.sessionEnvId || 'NONE'} → calling launchLogin`);
                    // Set launching state before async browser launch
                    updatePlatformCell(sid, pid, { cell: 'login', status: 'running', message: 'Launching browser...' });
                    const result = await getPlatformService().launchLogin(sid, pid, body);
                    if (result.method === 'url') {
                        // No fingerprint env — URL opened in plain browser; reset cell
                        updatePlatformCell(sid, pid, { cell: 'login', status: 'idle', message: '' });
                    } else if (!result.success) {
                        // On failure: update cell to error so SSE notifies frontend.
                        updatePlatformCell(sid, pid, { cell: 'login', status: 'error', message: result.error || 'Login failed' });
                    }
                    // On fingerprint success: platformService._syncToDashboard() already broadcast
                    // SSE 'platformUpdate' with status='verifying' after browser opened.
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    updatePlatformCell(sid, pid, { cell: 'login', status: 'error', message: e.message });
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        }

        // POST /api/platforms/:sid/:pid/verify-login — verify login status
        const platVerifyMatch = url.match(/^\/api\/platforms\/([^/]+)\/([^/]+)\/verify-login$/);
        if (platVerifyMatch && req.method === 'POST') {
            const sid = decodeURIComponent(platVerifyMatch[1]);
            const pid = decodeURIComponent(platVerifyMatch[2]);
            (async () => {
                try {
                    const result = await getPlatformService().verifyLogin(sid, pid);
                    if (result.status === 'logged_in') {
                        updatePlatformCell(sid, pid, { cell: 'login', status: 'verified', message: result.message });
                    } else if (result.status === 'not_logged_in') {
                        updatePlatformCell(sid, pid, { cell: 'login', status: 'error', message: result.message });
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            })();
            return;
        }

        // POST /api/platforms/:sid/:pid/confirm-login — manual confirm login
        const platConfirmMatch = url.match(/^\/api\/platforms\/([^/]+)\/([^/]+)\/confirm-login$/);
        if (platConfirmMatch && req.method === 'POST') {
            const sid = decodeURIComponent(platConfirmMatch[1]);
            const pid = decodeURIComponent(platConfirmMatch[2]);
            const result = getPlatformService().confirmLogin(sid, pid);
            if (result.success) {
                updatePlatformCell(sid, pid, { cell: 'login', status: 'verified', message: 'Login confirmed manually' });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
        }

        // POST /api/platforms/:sid/:pid/bind-env — bind fingerprint env
        const platBindEnvMatch = url.match(/^\/api\/platforms\/([^/]+)\/([^/]+)\/bind-env$/);
        if (platBindEnvMatch && req.method === 'POST') {
            const sid = decodeURIComponent(platBindEnvMatch[1]);
            const pid = decodeURIComponent(platBindEnvMatch[2]);
            _readBody(req, (body) => {
                const result = getPlatformService().bindEnv(sid, pid, body.envId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            });
            return;
        }

        // ─── Script Builder API routes ───

        // GET /api/platforms/:sid/:pid/tools/:toolType/build-log — get tool build status/log
        const toolBuildLogMatch = url.match(/^\/api\/platforms\/([^/]+)\/([^/]+)\/tools\/(search|apply)\/build-log$/);
        if (toolBuildLogMatch && req.method === 'GET') {
            const sid = decodeURIComponent(toolBuildLogMatch[1]);
            const pid = decodeURIComponent(toolBuildLogMatch[2]);
            const toolType = toolBuildLogMatch[3];
            const plat = getPlatformStore().getPlatform(sid, pid);
            if (!plat) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Platform not found' }));
            }
            const tool = plat.tools[toolType];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                status: tool.status,
                version: tool.version,
                buildLog: tool.buildLog || []
            }));
        }

        // POST /api/platforms/:sid/:pid/tools/search/build — build search tool
        const toolBuildSearchMatch = url.match(/^\/api\/platforms\/([^/]+)\/([^/]+)\/tools\/search\/build$/);
        if (toolBuildSearchMatch && req.method === 'POST') {
            const sid = decodeURIComponent(toolBuildSearchMatch[1]);
            const pid = decodeURIComponent(toolBuildSearchMatch[2]);
            _readBody(req, async (body) => {
                try {
                    // Create aiInvoke from state.currentProvider if not provided
                    const state = _stateGetter ? _stateGetter() : {};
                    if (!state.currentProvider) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ success: false, error: 'No AI provider configured. Set an AI provider first.' }));
                    }
                    const aiInvoke = _createAiInvoke(state);
                    body.aiInvoke = aiInvoke;

                    // Inject testParams from user's direction for realistic verify
                    if (!body.testParams) {
                        const answers = (state.selectedAnswers || {})[sid] || {};
                        body.testParams = {
                            keywords: answers.q_job_title || 'software engineer',
                            location: answers.q_location || ''
                        };
                    }

                    // Pre-flight: ensure browser is alive & logged in
                    const plat = getPlatformStore().getPlatform(sid, pid);
                    if (plat && plat._browserId) {
                        const loginCheck = await getPlatformService().verifyLogin(sid, pid);
                        if (loginCheck.status === 'not_logged_in') {
                            updatePlatformCell(sid, pid, { cell: 'login', status: 'error', message: 'Session expired — please re-login' });
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            return res.end(JSON.stringify({ success: false, error: 'Login session expired. Please re-login first.' }));
                        }
                    }

                    updatePlatformCell(sid, pid, { cell: 'search', status: 'building', message: 'Building search tool...' });
                    const result = await getScriptBuilder().buildTool(sid, pid, 'search', body);
                    if (result.success) {
                        const plat = getPlatformStore().getPlatform(sid, pid);
                        updatePlatformCell(sid, pid, {
                            cell: 'search', status: 'ready',
                            version: plat?.tools?.search?.version || 1,
                            jdVerified: plat?.tools?.search?.jdVerified || false,
                            message: 'Search tool ready'
                        });
                    } else {
                        updatePlatformCell(sid, pid, { cell: 'search', status: 'error', message: result.error });
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    updatePlatformCell(sid, pid, { cell: 'search', status: 'error', message: e.message });
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        }

        // POST /api/platforms/:sid/:pid/tools/apply/build — build apply tool
        const toolBuildApplyMatch = url.match(/^\/api\/platforms\/([^/]+)\/([^/]+)\/tools\/apply\/build$/);
        if (toolBuildApplyMatch && req.method === 'POST') {
            const sid = decodeURIComponent(toolBuildApplyMatch[1]);
            const pid = decodeURIComponent(toolBuildApplyMatch[2]);
            _readBody(req, async (body) => {
                try {
                    const applyState = _stateGetter ? _stateGetter() : {};
                    if (!applyState.currentProvider) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ success: false, error: 'No AI provider configured.' }));
                    }
                    body.aiInvoke = _createAiInvoke(applyState);
                    updatePlatformCell(sid, pid, { cell: 'apply', status: 'building', message: 'Building apply tool...' });
                    const result = await getScriptBuilder().buildTool(sid, pid, 'apply', body);
                    if (result.success) {
                        const plat = getPlatformStore().getPlatform(sid, pid);
                        updatePlatformCell(sid, pid, {
                            cell: 'apply', status: 'ready',
                            version: plat?.tools?.apply?.version || 1,
                            message: 'Apply tool ready'
                        });
                    } else {
                        updatePlatformCell(sid, pid, { cell: 'apply', status: 'error', message: result.error });
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    updatePlatformCell(sid, pid, { cell: 'apply', status: 'error', message: e.message });
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        }

        // POST /api/platforms/:sid/:pid/tools/search/execute — execute search tool (with auto-heal)
        const toolExecSearchMatch = url.match(/^\/api\/platforms\/([^/]+)\/([^/]+)\/tools\/search\/execute$/);
        if (toolExecSearchMatch && req.method === 'POST') {
            const sid = decodeURIComponent(toolExecSearchMatch[1]);
            const pid = decodeURIComponent(toolExecSearchMatch[2]);
            _readBody(req, async (body) => {
                try {
                    updatePlatformCell(sid, pid, { cell: 'search', status: 'running', message: 'Executing search...' });
                    const result = await getScriptBuilder().executeSearchScript(sid, pid, body, body.options || {});
                    if (result.success) {
                        updatePlatformCell(sid, pid, { cell: 'search', status: 'ready', message: `Found ${(result.jobs || []).length} jobs` });
                    } else if (body.autoHeal !== false) {
                        // Auto-heal: script failed, try to fix it
                        updatePlatformCell(sid, pid, { cell: 'search', status: 'building', message: 'Auto-healing script...' });
                        try {
                            const healResult = await getScriptBuilder().healScript(sid, pid, 'search', { error: result.error }, body);
                            if (healResult.success) {
                                // Re-execute after healing
                                const retryResult = await getScriptBuilder().executeSearchScript(sid, pid, body, body.options || {});
                                updatePlatformCell(sid, pid, {
                                    cell: 'search',
                                    status: retryResult.success ? 'ready' : 'error',
                                    message: retryResult.success ? `Found ${(retryResult.jobs || []).length} jobs (healed)` : retryResult.error
                                });
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                return res.end(JSON.stringify({ ...retryResult, healed: true }));
                            }
                        } catch (_) { /* heal failed, fall through */ }
                        updatePlatformCell(sid, pid, { cell: 'search', status: 'error', message: result.error });
                    } else {
                        updatePlatformCell(sid, pid, { cell: 'search', status: 'error', message: result.error });
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    updatePlatformCell(sid, pid, { cell: 'search', status: 'error', message: e.message });
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        }

        // POST /api/platforms/:sid/:pid/tools/search/heal — heal broken search script
        const toolHealSearchMatch = url.match(/^\/api\/platforms\/([^/]+)\/([^/]+)\/tools\/search\/heal$/);
        if (toolHealSearchMatch && req.method === 'POST') {
            const sid = decodeURIComponent(toolHealSearchMatch[1]);
            const pid = decodeURIComponent(toolHealSearchMatch[2]);
            _readBody(req, async (body) => {
                try {
                    const result = await getScriptBuilder().healScript(sid, pid, 'search', body, body);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
            return;
        }

        // ─── Job Query API routes (GET with filter/pagination) ───

        // GET /api/jobs/:sid — query jobs with optional filter/pagination
        const jobsGetMatch = url.match(/^\/api\/jobs\/([^/]+)$/);
        if (jobsGetMatch && req.method === 'GET') {
            const sid = decodeURIComponent(jobsGetMatch[1]);
            const query = new URL(req.url, `http://127.0.0.1:${_port}`).searchParams;
            let jobs = getJobCards(sid);

            // Filter by status
            const statusFilter = query.get('status');
            if (statusFilter) {
                jobs = jobs.filter(j => j.status === statusFilter);
            }

            // Filter by min score
            const minScore = query.get('minScore');
            if (minScore) {
                const min = parseInt(minScore, 10);
                jobs = jobs.filter(j => (j.matchScore || 0) >= min);
            }

            const total = jobs.length;

            // Pagination (pageSize default 20)
            const page = parseInt(query.get('page') || '1', 10);
            const pageSize = parseInt(query.get('pageSize') || query.get('limit') || '20', 10);
            const totalPages = Math.ceil(total / pageSize) || 1;
            const start = (page - 1) * pageSize;
            jobs = jobs.slice(start, start + pageSize);

            // Stats
            const stats = getJobStats(sid);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ jobs, total, page, pageSize, totalPages, stats }));
        }

        // POST /shutdown — allow new process to take over the port
        if (url === '/shutdown' && req.method === 'POST') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, instanceId: _instanceId }));
            // Close server after response is sent
            setTimeout(() => {
                if (_server) {
                    console.log('[dashboardServer] Shutting down for port takeover');
                    const s = _server;
                    _server = null;
                    s.close();
                }
            }, 100);
            return;
        }

        // GET /api/events/:sid — SSE stream for live updates
        const sseMatch = url.match(/^\/api\/events\/([^/]+)$/);
        if (sseMatch && req.method === 'GET') {
            const sid = decodeURIComponent(sseMatch[1]);
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            });
            res.write('event: connected\ndata: {"ok":true}\n\n');
            _addSSEClient(sid, res);
            // Keep alive every 30s
            const keepAlive = setInterval(() => {
                try { res.write(':keepalive\n\n'); } catch (_) { clearInterval(keepAlive); }
            }, 30000);
            res.on('close', () => clearInterval(keepAlive));
            return;
        }

        // ─── Profile & User Management API routes ───

        // GET /api/profile/template — empty profile template with all section keys
        if (url === '/api/profile/template' && req.method === 'GET') {
            const masterProfileClient = require('./core/masterProfileClient');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(masterProfileClient.getEmptyTemplate()));
        }

        // GET /api/profile/master — all master sections for active user
        if (url === '/api/profile/master' && req.method === 'GET') {
            const state = _stateGetter ? _stateGetter() : {};
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(state.masterProfile || {}));
        }

        // PUT /api/profile/master/:section — update a master section
        const masterSectionMatch = url.match(/^\/api\/profile\/master\/([^/]+)$/);
        if (masterSectionMatch && req.method === 'PUT') {
            const section = decodeURIComponent(masterSectionMatch[1]);
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const { content } = JSON.parse(body);
                    const state = _stateGetter ? _stateGetter() : {};
                    const userId = state.activeUserId;
                    if (!userId) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ error: 'No active user' }));
                    }
                    if (!state.masterProfile) state.masterProfile = {};
                    state.masterProfile[section] = content || '';
                    const masterProfileClient = require('./core/masterProfileClient');
                    await masterProfileClient.saveMasterSection(userId, section, content || '');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, section, content }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        // GET /api/profile/:sessionId/tailored — session-tailored profile
        const tailoredMatch = url.match(/^\/api\/profile\/([^/]+)\/tailored$/);
        if (tailoredMatch && req.method === 'GET') {
            const sid = decodeURIComponent(tailoredMatch[1]);
            const state = _stateGetter ? _stateGetter() : {};
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(state.profileSections?.[sid] || {}));
        }

        // GET /api/profile/:sessionId/comparison — master vs tailored diff
        const comparisonMatch = url.match(/^\/api\/profile\/([^/]+)\/comparison$/);
        if (comparisonMatch && req.method === 'GET') {
            const sid = decodeURIComponent(comparisonMatch[1]);
            const state = _stateGetter ? _stateGetter() : {};
            const master = state.masterProfile || {};
            const tailored = state.profileSections?.[sid] || {};
            const diff = {};
            const allKeys = new Set([...Object.keys(master), ...Object.keys(tailored)]);
            for (const key of allKeys) {
                diff[key] = {
                    master: master[key] || '',
                    tailored: tailored[key] || '',
                    changed: (master[key] || '') !== (tailored[key] || '')
                };
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ master, tailored, diff }));
        }

        // GET /api/users — list all users
        if (url === '/api/users' && req.method === 'GET') {
            const userStore = require('./core/userStore');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ users: userStore.listUsers(), activeUserId: userStore.getActiveUserId() }));
        }

        // POST /api/users — create new user { name }
        if (url === '/api/users' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const { name } = JSON.parse(body);
                    const userStore = require('./core/userStore');
                    const user = userStore.createUser(name);
                    res.writeHead(201, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, user }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        // PUT /api/users/active — switch active user { userId }
        if (url === '/api/users/active' && req.method === 'PUT') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const { userId } = JSON.parse(body);
                    const userStore = require('./core/userStore');
                    const switched = userStore.switchUser(userId);
                    if (!switched) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ error: 'User not found' }));
                    }
                    // Reload master profile for new user
                    const state = _stateGetter ? _stateGetter() : {};
                    state.activeUserId = userId;
                    const masterProfileClient = require('./core/masterProfileClient');
                    state.masterProfile = await masterProfileClient.loadMaster(userId);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, activeUserId: userId, masterProfile: state.masterProfile }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        // GET /api/users/active — get current active user + master profile summary
        if (url === '/api/users/active' && req.method === 'GET') {
            const userStore = require('./core/userStore');
            const user = userStore.getActiveUser();
            const state = _stateGetter ? _stateGetter() : {};
            const master = state.masterProfile || {};
            const sectionCount = Object.values(master).filter(v => v && v.trim()).length;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ user, masterProfileSections: sectionCount }));
        }

        // GET /ping — health check with instance identification
        if (url === '/ping' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: true, instanceId: _instanceId }));
        }

        // GET /debug — dump state diagnostics
        if (url === '/debug' && req.method === 'GET') {
            const state = _stateGetter ? _stateGetter() : null;
            const info = {
                hasStateGetter: Boolean(_stateGetter),
                hasState: Boolean(state),
                activeSessionId: state?.activeSessionId || '',
                sessions: (state?.sessions || []).map(s => ({ id: s.id, name: s.name })),
                selectedAnswersKeys: state?.selectedAnswers ? Object.keys(state.selectedAnswers) : [],
                profileSectionsKeys: state?.profileSections ? Object.keys(state.profileSections) : [],
                sampleAnswers: null
            };
            if (state?.activeSessionId && state?.selectedAnswers?.[state.activeSessionId]) {
                info.sampleAnswers = state.selectedAnswers[state.activeSessionId];
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(info, null, 2));
        }

        // GET /dashboard/:sessionId — return HTML page
        const pageMatch = url.match(/^\/dashboard\/(.+)$/);
        if (pageMatch && req.method === 'GET') {
            const sessionId = decodeURIComponent(pageMatch[1]);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(buildDashboardHTML(sessionId));
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    });

    _server.listen(_port, '127.0.0.1', () => {
        console.log(`[dashboardServer] listening on http://127.0.0.1:${_port} (instance: ${_instanceId})`);
        console.log(`[dashboardServer] ★ Dashboard base: http://127.0.0.1:${_port}/dashboard/`);
    });

    _server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`[dashboardServer] Port ${_port} in use — attempting takeover of stale server...`);
            _server = null;
            _takeOverPort(_port, getState);
        } else {
            console.error('[dashboardServer] server error:', err.message);
            _server = null;
        }
    });

    return _port;
}

/**
 * Attempt to take over the port from a stale dashboard server process.
 * Sends POST /shutdown to the old server, waits, then retries start.
 */
function _takeOverPort(port, getState) {
    const shutdownReq = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/shutdown',
        method: 'POST',
        timeout: 3000
    }, (res) => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
            console.log(`[dashboardServer] Old server responded to shutdown: ${body}`);
            // Wait for old server to close, then retry
            setTimeout(() => {
                _server = null;
                start(getState, port);
            }, 500);
        });
    });
    shutdownReq.on('error', (e) => {
        // Old server didn't respond — it's a zombie or different service
        console.error(`[dashboardServer] Shutdown request failed: ${e.message}. Port ${port} is occupied by another process.`);
        console.error('[dashboardServer] Please kill the process using port ' + port + ' and restart.');
    });
    shutdownReq.on('timeout', () => {
        shutdownReq.destroy();
        console.error(`[dashboardServer] Shutdown request timed out. Port ${port} is occupied.`);
    });
    shutdownReq.end();
}

function stop() {
    return new Promise((resolve) => {
        if (_server) {
            const s = _server;
            _server = null;
            s.close(() => resolve());
        } else {
            resolve();
        }
    });
}

/**
 * Read JSON body from request.
 * @param {http.IncomingMessage} req
 * @param {Function} cb - callback(parsedBody)
 */
// ─── SSE (Server-Sent Events) Live Push ───
const _sseClients = new Map(); // sessionId → Set<res>

function _addSSEClient(sessionId, res) {
    if (!_sseClients.has(sessionId)) _sseClients.set(sessionId, new Set());
    _sseClients.get(sessionId).add(res);
    res.on('close', () => {
        const set = _sseClients.get(sessionId);
        if (set) { set.delete(res); if (set.size === 0) _sseClients.delete(sessionId); }
    });
}

function _broadcastSSE(sessionId, event, data) {
    const clients = _sseClients.get(sessionId);
    if (!clients || clients.size === 0) return;
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
        try { client.write(msg); } catch (_) { /* client gone */ }
    }
}

function _readBody(req, cb, onError) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
        try { cb(JSON.parse(body || '{}')); }
        catch (e) {
            if (onError) onError(e);
            else cb({});
        }
    });
}

// ─── Platform workflow status ───
// Keyed by sessionId → Map<platformId, PlatformStatus>
const _platformStatus = new Map();
const LOGIN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Get or create platform status map for a session.
 * @param {string} sessionId
 * @returns {Map}
 */
function _getPlatformStatuses(sessionId) {
    if (!_platformStatus.has(sessionId)) {
        _platformStatus.set(sessionId, new Map());
    }
    const map = _platformStatus.get(sessionId);
    // Auto-sync missing platforms from platformStore
    // (happens when agent process restarts or dashboard server restarts)
    try {
        const store = getPlatformStore();
        let platforms = store.getPlatforms(sessionId);
        // If store is also empty, auto-init from presets using session location
        if ((!platforms || platforms.length === 0) && _stateGetter) {
            const st = _stateGetter();
            const location = st.selectedAnswers?.[sessionId]?.q_location || '';
            if (location) {
                platforms = store.initWithPresets(sessionId, location);
            }
        }
        if (platforms && platforms.length > 0) {
            let added = 0;
            for (const plat of platforms) {
                if (!map.has(plat.id)) {
                    const searchStatus = (plat.tools && plat.tools.search && plat.tools.search.status === 'ready') ? 'ready' : 'idle';
                    map.set(plat.id, {
                        name: plat.name || plat.id,
                        icon: plat.icon || '🔗',
                        url: plat.url || '',
                        login: { status: 'idle' },
                        search: { status: searchStatus },
                        apply: { status: 'idle' }
                    });
                    added++;
                }
            }
            if (added > 0) {
                console.log(`[dashboard] Auto-synced ${added} missing platforms from store for session ${sessionId}`);
            }
        }
    } catch (e) {
        console.error('[dashboard] Auto-sync platforms failed:', e.message);
    }
    return map;
}

/**
 * Clear all platform statuses for a session (used on restart/rebuild).
 */
function clearPlatformStatuses(sessionId) {
    _platformStatus.delete(sessionId);
}

/**
 * Remove a single platform from the status map.
 */
function removePlatformStatus(sessionId, platformId) {
    const statuses = _getPlatformStatuses(sessionId);
    statuses.delete(platformId);
}

/**
 * Compute visual state for a single cell.
 * @param {'login'|'search'|'apply'} cellType
 * @param {object} platform - platform status object
 * @returns {{ visual: string, tip: string, action: string|null }}
 */
function computeCellVisual(cellType, platform) {
    if (cellType === 'login') {
        const l = platform.login || {};
        if (l.status === 'running') return { visual: 'launching', tip: 'Launching browser...', action: null };
        if (l.status === 'verifying') return { visual: 'verifying', tip: 'Browser opened — log in then click Confirm', action: 'confirm' };
        if (l.status === 'error') return { visual: 'error', tip: `Login failed: ${l.message || 'Unknown error'}`, action: 'relogin' };
        if (l.status === 'verified') {
            const age = Date.now() - (l.verifiedAt || 0);
            if (age < LOGIN_TTL_MS) return { visual: 'ready', tip: 'Logged in ✓', action: null };
            return { visual: 'warning', tip: 'Session may have expired. Re-verify recommended.', action: 'relogin' };
        }
        return { visual: 'idle', tip: 'Not logged in yet', action: 'login' };
    }

    if (cellType === 'search' || cellType === 'apply') {
        const tool = platform[cellType] || {};
        // Apply is locked if search not ready
        if (cellType === 'apply') {
            const searchStatus = (platform.search || {}).status;
            if (searchStatus !== 'ready') return { visual: 'locked', tip: '🔒 Build search tool first', action: null };
        }
        if (tool.status === 'building') return { visual: 'building', tip: `Building ${cellType} tool...`, action: null };
        if (tool.status === 'error') {
            const msg = tool.message || 'Unknown';
            const tip = msg.startsWith('Search failed:') ? msg : `Build failed: ${msg}`;
            return { visual: 'error', tip, action: 'rebuild' };
        }
        if (tool.status === 'ready') {
            // Check if login expired → warning
            const l = platform.login || {};
            if (l.status === 'verified' && (Date.now() - (l.verifiedAt || 0)) >= LOGIN_TTL_MS) {
                return { visual: 'warning', tip: `${cellType} tool ready (v${tool.version || 1}) but session may have expired. Re-login first.`, action: 'relogin' };
            }
            const jdTag = cellType === 'search'
                ? (tool.jdVerified ? ' ✓JD' : ' ⚠JD-fallback')
                : '';
            return { visual: 'ready', tip: `${cellType} tool ready (v${tool.version || 1})${jdTag}`, action: 'rebuild' };
        }
        return { visual: 'idle', tip: `${cellType} tool not built`, action: 'build' };
    }

    return { visual: 'idle', tip: '', action: null };
}

/**
 * Get computed workflow status for all platforms in a session.
 * @param {string} sessionId
 * @returns {Array}
 */
function getWorkflowStatus(sessionId) {
    const statuses = _getPlatformStatuses(sessionId);
    const platforms = [];
    for (const [id, p] of statuses) {
        platforms.push({
            id,
            name: p.name || id,
            icon: p.icon || '🔗',
            url: p.url || '',
            cells: {
                login: computeCellVisual('login', p),
                search: computeCellVisual('search', p),
                apply: computeCellVisual('apply', p)
            }
        });
    }
    return platforms;
}

/**
 * Update a specific cell status for a platform.
 * @param {string} sessionId
 * @param {string} platformId
 * @param {object} update - { cell, status, message, envId, version, name, icon, url }
 */
function updatePlatformCell(sessionId, platformId, update) {
    const statuses = _getPlatformStatuses(sessionId);
    if (!statuses.has(platformId)) {
        statuses.set(platformId, {
            name: update.name || platformId,
            icon: update.icon || '🔗',
            url: update.url || '',
            login: { status: 'idle' },
            search: { status: 'idle' },
            apply: { status: 'idle' }
        });
    }
    const p = statuses.get(platformId);
    if (update.name) p.name = update.name;
    if (update.icon) p.icon = update.icon;
    if (update.url) p.url = update.url;

    const cell = update.cell; // 'login' | 'search' | 'apply'
    if (cell && p[cell]) {
        p[cell].status = update.status || p[cell].status;
        if (update.message !== undefined) p[cell].message = update.message;
        if (cell === 'login' && update.status === 'verified') {
            p[cell].verifiedAt = Date.now();
            if (update.envId) p[cell].envId = update.envId;
            // Persist login to disk — cookies saved in fingerprint browser
            if (p.url) {
                const pStore = getPlatformStore();
                const plat = pStore.getPlatforms(sessionId).find(x => x.id === platformId);
                const envId = update.envId || plat?.envId || '';
                pStore.saveLoginStatus(p.url, envId);
            }
        }
        if (cell === 'login' && update.status === 'error' && /expired/i.test(update.message || '')) {
            // Clear persisted login — session expired, user needs to re-login
            if (p.url) getPlatformStore().clearLoginStatus(p.url);
        }
        if ((cell === 'search' || cell === 'apply') && update.version !== undefined) {
            p[cell].version = update.version;
        }
        if (update.jdVerified !== undefined) {
            p[cell].jdVerified = update.jdVerified;
        }
    }
    // Broadcast SSE update
    _broadcastSSE(sessionId, 'platformUpdate', { platformId, ...update });
}

// ─── Job workflow state ───
// Jobs tracked per session: sessionId → Map<jobUrl, JobWorkflowCard>
const _jobCards = new Map();

/**
 * Get or create job cards map for a session.
 * @param {string} sessionId
 * @returns {Map}
 */
function _getJobCards(sessionId) {
    if (!_jobCards.has(sessionId)) {
        _jobCards.set(sessionId, new Map());
    }
    return _jobCards.get(sessionId);
}

/**
 * Add or update a job workflow card.
 * @param {string} sessionId
 * @param {object} job - { url, title, company, location, salary, matchScore, status, artifacts }
 */
function upsertJobCard(sessionId, job) {
    if (!job || !job.url) return;
    const cards = _getJobCards(sessionId);
    const existing = cards.get(job.url) || {};
    cards.set(job.url, {
        url: job.url,
        title: job.title || existing.title || '',
        company: job.company || existing.company || '',
        location: job.location || existing.location || '',
        salary: job.salary || existing.salary || '',
        platform: job.platform || existing.platform || '',
        matchScore: job.matchScore ?? existing.matchScore ?? null,
        status: job.status || existing.status || 'discovered',
        artifacts: { ...(existing.artifacts || {}), ...(job.artifacts || {}) },
        matchBreakdown: job.matchBreakdown || existing.matchBreakdown || null,
        fullText: job.fullText || existing.fullText || '',
        updatedAt: new Date().toISOString(),
        createdAt: existing.createdAt || new Date().toISOString()
    });
}

/**
 * Update job card status.
 * @param {string} sessionId
 * @param {string} jobUrl
 * @param {string} status - discovered|fetched|parsed|matched|tailored|reviewed|submitted|followed_up|archived
 */
function updateJobStatus(sessionId, jobUrl, status) {
    const cards = _getJobCards(sessionId);
    const card = cards.get(jobUrl);
    if (card) {
        card.status = status;
        card.updatedAt = new Date().toISOString();
    }
}

/**
 * Get all job cards for a session.
 * @param {string} sessionId
 * @returns {Array<object>}
 */
function getJobCards(sessionId) {
    const cards = _getJobCards(sessionId);
    return Array.from(cards.values()).sort((a, b) => {
        // Sort by matchScore desc, then by updatedAt desc
        if (a.matchScore !== null && b.matchScore !== null) return b.matchScore - a.matchScore;
        if (a.matchScore !== null) return -1;
        if (b.matchScore !== null) return 1;
        return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
}

/**
 * Get job cards count by status.
 * @param {string} sessionId
 * @returns {object}
 */
function getJobStats(sessionId) {
    const cards = getJobCards(sessionId);
    const stats = { total: cards.length };
    for (const card of cards) {
        stats[card.status] = (stats[card.status] || 0) + 1;
    }
    return stats;
}

function getDashboardData(sessionId) {
    const state = _stateGetter ? _stateGetter() : {};
    const answers = state.selectedAnswers?.[sessionId] || {};
    const sections = state.profileSections?.[sessionId] || {};
    const subtasks = state.subtasks?.[sessionId] || [];
    const intent = state.intentFiles?.[sessionId] || {};

    const sectionKeys = Object.keys(sections).filter(k => sections[k]);
    const answerKeys = Object.keys(answers);
    const hasState = Boolean(state.selectedAnswers);
    const knownSessions = hasState ? Object.keys(state.selectedAnswers) : [];
    const sessionMatch = knownSessions.includes(sessionId);

    // Diagnostic logging disabled — too noisy with 5s auto-refresh
    // if (answerKeys.length === 0 && sectionKeys.length === 0) {
    //     console.log(`[dashboard:data] session=${sessionId.slice(0, 12)} | EMPTY`);
    // }

    // Environment binding info
    const runtimeCtx = state.runtimeContexts?.[sessionId] || {};
    let boundEnvIds = Array.isArray(runtimeCtx.envIds) ? runtimeCtx.envIds.filter(Boolean) : [];
    const boundEnvs = Array.isArray(runtimeCtx.envs) ? runtimeCtx.envs : [];
    // Fallback: extract IDs from envs array if envIds is empty
    if (boundEnvIds.length === 0 && boundEnvs.length > 0) {
        boundEnvIds = boundEnvs.map(e => e.id || e._id || e.name).filter(Boolean);
    }
    const envNames = boundEnvs.map(e => e.name || e.id || e._id).filter(Boolean);

    return {
        sessionId,
        direction: {
            jobTitle: answers.q_job_title || '',
            location: answers.q_location || '',
            workMode: answers.q_work_mode || '',
            salary: answers.q_salary || ''
        },
        profile: {
            basic: sections.basic || '',
            skills: sections.skills || '',
            experience: sections.experience || '',
            education: sections.education || '',
            highlights: sections.highlights || ''
        },
        env: {
            bound: boundEnvIds.length > 0,
            envIds: boundEnvIds,
            envNames: envNames
        },
        subtasks: subtasks.map(t => ({ key: t.key, status: t.status })),
        intentVersion: intent?.version || 1,
        jobs: getJobCards(sessionId),
        jobStats: getJobStats(sessionId),
        builtAt: new Date().toISOString()
    };
}

function buildDashboardHTML(sessionId) {
    const encodedSid = encodeURIComponent(sessionId);
    const baseUrl = `http://127.0.0.1:${_port}`;
    const apiUrl = `${baseUrl}/api/dashboard/${encodedSid}`;
    const pipelineBase = `${baseUrl}/api/pipeline/${encodedSid}`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Job Search Dashboard</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1b2e; color: #dfe3ff; padding: 2rem; margin: 0; }
  h1 { color: #8b9aff; border-bottom: 2px solid #2d2f4a; padding-bottom: 0.5rem; }
  h2 { color: #6a7eff; margin-top: 2rem; }
  .env-banner { border-radius: 8px; padding: 0.8rem 1.2rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.75rem; font-size: 0.9rem; }
  .env-banner--ok { background: #1a3a2a; border: 1px solid #2d6b45; color: #7dd3a8; }
  .env-banner--warn { background: #3a2a1a; border: 1px solid #6b5a2d; color: #f0c060; }
  .env-banner__icon { font-size: 1.2rem; flex-shrink: 0; }
  .env-banner__text { flex: 1; }
  .env-banner__names { font-weight: 600; color: #dfe3ff; }
  .meta { color: #7a7fa8; font-size: 0.8rem; margin-top: 0.5rem; }
  .card { background: #242640; border: 1px solid #2d2f4a; border-radius: 8px; padding: 1.2rem; margin-bottom: 1rem; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .item { background: #2d2f4a; border-radius: 6px; padding: 0.75rem; }
  .item label { display: block; color: #9da0c3; font-size: 0.8rem; margin-bottom: 0.25rem; }
  .item .val { font-size: 1.05rem; font-weight: 500; white-space: pre-wrap; }
  .item .val.empty { color: #555; font-style: italic; }
  .item.full-width { grid-column: 1 / -1; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #2d2f4a; }
  th { color: #9da0c3; font-weight: 600; }
  .pipeline { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .pipeline .stage { background: #2d2f4a; border-radius: 6px; padding: 0.5rem 0.75rem; text-align: center; min-width: 80px; }
  .pipeline .stage .count { font-size: 1.4rem; font-weight: 700; color: #8b9aff; }
  .pipeline .stage .label { font-size: 0.7rem; color: #9da0c3; margin-top: 2px; }
  .pipeline .stage.active { border: 1px solid #8b9aff; }
  .badge { display: inline-block; font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 999px; background: rgba(106,126,255,0.2); color: #8b9aff; margin-top: 0.5rem; }
  .refresh-indicator { position: fixed; top: 8px; right: 12px; font-size: 0.7rem; color: #555; }

  .btn { border: none; border-radius: 6px; padding: 0.5rem 1.2rem; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
  .btn-primary { background: #6a7eff; color: #fff; }
  .btn-primary:hover { background: #8b9aff; }
  .btn-danger { background: #ef4444; color: #fff; }
  .btn-danger:hover { background: #f87171; }
  .btn-success { background: #22c55e; color: #fff; }
  .btn-success:hover { background: #4ade80; }
  .btn-warning { background: #f59e0b; color: #fff; }
  .btn-warning:hover { background: #fbbf24; }
  .btn-sm { padding: 0.3rem 0.7rem; font-size: 0.75rem; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Job table */
  .job-table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; }
  .job-table th { color: #9da0c3; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; padding: 0.6rem 0.75rem; border-bottom: 2px solid #2d2f4a; }
  .job-table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid #2d2f4a; vertical-align: middle; }
  .job-table tr:hover { background: rgba(106,126,255,0.05); }
  .job-table .title-cell { max-width: 250px; }
  .job-table .title-cell a { color: #8b9aff; text-decoration: none; font-weight: 600; }
  .job-table .title-cell a:hover { text-decoration: underline; }
  .job-table .title-cell .company { color: #9da0c3; font-size: 0.8rem; display: block; }
  .job-table .score-cell { text-align: center; font-weight: 700; font-size: 1.1rem; }
  .job-table .score-cell.high { color: #4ade80; }
  .job-table .score-cell.mid { color: #fbbf24; }
  .job-table .score-cell.low { color: #f87171; }
  .job-table .actions { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .artifact-badges { display: flex; gap: 4px; margin-top: 3px; }
  .artifact-badge { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 4px; background: #10b981; color: #fff; font-size: 0.65rem; font-weight: 700; cursor: pointer; }
  .artifact-badge:hover { background: #059669; }
  .status-badge { font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 999px; display: inline-block; }
  .status-badge.discovered { background: rgba(106,126,255,0.2); color: #8b9aff; }
  .status-badge.parsed { background: rgba(168,85,247,0.2); color: #a855f7; }
  .status-badge.matched { background: rgba(74,222,128,0.2); color: #4ade80; }
  .status-badge.tailored { background: rgba(251,191,36,0.2); color: #fbbf24; }
  .status-badge.reviewed { background: rgba(96,165,250,0.2); color: #60a5fa; }
  .status-badge.submitted { background: rgba(34,197,94,0.2); color: #22c55e; }
  .status-badge.followed_up { background: rgba(168,85,247,0.2); color: #a855f7; }
  .status-badge.archived { background: rgba(156,163,175,0.2); color: #9ca3af; }

  /* Tabs */
  .tab-bar { display: flex; gap: 0; border-bottom: 2px solid #2d2f4a; margin-bottom: 1rem; }
  .tab-bar .tab { padding: 0.6rem 1.2rem; color: #9da0c3; cursor: pointer; font-weight: 600; border-bottom: 2px solid transparent; margin-bottom: -2px; }
  .tab-bar .tab.active { color: #8b9aff; border-bottom-color: #8b9aff; }
  .tab-bar .tab:hover { color: #dfe3ff; }
  .tab-content { display: none; }
  .tab-content.active { display: block; }

  /* Workflow Status Grid */
  .wf-status-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
  .wf-platform { background: #242640; border: 1px solid #2d2f4a; border-radius: 10px; padding: 1rem; }
  .wf-platform__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; font-weight: 600; font-size: 0.95rem; position: relative; }
  .wf-platform__delete { margin-left: auto; background: none; border: none; color: #9da0c3; font-size: 1.2rem; cursor: pointer; padding: 0 0.3rem; line-height: 1; opacity: 0.5; transition: opacity 0.2s, color 0.2s; }
  .wf-platform__delete:hover { opacity: 1; color: #ff6b6b; }
  .wf-platform__cells { display: flex; flex-direction: column; gap: 0.5rem; }
  .wf-cell { background: #2d2f4a; border-radius: 8px; padding: 0.65rem 0.75rem; position: relative; transition: all 0.3s; }
  .wf-cell__label { font-size: 0.72rem; color: #9da0c3; margin-bottom: 0.2rem; text-transform: uppercase; letter-spacing: 0.5px; }
  .wf-cell__status { font-size: 0.85rem; font-weight: 500; }
  .wf-cell__tip { display: none; position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); background: #1a1b2e; border: 1px solid #3d3f5a; border-radius: 6px; padding: 0.4rem 0.65rem; font-size: 0.72rem; color: #dfe3ff; white-space: nowrap; z-index: 10; pointer-events: none; }
  .wf-cell:hover .wf-cell__tip { display: block; }
  .wf-cell__action { margin-top: 0.35rem; font-size: 0.72rem; cursor: pointer; background: none; border: 1px solid currentColor; border-radius: 4px; padding: 0.15rem 0.45rem; color: inherit; transition: opacity 0.2s; }
  .wf-cell__action:hover { opacity: 0.8; }
  .wf-cell--idle     { outline: 2px solid #4b5563; }
  .wf-cell--ready    { outline: 2px solid #4ade80; }
  .wf-cell--running  { outline: 3px solid #10b981; animation: wf-pulse-green 2s ease-in-out infinite; }
  .wf-cell--building { outline: 3px dashed #8b5cf6; animation: wf-pulse-purple 2s ease-in-out infinite; }
  .wf-cell--warning  { outline: 3px solid #f59e0b; animation: wf-pulse-amber 2s ease-in-out infinite; }
  .wf-cell--error    { outline: 3px solid #ef4444; animation: wf-pulse-red 2s ease-in-out infinite; }
  .wf-cell--launching { outline: 3px solid #6366f1; animation: wf-pulse-indigo 2s ease-in-out infinite; }
  .wf-cell--verifying { outline: 3px solid #10b981; animation: wf-pulse-green 2s ease-in-out infinite; }
  .wf-cell--locked   { outline: 2px solid #374151; opacity: 0.35; }
  @keyframes wf-pulse-green  { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.4)} 50%{box-shadow:0 0 8px 4px rgba(16,185,129,0.15)} }
  @keyframes wf-pulse-red    { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.4)}  50%{box-shadow:0 0 8px 4px rgba(239,68,68,0.15)} }
  @keyframes wf-pulse-purple { 0%,100%{box-shadow:0 0 0 0 rgba(139,92,246,0.4)} 50%{box-shadow:0 0 8px 4px rgba(139,92,246,0.15)} }
  @keyframes wf-pulse-amber  { 0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0.4)} 50%{box-shadow:0 0 8px 4px rgba(245,158,11,0.15)} }
  @keyframes wf-pulse-indigo { 0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0.4)} 50%{box-shadow:0 0 8px 4px rgba(99,102,241,0.15)} }

  /* Login button spinner */
  .wf-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #10b981; border-radius: 50%; animation: wf-spin 0.8s linear infinite; vertical-align: middle; }
  @keyframes wf-spin { to { transform: rotate(360deg); } }
  .wf-btn-loading { opacity: 0.7; cursor: not-allowed; }
  .wf-platform__actions button:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-confirm-active { background: #10b981 !important; color: #fff !important; border-color: #10b981 !important; animation: wf-pulse-confirm 1.5s ease-in-out infinite; }
  @keyframes wf-pulse-confirm { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.5)} 50%{box-shadow:0 0 6px 3px rgba(16,185,129,0.25)} }

  /* Cell status overlays */
  .cell-running { outline: 3px solid #10b981; animation: wf-pulse-green 2s ease-in-out infinite; }
  .cell-stuck { outline: 3px solid #ef4444; animation: wf-pulse-red 2s ease-in-out infinite; background: rgba(239,68,68,0.08); }
  .cell-building { outline: 3px dashed #8b5cf6; animation: wf-pulse-purple 2s ease-in-out infinite; }

  /* Control bar */
  .controlBar { display: flex; gap: 0.75rem; align-items: center; flex-wrap: nowrap; padding: 0.75rem 1.5rem; position: sticky; top: 0; z-index: 50; background: #13142b; border-bottom: 1px solid #2d2f4a; margin: 0 -1.5rem; overflow-x: auto; }

  /* Workflow Progress button pulse */
  @keyframes wfBtnPulse { 0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,0.5);} 50%{box-shadow:0 0 12px 4px rgba(74,222,128,0.3);} }
  .wf-running { animation: wfBtnPulse 2s ease-in-out infinite !important; background: #166534 !important; color: #4ade80 !important; border-color: #22c55e !important; }

  /* Offcanvas */
  .offcanvas-backdrop { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 150; }
  .offcanvas-backdrop.visible { display: block; }
  .offcanvas { position: fixed; top: 0; right: 0; height: 100vh; width: 400px; background: #13142b; border-left: 1px solid #2d2f4a; z-index: 160; transform: translateX(100%); transition: transform 0.3s ease; display: flex; flex-direction: column; }
  .offcanvas.visible { transform: translateX(0); }
  .offcanvas-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid #2d2f4a; flex-shrink: 0; }
  .offcanvas-header h3 { margin: 0; color: #8b9aff; font-size: 1.1rem; }
  .offcanvas-close { background: none; border: none; color: #9da0c3; font-size: 1.4rem; cursor: pointer; padding: 0 0.25rem; }
  .offcanvas-close:hover { color: #dfe3ff; }
  .offcanvas-body { flex: 1; overflow-y: auto; padding: 1rem 1.25rem; }

  /* Status badge */
  .wf-badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; }
  .wf-badge-idle { background: #2d2f4a; color: #9da0c3; }
  .wf-badge-running { background: #166534; color: #4ade80; }
  .wf-badge-completed { background: #1e3a5f; color: #60a5fa; }
  .wf-badge-failed { background: #5c1818; color: #f87171; }
  .wf-badge-paused { background: #4a3728; color: #fbbf24; }

  /* Step timeline */
  .step-timeline { list-style: none; padding: 0; margin: 1rem 0; position: relative; }
  .step-timeline::before { content: ''; position: absolute; left: 11px; top: 8px; bottom: 8px; width: 2px; background: #2d2f4a; }
  .step-timeline li { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.5rem 0; position: relative; }
  .step-dot { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; flex-shrink: 0; z-index: 1; border: 2px solid #2d2f4a; background: #13142b; }
  .step-dot-idle { border-color: #3d3f5a; color: #9da0c3; }
  .step-dot-running { border-color: #10b981; color: #10b981; background: rgba(16,185,129,0.1); }
  .step-dot-done { border-color: #22c55e; background: #166534; color: #4ade80; }
  .step-dot-error { border-color: #ef4444; background: #5c1818; color: #f87171; }
  .step-dot-stuck { border-color: #f59e0b; background: #4a3728; color: #fbbf24; }
  .step-dot-skipped { border-color: #3d3f5a; background: #2d2f4a; color: #6b7280; }
  .step-info { flex: 1; }
  .step-name { color: #dfe3ff; font-size: 0.9rem; font-weight: 500; }
  .step-status-text { color: #9da0c3; font-size: 0.78rem; margin-top: 0.15rem; }
  .step-elapsed { color: #6b7280; font-size: 0.75rem; }

  /* Log area */
  .wf-log-area { background: #0d0e1a; border: 1px solid #2d2f4a; border-radius: 8px; padding: 0.75rem; font-family: 'Consolas', 'Monaco', monospace; font-size: 0.78rem; line-height: 1.5; color: #9da0c3; max-height: 300px; overflow-y: auto; }
  .wf-log-entry { margin-bottom: 0.25rem; }
  .wf-log-time { color: #6b7280; }
  .wf-log-info { color: #60a5fa; }
  .wf-log-success { color: #4ade80; }
  .wf-log-error { color: #f87171; }
  .wf-log-warning { color: #fbbf24; }
  .wf-log-score { font-weight: 700; margin-left: 0.25rem; }
  .wf-log-score-high { color: #4ade80; }
  .wf-log-score-mid { color: #fbbf24; }
  .wf-log-score-low { color: #6b7280; }
  .wf-log-link { color: #60a5fa; text-decoration: none; margin-left: 0.35rem; font-size: 0.85rem; }
  .wf-log-link:hover { text-decoration: underline; color: #93bbfc; }

  /* Modals */
  .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 100; }
  .modal-overlay.visible { display: flex; align-items: center; justify-content: center; }
  .modal { background: #242640; border: 1px solid #2d2f4a; border-radius: 12px; padding: 2rem; max-width: 800px; width: 90%; max-height: 80vh; overflow-y: auto; }
  .modal h3 { color: #8b9aff; margin-top: 0; }
  .modal .content { background: #1a1b2e; border-radius: 8px; padding: 1rem; white-space: pre-wrap; font-size: 0.9rem; line-height: 1.6; }
  .modal .close-btn { float: right; background: none; border: none; color: #9da0c3; font-size: 1.5rem; cursor: pointer; }
  .modal-form { display: flex; flex-direction: column; gap: 0.75rem; }
  .modal-form label { color: #9da0c3; font-size: 0.85rem; }
  .modal-form input, .modal-form select { background: #2d2f4a; border: 1px solid #3d3f5a; border-radius: 6px; color: #dfe3ff; padding: 0.5rem 0.75rem; font-size: 0.95rem; }

  /* Filter bar */
  .jobFilterBar { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; }
  .jobFilterBar select, .jobFilterBar input { background: #2d2f4a; border: 1px solid #3d3f5a; border-radius: 6px; color: #dfe3ff; padding: 0.35rem 0.6rem; font-size: 0.85rem; }

  /* Pagination */
  .jobPagination { display: flex; gap: 0.5rem; align-items: center; justify-content: center; margin-top: 0.75rem; }
  .jobPagination button { background: #2d2f4a; border: 1px solid #3d3f5a; border-radius: 4px; color: #dfe3ff; padding: 0.3rem 0.6rem; cursor: pointer; }
  .jobPagination button.active { background: #6a7eff; border-color: #6a7eff; }
  .jobPagination button:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ─── Workflow Editor Modal ─── */
  .wfe-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.75); z-index: 200; }
  .wfe-overlay.visible { display: flex; align-items: center; justify-content: center; }
  .wfe-modal { background: #242640; border: 1px solid #2d2f4a; border-radius: 12px; padding: 1.5rem 2rem; max-width: 960px; width: 95%; max-height: 85vh; overflow-y: auto; }
  .wfe-modal h3 { color: #8b9aff; margin: 0 0 1rem 0; display: flex; align-items: center; justify-content: space-between; }
  .wfe-modal h3 .close-btn { background: none; border: none; color: #9da0c3; font-size: 1.5rem; cursor: pointer; }
  .wfe-pipeline { display: flex; align-items: flex-start; gap: 0; justify-content: center; flex-wrap: wrap; }
  .wfe-arrow { display: flex; align-items: center; padding-top: 2.5rem; color: #6a7eff; font-size: 1.5rem; font-weight: 700; margin: 0 0.3rem; }
  .wfe-card { background: #1a1b2e; border: 1px solid #3d3f5a; border-radius: 10px; padding: 1rem; min-width: 240px; max-width: 280px; flex: 1; position: relative; transition: opacity 0.3s; }
  .wfe-card.disabled { opacity: 0.35; pointer-events: none; }
  .wfe-card.disabled .wfe-card-toggle { pointer-events: auto; opacity: 1; }
  .wfe-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; border-bottom: 1px solid #2d2f4a; padding-bottom: 0.5rem; }
  .wfe-card-header h4 { margin: 0; color: #dfe3ff; font-size: 0.95rem; }
  .wfe-card-toggle { background: none; border: none; color: #ef4444; font-size: 1.2rem; cursor: pointer; padding: 0 4px; line-height: 1; }
  .wfe-card-toggle:hover { color: #f87171; }
  .wfe-card-toggle.off { color: #22c55e; }
  .wfe-card-body { display: flex; flex-direction: column; gap: 0.6rem; }

  /* Toggle switch */
  .wfe-toggle-row { display: flex; align-items: center; justify-content: space-between; }
  .wfe-toggle-row label { color: #9da0c3; font-size: 0.82rem; }
  .wfe-switch { position: relative; width: 44px; height: 22px; flex-shrink: 0; }
  .wfe-switch input { opacity: 0; width: 0; height: 0; }
  .wfe-switch .slider { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: #3d3f5a; border-radius: 11px; cursor: pointer; transition: background 0.2s; }
  .wfe-switch .slider::before { content: ''; position: absolute; width: 16px; height: 16px; left: 3px; bottom: 3px; background: #dfe3ff; border-radius: 50%; transition: transform 0.2s; }
  .wfe-switch input:checked + .slider { background: #22c55e; }
  .wfe-switch input:checked + .slider::before { transform: translateX(22px); }

  /* Number inputs in cards */
  .wfe-num-row { display: flex; align-items: center; justify-content: space-between; }
  .wfe-num-row label { color: #9da0c3; font-size: 0.82rem; flex: 1; }
  .wfe-num-row input { width: 60px; background: #2d2f4a; border: 1px solid #3d3f5a; border-radius: 4px; color: #dfe3ff; padding: 0.2rem 0.4rem; font-size: 0.85rem; text-align: center; }
  .wfe-hint { display: block; font-size: 0.72rem; color: #666; font-weight: 400; margin-top: 1px; }
  .gs-hint { font-size: 0.72rem; color: #666; margin: -0.2rem 0 0.3rem 0; }

  /* Platform / Job checkboxes */
  .wfe-list-title { color: #6a7eff; font-size: 0.78rem; font-weight: 600; margin-top: 0.3rem; text-transform: uppercase; }
  .wfe-check-list { display: flex; flex-direction: column; gap: 0.3rem; max-height: 140px; overflow-y: auto; }
  .wfe-check-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: #dfe3ff; }
  .wfe-check-item input[type="checkbox"] { accent-color: #6a7eff; }
  .wfe-check-item.unavailable { opacity: 0.4; }
  .wfe-check-item.unavailable input { pointer-events: none; }
  .wfe-no-items { color: #666; font-size: 0.78rem; font-style: italic; }
  .wfe-warning { color: #fbbf24; font-size: 0.78rem; margin-top: 0.3rem; }

  /* Bottom buttons */
  .wfe-actions { display: flex; gap: 0.75rem; justify-content: center; margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid #2d2f4a; }

  @media (max-width: 700px) {
    .wfe-pipeline { flex-direction: column; align-items: center; }
    .wfe-arrow { transform: rotate(90deg); padding: 0.5rem 0; }
    .wfe-card { max-width: 100%; min-width: auto; }
  }
</style>
</head>
<body>
<h1>Job Search Dashboard</h1>
<p class="meta" id="meta"></p>
<div class="refresh-indicator" id="refresh">Auto-refresh: active</div>

<!-- Control Bar -->
<div class="controlBar" id="controlBar">
  <button class="btn btn-success" id="wfBtnStart" onclick="wfStart()" data-i18n="startWorkflow">Start Workflow</button>
  <button class="btn btn-danger" id="wfBtnStop" onclick="wfStop()" style="display:none;" data-i18n="stop">Stop</button>
  <span id="wfStatusLabel" style="font-size:0.85rem;color:#9da0c3;">Idle</span>
  <button class="btn btn-sm" style="margin-left:auto;background:#3d3f5a;color:#dfe3ff;" onclick="openGlobalSettings()" data-i18n="settings">Settings</button>
  <button class="btn btn-sm" style="background:#3d3f5a;color:#dfe3ff;" id="btnWorkflowProgress" onclick="toggleProgressOffcanvas()" data-i18n="workflowProgress">Workflow Progress</button>
  <button class="btn btn-sm" style="background:#3d3f5a;color:#dfe3ff;" onclick="openAlertSettings()" data-i18n="alerts">Alerts</button>
  <button class="btn btn-sm" style="background:#3d3f5a;color:#dfe3ff;" onclick="openAddWebsite()" data-i18n="addWebsite">+ Add Website</button>
  <button class="btn btn-sm" style="background:#3d3f5a;color:#dfe3ff;" id="langToggle" onclick="switchLang(_lang === 'en' ? 'zh-CN' : 'en'); this.textContent = _lang === 'en' ? '中文' : 'EN';">中文</button>
</div>

<div id="envBanner"></div>

<h2 data-i18n="direction">Direction</h2>
<div class="card">
  <div class="grid-2" id="direction"></div>
</div>

<h2 data-i18n="profile">Profile</h2>
<div class="card">
  <div class="grid-2" id="profile"></div>
</div>

<h2 data-i18n="workflowGrid">Workflow Grid</h2>
<div class="card">
  <div class="wf-status-grid" id="wfGrid">
    <div style="color:#9da0c3;text-align:center;grid-column:1/-1;" data-i18n="noPlatforms">No platforms configured yet.</div>
  </div>
</div>

<h2 data-i18n="statsOverview">Stats Overview</h2>
<div class="card" id="statsPanel">
  <div class="grid-2" id="statsGrid">
    <div class="item"><label data-i18n="jobsFound">Jobs Found</label><div class="val" id="statJobsTotal">0</div></div>
    <div class="item"><label data-i18n="jobsMatched">Jobs Matched</label><div class="val" id="statJobsMatched">0</div></div>
    <div class="item"><label data-i18n="jobsApplied">Jobs Applied</label><div class="val" id="statJobsApplied">0</div></div>
    <div class="item"><label data-i18n="platformsReady">Platforms Ready</label><div class="val" id="statPlatformsReady">0</div></div>
    <div class="item"><label data-i18n="workflowStatus">Workflow Status</label><div class="val" id="statWfStatus">idle</div></div>
    <div class="item"><label data-i18n="runHistory">Run History</label><div class="val" id="statHistoryCount">0</div></div>
  </div>
</div>

<h2 data-i18n="applicationPipeline">Application Pipeline</h2>
<div class="card">
  <div class="pipeline" id="pipeline"></div>
</div>

<div class="tab-bar">
  <div class="tab active" onclick="switchTab('listings')">Job Listings</div>
  <div class="tab" onclick="switchTab('history')">Application History</div>
</div>

<div class="tab-content active" id="tab-listings">
  <div class="jobFilterBar" id="jobFilterBar">
    <select id="jobFilterStatus" onchange="filterJobs()">
      <option value="">All statuses</option>
      <option value="discovered">Discovered</option>
      <option value="matched">Matched</option>
      <option value="tailored">Tailored</option>
      <option value="submitted">Submitted</option>
      <option value="archived">Archived</option>
    </select>
    <input id="jobFilterMinScore" type="number" placeholder="Min score" min="0" max="100" style="width:80px;" onchange="filterJobs()">
    <button class="btn btn-sm btn-primary" onclick="filterJobs()" data-i18n="filter">Filter</button>
    <button class="btn btn-sm" style="background:#3d3f5a;color:#dfe3ff;" onclick="refreshJobRecords()" data-i18n="refresh">Refresh</button>
  </div>
  <table class="job-table" id="jobTable">
    <thead>
      <tr>
        <th>Job</th>
        <th>Location</th>
        <th>Salary</th>
        <th>Score</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="jobTableBody"></tbody>
  </table>
  <div id="noJobs" class="card" style="text-align:center;color:#9da0c3;">
    No job listings yet. Configure search parameters above and click Start Search.
  </div>
  <div class="jobPagination" id="jobPagination"></div>
</div>

<div class="tab-content" id="tab-history">
  <table class="job-table" id="historyTable">
    <thead>
      <tr>
        <th>Job</th>
        <th>Company</th>
        <th>Score</th>
        <th>Status</th>
        <th>Applied</th>
        <th>Link</th>
      </tr>
    </thead>
    <tbody id="historyBody"></tbody>
  </table>
  <div id="noHistory" class="card" style="text-align:center;color:#9da0c3;">
    No application history yet.
  </div>
</div>

<!-- Artifact modal -->
<div class="modal-overlay" id="modalOverlay" onclick="closeModal(event)">
  <div class="modal">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h3 id="modalTitle" style="margin:0"></h3>
      <div>
        <button class="btn btn-sm" id="modalDownload" style="display:none;background:#10b981;color:#fff;margin-right:8px">Download</button>
        <button class="close-btn" onclick="closeModal()" style="float:none">&times;</button>
      </div>
    </div>
    <div class="content" id="modalContent"></div>
  </div>
</div>

<!-- Global Settings modal -->
<!-- Workflow Editor modal -->
<div class="wfe-overlay" id="workflowEditorModal" onclick="closeWorkflowEditor(event)">
  <div class="wfe-modal" onclick="event.stopPropagation()">
    <h3>
      <span data-i18n="workflowEditor">Workflow Editor</span>
      <button class="close-btn" onclick="closeWorkflowEditor()">&times;</button>
    </h3>
    <div class="wfe-pipeline" id="wfePipeline">
      <!-- Dynamically rendered by openWorkflowEditor() -->
    </div>
    <div class="wfe-actions">
      <button class="btn btn-primary" onclick="confirmWorkflow()" data-i18n="confirm">Confirm</button>
      <button class="btn btn-sm" style="background:#3d3f5a;color:#dfe3ff;" onclick="resetWorkflowEditor()" data-i18n="reset">Reset</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="globalSettingsModal" onclick="closeGlobalSettings(event)">
  <div class="modal" style="max-width:500px;">
    <button class="close-btn" onclick="closeGlobalSettings()">&times;</button>
    <h3 data-i18n="globalSettings">Global Settings</h3>
    <div class="modal-form">
      <label>Min Match Score (%)</label>
      <div class="gs-hint" data-i18n="wfeMinScoreHint">Jobs scoring below this % are skipped</div>
      <input type="number" id="gsCfgMinScore" min="0" max="100" step="5" value="60">
      <label>Target Matches</label>
      <div class="gs-hint" data-i18n="wfeTargetCountHint">Stop searching each platform after finding this many qualified jobs</div>
      <input type="number" id="gsCfgTargetCount" min="1" max="100" value="10">
      <label>Max Search Results</label>
      <div class="gs-hint" data-i18n="wfeMaxResultsHint">Max jobs to fetch per platform before moving to next</div>
      <input type="number" id="gsCfgMaxResults" min="5" max="200" step="5" value="30">
      <button class="btn btn-primary" id="saveGlobalSettings" onclick="saveGlobalSettings()" data-i18n="save">Save Settings</button>
    </div>
  </div>
</div>

<!-- Add Website modal -->
<div class="modal-overlay" id="addWebsiteModal" onclick="closeAddWebsite(event)">
  <div class="modal" style="max-width:500px;">
    <button class="close-btn" onclick="closeAddWebsite()">&times;</button>
    <h3 data-i18n="addTargetWebsite">Add Target Website</h3>
    <div class="modal-form">
      <label>Name</label>
      <input type="text" id="awName" placeholder="e.g. Indeed">
      <label>URL</label>
      <input type="text" id="awUrl" placeholder="https://...">
      <label>Login URL (optional)</label>
      <input type="text" id="awLoginUrl" placeholder="https://...">
      <label>Connection Type</label>
      <select id="awConnType"><option value="browser">Browser</option><option value="api">API</option></select>
      <button class="btn btn-primary" id="submitAddWebsite" onclick="submitAddWebsite()">Add Website</button>
    </div>
  </div>
</div>

<!-- Alert Settings modal -->
<div class="modal-overlay" id="alertSettingsModal" onclick="closeAlertSettings(event)">
  <div class="modal" style="max-width:600px;">
    <button class="close-btn" onclick="closeAlertSettings()">&times;</button>
    <h3 data-i18n="alertSettings">Alert & Notification Settings</h3>
    <div class="modal-form">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <label data-i18n="alertsEnabled">Enable Alerts</label>
        <input type="checkbox" id="alertEnabled" checked>
      </div>
      <hr style="border-color:#2d2f4a;margin:0.5rem 0;">
      <h4 style="color:#8b9aff;margin:0;" data-i18n="stuckDetection">Stuck Detection</h4>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <label data-i18n="stuckEnabled">Enable Stuck Detection</label>
        <input type="checkbox" id="alertStuckEnabled" checked>
      </div>
      <div class="grid-2" style="gap:0.5rem;">
        <div><label style="font-size:0.8rem;color:#9da0c3;">Profile Timeout (s)</label><input type="number" id="alertThProfile" value="30" min="10" max="300" style="width:100%;background:#2d2f4a;border:1px solid #3d3f5a;border-radius:6px;color:#dfe3ff;padding:0.4rem;"></div>
        <div><label style="font-size:0.8rem;color:#9da0c3;">Search Timeout (s)</label><input type="number" id="alertThSearch" value="600" min="60" max="3600" style="width:100%;background:#2d2f4a;border:1px solid #3d3f5a;border-radius:6px;color:#dfe3ff;padding:0.4rem;"></div>
        <div><label style="font-size:0.8rem;color:#9da0c3;">Generate Timeout (s)</label><input type="number" id="alertThGenerate" value="900" min="60" max="3600" style="width:100%;background:#2d2f4a;border:1px solid #3d3f5a;border-radius:6px;color:#dfe3ff;padding:0.4rem;"></div>
        <div><label style="font-size:0.8rem;color:#9da0c3;">Apply Timeout (s)</label><input type="number" id="alertThApply" value="1200" min="60" max="3600" style="width:100%;background:#2d2f4a;border:1px solid #3d3f5a;border-radius:6px;color:#dfe3ff;padding:0.4rem;"></div>
      </div>
      <div style="display:flex;gap:1rem;">
        <div style="flex:1;"><label style="font-size:0.8rem;color:#9da0c3;" data-i18n="failureTrigger">Consecutive Failures</label><input type="number" id="alertFailureTrigger" value="3" min="1" max="10" style="width:100%;background:#2d2f4a;border:1px solid #3d3f5a;border-radius:6px;color:#dfe3ff;padding:0.4rem;"></div>
        <div style="flex:1;"><label style="font-size:0.8rem;color:#9da0c3;" data-i18n="maxRetries">Max Retries</label><input type="number" id="alertMaxRetries" value="2" min="0" max="5" style="width:100%;background:#2d2f4a;border:1px solid #3d3f5a;border-radius:6px;color:#dfe3ff;padding:0.4rem;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <label data-i18n="autoRetry">Auto-Retry on Stuck</label>
        <input type="checkbox" id="alertAutoRetry" checked>
      </div>
      <hr style="border-color:#2d2f4a;margin:0.5rem 0;">
      <h4 style="color:#8b9aff;margin:0;" data-i18n="notificationChannels">Notification Channels</h4>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <label data-i18n="dashboardPopup">Dashboard Popup</label>
        <input type="checkbox" id="alertChDashboard" checked disabled>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <label data-i18n="desktopNotification">Desktop Notification</label>
        <input type="checkbox" id="alertChDesktop" checked>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <label data-i18n="webhookNotification">Webhook</label>
        <input type="checkbox" id="alertChWebhook">
      </div>
      <div id="webhookFields" style="display:none;">
        <label style="font-size:0.8rem;color:#9da0c3;">Webhook URL</label>
        <input type="text" id="alertWebhookUrl" placeholder="https://..." style="width:100%;background:#2d2f4a;border:1px solid #3d3f5a;border-radius:6px;color:#dfe3ff;padding:0.4rem;">
        <label style="font-size:0.8rem;color:#9da0c3;">Secret (optional)</label>
        <input type="text" id="alertWebhookSecret" placeholder="optional secret" style="width:100%;background:#2d2f4a;border:1px solid #3d3f5a;border-radius:6px;color:#dfe3ff;padding:0.4rem;">
      </div>
      <hr style="border-color:#2d2f4a;margin:0.5rem 0;">
      <div>
        <label style="font-size:0.8rem;color:#9da0c3;" data-i18n="throttleInterval">Throttle Interval (seconds)</label>
        <input type="number" id="alertThrottle" value="300" min="30" max="3600" style="width:100%;background:#2d2f4a;border:1px solid #3d3f5a;border-radius:6px;color:#dfe3ff;padding:0.4rem;">
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
        <button class="btn btn-primary" onclick="saveAlertSettings()" data-i18n="save">Save Settings</button>
        <button class="btn btn-warning" onclick="testAlert()" data-i18n="testAlert">Test Alert</button>
      </div>
    </div>
  </div>
</div>

<!-- Toast notification container -->
<div id="toastContainer" style="position:fixed;top:70px;right:20px;z-index:200;display:flex;flex-direction:column;gap:0.5rem;pointer-events:none;"></div>

<!-- Workflow Progress Offcanvas -->
<div class="offcanvas-backdrop" id="progressBackdrop" onclick="closeProgressOffcanvas()"></div>
<div class="offcanvas" id="progressOffcanvas">
  <div class="offcanvas-header">
    <h3 data-i18n="workflowProgress">Workflow Progress</h3>
    <button class="offcanvas-close" onclick="closeProgressOffcanvas()">&times;</button>
  </div>
  <div class="offcanvas-body">
    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem;">
      <span data-i18n="wfStatus" style="color:#9da0c3;font-size:0.85rem;">Status</span>
      <span class="wf-badge wf-badge-idle" id="wfProgressBadge">IDLE</span>
    </div>
    <div id="wfStepTimeline">
      <ul class="step-timeline" id="stepTimelineList"></ul>
    </div>
    <div style="margin-top:1rem;">
      <h4 style="color:#8b9aff;font-size:0.9rem;margin:0 0 0.5rem 0;" data-i18n="wfLogs">Logs</h4>
      <div class="wf-log-area" id="wfLogArea">
        <div class="wf-log-entry" style="color:#6b7280;" data-i18n="noWorkflowData">No workflow running</div>
      </div>
    </div>
    <div style="margin-top:1rem;">
      <table style="width:100%;">
        <thead><tr><th></th><th data-i18n="step" style="color:#9da0c3;font-size:0.8rem;">Step</th><th data-i18n="status" style="color:#9da0c3;font-size:0.8rem;">Status</th></tr></thead>
        <tbody id="subtasks"></tbody>
      </table>
    </div>
  </div>
</div>

<!-- Alert modal -->
<div class="modal-overlay" id="alertModal" onclick="closeAlert(event)">
  <div class="modal" style="max-width:400px;">
    <button class="close-btn" onclick="closeAlert()">&times;</button>
    <h3 id="alertTitle">Alert</h3>
    <p id="alertMessage"></p>
    <button class="btn btn-primary" onclick="closeAlert()">OK</button>
  </div>
</div>

<script>
let API_URL = ${JSON.stringify(apiUrl)};
let PIPE_URL = ${JSON.stringify(pipelineBase)};
const BASE_URL = ${JSON.stringify(baseUrl)};
let _sessionChecked = false;

// ─── i18n ───
var _i18n = {
    en: {
        envBound: 'Environment bound', envNotBound: 'No browser environment bound. Please go to AI Panel → Runtime Settings → Bind an environment to enable login and search.',
        direction: 'Direction', profile: 'Profile', workflowProgress: 'Workflow Progress',
        workflowGrid: 'Workflow Grid',
        statsOverview: 'Stats Overview', applicationPipeline: 'Application Pipeline', jobRecords: 'Job Records',
        startWorkflow: 'Start Workflow', stop: 'Stop', settings: 'Settings',
        addWebsite: '+ Add Website', login: 'Login', confirm: 'Confirm',
        jobsFound: 'Jobs Found', jobsMatched: 'Jobs Matched', jobsApplied: 'Jobs Applied',
        platformsReady: 'Platforms Ready', workflowStatus: 'Workflow Status',
        runHistory: 'Run History', noJobs: 'No jobs found yet.',
        noPlatforms: 'No platforms configured yet.',
        filter: 'Filter', refresh: 'Refresh', save: 'Save Settings',
        addTargetWebsite: 'Add Target Website', globalSettings: 'Global Settings',
        alerts: 'Alerts', alertSettings: 'Alert & Notification Settings',
        alertsEnabled: 'Enable Alerts', stuckDetection: 'Stuck Detection',
        stuckEnabled: 'Enable Stuck Detection', failureTrigger: 'Consecutive Failures',
        maxRetries: 'Max Retries', autoRetry: 'Auto-Retry on Stuck',
        notificationChannels: 'Notification Channels', dashboardPopup: 'Dashboard Popup',
        desktopNotification: 'Desktop Notification', webhookNotification: 'Webhook',
        throttleInterval: 'Throttle Interval (seconds)', testAlert: 'Test Alert',
        step: 'Step', status: 'Status', title: 'Title', company: 'Company',
        location: 'Location', score: 'Score', applied: 'Applied',
        wfStatus: 'Status', wfElapsed: 'Elapsed', wfLogs: 'Logs',
        noWorkflowData: 'No workflow running',
        launching: 'Launching...',
        relogin: 'Re-login',
        workflowEditor: 'Workflow Editor', reset: 'Reset',
        wfeSearch: 'Search', wfeGenerate: 'Generate', wfeApply: 'Apply',
        wfeMinScore: 'Min Match Score (%)', wfeTargetCount: 'Target Matches',
        wfeMaxResults: 'Max Search Results', wfePlatforms: 'Platforms',
        wfeTailorResume: 'Tailor Resume', wfeCoverLetter: 'Cover Letter',
        wfeInterviewPrep: 'Interview Prep', wfeConfirmBeforeApply: 'Confirm Before Apply',
        wfeJobs: 'Jobs', wfeNoReadyPlatform: 'No platform with ready tool',
        wfeNoJobs: 'No eligible jobs',
        wfeMinScoreHint: 'Jobs scoring below this % are skipped',
        wfeTargetCountHint: 'Stop searching each platform after finding this many qualified jobs',
        wfeMaxResultsHint: 'Max jobs to fetch per platform before moving to next'
    },
    'zh-CN': {
        envBound: '已绑定浏览器环境', envNotBound: '未绑定浏览器环境。请前往 AI 面板 → 运行时设置 → 绑定环境，以启用登录和搜索功能。',
        direction: '求职方向', profile: '个人资料', workflowProgress: '工作流进度',
        workflowGrid: '工作流网格',
        statsOverview: '统计概览', applicationPipeline: '申请流水线', jobRecords: '职位记录',
        startWorkflow: '启动工作流', stop: '停止', settings: '设置',
        addWebsite: '+ 添加网站', login: '登录', confirm: '确认',
        jobsFound: '已发现职位', jobsMatched: '已匹配职位', jobsApplied: '已申请职位',
        platformsReady: '平台就绪', workflowStatus: '工作流状态',
        runHistory: '运行历史', noJobs: '暂无职位信息。',
        noPlatforms: '暂未配置平台。',
        filter: '筛选', refresh: '刷新', save: '保存设置',
        addTargetWebsite: '添加目标网站', globalSettings: '全局设置',
        alerts: '告警', alertSettings: '告警与通知设置',
        alertsEnabled: '启用告警', stuckDetection: '卡住检测',
        stuckEnabled: '启用卡住检测', failureTrigger: '连续失败次数',
        maxRetries: '最大重试次数', autoRetry: '卡住时自动重试',
        notificationChannels: '通知渠道', dashboardPopup: '仪表盘弹窗',
        desktopNotification: '桌面通知', webhookNotification: 'Webhook',
        throttleInterval: '节流间隔（秒）', testAlert: '测试告警',
        step: '步骤', status: '状态', title: '职位', company: '公司',
        location: '地点', score: '匹配度', applied: '已申请',
        wfStatus: '状态', wfElapsed: '耗时', wfLogs: '日志',
        noWorkflowData: '暂无工作流运行',
        launching: '启动中...',
        relogin: '重新登录',
        workflowEditor: '工作流编辑器', reset: '重置',
        wfeSearch: '搜索', wfeGenerate: '生成', wfeApply: '投递',
        wfeMinScore: '最低匹配分数 (%)', wfeTargetCount: '目标匹配数',
        wfeMaxResults: '最大搜索结果', wfePlatforms: '平台',
        wfeTailorResume: '定制简历', wfeCoverLetter: '求职信',
        wfeInterviewPrep: '面试准备', wfeConfirmBeforeApply: '投前确认',
        wfeJobs: '职位', wfeNoReadyPlatform: '无可用平台工具',
        wfeNoJobs: '无可选职位',
        wfeMinScoreHint: '低于此分数的职位将被跳过',
        wfeTargetCountHint: '每个平台找到此数量的合格职位后停止该平台搜索',
        wfeMaxResultsHint: '每个平台最多抓取的职位数量'
    }
};
var _lang = (navigator.language || 'en').startsWith('zh') ? 'zh-CN' : 'en';
function t(key) { return (_i18n[_lang] && _i18n[_lang][key]) || (_i18n.en[key]) || key; }
function switchLang(lang) {
    _lang = lang;
    // Update all data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
        el.textContent = t(el.getAttribute('data-i18n'));
    });
}

const esc = (s) => {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
};
const statusIcon = (s) => s === 'done' ? '&#x2705;' : s === 'running' ? '&#x25B6;&#xFE0F;' : s === 'failed' ? '&#x274C;' : '&#x23F3;';

function renderItem(label, value, fullWidth) {
    const cls = fullWidth ? 'item full-width' : 'item';
    const valCls = value ? 'val' : 'val empty';
    return '<div class="' + cls + '"><label>' + esc(label) + '</label><div class="' + valCls + '">' + esc(value || '\\u2014') + '</div></div>';
}

const STAGES = ['discovered','fetched','parsed','matched','tailored','reviewed','submitted','followed_up','archived'];

function renderPipeline(stats) {
    return STAGES.map(function(s) {
        var count = stats[s] || 0;
        var cls = count > 0 ? 'stage active' : 'stage';
        return '<div class="' + cls + '"><div class="count">' + count + '</div><div class="label">' + s + '</div></div>';
    }).join('');
}

function scoreClass(score) {
    if (score >= 70) return 'high';
    if (score >= 40) return 'mid';
    return 'low';
}

function switchTab(name) {
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
    event.target.classList.add('active');
    document.getElementById('tab-' + name).classList.add('active');
    if (name === 'history') refreshHistory();
}

// Search is now handled entirely by Start Workflow + Global Settings config

// ─── Action buttons ───
async function genResume(jobUrl) {
    var btn = event.target; btn.disabled = true; btn.textContent = '...';
    try {
        var res = await fetch(PIPE_URL + '/generate-resume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobUrl: jobUrl })
        });
        var data = await res.json();
        if (data.error) { alert('Error: ' + data.error); btn.disabled = false; btn.textContent = 'Resume'; return; }
        showModal('Tailored Resume — ' + (data.job?.title || ''), data.markdown || 'No content generated', jobUrl, 'resume');
        btn.textContent = 'Done'; refresh();
    } catch (e) { alert(e.message); btn.disabled = false; btn.textContent = 'Resume'; }
}

async function genCoverLetter(jobUrl) {
    var btn = event.target; btn.disabled = true; btn.textContent = '...';
    try {
        var res = await fetch(PIPE_URL + '/generate-cover-letter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobUrl: jobUrl })
        });
        var data = await res.json();
        if (data.error) { alert('Error: ' + data.error); btn.disabled = false; btn.textContent = 'Cover Letter'; return; }
        showModal('Cover Letter — ' + (data.job?.title || ''), data.markdown || 'No content generated', jobUrl, 'coverLetter');
        btn.textContent = 'Done'; refresh();
    } catch (e) { alert(e.message); btn.disabled = false; btn.textContent = 'Cover Letter'; }
}

async function genInterviewPrep(jobUrl) {
    var btn = event.target; btn.disabled = true; btn.textContent = '...';
    try {
        var res = await fetch(PIPE_URL + '/generate-interview-prep', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobUrl: jobUrl })
        });
        var data = await res.json();
        if (data.error) { alert('Error: ' + data.error); btn.disabled = false; btn.textContent = 'Prep'; return; }
        showModal('Interview Prep — ' + (data.job?.title || ''), data.markdown || 'No content generated', jobUrl, 'interviewPrep');
        btn.textContent = 'Done'; refresh();
    } catch (e) { alert(e.message); btn.disabled = false; btn.textContent = 'Prep'; }
}

function downloadDoc(jobUrl, docType) {
    var encodedUrl = encodeURIComponent(jobUrl);
    window.open(PIPE_URL + '/download/' + encodedUrl + '/' + docType, '_blank');
}

async function markApplied(jobUrl) {
    var note = prompt('Add a note (optional):');
    if (note === null) return;
    try {
        await fetch(PIPE_URL + '/mark-applied', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobUrl: jobUrl, note: note })
        });
        refresh();
    } catch (e) { alert(e.message); }
}

function openJob(url) {
    window.open(url, '_blank');
}

// ─── Modal ───
function showModal(title, content, jobUrl, docType) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalContent').textContent = content;
    var dlBtn = document.getElementById('modalDownload');
    if (dlBtn) {
        if (jobUrl && docType) {
            dlBtn.style.display = 'inline-block';
            dlBtn.onclick = function() { downloadDoc(jobUrl, docType); };
        } else {
            dlBtn.style.display = 'none';
        }
    }
    document.getElementById('modalOverlay').classList.add('visible');
}
function closeModal(e) {
    if (!e || e.target === document.getElementById('modalOverlay') || e.target.classList.contains('close-btn')) {
        document.getElementById('modalOverlay').classList.remove('visible');
    }
}

// ─── Render jobs table ───
function renderJobRow(job) {
    var scCls = job.matchScore != null ? 'score-cell ' + scoreClass(job.matchScore) : 'score-cell';
    var scVal = job.matchScore != null ? job.matchScore + '%' : '—';
    var statusCls = 'status-badge ' + (job.status || 'discovered');
    var url = esc(job.url || '');
    var safeUrl = url.replace(/'/g, "\\\\'");
    var arts = job.artifacts || {};
    // Artifact badges
    var badges = '';
    if (arts.resume && arts.resume !== 'generated' && arts.resume.length > 10) badges += '<span class="artifact-badge" title="Resume generated" onclick="downloadDoc(\\'' + safeUrl + '\\', \\'resume\\')">R</span>';
    if (arts.coverLetter && arts.coverLetter !== 'generated' && arts.coverLetter.length > 10) badges += '<span class="artifact-badge" title="Cover Letter generated" onclick="downloadDoc(\\'' + safeUrl + '\\', \\'coverLetter\\')">C</span>';
    if (arts.interviewPrep && arts.interviewPrep !== 'generated' && arts.interviewPrep.length > 10) badges += '<span class="artifact-badge" title="Interview Prep generated" onclick="downloadDoc(\\'' + safeUrl + '\\', \\'interviewPrep\\')">P</span>';
    return '<tr>' +
        '<td class="title-cell"><a href="' + url + '" target="_blank">' + esc(job.title || 'Untitled') + '</a><span class="company">' + esc(job.company || '') + '</span>' + (badges ? '<div class="artifact-badges">' + badges + '</div>' : '') + '</td>' +
        '<td>' + esc(job.location || '') + '</td>' +
        '<td>' + esc(job.salary || '—') + '</td>' +
        '<td class="' + scCls + '">' + scVal + '</td>' +
        '<td><span class="' + statusCls + '">' + esc(job.status || 'discovered') + '</span></td>' +
        '<td class="actions">' +
            '<button class="btn btn-primary btn-sm" onclick="genResume(\\'' + safeUrl + '\\')">Resume</button>' +
            '<button class="btn btn-warning btn-sm" onclick="genCoverLetter(\\'' + safeUrl + '\\')">Cover Letter</button>' +
            '<button class="btn btn-sm" style="background:#8b5cf6;color:#fff" onclick="genInterviewPrep(\\'' + safeUrl + '\\')">Prep</button>' +
            '<button class="btn btn-success btn-sm" onclick="markApplied(\\'' + safeUrl + '\\')">Applied</button>' +
            '<button class="btn btn-sm" style="background:#6366f1;color:#fff" onclick="openJob(\\'' + safeUrl + '\\')">Link</button>' +
        '</td>' +
    '</tr>';
}

// ─── History tab ───
async function refreshHistory() {
    try {
        var res = await fetch(PIPE_URL + '/history');
        var jobs = await res.json();
        var body = document.getElementById('historyBody');
        var noHist = document.getElementById('noHistory');
        if (jobs.length > 0) {
            body.innerHTML = jobs.map(function(j) {
                return '<tr>' +
                    '<td>' + esc(j.title || '') + '</td>' +
                    '<td>' + esc(j.company || '') + '</td>' +
                    '<td class="score-cell ' + (j.matchScore != null ? scoreClass(j.matchScore) : '') + '">' + (j.matchScore != null ? j.matchScore + '%' : '—') + '</td>' +
                    '<td><span class="status-badge ' + (j.status || '') + '">' + esc(j.status || '') + '</span></td>' +
                    '<td>' + esc((j.artifacts?.appliedAt || '').slice(0, 10)) + '</td>' +
                    '<td><a href="' + esc(j.url || '') + '" target="_blank" style="color:#8b9aff">Open</a></td>' +
                '</tr>';
            }).join('');
            noHist.style.display = 'none';
        } else {
            body.innerHTML = '';
            noHist.style.display = 'block';
        }
    } catch {}
}

function render(data) {
    // Environment binding banner
    var envBanner = document.getElementById('envBanner');
    var env = data.env || {};
    if (env.bound) {
        envBanner.innerHTML = '<div class="env-banner env-banner--ok">' +
            '<span class="env-banner__icon">✓</span>' +
            '<span class="env-banner__text">' + t('envBound') + ': <span class="env-banner__names">' + esc((env.envNames || []).join(', ')) + '</span></span>' +
            '</div>';
    } else {
        envBanner.innerHTML = '<div class="env-banner env-banner--warn">' +
            '<span class="env-banner__icon">⚠</span>' +
            '<span class="env-banner__text">' + t('envNotBound') + '</span>' +
            '</div>';
    }

    var d = data.direction || {};
    document.getElementById('direction').innerHTML =
        renderItem('Job Title', d.jobTitle) +
        renderItem('Location', d.location) +
        renderItem('Work Mode', d.workMode) +
        renderItem('Target Salary', d.salary ? d.salary + 'K' : '');

    var p = data.profile || {};
    var profileHtml =
        renderItem('Basic Info', p.basic) +
        renderItem('Key Skills', p.skills) +
        renderItem('Experience', p.experience) +
        renderItem('Education', p.education);
    if (p.highlights) {
        profileHtml += renderItem('Highlights', p.highlights, true);
    }
    document.getElementById('profile').innerHTML = profileHtml;

    var subtasksEl = document.getElementById('subtasks');
    // Only show workflow-related subtasks (hide onboarding/profile/dashboard)
    var _hiddenSubtasks = { onboarding: 1, profile: 1, dashboard: 1 };
    subtasksEl.innerHTML = (data.subtasks || []).filter(function(t) {
        return !_hiddenSubtasks[t.key];
    }).map(function(t) {
        return '<tr><td>' + statusIcon(t.status) + '</td><td>' + esc(t.key) + '</td><td>' + esc(t.status) + '</td></tr>';
    }).join('');

    // Pipeline stages
    document.getElementById('pipeline').innerHTML = renderPipeline(data.jobStats || {});

    // Job table
    var jobs = data.jobs || [];
    var jobBody = document.getElementById('jobTableBody');
    var noJobsEl = document.getElementById('noJobs');
    if (jobs.length > 0) {
        jobBody.innerHTML = jobs.map(renderJobRow).join('');
        noJobsEl.style.display = 'none';
        document.getElementById('jobTable').style.display = 'table';
    } else {
        jobBody.innerHTML = '';
        noJobsEl.style.display = 'block';
        document.getElementById('jobTable').style.display = 'none';
    }

    document.getElementById('meta').textContent =
        'Session: ' + (data.sessionId || '').slice(0, 8) +
        ' | Jobs: ' + (data.jobStats?.total || 0) +
        ' | Intent v' + (data.intentVersion || 1) +
        ' | Updated: ' + new Date().toLocaleString();
}

async function refresh() {
    try {
        const res = await fetch(API_URL);
        if (res.ok) {
            const data = await res.json();

            // Auto-detect: if baked-in session has no data, switch to active session
            if (!_sessionChecked && !data.direction?.jobTitle && !data.profile?.basic) {
                _sessionChecked = true;
                try {
                    const activeRes = await fetch(BASE_URL + '/api/active-session');
                    if (activeRes.ok) {
                        const active = await activeRes.json();
                        if (active.sessionId && active.sessionId !== data.sessionId) {
                            console.log('[dashboard] Switching to active session:', active.sessionId);
                            var encoded = encodeURIComponent(active.sessionId);
                            API_URL = BASE_URL + '/api/dashboard/' + encoded;
                            PIPE_URL = BASE_URL + '/api/pipeline/' + encoded;
                            // Re-fetch with correct session
                            var retry = await fetch(API_URL);
                            if (retry.ok) {
                                var retryData = await retry.json();
                                render(retryData);
                                document.getElementById('refresh').textContent = 'Auto-refresh: active (session switched)';
                                // pipeline status handled by workflow engine
                                return;
                            }
                        }
                    }
                } catch (_) { /* ignore, use original data */ }
            }

            render(data);
            document.getElementById('refresh').textContent = 'Auto-refresh: active';
        }
    } catch (e) {
        document.getElementById('refresh').textContent = 'Auto-refresh: disconnected';
    }
}

// Env selectors are handled by workflow grid platform env dropdowns

// ─── Workflow Status Grid ───
var _wfSessionId = ${JSON.stringify(encodedSid)};
var WF_URL = BASE_URL + '/api/workflow-status/' + _wfSessionId;

var ACTION_LABELS = { login: 'Login', relogin: 'Re-login', confirm: 'Confirm', build: 'Build', rebuild: 'Rebuild' };
var CELL_ICONS = { idle: '○', ready: '✓', running: '⟳', launching: '⟳', verifying: '⟳', building: '⟳', warning: '⚠', error: '✗', locked: '🔒' };

function renderWfCell(cellType, info) {
    var label = cellType.charAt(0).toUpperCase() + cellType.slice(1);
    var vis = info.visual || 'idle';
    var icon = CELL_ICONS[vis] || '○';
    var html = '<div class="wf-cell wf-cell--' + vis + '">';
    html += '<div class="wf-cell__label">' + label + '</div>';
    html += '<div class="wf-cell__status">' + icon + ' ' + esc(info.tip.split('.')[0] || vis) + '</div>';
    html += '<div class="wf-cell__tip">' + esc(info.tip) + '</div>';
    if (info.action) {
        html += '<button class="wf-cell__action" data-cell="' + cellType + '" data-action="' + info.action + '">' + (ACTION_LABELS[info.action] || info.action) + '</button>';
    }
    html += '</div>';
    return html;
}

function renderWfPlatform(p) {
    var loginVis = (p.cells && p.cells.login) ? p.cells.login.visual : 'idle';
    var html = '<div class="wf-platform" data-pid="' + esc(p.id) + '">';
    html += '<div class="wf-platform__header">' + esc(p.icon) + ' ' + esc(p.name);
    html += '<button class="wf-platform__delete" onclick="deletePlatform(\\'' + esc(p.id) + '\\',\\'' + esc(p.name) + '\\')" title="Remove">&times;</button>';
    html += '</div>';
    // Env binding is now global via AI Panel — per-platform select removed
    html += '<div class="wf-platform__actions">';
    if (loginVis === 'launching') {
        // Browser launching — both buttons locked
        html += '<button class="btn btn-sm wf-btn-loading" disabled><span class="wf-spinner"></span> ' + t('launching') + '</button>';
        html += '<button class="btn btn-sm" disabled>' + t('confirm') + '</button>';
    } else if (loginVis === 'verifying') {
        // Browser opened, waiting for user to log in — Login locked, Confirm enabled
        html += '<button class="btn btn-sm wf-btn-loading" disabled><span class="wf-spinner"></span> ' + t('launching') + '</button>';
        html += '<button class="btn btn-sm btn-confirm-active" onclick="confirmLogin(\\''+esc(p.id)+'\\')">✓ '+t('confirm')+'</button>';
    } else if (loginVis === 'ready') {
        // Logged in — show Re-login option
        html += '<button class="btn btn-sm" onclick="platformLogin(\\''+esc(p.id)+'\\')">'+t('relogin')+'</button>';
        html += '<button class="btn btn-sm" disabled>'+t('confirm')+'</button>';
    } else {
        // idle / error / warning — normal Login + Confirm
        html += '<button class="btn btn-sm" onclick="platformLogin(\\''+esc(p.id)+'\\')">'+t('login')+'</button>';
        html += '<button class="btn btn-sm" onclick="confirmLogin(\\''+esc(p.id)+'\\')">'+t('confirm')+'</button>';
    }
    html += '</div>';
    html += '<div class="wf-platform__cells">';
    html += renderWfCell('login', p.cells.login);
    html += renderWfCell('search', p.cells.search);
    html += renderWfCell('apply', p.cells.apply);
    html += '</div></div>';
    return html;
}

async function refreshWorkflowStatus() {
    try {
        var res = await fetch(WF_URL);
        if (!res.ok) return;
        var data = await res.json();
        var grid = document.getElementById('wfGrid');
        if (!data.platforms || data.platforms.length === 0) {
            grid.innerHTML = '<div style="color:#9da0c3;text-align:center;grid-column:1/-1;">' + t('noPlatforms') + '</div>';
            return;
        }
        grid.innerHTML = data.platforms.map(renderWfPlatform).join('');
        // Bind action buttons
        grid.querySelectorAll('.wf-cell__action').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var pid = btn.closest('.wf-platform').getAttribute('data-pid');
                var cellType = btn.getAttribute('data-cell');
                var action = btn.getAttribute('data-action');
                wfCellAction(pid, cellType, action);
            });
        });
    } catch (e) { console.error('[wf-status]', e); }
}

async function wfCellAction(platformId, cellType, action) {
    // Route build/rebuild actions to the actual build API
    if (action === 'build' || action === 'rebuild') {
        return buildSearchTool(platformId);
    }
    try {
        await fetch(WF_URL + '/' + encodeURIComponent(platformId) + '/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cell: cellType, action: action })
        });
        refreshWorkflowStatus();
    } catch (e) { showAlert('Error', e.message); }
}

async function buildSearchTool(platformId) {
    // Disable the Build button and show building state
    var cell = document.querySelector('.wf-platform[data-pid="'+platformId+'"] .wf-cell__action[data-cell="search"]');
    if (cell) { cell.disabled = true; cell.textContent = '⟳ Building...'; }
    try {
        var res = await fetch(BASE_URL + '/api/platforms/' + _wfSessionId + '/' + encodeURIComponent(platformId) + '/tools/search/build', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        });
        var data = await res.json();
        if (!data.success) { showAlert('Build Failed', data.error || 'Build failed'); }
        refreshWorkflowStatus();
    } catch (e) {
        showAlert('Build Error', e.message);
        refreshWorkflowStatus();
    }
}

// ─── Polling pause flag ───
// Chrome has a 6-connection-per-host limit for HTTP/1.1.
// SSE (1) + polling (4-5) saturate the pool, starving any new fetch.
// Pause polling while a modal (e.g. Workflow Editor) is doing its own fetches.
var _pausePolling = false;

// ─── Workflow Control Bar ───
var WF_API = BASE_URL + '/api/workflow/' + _wfSessionId;

// wfStart now opens the Workflow Editor instead of directly starting
async function wfStart() {
    openWorkflowEditor();
}

// ─── Workflow Editor ───
var _wfeConfig = null;   // current editor config snapshot
var _wfePlatforms = [];  // platform list with tool statuses
var _wfeJobs = [];       // job list for generate/apply selection

function openWorkflowEditor() {
    _pausePolling = true;  // free up HTTP connections for the 3 editor fetches
    document.getElementById('workflowEditorModal').classList.add('visible');
    document.getElementById('wfePipeline').innerHTML = '<p style="color:#9da0c3;text-align:center;">Loading...</p>';
    // Fetch config, platforms, and jobs in parallel
    Promise.all([
        fetch(WF_API + '/config').then(function(r) { console.log('[wfe] config status:', r.status); return r.json(); }),
        fetch(BASE_URL + '/api/platforms/' + _wfSessionId).then(function(r) { console.log('[wfe] platforms status:', r.status); return r.json(); }),
        fetch(BASE_URL + '/api/dashboard/' + _wfSessionId).then(function(r) { return r.json(); }).catch(function() { return { jobs: [] }; })
    ]).then(function(results) {
        _wfeConfig = results[0];
        _wfePlatforms = results[1].platforms || results[1] || [];
        var rawJobs = results[2].jobs;
        _wfeJobs = Array.isArray(rawJobs) ? rawJobs : [];
        console.log('[wfe] config steps:', (_wfeConfig.steps || []).length, 'platforms:', _wfePlatforms.length);
        renderWorkflowEditor();
    }).catch(function(e) {
        console.error('[wfe] load error:', e);
        document.getElementById('wfePipeline').innerHTML = '<p style="color:#f87171;">Failed to load: ' + e.message + '</p>';
    });
}

function closeWorkflowEditor(e) {
    if (e && e.target !== document.getElementById('workflowEditorModal')) return;
    document.getElementById('workflowEditorModal').classList.remove('visible');
    _pausePolling = false;  // resume background polling
}

function renderWorkflowEditor() {
    var cfg = _wfeConfig;
    if (!cfg || !cfg.steps) {
        console.error('[wfe] renderWorkflowEditor: no config or no steps', cfg);
        document.getElementById('wfePipeline').innerHTML = '<p style="color:#f87171;">No workflow config available</p>';
        return;
    }
    var t = _i18n[_lang] || _i18n.en;
    var steps = cfg.steps.filter(function(s) { return s.name !== 'customizeProfile'; });
    console.log('[wfe] rendering', steps.length, 'steps:', steps.map(function(s){return s.name;}).join(','));
    var html = '';

    steps.forEach(function(step, idx) {
        if (idx > 0) html += '<div class="wfe-arrow">⇒</div>';
        html += renderWfeCard(step, cfg, t);
    });

    document.getElementById('wfePipeline').innerHTML = html;
}

function renderWfeCard(step, cfg, t) {
    var disabled = !step.enabled;
    var cls = 'wfe-card' + (disabled ? ' disabled' : '');
    var nameMap = { search: t.wfeSearch, generate: t.wfeGenerate, apply: t.wfeApply };
    var toggleIcon = disabled ? '+' : '✕';
    var toggleCls = 'wfe-card-toggle' + (disabled ? ' off' : '');

    var h = '<div class="' + cls + '" id="wfeCard_' + step.name + '">';
    h += '<div class="wfe-card-header"><h4>' + (nameMap[step.name] || step.name) + '</h4>';
    h += '<button class="' + toggleCls + '" onclick="toggleWfStep(&quot;' + step.name + '&quot;)">' + toggleIcon + '</button></div>';
    h += '<div class="wfe-card-body">';

    if (step.name === 'search') {
        h += wfeNumRow('wfe_minScore', t.wfeMinScore, cfg.search ? cfg.search.minScore : 60, 0, 100, 5, t.wfeMinScoreHint);
        h += wfeNumRow('wfe_targetCount', t.wfeTargetCount, cfg.search ? cfg.search.targetCount : 10, 1, 100, 1, t.wfeTargetCountHint);
        h += wfeNumRow('wfe_maxResults', t.wfeMaxResults, cfg.search ? cfg.search.maxResults : 30, 5, 200, 5, t.wfeMaxResultsHint);
        h += wfePlatformList(step, 'search', t);
    }

    if (step.name === 'generate') {
        h += wfeToggle('wfe_tailorResume', t.wfeTailorResume, step.tailorResume !== false);
        h += wfeToggle('wfe_coverLetter', t.wfeCoverLetter, step.coverLetter !== false);
        h += wfeToggle('wfe_interviewPrep', t.wfeInterviewPrep, step.interviewPrep !== false);
        h += wfeJobList(step, 'generate', t);
    }

    if (step.name === 'apply') {
        h += wfeToggle('wfe_confirmBeforeApply', t.wfeConfirmBeforeApply, step.confirmBeforeApply !== false);
        h += wfeJobList(step, 'apply', t);
        h += wfePlatformList(step, 'apply', t);
    }

    h += '</div></div>';
    return h;
}

function wfeToggle(id, label, checked) {
    return '<div class="wfe-toggle-row"><label>' + label + '</label>' +
        '<label class="wfe-switch"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '>' +
        '<span class="slider"></span></label></div>';
}

function wfeNumRow(id, label, value, min, max, step, hint) {
    var h = '<div class="wfe-num-row"><label>' + label;
    if (hint) h += '<span class="wfe-hint">' + hint + '</span>';
    h += '</label><input type="number" id="' + id + '" value="' + value + '" min="' + min + '" max="' + max + '" step="' + step + '"></div>';
    return h;
}

function wfePlatformList(step, toolType, t) {
    var h = '<div class="wfe-list-title">' + t.wfePlatforms + '</div>';
    var selectedIds = step.platforms || [];
    var hasReady = false;

    if (_wfePlatforms.length === 0) {
        return h + '<div class="wfe-no-items">' + t.wfeNoReadyPlatform + '</div>';
    }

    h += '<div class="wfe-check-list">';
    _wfePlatforms.forEach(function(p) {
        var toolReady = p.tools && p.tools[toolType] && p.tools[toolType].status === 'ready';
        var itemCls = 'wfe-check-item' + (toolReady ? '' : ' unavailable');
        var checked = toolReady && (selectedIds.length === 0 || selectedIds.indexOf(p.id) >= 0);
        if (toolReady) hasReady = true;
        h += '<label class="' + itemCls + '">';
        h += '<input type="checkbox" data-wfe-platform="' + step.name + '" value="' + p.id + '"' +
            (checked ? ' checked' : '') + (toolReady ? '' : ' disabled') + '>';
        h += (p.icon || '') + ' ' + p.name;
        if (!toolReady) h += ' <span style="font-size:0.7rem;color:#666;">(no tool)</span>';
        h += '</label>';
    });
    h += '</div>';

    if (!hasReady) {
        h += '<div class="wfe-warning">⚠ ' + t.wfeNoReadyPlatform + '</div>';
    }
    return h;
}

function wfeJobList(step, forStep, t) {
    // Filter jobs by pipeline status:
    // generate: jobs with status matched (searched but not generated)
    // apply: jobs with status tailored or reviewed (generated but not applied)
    var eligible = [];
    if (forStep === 'generate') {
        eligible = _wfeJobs.filter(function(j) { return j.pipelineStatus === 'matched'; });
    } else if (forStep === 'apply') {
        eligible = _wfeJobs.filter(function(j) {
            return j.pipelineStatus === 'tailored' || j.pipelineStatus === 'reviewed';
        });
    }

    var h = '<div class="wfe-list-title">' + t.wfeJobs + '</div>';
    if (eligible.length === 0) {
        return h + '<div class="wfe-no-items">' + t.wfeNoJobs + '</div>';
    }

    var selectedIds = step.jobIds || [];
    h += '<div class="wfe-check-list">';
    eligible.forEach(function(j) {
        var checked = selectedIds.length === 0 || selectedIds.indexOf(j.id) >= 0;
        h += '<label class="wfe-check-item">';
        h += '<input type="checkbox" data-wfe-job="' + step.name + '" value="' + j.id + '"' + (checked ? ' checked' : '') + '>';
        h += (j.title || 'Untitled') + (j.company ? ' @ ' + j.company : '');
        h += '</label>';
    });
    h += '</div>';
    return h;
}

function toggleWfStep(name) {
    if (!_wfeConfig || !_wfeConfig.steps) return;
    var step = _wfeConfig.steps.find(function(s) { return s.name === name; });
    if (!step) return;

    // Count enabled (non-customizeProfile) steps
    var enabledCount = _wfeConfig.steps.filter(function(s) {
        return s.name !== 'customizeProfile' && s.enabled;
    }).length;

    if (step.enabled && enabledCount <= 1) {
        alert('At least one step must be enabled');
        return;
    }
    step.enabled = !step.enabled;
    renderWorkflowEditor();
}

async function confirmWorkflow() {
    if (!_wfeConfig) return;
    // Collect values from UI
    var searchStep = _wfeConfig.steps.find(function(s) { return s.name === 'search'; });
    var genStep = _wfeConfig.steps.find(function(s) { return s.name === 'generate'; });
    var applyStep = _wfeConfig.steps.find(function(s) { return s.name === 'apply'; });

    // Search params
    var patch = { search: {}, steps: {} };
    var el;
    el = document.getElementById('wfe_minScore'); if (el) patch.search.minScore = parseInt(el.value) || 60;
    el = document.getElementById('wfe_targetCount'); if (el) patch.search.targetCount = parseInt(el.value) || 10;
    el = document.getElementById('wfe_maxResults'); if (el) patch.search.maxResults = parseInt(el.value) || 30;

    // Search platforms
    if (searchStep) {
        var sp = []; document.querySelectorAll('[data-wfe-platform="search"]:checked').forEach(function(cb) { sp.push(cb.value); });
        patch.steps.search = { enabled: searchStep.enabled, platforms: sp };
    }

    // Generate toggles + jobs
    if (genStep) {
        el = document.getElementById('wfe_tailorResume');
        var tr = el ? el.checked : true;
        el = document.getElementById('wfe_coverLetter');
        var cl = el ? el.checked : true;
        el = document.getElementById('wfe_interviewPrep');
        var ip = el ? el.checked : true;
        var gj = []; document.querySelectorAll('[data-wfe-job="generate"]:checked').forEach(function(cb) { gj.push(cb.value); });
        patch.steps.generate = { enabled: genStep.enabled, tailorResume: tr, coverLetter: cl, interviewPrep: ip, jobIds: gj };
    }

    // Apply toggles + platforms + jobs
    if (applyStep) {
        el = document.getElementById('wfe_confirmBeforeApply');
        var cba = el ? el.checked : true;
        var ap = []; document.querySelectorAll('[data-wfe-platform="apply"]:checked').forEach(function(cb) { ap.push(cb.value); });
        var aj = []; document.querySelectorAll('[data-wfe-job="apply"]:checked').forEach(function(cb) { aj.push(cb.value); });
        patch.steps.apply = { enabled: applyStep.enabled, confirmBeforeApply: cba, platforms: ap, jobIds: aj };
    }

    try {
        // Save config
        var cfgRes = await fetch(WF_API + '/config', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch)
        });
        if (!cfgRes.ok) { var d = await cfgRes.json(); alert(d.errors ? d.errors.join(', ') : 'Save failed'); return; }

        // Collect direction & profile from the rendered dashboard as fallback
        var dirItems = document.querySelectorAll('#direction .item');
        var profItems = document.querySelectorAll('#profile .item');
        function _valOf(container, idx) {
            var items = container;
            if (idx < items.length) { var v = items[idx].querySelector('.val'); return v ? v.textContent.trim() : ''; }
            return '';
        }
        var ctxPayload = {
            direction: {
                q_job_title: _valOf(dirItems, 0),
                q_location: _valOf(dirItems, 1),
                q_work_mode: _valOf(dirItems, 2),
                q_salary: _valOf(dirItems, 3).replace(/K$/i, '')
            },
            profile: {
                basic: _valOf(profItems, 0),
                skills: _valOf(profItems, 1),
                experience: _valOf(profItems, 2),
                education: _valOf(profItems, 3)
            }
        };

        // Start workflow
        var startRes = await fetch(WF_API + '/start', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context: ctxPayload })
        });
        var startData = await startRes.json();
        if (startData.success) {
            closeWorkflowEditor();
            document.getElementById('wfBtnStart').style.display = 'none';
            document.getElementById('wfBtnStop').style.display = 'inline-block';
        } else {
            alert(startData.error || 'Start failed');
        }
    } catch (e) { alert(e.message); }
}

function resetWorkflowEditor() {
    // Reload default config from server and re-render
    fetch(WF_API + '/config').then(function(r) { return r.json(); }).then(function(cfg) {
        // Reset step enables and sub-options to defaults
        cfg.steps.forEach(function(s) {
            if (s.name !== 'customizeProfile') {
                s.enabled = true;
                s.platforms = [];
                s.jobIds = [];
            }
            if (s.name === 'generate') { s.tailorResume = true; s.coverLetter = true; s.interviewPrep = true; }
            if (s.name === 'apply') { s.confirmBeforeApply = true; }
        });
        cfg.search = { minScore: 60, targetCount: 10, maxResults: 30 };
        _wfeConfig = cfg;
        renderWorkflowEditor();
    }).catch(function() {});
}

async function wfStop() {
    try {
        await fetch(WF_API + '/stop', { method: 'POST' });
        document.getElementById('wfBtnStart').style.display = 'inline-block';
        document.getElementById('wfBtnStop').style.display = 'none';
    } catch (e) { alert(e.message); }
}

async function pollWfStatus() {
    try {
        var res = await fetch(WF_API + '/status');
        var data = await res.json();
        updateWfUI(data);
    } catch {}
}

// ─── Workflow Progress Offcanvas ───
var _wfLogs = [];
var MAX_WF_LOGS = 200;
var _lastPipelineLogIdx = 0;  // tracks how many pipeline logs we already synced

function toggleProgressOffcanvas() {
    var oc = document.getElementById('progressOffcanvas');
    var bd = document.getElementById('progressBackdrop');
    var isOpen = oc.classList.contains('visible');
    if (isOpen) { closeProgressOffcanvas(); } else { openProgressOffcanvas(); }
}
function openProgressOffcanvas() {
    document.getElementById('progressOffcanvas').classList.add('visible');
    document.getElementById('progressBackdrop').classList.add('visible');
}
function closeProgressOffcanvas() {
    document.getElementById('progressOffcanvas').classList.remove('visible');
    document.getElementById('progressBackdrop').classList.remove('visible');
}

function addWfLog(message, level, meta) {
    level = level || 'info';
    var now = new Date();
    var ts = now.toLocaleTimeString();
    var entry = { time: ts, message: message, level: level };
    if (meta) { if (meta.url) entry.url = meta.url; if (meta.score != null) entry.score = meta.score; }
    _wfLogs.push(entry);
    if (_wfLogs.length > MAX_WF_LOGS) _wfLogs.splice(0, _wfLogs.length - MAX_WF_LOGS);
    renderWfLogs();
}

function renderWfLogs() {
    var el = document.getElementById('wfLogArea');
    if (!el) return;
    if (_wfLogs.length === 0) {
        el.innerHTML = '<div class="wf-log-entry" style="color:#6b7280;">' + t('noWorkflowData') + '</div>';
        return;
    }
    el.innerHTML = _wfLogs.map(function(l) {
        var cls = 'wf-log-' + l.level;
        var html = '<div class="wf-log-entry"><span class="wf-log-time">[' + esc(l.time) + ']</span> ';
        html += '<span class="' + cls + '">' + esc(l.message) + '</span>';
        if (l.score != null) {
            var scoreCls = l.score >= 80 ? 'high' : l.score >= 60 ? 'mid' : 'low';
            html += ' <span class="wf-log-score wf-log-score-' + scoreCls + '">' + l.score + '%</span>';
        }
        if (l.url) {
            html += ' <a href="' + esc(l.url) + '" target="_blank" rel="noopener" class="wf-log-link" title="' + esc(l.url) + '">🔗</a>';
        }
        html += '</div>';
        return html;
    }).join('');
    el.scrollTop = el.scrollHeight;
}

function renderStepTimeline(steps) {
    var list = document.getElementById('stepTimelineList');
    if (!list) return;
    if (!steps || steps.length === 0) {
        list.innerHTML = '<li style="color:#6b7280;font-size:0.85rem;">' + t('noWorkflowData') + '</li>';
        return;
    }
    list.innerHTML = steps.map(function(s) {
        var dotClass = 'step-dot step-dot-' + (s.status || 'idle');
        var icon = statusIcon(s.status);
        var elapsed = '';
        if (s.startedAt) {
            var start = new Date(s.startedAt).getTime();
            var end = s.completedAt ? new Date(s.completedAt).getTime() : Date.now();
            var secs = Math.round((end - start) / 1000);
            if (secs >= 60) { elapsed = Math.floor(secs / 60) + 'm ' + (secs % 60) + 's'; }
            else { elapsed = secs + 's'; }
        }
        return '<li>' +
            '<div class="' + dotClass + '">' + icon + '</div>' +
            '<div class="step-info">' +
                '<div class="step-name">' + esc(s.name) + '</div>' +
                '<div class="step-status-text">' + esc(s.status || 'idle') +
                    (elapsed ? ' <span class="step-elapsed">(' + elapsed + ')</span>' : '') +
                '</div>' +
            '</div>' +
        '</li>';
    }).join('');
}

var _prevWfStatus = 'idle';

function updateWfUI(data) {
    var label = document.getElementById('wfStatusLabel');
    var status = data.status || 'idle';
    var prevStatus = _prevWfStatus;  // capture before it gets updated
    if (label) label.textContent = status.toUpperCase();

    // Button visibility
    if (status === 'running') {
        document.getElementById('wfBtnStart').style.display = 'none';
        document.getElementById('wfBtnStop').style.display = 'inline-block';
    } else {
        document.getElementById('wfBtnStart').style.display = 'inline-block';
        document.getElementById('wfBtnStop').style.display = 'none';
    }

    // Progress button pulse effect
    var progressBtn = document.getElementById('btnWorkflowProgress');
    if (progressBtn) {
        if (status === 'running') { progressBtn.classList.add('wf-running'); }
        else { progressBtn.classList.remove('wf-running'); }
    }

    // Status badge
    var badge = document.getElementById('wfProgressBadge');
    if (badge) {
        badge.textContent = status.toUpperCase();
        badge.className = 'wf-badge wf-badge-' + status;
    }

    // Step timeline
    renderStepTimeline(data.steps || []);

    // Log status transitions
    if (status !== _prevWfStatus) {
        if (status === 'running') addWfLog('Workflow started', 'success');
        else if (status === 'completed') addWfLog('Workflow completed', 'success');
        else if (status === 'failed') addWfLog('Workflow failed', 'error');
        else if (status === 'paused') addWfLog('Workflow paused', 'warning');
        _prevWfStatus = status;
    }

    // Log step changes
    if (data.steps) {
        data.steps.forEach(function(s) {
            var key = '_step_' + s.name;
            if (window[key] !== s.status) {
                if (s.status === 'running') addWfLog('Step "' + s.name + '" started', 'info');
                else if (s.status === 'done') addWfLog('Step "' + s.name + '" completed', 'success');
                else if (s.status === 'error') addWfLog('Step "' + s.name + '" failed: ' + (s.error || ''), 'error');
                else if (s.status === 'stuck') addWfLog('Step "' + s.name + '" is stuck', 'warning');
                window[key] = s.status;
            }
        });
    }

    // Sync pipeline logs (job search results with URL + score)
    // _lastPipelineLogIdx === -1 means "locked" — all logs already synced, workflow ended.
    // Only sync new logs incrementally while not locked.
    if (_lastPipelineLogIdx >= 0 && data.pipelineLogs && data.pipelineLogs.length > _lastPipelineLogIdx) {
        var newLogs = data.pipelineLogs.slice(_lastPipelineLogIdx);
        newLogs.forEach(function(l) {
            var level = l.url ? (l.score >= 60 ? 'success' : 'info') : 'info';
            addWfLog(l.msg, level, { url: l.url, score: l.score });
        });
        _lastPipelineLogIdx = data.pipelineLogs.length;
    }

    // When workflow finishes, lock pipeline log index to prevent re-sync of stale logs
    if (status !== 'running' && prevStatus === 'running') {
        _lastPipelineLogIdx = -1;  // locked
    }
    // When workflow starts fresh, unlock pipeline log index
    if (status === 'running' && prevStatus !== 'running') {
        _lastPipelineLogIdx = 0;
    }
}

// ─── Global Settings Modal ───
function openGlobalSettings() {
    document.getElementById('globalSettingsModal').classList.add('visible');
    // Load current values
    fetch(WF_API + '/config').then(r => r.json()).then(cfg => {
        if (cfg.search) {
            document.getElementById('gsCfgMinScore').value = cfg.search.minScore || 60;
            document.getElementById('gsCfgTargetCount').value = cfg.search.targetCount || 10;
            document.getElementById('gsCfgMaxResults').value = cfg.search.maxResults || 30;
        }
    }).catch(() => {});
}
function closeGlobalSettings(e) {
    if (!e || e.target === document.getElementById('globalSettingsModal') || e.target.classList.contains('close-btn'))
        document.getElementById('globalSettingsModal').classList.remove('visible');
}
async function saveGlobalSettings() {
    var body = { search: {
        minScore: parseInt(document.getElementById('gsCfgMinScore').value) || 60,
        targetCount: parseInt(document.getElementById('gsCfgTargetCount').value) || 10,
        maxResults: parseInt(document.getElementById('gsCfgMaxResults').value) || 30
    }};
    try {
        var res = await fetch(WF_API + '/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) { closeGlobalSettings(); alert('Settings saved'); }
        else { var d = await res.json(); alert(d.errors ? d.errors.join(', ') : 'Save failed'); }
    } catch (e) { alert(e.message); }
}

// ─── Add Website Modal ───
function openAddWebsite() { document.getElementById('addWebsiteModal').classList.add('visible'); }
function closeAddWebsite(e) {
    if (!e || e.target === document.getElementById('addWebsiteModal') || e.target.classList.contains('close-btn'))
        document.getElementById('addWebsiteModal').classList.remove('visible');
}
async function submitAddWebsite() {
    var body = {
        name: document.getElementById('awName').value,
        url: document.getElementById('awUrl').value,
        loginUrl: document.getElementById('awLoginUrl').value,
        connectionType: document.getElementById('awConnType').value
    };
    try {
        var res = await fetch(BASE_URL + '/api/platforms/' + _wfSessionId, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        var data = await res.json();
        if (data.success) { closeAddWebsite(); refreshWorkflowStatus(); }
        else { alert(data.error || 'Failed to add'); }
    } catch (e) { alert(e.message); }
}

// ─── Alert Modal ───
function showAlert(title, msg) {
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertMessage').textContent = msg;
    document.getElementById('alertModal').classList.add('visible');
}
function closeAlert(e) {
    if (!e || e.target === document.getElementById('alertModal') || e.target.classList.contains('close-btn'))
        document.getElementById('alertModal').classList.remove('visible');
}

// ─── Alert Settings Modal ───
var ALERT_API = BASE_URL + '/api/workflow/' + _wfSessionId + '/alerts';

function openAlertSettings() {
    document.getElementById('alertSettingsModal').classList.add('visible');
    fetch(ALERT_API + '/config').then(function(r) { return r.json(); }).then(function(cfg) {
        document.getElementById('alertEnabled').checked = cfg.enabled !== false;
        var sd = cfg.stuckDetection || {};
        document.getElementById('alertStuckEnabled').checked = sd.enabled !== false;
        var th = sd.thresholds || {};
        document.getElementById('alertThProfile').value = th.customizeProfile || 30;
        document.getElementById('alertThSearch').value = th.search || 600;
        document.getElementById('alertThGenerate').value = th.generate || 900;
        document.getElementById('alertThApply').value = th.apply || 1200;
        document.getElementById('alertFailureTrigger').value = sd.consecutiveFailureTrigger || 3;
        document.getElementById('alertMaxRetries').value = sd.maxRetries || 2;
        document.getElementById('alertAutoRetry').checked = sd.autoRetry !== false;
        var ch = cfg.channels || {};
        document.getElementById('alertChDesktop').checked = (ch.desktop || {}).enabled !== false;
        document.getElementById('alertChWebhook').checked = !!(ch.webhook || {}).enabled;
        document.getElementById('alertWebhookUrl').value = (ch.webhook || {}).url || '';
        document.getElementById('alertWebhookSecret').value = (ch.webhook || {}).secret || '';
        document.getElementById('webhookFields').style.display = (ch.webhook || {}).enabled ? 'block' : 'none';
        document.getElementById('alertThrottle').value = (cfg.throttle || {}).intervalSeconds || 300;
    }).catch(function() {});
}
function closeAlertSettings(e) {
    if (!e || e.target === document.getElementById('alertSettingsModal') || e.target.classList.contains('close-btn'))
        document.getElementById('alertSettingsModal').classList.remove('visible');
}
document.getElementById('alertChWebhook').addEventListener('change', function() {
    document.getElementById('webhookFields').style.display = this.checked ? 'block' : 'none';
});
async function saveAlertSettings() {
    var body = {
        enabled: document.getElementById('alertEnabled').checked,
        stuckDetection: {
            enabled: document.getElementById('alertStuckEnabled').checked,
            thresholds: {
                customizeProfile: parseInt(document.getElementById('alertThProfile').value) || 30,
                search: parseInt(document.getElementById('alertThSearch').value) || 600,
                generate: parseInt(document.getElementById('alertThGenerate').value) || 900,
                apply: parseInt(document.getElementById('alertThApply').value) || 1200
            },
            consecutiveFailureTrigger: parseInt(document.getElementById('alertFailureTrigger').value) || 3,
            maxRetries: parseInt(document.getElementById('alertMaxRetries').value) || 2,
            autoRetry: document.getElementById('alertAutoRetry').checked
        },
        channels: {
            dashboard: { enabled: true },
            desktop: { enabled: document.getElementById('alertChDesktop').checked },
            webhook: {
                enabled: document.getElementById('alertChWebhook').checked,
                url: document.getElementById('alertWebhookUrl').value,
                secret: document.getElementById('alertWebhookSecret').value
            }
        },
        throttle: { intervalSeconds: parseInt(document.getElementById('alertThrottle').value) || 300 }
    };
    try {
        var res = await fetch(ALERT_API + '/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) { closeAlertSettings(); showToast('Alert settings saved', 'success'); }
        else { showToast('Save failed', 'error'); }
    } catch (e) { showToast(e.message, 'error'); }
}
async function testAlert() {
    try {
        await fetch(ALERT_API + '/test', { method: 'POST' });
    } catch (e) { showToast('Test failed: ' + e.message, 'error'); }
}

// ─── Toast Notifications ───
function showToast(message, type) {
    var container = document.getElementById('toastContainer');
    var toast = document.createElement('div');
    toast.style.cssText = 'pointer-events:auto;padding:0.75rem 1.25rem;border-radius:8px;font-size:0.85rem;font-weight:600;color:#fff;opacity:0;transform:translateX(100%);transition:all 0.3s ease;max-width:350px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    if (type === 'error' || type === 'stuck' || type === 'failure') toast.style.background = '#ef4444';
    else if (type === 'success' || type === 'info') toast.style.background = '#22c55e';
    else toast.style.background = '#6a7eff';
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(function() { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; });
    setTimeout(function() {
        toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)';
        setTimeout(function() { toast.remove(); }, 300);
    }, 5000);
}

// ─── Platform Login Functions ───
async function platformLogin(platformId) {
    // Disable login button — state will be restored by SSE platformUpdate callback
    var loginBtn = document.querySelector('.wf-platform[data-pid="'+platformId+'"] .btn:first-child');
    var confirmBtn = document.querySelector('.wf-platform[data-pid="'+platformId+'"] .btn:nth-child(2)');
    if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = '⟳ ' + t('launching'); loginBtn.style.opacity = '0.6'; }
    if (confirmBtn) { confirmBtn.disabled = true; }
    try {
        var res = await fetch(BASE_URL + '/api/platforms/' + _wfSessionId + '/' + encodeURIComponent(platformId) + '/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
        });
        var data = await res.json();
        if (data.method === 'url') {
            window.open(data.url, '_blank');
        } else if (!data.success) {
            showAlert('Login', data.error || 'Login failed');
        }
        // Always refresh to restore button state.
        // For fingerprint success: SSE will also trigger refresh, but an extra refresh is harmless.
        refreshWorkflowStatus();
    } catch (e) {
        showAlert('Error', e.message);
        refreshWorkflowStatus(); // Restore button state on network error
    }
}

async function deletePlatform(platformId, platformName) {
    if (!confirm((_lang === 'zh-CN' ? '确认删除平台 ' : 'Remove platform ') + platformName + '?')) return;
    try {
        var res = await fetch(BASE_URL + '/api/platforms/' + _wfSessionId + '/' + encodeURIComponent(platformId), {
            method: 'DELETE'
        });
        var data = await res.json();
        if (data.success) { refreshWorkflowStatus(); }
        else { showAlert('Delete', data.error || 'Delete failed'); }
    } catch (e) { showAlert('Error', e.message); }
}

async function confirmLogin(platformId) {
    try {
        var res = await fetch(BASE_URL + '/api/platforms/' + _wfSessionId + '/' + encodeURIComponent(platformId) + '/confirm-login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
        });
        var data = await res.json();
        if (data.success) { refreshWorkflowStatus(); }
        else { showAlert('Confirm', data.error || 'Confirm failed'); }
    } catch (e) { showAlert('Error', e.message); }
}

async function bindEnv(platformId) {
    var sel = document.querySelector('#env_' + platformId);
    if (!sel) return;
    var envId = sel.value;
    if (!envId) { showAlert('Bind', 'Select an environment first'); return; }
    try {
        var res = await fetch(BASE_URL + '/api/platforms/' + _wfSessionId + '/' + encodeURIComponent(platformId) + '/bind-env', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ envId: envId })
        });
        var data = await res.json();
        if (data.success) { refreshWorkflowStatus(); }
        else { showAlert('Bind', data.error || 'Bind failed'); }
    } catch (e) { showAlert('Error', e.message); }
}

async function populateEnvSelectors() {
    try {
        var res = await fetch(BASE_URL + '/api/envs');
        var envs = await res.json();
        var selects = document.querySelectorAll('.wf-env-select');
        selects.forEach(function(sel) {
            sel.innerHTML = '<option value="">-- Select Env --</option>' +
                envs.map(function(e) { return '<option value="' + e.id + '">' + esc(e.name) + '</option>'; }).join('');
        });
    } catch {}
}

// ─── Stats Panel ───
async function refreshStats() {
    try {
        var res = await fetch(WF_API + '/stats');
        var data = await res.json();
        if (data.jobs) {
            document.getElementById('statJobsTotal').textContent = data.jobs.total || 0;
            document.getElementById('statJobsMatched').textContent = data.jobs.matched || 0;
            document.getElementById('statJobsApplied').textContent = data.jobs.submitted || 0;
        }
        if (data.platforms) {
            document.getElementById('statPlatformsReady').textContent = data.platforms.ready + '/' + data.platforms.total;
        }
        document.getElementById('statWfStatus').textContent = (data.workflow && data.workflow.status) || 'idle';
        document.getElementById('statHistoryCount').textContent = data.history || 0;
    } catch {}
}

// ─── Script Builder ───
async function buildToolForPlatform(platformId, toolType) {
    try {
        var res = await fetch(BASE_URL + '/api/platforms/' + _wfSessionId + '/' + encodeURIComponent(platformId) + '/tools/' + toolType + '/build', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
        });
        var data = await res.json();
        if (!data.success) alert(data.error || 'Build failed');
        refreshWorkflowStatus();
    } catch (e) { alert(e.message); }
}

async function executeSearchForPlatform(platformId) {
    var keywords = prompt('Search keywords:', 'software engineer');
    if (!keywords) return;
    try {
        var res = await fetch(BASE_URL + '/api/platforms/' + _wfSessionId + '/' + encodeURIComponent(platformId) + '/tools/search/execute', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords: keywords, location: '' })
        });
        var data = await res.json();
        if (data.success) { alert('Found ' + (data.jobs || []).length + ' jobs'); refresh(); }
        else { alert(data.error || 'Search failed'); }
    } catch (e) { alert(e.message); }
}

// ─── Job Filter & Pagination ───
var _jobPage = 1;
var _jobPageSize = 20;

async function filterJobs() {
    _jobPage = 1;
    await refreshJobRecords();
}

async function refreshJobRecords() {
    var status = document.getElementById('jobFilterStatus').value;
    var minScore = document.getElementById('jobFilterMinScore').value;
    var params = 'page=' + _jobPage + '&pageSize=' + _jobPageSize;
    if (status) params += '&status=' + status;
    if (minScore) params += '&minScore=' + minScore;
    try {
        var res = await fetch(BASE_URL + '/api/jobs/' + _wfSessionId + '?' + params);
        var data = await res.json();
        var jobBody = document.getElementById('jobTableBody');
        var noJobsEl = document.getElementById('noJobs');
        var paginationEl = document.getElementById('jobPagination');
        if (data.jobs && data.jobs.length > 0) {
            jobBody.innerHTML = data.jobs.map(renderJobRow).join('');
            noJobsEl.style.display = 'none';
            document.getElementById('jobTable').style.display = 'table';
            // Render pagination
            var pages = data.totalPages || 1;
            var html = '';
            html += '<button onclick="goJobPage(' + Math.max(1, _jobPage - 1) + ')"' + (_jobPage <= 1 ? ' disabled' : '') + '>&lt;</button>';
            for (var i = 1; i <= pages; i++) {
                html += '<button class="' + (i === _jobPage ? 'active' : '') + '" onclick="goJobPage(' + i + ')">' + i + '</button>';
            }
            html += '<button onclick="goJobPage(' + Math.min(pages, _jobPage + 1) + ')"' + (_jobPage >= pages ? ' disabled' : '') + '>&gt;</button>';
            paginationEl.innerHTML = html;
        } else {
            jobBody.innerHTML = '';
            noJobsEl.style.display = 'block';
            document.getElementById('jobTable').style.display = 'none';
            paginationEl.innerHTML = '';
        }
    } catch (e) { console.error('[jobs]', e); }
}

function goJobPage(p) {
    _jobPage = p;
    refreshJobRecords();
}

refresh();
pollWfStatus();
setInterval(function() { if (_pausePolling) return; refresh(); refreshWorkflowStatus(); pollWfStatus(); refreshStats(); switchLang(_lang); }, 5000);
// Periodic stuck check with alerts (every 30s)
setInterval(function() { fetch(ALERT_API + '/check', { method: 'POST' }).catch(function(){}); }, 30000);
// Initial load
refreshWorkflowStatus();
populateEnvSelectors();

// ─── SSE Live Push ───
var _evtSource = null;
function connectSSE() {
    if (_evtSource) _evtSource.close();
    _evtSource = new EventSource(BASE_URL + '/api/events/' + _wfSessionId);
    _evtSource.addEventListener('platformUpdate', function(e) {
        try { refreshWorkflowStatus(); } catch (_) {}
    });
    _evtSource.addEventListener('workflowUpdate', function(e) {
        try { pollWfStatus(); } catch (_) {}
    });
    _evtSource.addEventListener('alert', function(e) {
        try {
            var data = JSON.parse(e.data);
            showToast(data.title + ': ' + data.message, data.type || 'info');
        } catch (_) {}
    });
    _evtSource.addEventListener('desktopNotify', function(e) {
        try {
            var data = JSON.parse(e.data);
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(data.title, { body: data.body, tag: data.tag });
            } else if ('Notification' in window && Notification.permission !== 'denied') {
                Notification.requestPermission().then(function(p) {
                    if (p === 'granted') new Notification(data.title, { body: data.body, tag: data.tag });
                });
            }
        } catch (_) {}
    });
    _evtSource.onerror = function() {
        // Reconnect after 5s on error
        setTimeout(connectSSE, 5000);
    };
}
connectSSE();

// ─── Visibility-based connection management ───
// Chrome limits 6 connections per host (HTTP/1.1).
// When tab is hidden, close SSE and pause polling to free connections
// for other tabs on the same host.
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        _pausePolling = true;
        if (_evtSource) { _evtSource.close(); _evtSource = null; }
    } else {
        _pausePolling = false;
        if (!_evtSource) connectSSE();
        refresh(); refreshWorkflowStatus(); pollWfStatus(); refreshStats();
    }
});
</script>
</body>
</html>`;
}

/**
 * Broadcast pipeline progress update via SSE.
 * @param {string} sessionId
 * @param {object} update - { phase, message, round }
 */
function updatePipelineProgress(sessionId, update) {
    _broadcastSSE(sessionId, 'pipelineProgress', update);
}

function getDashboardURL(sessionId) {
    return `http://127.0.0.1:${_port}/dashboard/${encodeURIComponent(sessionId)}`;
}

module.exports = {
    start, stop, getDashboardURL, DASHBOARD_PORT,
    // Job workflow
    upsertJobCard, updateJobStatus, getJobCards, getJobStats,
    // Platform workflow status
    updatePlatformCell, getWorkflowStatus, computeCellVisual,
    clearPlatformStatuses, removePlatformStatus,
    // Pipeline progress
    updatePipelineProgress,
    // SSE broadcaster (for apply step + external modules)
    _getSSEBroadcaster: () => _broadcastSSE
};
