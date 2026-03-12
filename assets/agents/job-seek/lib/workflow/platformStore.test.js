'use strict';

const fs = require('fs');
const path = require('path');
const platformStore = require('./platformStore');

// Clean up any test artifacts
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const TOOLS_FILE = path.join(DATA_DIR, 'platform-tools.json');
let _originalToolsContent = null;

beforeAll(() => {
    // Backup existing tools file if present
    try {
        if (fs.existsSync(TOOLS_FILE)) {
            _originalToolsContent = fs.readFileSync(TOOLS_FILE, 'utf-8');
        }
    } catch (_) { /* ignore */ }
    // Write empty cache so tests start clean
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(TOOLS_FILE, '{}', 'utf-8');
    } catch (_) { /* ignore */ }
});

afterAll(() => {
    // Restore original tools file
    try {
        if (_originalToolsContent !== null) {
            fs.writeFileSync(TOOLS_FILE, _originalToolsContent, 'utf-8');
        } else if (fs.existsSync(TOOLS_FILE)) {
            // Only remove if we created it
            fs.unlinkSync(TOOLS_FILE);
        }
    } catch (_) { /* ignore */ }
});

describe('platformStore', () => {
    const SESSION = 'plat-test-' + Date.now();

    afterEach(() => {
        platformStore.clearSession(SESSION);
        // Reset tools cache between tests
        try { fs.writeFileSync(TOOLS_FILE, '{}', 'utf-8'); } catch (_) { /* ignore */ }
    });

    describe('initWithPresets', () => {
        test('Canada location gets indeed, linkedin, jobbank', () => {
            const platforms = platformStore.initWithPresets(SESSION, 'Toronto, Canada');
            expect(platforms).toHaveLength(3);
            expect(platforms.map(p => p.name)).toEqual(['Indeed', 'LinkedIn', 'Job Bank']);
            expect(platforms[0].url).toContain('ca.indeed.com');
            expect(platforms[2].url).toContain('jobbank.gc.ca');
            expect(platforms.every(p => p.preset)).toBe(true);
            expect(platforms.every(p => p.status === 'disconnected')).toBe(true);
        });

        test('US location gets indeed, linkedin, glassdoor', () => {
            const platforms = platformStore.initWithPresets(SESSION, 'New York, USA');
            expect(platforms.map(p => p.name)).toEqual(['Indeed', 'LinkedIn', 'Glassdoor']);
            expect(platforms[0].url).toContain('www.indeed.com');
        });

        test('China location gets Boss直聘, 拉勾, LinkedIn', () => {
            const platforms = platformStore.initWithPresets(SESSION, '上海');
            expect(platforms.map(p => p.name)).toEqual(['Boss直聘', '拉勾', 'LinkedIn']);
        });

        test('unknown location gets default presets', () => {
            const platforms = platformStore.initWithPresets(SESSION, 'Mars');
            expect(platforms).toHaveLength(3);
            expect(platforms.map(p => p.name)).toEqual(['Indeed', 'LinkedIn', 'Glassdoor']);
        });

        test('does not re-initialize if platforms already exist', () => {
            platformStore.initWithPresets(SESSION, 'Toronto');
            platformStore.addPlatform(SESSION, { name: 'Custom', url: 'https://custom.com' });
            const platforms = platformStore.initWithPresets(SESSION, 'New York'); // different location
            expect(platforms).toHaveLength(4); // 3 presets + 1 custom, NOT re-initialized
            expect(platforms[3].name).toBe('Custom');
        });

        test('preset platforms have correct tool structure', () => {
            const platforms = platformStore.initWithPresets(SESSION, 'Toronto');
            for (const p of platforms) {
                expect(p.tools.search.status).toBe('not_built');
                expect(p.tools.apply.status).toBe('not_built');
                expect(p.config.step2.enabled).toBe(true);
                expect(p.config.step3.tailorResume).toBe(true);
                expect(p.config.step4.autoApply).toBe(true);
            }
        });
    });

    describe('addPlatform', () => {
        test('adds a new platform', () => {
            platformStore.initWithPresets(SESSION, 'Toronto');
            const result = platformStore.addPlatform(SESSION, {
                name: 'Dice',
                url: 'https://www.dice.com/jobs',
                icon: '🎲',
                connectionType: 'browser'
            });
            expect(result.success).toBe(true);
            expect(result.platform.name).toBe('Dice');
            expect(result.platform.preset).toBe(false);
            expect(platformStore.getPlatforms(SESSION)).toHaveLength(4);
        });

        test('rejects duplicate URL', () => {
            platformStore.initWithPresets(SESSION, 'Toronto');
            const result = platformStore.addPlatform(SESSION, {
                name: 'Duplicate Indeed',
                url: 'https://ca.indeed.com/jobs'
            });
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/already exists/);
        });

        test('rejects missing name or URL', () => {
            expect(platformStore.addPlatform(SESSION, { name: '' }).success).toBe(false);
            expect(platformStore.addPlatform(SESSION, { url: 'http://x.com' }).success).toBe(false);
        });
    });

    describe('removePlatform', () => {
        test('removes a platform by ID', () => {
            const platforms = platformStore.initWithPresets(SESSION, 'Toronto');
            const id = platforms[1].id;
            const result = platformStore.removePlatform(SESSION, id);
            expect(result.success).toBe(true);
            expect(result.platform.name).toBe('LinkedIn');
            expect(platformStore.getPlatforms(SESSION)).toHaveLength(2);
        });

        test('returns error for unknown ID', () => {
            platformStore.initWithPresets(SESSION, 'Toronto');
            expect(platformStore.removePlatform(SESSION, 'fake_id').success).toBe(false);
        });
    });

    describe('updatePlatform', () => {
        test('updates allowed fields', () => {
            const platforms = platformStore.initWithPresets(SESSION, 'Toronto');
            const id = platforms[0].id;
            const result = platformStore.updatePlatform(SESSION, id, {
                name: 'Indeed Canada',
                status: 'connected'
            });
            expect(result.success).toBe(true);
            expect(result.platform.name).toBe('Indeed Canada');
            expect(result.platform.status).toBe('connected');
        });

        test('merges config updates', () => {
            const platforms = platformStore.initWithPresets(SESSION, 'Toronto');
            const id = platforms[0].id;
            platformStore.updatePlatform(SESSION, id, {
                config: { step2: { minScore: 80 } }
            });
            const updated = platformStore.getPlatform(SESSION, id);
            expect(updated.config.step2.minScore).toBe(80);
        });
    });

    describe('updateToolStatus', () => {
        test('updates tool status', () => {
            const platforms = platformStore.initWithPresets(SESSION, 'Toronto');
            const id = platforms[0].id;
            const result = platformStore.updateToolStatus(SESSION, id, 'search', 'building');
            expect(result.success).toBe(true);
            expect(result.tool.status).toBe('building');
        });

        test('increments version on ready with script', () => {
            const platforms = platformStore.initWithPresets(SESSION, 'Toronto');
            const id = platforms[0].id;
            platformStore.updateToolStatus(SESSION, id, 'search', 'ready', { script: 'console.log("test")' });
            const tool = platformStore.getPlatform(SESSION, id).tools.search;
            expect(tool.version).toBe(1);
            expect(tool.script).toBe('console.log("test")');
        });

        test('rejects invalid tool type', () => {
            const platforms = platformStore.initWithPresets(SESSION, 'Toronto');
            const result = platformStore.updateToolStatus(SESSION, platforms[0].id, 'invalid', 'ready');
            expect(result.success).toBe(false);
        });
    });

    describe('tool script persistence', () => {
        test('ready tool script is saved to disk', () => {
            const platforms = platformStore.initWithPresets(SESSION, 'Toronto');
            const id = platforms[0].id;
            const script = 'async function search() { return []; }';

            platformStore.updateToolStatus(SESSION, id, 'search', 'ready', { script });

            // Read the file and verify
            const raw = fs.readFileSync(TOOLS_FILE, 'utf-8');
            const saved = JSON.parse(raw);
            expect(saved['https://ca.indeed.com/jobs']).toBeDefined();
            expect(saved['https://ca.indeed.com/jobs'].search.script).toBe(script);
            expect(saved['https://ca.indeed.com/jobs'].search.version).toBe(1);
            expect(saved['https://ca.indeed.com/jobs'].search.savedAt).toBeTruthy();
        });

        test('building status does NOT save to disk', () => {
            const platforms = platformStore.initWithPresets(SESSION, 'Toronto');
            const id = platforms[0].id;

            platformStore.updateToolStatus(SESSION, id, 'search', 'building');

            const raw = fs.readFileSync(TOOLS_FILE, 'utf-8');
            const saved = JSON.parse(raw);
            expect(Object.keys(saved)).toHaveLength(0);
        });

        test('initWithPresets restores saved tools from disk', () => {
            // Pre-save tool scripts
            const savedData = {
                'https://ca.indeed.com/jobs': {
                    search: { script: 'saved indeed script', version: 5, savedAt: '2025-01-01' }
                },
                'https://www.linkedin.com/jobs': {
                    search: { script: 'saved linkedin search', version: 2, savedAt: '2025-01-01' },
                    apply: { script: 'saved linkedin apply', version: 1, savedAt: '2025-01-01' }
                }
            };
            fs.writeFileSync(TOOLS_FILE, JSON.stringify(savedData), 'utf-8');

            const platforms = platformStore.initWithPresets(SESSION, 'Toronto');

            // Indeed: search restored, apply not_built
            const indeed = platforms.find(p => p.name === 'Indeed');
            expect(indeed.tools.search.status).toBe('ready');
            expect(indeed.tools.search.script).toBe('saved indeed script');
            expect(indeed.tools.search.version).toBe(5);
            expect(indeed.tools.apply.status).toBe('not_built');

            // LinkedIn: both restored
            const linkedin = platforms.find(p => p.name === 'LinkedIn');
            expect(linkedin.tools.search.status).toBe('ready');
            expect(linkedin.tools.search.script).toBe('saved linkedin search');
            expect(linkedin.tools.apply.status).toBe('ready');
            expect(linkedin.tools.apply.script).toBe('saved linkedin apply');

            // Job Bank: no saved data, remains not_built
            const jobbank = platforms.find(p => p.name === 'Job Bank');
            expect(jobbank.tools.search.status).toBe('not_built');
        });

        test('addPlatform restores saved tools', () => {
            const savedData = {
                'https://dice.com/jobs': {
                    search: { script: 'dice search', version: 1, savedAt: '2025-01-01' }
                }
            };
            fs.writeFileSync(TOOLS_FILE, JSON.stringify(savedData), 'utf-8');

            platformStore.initWithPresets(SESSION, 'Toronto');
            const result = platformStore.addPlatform(SESSION, {
                name: 'Dice',
                url: 'https://dice.com/jobs'
            });

            expect(result.success).toBe(true);
            expect(result.platform.tools.search.status).toBe('ready');
            expect(result.platform.tools.search.script).toBe('dice search');
        });

        test('version increments on each save', () => {
            const platforms = platformStore.initWithPresets(SESSION, 'Toronto');
            const id = platforms[0].id;

            platformStore.updateToolStatus(SESSION, id, 'search', 'ready', { script: 'v1' });
            expect(platforms[0].tools.search.version).toBe(1);

            platformStore.updateToolStatus(SESSION, id, 'search', 'ready', { script: 'v2' });
            expect(platforms[0].tools.search.version).toBe(2);

            // Verify on disk
            const raw = fs.readFileSync(TOOLS_FILE, 'utf-8');
            const saved = JSON.parse(raw);
            expect(saved['https://ca.indeed.com/jobs'].search.version).toBe(2);
            expect(saved['https://ca.indeed.com/jobs'].search.script).toBe('v2');
        });

        test('handles missing tools file gracefully', () => {
            // Remove the file
            try { fs.unlinkSync(TOOLS_FILE); } catch (_) { /* ignore */ }

            // Should not throw
            const platforms = platformStore.initWithPresets(SESSION, 'Toronto');
            expect(platforms).toHaveLength(3);
            expect(platforms[0].tools.search.status).toBe('not_built');
        });
    });

    describe('getPresetsForRegion', () => {
        test('returns canada presets', () => {
            const presets = platformStore.getPresetsForRegion('canada');
            expect(presets).toHaveLength(3);
            expect(presets[0].name).toBe('Indeed');
        });

        test('returns default for unknown region', () => {
            const presets = platformStore.getPresetsForRegion('unknown');
            expect(presets).toHaveLength(3);
        });
    });
});
