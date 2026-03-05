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

    it('saves and loads state correctly', () => {
        const state = {
            sessions: [{ id: 's1', name: 'Test', updatedAt: 1000 }],
            activeSessionId: 's1',
            conversations: { s1: [{ id: 'm1', role: 'user', content: 'hello' }] },
            subtasks: { s1: [] },
            artifacts: { s1: [{ id: 'a1', name: 'resume.pdf' }] },
            prompts: { s1: {} },
            stages: { s1: 0 },
            selectedAnswers: { s1: {} },
            runtimeContexts: { s1: { mode: 'ai', provider: 'claude-code', model: 'sonnet' } },
            attachmentKinds: { s1: ['pdf'] },
            currentModel: 'sonnet',
            currentProvider: 'claude-code',
            currentSubProvider: '',
            language: 'zh-CN',
            envs: [{ id: 'env1', name: 'Test Env' }],
            wallets: [{ id: 'w1', name: 'Wallet1', bindEnvId: 'env1' }],
            envsData: { env1: { user_agent: 'Mozilla/5.0', audio: '0.123' } },
            chromePath: 'C:/chrome.exe',
            savePath: 'C:/save',
            walletExtensionPath: 'C:/metamask',
            // Transient keys that should NOT be persisted:
            runtimeLogs: { s1: ['log1'] },
            executionStates: { s1: { paused: false, canceled: false } },
            runtimeApiKey: 'sk-secret',
            apiKeyConfiguredHint: true
        };

        save(tmpDir, state);

        const loaded = load(tmpDir);
        expect(loaded).not.toBeNull();
        expect(loaded.sessions).toEqual(state.sessions);
        expect(loaded.activeSessionId).toBe('s1');
        expect(loaded.conversations.s1).toHaveLength(1);
        expect(loaded.artifacts.s1).toHaveLength(1);
        expect(loaded.runtimeContexts.s1.provider).toBe('claude-code');
        expect(loaded.currentModel).toBe('sonnet');
        expect(loaded.language).toBe('zh-CN');
        expect(loaded.envs).toEqual([{ id: 'env1', name: 'Test Env' }]);
        expect(loaded.wallets).toHaveLength(1);
        expect(loaded.envsData.env1.user_agent).toBe('Mozilla/5.0');
        expect(loaded.chromePath).toBe('C:/chrome.exe');
        expect(loaded.savePath).toBe('C:/save');
        expect(loaded.walletExtensionPath).toBe('C:/metamask');
        // Transient keys should NOT be saved
        expect(loaded.runtimeLogs).toBeUndefined();
        expect(loaded.executionStates).toBeUndefined();
        expect(loaded.runtimeApiKey).toBeUndefined();
        expect(loaded.apiKeyConfiguredHint).toBeUndefined();
        expect(loaded._savedAt).toBeDefined();
    });

    it('returns null for corrupted JSON', () => {
        fs.writeFileSync(path.join(tmpDir, 'sessions.json'), '{invalid json', 'utf-8');
        expect(load(tmpDir)).toBeNull();
    });

    it('returns null for invalid structure (no sessions array)', () => {
        fs.writeFileSync(path.join(tmpDir, 'sessions.json'), '{"foo":"bar"}', 'utf-8');
        expect(load(tmpDir)).toBeNull();
    });

    it('creates data directory if it does not exist', () => {
        const nested = path.join(tmpDir, 'a', 'b', 'c');
        save(nested, { sessions: [], activeSessionId: '' });
        expect(fs.existsSync(path.join(nested, 'sessions.json'))).toBe(true);
    });

    it('PERSIST_KEYS does not include transient keys', () => {
        expect(PERSIST_KEYS).not.toContain('runtimeLogs');
        expect(PERSIST_KEYS).not.toContain('executionStates');
        expect(PERSIST_KEYS).not.toContain('runtimeApiKey');
        expect(PERSIST_KEYS).not.toContain('apiKeyConfiguredHint');
    });
});
