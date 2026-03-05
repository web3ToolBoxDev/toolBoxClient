const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

// --------------- known model fallbacks ---------------

const KNOWN_MODELS = {
    'codex-cli': [
        { value: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
        { value: 'gpt-5.3-codex-spark', label: 'gpt-5.3-codex-spark' },
        { value: 'gpt-5.2-codex', label: 'gpt-5.2-codex' },
        { value: 'gpt-5.1-codex-max', label: 'gpt-5.1-codex-max' },
        { value: 'gpt-5.1-codex', label: 'gpt-5.1-codex' },
        { value: 'gpt-5-codex', label: 'gpt-5-codex' },
        { value: 'gpt-5-codex-mini', label: 'gpt-5-codex-mini' },
    ],
    'claude-code': [
        { value: 'sonnet', label: 'sonnet (latest)' },
        { value: 'opus', label: 'opus (latest)' },
        { value: 'haiku', label: 'haiku (latest)' },
        { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
        { value: 'claude-opus-4-6', label: 'claude-opus-4-6' },
        { value: 'claude-haiku-4-5', label: 'claude-haiku-4-5' },
    ],
    'openai': [
        { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
        { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
        { value: 'gpt-4.1', label: 'gpt-4.1' },
        { value: 'gpt-4o', label: 'gpt-4o' },
        { value: 'o4-mini', label: 'o4-mini' },
        { value: 'o3', label: 'o3' },
    ],
    'anthropic': [
        { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
        { value: 'claude-opus-4-6', label: 'claude-opus-4-6' },
        { value: 'claude-haiku-4-5', label: 'claude-haiku-4-5' },
    ],
    'google': [
        { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
        { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
        { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
    ]
};

// --------------- helpers ---------------

function httpGet(url, headers = {}, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { headers, timeout: timeoutMs }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON')); }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function checkCliAvailable(cmd) {
    try {
        execSync(`${cmd} --version`, { stdio: 'ignore', timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

// --------------- provider fetch functions ---------------

async function fetchOpenAIModels(apiKey) {
    if (!apiKey) return KNOWN_MODELS['openai'];
    try {
        const data = await httpGet('https://api.openai.com/v1/models', {
            'Authorization': `Bearer ${apiKey}`
        });
        const models = (data?.data || [])
            .filter((m) => {
                const id = m?.id || '';
                return /^(gpt-4|gpt-3\.5|o[1-9]|o4)/.test(id) && !id.includes('instruct') && !id.includes('realtime') && !id.includes('audio');
            })
            .map((m) => ({ value: m.id, label: m.id }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return models.length ? models : KNOWN_MODELS['openai'];
    } catch {
        return KNOWN_MODELS['openai'];
    }
}

async function fetchGoogleModels(apiKey) {
    if (!apiKey) return KNOWN_MODELS['google'];
    try {
        const data = await httpGet(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        const models = (data?.models || [])
            .filter((m) => {
                const id = m?.name || '';
                return id.includes('gemini') && m?.supportedGenerationMethods?.includes('generateContent');
            })
            .map((m) => {
                const shortName = (m.name || '').replace('models/', '');
                return { value: shortName, label: m.displayName || shortName };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
        return models.length ? models : KNOWN_MODELS['google'];
    } catch {
        return KNOWN_MODELS['google'];
    }
}

function getAnthropicModels() {
    return KNOWN_MODELS['anthropic'];
}

function getCliModels(provider) {
    const cmd = provider === 'codex-cli' ? 'codex' : 'claude';
    const available = checkCliAvailable(cmd);
    return {
        models: KNOWN_MODELS[provider] || [],
        available
    };
}

// --------------- main service function ---------------

/**
 * Get available models for a provider.
 * @param {string} provider - 'codex-cli' | 'claude-code' | 'api-key'
 * @param {string} subProvider - 'openai' | 'anthropic' | 'google' (only when provider === 'api-key')
 * @param {string} apiKey - API key for api-key providers
 * @returns {Promise<{success: boolean, models: Array, available?: boolean}>}
 */
async function getProviderModels(provider, subProvider, apiKey) {
    if (provider === 'codex-cli' || provider === 'claude-code') {
        const result = getCliModels(provider);
        return { success: true, models: result.models, available: result.available };
    }

    if (provider === 'api-key') {
        switch (subProvider) {
            case 'openai': {
                const models = await fetchOpenAIModels(apiKey);
                return { success: true, models };
            }
            case 'anthropic': {
                const models = getAnthropicModels();
                return { success: true, models };
            }
            case 'google': {
                const models = await fetchGoogleModels(apiKey);
                return { success: true, models };
            }
            default:
                return { success: false, models: [], message: 'Unknown sub-provider' };
        }
    }

    return { success: false, models: [], message: 'Unknown provider' };
}

module.exports = {
    getProviderModels,
    KNOWN_MODELS,
    // exported for testing
    fetchOpenAIModels,
    fetchGoogleModels,
    getAnthropicModels,
    getCliModels
};
