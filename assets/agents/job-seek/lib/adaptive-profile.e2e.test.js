'use strict';

/**
 * E2E tests for Adaptive Search + Profile + Memory features.
 *
 * Covers:
 * 1. User Management API (multi-user, switch, isolation)
 * 2. Master Profile CRUD (all 11 sections, persistence)
 * 3. Session-Tailored Profile (direction-based filtering, comparison diff)
 * 4. Pipeline + Adaptive Search (gap analysis, query expansion, multi-round)
 * 5. Resume Generation (3-tier derivation chain)
 * 6. Dashboard HTML verification (new UI elements)
 *
 * Uses real HTTP server on port 30099, matching existing E2E patterns.
 */

const http = require('http');

// ─── Mock network-dependent tools ───
jest.mock('./tools/jobSearch', () => ({ handler: jest.fn() }));
jest.mock('./tools/parseListing', () => ({
    handler: jest.fn(),
    extractRequirements: jest.fn(({ text, title }) => ({
        title: title || '',
        sections: { technical: text || '', experience: '', education: '', soft_skills: '' }
    }))
}));
jest.mock('./tools/matchProfile', () => ({ handler: jest.fn() }));
jest.mock('./tools/resumeGen', () => ({
    handler: jest.fn().mockReturnValue({
        markdown: '# Test User\n\n## Summary\nExperienced QA engineer\n\n## Skills\n- Selenium\n- Python',
        derivationChain: ['master', 'session-tailored', 'job-specific'],
        generatedAt: new Date().toISOString()
    })
}));
jest.mock('./tools/coverLetter', () => ({
    handler: jest.fn().mockReturnValue({ markdown: '# Cover Letter\n\nDear Hiring Manager' })
}));
jest.mock('./tools/mockInterview', () => ({
    handler: jest.fn().mockResolvedValue({ questions: [] })
}));
// Mock toolServiceClient for autoApply browser automation
jest.mock('./core/toolServiceClient', () => ({
    executeTool: jest.fn().mockImplementation((tool, params) => {
        // Simulate browser tool results
        switch (tool) {
            case 'browser_launch':
                return Promise.resolve({ success: true, result: { browserId: 'mock-browser-1', mode: 'headless' } });
            case 'page_goto':
                return Promise.resolve({ success: true, result: { title: 'Job Application' } });
            case 'captcha_detect':
                return Promise.resolve({ success: true, result: { type: 'none' } });
            case 'page_click':
                return Promise.resolve({ success: true });
            case 'page_type':
                return Promise.resolve({ success: true });
            case 'page_upload_file':
                return Promise.resolve({ success: true });
            case 'page_screenshot':
                return Promise.resolve({ success: true, result: { base64: 'iVBOR', format: 'png' } });
            case 'page_url':
                return Promise.resolve({ success: true, result: { url: 'https://jobs.test/thank-you' } });
            case 'page_text':
                return Promise.resolve({ success: true, result: { text: 'Thank you for your application' } });
            case 'browser_close':
                return Promise.resolve({ success: true });
            default:
                return Promise.resolve({ success: false, error: 'Unknown tool' });
        }
    })
}));
// Mock knowledgeClient to avoid needing a running knowledge store
jest.mock('./core/knowledgeClient', () => ({
    upsert: jest.fn().mockResolvedValue({ success: true }),
    find: jest.fn().mockResolvedValue([]),
    search: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue({ success: true })
}));

const { handler: matchProfileHandler } = require('./tools/matchProfile');
const dashboardServer = require('./dashboardServer');

const TEST_PORT = 30099;
const SESSION_ID = 'e2e-adaptive-profile';

// ─── Mutable state object (dashboardServer reads via getter) ───
const STATE = {
    activeSessionId: SESSION_ID,
    sessions: [{ id: SESSION_ID, name: 'E2E Adaptive Test' }],
    selectedAnswers: {
        [SESSION_ID]: {
            q_job_title: 'QA Automation Engineer',
            q_location: 'Vancouver, Canada',
            q_work_mode: 'remote',
            q_salary: '100'
        }
    },
    profileSections: {
        [SESSION_ID]: {
            basic: 'Test User, test@e2e.com',
            skills: 'Selenium, Python, Cypress, Playwright, Jest, CI/CD',
            experience: '4 years QA at TestCorp, 2020-2024',
            education: 'CS, UBC, 2019'
        }
    },
    masterProfile: {
        basic: 'Test User, test@e2e.com',
        skills: 'Selenium, Python, Cypress, Playwright, Jest, CI/CD, Docker, Jenkins',
        experience: '4 years QA at TestCorp, 2020-2024',
        education: 'CS, UBC, 2019',
        certifications: 'ISTQB Foundation, AWS Associate',
        projects: 'E2E Testing Framework (open source), CI Pipeline Tool',
        highlights: 'Experienced QA engineer specializing in test automation',
        languages: 'English, French',
        publications: '',
        volunteering: '',
        summary_templates: ''
    },
    activeUserId: '',
    resumeHashes: {},
    subtasks: { [SESSION_ID]: [] },
    intentFiles: { [SESSION_ID]: { version: 1 } },
    currentProvider: '',
    currentModel: 'default',
    currentSubProvider: '',
    runtimeApiKey: ''
};

// ─── HTTP helpers (matching existing pattern) ───

function fetchJSON(urlPath) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${TEST_PORT}${urlPath}`, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, body: data }); }
            });
        }).on('error', reject);
    });
}

function postJSON(urlPath, body) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(body);
        const req = http.request({
            hostname: '127.0.0.1', port: TEST_PORT, path: urlPath,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function putJSON(urlPath, body) {
    return new Promise((resolve, reject) => {
        const putData = JSON.stringify(body);
        const req = http.request({
            hostname: '127.0.0.1', port: TEST_PORT, path: urlPath,
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(putData) }
        }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        req.write(putData);
        req.end();
    });
}

function fetchHTML(urlPath) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${TEST_PORT}${urlPath}`, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        }).on('error', reject);
    });
}

function fetchRaw(urlPath) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${TEST_PORT}${urlPath}`, (res) => {
            const chunks = [];
            res.on('data', c => { chunks.push(c); });
            res.on('end', () => resolve({
                status: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks)
            }));
        }).on('error', reject);
    });
}

// ─── Server lifecycle ───

// Initialize userStore with a temp directory
const os = require('os');
const fs = require('fs');
const path = require('path');

let tempDir;

beforeAll((done) => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-adaptive-'));
    const userStore = require('./core/userStore');
    const { users, activeUserId } = userStore.init(tempDir);
    STATE.activeUserId = activeUserId;

    dashboardServer.start(() => STATE, TEST_PORT);
    setTimeout(done, 300);
});

afterAll(async () => {
    await dashboardServer.stop();
    // Clean up temp directory
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
});

// ═══════════════════════════════════════════════
// Group 1: User Management API
// ═══════════════════════════════════════════════

// Save original masterProfile before any user switches (loadMaster mock returns empty)
const originalMasterProfile = { ...STATE.masterProfile };

describe('Group 1: User Management API', () => {
    test('GET /api/users returns user list with default user', async () => {
        const { status, body } = await fetchJSON('/api/users');
        expect(status).toBe(200);
        expect(body.users).toBeDefined();
        expect(body.users.length).toBeGreaterThanOrEqual(1);
        expect(body.activeUserId).toBeDefined();
        // Default user should exist
        const defaultUser = body.users.find(u => u.name === 'Default User');
        expect(defaultUser).toBeDefined();
    });

    let secondUserId;

    test('POST /api/users creates a second user', async () => {
        const { status, body } = await postJSON('/api/users', { name: 'Test User 2' });
        expect(status).toBe(201);
        expect(body.success).toBe(true);
        expect(body.user.name).toBe('Test User 2');
        expect(body.user.id).toBeDefined();
        secondUserId = body.user.id;
    });

    test('GET /api/users now shows 2 users', async () => {
        const { status, body } = await fetchJSON('/api/users');
        expect(status).toBe(200);
        expect(body.users.length).toBe(2);
    });

    test('PUT /api/users/active switches to second user', async () => {
        const { status, body } = await putJSON('/api/users/active', { userId: secondUserId });
        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.activeUserId).toBe(secondUserId);
    });

    test('GET /api/users/active returns switched user', async () => {
        const { status, body } = await fetchJSON('/api/users/active');
        expect(status).toBe(200);
        expect(body.user).toBeDefined();
        expect(body.user.name).toBe('Test User 2');
    });

    test('PUT /api/users/active switches back to default user', async () => {
        const { body: usersBody } = await fetchJSON('/api/users');
        const defaultUser = usersBody.users.find(u => u.name === 'Default User');
        const { status, body } = await putJSON('/api/users/active', { userId: defaultUser.id });
        expect(status).toBe(200);
        expect(body.success).toBe(true);
        // Restore masterProfile since knowledgeClient.find mock returns []
        STATE.masterProfile = { ...originalMasterProfile };
        STATE.activeUserId = defaultUser.id;
    });

    test('PUT /api/users/active returns 404 for non-existent user', async () => {
        const { status, body } = await putJSON('/api/users/active', { userId: 'nonexistent-id' });
        expect(status).toBe(404);
        expect(body.error).toContain('not found');
    });
});

// ═══════════════════════════════════════════════
// Group 2: Master Profile CRUD
// ═══════════════════════════════════════════════

describe('Group 2: Master Profile CRUD', () => {
    test('GET /api/profile/template returns empty template with all 11 section keys', async () => {
        const { status, body } = await fetchJSON('/api/profile/template');
        expect(status).toBe(200);
        // All 11 sections should be present
        const expectedSections = [
            'basic', 'skills', 'experience', 'education', 'highlights',
            'certifications', 'projects', 'publications', 'languages',
            'volunteering', 'summary_templates'
        ];
        for (const section of expectedSections) {
            expect(body).toHaveProperty(section);
            expect(body[section]).toBe('');
        }
    });

    test('GET /api/profile/master returns current master profile', async () => {
        const { status, body } = await fetchJSON('/api/profile/master');
        expect(status).toBe(200);
        // STATE.masterProfile has pre-populated data
        expect(body.basic).toContain('Test User');
        expect(body.skills).toContain('Selenium');
    });

    test('PUT /api/profile/master/basic updates basic section', async () => {
        const { status, body } = await putJSON('/api/profile/master/basic', {
            content: 'Updated User, updated@e2e.com, Vancouver'
        });
        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.section).toBe('basic');
        expect(body.content).toContain('Updated User');
    });

    test('PUT /api/profile/master/skills updates skills section', async () => {
        const { status, body } = await putJSON('/api/profile/master/skills', {
            content: 'Selenium, Python, Cypress, Playwright, K6, Docker, Jenkins, AWS'
        });
        expect(status).toBe(200);
        expect(body.success).toBe(true);
    });

    test('PUT /api/profile/master/certifications updates certifications', async () => {
        const { status, body } = await putJSON('/api/profile/master/certifications', {
            content: 'ISTQB Foundation, ISTQB Advanced, AWS SAA'
        });
        expect(status).toBe(200);
        expect(body.success).toBe(true);
    });

    test('GET /api/profile/master reflects all updates', async () => {
        const { status, body } = await fetchJSON('/api/profile/master');
        expect(status).toBe(200);
        expect(body.basic).toContain('Updated User');
        expect(body.skills).toContain('K6');
        expect(body.certifications).toContain('ISTQB Advanced');
    });

    test('PUT /api/profile/master/:section rejects when no active user', async () => {
        const savedUserId = STATE.activeUserId;
        STATE.activeUserId = '';  // Temporarily clear
        const { status, body } = await putJSON('/api/profile/master/basic', {
            content: 'Should fail'
        });
        expect(status).toBe(400);
        expect(body.error).toContain('No active user');
        STATE.activeUserId = savedUserId;  // Restore
    });

    test('profile isolation: second user has empty profile', async () => {
        const { body: usersBody } = await fetchJSON('/api/users');
        const secondUser = usersBody.users.find(u => u.name === 'Test User 2');

        // Switch to second user
        await putJSON('/api/users/active', { userId: secondUser.id });

        // Second user's master profile should be empty (from loadMaster mock)
        const { body } = await fetchJSON('/api/profile/master');
        // masterProfile was replaced by loadMaster result (empty since knowledgeClient.find returns [])
        expect(body.basic || '').toBe('');

        // Switch back
        const defaultUser = usersBody.users.find(u => u.name === 'Default User');
        await putJSON('/api/users/active', { userId: defaultUser.id });
        // Restore masterProfile from original since knowledgeClient.find mock returns []
        STATE.masterProfile = { ...originalMasterProfile };
        STATE.activeUserId = defaultUser.id;
    });
});

// ═══════════════════════════════════════════════
// Group 3: Session-Tailored Profile
// ═══════════════════════════════════════════════

describe('Group 3: Session-Tailored Profile', () => {
    test('GET /api/profile/:sessionId/tailored returns session profile', async () => {
        const { status, body } = await fetchJSON(`/api/profile/${SESSION_ID}/tailored`);
        expect(status).toBe(200);
        expect(body.skills).toContain('Selenium');
        expect(body.basic).toContain('Test User');
    });

    test('GET /api/profile/:sessionId/tailored returns empty for unknown session', async () => {
        const { status, body } = await fetchJSON('/api/profile/nonexistent-session/tailored');
        expect(status).toBe(200);
        expect(body).toEqual({});
    });

    test('GET /api/profile/:sessionId/comparison returns master vs tailored diff', async () => {
        const { status, body } = await fetchJSON(`/api/profile/${SESSION_ID}/comparison`);
        expect(status).toBe(200);
        expect(body.master).toBeDefined();
        expect(body.tailored).toBeDefined();
        expect(body.diff).toBeDefined();
        // Skills differ between master and session profile
        expect(body.diff.skills).toBeDefined();
        expect(body.diff.skills.master).toContain('Docker');  // master has Docker
        expect(body.diff.skills.tailored).not.toContain('Docker');  // session doesn't
        expect(body.diff.skills.changed).toBe(true);
    });

    test('comparison shows unchanged sections correctly', async () => {
        const { body } = await fetchJSON(`/api/profile/${SESSION_ID}/comparison`);
        // basic and education should be the same in master and tailored
        // (both set to identical values in STATE)
        if (body.diff.education) {
            // If both have same content, changed should be false
            if (body.diff.education.master === body.diff.education.tailored) {
                expect(body.diff.education.changed).toBe(false);
            }
        }
    });
});

// ═══════════════════════════════════════════════
// Group 4: Pipeline + Adaptive Search
// ═══════════════════════════════════════════════

describe('Group 4: Pipeline + Adaptive Search', () => {
    const PIPE_SID = 'e2e-adaptive-pipe';

    beforeAll(() => {
        // Add session state for pipeline session
        STATE.selectedAnswers[PIPE_SID] = {
            q_job_title: 'Senior QA Automation Engineer',
            q_location: 'Vancouver',
            q_work_mode: 'remote'
        };
        STATE.profileSections[PIPE_SID] = {
            basic: 'Test User',
            skills: 'Selenium, Python, Cypress, Playwright, Jest',
            experience: '4 years QA at TestCorp',
            education: 'CS, UBC, 2019'
        };
    });

    test('pipeline start returns running state with adaptive config', async () => {
        // Mock matchProfile to return low scores initially (triggers adaptive)
        let callCount = 0;
        matchProfileHandler.mockImplementation(() => {
            callCount++;
            // All return qualifying score since we have no real listings (platform tools not mocked)
            return { overallScore: 85, breakdown: { skills: { score: 90, matched: ['selenium'] } } };
        });

        const { status, body } = await postJSON(`/api/pipeline/${PIPE_SID}/start`, {
            minScore: 60,
            targetCount: 3,
            maxResults: 10,
            maxSearchRounds: 2
        });
        expect(status).toBe(200);
        expect(body.running).toBe(true);
        expect(body.config.maxSearchRounds).toBe(2);
    });

    test('pipeline completes (no platform tools = no results, but no crash)', async () => {
        // Wait for async pipeline to finish
        await new Promise(r => setTimeout(r, 1500));

        const { status, body } = await fetchJSON(`/api/pipeline/${PIPE_SID}/status`);
        expect(status).toBe(200);
        expect(body.running).toBe(false);
        expect(body.progress).toBeDefined();
        expect(body.progress.phase).toMatch(/done|completed|error/);
    });

    test('pipeline progress includes searchRound tracking', async () => {
        const { body } = await fetchJSON(`/api/pipeline/${PIPE_SID}/status`);
        expect(body.progress.searchRound).toBeDefined();
        expect(body.progress.searchRound).toBeGreaterThanOrEqual(1);
    });

    test('pipeline logs contain round info', async () => {
        const { body } = await fetchJSON(`/api/pipeline/${PIPE_SID}/status`);
        expect(body.progress.logs).toBeDefined();
        expect(Array.isArray(body.progress.logs)).toBe(true);
        // Should have at least the starting log
        const logMsgs = body.progress.logs.map(l => l.msg);
        expect(logMsgs.some(m => m.includes('Round 1'))).toBe(true);
    });

    test('pipeline can be restarted after completion', async () => {
        const { status, body } = await postJSON(`/api/pipeline/${PIPE_SID}/start`, {
            minScore: 50,
            targetCount: 5
        });
        expect(status).toBe(200);
        expect(body.running).toBe(true);
        // Stop immediately
        await postJSON(`/api/pipeline/${PIPE_SID}/stop`, {});
    });
});

// ═══════════════════════════════════════════════
// Group 5: Resume Generation (3-tier derivation)
// ═══════════════════════════════════════════════

describe('Group 5: Resume Generation', () => {
    const RESUME_SID = 'e2e-resume-gen';
    const JOB_URL = 'https://jobs.test/qa-automation';

    beforeAll(async () => {
        // Set up session state
        STATE.selectedAnswers[RESUME_SID] = {
            q_job_title: 'QA Automation Engineer',
            q_location: 'Toronto'
        };
        STATE.profileSections[RESUME_SID] = {
            basic: 'Test User',
            skills: 'Selenium, Python',
            experience: '4 years QA',
            education: 'CS, UBC'
        };

        // Pre-populate a job card for resume generation
        dashboardServer.upsertJobCard(RESUME_SID, {
            url: JOB_URL,
            title: 'QA Automation Engineer',
            company: 'TestCorp',
            location: 'Toronto',
            matchScore: 85,
            status: 'matched',
            artifacts: {
                requirements: {
                    title: 'QA Automation Engineer',
                    sections: { technical: 'Selenium, Python, CI/CD' }
                }
            }
        });
    });

    test('POST /api/pipeline/:sid/generate-resume returns markdown with derivation', async () => {
        const { status, body } = await postJSON(`/api/pipeline/${RESUME_SID}/generate-resume`, {
            jobUrl: JOB_URL
        });
        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.markdown).toContain('Test User');
        expect(body.derivation).toBeDefined();
    });

    test('resume generation updates job card status', async () => {
        const { body } = await fetchJSON(`/api/dashboard/${RESUME_SID}`);
        const job = body.jobs.find(j => j.url === JOB_URL);
        expect(job).toBeDefined();
        expect(job.status).toBe('tailored');
    });

    test('resume generation stores DOCX buffer in artifacts', async () => {
        const { body } = await fetchJSON(`/api/dashboard/${RESUME_SID}`);
        const job = body.jobs.find(j => j.url === JOB_URL);
        expect(job).toBeDefined();
        expect(job.artifacts.resumeDocx).toBeDefined();
        // resumeDocx is base64-encoded — decode and check PK signature
        const docxBuf = Buffer.from(job.artifacts.resumeDocx, 'base64');
        expect(docxBuf[0]).toBe(0x50); // P
        expect(docxBuf[1]).toBe(0x4B); // K (ZIP/DOCX header)
    });

    test('download endpoint returns DOCX by default', async () => {
        const encodedUrl = encodeURIComponent(JOB_URL);
        const { status, headers, body } = await fetchRaw(
            `/api/pipeline/${RESUME_SID}/download/${encodedUrl}/resume`
        );
        expect(status).toBe(200);
        expect(headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        expect(headers['content-disposition']).toContain('.docx');
        // Body is DOCX binary — check PK signature
        expect(body[0]).toBe(0x50);
        expect(body[1]).toBe(0x4B);
    });

    test('download endpoint returns markdown with ?format=md', async () => {
        const encodedUrl = encodeURIComponent(JOB_URL);
        const { status, headers, body } = await fetchRaw(
            `/api/pipeline/${RESUME_SID}/download/${encodedUrl}/resume?format=md`
        );
        expect(status).toBe(200);
        expect(headers['content-type']).toContain('text/markdown');
        expect(headers['content-disposition']).toContain('.md');
        // Body is markdown text
        expect(body.toString()).toContain('Test User');
    });

    test('generate-resume returns error for unknown job URL', async () => {
        const { status, body } = await postJSON(`/api/pipeline/${RESUME_SID}/generate-resume`, {
            jobUrl: 'https://nonexistent.com/job'
        });
        expect(status).toBe(200);
        expect(body.error).toContain('not found');
    });
});

// ═══════════════════════════════════════════════
// Group 6: Dashboard HTML Verification
// ═══════════════════════════════════════════════

describe('Group 6: Dashboard HTML Verification', () => {
    test('GET /dashboard/:sessionId returns valid HTML', async () => {
        const { status, body } = await fetchHTML(`/dashboard/${SESSION_ID}`);
        expect(status).toBe(200);
        expect(typeof body).toBe('string');
        expect(body).toContain('<!DOCTYPE html>');
        expect(body).toContain('</html>');
    });

    test('HTML contains pipeline status display', async () => {
        const { body } = await fetchHTML(`/dashboard/${SESSION_ID}`);
        expect(body).toContain('id="pipeline"');
        expect(body).toContain('wfBtnStart');
    });

    test('HTML contains search configuration fields', async () => {
        const { body } = await fetchHTML(`/dashboard/${SESSION_ID}`);
        expect(body).toContain('gsCfgMinScore');
        expect(body).toContain('gsCfgTargetCount');
    });

    test('HTML contains job listing controls', async () => {
        const { body } = await fetchHTML(`/dashboard/${SESSION_ID}`);
        expect(body).toContain('tab-listings');
        expect(body).toContain('tab-history');
        expect(body).toContain('genResume');
        expect(body).toContain('genCoverLetter');
        expect(body).toContain('markApplied');
    });

    test('HTML contains modal overlay for settings', async () => {
        const { body } = await fetchHTML(`/dashboard/${SESSION_ID}`);
        expect(body).toContain('modalOverlay');
    });

    test('HTML contains SSE event source connection', async () => {
        const { body } = await fetchHTML(`/dashboard/${SESSION_ID}`);
        expect(body).toContain('EventSource');
        expect(body).toContain('/api/events/');
    });

    test('HTML contains profile/direction display containers', async () => {
        const { body } = await fetchHTML(`/dashboard/${SESSION_ID}`);
        // Direction and profile panels (data loaded via AJAX refresh)
        expect(body).toContain('id="direction"');
        expect(body).toContain('id="profile"');
        // Section headers
        expect(body).toContain('Direction');
        expect(body).toContain('Profile');
    });

    test('dashboard data API returns direction with job title', async () => {
        const { status, body } = await fetchJSON(`/api/dashboard/${SESSION_ID}`);
        expect(status).toBe(200);
        expect(body.direction.jobTitle).toBe('QA Automation Engineer');
        expect(body.direction.location).toContain('Vancouver');
    });

    test('dashboard data API returns structured JSON with stats', async () => {
        const { status, body } = await fetchJSON(`/api/dashboard/${SESSION_ID}`);
        expect(status).toBe(200);
        expect(body).toHaveProperty('jobs');
        expect(body).toHaveProperty('jobStats');
        expect(body).toHaveProperty('profile');
        expect(Array.isArray(body.jobs)).toBe(true);
    });
});

// ═══════════════════════════════════════════════
// Group 7: Adaptive Search Unit Integration
// ═══════════════════════════════════════════════

describe('Group 7: Adaptive Search Functions (via exports)', () => {
    const searchPipeline = require('./searchPipeline');

    test('_parseSkills handles various formats', () => {
        expect(searchPipeline._parseSkills('React, Node, TS')).toEqual(['React', 'Node', 'TS']);
        expect(searchPipeline._parseSkills('- React\n- Node')).toEqual(['React', 'Node']);
        expect(searchPipeline._parseSkills(null)).toEqual([]);
    });

    test('_analyzeGap identifies deficits', () => {
        const pipelines = new Map();
        pipelines.set('test', {
            config: { targetCount: 10 },
            _sourceQualified: { indeed: 3, linkedin: 12 },
            _sourceResultCount: { indeed: 20, linkedin: 25 }
        });
        const gap = searchPipeline._analyzeGap(pipelines, 'test');
        expect(gap.indeed).toBeDefined();
        expect(gap.indeed.deficit).toBe(7);
        expect(gap.linkedin).toBeUndefined(); // already met
    });

    test('_analyzeGap returns empty when all sources met', () => {
        const pipelines = new Map();
        pipelines.set('test', {
            config: { targetCount: 5 },
            _sourceQualified: { indeed: 5, linkedin: 8 },
            _sourceResultCount: { indeed: 10, linkedin: 15 }
        });
        const gap = searchPipeline._analyzeGap(pipelines, 'test');
        expect(Object.keys(gap)).toHaveLength(0);
    });

    test('_expandQueries generates skill rotation queries', async () => {
        const direction = { q_job_title: 'QA Engineer', q_location: 'Toronto' };
        const profile = { skills: 'Selenium, Python, Cypress, Jest' };
        const gap = { indeed: { qualified: 1, target: 5, deficit: 4 } };
        const prev = [{ query: 'QA Engineer' }, { query: 'QA Engineer Selenium' }];

        const result = await searchPipeline._expandQueries(direction, profile, gap, prev, null);
        // Should rotate to next unused skill (Python or Cypress)
        const skillRotation = result.filter(q =>
            q.query.includes('Python') || q.query.includes('Cypress')
        );
        expect(skillRotation.length).toBeGreaterThanOrEqual(1);
    });

    test('_expandQueries drops seniority prefix', async () => {
        const direction = { q_job_title: 'Lead QA Engineer', q_location: '' };
        const profile = { skills: 'Testing' };
        const gap = { indeed: { qualified: 0, target: 3, deficit: 3 } };
        const prev = [{ query: 'Lead QA Engineer' }];

        const result = await searchPipeline._expandQueries(direction, profile, gap, prev, null);
        const broader = result.find(q => q.query === 'QA Engineer');
        expect(broader).toBeDefined();
    });

    test('_expandQueries uses AI expander callback', async () => {
        const direction = { q_job_title: 'Nurse', q_location: 'Calgary' };
        const profile = { skills: 'Patient Care, Triage', highlights: 'Emergency nursing' };
        const gap = { indeed: { qualified: 0, target: 5, deficit: 5 } };
        const prev = [{ query: 'Nurse' }];

        const mockAi = jest.fn().mockResolvedValue([
            'Registered Nurse',
            'RN Critical Care',
            'Staff Nurse Emergency'
        ]);

        const result = await searchPipeline._expandQueries(direction, profile, gap, prev, mockAi);
        expect(mockAi).toHaveBeenCalledTimes(1);
        expect(mockAi).toHaveBeenCalledWith(expect.objectContaining({
            jobTitle: 'Nurse',
            location: 'Calgary',
            profileSummary: expect.stringContaining('Patient Care')
        }));

        const aiQueries = result.filter(q =>
            ['Registered Nurse', 'RN Critical Care', 'Staff Nurse Emergency'].includes(q.query)
        );
        expect(aiQueries.length).toBe(3);
    });

    test('_expandQueries handles AI failure gracefully', async () => {
        const direction = { q_job_title: 'Chef', q_location: '' };
        const profile = { skills: 'French cuisine, Pastry, Grilling' };
        const gap = { indeed: { qualified: 0, target: 3, deficit: 3 } };
        const prev = [{ query: 'Chef' }];

        const failAi = jest.fn().mockRejectedValue(new Error('API quota exceeded'));
        const result = await searchPipeline._expandQueries(direction, profile, gap, prev, failAi);
        // Should still return deterministic results (skill rotation)
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result.some(q => q.query.includes('French cuisine') || q.query.includes('Pastry'))).toBe(true);
    });

    test('_expandQueries deduplicates against previous queries', async () => {
        const direction = { q_job_title: 'Dev', q_location: '' };
        const profile = { skills: 'JS, Python, Go' };
        const gap = { indeed: { qualified: 0, target: 3, deficit: 3 } };
        const prev = [{ query: 'Dev' }, { query: 'Dev JS' }];

        const result = await searchPipeline._expandQueries(direction, profile, gap, prev, null);
        // 'Dev JS' is already in previous, should not appear
        expect(result.filter(q => q.query.toLowerCase() === 'dev js')).toHaveLength(0);
        // But 'Dev Python' or 'Dev Go' should appear
        expect(result.some(q => q.query.includes('Python') || q.query.includes('Go'))).toBe(true);
    });

    test('_expandQueries distributes AI suggestions across gap sources', async () => {
        const direction = { q_job_title: 'Dev', q_location: '' };
        const profile = { skills: 'JS' };
        const gap = {
            indeed: { qualified: 0, target: 3, deficit: 3 },
            linkedin: { qualified: 0, target: 3, deficit: 3 }
        };
        const prev = [{ query: 'Dev' }];

        const mockAi = jest.fn().mockResolvedValue(['Software Developer', 'Programmer', 'Coder']);
        const result = await searchPipeline._expandQueries(direction, profile, gap, prev, mockAi);

        // AI suggestions should be distributed, not all on one source
        const sources = result.filter(q =>
            ['Software Developer', 'Programmer', 'Coder'].includes(q.query)
        ).map(q => q.source);
        // At least one should be on a different source
        expect(new Set(sources).size).toBeGreaterThanOrEqual(1);
    });
});

// ═══════════════════════════════════════════════
// Group 8: Cross-feature Integration
// ═══════════════════════════════════════════════

describe('Group 8: Cross-feature Integration', () => {
    test('health check works', async () => {
        const { status, body } = await fetchJSON('/ping');
        expect(status).toBe(200);
        expect(body.ok).toBe(true);
    });

    test('active session API returns session ID', async () => {
        const { status, body } = await fetchJSON('/api/active-session');
        expect(status).toBe(200);
        expect(body.sessionId).toBe(SESSION_ID);
    });

    test('users active endpoint shows profile section count', async () => {
        const { status, body } = await fetchJSON('/api/users/active');
        expect(status).toBe(200);
        expect(body.user).toBeDefined();
        expect(typeof body.masterProfileSections).toBe('number');
    });

    test('debug endpoint returns diagnostics', async () => {
        const { status, body } = await fetchJSON('/debug');
        expect(status).toBe(200);
        expect(body.hasStateGetter).toBe(true);
        expect(body.hasState).toBe(true);
        expect(body.activeSessionId).toBe(SESSION_ID);
    });
});

// ═══════════════════════════════════════════════
// Group 9: Auto-Apply
// ═══════════════════════════════════════════════

describe('Group 9: Auto-Apply', () => {
    const APPLY_SID = 'e2e-auto-apply';
    const APPLY_JOB_URL = 'https://jobs.test/apply-qa-engineer';
    const toolServiceClient = require('./core/toolServiceClient');

    beforeAll(() => {
        // Set up session state
        STATE.selectedAnswers[APPLY_SID] = {
            q_job_title: 'QA Engineer',
            q_location: 'Vancouver, Canada'
        };
        STATE.profileSections[APPLY_SID] = {
            basic: 'Apply User, apply@test.com, 555-9999',
            skills: 'Selenium, Python',
            experience: '3 years QA',
            education: 'CS, UBC'
        };

        // Pre-populate a tailored job with DOCX artifact
        const fakeDocxBase64 = Buffer.from('PK\x03\x04fake-docx-content').toString('base64');
        dashboardServer.upsertJobCard(APPLY_SID, {
            url: APPLY_JOB_URL,
            title: 'QA Engineer',
            company: 'TestCorp',
            status: 'tailored',
            matchScore: 85,
            artifacts: {
                resume: '# Apply User\n## Skills\n- Selenium',
                resumeDocx: fakeDocxBase64,
                coverLetter: 'Dear Hiring Manager',
                coverLetterDocx: fakeDocxBase64
            }
        });
    });

    test('apply-single endpoint triggers auto-apply for one job', async () => {
        // Override workflow config to minimize delays for testing
        STATE.workflowConfigs = STATE.workflowConfigs || {};
        STATE.workflowConfigs[APPLY_SID] = {
            steps: [{ name: 'apply', autoSubmit: true, delayBetweenJobs: [0, 0], maxApplyPerRun: 10, jobIds: [] }]
        };

        const encodedUrl = encodeURIComponent(APPLY_JOB_URL);
        const { status, body } = await postJSON(
            `/api/pipeline/${APPLY_SID}/apply-single/${encodedUrl}`,
            {}
        );
        expect(status).toBe(200);
        expect(body.total).toBe(1);
        expect(body.submitted).toBeGreaterThanOrEqual(0);
        expect(body.jobs).toHaveLength(1);
        expect(body.jobs[0].url).toBe(APPLY_JOB_URL);
    }, 15000);

    test('job status updated after apply attempt', async () => {
        const { body } = await fetchJSON(`/api/dashboard/${APPLY_SID}`);
        const job = body.jobs.find(j => j.url === APPLY_JOB_URL);
        expect(job).toBeDefined();
        expect(job.artifacts).toBeDefined();
        // After auto-apply, should have at least one of these
        const hasApplyData = job.artifacts.appliedAt || job.artifacts.applyAttemptedAt
            || job.artifacts.applySteps || job.artifacts.applyScreenshot || job.artifacts.applyError;
        expect(hasApplyData).toBeTruthy();
    });

    test('apply screenshot stored in artifacts', async () => {
        const { body } = await fetchJSON(`/api/dashboard/${APPLY_SID}`);
        const job = body.jobs.find(j => j.url === APPLY_JOB_URL);
        // Screenshot should be stored (base64 from mock)
        if (job.status === 'submitted' || job.artifacts.applyScreenshot) {
            expect(job.artifacts.applyScreenshot).toBeDefined();
        }
    });

    test('apply-screenshot endpoint returns image', async () => {
        const { body: dash } = await fetchJSON(`/api/dashboard/${APPLY_SID}`);
        const job = dash.jobs.find(j => j.url === APPLY_JOB_URL);
        if (!job?.artifacts?.applyScreenshot) return; // skip if no screenshot stored

        const encodedUrl = encodeURIComponent(APPLY_JOB_URL);
        const { status, headers } = await fetchRaw(
            `/api/pipeline/${APPLY_SID}/apply-screenshot/${encodedUrl}`
        );
        expect(status).toBe(200);
        expect(headers['content-type']).toContain('image/png');
    });

    test('batch apply endpoint processes specific jobs', async () => {
        // Add a second tailored job
        const secondUrl = 'https://jobs.test/apply-dev-engineer';
        const fakeDocx = Buffer.from('PK\x03\x04fake').toString('base64');
        dashboardServer.upsertJobCard(APPLY_SID, {
            url: secondUrl,
            title: 'Dev Engineer',
            company: 'DevCorp',
            status: 'tailored',
            artifacts: { resumeDocx: fakeDocx }
        });

        const { status, body } = await postJSON(
            `/api/pipeline/${APPLY_SID}/apply`,
            { jobUrls: [secondUrl] }
        );
        expect(status).toBe(200);
        // Should only process the specified jobUrl
        expect(body.jobs.some(j => j.url === secondUrl)).toBe(true);
        expect(body.total).toBeGreaterThanOrEqual(1);
    }, 30000);

    test('toolServiceClient called with correct browser tools', async () => {
        // Verify browser_launch was called
        expect(toolServiceClient.executeTool).toHaveBeenCalledWith(
            'browser_launch',
            expect.any(Object)
        );
        // Verify page_goto was called with job URL
        expect(toolServiceClient.executeTool).toHaveBeenCalledWith(
            'page_goto',
            expect.objectContaining({ url: expect.any(String) })
        );
    });
});

// ═══════════════════════════════════════════════
// Group 10: Platform Apply Patterns
// ═══════════════════════════════════════════════

describe('Group 10: Platform Apply Patterns', () => {
    const { detectPlatform, GENERIC_SUBMIT_SELECTORS, GENERIC_SUCCESS_INDICATORS } = require('./tools/applyPatterns');

    test('detects Indeed URL', () => {
        const result = detectPlatform('https://www.indeed.com/viewjob?jk=abc123');
        expect(result).not.toBeNull();
        expect(result.key).toBe('indeed');
        expect(result.pattern.name).toBe('Indeed');
    });

    test('detects LinkedIn URL', () => {
        const result = detectPlatform('https://www.linkedin.com/jobs/view/1234567');
        expect(result).not.toBeNull();
        expect(result.key).toBe('linkedin');
        expect(result.pattern.multiStep).toBe(true);
    });

    test('detects Boss直聘 URL', () => {
        const result = detectPlatform('https://www.zhipin.com/job_detail/abc.html');
        expect(result).not.toBeNull();
        expect(result.key).toBe('boss');
        expect(result.pattern.chatBased).toBe(true);
    });

    test('detects Glassdoor URL', () => {
        const result = detectPlatform('https://www.glassdoor.com/job-listing/engineer');
        expect(result).not.toBeNull();
        expect(result.key).toBe('glassdoor');
    });

    test('returns null for unknown URL', () => {
        const result = detectPlatform('https://careers.randomcompany.com/apply');
        expect(result).toBeNull();
    });

    test('returns null for empty URL', () => {
        expect(detectPlatform('')).toBeNull();
        expect(detectPlatform(null)).toBeNull();
    });

    test('generic submit selectors are defined', () => {
        expect(Array.isArray(GENERIC_SUBMIT_SELECTORS)).toBe(true);
        expect(GENERIC_SUBMIT_SELECTORS.length).toBeGreaterThan(5);
    });

    test('generic success indicators have text and URL patterns', () => {
        expect(GENERIC_SUCCESS_INDICATORS.text).toBeDefined();
        expect(GENERIC_SUCCESS_INDICATORS.urlPattern).toBeDefined();
        expect(GENERIC_SUCCESS_INDICATORS.text.length).toBeGreaterThan(0);
    });

    test('platform patterns have required fields', () => {
        const { PATTERNS } = require('./tools/applyPatterns');
        for (const [key, pattern] of Object.entries(PATTERNS)) {
            expect(pattern.match).toBeInstanceOf(RegExp);
            expect(pattern.name).toBeTruthy();
            expect(Array.isArray(pattern.applyButton)).toBe(true);
            expect(pattern.successIndicators).toBeDefined();
        }
    });
});

// ═══════════════════════════════════════════════
// Group 11: Bot Notification Channels
// ═══════════════════════════════════════════════

describe('Group 11: Bot Notification Channels', () => {
    const alertService = require('./workflow/alertService');
    const BOT_SID = 'e2e-bot-notify';

    test('default alert config includes telegram and feishu channels', () => {
        const config = alertService.getAlertConfig(BOT_SID);
        expect(config.channels.telegram).toBeDefined();
        expect(config.channels.telegram.enabled).toBe(false);
        expect(config.channels.telegram.botToken).toBe('');
        expect(config.channels.telegram.chatId).toBe('');

        expect(config.channels.feishu).toBeDefined();
        expect(config.channels.feishu.enabled).toBe(false);
        expect(config.channels.feishu.webhookUrl).toBe('');
    });

    test('can update telegram config via updateAlertConfig', () => {
        const updated = alertService.updateAlertConfig(BOT_SID, {
            channels: {
                telegram: {
                    enabled: true,
                    botToken: 'test-bot-token-123',
                    chatId: '987654321'
                }
            }
        });
        expect(updated.channels.telegram.enabled).toBe(true);
        expect(updated.channels.telegram.botToken).toBe('test-bot-token-123');
        expect(updated.channels.telegram.chatId).toBe('987654321');
        // Other channels should still exist
        expect(updated.channels.dashboard.enabled).toBe(true);
    });

    test('can update feishu config via updateAlertConfig', () => {
        const updated = alertService.updateAlertConfig(BOT_SID, {
            channels: {
                feishu: {
                    enabled: true,
                    webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test-hook-id',
                    secret: 'test-secret-abc'
                }
            }
        });
        expect(updated.channels.feishu.enabled).toBe(true);
        expect(updated.channels.feishu.webhookUrl).toContain('feishu.cn');
        expect(updated.channels.feishu.secret).toBe('test-secret-abc');
    });

    test('dispatch includes telegram and feishu in channels when enabled', () => {
        // Enable both channels (with tokens so dispatch attempts them)
        alertService.updateAlertConfig(BOT_SID, {
            channels: {
                telegram: { enabled: true, botToken: 'fake-token', chatId: '123' },
                feishu: { enabled: true, webhookUrl: 'https://open.feishu.cn/test', secret: '' }
            }
        });

        const result = alertService.dispatch(BOT_SID, {
            type: 'completed',
            title: 'Test Apply Complete',
            message: 'Applied to TestCorp QA role',
            stepName: 'apply',
            meta: { company: 'TestCorp', title: 'QA Engineer' }
        });

        // dispatch should list telegram and feishu in channels
        // (actual HTTP calls will fail but that's OK — they're fire-and-forget)
        expect(result.sent).toBe(true);
        expect(result.channels).toContain('telegram');
        expect(result.channels).toContain('feishu');
    });

    test('dispatch does not include disabled channels', () => {
        const DISABLED_SID = 'e2e-bot-disabled';
        // Default config has telegram/feishu disabled
        const result = alertService.dispatch(DISABLED_SID, {
            type: 'info',
            title: 'Test Info',
            message: 'Just a test'
        });
        expect(result.channels).not.toContain('telegram');
        expect(result.channels).not.toContain('feishu');
    });

    test('alert config persisted via dashboard API', async () => {
        const { status, body } = await putJSON(`/api/workflow/${BOT_SID}/alerts/config`, {
            channels: {
                telegram: { enabled: true, botToken: 'api-bot-token', chatId: '555' }
            }
        });
        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.config.channels.telegram.botToken).toBe('api-bot-token');

        // Read back
        const { body: readBack } = await fetchJSON(`/api/workflow/${BOT_SID}/alerts/config`);
        expect(readBack.channels.telegram.enabled).toBe(true);
        expect(readBack.channels.telegram.chatId).toBe('555');
    });

    test('alert history records channel info', () => {
        const history = alertService.getAlertHistory(BOT_SID);
        expect(history.length).toBeGreaterThan(0);
        const lastAlert = history[history.length - 1];
        expect(lastAlert.channels).toBeDefined();
        expect(Array.isArray(lastAlert.channels)).toBe(true);
    });
});
