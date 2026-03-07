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
});
