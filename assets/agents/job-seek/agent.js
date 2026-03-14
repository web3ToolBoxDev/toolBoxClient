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
    buildProfileCollectionPrompt,
    buildChatPrompt
} = require('./lib/prompts');
const { callAPI, buildMultimodalContent } = require('./lib/aiClient');
const memoryClient = require('./lib/core/memoryClient');
const knowledgeClient = require('./lib/core/knowledgeClient');
const fileParser = require('./lib/core/fileParser');
const sessionStore = require('./lib/core/sessionStore');
const browserLauncher = require('./lib/core/browserLauncher');
const memoryPack = require('./lib/memoryPack');
const markerParser = require('./lib/markerParser');
const dashboardServer = require('./lib/dashboardServer');
const userStore = require('./lib/core/userStore');
const masterProfileClient = require('./lib/core/masterProfileClient');
const tailorProfile = require('./lib/tools/tailorProfile');

// Register domain pack at startup (before any upsert can happen).
// Retries on failure since dbservice may not be ready yet.
let _packRegistered = false;
const _packReady = (async () => {
    for (let attempt = 1; attempt <= 15; attempt++) {
        try {
            const result = await knowledgeClient.registerPack(memoryPack.domain, memoryPack.types);
            if (result?.success) {
                _packRegistered = true;
                console.log('[agent] domain pack registered');
                return;
            }
            throw new Error(result?.error || 'registration returned success=false');
        } catch (err) {
            console.warn(`[agent] domain pack registration attempt ${attempt}/15 failed: ${err.message}`);
            if (attempt < 15) await new Promise(r => setTimeout(r, 3000));
        }
    }
    console.error('[agent] domain pack registration failed after 15 attempts');
})();

/** Ensure domain pack is registered (lazy re-registration if startup failed). */
async function ensurePack() {
    if (_packRegistered) return true;
    try {
        const result = await knowledgeClient.registerPack(memoryPack.domain, memoryPack.types);
        if (result?.success) { _packRegistered = true; return true; }
    } catch { /* ignore */ }
    return false;
}

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
    resumeProfile: '',
    intentFiles: {},
    masterProfile: {},
    activeUserId: '',
    resumeHashes: {}
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
        // Migrate subtasks: remove deprecated keys (match, resume, coverLetter)
        const VALID_SUBTASK_KEYS = new Set(['onboarding', 'profile', 'search']);
        if (Array.isArray(state.subtasks[sid])) {
            const before = state.subtasks[sid].length;
            state.subtasks[sid] = state.subtasks[sid].filter((t) => VALID_SUBTASK_KEYS.has(t.key));
            if (state.subtasks[sid].length !== before) {
                console.log(`[agent] Migrated subtasks for ${sid}: ${before} -> ${state.subtasks[sid].length}`);
            }
        }
    }
    console.log(`[agent] Restored ${state.sessions.length} sessions`);
    return state.sessions.length > 0;
}

function saveState() {
    sessionStore.save(_dataDir, state);
}

// Restore on startup
restoreState();

// Initialize multi-user store and migrate existing data
(function initUserStore() {
    const { users, activeUserId } = userStore.init(_dataDir);
    if (!state.activeUserId) {
        state.activeUserId = activeUserId;
    }
    // Migration: if masterProfile is empty but we have session profileSections,
    // find the richest session and promote it as the master for the active user.
    if (state.activeUserId && (!state.masterProfile || Object.keys(state.masterProfile).length === 0)) {
        let bestSid = null;
        let bestCount = 0;
        for (const [sid, sections] of Object.entries(state.profileSections || {})) {
            const count = Object.values(sections || {}).filter(v => v && v.trim()).length;
            if (count > bestCount) {
                bestCount = count;
                bestSid = sid;
            }
        }
        if (bestSid && bestCount > 0) {
            state.masterProfile = { ...state.profileSections[bestSid] };
            console.log(`[agent:migration] Promoted session ${bestSid.slice(0, 8)} profile (${bestCount} sections) as master for ${state.activeUserId}`);
            // Async: persist to knowledge store
            masterProfileClient.saveAllSections(state.activeUserId, state.masterProfile)
                .catch(err => console.error('[agent:migration] Failed to save master to knowledge store:', err.message));
        }
    }
})();

// Debounced auto-save: triggers after state mutations, avoids excessive writes
let _saveTimer = null;
function scheduleSave() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => { _saveTimer = null; saveState(); }, 2000);
}

// Save on exit
process.on('SIGTERM', () => { dashboardServer.stop(); saveState(); process.exit(0); });
process.on('SIGINT', () => { dashboardServer.stop(); saveState(); process.exit(0); });
process.on('exit', () => { dashboardServer.stop(); saveState(); });

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
        activeBrowserEnvIds: Object.keys(_activeBrowsers),
        autoOpenPresetSessionId: state._autoOpenPresetSessionId || ''
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
        ? '欢迎使用求职助手！请先点击右上角「运行时设置」选择 AI 供应商并点击「应用模型」启动会话，然后回答预设问题来设定求职方向。'
        : 'Welcome to Job Seek Assistant! To get started, click "Runtime Settings" in the top right to select your AI provider, then click "Apply Model" to start the session. After that, answer the preset questions to set your job search direction.');
    appendRuntimeLog(session.id, 'Session created', { source: 'system' });
    emitSessionList();
    sendSnapshot();
    scheduleSave();
}

/**
 * Story 4.1: Seed profile from knowledgeStore after onboarding completes.
 * Each session has its own direction (new job target), but profile is reusable.
 * Only uses profile data updated within the last 30 days.
 * @returns {boolean} true if profile was seeded
 */
async function seedProfileFromKnowledge(sessionId) {
    console.log(`[agent:seed] attempting profile seed for session ${sessionId.slice(0, 8)}...`);
    try {
        await _packReady;
        await ensurePack(); // lazy re-register if startup failed

        let seededCount = 0;
        const userId = state.activeUserId;

        // Priority 1: load from master profile (user-scoped, no staleness window)
        if (userId) {
            const master = await masterProfileClient.loadMaster(userId);
            const masterKeys = Object.keys(master).filter(k => master[k] && master[k].trim());
            if (masterKeys.length > 0) {
                state.masterProfile = master;

                // Auto-tailor for target direction if available
                const direction = state.selectedAnswers[sessionId] || {};
                const targetRole = direction.q_job_title;
                if (targetRole) {
                    const { tailoredSections, droppedItems } = tailorProfile.handler({
                        masterProfile: master,
                        targetRole,
                        targetLocation: direction.q_location || '',
                        workMode: direction.q_work_mode || '',
                        salaryRange: direction.q_salary || ''
                    });
                    for (const [key, val] of Object.entries(tailoredSections)) {
                        if (val) {
                            state.profileSections[sessionId][key] = val;
                            seededCount++;
                        }
                    }
                    console.log(`[agent:seed] auto-tailored ${seededCount} sections for "${targetRole}" (dropped: ${droppedItems.length})`);
                    appendRuntimeLog(sessionId, `profile_tailored -> ${seededCount} sections for "${targetRole}", dropped ${droppedItems.length} items`, { source: 'tailoring' });
                } else {
                    // No direction yet — copy master as-is
                    for (const key of masterKeys) {
                        state.profileSections[sessionId][key] = master[key];
                        seededCount++;
                    }
                    console.log(`[agent:seed] seeded ${seededCount} sections from master (no direction yet)`);
                }
            }
        }

        // Priority 2: fall back to agent-scoped fresh docs (legacy behavior)
        if (seededCount === 0) {
            const profileDocs = await knowledgeClient.findFresh('profile', 'agent:job-seek', 30);
            console.log(`[agent:seed] findFresh returned ${profileDocs.length} docs`);
            for (const doc of profileDocs) {
                const subType = doc.subType || doc.sub_type;
                const content = doc.content;
                if (subType && content) {
                    state.profileSections[sessionId][subType] = content;
                    seededCount++;
                }
            }
        }

        if (seededCount === 0 || !isProfileComplete(state.profileSections[sessionId])) {
            console.log('[agent:seed] no usable profile found — starting profile collection');
            return false;
        }

        // Profile is complete — skip profile subtask, advance to dashboard
        state.profileCollectionMode[sessionId] = false;
        updateSubTasks(sessionId, (list) => {
            const pr = list.find(t => t.key === 'profile');
            if (pr && (pr.status === 'pending' || pr.status === 'running')) {
                pr.status = 'done';
                pr.updatedAt = now();
            }
            const sr = list.find(t => t.key === 'search');
            if (sr && sr.status === 'pending') {
                sr.status = 'running';
                sr.updatedAt = now();
            }
            return list;
        });

        const daysAgo = profileDocs.length > 0
            ? Math.round((Date.now() - new Date(profileDocs[0].updatedAt || profileDocs[0].updated_at || 0).getTime()) / 86400000)
            : '?';
        console.log(`[agent:seed] seeded ${seededCount} profile sections (${daysAgo}d ago)`);
        appendRuntimeLog(sessionId, `profile_seeded -> ${seededCount} sections (${daysAgo}d ago)`, { source: 'knowledge' });
        return true;
    } catch (err) {
        console.error('[agent:seed] profile seeding failed:', err.message);
        return false;
    }
}

/**
 * Story 4.2: Sync profile + direction summary to mem0 on profile finish.
 */
async function syncProfileToMem0(sessionId) {
    try {
        const sections = state.profileSections[sessionId] || {};
        const answers = state.selectedAnswers[sessionId] || {};

        const parts = [];
        if (answers.q_job_title) parts.push(`Target role: ${answers.q_job_title}`);
        if (answers.q_location) parts.push(`Location: ${answers.q_location}`);
        if (answers.q_work_mode) parts.push(`Work mode: ${answers.q_work_mode}`);
        if (answers.q_salary) parts.push(`Target salary: ${answers.q_salary}K`);
        if (sections.basic) parts.push(`Basic info: ${sections.basic}`);
        if (sections.skills) parts.push(`Skills: ${sections.skills}`);
        if (sections.experience) parts.push(`Experience: ${sections.experience}`);
        if (sections.education) parts.push(`Education: ${sections.education}`);
        if (sections.highlights) parts.push(`Highlights: ${sections.highlights}`);

        if (parts.length === 0) return;

        const summary = parts.join('\n');
        const ns = getMemoryNamespace();
        await memoryClient.store(ns, summary);
        console.log(`[agent:mem0] profile milestone synced (${summary.length} chars)`);
        appendRuntimeLog(sessionId, `mem0_sync -> profile milestone (${parts.length} sections)`, { source: 'knowledge' });
    } catch (err) {
        console.warn('[agent:mem0] milestone sync failed:', err.message);
        // Non-fatal — mem0 is supplementary
    }
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

    // Clean up intent file on disk
    const intentInfo = state.intentFiles[id];
    if (intentInfo?.filePath) {
        try { fs.unlinkSync(intentInfo.filePath); } catch {}
    }
    const sessionDir = path.join(_workspaceDir, id);
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
    delete state.intentFiles[id];

    // Clean up knowledge store docs for this session
    knowledgeClient.remove({ refId: `direction_${id}` }).catch(() => {});

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

/**
 * Reset ALL memory: knowledge store, mem0, state, intent files.
 * Used for testing / fresh start.
 */
async function resetAllMemory() {
    console.log('[agent] resetAllMemory — clearing all data');
    const errors = [];

    // 1. Clear knowledge store (all job-seek types)
    const types = ['profile', 'direction', 'job_listing', 'match_result'];
    for (const type of types) {
        try {
            const result = await knowledgeClient.remove({ type, scope: 'agent:job-seek' });
            console.log(`[agent] knowledge remove type=${type}:`, JSON.stringify(result));
            if (result && !result.success) errors.push(`knowledge/${type}: ${result.error || 'failed'}`);
        } catch (err) {
            console.error(`[agent] knowledge remove type=${type} error:`, err.message);
            errors.push(`knowledge/${type}: ${err.message}`);
        }
    }

    // 2. Clear mem0 memory
    const ns = getMemoryNamespace();
    try {
        const result = await memoryClient.clear(ns);
        console.log('[agent] mem0 clear result:', JSON.stringify(result));
        if (result && !result.success) errors.push(`mem0: ${result.error || 'failed'}`);
    } catch (err) {
        console.error('[agent] mem0 clear error:', err.message);
        errors.push(`mem0: ${err.message}`);
    }

    // 3. Clear global state
    state.resumeProfile = '';

    // 4. Clear per-session state
    for (const sid of Object.keys(state.profileSections)) {
        state.profileSections[sid] = {};
    }
    for (const sid of Object.keys(state.selectedAnswers)) {
        state.selectedAnswers[sid] = {};
    }
    for (const sid of Object.keys(state.profileCollectionMode)) {
        state.profileCollectionMode[sid] = false;
    }
    for (const sid of Object.keys(state.intentFiles)) {
        const info = state.intentFiles[sid];
        if (info?.filePath) {
            try { fs.unlinkSync(info.filePath); } catch {}
        }
    }
    state.intentFiles = {};

    // 5. Clean up ALL session dirs + temp files in workspace
    try {
        const entries = fs.readdirSync(_workspaceDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(_workspaceDir, entry.name);
            if (entry.isDirectory()) {
                // Remove all session directories
                try { fs.rmSync(fullPath, { recursive: true, force: true }); } catch {}
            } else if (entry.name.startsWith('_prompt_') || entry.name.startsWith('_context_')) {
                try { fs.unlinkSync(fullPath); } catch {}
            }
        }
        console.log('[agent] workspace cleaned');
    } catch (err) {
        console.warn('[agent] workspace cleanup error:', err.message);
    }

    // 6. Verify: check knowledge store and mem0 are actually empty
    try {
        const verifyDocs = await knowledgeClient.searchAndExpand('profile skills experience');
        if (verifyDocs.docs && verifyDocs.docs.length > 0) {
            console.warn(`[agent] VERIFY FAILED: knowledge store still has ${verifyDocs.docs.length} docs after clear`);
            errors.push(`verify: knowledge store still has ${verifyDocs.docs.length} docs`);
        }
    } catch {}
    try {
        const verifyMem = await memoryClient.search(ns, 'user profile skills', 5);
        if (verifyMem.length > 0) {
            console.warn(`[agent] VERIFY FAILED: mem0 still has ${verifyMem.length} results after clear`);
            errors.push(`verify: mem0 still has ${verifyMem.length} memories`);
        }
    } catch {}

    // 7. Notify with actual result
    const sessionId = state.activeSessionId;
    if (sessionId) {
        if (errors.length > 0) {
            console.error('[agent] resetAllMemory partial failures:', errors);
            appendConversation(sessionId, 'assistant', isZh()
                ? `⚠️ 记忆部分清除失败：${errors.join('; ')}。状态已重置。`
                : `⚠️ Memory partially cleared with errors: ${errors.join('; ')}. State has been reset.`);
        } else {
            appendConversation(sessionId, 'assistant', isZh()
                ? '✅ 所有记忆已清除（知识库、mem0、档案、意向文件、状态）。'
                : '✅ All memory cleared (knowledge store, mem0, profile, intent files, state).');
        }
        appendRuntimeLog(sessionId, `reset_all_memory -> ${errors.length ? 'partial' : 'complete'}, errors=${errors.length}`, { source: 'system' });
    }
    sendSnapshot();
    scheduleSave();
}

/**
 * Full reset for E2E testing: clear all memory + delete every session.
 * Returns a promise that resolves when done.
 */
async function resetForTest() {
    console.log('[agent] resetForTest — full data wipe');
    await resetAllMemory();

    // Re-register domain pack (may have been lost if dbservice restarted or was unavailable at startup)
    try {
        const result = await knowledgeClient.registerPack(memoryPack.domain, memoryPack.types);
        _packRegistered = !!(result?.success);
        console.log('[agent] resetForTest: domain pack re-registered:', _packRegistered);
    } catch (err) {
        console.warn('[agent] resetForTest: domain pack re-registration failed:', err.message);
    }

    // Delete all sessions (resetAllMemory only clears memory, not sessions)
    const sessionIds = state.sessions.map((s) => s.id);
    for (const sid of sessionIds) {
        deleteSession(sid);
    }

    // After deleteSession loop, state.sessions may have a fresh empty session
    // created by deleteSession when list becomes empty — delete its artifacts too
    for (const sid of Object.keys(state.conversations)) {
        state.conversations[sid] = [];
    }
    for (const sid of Object.keys(state.subtaskLogs)) {
        state.subtaskLogs[sid] = [];
    }
    for (const sid of Object.keys(state.runtimeLogs)) {
        state.runtimeLogs[sid] = [];
    }

    sendSnapshot();
    scheduleSave();
    console.log('[agent] resetForTest complete — sessions:', state.sessions.length);
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

async function handleSubtaskAction(payload = {}) {
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

    // Finish action: mark current subtask done, unlock next pending subtask
    if (action === 'finish') {
        if (target.status !== 'running') {
            sendSnapshot();
            return;
        }
        updateSubTasks(sessionId, (list) => {
            const idx = list.findIndex((i) => i.key === subtaskKey);
            if (idx >= 0) {
                list[idx].status = 'done';
                list[idx].updatedAt = now();
                // Unlock next pending subtask
                if (list[idx + 1] && list[idx + 1].status === 'pending') {
                    list[idx + 1].status = 'running';
                    list[idx + 1].updatedAt = now();
                }
            }
            return list;
        });
        appendSubtaskLog(sessionId, subtaskKey,
            isZh() ? '子任务已完成' : 'Subtask finished',
            { level: 'info' }
        );
        appendConversation(sessionId, 'assistant', isZh()
            ? `子任务已完成：${subtaskKey}`
            : `Subtask finished: ${subtaskKey}`);

        // Build dashboard when Profile Collection finishes
        if (subtaskKey === 'profile') {
            // If profile sections are empty, try extracting from conversation first
            const currentSections = state.profileSections[sessionId] || {};
            if (Object.keys(currentSections).length === 0) {
                try {
                    await extractProfileFromConversation(sessionId);
                } catch (exErr) {
                    console.error('[agent] profile extraction on finish failed:', exErr.message);
                }
            }
            try {
                buildIntentFile(sessionId);
                // Remove old dashboard artifacts before adding new one
                if (state.artifacts[sessionId]) {
                    state.artifacts[sessionId] = state.artifacts[sessionId].filter(
                        (a) => a.type !== 'dashboard'
                    );
                }
                const dashUrl = dashboardServer.getDashboardURL(sessionId);
                console.log(`[agent] ★ Dashboard URL: ${dashUrl}`);
                appendArtifact(sessionId, {
                    id: `dashboard-${sessionId}`,
                    type: 'dashboard',
                    title: isZh() ? '求职仪表盘' : 'Job Search Dashboard',
                    url: dashUrl,
                    openUrl: true
                });
            } catch (err) {
                console.error('[agent] dashboard artifact failed:', err);
                appendRuntimeLog(sessionId, `dashboard_error -> ${err.message}`, { source: 'error' });
            }
            // Story 4.2: sync profile milestone to mem0
            syncProfileToMem0(sessionId);
        }

        sendSnapshot();
        scheduleSave();
        return;
    }

    const isRestart = action === 'restart' || target.status === 'done' || target.status === 'failed';

    updateSubTasks(sessionId, (list) => {
        const idx = list.findIndex((i) => i.key === subtaskKey);
        if (idx < 0) return list;
        list[idx].status = 'running';
        list[idx].updatedAt = now();
        // Reset all downstream subtasks to pending (e.g., restarting profile resets search/match/resume)
        for (let i = idx + 1; i < list.length; i++) {
            if (list[i].status !== 'pending') {
                list[i].status = 'pending';
                list[i].updatedAt = now();
            }
        }
        return list;
    });

    // When (re)starting the profile subtask, enable profile collection mode
    // so the AI uses the profile collection prompt with marker instructions.
    if (subtaskKey === 'profile') {
        state.profileCollectionMode[sessionId] = true;
    }

    // When (re)starting the search subtask, seed platforms + build dashboard + auto-finish
    if (subtaskKey === 'search') {
        try { buildIntentFile(sessionId); } catch (e) {
            console.error('[agent] buildIntentFile on search start failed:', e.message);
        }

        // Seed platforms from location (e.g. Ontario → canada → Indeed + LinkedIn + Job Bank)
        const platformStore = require('./lib/workflow/platformStore');
        const workflowStore = require('./lib/workflow/workflowStore');
        const location = (state.selectedAnswers[sessionId] || {}).q_location || '';

        // On restart, clear existing platforms so initWithPresets re-seeds fresh
        if (isRestart) {
            platformStore.clearSession(sessionId);
            dashboardServer.clearPlatformStatuses(sessionId);
        }

        const platforms = platformStore.initWithPresets(sessionId, location);
        for (const plat of platforms) {
            dashboardServer.updatePlatformCell(sessionId, plat.id, {
                name: plat.name, icon: plat.icon, url: plat.url
            });
        }
        console.log(`[agent] Seeded ${platforms.length} platforms for location "${location}": ${platforms.map(p => p.name).join(', ')}`);

        // Seed workflow config if not yet created
        if (!workflowStore.getConfig(sessionId)) {
            workflowStore.getConfig(sessionId, location);
        }

        // Remove old dashboard artifacts before adding new one
        if (state.artifacts[sessionId]) {
            state.artifacts[sessionId] = state.artifacts[sessionId].filter(
                (a) => a.type !== 'dashboard'
            );
        }
        const dashUrl = dashboardServer.getDashboardURL(sessionId);
        console.log(`[agent] ★ Dashboard URL (search ${isRestart ? 'restart' : 'start'}): ${dashUrl}`);
        appendArtifact(sessionId, {
            id: `dashboard-${sessionId}`,
            type: 'dashboard',
            title: isZh() ? '求职仪表盘' : 'Job Search Dashboard',
            url: dashUrl,
            openUrl: true
        });

        // Auto-finish: dashboard build is instant, mark done and unlock next subtask
        updateSubTasks(sessionId, (list) => {
            const idx = list.findIndex(i => i.key === 'search');
            if (idx >= 0) {
                list[idx].status = 'done';
                list[idx].updatedAt = now();
                if (list[idx + 1] && list[idx + 1].status === 'pending') {
                    list[idx + 1].status = 'running';
                    list[idx + 1].updatedAt = now();
                }
            }
            return list;
        });

        appendSubtaskLog(sessionId, subtaskKey,
            isZh() ? '仪表盘已构建，平台已添加' : 'Dashboard built, platforms seeded',
            { level: 'info' }
        );
        appendConversation(sessionId, 'assistant', isZh()
            ? `仪表盘已构建完成，已根据目标地区（${location}）自动添加 ${platforms.length} 个平台：${platforms.map(p => p.name).join('、')}。`
            : `Dashboard built successfully. ${platforms.length} platforms seeded for "${location}": ${platforms.map(p => p.name).join(', ')}.`);

        sendSnapshot();
        scheduleSave();
        return;  // early return — skip generic start/restart messages below
    }

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

// --------------- intent file & dashboard ---------------

function buildIntentFile(sessionId) {
    const answers = state.selectedAnswers[sessionId] || {};
    const sections = state.profileSections[sessionId] || {};
    const resumeRaw = state.resumeProfile || '';
    const prev = state.intentFiles[sessionId];
    const version = prev ? (prev.version || 0) + 1 : 1;
    const builtAt = new Date().toISOString();

    const direction = {
        jobTitle: answers.q_job_title || '',
        location: answers.q_location || '',
        workMode: answers.q_work_mode || '',
        salary: answers.q_salary || ''
    };

    // Build markdown
    const lines = [
        `# Job Search Intent (v${version})`,
        `Built: ${builtAt.replace('T', ' ').slice(0, 19)}`,
        '',
        '## Direction',
        direction.jobTitle ? `- **Job Title:** ${direction.jobTitle}` : '',
        direction.location ? `- **Location:** ${direction.location}` : '',
        direction.workMode ? `- **Work Mode:** ${direction.workMode}` : '',
        direction.salary ? `- **Target Salary:** ${direction.salary}K` : '',
        ''
    ].filter(Boolean);

    lines.push('## Profile', '');
    const sectionOrder = ['basic', 'skills', 'experience', 'education'];
    const sectionLabels = { basic: 'Basic Info', skills: 'Skills', experience: 'Experience', education: 'Education' };
    for (const key of sectionOrder) {
        const content = sections[key] || '';
        if (content.trim()) {
            lines.push(`### ${sectionLabels[key] || key}`, content.trim(), '');
        }
    }
    // Include any extra sections not in the standard order
    for (const [key, content] of Object.entries(sections)) {
        if (!sectionOrder.includes(key) && content && content.trim()) {
            lines.push(`### ${key}`, content.trim(), '');
        }
    }

    if (resumeRaw && !Object.keys(sections).length) {
        lines.push('### Resume (Raw)', resumeRaw.trim(), '');
    }

    const markdown = lines.join('\n');

    // Write to workspace
    const sessionDir = path.join(_workspaceDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const intentPath = path.join(sessionDir, 'intent.md');
    fs.writeFileSync(intentPath, markdown, 'utf-8');

    // Store in state
    state.intentFiles[sessionId] = { version, builtAt, direction, filePath: intentPath };

    return { markdown, filePath: intentPath, version };
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
 * Context is inlined into the prompt (not as a file path) so the AI never sees file references.
 * Full prompt is written to a temp file to avoid shell escaping issues.
 */
function invokeCliAsync(provider, prompt, memoryContext = '', model = 'default', options = {}) {
    return new Promise((resolve, reject) => {
        const workspaceDir = path.join(__dirname, 'workspace');
        const execDir = options.cwd || workspaceDir;

        // Build full prompt with context inlined
        const fullPrompt = memoryContext
            ? `[CONTEXT]\n${memoryContext}\n[/CONTEXT]\n\n${prompt}`
            : prompt;

        // Build args WITHOUT the prompt — prompt is piped via stdin
        // to avoid shell escaping issues (newlines break cmd.exe on Windows)
        let bin, args;
        if (provider === 'codex-cli') {
            bin = 'codex';
            args = ['exec'];
            if (model && model !== 'default') args.push('--model', model);
        } else {
            bin = 'claude';
            args = ['-p'];
            if (model && model !== 'default') args.push('--model', model);
        }

        console.log(`[agent:cli] ${bin} ${args.join(' ')} (${provider}, prompt via stdin)`);
        let stdout = '';
        let stderr = '';
        const cleanEnv = { ...process.env };
        delete cleanEnv.CLAUDECODE; // Allow nested Claude Code invocation
        // shell: true to resolve .cmd/.ps1 wrappers; prompt piped via stdin
        const child = spawn(bin, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 120000,
            shell: true,
            cwd: execDir,
            env: cleanEnv
        });
        child.stdin.write(fullPrompt);
        child.stdin.end();
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
    // Technical context goes to onboarding subtask log, not main conversation
    appendSubtaskLog(
        state.activeSessionId,
        'onboarding',
        isZh()
            ? `运行上下文：provider=${providerInfo}, env=${envCount}, wallet=${walletCount}, model=${model}`
            : `Runtime context: provider=${providerInfo}, env=${envCount}, wallet=${walletCount}, model=${model}`
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

/**
 * Build a condensed conversation history string for CLI providers.
 * Includes the last N user/assistant turns so the CLI has context
 * for short replies like "y", "ok", "change that", etc.
 * Returns empty string if there's only 1 or fewer messages.
 */
function buildConversationHistory(sessionId, maxTurns = 6) {
    const msgs = getConversationForAI(sessionId);
    if (msgs.length <= 1) return '';
    // Take last maxTurns messages (excluding the current user message which is passed as the prompt)
    const recent = msgs.slice(-maxTurns - 1, -1);
    if (recent.length === 0) return '';
    const lines = recent.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`);
    return `[CONVERSATION HISTORY]\n${lines.join('\n\n')}\n[/CONVERSATION HISTORY]`;
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

    await ensurePack(); // lazy re-register domain types if needed

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
            : buildChatPrompt(isZh());

        if (activeProvider === 'codex-cli' || activeProvider === 'claude-code') {
            const convHistory = buildConversationHistory(sessionId);
            const contextParts = [systemPrompt];
            if (memoryContext) contextParts.push(memoryContext);
            if (convHistory) contextParts.push(convHistory);
            // Add marker reminder at end of context (close to user message) so AI doesn't forget
            contextParts.push(isZh()
                ? 'REMINDER: 你只能输出纯文本回复。如果用户要求修改档案，你必须在回复末尾包含对应的标记（如 [PROFILE_SET:basic=...] 或 [PROFILE_ADD:skills=...]）。不要尝试编辑文件或使用工具。'
                : 'REMINDER: You can ONLY output plain text. If the user asks to modify their profile, you MUST include the corresponding marker at the end (e.g. [PROFILE_SET:basic=...] or [PROFILE_ADD:skills=...]). Do NOT try to edit files or use tools.');
            const cliContext = contextParts.join('\n\n');
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

        // Log raw AI reply for marker debugging
        console.log(`[agent:marker-debug] raw reply (${(reply || '').length} chars): ${(reply || '').slice(-300)}`);

        // Parse markers from AI reply, display clean text
        const { markers, cleanText } = markerParser.parse(reply || '');
        console.log(`[agent:marker-debug] parsed ${markers.length} marker(s)${markers.length > 0 ? ': ' + markers.map(m => `${m.type}:${m.op}:${m.field}=${m.value}`).join(', ') : ' — NO MARKERS FOUND in reply'}`);

        const displayText = cleanText || (isZh() ? '(AI \u8FD4\u56DE\u4E86\u7A7A\u54CD\u5E94)' : '(AI returned an empty response)');
        appendConversation(sessionId, 'assistant', displayText);
        appendRuntimeLog(sessionId, `ai_reply -> ${(reply || '').slice(0, 120)}`, { source: 'ai' });

        // Apply any structured markers (profile updates, direction changes, profile_complete)
        if (markers.length > 0) {
            appendRuntimeLog(sessionId, `markers_detected -> ${markers.length} marker(s): ${markers.map(m => `${m.type}:${m.op}`).join(', ')}`, { source: 'knowledge' });
            await applyMarkers(sessionId, markers);
        } else {
            console.log(`[agent:marker-debug] no markers to apply — profile state unchanged`);
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

async function handleUserOption(payload = {}) {
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
    const isPresetQ = _getTemplates().some((q) => q.id === questionId);
    if (isPresetQ) {
        // Preset answers go to onboarding subtask log, keep conversation clean
        appendSubtaskLog(sessionId, 'onboarding', isZh()
            ? `预设选择：${optionLabel}`
            : `Preset selected: ${optionLabel}`);
    } else {
        appendConversation(sessionId, 'user', `[option] ${optionLabel}`);
        appendConversation(sessionId, 'assistant', isZh() ? `\u4F60\u9009\u62E9\u4E86\uFF1A${optionLabel}` : `You selected: ${optionLabel}`);
    }
    appendRuntimeLog(sessionId, `user_option -> ${questionId || 'unknown'}:${optionId}`, { source: 'user' });
    if (!state.selectedAnswers[sessionId] || typeof state.selectedAnswers[sessionId] !== 'object') {
        state.selectedAnswers[sessionId] = {};
    }
    const selectedMap = state.selectedAnswers[sessionId];
    if (questionId && isPresetQ) {
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
    await checkAndCompleteOnboarding(sessionId);
    sendSnapshot();
}

async function handleUserAnswer(payload = {}) {
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
    const isPresetQ = _getTemplates().some((q) => q.id === questionId);
    if (isPresetQ) {
        // Preset answers go to onboarding subtask log, keep conversation clean
        appendSubtaskLog(sessionId, 'onboarding', isZh()
            ? `预设输入 ${questionText}: ${answer}`
            : `Preset input ${questionText}: ${answer}`);
    } else {
        appendConversation(sessionId, 'user', `[answer] ${questionText}: ${answer}`);
        appendConversation(sessionId, 'assistant', isZh() ? '\u5DF2\u8BB0\u5F55\u8BE5\u8F93\u5165\u3002' : 'Input recorded.');
    }
    appendRuntimeLog(sessionId, `user_answer -> ${questionId}:${answer}`, { source: 'user' });

    // Check onboarding completion after answer
    await checkAndCompleteOnboarding(sessionId);
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

    const userId = state.activeUserId || 'default';

    for (const attachment of attachments) {
        try {
            // MD5 dedup: skip re-parsing if same file was uploaded before
            const fileHash = fileParser.computeHash(attachment.contentBase64);
            if (!state.resumeHashes) state.resumeHashes = {};
            if (!state.resumeHashes[userId]) state.resumeHashes[userId] = {};
            const cached = state.resumeHashes[userId][fileHash];
            if (cached && cached.sections) {
                console.log(`[agent:resume] MD5 match (${fileHash.slice(0, 8)}) — reusing cached sections from ${cached.fileName}`);
                appendRuntimeLog(sessionId, `resume_dedup -> ${attachment.name} matches cached ${cached.fileName} (${fileHash.slice(0, 8)})`, { source: 'extraction' });
                appendConversation(sessionId, 'assistant', isZh()
                    ? `♻️ 检测到相同文件 ${attachment.name}，复用之前的解析结果。`
                    : `♻️ Detected same file ${attachment.name}, reusing previous parse results.`,
                    { _system: true });
                // Apply cached sections to session + master
                state.profileSections[sessionId] = { ...(state.profileSections[sessionId] || {}), ...cached.sections };
                state.masterProfile = masterProfileClient.mergeMaster(state.masterProfile || {}, cached.sections);
                masterProfileClient.saveAllSections(userId, state.masterProfile).catch(() => {});
                scheduleSave();
                continue;
            }

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

                    // Ensure domain pack is registered before any upsert
                    await _packReady;

                    // Update in-memory profile so dashboard reflects new resume
                    state.profileSections[sessionId] = sections;

                    // Clear old profile docs before storing new ones
                    await knowledgeClient.remove({ type: 'profile', scope: 'agent:job-seek' });

                    let stored = 0;
                    for (const [subType, content] of Object.entries(sections)) {
                        const summary = sanitizeForMemory(content.split('\n')[0] || '').slice(0, 100);
                        const result = await knowledgeClient.upsert({
                            refId: `profile_${subType}`,
                            type: 'profile',
                            subType,
                            scope: 'agent:job-seek',
                            content,
                            summary,
                            source: attachment.name,
                            tags: ['resume', subType]
                        });
                        if (result?.success) stored++;
                        console.log(`[agent:knowledge] Stored profile/${subType} (${content.length} chars)`);
                    }

                    // Also store in master profile (user-scoped, persists across sessions)
                    state.masterProfile = masterProfileClient.mergeMaster(state.masterProfile || {}, sections);
                    masterProfileClient.saveAllSections(userId, state.masterProfile).catch(e =>
                        console.error('[agent:knowledge] master profile save error:', e.message));

                    // Cache MD5 hash for dedup on re-upload
                    if (!state.resumeHashes[userId]) state.resumeHashes[userId] = {};
                    state.resumeHashes[userId][fileHash] = {
                        fileName: attachment.name,
                        parsedAt: Date.now(),
                        sections
                    };

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
async function storeDirection(sessionId) {
    await _packReady;
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
        subType: 'target',
        scope: 'agent:job-seek',
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
        scope: 'agent:job-seek',
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
async function checkAndCompleteOnboarding(sessionId) {
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

    // Story 4.1: Try seeding profile from knowledgeStore
    if (!hasResume) {
        const seeded = await seedProfileFromKnowledge(sessionId);
        if (seeded) {
            // Profile loaded — skip profile collection, generate dashboard
            const profileKeys = Object.keys(state.profileSections[sessionId] || {}).filter(k => state.profileSections[sessionId][k]);
            appendConversation(sessionId, 'assistant', isZh()
                ? `我已找到你之前的档案（${profileKeys.join('、')}）。可以直接用这份档案为新目标生成简历，或者你可以上传新简历 / 通过对话修改档案。`
                : `I found your profile from a previous session (${profileKeys.join(', ')}). I can use this to generate a resume for your new target, or you can upload a new resume / modify your profile through chat.`);
            // Auto-generate dashboard
            try {
                buildIntentFile(sessionId);
                if (state.artifacts[sessionId]) {
                    state.artifacts[sessionId] = state.artifacts[sessionId].filter(a => a.type !== 'dashboard');
                }
                const dashUrl = dashboardServer.getDashboardURL(sessionId);
                console.log(`[agent] ★ Dashboard URL: ${dashUrl}`);
                appendArtifact(sessionId, {
                    id: `dashboard-${sessionId}`,
                    type: 'dashboard',
                    title: isZh() ? '求职仪表盘' : 'Job Search Dashboard',
                    url: dashUrl,
                    openUrl: true
                });
            } catch (err) {
                console.error('[agent] dashboard after seed failed:', err);
            }
            syncProfileToMem0(sessionId);
        } else {
            state.profileCollectionMode[sessionId] = true;
            appendConversation(sessionId, 'assistant', isZh()
                ? '你还没有上传简历，可以随时上传，或者通过对话告诉我你的技能和经历来构建档案。'
                : 'You haven\'t uploaded a resume yet. You can upload one any time, or tell me about your skills and experience through chat to build your profile.');
        }
    }
    appendRuntimeLog(sessionId, `onboarding_complete -> hasResume=${hasResume}`, { source: 'onboarding' });
    scheduleSave();
}

/**
 * Apply parsed markers from AI reply to state and knowledge store.
 * Handles PROFILE_SET/ADD/REMOVE, DIRECTION, and PROFILE_COMPLETE markers.
 */
async function applyMarkers(sessionId, markers) {
    if (!markers || markers.length === 0) return;
    await _packReady;

    console.log(`[agent:marker-debug] applyMarkers called with ${markers.length} marker(s) for session ${sessionId.slice(0, 8)}`);

    if (!state.profileSections[sessionId]) state.profileSections[sessionId] = {};
    const sections = state.profileSections[sessionId];
    let profileChanged = false;
    let directionChanged = false;

    // Separate profile markers from PROFILE_COMPLETE to avoid conflict
    const profileMarkers = markers.filter(m => m.type === 'profile' || m.type === 'master_profile');
    const hasProfileComplete = markers.some(m => m.type === 'profile_complete');
    const hasExplicitProfileOps = profileMarkers.length > 0;

    // Sections that should propagate additive ops to master profile
    const ADDITIVE_SECTIONS = new Set(['skills', 'certifications', 'projects', 'publications', 'languages', 'volunteering']);
    let masterChanged = false;

    for (const m of markers) {
        if (m.type === 'profile') {
            // PROFILE_* markers update session profile
            const prev = sections[m.field] || '';
            if (m.op === 'SET') {
                sections[m.field] = m.value;
            } else if (m.op === 'ADD') {
                sections[m.field] = markerParser.applyAdd(prev, m.value);
                // Propagate additive ops to master for list-like sections
                if (ADDITIVE_SECTIONS.has(m.field) && state.masterProfile) {
                    const masterPrev = state.masterProfile[m.field] || '';
                    state.masterProfile[m.field] = markerParser.applyAdd(masterPrev, m.value);
                    masterChanged = true;
                }
            } else if (m.op === 'REMOVE') {
                sections[m.field] = markerParser.applyRemove(prev, m.value);
            }
            profileChanged = true;
            console.log(`[agent:marker-debug] PROFILE_${m.op} ${m.field}: "${prev}" -> "${sections[m.field]}"`);
            appendRuntimeLog(sessionId, `marker_apply -> PROFILE_${m.op} ${m.field}="${sections[m.field]}"`, { source: 'knowledge' });
        } else if (m.type === 'master_profile') {
            // MASTER_* markers update master profile directly
            if (!state.masterProfile) state.masterProfile = {};
            const prev = state.masterProfile[m.field] || '';
            if (m.op === 'SET') {
                state.masterProfile[m.field] = m.value;
            } else if (m.op === 'ADD') {
                state.masterProfile[m.field] = markerParser.applyAdd(prev, m.value);
            } else if (m.op === 'REMOVE') {
                state.masterProfile[m.field] = markerParser.applyRemove(prev, m.value);
            }
            masterChanged = true;
            console.log(`[agent:marker-debug] MASTER_${m.op} ${m.field}: "${prev}" -> "${state.masterProfile[m.field]}"`);
            appendRuntimeLog(sessionId, `marker_apply -> MASTER_${m.op} ${m.field}="${state.masterProfile[m.field]}"`, { source: 'knowledge' });
        } else if (m.type === 'direction' || m.type === 'answer') {
            // Both DIRECTION and ANSWER markers update selectedAnswers (onboarding direction fields)
            if (!state.selectedAnswers[sessionId]) state.selectedAnswers[sessionId] = {};
            state.selectedAnswers[sessionId][m.field] = m.value;
            directionChanged = true;
            appendRuntimeLog(sessionId, `marker_apply -> ${m.type.toUpperCase()} ${m.field}="${m.value}"`, { source: 'knowledge' });
        } else if (m.type === 'profile_complete') {
            // Skip re-extraction if explicit SET/ADD/REMOVE markers are present (they're more precise)
            if (hasExplicitProfileOps) {
                appendRuntimeLog(sessionId, 'marker_apply -> PROFILE_COMPLETE skipped (explicit profile ops present)', { source: 'knowledge' });
                continue;
            }
            // Skip re-extraction if profile subtask is already done (avoid overwriting live edits)
            const subtasks = state.subtasks[sessionId] || [];
            const profileTask = subtasks.find(t => t.key === 'profile');
            if (profileTask && profileTask.status === 'done') {
                appendRuntimeLog(sessionId, 'marker_apply -> PROFILE_COMPLETE skipped (profile subtask already done)', { source: 'knowledge' });
                continue;
            }
            appendRuntimeLog(sessionId, 'marker_apply -> PROFILE_COMPLETE signal', { source: 'knowledge' });
            await extractProfileFromConversation(sessionId);
        }
    }

    // Persist profile changes to knowledge store
    if (profileChanged) {
        for (const [subType, content] of Object.entries(sections)) {
            if (!content) continue;
            knowledgeClient.upsert({
                refId: `profile_${subType}`,
                type: 'profile',
                subType,
                scope: 'agent:job-seek',
                content,
                summary: sanitizeForMemory(content.split('\n')[0] || '').slice(0, 100),
                source: 'conversation',
                tags: ['profile', subType]
            }).catch(err => {
                console.error(`[agent:marker] upsert profile_${subType} failed:`, err.message);
            });
        }
        appendSubtaskLog(sessionId, 'profile', isZh()
            ? `档案已更新：${Object.keys(sections).join('、')}`
            : `Profile updated: ${Object.keys(sections).join(', ')}`);
    }

    // Persist master profile changes to knowledge store
    if (masterChanged && state.activeUserId && state.masterProfile) {
        masterProfileClient.saveAllSections(state.activeUserId, state.masterProfile).catch(err => {
            console.error('[agent:marker] master profile save failed:', err.message);
        });
    }

    // Persist direction changes to knowledge store
    if (directionChanged) {
        const dir = state.selectedAnswers[sessionId] || {};
        knowledgeClient.upsert({
            refId: 'direction_target',
            type: 'direction',
            subType: 'target',
            scope: 'agent:job-seek',
            content: JSON.stringify(dir),
            summary: `${dir.q_job_title || ''} @ ${dir.q_location || ''}`.trim(),
            source: 'conversation',
            tags: ['direction']
        }).catch(err => {
            console.error('[agent:marker] upsert direction failed:', err.message);
        });
        // Update the preset prompt to reflect new answers
        state.prompts[sessionId] = _buildPresetPrompt(dir);
    }

    // Check onboarding completion when ANSWER markers update selectedAnswers
    if (directionChanged) {
        checkAndCompleteOnboarding(sessionId);
    }

    if (profileChanged || directionChanged) {
        // Rebuild intent file to reflect changes (dashboard is live via dashboardServer)
        try {
            buildIntentFile(sessionId);
        } catch (err) {
            console.error('[agent:marker] intent rebuild failed:', err.message);
        }
        sendSnapshot();
        scheduleSave();
    }
}

/**
 * Extract profile sections from conversation history when AI marks [PROFILE_COMPLETE].
 * Parses the conversation to build profile sections and stores in knowledge store.
 */
async function extractProfileFromConversation(sessionId) {
    await _packReady;
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

        console.log(`[agent] extractProfileFromConversation reply length: ${(reply || '').length}`);
        if (reply) {
            const sections = parseResumeSections(reply);
            const sectionKeys = Object.keys(sections);
            console.log(`[agent] extractProfileFromConversation parsed ${sectionKeys.length} sections: ${sectionKeys.join(', ')}`);
            if (sectionKeys.length === 0) {
                console.warn('[agent] extractProfileFromConversation: no sections parsed from reply');
                appendRuntimeLog(sessionId, 'profile_extraction -> 0 sections parsed, raw reply logged', { source: 'warning' });
            }
            state.profileSections[sessionId] = sections;

            // Store in knowledge store
            await knowledgeClient.remove({ type: 'profile', scope: 'agent:job-seek' });
            let stored = 0;
            for (const [subType, content] of Object.entries(sections)) {
                const result = await knowledgeClient.upsert({
                    refId: `profile_${subType}`,
                    type: 'profile',
                    subType,
                    scope: 'agent:job-seek',
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

            // Add dashboard artifact (live via dashboardServer)
            try {
                buildIntentFile(sessionId);
                if (state.artifacts[sessionId]) {
                    state.artifacts[sessionId] = state.artifacts[sessionId].filter(
                        (a) => a.type !== 'dashboard'
                    );
                }
                const dashUrl = dashboardServer.getDashboardURL(sessionId);
                console.log(`[agent] ★ Dashboard URL: ${dashUrl}`);
                appendArtifact(sessionId, {
                    id: `dashboard-${sessionId}`,
                    type: 'dashboard',
                    title: isZh() ? '求职仪表盘' : 'Job Search Dashboard',
                    url: dashUrl,
                    openUrl: true
                });
            } catch (dashErr) {
                console.error('[agent] dashboard artifact after extraction failed:', dashErr);
            }

            appendConversation(sessionId, 'assistant', isZh()
                ? `个人档案已构建完成！已存储 ${stored} 个分区（${sectionKeys.join('、')}）。你现在可以开始搜索工作了。`
                : `Profile built successfully! ${stored} sections stored (${sectionKeys.join(', ')}). You can now start searching for jobs.`);
            appendRuntimeLog(sessionId, `profile_from_conversation -> ${stored}/${sectionKeys.length} sections`, { source: 'knowledge' });
            // Story 4.2: mem0 sync handled by subtask finish handler (caller)
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
    const envCount = state.envs.length;
    const walletCount = state.wallets.length;
    // Technical context details go to onboarding subtask log, not main conversation
    const contextSummary = `provider=${providerDisplay}, env=${envCount}, wallet=${walletCount}, model=${modelDisplay}`;
    appendSubtaskLog(sessionId, 'onboarding', isZh()
        ? `上下文已更新：${contextSummary}`
        : `Context updated: ${contextSummary}`);
    appendRuntimeLog(
        sessionId,
        `session_context_updated -> mode=${runtimeContext.mode || 'unknown'}, ${contextSummary}`,
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
        // Tell frontend to auto-open preset modal (via snapshot flag)
        state._autoOpenPresetSessionId = sessionId;
    } else {
        // On subsequent Apply Model, auto-open preset if required answers are still empty
        const selectedMap = state.selectedAnswers[sessionId] || {};
        const templates = _getTemplates();
        if (!isOnboardingComplete(selectedMap, templates)) {
            state._autoOpenPresetSessionId = sessionId;
        }
    }

    sendSnapshot();
    // Clear after sending so it's only included once
    state._autoOpenPresetSessionId = '';
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
        // Start dashboard server (idempotent — only starts once)
        dashboardServer.start(() => state);
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
            case 'agent_reset_memory':
                updateLanguage(data?.payload?.language);
                resetAllMemory().catch(err => {
                    console.error('[agent] resetAllMemory error:', err);
                });
                break;
            case 'agent_reset_for_test':
                updateLanguage(data?.payload?.language);
                resetForTest().then(() => {
                    emit('agent_reset_for_test_done', { success: true });
                }).catch(err => {
                    console.error('[agent] resetForTest error:', err);
                    emit('agent_reset_for_test_done', { success: false, error: err.message });
                });
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
        dashboardServer.stop();
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
