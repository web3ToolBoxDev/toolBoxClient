const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const {
    getPresetQuestionTemplates,
    isOnboardingComplete,
    isProfileComplete,
    defaultSubTasks,
    buildPresetPrompt,
    buildAttachmentActionQuestion,
    buildProfileCollectionPrompt
} = require('./lib/prompts');
const { callAPI, buildMultimodalContent } = require('./lib/aiClient');
const memoryClient = require('./lib/core/memoryClient');
const knowledgeClient = require('./lib/core/knowledgeClient');
const fileParser = require('./lib/core/fileParser');
const sessionStore = require('./lib/core/sessionStore');
const browserLauncher = require('./lib/core/browserLauncher');

// Persistent data directory for this agent
const _dataDir = path.join(__dirname, 'data');

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
        attachmentPolicy: base.attachmentPolicy || { maxSizeMB: 4, allowedKinds: ['image', 'pdf', 'doc', 'sheet', 'text'] },
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
    subtaskLogs: {},
    artifacts: {},
    runtimeLogs: {},
    prompts: {},
    stages: {},
    selectedAnswers: {},
    runtimeContexts: {},
    executionStates: {},
    attachmentKinds: {},
    onboardingComplete: {},
    profileSections: {},
    profileCollectionMode: {},
    envs: [],
    wallets: [],
    envsData: {},
    chromePath: '',
    savePath: '',
    walletExtensionPath: '',
    resumeProfile: ''
};

// Track active browser instances (not persisted)
const _activeBrowsers = {};


// --------------- persistence (core) ---------------

function restoreState() {
    const saved = sessionStore.load(_dataDir);
    if (!saved) return false;
    for (const key of sessionStore.PERSIST_KEYS) {
        if (saved[key] !== undefined) {
            state[key] = saved[key];
        }
    }
    // Reset transient per-session state
    for (const sid of Object.keys(state.conversations)) {
        if (!state.runtimeLogs[sid]) state.runtimeLogs[sid] = [];
        if (!state.executionStates[sid]) state.executionStates[sid] = { paused: false, canceled: false };
        if (state.onboardingComplete[sid] === undefined) state.onboardingComplete[sid] = false;
        if (!state.profileSections[sid]) state.profileSections[sid] = {};
        if (state.profileCollectionMode[sid] === undefined) state.profileCollectionMode[sid] = false;
        if (!state.subtaskLogs[sid]) state.subtaskLogs[sid] = {};
        // Refresh prompts from current templates to pick up newly supported kinds / text changes
        if (state.prompts[sid]) {
            state.prompts[sid] = _buildPresetPrompt(state.selectedAnswers[sid] || {});
        }
        // Restore running subtasks — keep their status so they can resume
        // (subtasks are already persisted; no reset needed)
    }
    console.log(`[agent] Restored ${state.sessions.length} sessions`);
    return state.sessions.length > 0;
}

function saveState() {
    sessionStore.save(_dataDir, state);
}

// Restore on startup
restoreState();

// Debounced auto-save: triggers after state mutations, avoids excessive writes
let _saveTimer = null;
function scheduleSave() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => { _saveTimer = null; saveState(); }, 2000);
}

// Save on exit
process.on('SIGTERM', () => { saveState(); process.exit(0); });
process.on('SIGINT', () => { saveState(); process.exit(0); });
process.on('exit', () => { saveState(); });

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
        subtaskLogs: state.subtaskLogs,
        artifacts: state.artifacts,
        runtimeLogs: state.runtimeLogs,
        prompts: state.prompts,
        runtimeContexts: state.runtimeContexts,
        executionStates: state.executionStates,
        onboardingComplete: state.onboardingComplete,
        envs: state.envs,
        wallets: state.wallets,
        activeBrowserEnvIds: Object.keys(_activeBrowsers)
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
    state.subtaskLogs[session.id] = {};
    state.artifacts[session.id] = [];
    state.runtimeLogs[session.id] = [];
    state.prompts[session.id] = _buildPresetPrompt(selectedMap);
    state.stages[session.id] = 0;
    state.selectedAnswers[session.id] = selectedMap;
    state.runtimeContexts[session.id] = {
        ...getRuntimeContext(),
        model: state.currentModel
    };
    state.executionStates[session.id] = { paused: true, canceled: false, started: false };
    state.attachmentKinds[session.id] = [];
    state.onboardingComplete[session.id] = false;
    state.profileSections[session.id] = {};
    state.profileCollectionMode[session.id] = false;
    appendConversation(session.id, 'assistant', isZh()
        ? '欢迎使用求职助手！请先回答以下问题来设定本次求职方向。完成后即可开始对话。'
        : 'Welcome to Job Seek Assistant! Please answer the onboarding questions below to set your job search direction. Chat will be unlocked once required questions are completed.');
    appendRuntimeLog(session.id, 'Session created', { source: 'system' });
    emitSessionList();
    sendSnapshot();
    scheduleSave();
}

function deleteSession(sessionId) {
    const id = String(sessionId || '').trim();
    if (!id) return;
    state.sessions = state.sessions.filter((item) => item.id !== id);
    delete state.conversations[id];
    delete state.subtasks[id];
    delete state.subtaskLogs[id];
    delete state.artifacts[id];
    delete state.runtimeLogs[id];
    delete state.prompts[id];
    delete state.stages[id];
    delete state.selectedAnswers[id];
    delete state.runtimeContexts[id];
    delete state.executionStates[id];
    delete state.attachmentKinds[id];
    delete state.onboardingComplete[id];
    delete state.profileSections[id];
    delete state.profileCollectionMode[id];
    if (!state.sessions.length) {
        createSession('');
        return;
    }
    if (state.activeSessionId === id) {
        state.activeSessionId = state.sessions[0].id;
    }
    emitSessionList();
    sendSnapshot();
    scheduleSave();
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

/**
 * Remove thinking/processing placeholder messages from conversation and notify frontend.
 */
function removeThinkingMessages(sessionId) {
    const convo = state.conversations[sessionId];
    if (!convo) return;
    const before = convo.length;
    state.conversations[sessionId] = convo.filter(m => !m._thinking);
    if (state.conversations[sessionId].length < before) {
        sendSnapshot();
    }
}

/**
 * Sanitize text before storing in mem0 memory.
 * BridgeLLM (offline fact extractor) splits on periods as sentence boundaries,
 * so "Vue.js" becomes "Vue" + "js". Strip markdown and neutralize mid-word dots.
 */
function sanitizeForMemory(text) {
    return text
        .replace(/^[-*\u2022\s]+/, '')                       // strip leading bullets/spaces
        .replace(/\*+/g, '')                                 // remove all asterisks (markdown bold/italic)
        .replace(/`/g, '')                                   // remove backticks (markdown code)
        .replace(/\.(?=js|ts|py|css|html|net|io)\b/gi, ' ') // .js/.ts etc → space (prevent period splitting)
        .replace(/\s{2,}/g, ' ')                             // collapse whitespace
        .trim();
}

function inferAttachmentKind(item = {}) {
    const mime = String(item?.mimeType || '').toLowerCase();
    const name = String(item?.name || '').toLowerCase();
    if (mime.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif|bmp)$/.test(name)) return 'image';
    if (mime.includes('pdf') || /\.pdf$/.test(name)) return 'pdf';
    if (mime.includes('wordprocessingml') || mime.includes('msword') || /\.docx?$/.test(name)) return 'doc';
    if (mime.includes('spreadsheet') || /\.(xlsx|xls|csv)$/.test(name)) return 'sheet';
    if (mime.startsWith('text/') || /\.(txt|md|json|html?)$/.test(name)) return 'text';
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

function appendSubtaskLog(sessionId, subtaskKey, text, extra = {}) {
    if (!state.subtaskLogs[sessionId]) state.subtaskLogs[sessionId] = {};
    if (!state.subtaskLogs[sessionId][subtaskKey]) state.subtaskLogs[sessionId][subtaskKey] = [];
    const entry = { id: genId('stlog'), time: now(), text, ...extra };
    state.subtaskLogs[sessionId][subtaskKey].push(entry);
    // Keep max 200 logs per subtask
    if (state.subtaskLogs[sessionId][subtaskKey].length > 200) {
        state.subtaskLogs[sessionId][subtaskKey] = state.subtaskLogs[sessionId][subtaskKey].slice(-200);
    }
}

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
            const logText = `${item.key} -> ${item.status}`;
            appendRuntimeLog(
                sessionId,
                logText,
                { key: item.key, status: item.status, updatedAt: item.updatedAt || now(), source: 'subtask' }
            );
            appendSubtaskLog(sessionId, item.key, logText, { level: 'info', status: item.status });
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

// --------------- subtask actions (start / restart) ---------------

function handleSubtaskAction(payload = {}) {
    const sessionId = payload.sessionId || state.activeSessionId;
    if (!sessionId || !state.conversations[sessionId]) {
        emit('agent_error', { code: 4001, message: 'session not found' }, payload.requestId);
        return;
    }
    const subtaskKey = String(payload.subtaskKey || '').trim();
    const action = String(payload.action || 'start').trim();
    if (!subtaskKey) return;

    const items = state.subtasks[sessionId] || [];
    const target = items.find((i) => i.key === subtaskKey);
    if (!target) return;

    if (target.status === 'pending') {
        appendConversation(sessionId, 'assistant', isZh()
            ? `子任务 "${subtaskKey}" 尚未解锁，请先完成前置步骤。`
            : `Subtask "${subtaskKey}" is not unlocked yet. Please complete prior steps first.`);
        sendSnapshot();
        return;
    }

    const isRestart = action === 'restart' || target.status === 'done' || target.status === 'failed';

    updateSubTasks(sessionId, (list) => {
        const item = list.find((i) => i.key === subtaskKey);
        if (item) {
            item.status = 'running';
            item.updatedAt = now();
        }
        return list;
    });

    appendSubtaskLog(sessionId, subtaskKey,
        isRestart
            ? (isZh() ? '子任务已重新启动' : 'Subtask restarted')
            : (isZh() ? '子任务已启动' : 'Subtask started'),
        { level: 'info' }
    );

    appendConversation(sessionId, 'assistant', isZh()
        ? `${isRestart ? '重新启动' : '启动'}子任务：${subtaskKey}`
        : `${isRestart ? 'Restarting' : 'Starting'} subtask: ${subtaskKey}`);

    sendSnapshot();
    scheduleSave();
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
    const saveRoot = state.savePath || taskData?.savePath || taskData?.runtimeContext?.savePath || '';
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
 * When memoryContext is provided, writes it to a temp file to avoid shell escaping issues.
 */
function invokeCliAsync(provider, prompt, memoryContext = '', model = 'default') {
    return new Promise((resolve, reject) => {
        const escaped = prompt.replace(/"/g, '\\"');
        let fullCmd;
        const modelFlag = (model && model !== 'default') ? ` --model ${model}` : '';
        const workspaceDir = path.join(__dirname, 'workspace');

        // Write memory context to temp file if present (avoids shell escaping issues with newlines/special chars)
        let contextFilePath = '';
        if (memoryContext) {
            contextFilePath = path.join(workspaceDir, `_context_${Date.now()}.txt`);
            fs.writeFileSync(contextFilePath, memoryContext, 'utf-8');
        }

        const contextInstruction = contextFilePath
            ? `First, read the context file at ${contextFilePath} - it contains important background information about this user. Use that information to answer the following question. `
            : '';

        if (provider === 'codex-cli') {
            fullCmd = `codex exec${modelFlag} "${contextInstruction}${escaped}"`;
        } else {
            fullCmd = `claude -p "${contextInstruction}${escaped}"${modelFlag}`;
        }
        console.log(`[agent:cli] CMD (${provider}): ${fullCmd.slice(0, 200)}...`);
        let stdout = '';
        let stderr = '';
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
        const cleanupContext = () => {
            if (contextFilePath) try { fs.unlinkSync(contextFilePath); } catch (_) {}
        };
        child.on('close', (code) => {
            cleanupContext();
            if (code === 0) {
                resolve(stdout.trim());
            } else {
                const cliName = provider === 'codex-cli' ? 'codex' : 'claude';
                reject(new Error(`${cliName} exited with code ${code}: ${stderr.trim()}`));
            }
        });
        child.on('error', (err) => {
            cleanupContext();
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

/**
 * Extract and persist env/wallet data from the runtime context.
 * Called when taskData arrives or session context is updated.
 */
function extractEnvWalletData(runtimeContext) {
    if (!runtimeContext || typeof runtimeContext !== 'object') return;
    state.envs = Array.isArray(runtimeContext.envs) ? runtimeContext.envs : [];
    state.wallets = Array.isArray(runtimeContext.wallets) ? runtimeContext.wallets : [];
    if (runtimeContext.envsData && typeof runtimeContext.envsData === 'object') {
        state.envsData = runtimeContext.envsData;
    }
    if (runtimeContext.chromePath) state.chromePath = runtimeContext.chromePath;
    if (runtimeContext.savePath) state.savePath = runtimeContext.savePath;
    if (runtimeContext.walletExtensionPath) state.walletExtensionPath = runtimeContext.walletExtensionPath;
}

function announceRuntimeContext() {
    if (runtimeContextAnnounced || !state.activeSessionId) return;
    const context = getRuntimeContext();
    const mode = String(context?.mode || taskData?.taskDataFromFront?.mode || 'unknown');
    const envNames = state.envs.map((e) => e.name || e.id || '?').join(', ') || 'none';
    const walletNames = state.wallets.map((w) => w.name || w.id || '?').join(', ') || 'none';
    const envCount = state.envs.length;
    const walletCount = state.wallets.length;
    const model = String(context?.model || state.currentModel || 'default');
    const walletPath = state.walletExtensionPath ? `, metamaskPath=${state.walletExtensionPath}` : '';
    const { provider, reason } = resolveProvider();
    const providerInfo = provider ? `${provider} (${reason})` : `none (${reason})`;
    appendConversation(
        state.activeSessionId,
        'assistant',
        isZh()
            ? `运行上下文已加载：provider=${providerInfo}, mode=${mode}, env=[${envNames}](${envCount}), wallet=[${walletNames}](${walletCount}), model=${model}${walletPath}`
            : `Runtime context loaded: provider=${providerInfo}, mode=${mode}, env=[${envNames}](${envCount}), wallet=[${walletNames}](${walletCount}), model=${model}${walletPath}`
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
        // Build context: knowledge store (FTS + expand) -> mem0 fallback -> state fallback
        let memoryContext = '';
        try {
            console.log(`[agent:knowledge] Searching for: "${text.slice(0, 80)}"`);
            const { docs, source } = await knowledgeClient.searchAndExpand(text);
            if (docs.length > 0) {
                memoryContext = docs.map(d => {
                    const label = d.subType ? `${d.type}/${d.subType}` : d.type;
                    return `[${label}]\n${d.content}`;
                }).join('\n\n');
                console.log(`[agent:knowledge] Found ${docs.length} docs via ${source}`);
                appendRuntimeLog(sessionId, `knowledge_search -> query="${text.slice(0, 50)}", found=${docs.length} docs via ${source}`, { source: 'knowledge' });
            }
        } catch (ksErr) {
            console.error('[agent:knowledge] search error:', ksErr.message);
        }

        // Fallback to state.resumeProfile if knowledge store returned nothing
        if (!memoryContext && state.resumeProfile) {
            memoryContext = state.resumeProfile;
            console.log(`[agent:knowledge] Fallback to state.resumeProfile (${memoryContext.length} chars)`);
        }

        // Supplement with mem0 for conversational memories
        try {
            const ns = getMemoryNamespace();
            const memories = await memoryClient.search(ns, text, 3);
            if (memories.length > 0) {
                const extra = memories.join('\n- ');
                memoryContext = memoryContext ? `${memoryContext}\n\nAdditional context:\n- ${extra}` : extra;
            }
        } catch (memErr) {
            // mem0 is supplementary, don't block on failure
        }

        let reply = '';

        // Determine system prompt based on session phase
        const inProfileCollection = state.profileCollectionMode[sessionId];
        const direction = state.selectedAnswers[sessionId] || {};
        const systemPrompt = inProfileCollection
            ? buildProfileCollectionPrompt(isZh(), direction)
            : (isZh()
                ? '\u4F60\u662F\u4E00\u4E2A\u6709\u7528\u7684 AI \u52A9\u624B\u3002\u8BF7\u7528\u4E0E\u7528\u6237\u76F8\u540C\u7684\u8BED\u8A00\u56DE\u590D\u3002'
                : 'You are a helpful AI assistant. Reply in the same language as the user.');

        if (activeProvider === 'codex-cli' || activeProvider === 'claude-code') {
            const cliContext = inProfileCollection
                ? (memoryContext ? `${systemPrompt}\n\n${memoryContext}` : systemPrompt)
                : memoryContext;
            reply = await invokeCliAsync(activeProvider, text, cliContext, model);
        } else if (activeProvider === 'api-key') {
            const subProvider = state.currentSubProvider || 'openai';
            const apiKey = getRawApiKey();
            const conversationHistory = getConversationForAI(sessionId);
            const memorySuffix = memoryContext
                ? (isZh() ? `\n\nIMPORTANT: 你已经知道这个用户的以下信息，请在回答时使用：\n${memoryContext}` : `\n\nIMPORTANT: You already know the following facts about this user. Use this information when answering:\n${memoryContext}`)
                : '';
            const result = await callAPI({
                subProvider,
                apiKey,
                model: state.currentModel,
                conversationHistory,
                systemPrompt: systemPrompt + memorySuffix
            });
            reply = result.content || '';
            if (result.usage) {
                appendRuntimeLog(sessionId, `token_usage -> ${JSON.stringify(result.usage)}`, { source: 'ai' });
            }
        } else {
            reply = isZh() ? '\u672A\u77E5\u7684 Provider\u3002' : 'Unknown provider.';
        }

        removeThinkingMessages(sessionId);
        appendConversation(sessionId, 'assistant', reply || (isZh() ? '(AI \u8FD4\u56DE\u4E86\u7A7A\u54CD\u5E94)' : '(AI returned an empty response)'));
        appendRuntimeLog(sessionId, `ai_reply -> ${(reply || '').slice(0, 120)}`, { source: 'ai' });

        // Detect [PROFILE_COMPLETE] marker from AI in profile collection mode
        if (inProfileCollection && reply && reply.includes('[PROFILE_COMPLETE]')) {
            await extractProfileFromConversation(sessionId);
        }

        scheduleSave();

        // Store user message in memory — only if it contains factual info (not just questions)
        const ns = getMemoryNamespace();
        const llmConfig = activeProvider === 'api-key' ? {
            apiKey: getRawApiKey(),
            model: state.currentModel,
            provider: state.currentSubProvider || 'openai'
        } : {};
        const trimmed = text.trim();
        const isQuestion = /[?？]$/.test(trimmed)
            || trimmed.length < 15
            || /^(who|what|where|when|why|how|can you|do you|tell me|based on)\b/i.test(trimmed)
            || /^(谁|什么|哪|怎么|为什么|可以|告诉|请问|帮我)\b/.test(trimmed);
        if (!isQuestion) {
            const sanitized = sanitizeForMemory(text);
            console.log(`[agent:memory] STORE user msg to ns=${ns}, text="${sanitized.slice(0, 80)}"`);
            memoryClient.store(ns, sanitized, { role: 'user', llmConfig })
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
    } catch (err) {
        removeThinkingMessages(sessionId);
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

    state.prompts[sessionId] = _buildPresetPrompt(selectedMap);

    // Check onboarding completion after option selection
    checkAndCompleteOnboarding(sessionId);
    sendSnapshot();
}

function handleUserAnswer(payload = {}) {
    const sessionId = payload.sessionId || state.activeSessionId;
    if (!sessionId || !state.conversations[sessionId]) {
        emit('agent_error', { code: 4001, message: 'session not found' }, payload.requestId);
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

    // Check onboarding completion after answer
    checkAndCompleteOnboarding(sessionId);
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
    if (uniqueKinds.includes('doc')) {
        appendConversation(
            sessionId,
            'assistant',
            isZh()
                ? '检测到文档文件（DOC/DOCX），将自动提取内容并分析。'
                : 'Document file (DOC/DOCX) detected. Will auto-extract content and analyze.'
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
    appendAttachmentQuestionToPrompt(sessionId, uniqueKinds);
    sendSnapshot();

    // Auto-extract resume content from attachments
    if (attachments.length && hasBackend()) {
        extractResumeFromAttachments(sessionId, attachments);
    }
}

// --------------- resume extraction ---------------

const RESUME_EXTRACT_PROMPT_ZH = `请从以下简历内容中提取关键信息，严格按以下分区格式返回（每个分区用 [SECTION:xxx] 标记）：

[SECTION:basic]
姓名、地点、联系方式（邮箱/电话）

[SECTION:skills]
技能列表

[SECTION:experience]
工作经历（公司、职位、时间段、主要职责）

[SECTION:education]
教育背景

[SECTION:highlights]
其他亮点（证书、语言能力、求职意向等）

如果某个分区信息缺失，跳过该分区即可。请用中文回复。

简历内容：
`;

const RESUME_EXTRACT_PROMPT_EN = `Extract key information from the following resume content. Use EXACTLY this section format:

[SECTION:basic]
Full name, location, contact info (email/phone)

[SECTION:skills]
Skills list

[SECTION:experience]
Work experience (company, role, duration, key responsibilities)

[SECTION:education]
Education background

[SECTION:highlights]
Other highlights (certifications, languages, career objective, etc.)

Skip any section where info is missing. Reply in English.

Resume content:
`;

/**
 * Parse AI extraction reply into sections keyed by subType.
 * Tries [SECTION:xxx] format first, then auto-detects from common heading patterns.
 */
function parseResumeSections(reply) {
    // Strategy 1: explicit [SECTION:xxx] markers
    const sections = {};
    const sectionRegex = /\[SECTION:(\w+)\]\s*([\s\S]*?)(?=\[SECTION:|\s*$)/gi;
    let match;
    while ((match = sectionRegex.exec(reply)) !== null) {
        const key = match[1].toLowerCase().trim();
        const content = match[2].trim();
        if (content) sections[key] = content;
    }
    if (Object.keys(sections).length >= 2) return sections;

    // Strategy 2: auto-detect from heading patterns (bold, colon, ##, etc.)
    const HEADING_MAP = [
        { pattern: /(?:name|full\s*name|姓名|联系|contact|location|地[点址]|电话|phone|email)/i, key: 'basic' },
        { pattern: /(?:skill|技[能术]|proficien|tech.*stack|工具|framework)/i, key: 'skills' },
        { pattern: /(?:experience|work|employment|工作|经[历验]|职[位业]|company|公司)/i, key: 'experience' },
        { pattern: /(?:education|学[历历]|degree|university|大学|college|school|学校)/i, key: 'education' },
        { pattern: /(?:highlight|certif|award|language|语言|证书|项目|project|other|其[他它]|亮点|objective|意向)/i, key: 'highlights' },
    ];

    const lines = reply.split('\n');
    let currentKey = 'basic';
    const autoSections = {};

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Detect heading: "**Skills:**", "## Skills", "Skills:", "- **Skills**" etc.
        const isHeading = /^(?:#+\s*|[-*•]\s*)?(?:\*{1,2})?[\w\u4e00-\u9fff].*?(?:\*{1,2})?[:：]\s*$/i.test(trimmed)
            || /^#{1,3}\s+/.test(trimmed);

        if (isHeading) {
            for (const { pattern, key } of HEADING_MAP) {
                if (pattern.test(trimmed)) {
                    currentKey = key;
                    break;
                }
            }
            // Don't add the heading line itself to content (it's just a label)
            continue;
        }

        // Check if this line IS a heading+content combo like "Name: Zhang Ying"
        let matched = false;
        for (const { pattern, key } of HEADING_MAP) {
            if (pattern.test(trimmed)) {
                if (!autoSections[key]) autoSections[key] = '';
                autoSections[key] += (autoSections[key] ? '\n' : '') + trimmed;
                matched = true;
                currentKey = key;
                break;
            }
        }
        if (!matched) {
            if (!autoSections[currentKey]) autoSections[currentKey] = '';
            autoSections[currentKey] += (autoSections[currentKey] ? '\n' : '') + trimmed;
        }
    }

    // Use auto-detected sections if we got more than just 'basic'
    if (Object.keys(autoSections).length >= 2) return autoSections;

    // Final fallback: store everything as 'basic'
    if (reply.trim()) {
        return { basic: reply.trim() };
    }
    return {};
}

async function extractResumeFromAttachments(sessionId, attachments) {
    const { provider: activeProvider } = resolveProvider();
    if (!activeProvider) return;

    for (const attachment of attachments) {
        try {
            const parsed = await fileParser.extractText(
                attachment.contentBase64,
                attachment.mimeType,
                attachment.name
            );

            appendRuntimeLog(sessionId, `file_parse -> ${attachment.name}: kind=${parsed.kind}, textLen=${(parsed.text || '').length}`, { source: 'extraction' });

            if (!parsed.text && parsed.kind !== 'image') {
                appendConversation(sessionId, 'assistant', isZh()
                    ? `无法从 ${attachment.name} 提取文本内容。`
                    : `Could not extract text from ${attachment.name}.`);
                continue;
            }

            appendConversation(sessionId, 'assistant', isZh()
                ? `\u2728 正在解析 ${attachment.name}...`
                : `\u2728 Parsing ${attachment.name}...`,
                { _system: true, _thinking: true });

            const extractPrompt = isZh() ? RESUME_EXTRACT_PROMPT_ZH : RESUME_EXTRACT_PROMPT_EN;
            let reply = '';
            const model = state.currentModel || 'default';

            if (activeProvider === 'codex-cli' || activeProvider === 'claude-code') {
                // Write content to temp file to avoid shell escaping issues with long text
                const workspaceDir = path.join(__dirname, 'workspace');
                const tmpName = `resume_upload_${Date.now()}`;
                // CLI prompt: tell it to read the file first, then give extraction instructions
                const cliExtractInstructions = isZh()
                    ? '这个文件包含一份简历。请提取以下关键信息并以要点格式返回：姓名和联系方式、技能列表、工作经历（公司/职位/时间/职责）、教育背景、其他亮点。如信息缺失则跳过。'
                    : 'This file contains a resume. Read it carefully and extract: full name and contact info, skills list, work experience (company/role/duration/responsibilities), education, and other highlights. Return in concise bullet points. Skip missing fields.';

                if (parsed.kind === 'image') {
                    const imgPath = path.join(workspaceDir, `${tmpName}.png`);
                    const imgBuffer = Buffer.from(fileParser.stripDataUriPrefix(attachment.contentBase64), 'base64');
                    fs.writeFileSync(imgPath, imgBuffer);
                    reply = await invokeCliAsync(activeProvider, `Look at the resume image at ${imgPath}. ${cliExtractInstructions}`, '', model);
                    try { fs.unlinkSync(imgPath); } catch (_) {}
                } else {
                    const txtPath = path.join(workspaceDir, `${tmpName}.txt`);
                    fs.writeFileSync(txtPath, parsed.text.slice(0, 12000), 'utf-8');
                    reply = await invokeCliAsync(activeProvider, `Read the resume file at ${txtPath}. ${cliExtractInstructions}`, '', model);
                    try { fs.unlinkSync(txtPath); } catch (_) {}
                }
            } else if (activeProvider === 'api-key') {
                const subProvider = state.currentSubProvider || 'openai';
                const apiKey = getRawApiKey();

                let imageContent = null;
                let promptText = extractPrompt;
                if (parsed.kind === 'image') {
                    promptText += '\n[See attached image]';
                    imageContent = buildMultimodalContent(promptText, parsed.dataUri, parsed.mimeType);
                } else {
                    promptText += '\n' + parsed.text.slice(0, 12000);
                }

                const result = await callAPI({
                    subProvider,
                    apiKey,
                    model: state.currentModel,
                    conversationHistory: [{ role: 'user', text: promptText }],
                    systemPrompt: isZh()
                        ? '你是一个专业的简历分析助手。请准确提取简历中的关键信息。'
                        : 'You are a professional resume analysis assistant. Extract key information accurately.',
                    imageContent
                });
                reply = result.content || '';
            }

            if (reply) {
                appendConversation(sessionId, 'assistant', isZh()
                    ? `📄 ${attachment.name} 简历解析结果：\n\n${reply}`
                    : `📄 Resume analysis for ${attachment.name}:\n\n${reply}`);
                appendRuntimeLog(sessionId, `resume_extracted -> ${attachment.name}, len=${reply.length}`, { source: 'extraction' });

                // Store full resume profile in state (quick access)
                state.resumeProfile = reply;

                // Parse into sections and store in knowledge store (persistent, searchable)
                try {
                    const sections = parseResumeSections(reply);
                    const sectionKeys = Object.keys(sections);
                    console.log(`[agent:knowledge] Parsed ${sectionKeys.length} sections: ${sectionKeys.join(', ')}`);

                    // Clear old profile docs before storing new ones
                    await knowledgeClient.remove({ type: 'profile' });

                    let stored = 0;
                    for (const [subType, content] of Object.entries(sections)) {
                        const summary = sanitizeForMemory(content.split('\n')[0] || '').slice(0, 100);
                        const result = await knowledgeClient.upsert({
                            refId: `profile_${subType}`,
                            type: 'profile',
                            subType,
                            content,
                            summary,
                            source: attachment.name,
                            tags: ['resume', subType]
                        });
                        if (result?.success) stored++;
                        console.log(`[agent:knowledge] Stored profile/${subType} (${content.length} chars)`);
                    }

                    // Also store a summary in mem0 for semantic search (lightweight pointer)
                    const ns = getMemoryNamespace();
                    const summaryText = sectionKeys.map(k => sections[k].split('\n')[0]).join('. ');
                    const sanitizedSummary = sanitizeForMemory(summaryText);
                    memoryClient.store(ns, sanitizedSummary, { role: 'user' }).catch(() => {});

                    removeThinkingMessages(sessionId);
                    appendRuntimeLog(sessionId, `knowledge_store -> ${stored}/${sectionKeys.length} profile sections from ${attachment.name}`, { source: 'knowledge' });
                    appendConversation(sessionId, 'assistant', isZh()
                        ? `\u2705 \u5DF2\u5C06 ${stored} \u4E2A\u7B80\u5386\u5206\u533A\u5B58\u5165\u77E5\u8BC6\u5E93\uFF0C\u540E\u7EED\u5BF9\u8BDD\u4E2D\u6211\u4F1A\u8BB0\u4F4F\u8FD9\u4E9B\u4FE1\u606F\u3002`
                        : `Done! ${stored} resume sections stored in knowledge base. I will remember this in future conversations.`);
                } catch (memErr) {
                    console.error('[agent:knowledge] store error:', memErr);
                    appendRuntimeLog(sessionId, `knowledge_store_error -> ${memErr.message}`, { source: 'knowledge' });
                }
            } else {
                removeThinkingMessages(sessionId);
                appendConversation(sessionId, 'assistant', isZh()
                    ? `未能从 ${attachment.name} 中提取有效信息。`
                    : `Could not extract valid info from ${attachment.name}.`);
            }

            sendSnapshot();
            scheduleSave();
        } catch (err) {
            removeThinkingMessages(sessionId);
            console.error(`[agent] Resume extraction failed for ${attachment.name}:`, err);
            appendConversation(sessionId, 'assistant', isZh()
                ? `解析 ${attachment.name} 时出错：${err.message}`
                : `Error parsing ${attachment.name}: ${err.message}`);
            appendRuntimeLog(sessionId, `extraction_error -> ${attachment.name}: ${err.message}`, { source: 'extraction' });
        }
    }
}

// --------------- onboarding completion & profile collection ---------------

/**
 * Store/update direction in knowledge store. If direction already existed, also store
 * a history entry so the dashboard can show target change timeline.
 */
function storeDirection(sessionId) {
    const selectedMap = state.selectedAnswers[sessionId] || {};
    const directionContent = [
        `Job Title: ${selectedMap.q_job_title || ''}`,
        `Location: ${selectedMap.q_location || ''}`,
        `Work Mode: ${selectedMap.q_work_mode || ''}`,
        selectedMap.q_salary ? `Target Salary: ${selectedMap.q_salary}K` : ''
    ].filter(Boolean).join('\n');
    const summary = `${selectedMap.q_job_title || ''} in ${selectedMap.q_location || ''} (${selectedMap.q_work_mode || ''})`;

    // Upsert current direction (overwrite)
    knowledgeClient.upsert({
        refId: `direction_${sessionId}`,
        type: 'direction',
        subType: 'current',
        content: directionContent,
        summary,
        source: 'preset',
        tags: ['direction', selectedMap.q_job_title, selectedMap.q_location].filter(Boolean)
    }).then(() => {
        console.log(`[agent:knowledge] Stored direction for session ${sessionId}`);
        appendRuntimeLog(sessionId, `knowledge_store -> direction stored: ${summary}`, { source: 'knowledge' });
    }).catch(err => {
        console.error('[agent:knowledge] direction store error:', err.message);
    });

    // Also store a timestamped history entry (for dashboard change tracking)
    knowledgeClient.upsert({
        refId: `direction_history_${sessionId}_${Date.now()}`,
        type: 'direction',
        subType: 'history',
        content: directionContent,
        summary,
        source: 'preset',
        tags: ['direction_history', sessionId]
    }).catch(() => {});

    // Update session name to reflect current target
    const session = state.sessions.find(s => s.id === sessionId);
    if (session && selectedMap.q_job_title) {
        const location = selectedMap.q_location ? ` - ${selectedMap.q_location}` : '';
        session.name = `${selectedMap.q_job_title}${location}`;
        session.updatedAt = now();
        upsertSession(session);
        emitSessionList();
    }
}

/**
 * Check if required onboarding questions are answered.
 * On first completion: marks done, stores direction, starts profile collection if needed.
 * On subsequent changes: updates direction + history.
 */
function checkAndCompleteOnboarding(sessionId) {
    const templates = _getTemplates();
    const selectedMap = state.selectedAnswers[sessionId] || {};
    const complete = isOnboardingComplete(selectedMap, templates);

    if (!complete) return;

    // Always store/update direction when answers change
    storeDirection(sessionId);

    if (state.onboardingComplete[sessionId]) {
        // Already completed before — this is a direction change
        const summary = isZh()
            ? `求职方向已更新：${selectedMap.q_job_title}，${selectedMap.q_location}（${selectedMap.q_work_mode}）${selectedMap.q_salary ? `，目标年薪 ${selectedMap.q_salary}K` : ''}`
            : `Job search direction updated: ${selectedMap.q_job_title}, ${selectedMap.q_location} (${selectedMap.q_work_mode})${selectedMap.q_salary ? `, target salary ${selectedMap.q_salary}K` : ''}`;
        appendConversation(sessionId, 'assistant', summary);
        scheduleSave();
        return;
    }

    // First time completion
    state.onboardingComplete[sessionId] = true;
    moveSubTaskForward(sessionId); // onboarding -> done, profile -> running

    const summary = isZh()
        ? `求职方向已设定：${selectedMap.q_job_title}，${selectedMap.q_location}（${selectedMap.q_work_mode}）${selectedMap.q_salary ? `，目标年薪 ${selectedMap.q_salary}K` : ''}`
        : `Job search direction set: ${selectedMap.q_job_title}, ${selectedMap.q_location} (${selectedMap.q_work_mode})${selectedMap.q_salary ? `, target salary ${selectedMap.q_salary}K` : ''}`;
    appendConversation(sessionId, 'assistant', summary);

    // Check if resume was uploaded
    const hasResume = Boolean(selectedMap.q_upload_profile);
    if (!hasResume) {
        state.profileCollectionMode[sessionId] = true;
        appendConversation(sessionId, 'assistant', isZh()
            ? '你还没有上传简历，可以随时上传，或者通过对话告诉我你的技能和经历来构建档案。'
            : 'You haven\'t uploaded a resume yet. You can upload one any time, or tell me about your skills and experience through chat to build your profile.');
    }
    appendRuntimeLog(sessionId, `onboarding_complete -> hasResume=${hasResume}`, { source: 'onboarding' });
    scheduleSave();
}

/**
 * Extract profile sections from conversation history when AI marks [PROFILE_COMPLETE].
 * Parses the conversation to build profile sections and stores in knowledge store.
 */
async function extractProfileFromConversation(sessionId) {
    const { provider: activeProvider } = resolveProvider();
    if (!activeProvider) return;

    const conversationHistory = getConversationForAI(sessionId);
    const extractPrompt = isZh()
        ? '根据以上对话内容，提取用户的个人档案信息，严格按以下分区格式返回：\n\n[SECTION:basic]\n姓名、联系方式\n\n[SECTION:skills]\n技能列表\n\n[SECTION:experience]\n工作经历\n\n[SECTION:education]\n教育背景\n\n如果某个分区信息缺失，跳过该分区。'
        : 'Based on the conversation above, extract the user profile. Use EXACTLY this format:\n\n[SECTION:basic]\nName, contact info\n\n[SECTION:skills]\nSkills list\n\n[SECTION:experience]\nWork experience\n\n[SECTION:education]\nEducation\n\nSkip missing sections.';

    try {
        let reply = '';
        const model = state.currentModel || 'default';

        if (activeProvider === 'codex-cli' || activeProvider === 'claude-code') {
            const convoText = conversationHistory.map(m => `${m.role}: ${m.text}`).join('\n').slice(0, 8000);
            reply = await invokeCliAsync(activeProvider, `${extractPrompt}\n\nConversation:\n${convoText}`, '', model);
        } else if (activeProvider === 'api-key') {
            const result = await callAPI({
                subProvider: state.currentSubProvider || 'openai',
                apiKey: getRawApiKey(),
                model,
                conversationHistory: [...conversationHistory, { role: 'user', text: extractPrompt }],
                systemPrompt: isZh() ? '你是简历分析助手。' : 'You are a resume analysis assistant.'
            });
            reply = result.content || '';
        }

        if (reply) {
            const sections = parseResumeSections(reply);
            const sectionKeys = Object.keys(sections);
            state.profileSections[sessionId] = sections;

            // Store in knowledge store
            await knowledgeClient.remove({ type: 'profile' });
            let stored = 0;
            for (const [subType, content] of Object.entries(sections)) {
                const result = await knowledgeClient.upsert({
                    refId: `profile_${subType}`,
                    type: 'profile',
                    subType,
                    content,
                    summary: sanitizeForMemory(content.split('\n')[0] || '').slice(0, 100),
                    source: 'conversation',
                    tags: ['profile', subType]
                });
                if (result?.success) stored++;
            }

            state.profileCollectionMode[sessionId] = false;
            state.resumeProfile = reply;
            moveSubTaskForward(sessionId); // profile -> done

            appendConversation(sessionId, 'assistant', isZh()
                ? `个人档案已构建完成！已存储 ${stored} 个分区（${sectionKeys.join('、')}）。你现在可以开始搜索工作了。`
                : `Profile built successfully! ${stored} sections stored (${sectionKeys.join(', ')}). You can now start searching for jobs.`);
            appendRuntimeLog(sessionId, `profile_from_conversation -> ${stored}/${sectionKeys.length} sections`, { source: 'knowledge' });
            sendSnapshot();
            scheduleSave();
        }
    } catch (err) {
        console.error('[agent] profile extraction from conversation failed:', err);
        appendRuntimeLog(sessionId, `profile_extraction_error -> ${err.message}`, { source: 'error' });
    }
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
        state.subtaskLogs[sessionId] = {};
        state.selectedAnswers[sessionId] = {};
        state.prompts[sessionId] = _buildPresetPrompt({});
        state.executionStates[sessionId] = { paused: true, canceled: false, started: false };
        state.attachmentKinds[sessionId] = [];
        state.onboardingComplete[sessionId] = false;
        state.profileSections[sessionId] = {};
        state.profileCollectionMode[sessionId] = false;
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
    extractEnvWalletData(runtimeContext);
    const providerDisplay = state.currentProvider || 'auto';
    const modelDisplay = runtimeContext.model || state.currentModel;
    const envNames = state.envs.map((e) => e.name || e.id || '?').join(', ') || 'none';
    const walletNames = state.wallets.map((w) => w.name || w.id || '?').join(', ') || 'none';
    appendConversation(
        sessionId,
        'assistant',
        isZh()
            ? `会话上下文已更新：mode=${runtimeContext.mode || 'unknown'}, provider=${providerDisplay}, env=[${envNames}](${state.envs.length}), wallet=[${walletNames}](${state.wallets.length}), model=${modelDisplay}`
            : `Session context updated: mode=${runtimeContext.mode || 'unknown'}, provider=${providerDisplay}, env=[${envNames}](${state.envs.length}), wallet=[${walletNames}](${state.wallets.length}), model=${modelDisplay}`
    );
    appendRuntimeLog(
        sessionId,
        `session_context_updated -> mode=${runtimeContext.mode || 'unknown'}, provider=${providerDisplay}, env=${state.envs.length}, wallet=${state.wallets.length}, model=${modelDisplay}`,
        { source: 'context' }
    );

    // Auto-start session on first Apply Model
    const execState = getExecutionState(sessionId);
    if (!execState.started) {
        setExecutionState(sessionId, { paused: false, canceled: false, started: true });
        // Start onboarding subtask
        updateSubTasks(sessionId, (items) => {
            const ob = items.find((i) => i.key === 'onboarding');
            if (ob && ob.status === 'pending') {
                ob.status = 'running';
                ob.updatedAt = now();
            }
            return items;
        });
        const questionCount = _getTemplates().length;
        appendConversation(sessionId, 'assistant', isZh()
            ? `会话已启动！有 ${questionCount} 个预设问题帮助设定你的求职方向，你可以随时修改。开始求职功能前需要完成必填项。`
            : `Session started! There are ${questionCount} preset questions to set your job search direction. You can change them any time. Required fields must be completed before using job search features.`);
        // Tell frontend to auto-open preset modal
        emit('agent_auto_open_preset', { sessionId });
    }

    sendSnapshot();
    scheduleSave();
}

// --------------- browser launch ---------------

async function handleLaunchBrowser(payload = {}) {
    const sessionId = payload.sessionId || state.activeSessionId;
    if (!sessionId || !state.conversations[sessionId]) {
        emit('agent_error', { code: 4001, message: 'session not found' }, payload.requestId);
        return;
    }

    const envId = payload.envId || (state.envs[0] && (state.envs[0].id || state.envs[0]._id));
    if (!envId) {
        appendConversation(sessionId, 'assistant', isZh() ? '没有可用的环境配置，请先在运行时设置中选择环境。' : 'No env available. Please select an env in runtime settings first.');
        return;
    }

    // Find env data
    const env = state.envs.find((e) => (e.id || e._id) === envId) || (state.envsData[envId] ? { id: envId, ...state.envsData[envId] } : null);
    if (!env) {
        appendConversation(sessionId, 'assistant', isZh() ? `环境 ${envId} 未找到。` : `Env ${envId} not found.`);
        return;
    }

    const chromePath = state.chromePath || taskData?.chromePath;
    const savePath = state.savePath || taskData?.savePath;
    if (!chromePath || !savePath) {
        appendConversation(sessionId, 'assistant', isZh() ? 'Chrome路径或保存路径未配置。' : 'Chrome path or save path not configured.');
        return;
    }

    // Check if browser already open for this env
    if (_activeBrowsers[envId]) {
        appendConversation(sessionId, 'assistant', isZh() ? `环境 ${env.name || envId} 的浏览器已经打开。` : `Browser for env ${env.name || envId} is already open.`);
        return;
    }

    const withWallet = payload.withWallet !== false;
    const wallet = withWallet ? state.wallets.find((w) => w.bindEnvId === envId) : null;

    appendConversation(sessionId, 'assistant', isZh()
        ? `正在启动浏览器：env=${env.name || envId}${wallet ? ', wallet=yes' : ''}...`
        : `Launching browser: env=${env.name || envId}${wallet ? ', wallet=yes' : ''}...`);
    appendRuntimeLog(sessionId, `launch_browser -> env=${envId}, wallet=${!!wallet}`, { source: 'browser' });

    try {
        const { browser } = await browserLauncher.launchBrowser({
            chromePath,
            savePath,
            env,
            wallet,
            walletExtensionPath: state.walletExtensionPath,
            onLog: (msg) => appendRuntimeLog(sessionId, `[browser] ${msg}`, { source: 'browser' })
        });

        _activeBrowsers[envId] = browser;
        browser.on('disconnected', () => {
            delete _activeBrowsers[envId];
            appendRuntimeLog(sessionId, `browser disconnected: env=${envId}`, { source: 'browser' });
            appendConversation(sessionId, 'assistant', isZh()
                ? `浏览器已关闭：env=${env.name || envId}`
                : `Browser closed: env=${env.name || envId}`);
            sendSnapshot();
        });

        appendConversation(sessionId, 'assistant', isZh()
            ? `浏览器已启动：env=${env.name || envId}${wallet ? ', MetaMask已加载' : ''}`
            : `Browser launched: env=${env.name || envId}${wallet ? ', MetaMask loaded' : ''}`);
        sendSnapshot();
    } catch (err) {
        appendConversation(sessionId, 'assistant', isZh()
            ? `浏览器启动失败：${err.message}`
            : `Browser launch failed: ${err.message}`);
        appendRuntimeLog(sessionId, `launch_browser_error: ${err.message}`, { source: 'browser' });
    }
}

async function handleCloseBrowser(payload = {}) {
    const sessionId = payload.sessionId || state.activeSessionId;
    const envId = payload.envId || (state.envs[0] && (state.envs[0].id || state.envs[0]._id));
    if (!envId || !_activeBrowsers[envId]) {
        appendConversation(sessionId, 'assistant', isZh() ? '没有打开的浏览器可以关闭。' : 'No open browser to close.');
        return;
    }
    try {
        await _activeBrowsers[envId].close();
    } catch (_) {}
    delete _activeBrowsers[envId];
    appendConversation(sessionId, 'assistant', isZh() ? '浏览器已关闭。' : 'Browser closed.');
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
                extractEnvWalletData(taskData?.runtimeContext);
                scheduleSave();
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
            case 'agent_subtask_action':
                updateLanguage(data?.payload?.language);
                handleSubtaskAction(data?.payload || {});
                break;
            case 'agent_launch_browser':
                handleLaunchBrowser(data?.payload || {});
                break;
            case 'agent_close_browser':
                handleCloseBrowser(data?.payload || {});
                break;
            case 'terminate_process':
                terminated = true;
                // Close all active browsers before exiting
                for (const [eid, br] of Object.entries(_activeBrowsers)) {
                    try { br.close(); } catch (_) {}
                    delete _activeBrowsers[eid];
                }
                saveState();
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
