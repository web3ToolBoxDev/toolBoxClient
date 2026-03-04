const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
let ws = null;
let taskData = null;
let terminated = false;
let heartBeatTimer = null;
let reconnectTimer = null;
let runtimeContextAnnounced = false;

const now = () => Date.now();
const genId = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const defaultSubTasks = () => ([
    { key: 'profile', status: 'running', updatedAt: now() },
    { key: 'search', status: 'pending', updatedAt: now() },
    { key: 'match', status: 'pending', updatedAt: now() },
    { key: 'resume', status: 'pending', updatedAt: now() },
    { key: 'coverLetter', status: 'pending', updatedAt: now() }
]);

const getPresetQuestionTemplates = () => {
    if (isZh()) {
        return [
            {
                id: 'q_track',
                text: '请选择你当前求职主方向',
                options: [
                    { id: 'track_frontend', label: '前端工程师' },
                    { id: 'track_backend', label: '后端工程师' },
                    { id: 'track_fullstack', label: '全栈工程师' }
                ]
            },
            {
                id: 'q_style',
                text: '请选择简历风格',
                options: [
                    { id: 'style_data', label: '数据导向型' },
                    { id: 'style_story', label: '项目叙事型' },
                    { id: 'style_compact', label: '简洁摘要型' }
                ]
            },
            {
                id: 'q_salary',
                type: 'input',
                inputType: 'number',
                text: '请输入目标薪资（K/月）',
                placeholder: '例如 30'
            },
            {
                id: 'q_upload_profile',
                type: 'upload',
                text: '请上传简历或作品集（可选）',
                buttonLabel: '上传文件',
                allowMultiple: false,
                acceptKinds: ['pdf', 'image', 'text'],
                maxSizeMB: 6
            },
            {
                id: 'q_next',
                text: '请选择下一步操作',
                options: [
                    { id: 'next_match', label: '进行岗位匹配' },
                    { id: 'next_resume', label: '生成简历草稿' },
                    { id: 'next_cover', label: '生成求职信草稿' }
                ]
            }
        ];
    }
    return [
        {
            id: 'q_track',
            text: 'Choose your primary job track',
            options: [
                { id: 'track_frontend', label: 'Frontend Engineer' },
                { id: 'track_backend', label: 'Backend Engineer' },
                { id: 'track_fullstack', label: 'Fullstack Engineer' }
            ]
        },
        {
            id: 'q_style',
            text: 'Choose resume style',
            options: [
                { id: 'style_data', label: 'Data-Oriented' },
                { id: 'style_story', label: 'Project Story' },
                { id: 'style_compact', label: 'Compact Summary' }
            ]
        },
        {
            id: 'q_salary',
            type: 'input',
            inputType: 'number',
            text: 'Input target monthly salary (K)',
            placeholder: 'e.g. 30'
        },
        {
            id: 'q_upload_profile',
            type: 'upload',
            text: 'Upload resume or portfolio (optional)',
            buttonLabel: 'Upload File',
            allowMultiple: false,
            acceptKinds: ['pdf', 'image', 'text'],
            maxSizeMB: 6
        },
        {
            id: 'q_next',
            text: 'Choose next action',
            options: [
                { id: 'next_match', label: 'Run Requirement Match' },
                { id: 'next_resume', label: 'Generate Resume Draft' },
                { id: 'next_cover', label: 'Generate Cover Letter Draft' }
            ]
        }
    ];
};

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

const buildPresetPrompt = (selectedMap = {}) => ({
    text: isZh() ? '请选择预设问题并回答' : 'Select preset questions and answer',
    attachmentPolicy: {
        maxSizeMB: 4,
        allowedKinds: ['image', 'pdf', 'sheet', 'text']
    },
    questions: getPresetQuestionTemplates().map((q) => ({
        ...q,
        ...(Array.isArray(q.options) ? { selectedOptionId: selectedMap[q.id] || '' } : {}),
        ...((q.type === 'input' || q.type === 'number' || q.type === 'date') ? { answerValue: selectedMap[q.id] || '' } : {}),
        ...(q.type === 'upload' ? { uploaded: Boolean(selectedMap[q.id]) } : {})
    }))
});

const buildAttachmentActionQuestion = (kinds = []) => {
    if (!Array.isArray(kinds) || !kinds.length) return null;
    const zh = isZh();
    const options = [];
    if (kinds.includes('pdf')) {
        options.push({ id: 'attach_extract_pdf', label: zh ? '提取PDF关键信息' : 'Extract PDF key points' });
    }
    if (kinds.includes('image')) {
        options.push({ id: 'attach_ocr_image', label: zh ? '图片OCR识别' : 'Run OCR on image' });
    }
    if (kinds.includes('sheet')) {
        options.push({ id: 'attach_map_sheet', label: zh ? '表格字段映射' : 'Map spreadsheet fields' });
    }
    if (kinds.includes('text') || kinds.includes('file')) {
        options.push({ id: 'attach_summarize', label: zh ? '总结附件内容' : 'Summarize attachments' });
    }
    if (!options.length) return null;
    return {
        id: 'q_attachment_action',
        text: zh ? '请选择附件处理方式' : 'Choose attachment processing action',
        options
    };
};

const appendAttachmentQuestionToPrompt = (sessionId, kinds = []) => {
    const base = state.prompts[sessionId] || buildPresetPrompt(state.selectedAnswers[sessionId] || {});
    const questions = Array.isArray(base.questions) ? base.questions.filter((q) => q.id !== 'q_attachment_action') : [];
    const attachmentQuestion = buildAttachmentActionQuestion(kinds);
    if (attachmentQuestion) {
        questions.push({
            ...attachmentQuestion,
            selectedOptionId: (state.selectedAnswers[sessionId] || {})[attachmentQuestion.id] || ''
        });
    }
    state.prompts[sessionId] = {
        text: base.text || (isZh() ? '请选择预设问题并回答' : 'Select preset questions and answer'),
        attachmentPolicy: base.attachmentPolicy || { maxSizeMB: 4, allowedKinds: ['image', 'pdf', 'sheet', 'text'] },
        questions
    };
};

const state = {
    taskName: 'ai_task',
    language: 'en',
    currentModel: 'gpt-4o-mini',
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
        name: String(name || '').trim() || (isZh() ? `求职方向 ${state.sessions.length + 1}` : `Job Track ${state.sessions.length + 1}`),
        updatedAt: now()
    };
    upsertSession(session);
    state.activeSessionId = session.id;
    state.conversations[session.id] = [];
    state.subtasks[session.id] = defaultSubTasks();
    state.artifacts[session.id] = [];
    state.runtimeLogs[session.id] = [];
    state.prompts[session.id] = buildPresetPrompt(selectedMap);
    state.stages[session.id] = 0;
    state.selectedAnswers[session.id] = selectedMap;
    state.runtimeContexts[session.id] = {
        ...getRuntimeContext(),
        model: state.currentModel
    };
    state.executionStates[session.id] = { paused: false, canceled: false };
    state.attachmentKinds[session.id] = [];
    appendConversation(session.id, 'assistant', isZh() ? 'AI任务已启动，请从推荐选项开始。' : 'AI task started. Please begin with a suggested option.');
    appendConversation(
        session.id,
        'assistant',
        isZh() ? '可先上传简历原始文件（可选）' : 'You can upload original resume file first (optional)',
        {
            questionType: 'upload',
            questionId: 'inline_upload_resume',
            questionText: isZh() ? '上传简历原始文件' : 'Upload original resume file',
            buttonLabel: isZh() ? '上传简历文件' : 'Upload Resume File',
            allowMultiple: false,
            acceptKinds: ['pdf', 'image', 'text'],
            maxSizeMB: 6
        }
    );
    appendRuntimeLog(session.id, isZh() ? 'Session created' : 'Session created', { source: 'system' });
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

function updateSubTasks(sessionId, updater) {
    const source = state.subtasks[sessionId] || defaultSubTasks();
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

function appendArtifact(sessionId, artifact) {
    if (!state.artifacts[sessionId]) {
        state.artifacts[sessionId] = [];
    }
    state.artifacts[sessionId].push(artifact);
    emit('agent_artifact_update', { sessionId, append: [artifact] });
    appendRuntimeLog(sessionId, `artifact -> ${artifact?.title || artifact?.type || 'artifact'}`, { source: 'artifact' });
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
                state.prompts[sessionId] = buildPresetPrompt(selectedMap);
                const kinds = Array.isArray(state.attachmentKinds[sessionId]) ? state.attachmentKinds[sessionId] : [];
                if (kinds.length) {
                    appendAttachmentQuestionToPrompt(sessionId, kinds);
                }
            });
        }
    }
}

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
    const content = `# ${title}\n\nGenerated by mock AI agent.\nSession: ${sessionId}\nType: ${type}\nTime: ${new Date().toISOString()}\n`;
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        const relativePath = path.relative(saveRoot, filePath);
        return { filePath, relativePath };
    } catch (_) {
        return { filePath: '', relativePath: '' };
    }
}

function hasApiKey() {
    if (state.apiKeyConfiguredHint === true) {
        return true;
    }
    const cfg = taskData?.taskConfig || {};
    const apiKey =
        cfg?.default?.apiKey ||
        cfg?.default?.openaiApiKey ||
        cfg?.apiKey ||
        taskData?.taskDataFromFront?.apiKey ||
        taskData?.taskDataFromFront?.openaiApiKey ||
        '';
    return Boolean(String(apiKey).trim());
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

function announceRuntimeContext() {
    if (runtimeContextAnnounced || !state.activeSessionId) return;
    const context = getRuntimeContext();
    const mode = String(context?.mode || taskData?.taskDataFromFront?.mode || 'unknown');
    const envCount = Array.isArray(context?.envIds) ? context.envIds.length : 0;
    const walletCount = Array.isArray(context?.walletIds) ? context.walletIds.length : 0;
    const model = String(context?.model || state.currentModel || 'gpt-4o-mini');
    const walletPath = context?.walletExtensionPath ? `, metamaskPath=${context.walletExtensionPath}` : '';
    appendConversation(
        state.activeSessionId,
        'assistant',
        isZh()
            ? `运行上下文已加载：mode=${mode}, env=${envCount}, wallet=${walletCount}, model=${model}${walletPath}`
            : `Runtime context loaded: mode=${mode}, env=${envCount}, wallet=${walletCount}, model=${model}${walletPath}`
    );
    appendRuntimeLog(
        state.activeSessionId,
        `runtime_context_loaded -> mode=${mode}, env=${envCount}, wallet=${walletCount}, model=${model}`,
        { source: 'context' }
    );
    runtimeContextAnnounced = true;
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

function handleUserInput(payload = {}) {
    const sessionId = payload.sessionId || state.activeSessionId;
    if (!sessionId || !state.conversations[sessionId]) {
        emit('agent_error', { code: 4001, message: 'session not found' }, payload.requestId);
        return;
    }
    if (!hasApiKey()) {
        appendConversation(sessionId, 'assistant', isZh() ? '请先在任务配置中填写 API Key。' : 'Please configure API Key in task config first.');
        return;
    }
    const execution = getExecutionState(sessionId);
    if (execution.canceled) {
        appendConversation(sessionId, 'assistant', isZh() ? '当前会话已取消，请先点击重试后继续。' : 'Current session is canceled. Please retry before continuing.');
        return;
    }
    if (execution.paused) {
        appendConversation(sessionId, 'assistant', isZh() ? '当前会话已暂停，请先恢复后继续。' : 'Current session is paused. Please resume before continuing.');
        return;
    }
    const text = String(payload.text || '').trim();
    const runtimeContext = payload.runtimeContext || state.runtimeContexts[sessionId] || {};
    const model = String(payload.model || runtimeContext?.model || state.currentModel || 'gpt-4o-mini');
    updateModel(model);
    if (!text) return;
    appendConversation(sessionId, 'user', text);
    appendRuntimeLog(sessionId, `user_input -> ${text.slice(0, 120)}`, { source: 'user' });
    appendConversation(sessionId, 'assistant', isZh() ? `收到你的输入：${text}` : `Received your input: ${text}`);
    if (runtimeContext && (runtimeContext.mode || (Array.isArray(runtimeContext.envIds) && runtimeContext.envIds.length) || (Array.isArray(runtimeContext.walletIds) && runtimeContext.walletIds.length))) {
        appendConversation(
            sessionId,
            'assistant',
            isZh()
                ? `当前会话上下文：mode=${runtimeContext.mode || 'unknown'}, env=${(runtimeContext.envIds || []).length}, wallet=${(runtimeContext.walletIds || []).length}, model=${model}`
                : `Session context: mode=${runtimeContext.mode || 'unknown'}, env=${(runtimeContext.envIds || []).length}, wallet=${(runtimeContext.walletIds || []).length}, model=${model}`
        );
    }
    appendConversation(sessionId, 'assistant', isZh() ? 'Mock AI 已处理你的输入，正在生成下一步建议。' : 'Mock AI processed your input and is preparing next suggestions.');
    appendConversation(
        sessionId,
        'assistant',
        isZh() ? '请选择执行方式：' : 'Choose execution mode:',
        {
            questionId: 'q_execute_mode',
            questionText: isZh() ? '请选择执行方式' : 'Choose execution mode',
            selectedOptionId: '',
            options: [
                { id: 'exec_now', label: isZh() ? '立即执行' : 'Run now' },
                { id: 'exec_schedule', label: isZh() ? '定时执行' : 'Schedule' }
            ]
        }
    );
}

function handleUserOption(payload = {}) {
    const sessionId = payload.sessionId || state.activeSessionId;
    if (!sessionId || !state.conversations[sessionId]) {
        emit('agent_error', { code: 4001, message: 'session not found' }, payload.requestId);
        return;
    }
    if (!hasApiKey()) {
        appendConversation(sessionId, 'assistant', isZh() ? '请先在任务配置中填写 API Key。' : 'Please configure API Key in task config first.');
        return;
    }
    const execution = getExecutionState(sessionId);
    if (execution.canceled) {
        appendConversation(sessionId, 'assistant', isZh() ? '当前会话已取消，请先点击重试后继续。' : 'Current session is canceled. Please retry before continuing.');
        return;
    }
    if (execution.paused) {
        appendConversation(sessionId, 'assistant', isZh() ? '当前会话已暂停，请先恢复后继续。' : 'Current session is paused. Please resume before continuing.');
        return;
    }
    const optionId = String(payload.optionId || '').trim();
    const optionLabel = String(payload.optionLabel || optionId || '').trim();
    const questionId = String(payload.questionId || '').trim();
    const runtimeContext = payload.runtimeContext || state.runtimeContexts[sessionId] || {};
    const model = String(payload.model || runtimeContext?.model || state.currentModel || 'gpt-4o-mini');
    updateModel(model);
    if (!optionLabel || !optionId) return;
    appendConversation(sessionId, 'user', `[option] ${optionLabel}`);
    appendRuntimeLog(sessionId, `user_option -> ${questionId || 'unknown'}:${optionId}`, { source: 'user' });
    appendConversation(sessionId, 'assistant', isZh() ? `你选择了：${optionLabel}` : `You selected: ${optionLabel}`);
    if (runtimeContext && (runtimeContext.mode || (Array.isArray(runtimeContext.envIds) && runtimeContext.envIds.length) || (Array.isArray(runtimeContext.walletIds) && runtimeContext.walletIds.length))) {
        appendConversation(
            sessionId,
            'assistant',
            isZh()
                ? `已在上下文中执行：mode=${runtimeContext.mode || 'unknown'}, model=${model}`
                : `Executed with context: mode=${runtimeContext.mode || 'unknown'}, model=${model}`
        );
    }
    if (!state.selectedAnswers[sessionId] || typeof state.selectedAnswers[sessionId] !== 'object') {
        state.selectedAnswers[sessionId] = {};
    }
    const selectedMap = state.selectedAnswers[sessionId];
    const beforeAnswered = getPresetQuestionTemplates()
        .filter((q) => q.type !== 'upload')
        .filter((q) => String(selectedMap[q.id] || '').trim().length > 0).length;
    const isPresetQuestion = getPresetQuestionTemplates().some((q) => q.id === questionId);
    if (questionId && isPresetQuestion) {
        selectedMap[questionId] = optionId;
    }
    if (questionId === 'q_execute_mode') {
        if (optionId === 'exec_now') {
            appendConversation(sessionId, 'assistant', isZh() ? '收到，已开始立即执行。' : 'Confirmed. Execution started immediately.');
            moveSubTaskForward(sessionId);
        } else if (optionId === 'exec_schedule') {
            appendConversation(sessionId, 'assistant', isZh() ? '收到，任务已加入定时队列。' : 'Confirmed. Task has been queued for scheduled execution.');
        }
        sendSnapshot();
        return;
    }
    if (questionId === 'q_attachment_action') {
        appendConversation(
            sessionId,
            'assistant',
            isZh() ? `已按附件动作执行：${optionLabel}` : `Attachment action executed: ${optionLabel}`
        );
    }

    if (payload.optionId === 'next_resume') {
        const resumeTitle = isZh() ? '简历草稿 v1' : 'Resume Draft v1';
        const fileInfo = buildArtifactFile(sessionId, 'resume', resumeTitle);
        appendArtifact(sessionId, { id: genId('resume'), type: 'resume', title: resumeTitle, ...fileInfo });
    }
    if (payload.optionId === 'next_cover') {
        const coverTitle = isZh() ? '求职信草稿 v1' : 'Cover Letter Draft v1';
        const fileInfo = buildArtifactFile(sessionId, 'cover_letter', coverTitle);
        appendArtifact(sessionId, { id: genId('cover'), type: 'cover_letter', title: coverTitle, ...fileInfo });
    }

    moveSubTaskForward(sessionId);

    const prompts = (state.prompts[sessionId]?.questions || getPresetQuestionTemplates());
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

    state.prompts[sessionId] = buildPresetPrompt(selectedMap);

    const nowAnswered = promptQuestionsForProgress.filter((q) => {
        const v = selectedMap[q.id];
        return String(v || '').trim().length > 0;
    }).length;
    if (nowAnswered > beforeAnswered && nowAnswered < promptQuestionsForProgress.length) {
        appendConversation(sessionId, 'assistant', isZh() ? '已记录，继续选择下一题。' : 'Recorded. Please continue with next question.');
        sendSnapshot();
        return;
    }

    const summary = selectedLabels.join(' / ');
    if (summary && nowAnswered === promptQuestionsForProgress.length) {
        appendConversation(sessionId, 'assistant', isZh() ? `你的已选路径：${summary}` : `Your selected path: ${summary}`);
    }
    if (nowAnswered === promptQuestionsForProgress.length) {
        appendConversation(sessionId, 'assistant', isZh() ? '当前阶段已完成，请在右侧产物区查看简历/求职信草稿。' : 'Current stage is completed. Please check generated artifacts on the right side.');
    }
    sendSnapshot();
}

function handleUserAnswer(payload = {}) {
    const sessionId = payload.sessionId || state.activeSessionId;
    if (!sessionId || !state.conversations[sessionId]) {
        emit('agent_error', { code: 4001, message: 'session not found' }, payload.requestId);
        return;
    }
    if (!hasApiKey()) {
        appendConversation(sessionId, 'assistant', isZh() ? '请先在任务配置中填写 API Key。' : 'Please configure API Key in task config first.');
        return;
    }
    const execution = getExecutionState(sessionId);
    if (execution.canceled) {
        appendConversation(sessionId, 'assistant', isZh() ? '当前会话已取消，请先点击重试后继续。' : 'Current session is canceled. Please retry before continuing.');
        return;
    }
    if (execution.paused) {
        appendConversation(sessionId, 'assistant', isZh() ? '当前会话已暂停，请先恢复后继续。' : 'Current session is paused. Please resume before continuing.');
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
    state.prompts[sessionId] = buildPresetPrompt(state.selectedAnswers[sessionId]);
    appendConversation(sessionId, 'user', `[answer] ${questionText}: ${answer}`);
    appendRuntimeLog(sessionId, `user_answer -> ${questionId}:${answer}`, { source: 'user' });
    appendConversation(sessionId, 'assistant', isZh() ? '已记录该输入。' : 'Input recorded.');

    const prompts = getPresetQuestionTemplates().filter((q) => q.type !== 'upload');
    const allAnswered = prompts.every((q) => {
        const v = state.selectedAnswers[sessionId][q.id];
        return String(v || '').trim().length > 0;
    });
    if (allAnswered) {
        appendConversation(sessionId, 'assistant', isZh() ? '已完成全部预设问题。' : 'All preset questions are completed.');
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
        appendConversation(sessionId, 'assistant', isZh() ? '当前会话已取消，请先点击重试后继续。' : 'Current session is canceled. Please retry before continuing.');
        return;
    }
    if (execution.paused) {
        appendConversation(sessionId, 'assistant', isZh() ? '当前会话已暂停，请先恢复后继续。' : 'Current session is paused. Please resume before continuing.');
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
                ? `[attachment] 已上传 ${attachments.length} 个附件：${preview}`
                : `[attachment] Uploaded ${attachments.length} attachment(s): ${preview}`,
            { attachments: attachments.slice(0, 6) }
        );
        appendConversation(
            sessionId,
            'assistant',
            isZh()
                ? `已收到附件 ${attachments.length} 个：${preview}`
                : `Received ${attachments.length} attachment(s): ${preview}`,
            { attachments: attachments.slice(0, 6) }
        );
        appendRuntimeLog(sessionId, `attachment_received -> ${attachments.length}`, { source: 'attachment' });
        if (questionId) {
            if (!state.selectedAnswers[sessionId] || typeof state.selectedAnswers[sessionId] !== 'object') {
                state.selectedAnswers[sessionId] = {};
            }
            state.selectedAnswers[sessionId][questionId] = 'uploaded';
            state.prompts[sessionId] = buildPresetPrompt(state.selectedAnswers[sessionId]);
            appendConversation(
                sessionId,
                'assistant',
                isZh() ? `已完成上传题：${questionId}` : `Upload question completed: ${questionId}`
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
                    ? (isZh() ? `类型不支持(${item.kind || 'unknown'})` : `unsupported type(${item.kind || 'unknown'})`)
                    : (isZh() ? '文件过大' : 'file too large');
                return `${item.name || 'file'}: ${reason}`;
            })
            .join(', ');
        appendConversation(
            sessionId,
            'assistant',
            isZh()
                ? `[attachment] 以下附件被拒绝：${reasonText}`
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
                ? '检测到 PDF，可继续让我提取简历要点/岗位JD要求。'
                : 'PDF detected. I can extract resume highlights / job JD requirements next.'
        );
    }
    if (uniqueKinds.includes('image')) {
        appendConversation(
            sessionId,
            'assistant',
            isZh()
                ? '检测到图片，可继续让我做 OCR 或结构化解析。'
                : 'Image detected. I can run OCR or structured parsing next.'
        );
    }
    if (uniqueKinds.includes('sheet')) {
        appendConversation(
            sessionId,
            'assistant',
            isZh()
                ? '检测到表格，可继续让我做字段映射和筛选建议。'
                : 'Spreadsheet detected. I can provide field mapping and filtering suggestions.'
        );
    }
    appendConversation(
        sessionId,
        'assistant',
        isZh()
            ? '你可以继续输入处理要求，或从预设问题中选择下一步。'
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
        appendConversation(sessionId, 'assistant', isZh() ? '任务已暂停。' : 'Task paused.');
        sendSnapshot();
        return;
    }
    if (action === 'resume') {
        setExecutionState(sessionId, { paused: false, canceled: false });
        appendConversation(sessionId, 'assistant', isZh() ? '任务已恢复。' : 'Task resumed.');
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
        appendConversation(sessionId, 'assistant', isZh() ? '任务已取消。' : 'Task canceled.');
        sendSnapshot();
        return;
    }
    if (action === 'retry') {
        state.subtasks[sessionId] = defaultSubTasks();
        state.selectedAnswers[sessionId] = {};
        state.prompts[sessionId] = buildPresetPrompt({});
        state.executionStates[sessionId] = { paused: false, canceled: false };
        state.attachmentKinds[sessionId] = [];
        emit('agent_subtask_update', { sessionId, items: state.subtasks[sessionId] });
        emit('agent_execution_update', { sessionId, state: state.executionStates[sessionId] });
        appendRuntimeLog(sessionId, 'execution -> retry', { source: 'execution' });
        appendConversation(sessionId, 'assistant', isZh() ? '任务已重置并重新开始。' : 'Task reset and restarted.');
        sendSnapshot();
    }
}

function startHeartBeat() {
    if (heartBeatTimer) clearInterval(heartBeatTimer);
    heartBeatTimer = setInterval(() => {
        send({ type: 'heart_beat' });
    }, 5000);
}

function handleSessionContextUpdate(payload = {}) {
    const sessionId = payload.sessionId || state.activeSessionId;
    if (!sessionId || !state.conversations[sessionId]) {
        emit('agent_error', { code: 4001, message: 'session not found' }, payload.requestId);
        return;
    }
    const runtimeContext = (payload.runtimeContext && typeof payload.runtimeContext === 'object') ? payload.runtimeContext : {};
    updateModel(payload?.model || runtimeContext?.model);
    state.runtimeContexts[sessionId] = runtimeContext;
    appendConversation(
        sessionId,
        'assistant',
        isZh()
            ? `会话上下文已更新：mode=${runtimeContext.mode || 'unknown'}, env=${(runtimeContext.envIds || []).length}, wallet=${(runtimeContext.walletIds || []).length}, model=${runtimeContext.model || state.currentModel}`
            : `Session context updated: mode=${runtimeContext.mode || 'unknown'}, env=${(runtimeContext.envIds || []).length}, wallet=${(runtimeContext.walletIds || []).length}, model=${runtimeContext.model || state.currentModel}`
    );
    appendRuntimeLog(
        sessionId,
        `session_context_updated -> mode=${runtimeContext.mode || 'unknown'}, env=${(runtimeContext.envIds || []).length}, wallet=${(runtimeContext.walletIds || []).length}, model=${runtimeContext.model || state.currentModel}`,
        { source: 'context' }
    );
    sendSnapshot();
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

