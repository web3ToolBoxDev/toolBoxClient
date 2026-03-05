'use strict';

const http = require('http');
const https = require('https');

/**
 * Bridge LLM for mem0 - forwards LLM calls to an external endpoint.
 * When the dbservice starts, the caller passes the AI provider config.
 * This LLM adapter calls the provider's API to extract/deduplicate memories.
 */

function httpRequest(url, options, body) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const transport = parsed.protocol === 'https:' ? https : http;
        const req = transport.request(parsed, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } catch { resolve(data); }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(60000, () => req.destroy(new Error('LLM request timed out')));
        if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
        req.end();
    });
}

class BridgeLLM {
    constructor(config = {}) {
        // Default to OpenAI-compatible endpoint
        this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
        this.model = config.model || 'gpt-4.1-nano-2025-04-14';
        this.baseURL = config.baseURL || 'https://api.openai.com/v1';
        this.provider = config.provider || 'openai'; // openai | anthropic | google
    }

    async generateResponse(messages, options = {}) {
        const prompt = Array.isArray(messages)
            ? messages.map((m) => `${m.role || 'user'}: ${m.content || ''}`).join('\n')
            : String(messages);

        if (!this.apiKey) {
            return this._fallbackExtract(prompt);
        }

        try {
            if (this.provider === 'openai') {
                return await this._callOpenAI(messages, options);
            } else if (this.provider === 'anthropic') {
                return await this._callAnthropic(prompt, options);
            } else if (this.provider === 'google') {
                return await this._callGoogle(prompt, options);
            }
            return await this._callOpenAI(messages, options);
        } catch (err) {
            console.error('[BridgeLLM] API call failed, using fallback:', err.message);
            return this._fallbackExtract(prompt);
        }
    }

    async _callOpenAI(messages, options = {}) {
        const body = {
            model: this.model,
            messages: Array.isArray(messages) ? messages : [{ role: 'user', content: String(messages) }],
            temperature: options.temperature || 0,
            max_tokens: options.max_tokens || 1000
        };

        if (options.response_format) {
            body.response_format = options.response_format;
        }

        const result = await httpRequest(`${this.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            }
        }, JSON.stringify(body));

        return result?.choices?.[0]?.message?.content || '';
    }

    async _callAnthropic(prompt, options = {}) {
        const result = await httpRequest('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            }
        }, JSON.stringify({
            model: this.model,
            max_tokens: options.max_tokens || 1000,
            messages: [{ role: 'user', content: prompt }]
        }));

        const block = (result?.content || []).find((b) => b.type === 'text');
        return block?.text || '';
    }

    async _callGoogle(prompt, options = {}) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        const result = await httpRequest(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        }));

        const candidate = result?.candidates?.[0];
        return (candidate?.content?.parts || []).map((p) => p.text || '').join('');
    }

    /**
     * Fallback when no API key is available.
     * Handles two mem0 LLM call patterns:
     * 1) Fact extraction → returns {"facts": [user_text]}
     * 2) Memory update → returns {"memory": [{...action}]} with ADD events
     */
    _fallbackExtract(prompt) {
        // Detect memory-update prompt (second LLM call from mem0)
        if (prompt.includes('smart memory manager')) {
            // Parse the new retrieved facts (JSON array in the prompt)
            const factsMatch = prompt.match(/new retrieved facts[\s\S]*?\n\s*\[([^\]]*)\]/i);
            let facts = [];
            if (factsMatch) {
                try {
                    facts = JSON.parse(`[${factsMatch[1]}]`);
                } catch { /* ignore parse errors */ }
            }

            // Parse existing old memory
            const oldMemMatch = prompt.match(/content of my memory[\s\S]*?\n\s*\[([^\]]*)\]/i);
            let oldMemory = [];
            if (oldMemMatch) {
                try {
                    oldMemory = JSON.parse(`[${oldMemMatch[1]}]`);
                } catch { /* ignore */ }
            }

            // Build response: keep old memories as NONE, add new facts as ADD
            const memory = [];
            for (const item of oldMemory) {
                memory.push({ id: item.id, text: item.text, event: 'NONE' });
            }
            let nextId = oldMemory.length;
            for (const fact of facts) {
                memory.push({ id: String(nextId++), text: fact, event: 'ADD' });
            }
            return JSON.stringify({ memory });
        }

        // Fact extraction prompt - extract the user input text
        const inputMatch = prompt.match(/Input:\s*\n([\s\S]+)$/);
        const userText = inputMatch ? inputMatch[1].trim() : '';
        if (userText) {
            // Split on real sentence boundaries, preserving mid-word dots (Vue.js, B.S., etc.)
            // Period splits only after 2+ word chars (not after single-letter abbreviations)
            // Also splits on !/? and CJK punctuation, and newlines
            const sentences = userText
                .split(/(?<=\w{2,})[.]\s+|[!?。！？]\s*|\n+/)
                .map(s => s.trim())
                .filter(s => s.length >= 5);
            return JSON.stringify({ facts: sentences.length > 0 ? sentences : [userText] });
        }
        return JSON.stringify({ facts: [prompt.slice(0, 500)] });
    }
}

module.exports = { BridgeLLM };
