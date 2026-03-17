import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import APIManager from '../../utils/api';
import WebSocketManager from '../../utils/webSocket';
import AITaskPanel from '../../components/taskOffcanvas/AITaskPanel';
import { resolveTaskDisplayName } from '../../utils/taskI18n';
import { PROVIDER_MODEL_MAP, getModelsForProvider, getSubProviders } from '../../config/providerModels';
import './index.scss';

function AgentWorkspace() {
    const { t, i18n } = useTranslation();
    const { taskName: rawTaskName } = useParams();
    const taskName = decodeURIComponent(rawTaskName || '');
    const location = useLocation();
    const navigate = useNavigate();
    const apiRef = useRef(APIManager.getInstance());
    const wsRef = useRef(WebSocketManager.getInstance());

    const [newSessionName, setNewSessionName] = useState('');
    const [sessions, setSessions] = useState([]);
    const [activeSessionId, setActiveSessionId] = useState('');
    const [conversations, setConversations] = useState({});
    const [subtasks, setSubtasks] = useState({});
    const [subtaskLogs, setSubtaskLogs] = useState({});
    const [artifacts, setArtifacts] = useState({});
    const [runtimeLogs, setRuntimeLogs] = useState({});
    const [prompts, setPrompts] = useState({});
    const [executionStates, setExecutionStates] = useState({});
    const [autoOpenPresetSession, setAutoOpenPresetSession] = useState('');
    const [apiKeyConfigured, setApiKeyConfigured] = useState(true);
    const [envList, setEnvList] = useState([]);
    const [walletList, setWalletList] = useState([]);
    const [sessionRuntimeContexts, setSessionRuntimeContexts] = useState({});
    const [bindMode, setBindMode] = useState('env');
    const [selectedEnvId, setSelectedEnvId] = useState('');
    const [selectedWalletId, setSelectedWalletId] = useState('');
    const [isTaskRunning, setIsTaskRunning] = useState(true);
    const [dataSavePath, setDataSavePath] = useState('');
    const [availableModels, setAvailableModels] = useState([]);
    const [defaultModel, setDefaultModel] = useState('');
    const [selectedModel, setSelectedModel] = useState('');
    const [selectedProvider, setSelectedProvider] = useState('');
    const [selectedSubProvider, setSelectedSubProvider] = useState('');
    const [runtimeApiKey, setRuntimeApiKey] = useState('');
    const [runtimeExpanded, setRuntimeExpanded] = useState(false);
    const [taskMeta, setTaskMeta] = useState(() => ({
        taskName,
        taskKey: location?.state?.taskKey || '',
        taskI18n: location?.state?.taskI18n || {},
        taskDisplayName: location?.state?.taskDisplayName || ''
    }));
    const initialRuntimeContext = useMemo(() => {
        const ctx = location?.state?.runtimeContext;
        if (!ctx || typeof ctx !== 'object') {
            return null;
        }
        return ctx;
    }, [location?.state?.runtimeContext]);

    const [filteredModels, setFilteredModels] = useState([]);

    const fetchProviderModels = useCallback(async (provider, subProvider, apiKey) => {
        // Immediately show default models as placeholder
        const defaults = getModelsForProvider(provider, subProvider);
        setFilteredModels(defaults);
        if (!provider) return defaults;
        try {
            const result = await apiRef.current.getProviderModels(provider, subProvider, apiKey || '');
            if (result?.success && Array.isArray(result.models) && result.models.length) {
                setFilteredModels(result.models);
                // If current selectedModel is not in the new list, select the first
                setSelectedModel((prev) => {
                    const inList = result.models.some((m) => m.value === prev);
                    return inList ? prev : (result.models[0]?.value || '');
                });
                return result.models;
            }
        } catch { /* fall back to defaults */ }
        return defaults;
    }, []);

    useEffect(() => {
        if (!selectedProvider) {
            setFilteredModels([]);
            return;
        }
        // For api-key provider, only fetch when subProvider is also selected
        if (selectedProvider === 'api-key' && !selectedSubProvider) {
            setFilteredModels([]);
            return;
        }
        fetchProviderModels(selectedProvider, selectedSubProvider, runtimeApiKey);
    }, [selectedProvider, selectedSubProvider, fetchProviderModels]);

    // Debounced refetch when runtimeApiKey changes (api-key provider only)
    useEffect(() => {
        if (selectedProvider !== 'api-key' || !selectedSubProvider || !runtimeApiKey) return;
        const timer = setTimeout(() => {
            fetchProviderModels(selectedProvider, selectedSubProvider, runtimeApiKey);
        }, 600);
        return () => clearTimeout(timer);
    }, [runtimeApiKey, selectedProvider, selectedSubProvider, fetchProviderModels]);

    const providerOptions = useMemo(() => {
        const lang = i18n?.resolvedLanguage || i18n?.language || 'en';
        const isZh = lang.startsWith('zh');
        return Object.entries(PROVIDER_MODEL_MAP).map(([key, val]) => ({
            value: key,
            label: isZh && val.labelZh ? val.labelZh : val.label
        }));
    }, [i18n?.resolvedLanguage, i18n?.language]);

    const subProviderOptions = useMemo(() => {
        return getSubProviders(selectedProvider);
    }, [selectedProvider]);

    const applySnapshot = useCallback((data = {}) => {
        const nextSessions = Array.isArray(data.sessions) ? data.sessions : [];
        setSessions(nextSessions);
        const nextActiveId = data.activeSessionId || nextSessions[0]?.id || '';
        setActiveSessionId(nextActiveId);
        setConversations(data.conversations || {});
        setSubtasks(data.subtasks || {});
        setSubtaskLogs(data.subtaskLogs || {});
        setArtifacts(data.artifacts || {});
        setRuntimeLogs(data.runtimeLogs || {});
        setPrompts(data.prompts || {});
        setExecutionStates(data.executionStates || {});
        if (data.runtimeContexts && typeof data.runtimeContexts === 'object') {
            setSessionRuntimeContexts(data.runtimeContexts);
            // Form fields (provider, model, env, wallet) are restored by the
            // useEffect on activeSessionId — no need to set them here.
            // Setting them here would overwrite the user's in-progress dropdown
            // selections whenever a snapshot arrives (e.g., after Apply Model).
        }
        // Auto-open preset modal if flagged in snapshot (e.g., after Apply Model)
        if (data.autoOpenPresetSessionId) {
            setAutoOpenPresetSession(data.autoOpenPresetSessionId);
        }
    }, []);

    const handleTaskStopped = useCallback((reason = 'AI task stopped') => {
        setIsTaskRunning(false);
        alert(reason);
        navigate('/taskManage');
    }, [navigate]);

    const processIncomingMessages = useCallback((info) => {
        if (!info || info.taskName !== taskName) return;
        switch (info.type) {
            case 'agent_state_snapshot':
                applySnapshot(info.data || {});
                break;
            case 'agent_session_list': {
                const nextSessions = Array.isArray(info?.data?.sessions) ? info.data.sessions : [];
                setSessions(nextSessions);
                setActiveSessionId(info?.data?.activeSessionId || nextSessions[0]?.id || '');
                break;
            }
            case 'agent_conversation_update': {
                const sessionId = info?.data?.sessionId;
                if (!sessionId) break;
                const append = Array.isArray(info?.data?.append) ? info.data.append : [];
                const prompt = info?.data?.prompt;
                setConversations((prev) => ({ ...prev, [sessionId]: [...(prev[sessionId] || []), ...append] }));
                if (prompt) {
                    setPrompts((prev) => ({ ...prev, [sessionId]: prompt }));
                }
                break;
            }
            case 'agent_subtask_update': {
                const sessionId = info?.data?.sessionId;
                if (!sessionId) break;
                const items = Array.isArray(info?.data?.items) ? info.data.items : [];
                setSubtasks((prev) => ({ ...prev, [sessionId]: items }));
                break;
            }
            case 'agent_artifact_update': {
                const sessionId = info?.data?.sessionId;
                if (!sessionId) break;
                const append = Array.isArray(info?.data?.append) ? info.data.append : [];
                setArtifacts((prev) => ({ ...prev, [sessionId]: [...(prev[sessionId] || []), ...append] }));
                break;
            }
            case 'agent_artifact_replace': {
                const sessionId = info?.data?.sessionId;
                if (!sessionId) break;
                const list = Array.isArray(info?.data?.artifacts) ? info.data.artifacts : [];
                setArtifacts((prev) => ({ ...prev, [sessionId]: list }));
                break;
            }
            case 'agent_runtime_log_update': {
                const sessionId = info?.data?.sessionId;
                if (!sessionId) break;
                const append = Array.isArray(info?.data?.append) ? info.data.append : [];
                if (!append.length) break;
                setRuntimeLogs((prev) => ({ ...prev, [sessionId]: [...(prev[sessionId] || []), ...append] }));
                break;
            }
            case 'agent_execution_update': {
                const sessionId = info?.data?.sessionId;
                if (!sessionId) break;
                const state = info?.data?.state || {};
                setExecutionStates((prev) => ({ ...prev, [sessionId]: state }));
                break;
            }
            case 'agent_auto_open_preset': {
                // Legacy: still support separate message for backwards compatibility
                const sid = info?.data?.sessionId;
                if (sid) setAutoOpenPresetSession(sid);
                break;
            }
            case 'agent_error':
                alert(info?.data?.message || 'Agent Error');
                break;
            case 'task_started':
                if (info.taskName === taskName) {
                    setIsTaskRunning(true);
                }
                break;
            case 'task_completed':
                if (info.taskName === taskName) {
                    handleTaskStopped(info?.message || 'AI task stopped');
                }
                break;
            case 'task_error':
                if (info.taskName === taskName) {
                    handleTaskStopped(info?.message || 'AI task error');
                }
                break;
            case 'terminate_process':
                if (info.taskName === taskName) {
                    handleTaskStopped('AI task terminated');
                }
                break;
            default:
                break;
        }
    }, [applySnapshot, handleTaskStopped, taskName]);

    const refreshApiKeyConfigured = useCallback(async () => {
        try {
            const cfgRes = await apiRef.current.getConfigInfo(taskName);
            const cfg = cfgRes?.config || {};
            const apiKey = cfg?.default?.apiKey || cfg?.default?.openaiApiKey || cfg?.apiKey || '';
            const configured = Boolean(String(apiKey).trim());
            setApiKeyConfigured(configured);
            return configured;
        } catch (error) {
            return apiKeyConfigured;
        }
    }, [apiKeyConfigured, taskName]);

    const sendAgent = useCallback((type, payload = {}) => {
        const language = i18n?.resolvedLanguage || i18n?.language || 'en';
        wsRef.current.sendMessage(JSON.stringify({
            type,
            taskName,
            payload: {
                ...(payload && typeof payload === 'object' ? payload : {}),
                language,
                apiKeyConfigured: typeof payload?.apiKeyConfigured === 'boolean' ? payload.apiKeyConfigured : apiKeyConfigured,
                model: selectedModel || '',
                provider: selectedProvider || '',
                subProvider: selectedSubProvider || ''
            }
        }));
    }, [apiKeyConfigured, i18n?.language, i18n?.resolvedLanguage, selectedModel, selectedProvider, selectedSubProvider, taskName]);

    useEffect(() => {
        let mounted = true;
        const closeListener = () => {};
        const init = async () => {
            wsRef.current.addMessageListener(processIncomingMessages);
            wsRef.current.addCloseListener(closeListener);
            await wsRef.current.connect(processIncomingMessages, closeListener);
            if (!mounted) return;
            const startPayload = initialRuntimeContext
                ? { mode: 'ai', runtimeContext: initialRuntimeContext, _suppressRunningAlert: true }
                : { mode: 'ai', _suppressRunningAlert: true };
            const startRes = await apiRef.current.execTask(taskName, startPayload);
            if (startRes?.success === false && startRes?.code !== 1003) {
                alert(startRes?.message || t('agentWorkspace.startFailed', 'Failed to start AI task'));
                setIsTaskRunning(false);
            } else {
                setIsTaskRunning(true);
            }
            const cfgRes = await apiRef.current.getConfigInfo(taskName);
            const cfg = cfgRes?.config || {};
            const apiKey = cfg?.default?.apiKey || cfg?.default?.openaiApiKey || cfg?.apiKey || '';
            const configured = Boolean(String(apiKey).trim());
            setApiKeyConfigured(configured);
            const rawModels = cfg?.default?.availableModels || cfg?.availableModels || cfg?.models || [];
            const normalizedModels = (Array.isArray(rawModels) ? rawModels : [])
                .map((item) => {
                    if (typeof item === 'string') {
                        const v = String(item).trim();
                        if (!v) return null;
                        return { value: v, label: v };
                    }
                    if (item && typeof item === 'object') {
                        const v = String(item.value || item.id || '').trim();
                        if (!v) return null;
                        return { value: v, label: String(item.label || item.name || v) };
                    }
                    return null;
                })
                .filter(Boolean);
            const configuredModel = String(cfg?.default?.model || cfg?.model || '').trim();
            const fallbackModel = configuredModel || normalizedModels[0]?.value || 'default';
            const nextModels = normalizedModels.length
                ? normalizedModels
                : [{ value: fallbackModel, label: fallbackModel }];
            setAvailableModels(nextModels);
            setDefaultModel(fallbackModel);
            setSelectedModel((prev) => prev || fallbackModel);
            const [walletsRes, envRes] = await Promise.all([
                Promise.resolve(apiRef.current?.getAllWallets ? apiRef.current.getAllWallets() : []).catch(() => []),
                Promise.resolve(apiRef.current?.getFingerPrints ? apiRef.current.getFingerPrints() : { success: false, data: {} }).catch(() => ({ success: false, data: {} }))
            ]);
            setWalletList(Array.isArray(walletsRes) ? walletsRes : []);
            const envsObj = (envRes && envRes.success && envRes.data && typeof envRes.data === 'object') ? envRes.data : {};
            setEnvList(Object.values(envsObj));
            const [defaultTasksRes, customTasksRes] = await Promise.all([
                Promise.resolve(apiRef.current?.getAllTasks ? apiRef.current.getAllTasks(true) : []).catch(() => []),
                Promise.resolve(apiRef.current?.getAllTasks ? apiRef.current.getAllTasks(false) : []).catch(() => [])
            ]);
            const mergedTasks = [
                ...(Array.isArray(defaultTasksRes) ? defaultTasksRes : []),
                ...(Array.isArray(customTasksRes) ? customTasksRes : [])
            ];
            const currentTask = mergedTasks.find((item) => item?.taskName === taskName);
            if (currentTask) {
                setTaskMeta((prev) => ({
                    taskName: currentTask.taskName || prev.taskName || taskName,
                    taskKey: currentTask.taskKey || prev.taskKey || '',
                    taskI18n: currentTask.taskI18n || prev.taskI18n || {},
                    taskDisplayName: resolveTaskDisplayName(currentTask, {
                        language: i18n?.resolvedLanguage || i18n?.language || 'en'
                    }) || prev.taskDisplayName || taskName
                }));
            }
            const savePathRes = await Promise.resolve(apiRef.current?.getSavePath ? apiRef.current.getSavePath() : {}).catch(() => ({}));
            const savePath = savePathRes?.path || '';
            if (savePath) {
                setDataSavePath(savePath);
            }
            sendAgent('agent_init', { language: i18n?.language || 'en', apiKeyConfigured: configured });
        };
        init();
        return () => {
            mounted = false;
            wsRef.current.removeMessageListener(processIncomingMessages);
            wsRef.current.removeCloseListener(closeListener);
        };
    }, [i18n?.language, initialRuntimeContext, processIncomingMessages, sendAgent, t, taskName]);

    const activeSession = useMemo(
        () => sessions.find((item) => item.id === activeSessionId) || null,
        [activeSessionId, sessions]
    );
    const activeRuntimeContext = useMemo(
        () => sessionRuntimeContexts[activeSessionId] || null,
        [activeSessionId, sessionRuntimeContexts]
    );
    const activeExecutionState = useMemo(
        () => executionStates[activeSessionId] || { paused: false, canceled: false },
        [activeSessionId, executionStates]
    );
    const executionStateLabel = useMemo(() => {
        if (activeExecutionState.canceled) {
            return t('agentWorkspace.stateCanceled', 'Canceled');
        }
        if (!activeExecutionState.started && activeExecutionState.paused) {
            return t('agentWorkspace.stateNotStarted', 'Not Started');
        }
        if (activeExecutionState.paused) {
            return t('agentWorkspace.statePaused', 'Paused');
        }
        return t('agentWorkspace.stateRunning', 'Running');
    }, [activeExecutionState.canceled, activeExecutionState.paused, activeExecutionState.started, t]);
    const runtimeSummaryText = useMemo(() => {
        const bindText = activeRuntimeContext
            ? (activeRuntimeContext.mode === 'wallet'
                ? t('agentWorkspace.bindWallet', 'Wallet')
                : t('agentWorkspace.bindEnv', 'Environment'))
            : t('agentWorkspace.unbound', 'Unbound');
        const providerKey = activeRuntimeContext?.provider || selectedProvider || '';
        const providerLabel = PROVIDER_MODEL_MAP[providerKey]?.label || providerKey || '-';
        const modelText = activeRuntimeContext?.model || selectedModel || defaultModel || '-';
        return `${t('agentWorkspace.current', 'Current')}: ${bindText} | ${t('agentWorkspace.provider', 'Provider')}: ${providerLabel} | ${t('agentWorkspace.model', 'Model')}: ${modelText} | ${t('agentWorkspace.executionState', 'Execution')}: ${executionStateLabel}`;
    }, [activeRuntimeContext, defaultModel, executionStateLabel, selectedModel, selectedProvider, t]);
    const workspaceTitle = useMemo(() => {
        const localized = resolveTaskDisplayName(taskMeta, {
            language: i18n?.resolvedLanguage || i18n?.language || 'en'
        });
        return localized || taskMeta?.taskDisplayName || taskName || 'AI Workspace';
    }, [i18n?.language, i18n?.resolvedLanguage, taskMeta, taskName]);

    // Restore UI selections when switching sessions (NOT when context updates within same session)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!activeSessionId) {
            setSelectedEnvId('');
            setSelectedWalletId('');
            return;
        }
        const ctx = sessionRuntimeContexts[activeSessionId] || {};
        if (ctx.mode === 'wallet') {
            setBindMode('wallet');
            setSelectedWalletId(Array.isArray(ctx.walletIds) ? (ctx.walletIds[0] || '') : '');
            setSelectedEnvId(Array.isArray(ctx.envIds) ? (ctx.envIds[0] || '') : '');
        } else {
            setBindMode('env');
            setSelectedEnvId(Array.isArray(ctx.envIds) ? (ctx.envIds[0] || '') : '');
            setSelectedWalletId(Array.isArray(ctx.walletIds) ? (ctx.walletIds[0] || '') : '');
        }
        // Always restore model/provider/subProvider from session context.
        // Reset to empty if the session has no applied model — prevents leaking from other sessions.
        setSelectedProvider(ctx.provider || '');
        setSelectedSubProvider(ctx.subProvider || '');
        setSelectedModel(ctx.model ? String(ctx.model).trim() : '');
        setRuntimeApiKey(ctx.apiKey || '');
    }, [activeSessionId]);

    const handleCreateSession = () => {
        if (!isTaskRunning) return;
        sendAgent('agent_session_create', { name: String(newSessionName || '').trim(), language: i18n?.language || 'en' });
        setNewSessionName('');
    };

    const handleDeleteSession = (sessionId) => {
        if (!isTaskRunning) return;
        sendAgent('agent_session_delete', { sessionId });
    };

    const handleResetAllMemory = () => {
        if (!isTaskRunning) return;
        if (!window.confirm(t('agentWorkspace.confirmResetMemory', 'This will clear ALL memory (knowledge store, mem0, profiles, intent files). Continue?'))) return;
        sendAgent('agent_reset_memory', {});
    };

    const handleSwitchSession = (sessionId) => {
        setActiveSessionId(sessionId);
        sendAgent('agent_session_switch', { sessionId });
    };

    const handleSendMessage = async (message) => {
        if (!activeSessionId || !isTaskRunning) return;
        const latestConfigured = await refreshApiKeyConfigured();
        sendAgent('agent_user_input', {
            sessionId: activeSessionId,
            text: message,
            apiKeyConfigured: latestConfigured,
            runtimeContext: sessionRuntimeContexts[activeSessionId] || null
        });
    };

    const handleSelectOption = async (option) => {
        if (!activeSessionId || !isTaskRunning) return;
        const latestConfigured = await refreshApiKeyConfigured();
        const questionId = option?.questionId;
        if (questionId) {
            setConversations((prev) => {
                const list = Array.isArray(prev[activeSessionId]) ? prev[activeSessionId] : [];
                const nextList = list.map((msg) => {
                    if ((msg?.questionId || msg?.id) !== questionId) return msg;
                    return {
                        ...msg,
                        selectedOptionId: option?.id
                    };
                });
                return { ...prev, [activeSessionId]: nextList };
            });
        }
        sendAgent('agent_user_option', {
            sessionId: activeSessionId,
            optionId: option?.id,
            optionLabel: option?.label,
            questionId,
            questionText: option?.questionText,
            apiKeyConfigured: latestConfigured,
            runtimeContext: sessionRuntimeContexts[activeSessionId] || null
        });
    };

    const handleSubmitAnswer = async (answerPayload) => {
        if (!activeSessionId || !isTaskRunning) return;
        const latestConfigured = await refreshApiKeyConfigured();
        sendAgent('agent_user_answer', {
            sessionId: activeSessionId,
            questionId: answerPayload?.questionId,
            questionText: answerPayload?.questionText,
            answer: answerPayload?.answer,
            apiKeyConfigured: latestConfigured,
            runtimeContext: sessionRuntimeContexts[activeSessionId] || null
        });
    };

    const handleSendAttachments = async (attachmentPayload = []) => {
        if (!activeSessionId || !isTaskRunning) return;
        const latestConfigured = await refreshApiKeyConfigured();
        const attachments = Array.isArray(attachmentPayload)
            ? attachmentPayload
            : (Array.isArray(attachmentPayload?.attachments) ? attachmentPayload.attachments : []);
        const rejected = Array.isArray(attachmentPayload?.rejected) ? attachmentPayload.rejected : [];
        const questionId = attachmentPayload?.questionId || '';
        const questionText = attachmentPayload?.questionText || '';
        const normalized = attachments.filter((item) => item?.contentBase64);
        if (!normalized.length && !rejected.length) return;
        sendAgent('agent_user_attachment', {
            sessionId: activeSessionId,
            attachments: normalized,
            rejected,
            questionId,
            questionText,
            apiKeyConfigured: latestConfigured,
            runtimeContext: sessionRuntimeContexts[activeSessionId] || null
        });
    };

    const handleBindSessionContext = () => {
        if (!activeSessionId || !isTaskRunning) return;
        let nextContext = null;
        if (bindMode === 'env') {
            if (!selectedEnvId) {
                alert(t('agentWorkspace.selectEnvAlert', 'Please select an environment'));
                return;
            }
            const selectedEnv = envList.find((e) => (e.id || e._id || e.name) === selectedEnvId);
            nextContext = {
                mode: 'env',
                envIds: [selectedEnvId],
                walletIds: [],
                envs: selectedEnv ? [selectedEnv] : [],
                wallets: [],
                model: selectedModel || defaultModel || ''
            };
        } else {
            if (!selectedWalletId) {
                alert(t('agentWorkspace.selectWalletAlert', 'Please select a wallet'));
                return;
            }
            const wallet = walletList.find((item) => item.id === selectedWalletId);
            const boundEnv = wallet?.bindEnvId ? envList.find((e) => (e.id || e._id || e.name) === wallet.bindEnvId) : null;
            nextContext = {
                mode: 'wallet',
                walletIds: [selectedWalletId],
                envIds: wallet?.bindEnvId ? [wallet.bindEnvId] : [],
                wallets: wallet ? [wallet] : [],
                envs: boundEnv ? [boundEnv] : [],
                model: selectedModel || defaultModel || ''
            };
        }
        setSessionRuntimeContexts((prev) => ({ ...prev, [activeSessionId]: nextContext }));
        sendAgent('agent_session_context_update', { sessionId: activeSessionId, runtimeContext: nextContext });
    };

    const handleApplyModel = async () => {
        if (!activeSessionId || !isTaskRunning) return;
        // Re-fetch models with apiKey if provider is api-key (user may have just entered it)
        if (selectedProvider === 'api-key' && runtimeApiKey && selectedSubProvider) {
            await fetchProviderModels(selectedProvider, selectedSubProvider, runtimeApiKey);
        }
        const current = sessionRuntimeContexts[activeSessionId] || { mode: 'ai', envIds: [], walletIds: [] };
        const nextContext = {
            ...current,
            mode: current.mode || 'ai',
            envIds: Array.isArray(current.envIds) ? current.envIds : [],
            walletIds: Array.isArray(current.walletIds) ? current.walletIds : [],
            model: selectedModel || defaultModel || availableModels[0]?.value || '',
            provider: selectedProvider || '',
            subProvider: selectedSubProvider || '',
            ...(selectedProvider === 'api-key' && runtimeApiKey ? { apiKey: runtimeApiKey } : {})
        };
        setSessionRuntimeContexts((prev) => ({ ...prev, [activeSessionId]: nextContext }));
        sendAgent('agent_session_context_update', { sessionId: activeSessionId, runtimeContext: nextContext });
    };

    const handleExecutionControl = (action) => {
        if (!activeSessionId || !isTaskRunning) return;
        sendAgent('agent_execution_control', { sessionId: activeSessionId, action });
    };

    const handleSubtaskAction = useCallback((subtaskKey, action) => {
        if (!activeSessionId || !isTaskRunning) return;
        sendAgent('agent_subtask_action', { sessionId: activeSessionId, subtaskKey, action });
    }, [activeSessionId, isTaskRunning, sendAgent]);

    const handleOpenArtifact = useCallback(async (artifact) => {
        const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null;

        // URL-based artifacts (e.g. live dashboard) — open in browser
        if (artifact?.url || artifact?.openUrl) {
            const url = artifact.url;
            if (electronAPI?.openLink) {
                electronAPI.openLink(url);
            } else {
                window.open(url, '_blank');
            }
            return;
        }

        if (!electronAPI?.revealInFolder) {
            alert('仅桌面端支持打开产物文件');
            return;
        }
        const filePath =
            artifact?.filePath ||
            artifact?.path ||
            artifact?.relativePath ||
            artifact?.filename ||
            artifact?.fileName ||
            '';
        const savePathFromContext =
            dataSavePath ||
            initialRuntimeContext?.savePath ||
            '';
        const payload = {
            filePath,
            basePath: savePathFromContext,
            fallbackOpenPath: savePathFromContext,
            openFile: Boolean(artifact?.openFile)
        };
        const result = await electronAPI.revealInFolder(payload);
        if (!result?.success) {
            alert(result?.message || '无法打开产物路径');
        }
    }, [dataSavePath, initialRuntimeContext, t]);

    return (
        <div className="agent-workspace-page">
            <div className="agent-workspace-header">
                <Button variant="outline-light" size="sm" onClick={() => navigate('/taskManage')}>
                    Back
                </Button>
                <h3>{workspaceTitle}</h3>
            </div>
            <div className="agent-workspace-main">
                <aside className="agent-session-panel">
                    <div className="agent-session-toolbar">
                        <Form.Control
                            value={newSessionName}
                            onChange={(e) => setNewSessionName(e.target.value)}
                            placeholder={t('agentWorkspace.newSessionPlaceholder', 'New Session (Optional)')}
                            size="sm"
                            disabled={!isTaskRunning}
                        />
                        <Button size="sm" onClick={handleCreateSession} disabled={!isTaskRunning}>
                            {t('agentWorkspace.newSession', '+ New')}
                        </Button>
                    </div>
                    <div className="agent-session-list">
                        {sessions.map((session) => (
                            <div className={`agent-session-item ${activeSessionId === session.id ? 'active' : ''}`} key={session.id} data-session-id={session.id}>
                                <button
                                    type="button"
                                    className="agent-session-select"
                                    onClick={() => handleSwitchSession(session.id)}
                                    disabled={!isTaskRunning}
                                >
                                    <div className="name">{session.name || 'Session'}</div>
                                    <small>{new Date(session.updatedAt || Date.now()).toLocaleString()}</small>
                                </button>
                                <Button
                                    size="sm"
                                    variant="outline-danger"
                                    onClick={() => handleDeleteSession(session.id)}
                                    disabled={!isTaskRunning}
                                >
                                    {t('agentWorkspace.delete', 'Del')}
                                </Button>
                            </div>
                        ))}
                        {!sessions.length ? <div className="empty">{t('agentWorkspace.noSessions', 'No sessions')}</div> : null}
                    </div>
                </aside>
                <section className="agent-conversation-panel">
                    <div className="session-context-toolbar">
                        <div className="runtime-summary">
                            <div className="runtime-summary-main">
                                <div className="title">{t('agentWorkspace.sessionRuntime', 'Session Runtime')}</div>
                                <div className="current">{runtimeSummaryText}</div>
                            </div>
                            <Button
                                size="sm"
                                variant={runtimeExpanded ? 'outline-light' : 'primary'}
                                onClick={() => setRuntimeExpanded((prev) => !prev)}
                                aria-label="toggle-runtime-settings"
                            >
                                {runtimeExpanded
                                    ? t('agentWorkspace.hideRuntimeSettings', 'Hide Settings')
                                    : t('agentWorkspace.runtimeSettings', 'Runtime Settings')}
                            </Button>
                        </div>
                        {runtimeExpanded ? (
                            <div className="controls">
                                <div className="runtime-row runtime-row--bind">
                                    <Form.Select
                                        size="sm"
                                        value={bindMode}
                                        onChange={(e) => setBindMode(e.target.value)}
                                        aria-label="session-bind-mode"
                                        disabled={!isTaskRunning}
                                    >
                                        <option value="env">{t('agentWorkspace.bindEnv', 'Environment')}</option>
                                        <option value="wallet">{t('agentWorkspace.bindWallet', 'Wallet')}</option>
                                    </Form.Select>
                                    {bindMode === 'env' ? (
                                        <Form.Select
                                            size="sm"
                                            value={selectedEnvId}
                                            onChange={(e) => setSelectedEnvId(e.target.value)}
                                            aria-label="session-bind-env"
                                            disabled={!isTaskRunning}
                                        >
                                            <option value="">{t('agentWorkspace.selectEnv', 'Select Environment')}</option>
                                            {envList.map((env) => {
                                                const envId = env.id || env._id || env.name;
                                                return (
                                                    <option key={envId} value={envId}>
                                                        {env.name || envId}
                                                    </option>
                                                );
                                            })}
                                        </Form.Select>
                                    ) : (
                                        <Form.Select
                                            size="sm"
                                            value={selectedWalletId}
                                            onChange={(e) => setSelectedWalletId(e.target.value)}
                                            aria-label="session-bind-wallet"
                                            disabled={!isTaskRunning}
                                        >
                                            <option value="">{t('agentWorkspace.selectWallet', 'Select Wallet')}</option>
                                            {walletList.map((wallet) => (
                                                <option key={wallet.id} value={wallet.id}>
                                                    {wallet.name || wallet.id}
                                                </option>
                                            ))}
                                        </Form.Select>
                                    )}
                                    <Button size="sm" onClick={handleBindSessionContext} disabled={!isTaskRunning}>
                                        {t('agentWorkspace.bindToSession', 'Bind To Current Session')}
                                    </Button>
                                </div>

                                <div className="runtime-row runtime-row--provider">
                                    <Form.Select
                                        size="sm"
                                        value={selectedProvider}
                                        onChange={(e) => {
                                            const prov = e.target.value;
                                            setSelectedProvider(prov);
                                            setSelectedSubProvider('');
                                            // Set initial model from defaults; useEffect will fetch from backend
                                            const defaults = getModelsForProvider(prov, '');
                                            setSelectedModel(defaults[0]?.value || '');
                                        }}
                                        aria-label="session-provider"
                                        disabled={!isTaskRunning}
                                    >
                                        <option value="">{t('agentWorkspace.selectProvider', 'Select Provider')}</option>
                                        {providerOptions.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </Form.Select>
                                    {selectedProvider === 'api-key' && subProviderOptions.length > 0 ? (
                                        <Form.Select
                                            size="sm"
                                            value={selectedSubProvider}
                                            onChange={(e) => {
                                                const sub = e.target.value;
                                                setSelectedSubProvider(sub);
                                                // Set initial model from defaults; useEffect will fetch from backend
                                                const defaults = getModelsForProvider(selectedProvider, sub);
                                                setSelectedModel(defaults[0]?.value || '');
                                            }}
                                            aria-label="session-sub-provider"
                                            disabled={!isTaskRunning}
                                        >
                                            <option value="">{t('agentWorkspace.selectSubProvider', 'Select Sub-Provider')}</option>
                                            {subProviderOptions.map((opt) => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </Form.Select>
                                    ) : null}
                                    {selectedProvider === 'api-key' ? (
                                        <Form.Control
                                            size="sm"
                                            type="password"
                                            value={runtimeApiKey}
                                            onChange={(e) => setRuntimeApiKey(e.target.value)}
                                            placeholder={t('agentWorkspace.apiKeyPlaceholder', 'Enter API Key')}
                                            aria-label="session-api-key"
                                            disabled={!isTaskRunning}
                                        />
                                    ) : null}
                                </div>

                                <div className="runtime-row runtime-row--model">
                                    <Form.Select
                                        size="sm"
                                        value={selectedModel}
                                        onChange={(e) => setSelectedModel(e.target.value)}
                                        aria-label="session-model"
                                        disabled={!isTaskRunning || !filteredModels.length || (PROVIDER_MODEL_MAP[selectedProvider]?.requiresApiKey && !apiKeyConfigured && !runtimeApiKey)}
                                    >
                                        {filteredModels.length ? filteredModels.map((model) => (
                                            <option key={model.value} value={model.value}>
                                                {model.label}
                                            </option>
                                        )) : (
                                            <option value="">{t('agentWorkspace.selectProvider', 'Select Provider')}</option>
                                        )}
                                    </Form.Select>
                                    <Button
                                        size="sm"
                                        variant="outline-light"
                                        onClick={handleApplyModel}
                                        disabled={!isTaskRunning || !activeSessionId || !selectedModel || !selectedProvider}
                                    >
                                        {t('agentWorkspace.applyModel', 'Apply Model')}
                                    </Button>
                                </div>

                                {/* Pause/Retry/Cancel removed — subtask-level Start/Finish/Restart is sufficient */}
                                <div className="runtime-row runtime-row--danger">
                                    <Button
                                        size="sm"
                                        variant="outline-danger"
                                        onClick={handleResetAllMemory}
                                        disabled={!isTaskRunning}
                                    >
                                        {t('agentWorkspace.resetAllMemory', 'Reset All Memory')}
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                    {activeSession ? (
                        <AITaskPanel
                            activeTask={{ displayName: activeSession.name || workspaceTitle }}
                            messages={conversations[activeSessionId] || []}
                            prompt={prompts[activeSessionId] || null}
                            subTasks={subtasks[activeSessionId] || []}
                            subtaskLogs={subtaskLogs[activeSessionId] || {}}
                            artifacts={artifacts[activeSessionId] || []}
                            runtimeLogs={runtimeLogs[activeSessionId] || []}
                            apiKeyConfigured={selectedProvider !== 'api-key' || apiKeyConfigured}
                            interactionDisabled={!isTaskRunning || activeExecutionState.paused || activeExecutionState.canceled}
                            onSendMessage={handleSendMessage}
                            onSelectOption={handleSelectOption}
                            onSubmitAnswer={handleSubmitAnswer}
                            onSendAttachments={handleSendAttachments}
                            onOpenArtifact={handleOpenArtifact}
                            onSubtaskAction={handleSubtaskAction}
                            autoOpenPreset={autoOpenPresetSession === activeSessionId}
                            onAutoOpenPresetConsumed={() => setAutoOpenPresetSession('')}
                        />
                    ) : (
                        <div className="empty">{t('agentWorkspace.createSessionFirst', 'Create a session first')}</div>
                    )}
                </section>
            </div>
        </div>
    );
}

export default AgentWorkspace;
