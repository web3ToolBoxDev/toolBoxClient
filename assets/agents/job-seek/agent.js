const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const {
    getPresetQuestionTemplates,
    defaultSubTasks,
    buildPresetPrompt,
    buildAttachmentActionQuestion
} = require('./lib/prompts');
const { callAPI } = require('./lib/aiClient');
const memoryClient = require('./lib/memoryClient');

// Ensure workspace dir has git init (required by Codex CLI)
const _workspaceDir = path.join(__dirname, 'workspace');
if (!fs.existsSync(path.join(_workspaceDir, '.git'))) {
    fs.mkdirSync(_workspaceDir, { recursive: true });
    try { execSync('git init', { cwd: _workspaceDir, stdio: 'ignore' }); } catch {}
}

const url = process.argv[2];
let ws = null;
let taskData = null;
let terminated = false;
let heartBeatTimer = null;
let reconnectTimer = null;
let runtimeContextAnnounced = false;

const now = () => Date.now();
const genId = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
// Use agent-level namespace so memories persist across all sessions
const getMemoryNamespace = () => 'job-seek';

// --------------- language helpers ---------------

const getLanguage = () => {
    if (state.language) {
        return String(state.language || 'en').toLowerCase();
    }
    const lang =
        taskData?.taskDataFromFront?.language ||
        taskData?.runtimeContext?.language ||
        taskData?.language ||
        'en';
    return String(lang || 'en').toLowerCase();
};

const isZh = () => getLanguage().startsWith('zh');

// --------------- prompt helpers (delegate to lib/prompts) ---------------

const _getTemplates = () => getPresetQuestionTemplates(isZh());

const _buildPresetPrompt = (selectedMap = {}) =>
    buildPresetPrompt(isZh(), selectedMap, _getTemplates());

const appendAttachmentQuestionToPrompt = (sessionId, kinds = []) => {
    const base = state.prompts[sessionId] || _buildPresetPrompt(state.selectedAnswers[sessionId] || {});
    const questions = Array.isArray(base.questions) ? base.questions.filter((q) => q.id !== 'q_attachment_action') : [];
    const attachmentQuestion = buildAttachmentActionQuestion(isZh(), kinds);
    if (attachmentQuestion) {
        questions.push({
            ...attachmentQuestion,
            selectedOptionId: (state.selectedAnswers[sessionId] || {})[attachmentQuestion.id] || ''
        });
    }
    state.prompts[sessionId] = {
        text: base.text || (isZh() ? '\u8BF7\u9009\u62E9\u9884\u8BBE\u95EE\u9898\u5E76\u56DE\u7B54' : 'Select preset questions and answer'),
        attachmentPolicy: base.attachmentPolicy || { maxSizeMB: 4, allowedKinds: ['image', 'pdf', 'sheet', 'text'] },
        questions
    };
};

// --------------- state ---------------

const state = {
    taskName: 'jobSeekAgent',
    language: 'en',
    currentModel: 'default',
    currentProvider: '',
    currentSubProvider: '',
    runtimeApiKey: '',
    apiKeyConfiguredHint: null,
    activeSessionId: '',
    sessions: [],
    conversations: {},
    subtasks: {},
    artifacts: {},
    runtimeLogs: {},
    prompts: {},
    stages: {},
    selectedAnswers: {},
    runtimeContexts: {},
    executionStates: {},
    attachmentKinds: {}
};

// --------------- transport ---------------

function updateApiKeyConfiguredHint(value) {
    if (typeof value !== 'boolean') return;
    state.apiKeyConfiguredHint = value;
}

function send(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
}

function emit(type, data = {}, requestId = undefined) {
    send({
        type,
        version: '1.0',
        taskName: state.taskName,
        timestamp: now(),
        ...(requestId ? { requestId } : {}),
        data
    });
}

function sendSnapshot() {
    emit('agent_state_snapshot', {
        activeSessionId: state.activeSessionId,
        sessions: state.sessions,
        conversations: state.conversations,
        subtasks: state.subtasks,
        artifacts: state.artifacts,
        runtimeLogs: state.runtimeLogs,
        prompts: state.prompts,
        runtimeContexts: state.runtimeContexts,
        executionStates: state.executionStates
    });
}

// --------------- session management ---------------

function upsertSession(session) {
    const idx = state.sessions.findIndex((item) => item.id === session.id);
    if (idx === -1) {
        state.sessions.push(session);
    } else {
        state.sessions[idx] = session;
    }
}

function createSession(name = '') {
    const selectedMap = {};
    const session = {
        id: genId('session'),
        name: String(name || '').trim() || (isZh() ? `\u6C42\u804C\u65B9\u5411 ${state.sessions.length + 1}` : `Job Track ${state.sessions.length + 1}`),
        updatedAt: now()
    };
    upsertSession(session);
    state.activeSessionId = session.id;
    state.conversations[session.id] = [];
    state.subtasks[session.id] = defaultSubTasks(now());
    state.artifacts[session.id] = [];
    state.runtimeLogs[session.id] = [];
    state.prompts[session.id] = _buildPresetPrompt(selectedMap);
    state.stages[session.id] = 0;
    state.selectedAnswers[session.id] = selectedMap;
    state.runtimeContexts[session.id] = {
        ...getRuntimeContext(),
        model: state.currentModel
    };
    state.executionStates[session.id] = { paused: false, canceled: false };
    state.attachmentKinds[session.id] = [];
    appendConversation(session.id, 'assistant', isZh() ? 'AI\u4EFB\u52A1\u5DF2\u542F\u52A8\uFF0C\u8BF7\u4ECE\u63A8\u8350\u9009\u9879\u5F00\u59CB\u3002' : 'AI task started. Please begin with a suggested option.');
    appendConversation(
        session.id,
        'assistant',
        isZh() ? '\u53EF\u5148\u4E0A\u4F20\u7B80\u5386\u539F\u59CB\u6587\u4EF6\uFF08\u53EF\u9009\uFF09' : 'You can upload original resume file first (optional)',
        {
            questionType: 'upload',
            questionId: 'inline_upload_resume',
            questionText: isZh() ? '\u4E0A\u4F20\u7B80\u5386\u539F\u59CB\u6587\u4EF6' : 'Upload original resume file',
            buttonLabel: isZh() ? '\u4E0A\u4F20\u7B80\u5386\u6587\u4EF6' : 'Upload Resume File',
            allowMultiple: false,
            acceptKinds: ['pdf', 'image', 'text'],
            maxSizeMB: 6
        }
    );
    appendRuntimeLog(session.id, 'Session created', { source: 'system' });
    emitSessionList();
    sendSnapshot();
}

function deleteSession(sessionId) {
    const id = String(sessionId || '').trim();
    if (!id) return;
    state.sessions = state.sessions.filter((item) => item.id !== id);
    delete state.conversations[id];
    delete state.subtasks[id];
    delete state.artifacts[id];
    delete state.runtimeLogs[id];
    delete state.prompts[id];
    delete state.stages[id];
    delete state.selectedAnswers[id];
    delete state.runtimeContexts[id];
    delete state.executionStates[id];
    delete state.attachmentKinds[id];
    if (!state.sessions.length) {
        createSession('');
        return;
    }
    if (state.activeSessionId === id) {
        state.activeSessionId = state.sessions[0].id;
    }
    emitSessionList();
    sendSnapshot();
}

function switchSession(sessionId) {
    const id = String(sessionId || '').trim();
    const exists = state.sessions.some((item) => item.id === id);
    if (!exists) return;
    state.activeSessionId = id;
    emitSessionList();
    sendSnapshot();
}

function emitSessionList() {
    emit('agent_session_list', {
        activeSessionId: state.activeSessionId,
        sessions: state.sessions
    });
}

// --------------- conversation & logging ---------------

function appendConversation(sessionId, role, content, extra = {}) {
    if (!state.conversations[sessionId]) {
        state.conversations[sessionId] = [];
    }
    const message = {
        id: genId('msg'),
        role,
        content,
        createdAt: now(),
        ...(extra && typeof extra === 'object' ? extra : {})
    };
    state.conversations[sessionId].push(message);
    const target = state.sessions.find((item) => item.id === sessionId);
    if (target) {
        target.updatedAt = now();
        upsertSession(target);
    }
    emit('agent_conversation_update', {
        sessionId,
        append: [message],
        prompt: state.prompts[sessionId] || null
    });
}

function inferAttachmentKind(item = {}) {
    const mime = String(item?.mimeType || '').toLowerCase();
    const name = String(item?.name || '').toLowerCase();
    if (mime.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif|bmp)$/.test(name)) return 'image';
    if (mime.includes('pdf') || /\.pdf$/.test(name)) return 'pdf';
    if (mime.includes('spreadsheet') || /\.(xlsx|xls|csv)$/.test(name)) return 'sheet';
    if (mime.startsWith('text/') || /\.(txt|md|json)$/.test(name)) return 'text';
    return 'file';
}

function appendRuntimeLog(sessionId, text, extra = {}) {
    if (!sessionId || !text) return;
    if (!Array.isArray(state.runtimeLogs[sessionId])) {
        state.runtimeLogs[sessionId] = [];
    }
    const log = {
        id: genId('log'),
        time: now(),
        text,
        level: String(extra?.level || 'info').toLowerCase(),
        source: String(extra?.source || 'runtime').toLowerCase(),
        ...(extra && typeof extra === 'object' ? extra : {})
    };
    state.runtimeLogs[sessionId].push(log);
    emit('agent_runtime_log_update', {
        sessionId,
        append: [log]
    });
}

// --------------- sub-task progression ---------------

function updateSubTasks(sessionId, updater) {
    const source = state.subtasks[sessionId] || defaultSubTasks(now());
    const next = updater(source.map((item) => ({ ...item })));
    const prevStatusMap = source.reduce((acc, item) => {
        acc[item.key] = item.status;
        return acc;
    }, {});
    state.subtasks[sessionId] = next;
    emit('agent_subtask_update', { sessionId, items: next });
    next.forEach((item) => {
        if (prevStatusMap[item.key] !== item.status) {
            appendRuntimeLog(
                sessionId,
                `${item.key} -> ${item.status}`,
                { key: item.key, status: item.status, updatedAt: item.updatedAt || now(), source: 'subtask' }
            );
        }
    });
}

function moveSubTaskForward(sessionId) {
    updateSubTasks(sessionId, (items) => {
        const idx = items.findIndex((item) => item.status === 'running');
        if (idx >= 0) {
            items[idx].status = 'done';
            items[idx].updatedAt = now();
            if (items[idx + 1] && items[idx + 1].status === 'pending') {
                items[idx + 1].status = 'running';
                items[idx + 1].updatedAt = now();
            }
        }
        return items;
    });
}

// --------------- execution control ---------------

function getExecutionState(sessionId) {
    return state.executionStates[sessionId] || { paused: false, canceled: false };
}

function setExecutionState(sessionId, patch = {}) {
    const prev = getExecutionState(sessionId);
    state.executionStates[sessionId] = { ...prev, ...patch };
    emit('agent_execution_update', { sessionId, state: state.executionStates[sessionId] });
    appendRuntimeLog(
        sessionId,
        `execution -> paused:${Boolean(state.executionStates[sessionId].paused)}, canceled:${Boolean(state.executionStates[sessionId].canceled)}`,
        { state: state.executionStates[sessionId], source: 'execution' }
    );
}

// --------------- artifacts ---------------

function ensureDirSync(targetDir) {
    try {
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        return true;
    } catch (_) {
        return false;
    }
}

function buildArtifactFile(sessionId, type = 'artifact', title = 'artifact') {
    const saveRoot = taskData?.savePath || taskData?.runtimeContext?.savePath || '';
    if (!saveRoot) {
        return { filePath: '', relativePath: '' };
    }
    const safeSession = String(sessionId || 'default').replace(/[^\w.-]/g, '_');
    const artifactDir = path.join(saveRoot, 'ai_artifacts', safeSession);
    if (!ensureDirSync(artifactDir)) {
        return { filePath: '', relativePath: '' };
    }
    const ext = type === 'resume' || type === 'cover_letter' ? '.md' : '.txt';
    const safeTitle = String(title || type).replace(/[^\w.-]/g, '_').slice(0, 48);
    const fileName = `${safeTitle || type}_${Date.now()}${ext}`;
    const filePath = path.join(artifactDir, fileName);
    const content = `# ${title}\n\nGenerated by Job Seek AI Agent.\nSession: ${sessionId}\nType: ${type}\nTime: ${new Date().toISOString()}\n`;
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        const relativePath = path.relative(saveRoot, filePath);
        return { filePath, relativePath };
    } catch (_) {
        return { filePath: '', relativePath: '' };
    }
}

function appendArtifact(sessionId, artifact) {
    if (!state.artifacts[sessionId]) {
        state.artifacts[sessionId] = [];
    }
    state.artifacts[sessionId].push(artifact);
    emit('agent_artifact_update', { sessionId, append: [artifact] });
    appendRuntimeLog(sessionId, `artifact -> ${artifact?.title || artifact?.type || 'artifact'}`, { source: 'artifact' });
}

// --------------- provider detection & CLI ---------------

function checkCliAvailable(cmd) {
    try {
        const check = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
        execSync(check, { stdio: 'ignore', timeout: 5000 });
        return true;
    } catch (_) {
        return false;
    }
}

const _cliCache = {};
function isCliAvailable(name) {
    if (_cliCache[name] !== undefined) return _cliCache[name];
    _cliCache[name] = checkCliAvailable(name);
    return _cliCache[name];
}

function getConfiguredProvider() {
    if (state.currentProvider) {
        return String(state.currentProvider).trim().toLowerCase();
    }
    const cfg = taskData?.taskConfig || {};
    return String(
        cfg?.default?.provider ||
        cfg?.provider ||
        taskData?.taskDataFromFront?.provider ||
        'auto'
    ).trim().toLowerCase();
}

function getRawApiKey() {
    if (state.runtimeApiKey) return state.runtimeApiKey;
    const cfg = taskData?.taskConfig || {};
    return String(
        cfg?.default?.apiKey ||
        cfg?.default?.openaiApiKey ||
        cfg?.apiKey ||
        taskData?.taskDataFromFront?.apiKey ||
        taskData?.taskDataFromFront?.openaiApiKey ||
        ''
    ).trim();
}

/**
 * Resolve the active provider. Priority: codex-cli > claude-code > api-key
 * Returns { provider: 'codex-cli'|'claude-code'|'api-key'|null, reason: string }
 */
function resolveProvider() {
    const configured = getConfiguredProvider();

    if (configured === 'codex-cli') {
        if (isCliAvailable('codex')) return { provider: 'codex-cli', reason: 'user selected' };
        return { provider: null, reason: isZh() ? 'Codex CLI 未安装或不在 PATH 中' : 'Codex CLI not found in PATH' };
    }
    if (configured === 'claude-code') {
        if (isCliAvailable('claude')) return { provider: 'claude-code', reason: 'user selected' };
        return { provider: null, reason: isZh() ? 'Claude Code 未安装或不在 PATH 中' : 'Claude Code not found in PATH' };
    }
    if (configured === 'api-key') {
        if (getRawApiKey()) return { provider: 'api-key', reason: 'user selected' };
        return { provider: null, reason: isZh() ? '未配置 API Key' : 'API Key not configured' };
    }

    // auto: codex-cli > claude-code > api-key
    if (isCliAvailable('codex')) return { provider: 'codex-cli', reason: 'auto-detected' };
    if (isCliAvailable('claude')) return { provider: 'claude-code', reason: 'auto-detected' };
    if (getRawApiKey()) return { provider: 'api-key', reason: 'auto-detected' };
    return { provider: null, reason: isZh() ? '未检测到可用的 AI 后端（CLI 或 API Key）' : 'No AI backend detected (CLI or API Key)' };
}

/**
 * Invoke CLI (codex or claude) with a prompt. Returns Promise<string>.
 */
function invokeCliAsync(provider, prompt, memoryContext = '', model = 'default') {
    return new Promise((resolve, reject) => {
        const escaped = prompt.replace(/"/g, '\\"');
        let fullCmd;
        // Both CLIs: prepend memory as context directly in the prompt
        const memPrefix = memoryContext
            ? `[What you remember about this user from previous conversations]\\n- ${memoryContext}\\n\\n[User message]\\n`
            : '';
        const modelFlag = (model && model !== 'default') ? ` --model ${model}` : '';
        if (provider === 'codex-cli') {
            fullCmd = `codex exec${modelFlag} "${memPrefix}${escaped}"`;
        } else {
            fullCmd = `claude -p "${memPrefix}${escaped}"${modelFlag}`;
        }
        console.log(`[agent:cli] CMD (${provider}): ${fullCmd.slice(0, 200)}...`);
        let stdout = '';
        let stderr = '';
        // Spawn in job-seek workspace dir with CLAUDE.md/AGENTS.md that define
        // the assistant role. This is a git repo so Codex is happy, and the
        // CLI reads the workspace CLAUDE.md (job-seek assistant, not coding tool).
        const workspaceDir = path.join(__dirname, 'workspace');
        const cleanEnv = { ...process.env };
        delete cleanEnv.CLAUDECODE; // Allow nested Claude Code invocation
        const child = spawn(fullCmd, [], {
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 120000,
            shell: true,
            cwd: workspaceDir,
            env: cleanEnv
        });
        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout.trim());
            } else {
                const cliName = provider === 'codex-cli' ? 'codex' : 'claude';
                reject(new Error(`${cliName} exited with code ${code}: ${stderr.trim()}`));
            }
        });
        child.on('error', (err) => {
            const cliName = provider === 'codex-cli' ? 'codex' : 'claude';
            reject(new Error(`${cliName} spawn failed: ${err.message}`));
        });
    });
}

// --------------- runtime context & model ---------------

function hasBackend() {
    const { provider } = resolveProvider();
    return provider !== null;
}

function hasApiKey() {
    return hasBackend();
}

function getRuntimeContext() {
    const base = taskData?.taskDataFromFront?.runtimeContext || taskData?.runtimeContext || {};
    return {
        ...base,
        model: base?.model || state.currentModel
    };
}

function updateModel(nextModel) {
    const model = String(nextModel || '').trim();
    if (!model) return;
    state.currentModel = model;
}

function updateLanguage(nextLang) {
    const clean = String(nextLang || '').trim();
    if (clean) {
        const prev = String(state.language || '').toLowerCase();
        const next = clean.toLowerCase();
        state.language = clean;
        if (prev !== next) {
            Object.keys(state.prompts || {}).forEach((sessionId) => {
                const selectedMap = state.selectedAnswers[sessionId] || {};
                state.prompts[sessionId] = _buildPresetPrompt(selectedMap);
                const kinds = Array.isArray(state.attachmentKinds[sessionId]) ? state.attachmentKinds[sessionId] : [];
                if (kinds.length) {
                    appendAttachmentQuestionToPrompt(sessionId, kinds);
                }
            });
        }
    }
}

function announceRuntimeContext() {
    if (runtimeContextAnnounced || !state.activeSessionId) return;
    const context = getRuntimeContext();
    const mode = String(context?.mode || taskData?.taskDataFromFront?.mode || 'unknown');
    const envCount = Array.isArray(context?.envIds) ? context.envIds.length : 0;
    const walletCount = Array.isArray(context?.walletIds) ? context.walletIds.length : 0;
    const model = String(context?.model || state.currentModel || 'default');
    const walletPath = context?.walletExtensionPath ? `, metamaskPath=${context.walletExtensionPath}` : '';
    const { provider, reason } = resolveProvider();
    const providerInfo = provider ? `${provider} (${reason})` : `none (${reason})`;
    appendConversation(
        state.activeSessionId,
        'assistant',
        isZh()
            ? `\u8FD0\u884C\u4E0A\u4E0B\u6587\u5DF2\u52A0\u8F7D\uFF1Aprovider=${providerInfo}, mode=${mode}, env=${envCount}, wallet=${walletCount}, model=${model}${walletPath}`
            : `Runtime context loaded: provider=${providerInfo}, mode=${mode}, env=${envCount}, wallet=${walletCount}, model=${model}${walletPath}`
    );
    appendRuntimeLog(
        state.activeSessionId,
        `runtime_context_loaded -> provider=${providerInfo}, mode=${mode}, env=${envCount}, wallet=${walletCount}, model=${model}`,
        { source: 'context' }
    );
    if (!provider) {
        appendConversation(
            state.activeSessionId,
            'assistant',
            isZh()
                ? `\u26A0\uFE0F ${reason}\u3002\u8BF7\u5728\u4EFB\u52A1\u914D\u7F6E\u4E2D\u8BBE\u7F6E AI Provider\uFF0C\u6216\u5B89\u88C5 Codex CLI / Claude Code\u3002`
                : `\u26A0\uFE0F ${reason}. Please configure AI Provider in task settings, or install Codex CLI / Claude Code.`
        );
    }
    runtimeContextAnnounced = true;
}

// --------------- message handlers ---------------

/**
 * Build conversation history for AI context (only user/assistant messages, no system messages).
 */
function getConversationForAI(sessionId) {
    const msgs = state.conversations[sessionId] || [];
    return msgs
        .filter((m) => m.role === 'user' || (m.role === 'assistant' && !m._system))
        .map((m) => ({ role: m.role, text: m.content || '' }));
}

async function handleUserInput(payload = {}) {
    const sessionId = payload.sessionId || state.activeSessionId;
    if (!sessionId || !state.conversations[sessionId]) {
        emit('agent_error', { code: 4001, message: 'session not found' }, payload.requestId);
        return;
    }
    if (!hasBackend()) {
        const { reason } = resolveProvider();
        appendConversation(sessionId, 'assistant', isZh() ? `\u672A\u68C0\u6D4B\u5230\u53EF\u7528\u7684 AI \u540E\u7AEF\uFF1A${reason}\u3002\u8BF7\u5B89\u88C5 Codex CLI / Claude Code\uFF0C\u6216\u586B\u5199 API Key\u3002` : `No AI backend available: ${reason}. Please install Codex CLI / Claude Code, or configure an API Key.`);
        return;
    }
    const execution = getExecutionState(sessionId);
    if (execution.canceled) {
        appendConversation(sessionId, 'assistant', isZh() ? '\u5F53\u524D\u4F1A\u8BDD\u5DF2\u53D6\u6D88\uFF0C\u8BF7\u5148\u70B9\u51FB\u91CD\u8BD5\u540E\u7EE7\u7EED\u3002' : 'Current session is canceled. Please retry before continuing.');
        return;
    }
    if (execution.paused) {
        appendConversation(sessionId, 'assistant', isZh() ? '\u5F53\u524D\u4F1A\u8BDD\u5DF2\u6682\u505C\uFF0C\u8BF7\u5148\u6062\u590D\u540E\u7EE7\u7EED\u3002' : 'Current session is paused. Please resume before continuing.');
        return;
    }
    const text = String(payload.text || '').trim();
    const runtimeContext = payload.runtimeContext || state.runtimeContexts[sessionId] || {};
    const model = String(payload.model || runtimeContext?.model || state.currentModel || 'default');
    updateModel(model);
    if (!text) return;

    appendConversation(sessionId, 'user', text);
    appendRuntimeLog(sessionId, `user_input -> ${text.slice(0, 120)}`, { source: 'user' });

    const { provider: activeProvider } = resolveProvider();
    // Show thinking indicator
    const thinkingMsg = isZh() ? `\u2728 \u6B63\u5728\u601D\u8003\u4E2D [${activeProvider}]...` : `\u2728 Thinking [${activeProvider}]...`;
    appendConversation(sessionId, 'assistant', thinkingMsg, { _system: true, _thinking: true });

    try {
        // Search relevant memories to inject as context
        const ns = getMemoryNamespace();
        let memoryContext = '';
        try {
            console.log(`[agent:memory] SEARCH ns=${ns}, query="${text.slice(0, 80)}"`);
            const memories = await memoryClient.search(ns, text, 3);
            console.log(`[agent:memory] SEARCH result: found ${memories.length} memories`, memories);
            appendRuntimeLog(sessionId, `memory_search -> ns=${ns}, query="${text.slice(0, 50)}", found=${memories.length}`, { source: 'memory' });
            if (memories.length > 0) {
                memoryContext = memories.join('\n- ');
                appendRuntimeLog(sessionId, `memory_recall -> found ${memories.length} relevant memories`, { source: 'memory' });
            }
        } catch (memErr) {
            console.error(`[agent:memory] SEARCH ERROR:`, memErr);
            appendRuntimeLog(sessionId, `memory_error -> ${memErr.message || memErr}`, { source: 'memory' });
        }

        let reply = '';

        if (activeProvider === 'codex-cli' || activeProvider === 'claude-code') {
            // CLI spawned in temp dir (no repo context) with memory injected
            reply = await invokeCliAsync(activeProvider, text, memoryContext, model);
        } else if (activeProvider === 'api-key') {
            const subProvider = state.currentSubProvider || 'openai';
            const apiKey = getRawApiKey();
            const conversationHistory = getConversationForAI(sessionId);
            const memorySuffix = memoryContext
                ? (isZh() ? `\n\n你对这个用户的了解：\n- ${memoryContext}` : `\n\nWhat you know about this user:\n- ${memoryContext}`)
                : '';
            const result = await callAPI({
                subProvider,
                apiKey,
                model: state.currentModel,
                conversationHistory,
                systemPrompt: (isZh()
                    ? '\u4F60\u662F\u4E00\u4E2A\u6709\u7528\u7684 AI \u52A9\u624B\u3002\u8BF7\u7528\u4E0E\u7528\u6237\u76F8\u540C\u7684\u8BED\u8A00\u56DE\u590D\u3002'
                    : 'You are a helpful AI assistant. Reply in the same language as the user.') + memorySuffix
            });
            reply = result.content || '';
            if (result.usage) {
                appendRuntimeLog(sessionId, `token_usage -> ${JSON.stringify(result.usage)}`, { source: 'ai' });
            }
        } else {
            reply = isZh() ? '\u672A\u77E5\u7684 Provider\u3002' : 'Unknown provider.';
        }

        appendConversation(sessionId, 'assistant', reply || (isZh() ? '(AI \u8FD4\u56DE\u4E86\u7A7A\u54CD\u5E94)' : '(AI returned an empty response)'));
        appendRuntimeLog(sessionId, `ai_reply -> ${(reply || '').slice(0, 120)}`, { source: 'ai' });

        // Store user message in memory — only if it contains factual info (not just questions)
        const llmConfig = activeProvider === 'api-key' ? {
            apiKey: getRawApiKey(),
            model: state.currentModel,
            provider: state.currentSubProvider || 'openai'
        } : {};
        const isQuestion = /^[^.]{0,80}[?？]$/.test(text.trim()) || text.trim().length < 15;
        if (!isQuestion) {
            console.log(`[agent:memory] STORE user msg to ns=${ns}, text="${text.slice(0, 80)}"`);
            memoryClient.store(ns, text, { role: 'user', llmConfig })
                .then((r) => {
                    console.log(`[agent:memory] STORE user msg SUCCESS:`, JSON.stringify(r));
                    appendRuntimeLog(sessionId, `memory_store -> user msg stored to ${ns}`, { source: 'memory' });
                })
                .catch((e) => {
                    console.error(`[agent:memory] STORE user msg ERROR:`, e);
                    appendRuntimeLog(sessionId, `memory_store_error -> ${e.message || e}`, { source: 'memory' });
                });
        } else {
            console.log(`[agent:memory] SKIP storing question: "${text.slice(0, 80)}"`);
        }
        // Skip storing AI replies — they're verbose and pollute search results
    } catch (err) {
        const errorMsg = String(err?.message || err || 'Unknown error').slice(0, 500);
        appendConversation(sessionId, 'assistant', isZh() ? `\u274C AI \u8C03\u7528\u5931\u8D25\uFF1A${errorMsg}` : `\u274C AI call failed: ${errorMsg}`);
        appendRuntimeLog(sessionId, `ai_error -> ${errorMsg}`, { source: 'error' });
    }
}

function handleUserOption(payload = {}) {
    const sessionId = payload.sessionId || state.activeSessionId;
    if (!sessionId || !state.conversations[sessionId]) {
        emit('agent_error', { code: 4001, message: 'session not found' }, payload.requestId);
        return;
    }
    if (!hasBackend()) {
        const { reason } = resolveProvider();
        appendConversation(sessionId, 'assistant', isZh() ? `\u672A\u68C0\u6D4B\u5230\u53EF\u7528\u7684 AI \u540E\u7AEF\uFF1A${reason}\u3002\u8BF7\u5B89\u88C5 Codex CLI / Claude Code\uFF0C\u6216\u586B\u5199 API Key\u3002` : `No AI backend available: ${reason}. Please install Codex CLI / Claude Code, or configure an API Key.`);
        return;
    }
    const execution = getExecutionState(sessionId);
    if (execution.canceled) {
        appendConversation(sessionId, 'assistant', isZh() ? '\u5F53\u524D\u4F1A\u8BDD\u5DF2\u53D6\u6D88\uFF0C\u8BF7\u5148\u70B9\u51FB\u91CD\u8BD5\u540E\u7EE7\u7EED\u3002' : 'Current session is canceled. Please retry before continuing.');
        return;
    }
    if (execution.paused) {
        appendConversation(sessionId, 'assistant', isZh() ? '\u5F53\u524D\u4F1A\u8BDD\u5DF2\u6682\u505C\uFF0C\u8BF7\u5148\u6062\u590D\u540E\u7EE7\u7EED\u3002' : 'Current session is paused. Please resume before continuing.');
        return;
    }
    const optionId = String(payload.optionId || '').trim();
    const optionLabel = String(payload.optionLabel || optionId || '').trim();
    const questionId = String(payload.questionId || '').trim();
    const runtimeContext = payload.runtimeContext || state.runtimeContexts[sessionId] || {};
    const model = String(payload.model || runtimeContext?.model || state.currentModel || 'default');
    updateModel(model);
    if (!optionLabel || !optionId) return;
    appendConversation(sessionId, 'user', `[option] ${optionLabel}`);
    appendRuntimeLog(sessionId, `user_option -> ${questionId || 'unknown'}:${optionId}`, { source: 'user' });
    appendConversation(sessionId, 'assistant', isZh() ? `\u4F60\u9009\u62E9\u4E86\uFF1A${optionLabel}` : `You selected: ${optionLabel}`);
    if (runtimeContext && (runtimeContext.mode || (Array.isArray(runtimeContext.envIds) && runtimeContext.envIds.length) || (Array.isArray(runtimeContext.walletIds) && runtimeContext.walletIds.length))) {
        appendConversation(
            sessionId,
            'assistant',
            isZh()
                ? `\u5DF2\u5728\u4E0A\u4E0B\u6587\u4E2D\u6267\u884C\uFF1Amode=${runtimeContext.mode || 'unknown'}, model=${model}`
                : `Executed with context: mode=${runtimeContext.mode || 'unknown'}, model=${model}`
        );
    }
    if (!state.selectedAnswers[sessionId] || typeof state.selectedAnswers[sessionId] !== 'object') {
        state.selectedAnswers[sessionId] = {};
    }
    const selectedMap = state.selectedAnswers[sessionId];
    const beforeAnswered = _getTemplates()
        .filter((q) => q.type !== 'upload')
        .filter((q) => String(selectedMap[q.id] || '').trim().length > 0).length;
    const isPresetQuestion = _getTemplates().some((q) => q.id === questionId);
    if (questionId && isPresetQuestion) {
        selectedMap[questionId] = optionId;
    }
    if (questionId === 'q_execute_mode') {
        if (optionId === 'exec_now') {
            appendConversation(sessionId, 'assistant', isZh() ? '\u6536\u5230\uFF0C\u5DF2\u5F00\u59CB\u7ACB\u5373\u6267\u884C\u3002' : 'Confirmed. Execution started immediately.');
            moveSubTaskForward(sessionId);
        } else if (optionId === 'exec_schedule') {
            appendConversation(sessionId, 'assistant', isZh() ? '\u6536\u5230\uFF0C\u4EFB\u52A1\u5DF2\u52A0\u5165\u5B9A\u65F6\u961F\u5217\u3002' : 'Confirmed. Task has been queued for scheduled execution.');
        }
        sendSnapshot();
        return;
    }
    if (questionId === 'q_attachment_action') {
        appendConversation(
            sessionId,
            'assistant',
            isZh() ? `\u5DF2\u6309\u9644\u4EF6\u52A8\u4F5C\u6267\u884C\uFF1A${optionLabel}` : `Attachment action executed: ${optionLabel}`
        );
    }

    if (payload.optionId === 'next_resume') {
        const resumeTitle = isZh() ? '\u7B80\u5386\u8349\u7A3F v1' : 'Resume Draft v1';
        const fileInfo = buildArtifactFile(sessionId, 'resume', resumeTitle);
        appendArtifact(sessionId, { id: genId('resume'), type: 'resume', title: resumeTitle, ...fileInfo });
    }
    if (payload.optionId === 'next_cover') {
        const coverTitle = isZh() ? '\u6C42\u804C\u4FE1\u8349\u7A3F v1' : 'Cover Letter Draft v1';
        const fileInfo = buildArtifactFile(sessionId, 'cover_letter', coverTitle);
        appendArtifact(sessionId, { id: genId('cover'), type: 'cover_letter', title: coverTitle, ...fileInfo });
    }

    moveSubTaskForward(sessionId);

    const prompts = (state.prompts[sessionId]?.questions || _getTemplates());
    const promptQuestionsForProgress = prompts.filter((q) => q.type !== 'upload');
    const selectedLabels = prompts.map((q) => {
        const answer = selectedMap[q.id];
        if (!answer) return '';
        if (q.type === 'upload') return '';
        if (Array.isArray(q.options)) {
            const opt = (q.options || []).find((o) => o.id === answer);
            return opt ? opt.label : '';
        }
        return `${q.text}: ${answer}`;
    }).filter(Boolean);

    state.prompts[sessionId] = _buildPresetPrompt(selectedMap);

    const nowAnswered = promptQuestionsForProgress.filter((q) => {
        const v = selectedMap[q.id];
        return String(v || '').trim().length > 0;
    }).length;
    if (nowAnswered > beforeAnswered && nowAnswered < promptQuestionsForProgress.length) {
        appendConversation(sessionId, 'assistant', isZh() ? '\u5DF2\u8BB0\u5F55\uFF0C\u7EE7\u7EED\u9009\u62E9\u4E0B\u4E00\u9898\u3002' : 'Recorded. Please continue with next question.');
        sendSnapshot();
        return;
    }

    const summary = selectedLabels.join(' / ');
    if (summary && nowAnswered === promptQuestionsForProgress.length) {
        appendConversation(sessionId, 'assistant', isZh() ? `\u4F60\u7684\u5DF2\u9009\u8DEF\u5F84\uFF1A${summary}` : `Your selected path: ${summary}`);
    }
    if (nowAnswered === promptQuestionsForProgress.length) {
        appendConversation(sessionId, 'assistant', isZh() ? '\u5F53\u524D\u9636\u6BB5\u5DF2\u5B8C\u6210\uFF0C\u8BF7\u5728\u53F3\u4FA7\u4EA7\u7269\u533A\u67E5\u770B\u7B80\u5386/\u6C42\u804C\u4FE1\u8349\u7A3F\u3002' : 'Current stage is completed. Please check generated artifacts on the right side.');
    }
    sendSnapshot();
}

function handleUserAnswer(payload = {}) {
    const sessionId = payload.sessionId || state.activeSessionId;
    if (!sessionId || !state.conversations[sessionId]) {
        emit('agent_error', { code: 4001, message: 'session not found' }, payload.requestId);
        return;
    }
    if (!hasBackend()) {
        const { reason } = resolveProvider();
        appendConversation(sessionId, 'assistant', isZh() ? `\u672A\u68C0\u6D4B\u5230\u53EF\u7528\u7684 AI \u540E\u7AEF\uFF1A${reason}\u3002\u8BF7\u5B89\u88C5 Codex CLI / Claude Code\uFF0C\u6216\u586B\u5199 API Key\u3002` : `No AI backend available: ${reason}. Please install Codex CLI / Claude Code, or configure an API Key.`);
        return;
    }
    const execution = getExecutionState(sessionId);
    if (execution.canceled) {
        appendConversation(sessionId, 'assistant', isZh() ? '\u5F53\u524D\u4F1A\u8BDD\u5DF2\u53D6\u6D88\uFF0C\u8BF7\u5148\u70B9\u51FB\u91CD\u8BD5\u540E\u7EE7\u7EED\u3002' : 'Current session is canceled. Please retry before continuing.');
        return;
    }
    if (execution.paused) {
        appendConversation(sessionId, 'assistant', isZh() ? '\u5F53\u524D\u4F1A\u8BDD\u5DF2\u6682\u505C\uFF0C\u8BF7\u5148\u6062\u590D\u540E\u7EE7\u7EED\u3002' : 'Current session is paused. Please resume before continuing.');
        return;
    }
    const questionId = String(payload.questionId || '').trim();
    const questionText = String(payload.questionText || questionId).trim();
    const answer = String(payload.answer || '').trim();
    if (!questionId || !answer) return;

    if (!state.selectedAnswers[sessionId] || typeof state.selectedAnswers[sessionId] !== 'object') {
        state.selectedAnswers[sessionId] = {};
    }
    state.selectedAnswers[sessionId][questionId] = answer;
    state.prompts[sessionId] = _buildPresetPrompt(state.selectedAnswers[sessionId]);
    appendConversation(sessionId, 'user', `[answer] ${questionText}: ${answer}`);
    appendRuntimeLog(sessionId, `user_answer -> ${questionId}:${answer}`, { source: 'user' });
    appendConversation(sessionId, 'assistant', isZh() ? '\u5DF2\u8BB0\u5F55\u8BE5\u8F93\u5165\u3002' : 'Input recorded.');

    const prompts = _getTemplates().filter((q) => q.type !== 'upload');
    const allAnswered = prompts.every((q) => {
        const v = state.selectedAnswers[sessionId][q.id];
        return String(v || '').trim().length > 0;
    });
    if (allAnswered) {
        appendConversation(sessionId, 'assistant', isZh() ? '\u5DF2\u5B8C\u6210\u5168\u90E8\u9884\u8BBE\u95EE\u9898\u3002' : 'All preset questions are completed.');
    }
    sendSnapshot();
}

function handleUserAttachment(payload = {}) {
    const sessionId = payload.sessionId || state.activeSessionId;
    if (!sessionId || !state.conversations[sessionId]) {
        emit('agent_error', { code: 4001, message: 'session not found' }, payload.requestId);
        return;
    }
    const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
    const rejected = Array.isArray(payload.rejected) ? payload.rejected : [];
    const questionId = String(
        payload?.questionId ||
        attachments?.[0]?.questionId ||
        rejected?.[0]?.questionId ||
        ''
    ).trim();
    if (!attachments.length && !rejected.length) return;
    const execution = getExecutionState(sessionId);
    if (execution.canceled) {
        appendConversation(sessionId, 'assistant', isZh() ? '\u5F53\u524D\u4F1A\u8BDD\u5DF2\u53D6\u6D88\uFF0C\u8BF7\u5148\u70B9\u51FB\u91CD\u8BD5\u540E\u7EE7\u7EED\u3002' : 'Current session is canceled. Please retry before continuing.');
        return;
    }
    if (execution.paused) {
        appendConversation(sessionId, 'assistant', isZh() ? '\u5F53\u524D\u4F1A\u8BDD\u5DF2\u6682\u505C\uFF0C\u8BF7\u5148\u6062\u590D\u540E\u7EE7\u7EED\u3002' : 'Current session is paused. Please resume before continuing.');
        return;
    }
    const kinds = [];
    if (attachments.length) {
        const preview = attachments
            .slice(0, 5)
            .map((item) => {
                const kind = inferAttachmentKind(item);
                const source = item.source || 'upload';
                const size = Math.max(1, Math.round((item.size || 0) / 1024));
                return `${item.name || 'file'} [${kind}/${source}/${size}KB]`;
            })
            .join(', ');
        appendConversation(
            sessionId,
            'user',
            isZh()
                ? `[attachment] \u5DF2\u4E0A\u4F20 ${attachments.length} \u4E2A\u9644\u4EF6\uFF1A${preview}`
                : `[attachment] Uploaded ${attachments.length} attachment(s): ${preview}`,
            { attachments: attachments.slice(0, 6) }
        );
        appendConversation(
            sessionId,
            'assistant',
            isZh()
                ? `\u5DF2\u6536\u5230\u9644\u4EF6 ${attachments.length} \u4E2A\uFF1A${preview}`
                : `Received ${attachments.length} attachment(s): ${preview}`,
            { attachments: attachments.slice(0, 6) }
        );
        appendRuntimeLog(sessionId, `attachment_received -> ${attachments.length}`, { source: 'attachment' });
        if (questionId) {
            if (!state.selectedAnswers[sessionId] || typeof state.selectedAnswers[sessionId] !== 'object') {
                state.selectedAnswers[sessionId] = {};
            }
            state.selectedAnswers[sessionId][questionId] = 'uploaded';
            state.prompts[sessionId] = _buildPresetPrompt(state.selectedAnswers[sessionId]);
            appendConversation(
                sessionId,
                'assistant',
                isZh() ? `\u5DF2\u5B8C\u6210\u4E0A\u4F20\u9898\uFF1A${questionId}` : `Upload question completed: ${questionId}`
            );
        }
        kinds.push(...new Set(attachments.map(inferAttachmentKind)));
        state.attachmentKinds[sessionId] = [...new Set(kinds)];
    }

    if (rejected.length) {
        const reasonText = rejected
            .slice(0, 5)
            .map((item) => {
                const reason = item.reason === 'type'
                    ? (isZh() ? `\u7C7B\u578B\u4E0D\u652F\u6301(${item.kind || 'unknown'})` : `unsupported type(${item.kind || 'unknown'})`)
                    : (isZh() ? '\u6587\u4EF6\u8FC7\u5927' : 'file too large');
                return `${item.name || 'file'}: ${reason}`;
            })
            .join(', ');
        appendConversation(
            sessionId,
            'assistant',
            isZh()
                ? `[attachment] \u4EE5\u4E0B\u9644\u4EF6\u88AB\u62D2\u7EDD\uFF1A${reasonText}`
                : `[attachment] Rejected attachment(s): ${reasonText}`
        );
        appendRuntimeLog(sessionId, `attachment_rejected -> ${rejected.length}`, { source: 'attachment', level: 'warn' });
    }
    const uniqueKinds = kinds.length ? [...new Set(kinds)] : (state.attachmentKinds[sessionId] || []);
    if (uniqueKinds.includes('pdf')) {
        appendConversation(
            sessionId,
            'assistant',
            isZh()
                ? '\u68C0\u6D4B\u5230 PDF\uFF0C\u53EF\u7EE7\u7EED\u8BA9\u6211\u63D0\u53D6\u7B80\u5386\u8981\u70B9/\u5C97\u4F4DJD\u8981\u6C42\u3002'
                : 'PDF detected. I can extract resume highlights / job JD requirements next.'
        );
    }
    if (uniqueKinds.includes('image')) {
        appendConversation(
            sessionId,
            'assistant',
            isZh()
                ? '\u68C0\u6D4B\u5230\u56FE\u7247\uFF0C\u53EF\u7EE7\u7EED\u8BA9\u6211\u505A OCR \u6216\u7ED3\u6784\u5316\u89E3\u6790\u3002'
                : 'Image detected. I can run OCR or structured parsing next.'
        );
    }
    if (uniqueKinds.includes('sheet')) {
        appendConversation(
            sessionId,
            'assistant',
            isZh()
                ? '\u68C0\u6D4B\u5230\u8868\u683C\uFF0C\u53EF\u7EE7\u7EED\u8BA9\u6211\u505A\u5B57\u6BB5\u6620\u5C04\u548C\u7B5B\u9009\u5EFA\u8BAE\u3002'
                : 'Spreadsheet detected. I can provide field mapping and filtering suggestions.'
        );
    }
    appendConversation(
        sessionId,
        'assistant',
        isZh()
            ? '\u4F60\u53EF\u4EE5\u7EE7\u7EED\u8F93\u5165\u5904\u7406\u8981\u6C42\uFF0C\u6216\u4ECE\u9884\u8BBE\u95EE\u9898\u4E2D\u9009\u62E9\u4E0B\u4E00\u6B65\u3002'
            : 'You can continue with processing instructions, or choose next step from preset questions.'
    );
    appendAttachmentQuestionToPrompt(sessionId, uniqueKinds);
    sendSnapshot();
}

function handleExecutionControl(payload = {}) {
    const sessionId = payload.sessionId || state.activeSessionId;
    if (!sessionId || !state.conversations[sessionId]) {
        emit('agent_error', { code: 4001, message: 'session not found' }, payload.requestId);
        return;
    }
    const action = String(payload.action || '').trim().toLowerCase();
    if (!action) return;

    if (action === 'pause') {
        setExecutionState(sessionId, { paused: true });
        appendConversation(sessionId, 'assistant', isZh() ? '\u4EFB\u52A1\u5DF2\u6682\u505C\u3002' : 'Task paused.');
        sendSnapshot();
        return;
    }
    if (action === 'resume') {
        setExecutionState(sessionId, { paused: false, canceled: false });
        appendConversation(sessionId, 'assistant', isZh() ? '\u4EFB\u52A1\u5DF2\u6062\u590D\u3002' : 'Task resumed.');
        sendSnapshot();
        return;
    }
    if (action === 'cancel') {
        setExecutionState(sessionId, { paused: false, canceled: true });
        updateSubTasks(sessionId, (items) => items.map((item) => {
            if (item.status === 'running' || item.status === 'pending' || item.status === 'review') {
                return { ...item, status: 'failed', updatedAt: now() };
            }
            return item;
        }));
        appendConversation(sessionId, 'assistant', isZh() ? '\u4EFB\u52A1\u5DF2\u53D6\u6D88\u3002' : 'Task canceled.');
        sendSnapshot();
        return;
    }
    if (action === 'retry') {
        state.subtasks[sessionId] = defaultSubTasks(now());
        state.selectedAnswers[sessionId] = {};
        state.prompts[sessionId] = _buildPresetPrompt({});
        state.executionStates[sessionId] = { paused: false, canceled: false };
        state.attachmentKinds[sessionId] = [];
        emit('agent_subtask_update', { sessionId, items: state.subtasks[sessionId] });
        emit('agent_execution_update', { sessionId, state: state.executionStates[sessionId] });
        appendRuntimeLog(sessionId, 'execution -> retry', { source: 'execution' });
        appendConversation(sessionId, 'assistant', isZh() ? '\u4EFB\u52A1\u5DF2\u91CD\u7F6E\u5E76\u91CD\u65B0\u5F00\u59CB\u3002' : 'Task reset and restarted.');
        sendSnapshot();
    }
}

function handleSessionContextUpdate(payload = {}) {
    const sessionId = payload.sessionId || state.activeSessionId;
    if (!sessionId || !state.conversations[sessionId]) {
        emit('agent_error', { code: 4001, message: 'session not found' }, payload.requestId);
        return;
    }
    const runtimeContext = (payload.runtimeContext && typeof payload.runtimeContext === 'object') ? payload.runtimeContext : {};
    updateModel(payload?.model || runtimeContext?.model);
    const nextProvider = String(payload?.provider || runtimeContext?.provider || '').trim();
    const nextSubProvider = String(payload?.subProvider || runtimeContext?.subProvider || '').trim();
    if (nextProvider) state.currentProvider = nextProvider;
    if (nextSubProvider) state.currentSubProvider = nextSubProvider;
    const nextApiKey = String(payload?.apiKey || runtimeContext?.apiKey || '').trim();
    if (nextApiKey) state.runtimeApiKey = nextApiKey;
    state.runtimeContexts[sessionId] = runtimeContext;
    const providerDisplay = state.currentProvider || 'auto';
    const modelDisplay = runtimeContext.model || state.currentModel;
    appendConversation(
        sessionId,
        'assistant',
        isZh()
            ? `会话上下文已更新：mode=${runtimeContext.mode || 'unknown'}, provider=${providerDisplay}, env=${(runtimeContext.envIds || []).length}, wallet=${(runtimeContext.walletIds || []).length}, model=${modelDisplay}`
            : `Session context updated: mode=${runtimeContext.mode || 'unknown'}, provider=${providerDisplay}, env=${(runtimeContext.envIds || []).length}, wallet=${(runtimeContext.walletIds || []).length}, model=${modelDisplay}`
    );
    appendRuntimeLog(
        sessionId,
        `session_context_updated -> mode=${runtimeContext.mode || 'unknown'}, provider=${providerDisplay}, env=${(runtimeContext.envIds || []).length}, wallet=${(runtimeContext.walletIds || []).length}, model=${modelDisplay}`,
        { source: 'context' }
    );
    sendSnapshot();
}

// --------------- heartbeat & WebSocket ---------------

function startHeartBeat() {
    if (heartBeatTimer) clearInterval(heartBeatTimer);
    heartBeatTimer = setInterval(() => {
        send({ type: 'heart_beat' });
    }, 5000);
}

function initWebSocket() {
    ws = new WebSocket(url);
    ws.on('open', () => {
        startHeartBeat();
        send({ type: 'request_task_data', data: '' });
    });

    ws.on('message', (raw) => {
        const data = JSON.parse(raw);
        switch (data.type) {
            case 'request_task_data':
                taskData = data.data || {};
                if (typeof taskData === 'string') {
                    try {
                        taskData = JSON.parse(taskData);
                    } catch (_) {
                        taskData = {};
                    }
                }
                updateLanguage(
                    taskData?.taskDataFromFront?.language ||
                    taskData?.runtimeContext?.language ||
                    taskData?.language
                );
                updateModel(
                    taskData?.taskDataFromFront?.runtimeContext?.model ||
                    taskData?.runtimeContext?.model ||
                    taskData?.taskConfig?.default?.model ||
                    taskData?.taskConfig?.model
                );
                state.taskName = taskData?.taskName || state.taskName;
                if (!state.sessions.length) {
                    createSession('');
                } else {
                    emitSessionList();
                    sendSnapshot();
                }
                announceRuntimeContext();
                break;
            case 'agent_init':
                updateLanguage(data?.payload?.language);
                updateModel(data?.payload?.model);
                updateApiKeyConfiguredHint(data?.payload?.apiKeyConfigured);
                if (!state.sessions.length) {
                    createSession('');
                } else {
                    emitSessionList();
                    sendSnapshot();
                }
                announceRuntimeContext();
                break;
            case 'agent_session_create':
                updateLanguage(data?.payload?.language);
                updateModel(data?.payload?.model);
                updateApiKeyConfiguredHint(data?.payload?.apiKeyConfigured);
                createSession(data?.payload?.name || '');
                break;
            case 'agent_session_delete':
                updateLanguage(data?.payload?.language);
                updateModel(data?.payload?.model);
                updateApiKeyConfiguredHint(data?.payload?.apiKeyConfigured);
                deleteSession(data?.payload?.sessionId);
                break;
            case 'agent_session_switch':
                updateLanguage(data?.payload?.language);
                updateModel(data?.payload?.model);
                updateApiKeyConfiguredHint(data?.payload?.apiKeyConfigured);
                switchSession(data?.payload?.sessionId);
                break;
            case 'agent_session_context_update':
                updateLanguage(data?.payload?.language);
                updateApiKeyConfiguredHint(data?.payload?.apiKeyConfigured);
                handleSessionContextUpdate(data?.payload || {});
                break;
            case 'agent_user_input':
                updateLanguage(data?.payload?.language);
                updateApiKeyConfiguredHint(data?.payload?.apiKeyConfigured);
                handleUserInput(data?.payload || {});
                break;
            case 'agent_user_option':
                updateLanguage(data?.payload?.language);
                updateApiKeyConfiguredHint(data?.payload?.apiKeyConfigured);
                handleUserOption(data?.payload || {});
                break;
            case 'agent_user_answer':
                updateLanguage(data?.payload?.language);
                updateApiKeyConfiguredHint(data?.payload?.apiKeyConfigured);
                handleUserAnswer(data?.payload || {});
                break;
            case 'agent_user_attachment':
                updateLanguage(data?.payload?.language);
                updateApiKeyConfiguredHint(data?.payload?.apiKeyConfigured);
                handleUserAttachment(data?.payload || {});
                break;
            case 'agent_execution_control':
                updateLanguage(data?.payload?.language);
                updateApiKeyConfiguredHint(data?.payload?.apiKeyConfigured);
                handleExecutionControl(data?.payload || {});
                break;
            case 'terminate_process':
                terminated = true;
                send({
                    type: 'task_completed',
                    taskName: state.taskName,
                    success: true,
                    message: 'terminated'
                });
                try { ws.close(); } catch (_) {}
                process.exit(0);
                break;
            default:
                break;
        }
    });

    ws.on('close', () => {
        if (heartBeatTimer) {
            clearInterval(heartBeatTimer);
            heartBeatTimer = null;
        }
    });
}

initWebSocket();

reconnectTimer = setInterval(() => {
    if (terminated) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
        return;
    }
    if (!ws || ws.readyState === WebSocket.CLOSED) {
        initWebSocket();
    }
}, 3000);
