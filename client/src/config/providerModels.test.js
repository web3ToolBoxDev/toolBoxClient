import { PROVIDER_MODEL_MAP, getModelsForProvider, getSubProviders } from './providerModels';

describe('providerModels', () => {
    describe('PROVIDER_MODEL_MAP structure', () => {
        it('has codex-cli, claude-code, and api-key providers', () => {
            expect(PROVIDER_MODEL_MAP).toHaveProperty('codex-cli');
            expect(PROVIDER_MODEL_MAP).toHaveProperty('claude-code');
            expect(PROVIDER_MODEL_MAP).toHaveProperty('api-key');
        });

        it('codex-cli and claude-code do not require API key', () => {
            expect(PROVIDER_MODEL_MAP['codex-cli'].requiresApiKey).toBe(false);
            expect(PROVIDER_MODEL_MAP['claude-code'].requiresApiKey).toBe(false);
        });

        it('api-key requires API key and has subProviders', () => {
            expect(PROVIDER_MODEL_MAP['api-key'].requiresApiKey).toBe(true);
            expect(PROVIDER_MODEL_MAP['api-key'].subProviders).toBeDefined();
            expect(Object.keys(PROVIDER_MODEL_MAP['api-key'].subProviders)).toEqual(
                expect.arrayContaining(['openai', 'anthropic', 'google'])
            );
        });

        it('each provider/subProvider has at least one model', () => {
            expect(PROVIDER_MODEL_MAP['codex-cli'].models.length).toBeGreaterThan(0);
            expect(PROVIDER_MODEL_MAP['claude-code'].models.length).toBeGreaterThan(0);
            Object.values(PROVIDER_MODEL_MAP['api-key'].subProviders).forEach((sub) => {
                expect(sub.models.length).toBeGreaterThan(0);
            });
        });
    });

    describe('getModelsForProvider', () => {
        it('returns models for codex-cli without subProvider', () => {
            const models = getModelsForProvider('codex-cli');
            expect(models).toEqual(PROVIDER_MODEL_MAP['codex-cli'].models);
        });

        it('returns models for claude-code without subProvider', () => {
            const models = getModelsForProvider('claude-code');
            expect(models).toEqual(PROVIDER_MODEL_MAP['claude-code'].models);
        });

        it('returns models for api-key with openai subProvider', () => {
            const models = getModelsForProvider('api-key', 'openai');
            expect(models).toEqual(PROVIDER_MODEL_MAP['api-key'].subProviders.openai.models);
        });

        it('returns models for api-key with anthropic subProvider', () => {
            const models = getModelsForProvider('api-key', 'anthropic');
            expect(models).toEqual(PROVIDER_MODEL_MAP['api-key'].subProviders.anthropic.models);
        });

        it('returns models for api-key with google subProvider', () => {
            const models = getModelsForProvider('api-key', 'google');
            expect(models).toEqual(PROVIDER_MODEL_MAP['api-key'].subProviders.google.models);
        });

        it('returns empty array for api-key without subProvider', () => {
            const models = getModelsForProvider('api-key', '');
            expect(models).toEqual([]);
        });

        it('returns empty array for unknown provider', () => {
            expect(getModelsForProvider('unknown')).toEqual([]);
        });

        it('returns empty array for undefined provider', () => {
            expect(getModelsForProvider(undefined)).toEqual([]);
        });
    });

    describe('getSubProviders', () => {
        it('returns sub-providers for api-key', () => {
            const subs = getSubProviders('api-key');
            expect(subs).toEqual([
                { value: 'openai', label: 'OpenAI' },
                { value: 'anthropic', label: 'Anthropic' },
                { value: 'google', label: 'Google' }
            ]);
        });

        it('returns empty array for codex-cli (no subProviders)', () => {
            expect(getSubProviders('codex-cli')).toEqual([]);
        });

        it('returns empty array for claude-code (no subProviders)', () => {
            expect(getSubProviders('claude-code')).toEqual([]);
        });

        it('returns empty array for unknown provider', () => {
            expect(getSubProviders('unknown')).toEqual([]);
        });
    });
});
