'use strict';

const http = require('http');
const { parse, applyAdd, applyRemove } = require('./markerParser');
const dashboardServer = require('./dashboardServer');

/**
 * Integration test: marker parsing -> state mutation -> dashboard data reflects changes.
 *
 * The dashboard server is a singleton (one HTTP server on a fixed port).
 * We start it once, mutate the state object between tests, and verify
 * that the live JSON endpoint returns the updated data.
 */

const TEST_PORT = 30099; // Use a different port to avoid conflicts with running app
const SESSION_ID = 'test-session-abc';
let stateRef;

function makeState() {
    return {
        selectedAnswers: {
            [SESSION_ID]: {
                q_job_title: 'Frontend Engineer',
                q_location: 'Toronto',
                q_work_mode: 'remote',
                q_salary: '120'
            }
        },
        profileSections: {
            [SESSION_ID]: {
                basic: 'John Doe, john@test.com',
                skills: 'React, Vue, TypeScript',
                experience: 'ACME Corp, 2020-2024, Frontend Lead',
                education: 'CS, University of Toronto, 2019'
            }
        },
        subtasks: {
            [SESSION_ID]: [
                { key: 'onboarding', status: 'done' },
                { key: 'profile', status: 'done' },
                { key: 'search', status: 'pending' }
            ]
        },
        intentFiles: { [SESSION_ID]: { version: 1 } }
    };
}

function fetchJSON(sessionId) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${TEST_PORT}/api/dashboard/${encodeURIComponent(sessionId)}`, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`JSON parse failed: ${data}`)); }
            });
        }).on('error', reject);
    });
}

/** Simulate applyMarkers: parse AI reply, mutate state */
function applyMarkersToState(markers) {
    const sections = stateRef.profileSections[SESSION_ID];
    const answers = stateRef.selectedAnswers[SESSION_ID];
    for (const m of markers) {
        if (m.type === 'profile') {
            if (m.op === 'SET') sections[m.field] = m.value;
            else if (m.op === 'ADD') sections[m.field] = applyAdd(sections[m.field] || '', m.value);
            else if (m.op === 'REMOVE') sections[m.field] = applyRemove(sections[m.field] || '', m.value);
        } else if (m.type === 'direction') {
            answers[m.field] = m.value;
        }
    }
}

describe('dashboardServer', () => {
    // Start server once for all tests on a test-specific port
    beforeAll((done) => {
        stateRef = makeState();
        dashboardServer.start(() => stateRef, TEST_PORT);
        setTimeout(done, 300);
    });

    afterAll(async () => {
        await dashboardServer.stop();
    });

    // Reset state before each test
    beforeEach(() => {
        stateRef = makeState();
    });

    describe('getDashboardURL', () => {
        it('returns correct URL', () => {
            expect(dashboardServer.getDashboardURL('abc-123'))
                .toBe(`http://127.0.0.1:${TEST_PORT}/dashboard/abc-123`);
        });

        it('URL-encodes special characters', () => {
            expect(dashboardServer.getDashboardURL('session/with spaces'))
                .toContain('session%2Fwith%20spaces');
        });
    });

    describe('JSON endpoint returns live state', () => {
        it('returns direction data', async () => {
            const data = await fetchJSON(SESSION_ID);
            expect(data.sessionId).toBe(SESSION_ID);
            expect(data.direction.jobTitle).toBe('Frontend Engineer');
            expect(data.direction.location).toBe('Toronto');
            expect(data.direction.workMode).toBe('remote');
            expect(data.direction.salary).toBe('120');
        });

        it('returns profile data', async () => {
            const data = await fetchJSON(SESSION_ID);
            expect(data.profile.basic).toBe('John Doe, john@test.com');
            expect(data.profile.skills).toBe('React, Vue, TypeScript');
            expect(data.profile.experience).toContain('ACME Corp');
            expect(data.profile.education).toContain('University of Toronto');
        });

        it('returns subtask status', async () => {
            const data = await fetchJSON(SESSION_ID);
            expect(data.subtasks).toHaveLength(3);
            expect(data.subtasks[0]).toEqual({ key: 'onboarding', status: 'done' });
            expect(data.subtasks[2]).toEqual({ key: 'search', status: 'pending' });
        });

        it('returns empty data for unknown session', async () => {
            const data = await fetchJSON('nonexistent');
            expect(data.direction.jobTitle).toBe('');
            expect(data.profile.basic).toBe('');
            expect(data.subtasks).toHaveLength(0);
        });
    });

    describe('marker -> state mutation -> dashboard reflects change', () => {
        it('ADD skill -> dashboard shows new skill', async () => {
            const { markers } = parse('Added K8s. [PROFILE_ADD:skills=K8s]');
            applyMarkersToState(markers);

            const data = await fetchJSON(SESSION_ID);
            expect(data.profile.skills).toContain('K8s');
            expect(data.profile.skills).toContain('React');
        });

        it('REMOVE skill -> dashboard no longer shows it', async () => {
            const { markers } = parse('Removed Vue. [PROFILE_REMOVE:skills=Vue]');
            applyMarkersToState(markers);

            const data = await fetchJSON(SESSION_ID);
            expect(data.profile.skills).not.toContain('Vue');
            expect(data.profile.skills).toContain('React');
            expect(data.profile.skills).toContain('TypeScript');
        });

        it('SET profile section -> dashboard shows replacement', async () => {
            const { markers } = parse('[PROFILE_SET:experience=Google, 2022-2024, Senior SWE]');
            applyMarkersToState(markers);

            const data = await fetchJSON(SESSION_ID);
            expect(data.profile.experience).toBe('Google, 2022-2024, Senior SWE');
            expect(data.profile.experience).not.toContain('ACME');
        });

        it('DIRECTION change -> dashboard shows new direction', async () => {
            const { markers } = parse('[DIRECTION:q_job_title=Backend Engineer]');
            applyMarkersToState(markers);

            const data = await fetchJSON(SESSION_ID);
            expect(data.direction.jobTitle).toBe('Backend Engineer');
        });

        it('multiple markers -> all changes reflected', async () => {
            const reply = [
                'Updated.',
                '[PROFILE_ADD:skills=Docker]',
                '[PROFILE_REMOVE:skills=Vue]',
                '[PROFILE_SET:highlights=Led migration to microservices]',
                '[DIRECTION:q_location=Shanghai]'
            ].join('\n');

            const { markers } = parse(reply);
            applyMarkersToState(markers);

            const data = await fetchJSON(SESSION_ID);
            expect(data.profile.skills).toContain('Docker');
            expect(data.profile.skills).not.toContain('Vue');
            expect(data.profile.highlights).toBe('Led migration to microservices');
            expect(data.direction.location).toBe('Shanghai');
        });

        it('sequential add then remove -> final state correct', async () => {
            const { markers: m1 } = parse('[PROFILE_ADD:skills=K8s]');
            applyMarkersToState(m1);

            let data = await fetchJSON(SESSION_ID);
            expect(data.profile.skills).toContain('K8s');

            const { markers: m2 } = parse('[PROFILE_REMOVE:skills=K8s]');
            applyMarkersToState(m2);

            data = await fetchJSON(SESSION_ID);
            expect(data.profile.skills).not.toContain('K8s');
        });

        it('add duplicate skill is idempotent', async () => {
            const { markers } = parse('[PROFILE_ADD:skills=React]');
            applyMarkersToState(markers);

            const data = await fetchJSON(SESSION_ID);
            const count = data.profile.skills.split('React').length - 1;
            expect(count).toBe(1);
        });
    });

    // ─── Job Workflow State ───
    describe('job workflow state', () => {
        const { upsertJobCard, updateJobStatus, getJobCards, getJobStats } = dashboardServer;

        // Use unique session IDs per test to avoid cross-contamination
        let jobTestCounter = 0;
        function jobSid() { return `job-test-${++jobTestCounter}-${Date.now()}`; }

        describe('upsertJobCard', () => {
            it('creates a new job card with defaults', () => {
                const sid = jobSid();
                upsertJobCard(sid, { url: 'https://example.com/j/1', title: 'Dev', company: 'Acme' });
                const cards = getJobCards(sid);
                expect(cards).toHaveLength(1);
                expect(cards[0].url).toBe('https://example.com/j/1');
                expect(cards[0].title).toBe('Dev');
                expect(cards[0].company).toBe('Acme');
                expect(cards[0].status).toBe('discovered');
                expect(cards[0].matchScore).toBeNull();
                expect(cards[0].createdAt).toBeDefined();
                expect(cards[0].updatedAt).toBeDefined();
            });

            it('merges updates into existing card', () => {
                const sid = jobSid();
                upsertJobCard(sid, { url: 'https://example.com/j/2', title: 'Dev' });
                upsertJobCard(sid, { url: 'https://example.com/j/2', company: 'BigCo', matchScore: 85 });
                const cards = getJobCards(sid);
                expect(cards).toHaveLength(1);
                expect(cards[0].title).toBe('Dev');
                expect(cards[0].company).toBe('BigCo');
                expect(cards[0].matchScore).toBe(85);
            });

            it('ignores null or missing url', () => {
                const sid = jobSid();
                upsertJobCard(sid, null);
                upsertJobCard(sid, { title: 'No URL' });
                expect(getJobCards(sid)).toHaveLength(0);
            });

            it('merges artifacts from separate upserts', () => {
                const sid = jobSid();
                upsertJobCard(sid, { url: 'https://example.com/j/3', artifacts: { resume: 'v1.md' } });
                upsertJobCard(sid, { url: 'https://example.com/j/3', artifacts: { coverLetter: 'cl.md' } });
                const card = getJobCards(sid)[0];
                expect(card.artifacts.resume).toBe('v1.md');
                expect(card.artifacts.coverLetter).toBe('cl.md');
            });

            it('preserves createdAt on update', () => {
                const sid = jobSid();
                upsertJobCard(sid, { url: 'https://example.com/j/4', title: 'Old' });
                const created = getJobCards(sid)[0].createdAt;
                upsertJobCard(sid, { url: 'https://example.com/j/4', title: 'New' });
                expect(getJobCards(sid)[0].createdAt).toBe(created);
            });
        });

        describe('updateJobStatus', () => {
            it('updates existing card status', () => {
                const sid = jobSid();
                upsertJobCard(sid, { url: 'https://example.com/s/1', title: 'X' });
                updateJobStatus(sid, 'https://example.com/s/1', 'matched');
                expect(getJobCards(sid)[0].status).toBe('matched');
            });

            it('does nothing for nonexistent job', () => {
                const sid = jobSid();
                upsertJobCard(sid, { url: 'https://example.com/s/2' });
                updateJobStatus(sid, 'https://nonexist.com', 'submitted');
                expect(getJobCards(sid)[0].status).toBe('discovered');
            });
        });

        describe('getJobCards', () => {
            it('returns empty array for new session', () => {
                expect(getJobCards(jobSid())).toEqual([]);
            });

            it('sorts by matchScore descending', () => {
                const sid = jobSid();
                upsertJobCard(sid, { url: 'https://a.com/1', matchScore: 50 });
                upsertJobCard(sid, { url: 'https://a.com/2', matchScore: 90 });
                upsertJobCard(sid, { url: 'https://a.com/3', matchScore: 70 });
                const cards = getJobCards(sid);
                expect(cards[0].matchScore).toBe(90);
                expect(cards[1].matchScore).toBe(70);
                expect(cards[2].matchScore).toBe(50);
            });

            it('null scores come after scored cards', () => {
                const sid = jobSid();
                upsertJobCard(sid, { url: 'https://b.com/1' });
                upsertJobCard(sid, { url: 'https://b.com/2', matchScore: 60 });
                const cards = getJobCards(sid);
                expect(cards[0].matchScore).toBe(60);
                expect(cards[1].matchScore).toBeNull();
            });
        });

        describe('getJobStats', () => {
            it('returns total and counts by status', () => {
                const sid = jobSid();
                upsertJobCard(sid, { url: 'https://c.com/1', status: 'discovered' });
                upsertJobCard(sid, { url: 'https://c.com/2', status: 'matched' });
                upsertJobCard(sid, { url: 'https://c.com/3', status: 'matched' });
                upsertJobCard(sid, { url: 'https://c.com/4', status: 'submitted' });
                const stats = getJobStats(sid);
                expect(stats.total).toBe(4);
                expect(stats.discovered).toBe(1);
                expect(stats.matched).toBe(2);
                expect(stats.submitted).toBe(1);
            });

            it('returns total 0 for empty session', () => {
                expect(getJobStats(jobSid()).total).toBe(0);
            });
        });
    });

    // ─── Job Workflow HTTP API ───
    describe('job workflow HTTP API', () => {
        const { upsertJobCard, getJobCards } = dashboardServer;

        function postJSON(path, body) {
            return new Promise((resolve, reject) => {
                const postData = JSON.stringify(body);
                const req = http.request({
                    hostname: '127.0.0.1',
                    port: TEST_PORT,
                    path,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
                }, (res) => {
                    let data = '';
                    res.on('data', c => { data += c; });
                    res.on('end', () => {
                        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                        catch (e) { reject(new Error(`Parse failed: ${data}`)); }
                    });
                });
                req.on('error', reject);
                req.write(postData);
                req.end();
            });
        }

        it('POST /api/jobs/:sessionId upserts job card', async () => {
            const sid = `http-job-${Date.now()}`;
            const res = await postJSON(`/api/jobs/${sid}`, { url: 'https://test.com/j1', title: 'QA', company: 'TestCo' });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            const cards = getJobCards(sid);
            expect(cards.find(c => c.url === 'https://test.com/j1')).toBeDefined();
        });

        it('POST /api/jobs/:sessionId/status updates job status', async () => {
            const sid = `http-status-${Date.now()}`;
            upsertJobCard(sid, { url: 'https://test.com/j2', title: 'Dev2' });

            const res = await postJSON(`/api/jobs/${sid}/status`, { jobUrl: 'https://test.com/j2', status: 'submitted' });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            const card = getJobCards(sid).find(c => c.url === 'https://test.com/j2');
            expect(card.status).toBe('submitted');
        });

        it('POST /api/jobs/:sessionId returns 400 for invalid JSON', async () => {
            return new Promise((resolve, reject) => {
                const req = http.request({
                    hostname: '127.0.0.1',
                    port: TEST_PORT,
                    path: `/api/jobs/bad-json-test`,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Content-Length': 11 }
                }, (res) => {
                    let data = '';
                    res.on('data', c => { data += c; });
                    res.on('end', () => {
                        expect(res.statusCode).toBe(400);
                        resolve();
                    });
                });
                req.on('error', reject);
                req.write('not-json!!!');
                req.end();
            });
        });

        it('dashboard data includes job cards and stats', async () => {
            const sid = `http-data-${Date.now()}`;
            stateRef.selectedAnswers[sid] = { q_job_title: 'Tester' };
            stateRef.profileSections[sid] = { basic: 'Jane' };
            stateRef.subtasks[sid] = [];
            stateRef.intentFiles[sid] = { version: 1 };

            upsertJobCard(sid, { url: 'https://test.com/data1', title: 'Job A', matchScore: 80 });
            upsertJobCard(sid, { url: 'https://test.com/data2', title: 'Job B', status: 'matched' });

            const data = await fetchJSON(sid);
            expect(data.jobs).toHaveLength(2);
            expect(data.jobStats.total).toBe(2);
        });
    });
});
