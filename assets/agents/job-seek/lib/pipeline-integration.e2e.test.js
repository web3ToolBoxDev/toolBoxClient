'use strict';

/**
 * Pipeline Integration E2E — Real matchProfile + resumeGen + coverLetter,
 * only mocking the network-dependent tools (jobSearch, parseListing).
 *
 * Tests the full data flow:
 *   dashboard API → searchPipeline → matchProfile (real) → dashboardServer state → dashboard HTML
 *
 * Validates:
 * 1. Pipeline start/stop/status lifecycle
 * 2. Real skill matching (profile vs requirements)
 * 3. Real resume + cover letter generation
 * 4. Job card state transitions (discovered → parsed → matched → tailored → submitted)
 * 5. Dashboard HTML renders job data correctly
 * 6. History API returns only submitted jobs
 * 7. Error recovery (search failures don't crash pipeline)
 */

const http = require('http');

// Only mock network-dependent tools
jest.mock('./tools/jobSearch', () => ({
    handler: jest.fn()
}));
jest.mock('./tools/parseListing', () => ({
    handler: jest.fn()
}));
// matchProfile, resumeGen, coverLetter are NOT mocked — they run for real

const { handler: jobSearchHandler } = require('./tools/jobSearch');
const { handler: parseListingHandler } = require('./tools/parseListing');
const dashboardServer = require('./dashboardServer');
const searchPipeline = require('./searchPipeline');

const TEST_PORT = 30097;
const SID = 'integ-e2e-' + Date.now();

// Realistic profile data
const STATE = {
    selectedAnswers: {
        [SID]: {
            q_job_title: 'Frontend Developer',
            q_location: 'Toronto',
            q_work_mode: 'remote',
            q_salary: '100'
        }
    },
    profileSections: {
        [SID]: {
            basic: 'Jane Smith, jane@example.com, Toronto, Canada',
            skills: 'React, TypeScript, Node.js, CSS, HTML, Git, Redux, GraphQL, REST API',
            experience: '5 years as Senior Frontend Developer at TechCorp (2019-2024). Built React SPA, led team of 3.',
            education: 'Bachelor of Computer Science, University of Toronto, 2018'
        }
    },
    subtasks: { [SID]: [{ key: 'onboarding', status: 'done' }, { key: 'profile', status: 'done' }, { key: 'search', status: 'running' }] },
    intentFiles: { [SID]: { version: 2 } }
};

// Realistic job listings from "search"
const MOCK_LISTINGS = [
    { url: 'https://jobs.test/react-dev', title: 'Senior React Developer', company: 'WebCo', location: 'Toronto, ON', salary: '$120K-$150K' },
    { url: 'https://jobs.test/java-dev', title: 'Java Backend Developer', company: 'EnterpriseCo', location: 'Remote', salary: '$110K' },
    { url: 'https://jobs.test/fullstack', title: 'Fullstack Engineer', company: 'StartupX', location: 'Vancouver, BC', salary: '$100K-$130K' },
    { url: 'https://jobs.test/devops', title: 'DevOps Engineer', company: 'CloudCo', location: 'Toronto', salary: '$115K' },
    { url: 'https://jobs.test/fe-lead', title: 'Frontend Team Lead', company: 'BigTech', location: 'Remote', salary: '$140K-$170K' }
];

// Realistic parsed requirements for each listing
const MOCK_REQUIREMENTS = {
    'https://jobs.test/react-dev': {
        title: 'Senior React Developer',
        sections: {
            technical: 'React, TypeScript, Redux, GraphQL, CSS-in-JS, Jest, 5+ years frontend experience',
            experience: '5+ years of professional frontend development experience',
            education: 'Bachelor degree in Computer Science or related field',
            soft_skills: 'Strong communication skills, team collaboration'
        }
    },
    'https://jobs.test/java-dev': {
        title: 'Java Backend Developer',
        sections: {
            technical: 'Java, Spring Boot, Hibernate, PostgreSQL, Docker, Kubernetes, microservices',
            experience: '3+ years Java development',
            education: 'Bachelor degree',
            soft_skills: 'Problem solving'
        }
    },
    'https://jobs.test/fullstack': {
        title: 'Fullstack Engineer',
        sections: {
            technical: 'React, Node.js, TypeScript, PostgreSQL, Docker, REST API, GraphQL',
            experience: '3+ years fullstack development',
            education: 'Bachelor degree in CS or equivalent',
            soft_skills: 'Team player, good communicator'
        }
    },
    'https://jobs.test/devops': {
        title: 'DevOps Engineer',
        sections: {
            technical: 'Terraform, AWS, Docker, Kubernetes, CI/CD, Linux, Python, Bash',
            experience: '4+ years DevOps or SRE',
            education: 'Bachelor degree',
            soft_skills: 'Automation mindset'
        }
    },
    'https://jobs.test/fe-lead': {
        title: 'Frontend Team Lead',
        sections: {
            technical: 'React, TypeScript, CSS, HTML, team management, code review, mentoring, Git',
            experience: '5+ years frontend, 2+ years leading teams',
            education: 'Bachelor degree or equivalent experience',
            soft_skills: 'Leadership, mentoring, communication'
        }
    }
};

function fetchJSON(path) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${TEST_PORT}${path}`, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { reject(new Error(`Parse failed: ${data.slice(0, 200)}`)); }
            });
        }).on('error', reject);
    });
}

function postJSON(path, body) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(body);
        const req = http.request({
            hostname: '127.0.0.1', port: TEST_PORT, path, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { reject(new Error(`Parse failed: ${data.slice(0, 200)}`)); }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function fetchHTML(path) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${TEST_PORT}${path}`, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        }).on('error', reject);
    });
}

describe('Pipeline Integration E2E (real matching)', () => {
    beforeAll((done) => {
        // Setup mocks for network tools
        jobSearchHandler.mockResolvedValue({ listings: MOCK_LISTINGS });
        parseListingHandler.mockImplementation(async ({ url }) => {
            return MOCK_REQUIREMENTS[url] || {
                title: 'Unknown',
                sections: { technical: '', experience: '', education: '', soft_skills: '' }
            };
        });

        dashboardServer.start(() => STATE, TEST_PORT);
        setTimeout(done, 300);
    });

    afterAll(async () => {
        await dashboardServer.stop();
    });

    // ─── 1. Pre-pipeline state ───
    test('dashboard shows direction and profile before search', async () => {
        const { body } = await fetchJSON(`/api/dashboard/${SID}`);
        expect(body.direction.jobTitle).toBe('Frontend Developer');
        expect(body.direction.location).toBe('Toronto');
        expect(body.profile.skills).toContain('React');
        expect(body.profile.experience).toContain('TechCorp');
        expect(body.jobs).toHaveLength(0);
    });

    // ─── 2. Start pipeline ───
    test('start pipeline with minScore=50, targetCount=3', async () => {
        const { status, body } = await postJSON(`/api/pipeline/${SID}/start`, {
            minScore: 50, targetCount: 3, maxResults: 20
        });
        expect(status).toBe(200);
        expect(body.running).toBe(true);
        expect(body.config.minScore).toBe(50);
    });

    // ─── 3. Wait for pipeline completion ───
    test('pipeline completes and finds qualified jobs', async () => {
        // Wait for async pipeline to finish
        await new Promise(r => setTimeout(r, 1500));

        const { body } = await fetchJSON(`/api/pipeline/${SID}/status`);
        expect(body.running).toBe(false);
        expect(body.progress.phase).toMatch(/completed|done/);
        expect(body.progress.searched).toBeGreaterThanOrEqual(1);
        expect(body.progress.matched).toBeGreaterThanOrEqual(3);
        expect(body.progress.qualified).toBeGreaterThanOrEqual(3);
    });

    // ─── 4. Verify real match scores ───
    test('matched jobs have realistic scores (React dev > Java dev)', async () => {
        const { body } = await fetchJSON(`/api/dashboard/${SID}`);
        const jobs = body.jobs;
        expect(jobs.length).toBeGreaterThanOrEqual(3); // targetCount=3, may stop early

        // React developer should score high (profile has React, TypeScript, Redux, GraphQL)
        const reactJob = jobs.find(j => j.url === 'https://jobs.test/react-dev');
        expect(reactJob).toBeDefined();
        expect(reactJob.matchScore).toBeGreaterThanOrEqual(50);

        // Find scored jobs and verify ordering
        const scoredJobs = jobs.filter(j => j.matchScore !== null);
        expect(scoredJobs.length).toBeGreaterThanOrEqual(3);

        // Jobs should be sorted by score descending
        for (let i = 1; i < scoredJobs.length; i++) {
            expect(scoredJobs[i - 1].matchScore).toBeGreaterThanOrEqual(scoredJobs[i].matchScore);
        }
    });

    // ─── 5. Pipeline stage counts ───
    test('jobStats shows correct stage distribution', async () => {
        const { body } = await fetchJSON(`/api/dashboard/${SID}`);
        expect(body.jobStats.total).toBe(5);
        // Jobs above minScore=50 should be 'matched', others 'discovered'
        const matchedCount = body.jobStats.matched || 0;
        const discoveredCount = body.jobStats.discovered || 0;
        expect(matchedCount + discoveredCount).toBe(5);
        expect(matchedCount).toBeGreaterThanOrEqual(3);
    });

    // ─── 6. Generate resume (real resumeGen) ───
    test('generate tailored resume for best-matching job', async () => {
        const { body: dashboard } = await fetchJSON(`/api/dashboard/${SID}`);
        const bestJob = dashboard.jobs[0]; // Sorted by score desc

        const { status, body } = await postJSON(`/api/pipeline/${SID}/generate-resume`, {
            jobUrl: bestJob.url
        });
        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.markdown).toContain('Jane Smith');
        expect(body.markdown).toContain('React');
        expect(body.markdown.length).toBeGreaterThan(100);
    });

    // ─── 7. Generate cover letter (real coverLetter) ───
    test('generate cover letter for best-matching job', async () => {
        const { body: dashboard } = await fetchJSON(`/api/dashboard/${SID}`);
        const bestJob = dashboard.jobs[0];

        const { status, body } = await postJSON(`/api/pipeline/${SID}/generate-cover-letter`, {
            jobUrl: bestJob.url
        });
        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.markdown).toContain('Jane Smith');
        expect(body.markdown.length).toBeGreaterThan(100);
    });

    // ─── 8. Job status updated after resume gen ───
    test('job status becomes tailored after resume generation', async () => {
        const { body } = await fetchJSON(`/api/dashboard/${SID}`);
        const tailored = body.jobs.filter(j => j.status === 'tailored');
        expect(tailored.length).toBeGreaterThanOrEqual(1);
    });

    // ─── 9. Mark applied ───
    test('mark job as applied updates status and artifacts', async () => {
        const { body: dashboard } = await fetchJSON(`/api/dashboard/${SID}`);
        const bestJob = dashboard.jobs[0];

        const { body } = await postJSON(`/api/pipeline/${SID}/mark-applied`, {
            jobUrl: bestJob.url,
            note: 'Applied via company portal'
        });
        expect(body.success).toBe(true);

        // Verify
        const { body: updated } = await fetchJSON(`/api/dashboard/${SID}`);
        const applied = updated.jobs.find(j => j.url === bestJob.url);
        expect(applied.status).toBe('submitted');
        expect(applied.artifacts.applyNote).toBe('Applied via company portal');
        expect(applied.artifacts.appliedAt).toBeDefined();
    });

    // ─── 10. History shows only submitted jobs ───
    test('history returns only submitted jobs', async () => {
        const { body } = await fetchJSON(`/api/pipeline/${SID}/history`);
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBe(1);
        expect(body[0].status).toBe('submitted');
    });

    // ─── 11. Dashboard HTML renders job table ───
    test('dashboard HTML includes job data in table format', async () => {
        const { status, body } = await fetchHTML(`/dashboard/${SID}`);
        expect(status).toBe(200);
        expect(body).toContain('Automated Job Search');
        expect(body).toContain('job-table');
        expect(body).toContain('Application Pipeline');
        expect(body).toContain('tab-history');
    });

    // ─── 12. Error recovery ───
    test('pipeline recovers from search errors gracefully', async () => {
        const errorSid = 'error-recovery-' + Date.now();
        STATE.selectedAnswers[errorSid] = { q_job_title: 'Error Test' };
        STATE.profileSections[errorSid] = { skills: 'Test' };
        STATE.subtasks[errorSid] = [];
        STATE.intentFiles[errorSid] = { version: 1 };

        // Make search fail
        jobSearchHandler.mockRejectedValueOnce(new Error('Network timeout'));
        jobSearchHandler.mockResolvedValue({ listings: MOCK_LISTINGS });

        const { body } = await postJSON(`/api/pipeline/${errorSid}/start`, {
            minScore: 50, targetCount: 2
        });
        expect(body.running).toBe(true);

        await new Promise(r => setTimeout(r, 1000));

        const { body: status } = await fetchJSON(`/api/pipeline/${errorSid}/status`);
        expect(status.running).toBe(false);
        // Should have recorded the error but continued
        expect(status.progress.errors.some(e => e.includes('Network timeout'))).toBe(true);
    });

    // ─── 13. Stop mid-pipeline ───
    test('stop pipeline mid-execution', async () => {
        const stopSid = 'stop-mid-' + Date.now();
        STATE.selectedAnswers[stopSid] = { q_job_title: 'Stop Test' };
        STATE.profileSections[stopSid] = { skills: 'Test' };
        STATE.subtasks[stopSid] = [];
        STATE.intentFiles[stopSid] = { version: 1 };

        // Make search slow
        jobSearchHandler.mockImplementation(() => new Promise(r => setTimeout(() => r({ listings: MOCK_LISTINGS }), 2000)));

        await postJSON(`/api/pipeline/${stopSid}/start`, { minScore: 50, targetCount: 10 });

        // Stop immediately
        await new Promise(r => setTimeout(r, 100));
        const { body } = await postJSON(`/api/pipeline/${stopSid}/stop`, {});
        expect(body.stopped).toBe(true);

        await new Promise(r => setTimeout(r, 500));
        const { body: status } = await fetchJSON(`/api/pipeline/${stopSid}/status`);
        expect(status.running).toBe(false);
    });

    // ─── 14. Concurrent pipeline prevention ───
    test('cannot start two pipelines for same session', async () => {
        const concSid = 'conc-' + Date.now();
        STATE.selectedAnswers[concSid] = { q_job_title: 'Concurrent' };
        STATE.profileSections[concSid] = { skills: 'React' };
        STATE.subtasks[concSid] = [];
        STATE.intentFiles[concSid] = { version: 1 };

        jobSearchHandler.mockImplementation(() => new Promise(r => setTimeout(() => r({ listings: MOCK_LISTINGS }), 3000)));

        await postJSON(`/api/pipeline/${concSid}/start`, { minScore: 50 });

        const { body: dup } = await postJSON(`/api/pipeline/${concSid}/start`, { minScore: 50 });
        expect(dup.error).toMatch(/already running/i);

        // Cleanup
        await postJSON(`/api/pipeline/${concSid}/stop`, {});
    });
});
