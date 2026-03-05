const { getProviderModels, KNOWN_MODELS, getCliModels, getAnthropicModels } = require('./providerModelService');

// Mock child_process to avoid real CLI checks
jest.mock('child_process', () => ({
    execSync: jest.fn(() => { throw new Error('not found'); }),
    spawn: jest.fn()
}));

// Mock https/http to avoid real network calls
jest.mock('https', () => ({
    get: jest.fn((url, opts, cb) => {
        const mockRes = {
            statusCode: 200,
            on: jest.fn((event, handler) => {
                if (event === 'data') handler(JSON.stringify({ data: [] }));
                if (event === 'end') handler();
            })
        };
        cb(mockRes);
        return { on: jest.fn(), destroy: jest.fn() };
    })
}));

describe('providerModelService', () => {
    describe('getProviderModels', () => {
        it('returns known models for codex-cli', async () => {
            const result = await getProviderModels('codex-cli', '', '');
            expect(result.success).toBe(true);
            expect(result.models).toEqual(KNOWN_MODELS['codex-cli']);
            expect(typeof result.available).toBe('boolean');
        });

        it('returns known models for claude-code', async () => {
            const result = await getProviderModels('claude-code', '', '');
            expect(result.success).toBe(true);
            expect(result.models).toEqual(KNOWN_MODELS['claude-code']);
        });

        it('returns anthropic models for api-key + anthropic', async () => {
            const result = await getProviderModels('api-key', 'anthropic', '');
            expect(result.success).toBe(true);
            expect(result.models).toEqual(KNOWN_MODELS['anthropic']);
        });

        it('returns fallback openai models when no api key', async () => {
            const result = await getProviderModels('api-key', 'openai', '');
            expect(result.success).toBe(true);
            expect(result.models).toEqual(KNOWN_MODELS['openai']);
        });

        it('returns fallback google models when no api key', async () => {
            const result = await getProviderModels('api-key', 'google', '');
            expect(result.success).toBe(true);
            expect(result.models).toEqual(KNOWN_MODELS['google']);
        });

        it('returns error for unknown provider', async () => {
            const result = await getProviderModels('unknown', '', '');
            expect(result.success).toBe(false);
            expect(result.models).toEqual([]);
        });

        it('returns error for unknown sub-provider', async () => {
            const result = await getProviderModels('api-key', 'unknown', '');
            expect(result.success).toBe(false);
            expect(result.models).toEqual([]);
        });
    });

    describe('getCliModels', () => {
        it('returns models and availability status', () => {
            const result = getCliModels('claude-code');
            expect(result.models).toEqual(KNOWN_MODELS['claude-code']);
            expect(typeof result.available).toBe('boolean');
        });

        it('returns codex-cli models', () => {
            const result = getCliModels('codex-cli');
            expect(result.models).toEqual(KNOWN_MODELS['codex-cli']);
        });
    });

    describe('getAnthropicModels', () => {
        it('returns known anthropic models', () => {
            const models = getAnthropicModels();
            expect(models).toEqual(KNOWN_MODELS['anthropic']);
            expect(models.length).toBeGreaterThan(0);
        });
    });

    describe('KNOWN_MODELS', () => {
        it('has entries for all expected providers', () => {
            expect(KNOWN_MODELS).toHaveProperty('codex-cli');
            expect(KNOWN_MODELS).toHaveProperty('claude-code');
            expect(KNOWN_MODELS).toHaveProperty('openai');
            expect(KNOWN_MODELS).toHaveProperty('anthropic');
            expect(KNOWN_MODELS).toHaveProperty('google');
        });

        it('claude-code includes both sonnet and opus', () => {
            const values = KNOWN_MODELS['claude-code'].map((m) => m.value);
            expect(values).toContain('claude-sonnet-4-6');
            expect(values).toContain('claude-opus-4-6');
        });

        it('each provider has at least one model with value and label', () => {
            Object.values(KNOWN_MODELS).forEach((models) => {
                expect(models.length).toBeGreaterThan(0);
                models.forEach((m) => {
                    expect(m).toHaveProperty('value');
                    expect(m).toHaveProperty('label');
                });
            });
        });
    });
});
