const fs = require('fs');
const path = require('path');
const os = require('os');
const { save, load, PERSIST_KEYS } = require('./sessionStore');

describe('sessionStore', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionStore-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns null when no saved state exists', () => {
        expect(load(tmpDir)).toBeNull();
    });

    it('save() is a deprecated no-op (does not write to disk)', () => {
        const state = {
            sessions: [{ id: 's1', name: 'Test', updatedAt: 1000 }],
            activeSessionId: 's1',
        };

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        save(tmpDir, state);
        warnSpy.mockRestore();

        // save() is now a no-op — file should NOT be created
        expect(fs.existsSync(path.join(tmpDir, 'sessions.json'))).toBe(false);
    });

    it('save() is silent (no console output)', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        save(tmpDir, { sessions: [] });
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('load() reads existing sessions.json for migration', () => {
        // Simulate a legacy sessions.json that already exists on disk
        const legacyData = {
            sessions: [{ id: 's1', name: 'Legacy', updatedAt: 1000 }],
            activeSessionId: 's1',
            conversations: { s1: [] },
            _savedAt: Date.now()
        };
        fs.writeFileSync(
            path.join(tmpDir, 'sessions.json'),
            JSON.stringify(legacyData, null, 2),
            'utf-8'
        );

        const loaded = load(tmpDir);
        expect(loaded).not.toBeNull();
        expect(loaded.sessions).toEqual(legacyData.sessions);
        expect(loaded.activeSessionId).toBe('s1');
    });

    it('returns null for corrupted JSON', () => {
        fs.writeFileSync(path.join(tmpDir, 'sessions.json'), '{invalid json', 'utf-8');
        expect(load(tmpDir)).toBeNull();
    });

    it('returns null for invalid structure (no sessions array)', () => {
        fs.writeFileSync(path.join(tmpDir, 'sessions.json'), '{"foo":"bar"}', 'utf-8');
        expect(load(tmpDir)).toBeNull();
    });

    it('PERSIST_KEYS does not include transient keys', () => {
        expect(PERSIST_KEYS).not.toContain('runtimeLogs');
        expect(PERSIST_KEYS).not.toContain('executionStates');
        expect(PERSIST_KEYS).not.toContain('runtimeApiKey');
        expect(PERSIST_KEYS).not.toContain('apiKeyConfiguredHint');
    });

    it('PERSIST_KEYS includes jobCards for job list persistence', () => {
        expect(PERSIST_KEYS).toContain('jobCards');
    });

    it('PERSIST_KEYS includes searchHistory', () => {
        expect(PERSIST_KEYS).toContain('searchHistory');
    });

    it('PERSIST_KEYS includes platformStatus', () => {
        expect(PERSIST_KEYS).toContain('platformStatus');
    });
});
