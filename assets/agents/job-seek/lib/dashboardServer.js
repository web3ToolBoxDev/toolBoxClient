'use strict';

const http = require('http');
const searchPipeline = require('./searchPipeline');

const DASHBOARD_PORT = 30003;
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
    if (_server) return _port;
    _stateGetter = getState;
    _port = port || DASHBOARD_PORT;

    _server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            return res.end();
        }

        const url = (req.url || '').split('?')[0];

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
                    const { minScore, targetCount, maxResults } = JSON.parse(body);
                    const state = _stateGetter ? _stateGetter() : {};
                    const answers = state.selectedAnswers?.[sessionId] || {};
                    const sections = state.profileSections?.[sessionId] || {};
                    const result = searchPipeline.startPipeline(
                        sessionId,
                        { minScore, targetCount, maxResults },
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
            const result = searchPipeline.stopPipeline(sessionId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
        }

        // GET /api/pipeline/:sessionId/status — get pipeline status
        const pipeStatusMatch = url.match(/^\/api\/pipeline\/(.+)\/status$/);
        if (pipeStatusMatch && req.method === 'GET') {
            const sessionId = decodeURIComponent(pipeStatusMatch[1]);
            const result = searchPipeline.getPipelineStatus(sessionId);
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
                    const result = await searchPipeline.generateResume(sessionId, jobUrl, sections);
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
                    const result = await searchPipeline.generateCoverLetter(sessionId, jobUrl, sections);
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
                    const result = searchPipeline.markApplied(sessionId, jobUrl, note);
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
            const result = searchPipeline.getHistory(sessionId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(result));
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
        console.log(`[dashboardServer] listening on http://127.0.0.1:${_port}`);
    });

    _server.on('error', (err) => {
        console.error('[dashboardServer] server error:', err.message);
        _server = null;
    });

    return _port;
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
    console.log(`[dashboard:data] session=${sessionId.slice(0, 8)} | profile sections: [${sectionKeys.join(', ')}] | skills preview: "${(sections.skills || '').slice(0, 80)}"`);

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

  /* Search config panel */
  .search-config { display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap; }
  .search-config .field { display: flex; flex-direction: column; gap: 0.3rem; }
  .search-config .field label { color: #9da0c3; font-size: 0.8rem; }
  .search-config input[type="number"] { background: #2d2f4a; border: 1px solid #3d3f5a; border-radius: 6px; color: #dfe3ff; padding: 0.5rem 0.75rem; width: 100px; font-size: 0.95rem; }
  .search-config input:focus { border-color: #8b9aff; outline: none; }
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

  /* Pipeline status */
  .pipe-status { display: flex; align-items: center; gap: 1rem; margin-top: 0.75rem; flex-wrap: wrap; }
  .pipe-status .phase { font-weight: 600; font-size: 0.9rem; }
  .pipe-status .progress-bar { flex: 1; min-width: 200px; height: 8px; background: #2d2f4a; border-radius: 4px; overflow: hidden; }
  .pipe-status .progress-fill { height: 100%; background: #6a7eff; transition: width 0.3s; }
  .pipe-status .counts { font-size: 0.8rem; color: #9da0c3; }
  .pipe-errors { margin-top: 0.5rem; }
  .pipe-errors .error { color: #f87171; font-size: 0.8rem; margin-top: 0.25rem; }

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

  /* Artifact modal */
  .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 100; }
  .modal-overlay.visible { display: flex; align-items: center; justify-content: center; }
  .modal { background: #242640; border: 1px solid #2d2f4a; border-radius: 12px; padding: 2rem; max-width: 800px; width: 90%; max-height: 80vh; overflow-y: auto; }
  .modal h3 { color: #8b9aff; margin-top: 0; }
  .modal .content { background: #1a1b2e; border-radius: 8px; padding: 1rem; white-space: pre-wrap; font-size: 0.9rem; line-height: 1.6; }
  .modal .close-btn { float: right; background: none; border: none; color: #9da0c3; font-size: 1.5rem; cursor: pointer; }
</style>
</head>
<body>
<h1>Job Search Dashboard</h1>
<p class="meta" id="meta"></p>
<div class="refresh-indicator" id="refresh">Auto-refresh: active</div>

<h2>Direction</h2>
<div class="card">
  <div class="grid-2" id="direction"></div>
</div>

<h2>Profile</h2>
<div class="card">
  <div class="grid-2" id="profile"></div>
</div>

<h2>Workflow Progress</h2>
<div class="card">
  <table>
    <thead><tr><th></th><th>Step</th><th>Status</th></tr></thead>
    <tbody id="subtasks"></tbody>
  </table>
</div>

<h2>Automated Job Search</h2>
<div class="card">
  <div class="search-config">
    <div class="field">
      <label>Min Match Score (%)</label>
      <input type="number" id="cfgMinScore" value="60" min="0" max="100" step="5">
    </div>
    <div class="field">
      <label>Target Matches</label>
      <input type="number" id="cfgTargetCount" value="10" min="1" max="100">
    </div>
    <div class="field">
      <label>Max Search Results</label>
      <input type="number" id="cfgMaxResults" value="30" min="5" max="200" step="5">
    </div>
    <button class="btn btn-primary" id="btnStart" onclick="startSearch()">Start Search</button>
    <button class="btn btn-danger" id="btnStop" onclick="stopSearch()" style="display:none;">Stop</button>
  </div>
  <div class="pipe-status" id="pipeStatus" style="display:none;">
    <span class="phase" id="pipePhase"></span>
    <div class="progress-bar"><div class="progress-fill" id="pipeFill" style="width:0%"></div></div>
    <span class="counts" id="pipeCounts"></span>
  </div>
  <div class="pipe-errors" id="pipeErrors"></div>
</div>

<h2>Application Pipeline</h2>
<div class="card">
  <div class="pipeline" id="pipeline"></div>
</div>

<div class="tab-bar">
  <div class="tab active" onclick="switchTab('listings')">Job Listings</div>
  <div class="tab" onclick="switchTab('history')">Application History</div>
</div>

<div class="tab-content active" id="tab-listings">
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

<script>
const API_URL = ${JSON.stringify(apiUrl)};
const PIPE_URL = ${JSON.stringify(pipelineBase)};
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

// ─── Pipeline control ───
async function startSearch() {
    var minScore = parseInt(document.getElementById('cfgMinScore').value) || 60;
    var targetCount = parseInt(document.getElementById('cfgTargetCount').value) || 10;
    var maxResults = parseInt(document.getElementById('cfgMaxResults').value) || 30;
    try {
        var res = await fetch(PIPE_URL + '/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minScore: minScore, targetCount: targetCount, maxResults: maxResults })
        });
        var data = await res.json();
        if (data.error) { alert('Error: ' + data.error); return; }
        document.getElementById('btnStart').style.display = 'none';
        document.getElementById('btnStop').style.display = 'inline-block';
    } catch (e) { alert('Failed to start: ' + e.message); }
}

async function stopSearch() {
    try {
        await fetch(PIPE_URL + '/stop', { method: 'POST' });
        document.getElementById('btnStart').style.display = 'inline-block';
        document.getElementById('btnStop').style.display = 'none';
    } catch (e) { alert('Failed to stop: ' + e.message); }
}

async function refreshPipelineStatus() {
    try {
        var res = await fetch(PIPE_URL + '/status');
        var data = await res.json();
        var statusEl = document.getElementById('pipeStatus');
        var errorsEl = document.getElementById('pipeErrors');
        if (!data.progress) { statusEl.style.display = 'none'; return; }

        statusEl.style.display = 'flex';
        var p = data.progress;
        document.getElementById('pipePhase').textContent = p.phase || 'idle';
        var pct = data.config && data.config.targetCount ? Math.min(100, Math.round((p.qualified / data.config.targetCount) * 100)) : 0;
        document.getElementById('pipeFill').style.width = pct + '%';
        document.getElementById('pipeCounts').textContent =
            'Searched: ' + p.searched + ' | Parsed: ' + p.parsed + ' | Matched: ' + p.matched + ' | Qualified: ' + p.qualified + '/' + (data.config?.targetCount || '?');

        if (data.running) {
            document.getElementById('btnStart').style.display = 'none';
            document.getElementById('btnStop').style.display = 'inline-block';
        } else {
            document.getElementById('btnStart').style.display = 'inline-block';
            document.getElementById('btnStop').style.display = 'none';
        }

        errorsEl.innerHTML = (p.errors || []).map(function(e) { return '<div class="error">' + esc(e) + '</div>'; }).join('');
    } catch {}
}

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
            render(data);
            document.getElementById('refresh').textContent = 'Auto-refresh: active';
        }
    } catch (e) {
        document.getElementById('refresh').textContent = 'Auto-refresh: disconnected';
    }
    refreshPipelineStatus();
}

refresh();
setInterval(refresh, 5000);
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
    upsertJobCard, updateJobStatus, getJobCards, getJobStats
};
