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

// --------------- tool calling ---------------

/**
 * Convert tool definitions to provider-specific format.
 * @param {Array<{name, description, parameters}>} tools
 * @param {string} provider - 'openai' | 'anthropic' | 'google'
 * @returns {Array|object}
 */
function formatToolsForProvider(tools, provider) {
    switch (provider) {
        case 'openai':
            return tools.map(t => ({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description || '',
                    parameters: t.parameters || { type: 'object', properties: {} }
                }
            }));
        case 'anthropic':
            return tools.map(t => ({
                name: t.name,
                description: t.description || '',
                input_schema: t.parameters || { type: 'object', properties: {} }
            }));
        case 'google':
            return [{
                function_declarations: tools.map(t => ({
                    name: t.name,
                    description: t.description || '',
                    parameters: t.parameters || { type: 'object', properties: {} }
                }))
            }];
        default:
            return [];
    }
}

/**
 * Extract tool calls from provider response.
 * @param {object} response - Raw API response
 * @param {string} provider
 * @returns {{ textContent: string, toolCalls: Array<{id: string, name: string, args: object}>, stopReason: string }}
 */
function extractToolCalls(response, provider) {
    let textContent = '';
    const toolCalls = [];
    let stopReason = '';

    switch (provider) {
        case 'openai': {
            const choice = response?.choices?.[0];
            const msg = choice?.message;
            textContent = msg?.content || '';
            stopReason = choice?.finish_reason || 'stop';
            if (msg?.tool_calls) {
                for (const tc of msg.tool_calls) {
                    toolCalls.push({
                        id: tc.id,
                        name: tc.function?.name,
                        args: safeParseJSON(tc.function?.arguments)
                    });
                }
            }
            break;
        }
        case 'anthropic': {
            stopReason = response?.stop_reason || 'end_turn';
            for (const block of (response?.content || [])) {
                if (block.type === 'text') {
                    textContent += block.text;
                } else if (block.type === 'tool_use') {
                    toolCalls.push({
                        id: block.id,
                        name: block.name,
                        args: block.input || {}
                    });
                }
            }
            break;
        }
        case 'google': {
            const candidate = response?.candidates?.[0];
            stopReason = candidate?.finishReason || 'STOP';
            for (const part of (candidate?.content?.parts || [])) {
                if (part.text) {
                    textContent += part.text;
                } else if (part.functionCall) {
                    toolCalls.push({
                        id: `google_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
                        name: part.functionCall.name,
                        args: part.functionCall.args || {}
                    });
                }
            }
            break;
        }
    }

    return { textContent, toolCalls, stopReason };
}

/**
 * Build tool result message for feeding back to the API.
 * @param {Array<{id, name, result}>} results
 * @param {string} provider
 * @returns {object|Array} Message(s) to append to conversation
 */
function buildToolResultMessages(results, provider) {
    switch (provider) {
        case 'openai':
            return results.map(r => ({
                role: 'tool',
                tool_call_id: r.id,
                content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
            }));
        case 'anthropic':
            return [{
                role: 'user',
                content: results.map(r => ({
                    type: 'tool_result',
                    tool_use_id: r.id,
                    content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
                }))
            }];
        case 'google':
            return [{
                role: 'function',
                parts: results.map(r => ({
                    functionResponse: {
                        name: r.name,
                        response: typeof r.result === 'object' ? r.result : { result: r.result }
                    }
                }))
            }];
        default:
            return [];
    }
}

function safeParseJSON(str) {
    if (!str) return {};
    if (typeof str === 'object') return str;
    try { return JSON.parse(str); } catch { return {}; }
}

/**
 * Call AI API with tool calling support. Handles the multi-turn tool call loop.
 *
 * @param {Object} opts
 * @param {string} opts.subProvider - 'openai' | 'anthropic' | 'google'
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {Array}  opts.conversationHistory - [{ role, text/content }]
 * @param {string} [opts.systemPrompt]
 * @param {Array<{name, description, parameters}>} opts.tools - Tool definitions
 * @param {Function} opts.executeToolFn - async (name, args) => result
 * @param {number} [opts.maxRounds=10] - Max tool call rounds
 * @param {Function} [opts.onToolCall] - Optional callback: (name, args) => void
 * @param {Function} [opts.onToolResult] - Optional callback: (name, result) => void
 * @returns {Promise<{ content: string, toolCallLog: Array, usage: object|null }>}
 */
async function callAPIWithTools({
    subProvider, apiKey, model, conversationHistory, systemPrompt,
    tools, executeToolFn, maxRounds = 10, onToolCall, onToolResult
}) {
    const formattedTools = formatToolsForProvider(tools, subProvider);
    const toolCallLog = [];

    // Build initial messages
    let messages;
    let anthropicSystem;
    let googleContents;

    switch (subProvider) {
        case 'openai':
            messages = buildMessages(conversationHistory, systemPrompt);
            break;
        case 'anthropic':
            messages = [];
            anthropicSystem = systemPrompt;
            for (const msg of conversationHistory) {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    messages.push({ role: msg.role, content: msg.text || msg.content || '' });
                }
            }
            break;
        case 'google':
            googleContents = [];
            for (const msg of conversationHistory) {
                if (msg.role === 'user') {
                    googleContents.push({ role: 'user', parts: [{ text: msg.text || msg.content || '' }] });
                } else if (msg.role === 'assistant') {
                    googleContents.push({ role: 'model', parts: [{ text: msg.text || msg.content || '' }] });
                }
            }
            break;
    }

    let finalContent = '';
    let totalUsage = null;

    for (let round = 0; round < maxRounds; round++) {
        let response;

        switch (subProvider) {
            case 'openai': {
                const body = {
                    model: model || 'gpt-4o-mini',
                    messages,
                    tools: formattedTools,
                    max_tokens: 4096
                };
                response = await httpRequest('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    }
                }, JSON.stringify(body));
                break;
            }
            case 'anthropic': {
                const body = {
                    model: model || 'claude-sonnet-4-6',
                    max_tokens: 4096,
                    messages,
                    tools: formattedTools
                };
                if (anthropicSystem) body.system = anthropicSystem;
                response = await httpRequest('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    }
                }, JSON.stringify(body));
                break;
            }
            case 'google': {
                const geminiModel = model || 'gemini-2.5-flash';
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
                const body = {
                    contents: googleContents,
                    tools: formattedTools
                };
                if (systemPrompt) {
                    body.systemInstruction = { parts: [{ text: systemPrompt }] };
                }
                response = await httpRequest(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }, JSON.stringify(body));
                break;
            }
        }

        const { textContent, toolCalls, stopReason } = extractToolCalls(response, subProvider);
        totalUsage = response?.usage || response?.usageMetadata || totalUsage;

        // Accumulate text content
        if (textContent) finalContent += (finalContent ? '\n' : '') + textContent;

        // No tool calls → done
        if (toolCalls.length === 0) break;

        // Execute tool calls
        const results = [];
        for (const tc of toolCalls) {
            if (onToolCall) onToolCall(tc.name, tc.args);

            let result;
            try {
                result = await executeToolFn(tc.name, tc.args);
            } catch (err) {
                result = { error: err.message };
            }

            if (onToolResult) onToolResult(tc.name, result);
            toolCallLog.push({ name: tc.name, args: tc.args, result });
            results.push({ id: tc.id, name: tc.name, result });
        }

        // Feed results back into conversation
        const resultMessages = buildToolResultMessages(results, subProvider);

        switch (subProvider) {
            case 'openai':
                // Add the assistant message with tool calls
                messages.push(response.choices[0].message);
                // Add each tool result message
                messages.push(...resultMessages);
                break;
            case 'anthropic':
                // Add assistant response (contains tool_use blocks)
                messages.push({ role: 'assistant', content: response.content });
                // Add tool results as user message
                messages.push(...resultMessages);
                break;
            case 'google':
                // Add model response
                googleContents.push(response.candidates[0].content);
                // Add function response
                googleContents.push(...resultMessages);
                break;
        }

        // If stop reason indicates no more tool calls, break
        if (subProvider === 'openai' && stopReason !== 'tool_calls') break;
        if (subProvider === 'anthropic' && stopReason !== 'tool_use') break;
        if (subProvider === 'google' && stopReason !== 'STOP') break;
    }

    return { content: finalContent, toolCallLog, usage: totalUsage };
}

module.exports = {
    callAPI,
    callAPIWithTools,
    callOpenAI,
    callAnthropic,
    callGoogle,
    buildMessages,
    buildMultimodalContent,
    formatToolsForProvider,
    extractToolCalls,
    buildToolResultMessages,
    httpRequest
};
