'use strict';

const http = require('http');

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
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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

function getDashboardData(sessionId) {
    const state = _stateGetter ? _stateGetter() : {};
    const answers = state.selectedAnswers?.[sessionId] || {};
    const sections = state.profileSections?.[sessionId] || {};
    const subtasks = state.subtasks?.[sessionId] || [];
    const intent = state.intentFiles?.[sessionId] || {};

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
        builtAt: new Date().toISOString()
    };
}

function buildDashboardHTML(sessionId) {
    const apiUrl = `http://127.0.0.1:${_port}/api/dashboard/${encodeURIComponent(sessionId)}`;
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
  .feature-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-top: 0.5rem; }
  .feature-card { background: #2d2f4a; border: 1px dashed #3d4060; border-radius: 8px; padding: 1.2rem; text-align: center; }
  .feature-card .icon { font-size: 2rem; margin-bottom: 0.5rem; }
  .feature-card h4 { color: #8b9aff; margin: 0 0 0.4rem 0; }
  .feature-card p { color: #9da0c3; font-size: 0.85rem; margin: 0; }
  .badge { display: inline-block; font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 999px; background: rgba(106,126,255,0.2); color: #8b9aff; margin-top: 0.5rem; }
  .refresh-indicator { position: fixed; top: 8px; right: 12px; font-size: 0.7rem; color: #555; }
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

<h2>Job Search Tools</h2>
<div class="feature-grid">
  <div class="feature-card">
    <div class="icon">&#x1F50D;</div>
    <h4>Match Jobs</h4>
    <p>Score and rank job postings against your profile and preferences</p>
    <span class="badge">Coming Soon</span>
  </div>
  <div class="feature-card">
    <div class="icon">&#x1F4C4;</div>
    <h4>Resume Builder</h4>
    <p>Generate tailored resumes for each job target</p>
    <span class="badge">Coming Soon</span>
  </div>
  <div class="feature-card">
    <div class="icon">&#x2709;&#xFE0F;</div>
    <h4>Cover Letter</h4>
    <p>Write customized cover letters per application</p>
    <span class="badge">Coming Soon</span>
  </div>
</div>

<script>
const API_URL = ${JSON.stringify(apiUrl)};
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

function render(data) {
    const d = data.direction || {};
    document.getElementById('direction').innerHTML =
        renderItem('Job Title', d.jobTitle) +
        renderItem('Location', d.location) +
        renderItem('Work Mode', d.workMode) +
        renderItem('Target Salary', d.salary ? d.salary + 'K' : '');

    const p = data.profile || {};
    let profileHtml =
        renderItem('Basic Info', p.basic) +
        renderItem('Key Skills', p.skills) +
        renderItem('Experience', p.experience) +
        renderItem('Education', p.education);
    if (p.highlights) {
        profileHtml += renderItem('Highlights', p.highlights, true);
    }
    document.getElementById('profile').innerHTML = profileHtml;

    const subtasksEl = document.getElementById('subtasks');
    subtasksEl.innerHTML = (data.subtasks || []).map(function(t) {
        return '<tr><td>' + statusIcon(t.status) + '</td><td>' + esc(t.key) + '</td><td>' + esc(t.status) + '</td></tr>';
    }).join('');

    document.getElementById('meta').textContent =
        'Session: ' + (data.sessionId || '').slice(0, 8) +
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

module.exports = { start, stop, getDashboardURL, DASHBOARD_PORT };
