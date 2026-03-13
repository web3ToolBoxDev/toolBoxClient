'use strict';
/**
 * Start the dashboardServer with mock state data for preview testing.
 * Fetches real browser environment data from the backend (port 30001).
 * Usage: node scripts/mock-dashboard.js
 */
const path = require('path');
const http = require('http');
const dashboardServer = require(path.resolve(__dirname, '../assets/agents/job-seek/lib/dashboardServer'));
const platformStore = require(path.resolve(__dirname, '../assets/agents/job-seek/lib/workflow/platformStore'));
const workflowStore = require(path.resolve(__dirname, '../assets/agents/job-seek/lib/workflow/workflowStore'));

const SESSION_ID = 'mock_preview_session';
const BACKEND_PORT = 30001;

// ─── Fetch real env data from backend ───
function fetchJSON(urlPath) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${BACKEND_PORT}/api${urlPath}`, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (_) { reject(new Error('Invalid JSON from ' + urlPath)); }
            });
        }).on('error', reject);
    });
}

async function main() {
    // ─── Fetch real environments from backend ───
    let envs = [];
    let envsData = {};
    try {
        const fpRes = await fetchJSON('/getFingerPrints');
        if (fpRes.success && fpRes.data) {
            envsData = fpRes.data;
            envs = Object.values(fpRes.data).map(e => ({ id: e.id, name: e.name }));
            console.log(`[mock-dashboard] Loaded ${envs.length} real envs from backend: ${envs.map(e => e.name).join(', ')}`);
        }
    } catch (e) {
        console.warn(`[mock-dashboard] Could not fetch envs from backend (port ${BACKEND_PORT}): ${e.message}`);
        console.warn('[mock-dashboard] Using fallback envs');
        envs = [
            { id: 'env_001', name: '环境1' },
            { id: 'env_002', name: '环境2' },
            { id: 'env_003', name: '环境3' }
        ];
    }

    // Find 环境1's real ID
    const env1 = envs.find(e => e.name === '环境1');
    const env1Id = env1 ? env1.id : envs[0]?.id || 'env_001';
    console.log(`[mock-dashboard] 环境1 bound ID: ${env1Id}`);

    const mockState = {
        activeSessionId: SESSION_ID,
        sessions: [{ id: SESSION_ID, name: 'Job Search Test', updatedAt: new Date().toISOString() }],
        envs,
        envsData,
        // AI provider config — claude default CLI
        currentProvider: 'claude-code',
        currentModel: 'default',
        currentSubProvider: '',
        runtimeApiKey: '',
        selectedAnswers: {
            [SESSION_ID]: {
                q_job_title: 'Full Stack Developer',
                q_location: 'Toronto, Canada',
                q_salary: '60',
                q_work_mode: ''
            }
        },
        profileSections: {
            [SESSION_ID]: {
                summary: 'Full Stack Software Engineer with 10+ years of experience designing and building scalable desktop and web-based systems using Electron, React, Node.js (Express), Rust, and MySQL. Strong expertise in RESTful API architecture, real-time WebSocket communication, distributed system design, and Docker-based CI/CD deployments in Linux environments.',
                experience: [
                    'ToolBoxClient (Founder & Lead Developer) — 270+ Stars | 100+ Forks: Architected modular automation platform using Electron, React, Node.js (Express). Designed RESTful backend APIs, real-time WebSocket protocol with heartbeat/auto-reconnect, plugin-based execution engine for concurrent workflows.',
                    'web3toolbox.app (Production Platform): Full-stack production system with React frontend + Rust backend. RESTful APIs, MySQL + Redis, Docker-based deployment with Jenkins CI/CD, Nginx reverse proxy on Linux.',
                    'Data & Analytics: ETL pipelines with Java (Kettle), ODS data warehouse, SQL aggregation/transformation, analytics models (Logistic Regression, XGBoost).'
                ],
                education: [
                    'Fanshawe College — Web Development & Internet Applications (Expected May 2026)',
                    'Sichuan Normal University — B.Eng., Electronic Information Engineering (2013)'
                ],
                skills: ['React', 'JavaScript', 'TypeScript', 'Electron', 'Node.js', 'Express', 'Python', 'Flask', 'Rust', 'MySQL', 'Redis', 'Docker', 'Jenkins', 'Linux', 'Nginx', 'REST APIs', 'WebSocket', 'Git', 'Distributed Systems'],
                contact: { name: 'Ying Zhang', email: 'zhangying201707@gmail.com', phone: '+1 548-991-4169', location: 'London, ON, Canada (Open to Relocation Across Ontario)' }
            }
        },
        subtasks: {
            [SESSION_ID]: [
                { key: 'customizeProfile', status: 'idle' },
                { key: 'search', status: 'idle' },
                { key: 'generate', status: 'idle' },
                { key: 'apply', status: 'idle' }
            ]
        },
        intentFiles: {},
        intentSummary: {},
        artifacts: {}
    };

    // Start server
    const port = dashboardServer.start(() => mockState);
    console.log(`[mock-dashboard] Dashboard available at http://127.0.0.1:${port}/dashboard/${SESSION_ID}`);

    // Seed workflow config (auto-creates default based on location)
    const location = mockState.selectedAnswers[SESSION_ID].q_location || 'Toronto, Canada';
    const wfConfig = workflowStore.getConfig(SESSION_ID, location);
    console.log(`[mock-dashboard] Workflow config seeded: region=${wfConfig.region}, steps=${wfConfig.steps.map(s => s.name).join(',')}, sources=${wfConfig.sources.map(s => s.name).join(',')}`);

    // Seed platforms — Indeed & LinkedIn, both browser mode bound to 环境1 (real env ID)
    const platforms = [
        {
            name: 'Indeed',
            url: 'https://ca.indeed.com/jobs',
            loginUrl: 'https://secure.indeed.com/account/login',
            icon: '💼',
            connectionType: 'browser',
            envId: env1Id,
            notes: `Browser automation via 环境1 (${env1Id})`
        },
        {
            name: 'LinkedIn',
            url: 'https://www.linkedin.com/jobs',
            loginUrl: 'https://www.linkedin.com/login',
            icon: '🔗',
            connectionType: 'browser',
            envId: env1Id,
            notes: `Browser automation via 环境1 (${env1Id})`
        }
    ];

    for (const p of platforms) {
        const result = platformStore.addPlatform(SESSION_ID, p);
        if (result.success) {
            const plat = result.platform;
            // Seed the workflow grid — init with name/icon/url
            dashboardServer.updatePlatformCell(SESSION_ID, plat.id, {
                cell: 'login', status: 'idle',
                name: p.name, icon: p.icon, url: p.url, envId: p.envId
            });
            // Sync restored tool statuses into the grid
            // (_restoreTools already ran inside addPlatform)
            for (const toolType of ['search', 'apply']) {
                if (plat.tools[toolType].status === 'ready') {
                    dashboardServer.updatePlatformCell(SESSION_ID, plat.id, {
                        cell: toolType, status: 'ready',
                        version: plat.tools[toolType].version,
                        message: `Restored v${plat.tools[toolType].version}`
                    });
                    console.log(`[mock-dashboard]   ✓ ${p.name} ${toolType} tool restored (v${plat.tools[toolType].version})`);
                }
            }
            // Restore login status from disk (cookies persisted in fingerprint browser)
            const loginInfo = platformStore.getLoginStatus(p.url);
            if (loginInfo) {
                dashboardServer.updatePlatformCell(SESSION_ID, plat.id, {
                    cell: 'login', status: 'verified',
                    envId: loginInfo.envId,
                    message: `Previously verified (${loginInfo.verifiedAt.split('T')[0]})`
                });
                console.log(`[mock-dashboard]   ✓ ${p.name} login restored (env: ${loginInfo.envId})`);
            }
            console.log(`[mock-dashboard] Added platform: ${p.name} (env: ${p.envId}, mode: ${p.connectionType})`);
        } else {
            console.warn(`[mock-dashboard] Failed to add ${p.name}: ${result.error}`);
        }
    }
}

main().catch(err => {
    console.error('[mock-dashboard] Fatal:', err.message);
    process.exit(1);
});

// Keep process alive
setInterval(() => {}, 60000);
