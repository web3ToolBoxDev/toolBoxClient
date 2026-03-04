import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import WebSocketManager from '../../utils/webSocket';
import APIManager from '../../utils/api';
import { eventEmitter } from '../../utils/eventEmitter';
import { resolveTaskDisplayName } from '../../utils/taskI18n';
import TaskOffcanvasShell from './TaskOffcanvasShell';
import './index.scss';
import { useTranslation } from 'react-i18next';

const STORAGE_KEY = 'taskLogsByTask';
const LEGACY_STORAGE_KEY = 'taskMessagesList';
const GENERAL_TASK_ID = 'system';
const TASK_STATUS = {
    RUNNING: 'running',
    COMPLETED: 'completed'
};
const DEFAULT_SYSTEM_LABEL = 'system';

const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const shortTaskName = (taskName = '') => {
    if (!taskName || typeof taskName !== 'string') {
        return '';
    }
    if (!taskName.includes('_')) {
        return taskName;
    }
    const [address, rest] = taskName.split('_');
    if (!address || !rest || address.length < 10) {
        return taskName;
    }
    return `${address.slice(0, 5)}...${address.slice(-5)}_${rest}`;
};

const normalizeTaskId = (value) => {
    if (value === undefined || value === null) {
        return '';
    }
    return String(value).trim();
};

const mapTaskIdForDisplay = (taskId = '') => {
    if (!taskId) return taskId;
    if (String(taskId).endsWith('_syncFunction')) {
        return 'syncFunction';
    }
    return taskId;
};

const resolveTaskId = (taskId, tasksSnapshot = {}) => {
    const normalized = normalizeTaskId(taskId);
    if (!normalized) {
        return GENERAL_TASK_ID;
    }
    if (tasksSnapshot[normalized]) {
        return normalized;
    }
    const normalizedShort = shortTaskName(normalized);
    const fallback = Object.keys(tasksSnapshot).find((existingId) => {
        const existingShort = shortTaskName(existingId);
        return existingShort === normalized || existingShort === normalizedShort;
    });
    return fallback || normalized;
};

const extractTaskNameFromTaskId = (taskId, knownTaskNames = []) => {
    const normalized = normalizeTaskId(taskId);
    if (!normalized || normalized === GENERAL_TASK_ID) {
        return '';
    }
    const bestMatch = knownTaskNames
        .filter((taskName) => normalized === taskName || normalized.endsWith(`_${taskName}`))
        .sort((a, b) => b.length - a.length)[0];
    if (bestMatch) {
        return bestMatch;
    }
    const splitIndex = normalized.lastIndexOf('_');
    if (splitIndex === -1) {
        return normalized;
    }
    return normalized.slice(splitIndex + 1);
};

const extractTaskFromMessage = (message = '') => {
    const match = /Task:([^\s]+)\s?([\s\S]*)/i.exec(message);
    if (match) {
        return {
            taskId: normalizeTaskId(match[1]),
            text: match[2]?.trim() || ''
        };
    }
    return {
        taskId: GENERAL_TASK_ID,
        text: message
    };
};

const getDefaultDisplayName = (taskId, fallback) => {
    if (fallback) {
        return fallback;
    }
    if (!taskId || taskId === GENERAL_TASK_ID) {
        return DEFAULT_SYSTEM_LABEL;
    }
    return shortTaskName(taskId) || taskId;
};

const createLogEntry = (text, raw, level = 'info', timestamp = Date.now(), timeLabel) => ({
    id: generateId(),
    text: text || raw,
    raw,
    level,
    timestamp,
    timeLabel: timeLabel || new Date(timestamp).toLocaleString()
});

const sanitizeStoredTasks = (stored) => {
    if (!stored || typeof stored !== 'object') {
        return {};
    }
    return Object.entries(stored).reduce((acc, [taskId, payload]) => {
        if (!payload || typeof payload !== 'object') {
            return acc;
        }
        const safeId = normalizeTaskId(taskId || payload.id) || GENERAL_TASK_ID;
        const createdAt = payload.createdAt || Date.now();
        const logs = Array.isArray(payload.logs)
            ? payload.logs.map((log) => {
                if (log && typeof log === 'object' && log.id) {
                    return log;
                }
                const text = typeof log === 'string' ? log : JSON.stringify(log);
                return createLogEntry(text, text);
            })
            : [];
        acc[safeId] = {
            id: safeId,
            logs,
            status: TASK_STATUS.COMPLETED,
            displayName: payload.displayName || getDefaultDisplayName(safeId),
            canTarget: Boolean(payload.canTarget && safeId !== GENERAL_TASK_ID),
            createdAt,
            lastUpdatedAt: payload.lastUpdatedAt || createdAt
        };
        return acc;
    }, {});
};

const sharedWsManager = WebSocketManager.getInstance();
let sharedConnectPromise = null;
const ensureSharedConnection = async (messageCallback, closeCallback) => {
    if (sharedWsManager.wss && sharedWsManager.wss.readyState === WebSocket.OPEN) {
        return true;
    }
    if (sharedConnectPromise) {
        return sharedConnectPromise;
    }
    sharedConnectPromise = sharedWsManager.connect(messageCallback, closeCallback);
    const ok = await sharedConnectPromise;
    sharedConnectPromise = null;
    return ok;
};

function TaskOffcanvas({ show, handleClose }) {
    const [tasks, setTasks] = useState({});
    const [activeTaskId, setActiveTaskId] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [taskDefinitions, setTaskDefinitions] = useState({});
    const wsManagerRef = useRef(sharedWsManager);
    const wsInitRef = useRef(false);
    const apiRef = useRef(APIManager.getInstance());
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    const taskStartListener = useRef();
    const clientTaskMessageListener = useRef();

    const appendLogEntry = useCallback((taskId, logEntry, meta = {}) => {
        setTasks((prev) => {
            const resolvedTaskId = resolveTaskId(taskId, prev);
            const next = { ...prev };
            const existing = next[resolvedTaskId];
            const createdAt = existing?.createdAt || logEntry.timestamp;
            const status = meta.status || existing?.status || TASK_STATUS.COMPLETED;
            const displayName = meta.displayName || existing?.displayName || getDefaultDisplayName(resolvedTaskId);
            const canTarget = meta.canTarget ?? existing?.canTarget ?? false;
            const logs = [...(existing?.logs || []), logEntry];
            next[resolvedTaskId] = {
                id: resolvedTaskId,
                displayName,
                logs,
                status,
                canTarget,
                createdAt,
                lastUpdatedAt: logEntry.timestamp
            };
            return next;
        });
        const resolvedTaskIdRef = normalizeTaskId(taskId) || GENERAL_TASK_ID;
        if (resolvedTaskIdRef !== GENERAL_TASK_ID) {
            setActiveTaskId((current) => (meta.focus ? resolvedTaskIdRef : current || resolvedTaskIdRef));
        }
    }, []);

    const removeTask = useCallback((taskId) => {
        if (!taskId) {
            return;
        }
        setTasks((prev) => {
            if (!prev[taskId]) {
                return prev;
            }
            const next = { ...prev };
            delete next[taskId];
            return next;
        });
    }, []);

    const fetchTaskRunningStatus = useCallback(async (taskIds = []) => {
        const names = Array.isArray(taskIds) ? taskIds.filter(Boolean) : [];
        if (!names.length) {
            return {};
        }
        try {
            const res = await apiRef.current.getTaskStatus(names);
            if (res && res.success && res.data) {
                return res.data;
            }
        } catch (error) {
            console.error('Failed to fetch task status before terminate:', error);
        }
        return null;
    }, []);

    const sendTerminateAllTasks = useCallback(async () => {
        const wsManager = wsManagerRef.current;
        if (!wsManager) {
            return;
        }
        const runningTasks = Object.values(tasks).filter(
            (task) => task.id !== GENERAL_TASK_ID && task.status === TASK_STATUS.RUNNING
        );
        if (!runningTasks.length) {
            return;
        }
        const runningStatus = await fetchTaskRunningStatus(runningTasks.map((task) => task.id));
        const confirmedRunning = runningStatus
            ? runningTasks.filter((task) => Boolean(runningStatus[task.id]))
            : runningTasks;
        if (!confirmedRunning.length) {
            return;
        }
        const targetableTasks = confirmedRunning.filter((task) => task.canTarget !== false);
        targetableTasks.forEach((task) => {
            wsManager.sendMessage(JSON.stringify({ type: 'terminate_process', taskName: task.id }));
        });
        if (targetableTasks.length < confirmedRunning.length) {
            wsManager.sendMessage(JSON.stringify({ type: 'terminate_process' }));
        }
    }, [fetchTaskRunningStatus, tasks]);

    const handleClearAllLogs = useCallback(async () => {
        const hasRunning = Object.values(tasks).some(
            (task) => task.status === TASK_STATUS.RUNNING && task.id !== GENERAL_TASK_ID
        );
        if (hasRunning) {
            await sendTerminateAllTasks();
        }
        setTasks({});
        setActiveTaskId(null);
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(STORAGE_KEY);
        }
    }, [sendTerminateAllTasks, tasks]);

    const setTaskStatus = useCallback((taskId, status, meta = {}) => {
        setTasks((prev) => {
            const resolvedTaskId = resolveTaskId(taskId, prev);
            const next = { ...prev };
            const existing = next[resolvedTaskId];
            const now = Date.now();
            const displayName = meta.displayName || existing?.displayName || getDefaultDisplayName(resolvedTaskId);
            const canTarget = meta.canTarget ?? existing?.canTarget ?? (resolvedTaskId !== GENERAL_TASK_ID);
            next[resolvedTaskId] = {
                id: resolvedTaskId,
                displayName,
                logs: existing?.logs || [],
                status,
                canTarget,
                createdAt: existing?.createdAt || now,
                lastUpdatedAt: now
            };
            return next;
        });
    }, []);

    const handleTaskCompleted = useCallback((info) => {
        const normalizedTaskId = mapTaskIdForDisplay(normalizeTaskId(info.taskName));
        const displayName = normalizedTaskId ? shortTaskName(normalizedTaskId) : DEFAULT_SYSTEM_LABEL;
        setTaskStatus(normalizedTaskId || GENERAL_TASK_ID, TASK_STATUS.COMPLETED, {
            displayName,
            canTarget: Boolean(normalizedTaskId)
        });
    }, [setTaskStatus]);

    const appendServerLog = useCallback((info) => {
        const parsed = extractTaskFromMessage(info.message || '');
        const taskIdFromEvent = normalizeTaskId(info.taskName);
        const resolvedTaskId = mapTaskIdForDisplay(taskIdFromEvent || parsed.taskId) || GENERAL_TASK_ID;
        const displayName = resolvedTaskId === GENERAL_TASK_ID ? DEFAULT_SYSTEM_LABEL : shortTaskName(resolvedTaskId);
        const canTarget = resolvedTaskId !== GENERAL_TASK_ID;
        const logEntry = createLogEntry(
            parsed.text || info.message,
            info.message || parsed.text,
            info.type === 'task_error' ? 'error' : 'info',
            Date.now(),
            info.time
        );
        appendLogEntry(resolvedTaskId, logEntry, { displayName, canTarget });
    }, [appendLogEntry]);

    const appendGeneralLog = useCallback((message) => {
        const logEntry = createLogEntry(message, message);
        appendLogEntry(GENERAL_TASK_ID, logEntry, { displayName: DEFAULT_SYSTEM_LABEL, canTarget: false });
    }, [appendLogEntry]);

    const seedTaskStart = useCallback((payload = {}) => {
        const taskName = normalizeTaskId(payload.taskName);
        const taskData = payload.taskData || {};
        const envIds = Array.isArray(taskData.envIds) ? taskData.envIds : [];
        const walletIds = Array.isArray(taskData.walletIds) ? taskData.walletIds : [];
        const now = Date.now();
        const seedOne = (taskId) => {
            if (!taskId) return;
            const displayName = shortTaskName(taskId);
            const logEntry = createLogEntry('started (client)', 'started (client)', 'info', now);
            appendLogEntry(taskId, logEntry, { displayName, canTarget: true, status: TASK_STATUS.RUNNING, focus: true });
        };
        if (taskName === 'syncFunction') {
            seedOne('syncFunction');
            return;
        }
        if (envIds.length && taskName) {
            envIds.forEach((envId) => seedOne(`${envId}_${taskName}`));
            return;
        }
        if (walletIds.length && taskName) {
            walletIds.forEach((walletId) => seedOne(`${walletId}_${taskName}`));
            return;
        }
        if (taskName) {
            seedOne(taskName);
        }
    }, [appendLogEntry]);

    const processIncomingMessages = useCallback((info) => {
        if (!info) return;
        if (info.type === 'task_started') {
            const taskId = mapTaskIdForDisplay(normalizeTaskId(info.taskName));
            if (taskId) {
                const displayName = shortTaskName(taskId);
                const logEntry = createLogEntry('started', 'started', 'info', Date.now(), info.time);
                appendLogEntry(taskId, logEntry, { displayName, canTarget: true, status: TASK_STATUS.RUNNING, focus: true });
            }
            return;
        }
        if (info.type === 'task_completed') {
            handleTaskCompleted(info);
            eventEmitter.emit('taskCompleted', info);
            return;
        }
        if (info.message) {
            appendServerLog(info);
        }
    }, [appendLogEntry, appendServerLog, handleTaskCompleted]);

    const closeCallback = useCallback((event) => {
        console.log('WebSocket connection closed:', event);
    }, []);

    const terminateTask = async () => {
        const activeTask = activeTaskId ? tasks[activeTaskId] : null;
        if (!activeTask || activeTask.status !== TASK_STATUS.RUNNING || activeTask.id === GENERAL_TASK_ID || !activeTask.canTarget) {
            return;
        }
        const runningStatus = await fetchTaskRunningStatus([activeTask.id]);
        if (runningStatus && !runningStatus[activeTask.id]) {
            const now = Date.now();
            setTaskStatus(activeTask.id, TASK_STATUS.COMPLETED, {
                displayName: activeTask.displayName,
                canTarget: activeTask.canTarget
            });
            appendLogEntry(
                activeTask.id,
                createLogEntry('already stopped (server)', 'already stopped (server)', 'info', now),
                { displayName: activeTask.displayName, canTarget: activeTask.canTarget, status: TASK_STATUS.COMPLETED }
            );
            return;
        }
        wsManagerRef.current.sendMessage(JSON.stringify({ type: 'terminate_process', taskName: activeTask.id }));
        const now = Date.now();
        appendLogEntry(
            activeTask.id,
            createLogEntry('terminated (client)', 'terminated (client)', 'info', now),
            { displayName: activeTask.displayName, canTarget: activeTask.canTarget, status: TASK_STATUS.COMPLETED }
        );
    };

    const handleDeleteActiveTask = () => {
        const activeTask = activeTaskId ? tasks[activeTaskId] : null;
        if (activeTask && activeTask.status === TASK_STATUS.COMPLETED) {
            removeTask(activeTaskId);
        }
    };

    useEffect(() => {
        const loadTaskDefinitions = async () => {
            try {
                const [defaultTasks, customTasks] = await Promise.all([
                    apiRef.current.getAllTasks(true),
                    apiRef.current.getAllTasks(false)
                ]);
                const merged = [
                    ...(Array.isArray(defaultTasks) ? defaultTasks : []),
                    ...(Array.isArray(customTasks) ? customTasks : [])
                ];
                const map = merged.reduce((acc, item) => {
                    if (item?.taskName) acc[item.taskName] = item;
                    return acc;
                }, {});
                setTaskDefinitions(map);
            } catch (error) {
                console.error('Failed to load task definitions:', error);
            }
        };
        loadTaskDefinitions();
        const refreshListener = () => loadTaskDefinitions();
        eventEmitter.on('tasksRefreshed', refreshListener);

        return () => {
            if (typeof eventEmitter.off === 'function') {
                eventEmitter.off('tasksRefreshed', refreshListener);
            } else if (typeof eventEmitter.removeListener === 'function') {
                eventEmitter.removeListener('tasksRefreshed', refreshListener);
            }
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                setTasks(sanitizeStoredTasks(JSON.parse(stored)));
                return;
            } catch (error) {
                console.error('Failed to parse stored task logs:', error);
            }
        }
        const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
            try {
                const legacyList = JSON.parse(legacy);
                if (Array.isArray(legacyList) && legacyList.length) {
                    const logs = legacyList.map((message) => createLogEntry(message, message));
                    const now = Date.now();
                    setTasks({
                        [GENERAL_TASK_ID]: {
                            id: GENERAL_TASK_ID,
                            logs,
                            status: TASK_STATUS.COMPLETED,
                            displayName: DEFAULT_SYSTEM_LABEL,
                            canTarget: false,
                            createdAt: now,
                            lastUpdatedAt: now
                        }
                    });
                }
                window.localStorage.removeItem(LEGACY_STORAGE_KEY);
            } catch (error) {
                console.error('Failed to migrate legacy task logs:', error);
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (Object.keys(tasks).length) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        } else {
            window.localStorage.removeItem(STORAGE_KEY);
        }
    }, [tasks]);

    useEffect(() => {
        const connectWebSocket = async () => {
            const connected = await ensureSharedConnection(processIncomingMessages, closeCallback);
            if (!connected) {
                console.warn('WebSocket connection failed');
            }
        };
        if (!wsInitRef.current) {
            wsInitRef.current = true;
            connectWebSocket();
        }
        taskStartListener.current = (payload) => {
            connectWebSocket();
            seedTaskStart(payload);
        };
        clientTaskMessageListener.current = (message) => {
            appendGeneralLog(message);
        };
        eventEmitter.on('taskStart', taskStartListener.current);
        eventEmitter.on('clientTaskMessage', clientTaskMessageListener.current);
        return () => {
            eventEmitter.off('taskStart', taskStartListener.current);
            eventEmitter.off('clientTaskMessage', clientTaskMessageListener.current);
        };
    }, [appendGeneralLog, closeCallback, processIncomingMessages, seedTaskStart]);

    const sortedTasks = useMemo(() => {
        return Object.values(tasks).sort((a, b) => {
            const aRunning = a.status === TASK_STATUS.RUNNING;
            const bRunning = b.status === TASK_STATUS.RUNNING;
            if (aRunning !== bRunning) {
                return aRunning ? -1 : 1;
            }
            const aUpdated = a.lastUpdatedAt || a.createdAt || 0;
            const bUpdated = b.lastUpdatedAt || b.createdAt || 0;
            if (aUpdated !== bUpdated) {
                return bUpdated - aUpdated;
            }
            return (b.createdAt || 0) - (a.createdAt || 0);
        });
    }, [tasks]);

    useEffect(() => {
        if (!sortedTasks.length) {
            if (activeTaskId !== null) setActiveTaskId(null);
            return;
        }
        if (!activeTaskId) {
            setActiveTaskId(sortedTasks[0].id);
            return;
        }
        const stillExists = sortedTasks.some((task) => task.id === activeTaskId);
        if (!stillExists) {
            setActiveTaskId(sortedTasks[0].id);
        }
    }, [activeTaskId, sortedTasks]);

    const activeTask = activeTaskId ? tasks[activeTaskId] : null;
    const knownTaskNames = useMemo(() => Object.keys(taskDefinitions), [taskDefinitions]);
    const activeTaskName = useMemo(
        () => extractTaskNameFromTaskId(activeTask?.id, knownTaskNames),
        [activeTask?.id, knownTaskNames]
    );
    const isActiveAiTask = useMemo(() => {
        if (!activeTaskName) return false;
        const taskDef = taskDefinitions[activeTaskName];
        if (!taskDef) return false;
        return taskDef.taskType === 'ai' || taskDef.aiEnabled === true;
    }, [activeTaskName, taskDefinitions]);
    const activeLogs = useMemo(() => {
        if (!activeTask || !Array.isArray(activeTask.logs)) {
            return [];
        }
        return activeTask.logs.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }, [activeTask]);
    const canDeleteActive = Boolean(activeTask && activeTask.status === TASK_STATUS.COMPLETED);
    const canTerminateActive = Boolean(
        activeTask &&
        activeTask.status === TASK_STATUS.RUNNING &&
        activeTask.id !== GENERAL_TASK_ID &&
        activeTask.canTarget
    );
    const hasRunningTasks = useMemo(
        () => Object.values(tasks).some((task) => task.status === TASK_STATUS.RUNNING && task.id !== GENERAL_TASK_ID),
        [tasks]
    );
    const getTaskLabel = (task) => {
        if (task.id === GENERAL_TASK_ID) return t('taskLog.systemTab');
        const baseTaskName = extractTaskNameFromTaskId(task.id, knownTaskNames);
        const taskDef = baseTaskName ? taskDefinitions[baseTaskName] : null;
        const localizedBaseName = taskDef
            ? resolveTaskDisplayName(taskDef, { language: i18n?.resolvedLanguage || i18n?.language || 'en' })
            : '';
        if (!localizedBaseName) {
            return task.displayName || shortTaskName(task.id) || task.id;
        }
        if (task.id === baseTaskName) {
            return localizedBaseName;
        }
        const rawLabel = task.displayName || shortTaskName(task.id) || task.id;
        return rawLabel.replace(baseTaskName, localizedBaseName);
    };

    useEffect(() => {
        if (!show) {
            setIsFullscreen(false);
        }
    }, [show]);

    const handlePanelClose = () => {
        setIsFullscreen(false);
        handleClose(false);
    };

    const goToAiWorkspace = () => {
        if (!isActiveAiTask || !activeTaskName) return;
        const taskDef = taskDefinitions[activeTaskName];
        const taskDisplayName = resolveTaskDisplayName(taskDef, {
            language: i18n?.resolvedLanguage || i18n?.language || 'en'
        });
        navigate(`/agentWorkspace/${encodeURIComponent(activeTaskName)}`, {
            state: {
                taskDisplayName,
                taskI18n: taskDef?.taskI18n || {},
                taskKey: taskDef?.taskKey || ''
            }
        });
    };

    return (
        <TaskOffcanvasShell
            show={show}
            onClose={handlePanelClose}
            title={t('taskLog')}
            canToggleFullscreen={false}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
            isAiMode={false}
            actions={(
                <>
                    <Button
                        className="btn-fullscreen"
                        onClick={goToAiWorkspace}
                        disabled={!isActiveAiTask}
                    >
                        {t('taskManage.openAiWorkspace')}
                    </Button>
                    <Button className="btn-terminate" onClick={terminateTask} disabled={!canTerminateActive}>
                        {t('terminateTask')}
                    </Button>
                    <Button className="btn-delete" onClick={handleDeleteActiveTask} disabled={!canDeleteActive}>
                        {t('taskLog.deleteLogs')}
                    </Button>
                    <Button
                        className="btn-clear-all"
                        onClick={handleClearAllLogs}
                        title={hasRunningTasks ? t('taskLog.cannotClearRunning') : undefined}
                    >
                        {t('taskLog.clearAllLogs')}
                    </Button>
                </>
            )}
        >
            <div className="task-layout">
                <div className="task-list-panel">
                    <div className="task-list">
                        {sortedTasks.length ? (
                            sortedTasks.map((task) => (
                                <Button
                                    key={task.id}
                                    type="button"
                                    className={`task-tab ${activeTaskId === task.id ? 'active' : ''}`}
                                    onClick={() => setActiveTaskId(task.id)}
                                >
                                    <div className="task-name">{getTaskLabel(task)}</div>
                                    <span className={`status-chip ${task.status}`}>{t(`taskLog.status.${task.status}`)}</span>
                                </Button>
                            ))
                        ) : (
                            <div className="task-list__empty">{t('taskLog.noTasks')}</div>
                        )}
                    </div>
                </div>
                <div className="task-log-panel">
                    <div className="logs">
                        {activeTask ? (
                            activeLogs.length ? (
                                <ul className="log-list">
                                    {activeLogs.map((log) => (
                                        <li key={log.id} className={`log-entry ${log.level}`}>
                                            <span className="log-time">{log.timeLabel}</span>
                                            <span className="log-text">{log.text || log.raw}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="placeholder">{t('taskLog.emptyLogs')}</div>
                            )
                        ) : (
                            <div className="placeholder">{t('taskLog.switchHint')}</div>
                        )}
                    </div>
                </div>
            </div>
        </TaskOffcanvasShell>
    );
}

export default TaskOffcanvas;
