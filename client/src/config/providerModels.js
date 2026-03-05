export const PROVIDER_MODEL_MAP = {
    'codex-cli': {
        label: 'Codex CLI',
        labelZh: 'Codex CLI (订阅)',
        requiresApiKey: false,
        models: [
            { value: 'default', label: 'Default (CLI default)' },
            { value: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
            { value: 'gpt-5.3-codex-spark', label: 'gpt-5.3-codex-spark' },
            { value: 'gpt-5.2-codex', label: 'gpt-5.2-codex' },
            { value: 'gpt-5.1-codex-max', label: 'gpt-5.1-codex-max' },
            { value: 'gpt-5.1-codex', label: 'gpt-5.1-codex' },
            { value: 'gpt-5-codex', label: 'gpt-5-codex' },
            { value: 'gpt-5-codex-mini', label: 'gpt-5-codex-mini' },
        ]
    },
    'claude-code': {
        label: 'Claude Code',
        labelZh: 'Claude Code (订阅)',
        requiresApiKey: false,
        models: [
            { value: 'default', label: 'Default (CLI default)' },
            { value: 'sonnet', label: 'sonnet (latest)' },
            { value: 'opus', label: 'opus (latest)' },
            { value: 'haiku', label: 'haiku (latest)' },
            { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
            { value: 'claude-opus-4-6', label: 'claude-opus-4-6' },
            { value: 'claude-haiku-4-5', label: 'claude-haiku-4-5' },
        ]
    },
    'api-key': {
        label: 'API Key',
        labelZh: 'API Key',
        requiresApiKey: true,
        subProviders: {
            'openai': {
                label: 'OpenAI',
                models: [
                    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
                    { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
                    { value: 'gpt-4.1', label: 'gpt-4.1' },
                    { value: 'gpt-4o', label: 'gpt-4o' },
                    { value: 'o4-mini', label: 'o4-mini' },
                    { value: 'o3', label: 'o3' },
                ]
            },
            'anthropic': {
                label: 'Anthropic',
                models: [
                    { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
                    { value: 'claude-opus-4-6', label: 'claude-opus-4-6' },
                    { value: 'claude-haiku-4-5', label: 'claude-haiku-4-5' },
                ]
            },
            'google': {
                label: 'Google',
                models: [
                    { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
                    { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
                    { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
                ]
            }
        }
    }
};

export function getModelsForProvider(provider, subProvider) {
    const providerConfig = PROVIDER_MODEL_MAP[provider];
    if (!providerConfig) return [];
    if (providerConfig.subProviders) {
        const sub = providerConfig.subProviders[subProvider];
        return sub ? sub.models : [];
    }
    return providerConfig.models || [];
}

export function getSubProviders(provider) {
    const providerConfig = PROVIDER_MODEL_MAP[provider];
    if (!providerConfig || !providerConfig.subProviders) return [];
    return Object.entries(providerConfig.subProviders).map(([key, val]) => ({
        value: key,
        label: val.label
    }));
}
