'use strict';

const http = require('http');

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
    if (!_platformService) _platformService = require('./workflow/platformService');
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
let _port = DASHBOARD_PORT;
let _server = null;
let _stateGetter = null; // function that returns current agent state

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
                    const { minScore, targetCount, maxResults, envId } = JSON.parse(body);
                    const state = _stateGetter ? _stateGetter() : {};
                    const answers = state.selectedAnswers?.[sessionId] || {};
                    const sections = state.profileSections?.[sessionId] || {};
                    const result = getSearchPipeline().startPipeline(
                        sessionId,
                        { minScore, targetCount, maxResults, envId: envId || null },
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
                    const sections = state.profileSections?.[sessionId] || {};
                    const result = await getSearchPipeline().generateResume(sessionId, jobUrl, sections);
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

        // GET /api/workflow/:sid/status — get workflow status
        const wfEngStatusMatch = url.match(/^\/api\/workflow\/([^/]+)\/status$/);
        if (wfEngStatusMatch && req.method === 'GET') {
            const sid = decodeURIComponent(wfEngStatusMatch[1]);
            const status = getWorkflowEngine().getStatus(sid);
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
                    const result = await getPlatformService().launchLogin(sid, pid, body);
                    if (result.success) {
                        updatePlatformCell(sid, pid, { cell: 'login', status: 'verifying', message: 'Login launched' });
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
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
                    // Check AI provider
                    if (!body.aiInvoke && typeof body.aiInvoke !== 'function') {
                        const state = _stateGetter ? _stateGetter() : {};
                        if (!state.currentProvider) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            return res.end(JSON.stringify({ success: false, error: 'No AI provider configured. Set an AI provider first.' }));
                        }
                    }
                    updatePlatformCell(sid, pid, { cell: 'search', status: 'building', message: 'Building search tool...' });
                    const result = await getScriptBuilder().buildTool(sid, pid, 'search', body);
                    if (result.success) {
                        const plat = getPlatformStore().getPlatform(sid, pid);
                        updatePlatformCell(sid, pid, {
                            cell: 'search', status: 'ready',
                            version: plat?.tools?.search?.version || 1,
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
    return _platformStatus.get(sessionId);
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
        if (l.status === 'verifying') return { visual: 'running', tip: 'Verifying login...', action: null };
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
        if (tool.status === 'error') return { visual: 'error', tip: `Build failed: ${tool.message || 'Unknown'}`, action: 'rebuild' };
        if (tool.status === 'ready') {
            // Check if login expired → warning
            const l = platform.login || {};
            if (l.status === 'verified' && (Date.now() - (l.verifiedAt || 0)) >= LOGIN_TTL_MS) {
                return { visual: 'warning', tip: `${cellType} tool ready (v${tool.version || 1}) but session may have expired. Re-login first.`, action: 'relogin' };
            }
            return { visual: 'ready', tip: `${cellType} tool ready (v${tool.version || 1})`, action: null };
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
        }
        if ((cell === 'search' || cell === 'apply') && update.version !== undefined) {
            p[cell].version = update.version;
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
  .wf-platform__header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; font-weight: 600; font-size: 0.95rem; }
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
  .wf-cell--locked   { outline: 2px solid #374151; opacity: 0.35; }
  @keyframes wf-pulse-green  { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.4)} 50%{box-shadow:0 0 8px 4px rgba(16,185,129,0.15)} }
  @keyframes wf-pulse-red    { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.4)}  50%{box-shadow:0 0 8px 4px rgba(239,68,68,0.15)} }
  @keyframes wf-pulse-purple { 0%,100%{box-shadow:0 0 0 0 rgba(139,92,246,0.4)} 50%{box-shadow:0 0 8px 4px rgba(139,92,246,0.15)} }
  @keyframes wf-pulse-amber  { 0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0.4)} 50%{box-shadow:0 0 8px 4px rgba(245,158,11,0.15)} }

  /* Cell status overlays */
  .cell-running { outline: 3px solid #10b981; animation: wf-pulse-green 2s ease-in-out infinite; }
  .cell-stuck { outline: 3px solid #ef4444; animation: wf-pulse-red 2s ease-in-out infinite; background: rgba(239,68,68,0.08); }
  .cell-building { outline: 3px dashed #8b5cf6; animation: wf-pulse-purple 2s ease-in-out infinite; }

  /* Control bar */
  .controlBar { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; padding: 0.75rem 0; }

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
  <label style="margin-left:auto;font-size:0.82rem;color:#9da0c3;cursor:pointer;">
    <input type="checkbox" id="asyncToggle"> Async steps
  </label>
  <button class="btn btn-sm" style="background:#3d3f5a;color:#dfe3ff;" onclick="openGlobalSettings()" data-i18n="settings">Settings</button>
  <button class="btn btn-sm" style="background:#3d3f5a;color:#dfe3ff;" onclick="openAddWebsite()" data-i18n="addWebsite">+ Add Website</button>
  <button class="btn btn-sm" style="background:#3d3f5a;color:#dfe3ff;" id="langToggle" onclick="switchLang(_lang === 'en' ? 'zh-CN' : 'en'); this.textContent = _lang === 'en' ? '中文' : 'EN';">中文</button>
</div>

<h2 data-i18n="direction">Direction</h2>
<div class="card">
  <div class="grid-2" id="direction"></div>
</div>

<h2 data-i18n="profile">Profile</h2>
<div class="card">
  <div class="grid-2" id="profile"></div>
</div>

<h2 data-i18n="workflowProgress">Workflow Progress</h2>
<div class="card">
  <table>
    <thead><tr><th></th><th data-i18n="step">Step</th><th data-i18n="status">Status</th></tr></thead>
    <tbody id="subtasks"></tbody>
  </table>
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
    <button class="close-btn" onclick="closeModal()">&times;</button>
    <h3 id="modalTitle"></h3>
    <div class="content" id="modalContent"></div>
  </div>
</div>

<!-- Global Settings modal -->
<div class="modal-overlay" id="globalSettingsModal" onclick="closeGlobalSettings(event)">
  <div class="modal" style="max-width:500px;">
    <button class="close-btn" onclick="closeGlobalSettings()">&times;</button>
    <h3 data-i18n="globalSettings">Global Settings</h3>
    <div class="modal-form">
      <label>Min Match Score (%)</label>
      <input type="number" id="gsCfgMinScore" min="0" max="100" step="5" value="60">
      <label>Target Matches</label>
      <input type="number" id="gsCfgTargetCount" min="1" max="100" value="10">
      <label>Max Search Results</label>
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
        step: 'Step', status: 'Status', title: 'Title', company: 'Company',
        location: 'Location', score: 'Score', applied: 'Applied'
    },
    'zh-CN': {
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
        step: '步骤', status: '状态', title: '职位', company: '公司',
        location: '地点', score: '匹配度', applied: '已申请'
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
        showModal('Tailored Resume — ' + (data.job?.title || ''), data.markdown || 'No content generated');
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
        showModal('Cover Letter — ' + (data.job?.title || ''), data.markdown || 'No content generated');
        btn.textContent = 'Done'; refresh();
    } catch (e) { alert(e.message); btn.disabled = false; btn.textContent = 'Cover Letter'; }
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
function showModal(title, content) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalContent').textContent = content;
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
    return '<tr>' +
        '<td class="title-cell"><a href="' + url + '" target="_blank">' + esc(job.title || 'Untitled') + '</a><span class="company">' + esc(job.company || '') + '</span></td>' +
        '<td>' + esc(job.location || '') + '</td>' +
        '<td>' + esc(job.salary || '—') + '</td>' +
        '<td class="' + scCls + '">' + scVal + '</td>' +
        '<td><span class="' + statusCls + '">' + esc(job.status || 'discovered') + '</span></td>' +
        '<td class="actions">' +
            '<button class="btn btn-primary btn-sm" onclick="genResume(\\'' + url.replace(/'/g, "\\\\'") + '\\')">Resume</button>' +
            '<button class="btn btn-warning btn-sm" onclick="genCoverLetter(\\'' + url.replace(/'/g, "\\\\'") + '\\')">Cover Letter</button>' +
            '<button class="btn btn-success btn-sm" onclick="markApplied(\\'' + url.replace(/'/g, "\\\\'") + '\\')">Applied</button>' +
            '<button class="btn btn-sm" style="background:#6366f1;color:#fff" onclick="openJob(\\'' + url.replace(/'/g, "\\\\'") + '\\')">Link</button>' +
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
    subtasksEl.innerHTML = (data.subtasks || []).map(function(t) {
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

var ACTION_LABELS = { login: 'Login', relogin: 'Re-login', build: 'Build', rebuild: 'Rebuild' };
var CELL_ICONS = { idle: '○', ready: '✓', running: '⟳', building: '⟳', warning: '⚠', error: '✗', locked: '🔒' };

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
    var html = '<div class="wf-platform" data-pid="' + esc(p.id) + '">';
    html += '<div class="wf-platform__header">' + esc(p.icon) + ' ' + esc(p.name) + '</div>';
    html += '<div class="wf-platform__env"><select class="wf-env-select" id="env_' + esc(p.id) + '" onchange="bindEnv(\\''+esc(p.id)+'\\')"></select></div>';
    html += '<div class="wf-platform__actions">';
    html += '<button class="btn btn-sm" onclick="platformLogin(\\''+esc(p.id)+'\\')">'+t('login')+'</button>';
    html += '<button class="btn btn-sm" onclick="confirmLogin(\\''+esc(p.id)+'\\')">'+t('confirm')+'</button>';
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
    try {
        await fetch(WF_URL + '/' + encodeURIComponent(platformId) + '/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cell: cellType, action: action })
        });
        refreshWorkflowStatus();
    } catch (e) { alert('Action failed: ' + e.message); }
}

// ─── Workflow Control Bar ───
var WF_API = BASE_URL + '/api/workflow/' + _wfSessionId;

async function wfStart() {
    try {
        var res = await fetch(WF_API + '/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        var data = await res.json();
        if (data.success) {
            document.getElementById('wfBtnStart').style.display = 'none';
            document.getElementById('wfBtnStop').style.display = 'inline-block';
        } else { alert(data.error || 'Start failed'); }
    } catch (e) { alert(e.message); }
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

function updateWfUI(data) {
    var label = document.getElementById('wfStatusLabel');
    if (label) label.textContent = (data.status || 'idle').toUpperCase();
    if (data.status === 'running') {
        document.getElementById('wfBtnStart').style.display = 'none';
        document.getElementById('wfBtnStop').style.display = 'inline-block';
    } else {
        document.getElementById('wfBtnStart').style.display = 'inline-block';
        document.getElementById('wfBtnStop').style.display = 'none';
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

// ─── Platform Login Functions ───
async function platformLogin(platformId) {
    try {
        var res = await fetch(BASE_URL + '/api/platforms/' + _wfSessionId + '/' + encodeURIComponent(platformId) + '/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
        });
        var data = await res.json();
        if (data.method === 'url') { window.open(data.url, '_blank'); }
        else if (!data.success) { showAlert('Login', data.error || 'Login failed'); }
        refreshWorkflowStatus();
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
setInterval(function() { refresh(); refreshWorkflowStatus(); pollWfStatus(); refreshStats(); switchLang(_lang); }, 5000);
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
    _evtSource.onerror = function() {
        // Reconnect after 5s on error
        setTimeout(connectSSE, 5000);
    };
}
connectSSE();
</script>
</body>
</html>`;
}

function getDashboardURL(sessionId) {
    return `http://127.0.0.1:${_port}/dashboard/${encodeURIComponent(sessionId)}`;
}

module.exports = {
    start, stop, getDashboardURL, DASHBOARD_PORT,
    // Job workflow
    upsertJobCard, updateJobStatus, getJobCards, getJobStats,
    // Platform workflow status
    updatePlatformCell, getWorkflowStatus, computeCellVisual
};
