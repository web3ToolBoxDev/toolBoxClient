'use strict';

const https = require('https');
const http = require('http');

/**
 * Lightweight AI API client for OpenAI, Anthropic, and Google.
 * No SDK dependencies — uses raw HTTP requests.
 */

// --------------- helpers ---------------

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
                    const err = new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`);
                    err.statusCode = res.statusCode;
                    err.responseBody = data;
                    reject(err);
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(120000, () => {
            req.destroy(new Error('Request timed out after 120s'));
        });
        if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
        req.end();
    });
}

function buildMessages(conversationHistory, systemPrompt) {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    for (const msg of conversationHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({ role: msg.role, content: msg.text || msg.content || '' });
        }
    }
    return messages;
}

/**
 * Build a multimodal user message with text + optional image.
 * @param {string} text - Text prompt
 * @param {string} [imageDataUri] - data:image/...;base64,... URI
 * @param {string} [imageMimeType] - e.g. 'image/png'
 * @returns {{ openai: object, anthropic: object, google: object }} Provider-specific content
 */
function buildMultimodalContent(text, imageDataUri, imageMimeType) {
    const base64 = imageDataUri ? imageDataUri.replace(/^data:[^;]+;base64,/, '') : '';
    const mime = imageMimeType || 'image/png';
    return {
        openai: base64
            ? [
                { type: 'text', text },
                { type: 'image_url', image_url: { url: imageDataUri } }
            ]
            : text,
        anthropic: base64
            ? [
                { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
                { type: 'text', text }
            ]
            : text,
        google: base64
            ? [
                { text },
                { inline_data: { mime_type: mime, data: base64 } }
            ]
            : [{ text }]
    };
}

// --------------- OpenAI ---------------

async function callOpenAI({ apiKey, model, conversationHistory, systemPrompt, imageContent }) {
    const messages = buildMessages(conversationHistory, systemPrompt);
    // If the last user message needs image content, replace its content with multimodal
    if (imageContent && messages.length) {
        const last = messages[messages.length - 1];
        if (last.role === 'user') {
            last.content = imageContent.openai;
        }
    }
    const body = JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages,
        max_tokens: 4096
    });
    const result = await httpRequest('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }
    }, body);
    const choice = result?.choices?.[0];
    return {
        content: choice?.message?.content || '',
        finishReason: choice?.finish_reason || 'stop',
        usage: result?.usage || null
    };
}

// --------------- Anthropic ---------------

async function callAnthropic({ apiKey, model, conversationHistory, systemPrompt, imageContent }) {
    // Anthropic uses a different message format — system is a top-level field
    const messages = [];
    for (const msg of conversationHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({ role: msg.role, content: msg.text || msg.content || '' });
        }
    }
    // Replace last user message content with multimodal if image provided
    if (imageContent && messages.length) {
        const last = messages[messages.length - 1];
        if (last.role === 'user') {
            last.content = imageContent.anthropic;
        }
    }
    const body = {
        model: model || 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages
    };
    if (systemPrompt) {
        body.system = systemPrompt;
    }
    const result = await httpRequest('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        }
    }, JSON.stringify(body));
    const textBlock = (result?.content || []).find((b) => b.type === 'text');
    return {
        content: textBlock?.text || '',
        finishReason: result?.stop_reason || 'end_turn',
        usage: result?.usage || null
    };
}

// --------------- Google Gemini ---------------

async function callGoogle({ apiKey, model, conversationHistory, systemPrompt, imageContent }) {
    const geminiModel = model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

    // Gemini uses { role: 'user'|'model', parts: [{ text }] }
    const contents = [];
    for (const msg of conversationHistory) {
        if (msg.role === 'user') {
            contents.push({ role: 'user', parts: [{ text: msg.text || msg.content || '' }] });
        } else if (msg.role === 'assistant') {
            contents.push({ role: 'model', parts: [{ text: msg.text || msg.content || '' }] });
        }
    }
    // Replace last user message parts with multimodal if image provided
    if (imageContent && contents.length) {
        const last = contents[contents.length - 1];
        if (last.role === 'user') {
            last.parts = imageContent.google;
        }
    }
    const body = { contents };
    if (systemPrompt) {
        body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    const result = await httpRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(body));
    const candidate = result?.candidates?.[0];
    const text = (candidate?.content?.parts || []).map((p) => p.text || '').join('');
    return {
        content: text,
        finishReason: candidate?.finishReason || 'STOP',
        usage: result?.usageMetadata || null
    };
}

// --------------- unified entry ---------------

/**
 * Call AI API based on sub-provider.
 * @param {Object} opts
 * @param {string} opts.subProvider - 'openai' | 'anthropic' | 'google'
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {Array}  opts.conversationHistory - [{ role: 'user'|'assistant', text: string }]
 * @param {string} [opts.systemPrompt]
 * @returns {Promise<{ content: string, finishReason: string, usage: object|null }>}
 */
async function callAPI({ subProvider, apiKey, model, conversationHistory, systemPrompt, imageContent }) {
    switch (subProvider) {
        case 'openai':
            return callOpenAI({ apiKey, model, conversationHistory, systemPrompt, imageContent });
        case 'anthropic':
            return callAnthropic({ apiKey, model, conversationHistory, systemPrompt, imageContent });
        case 'google':
            return callGoogle({ apiKey, model, conversationHistory, systemPrompt, imageContent });
        default:
            throw new Error(`Unsupported sub-provider: ${subProvider}`);
    }
}

module.exports = {
    callAPI,
    callOpenAI,
    callAnthropic,
    callGoogle,
    buildMessages,
    buildMultimodalContent,
    httpRequest
};
