import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Offcanvas from 'react-bootstrap/Offcanvas';
import { Button, Row, Col } from 'react-bootstrap';
import WebSocketManager from '../../utils/webSocket';
import { eventEmitter } from '../../utils/eventEmitter';
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

const resolveTaskKey = (taskId, tasksSnapshot = {}) => {
    const normalized = normalizeTaskId(taskId);
    const normalizedShort = normalized ? shortTaskName(normalized) : '';
    if (normalized && tasksSnapshot[normalized]) {
        return normalized;
    }
    if (normalized) {
        const fallback = Object.keys(tasksSnapshot).find((existingId) => {
            const normalizedExisting = normalizeTaskId(existingId);
            if (normalizedExisting === normalized) {
                return true;
            }
            const existingShort = shortTaskName(normalizedExisting);
            // Match when server logs use shortTaskName but completion uses full id, and vice versa
            return existingShort === normalized || existingShort === normalizedShort;
        });
        if (fallback) {
            return fallback;
        }
        return normalized;
    }
    return GENERAL_TASK_ID;
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
            status: payload.status === TASK_STATUS.COMPLETED ? TASK_STATUS.COMPLETED : TASK_STATUS.RUNNING,
            displayName: payload.displayName || getDefaultDisplayName(safeId),
            canTarget: Boolean(payload.canTarget && safeId !== GENERAL_TASK_ID),
            createdAt,
            lastUpdatedAt: payload.lastUpdatedAt || createdAt
        };
        return acc;
    }, {});
};

function TaskOffcanvas({ show, handleClose }) {
    const [tasks, setTasks] = useState({});
    const [activeTaskId, setActiveTaskId] = useState(null);
    const wsManagerRef = useRef(new WebSocketManager());
    const { t } = useTranslation();

    const taskStartListener = useRef();
    const clientTaskMessageListener = useRef();

    const appendLogEntry = useCallback((taskId, logEntry, meta = {}) => {
        let resolvedTaskIdRef = GENERAL_TASK_ID;
        setTasks((prev) => {
            const resolvedTaskId = resolveTaskKey(taskId, prev);
            resolvedTaskIdRef = resolvedTaskId;
            const next = { ...prev };
            const existing = next[resolvedTaskId];
            const createdAt = existing?.createdAt || logEntry.timestamp;
            const status = existing?.status || meta.initialStatus || TASK_STATUS.RUNNING;
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
        if (resolvedTaskIdRef !== GENERAL_TASK_ID) {
            setActiveTaskId((current) => current || resolvedTaskIdRef);
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

    const sendTerminateAllTasks = useCallback(() => {
        const wsManager = wsManagerRef.current;
        if (!wsManager) {
            return;
        }

        const runningTasks = Object.values(tasks).filter(
            (task) => task.id !== GENERAL_TASK_ID && task.status === TASK_STATUS.RUNNING
        );

        if (!runningTasks.length) {
            wsManager.sendMessage(JSON.stringify({ type: 'terminate_process' }));
            return;
        }

        const targetableTasks = runningTasks.filter((task) => task.canTarget !== false);

        targetableTasks.forEach((task) => {
            wsManager.sendMessage(
                JSON.stringify({ type: 'terminate_process', taskName: task.id })
            );
        });

        if (targetableTasks.length < runningTasks.length) {
            wsManager.sendMessage(JSON.stringify({ type: 'terminate_process' }));
        }
    }, [tasks]);

    const handleClearAllLogs = useCallback(() => {
        const hasRunning = Object.values(tasks).some(
            (task) => task.status === TASK_STATUS.RUNNING && task.id !== GENERAL_TASK_ID
        );
        if (hasRunning) {
            sendTerminateAllTasks();
        }
        setTasks({});
        setActiveTaskId(null);
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(STORAGE_KEY);
        }
    }, [sendTerminateAllTasks, tasks]);

    const setTaskStatus = useCallback((taskId, status, meta = {}) => {
        setTasks((prev) => {
            const resolvedTaskId = resolveTaskKey(taskId, prev);
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
        const normalizedTaskId = normalizeTaskId(info.taskName);
        const displayName = normalizedTaskId ? shortTaskName(normalizedTaskId) : undefined;
        const resolvedTaskId = normalizedTaskId || GENERAL_TASK_ID;
        setTaskStatus(resolvedTaskId, TASK_STATUS.COMPLETED, { displayName, canTarget: Boolean(info.taskName) });
    }, [setTaskStatus]);

    const appendServerLog = useCallback((info) => {
        const parsed = extractTaskFromMessage(info.message || '');
        const taskIdFromEvent = normalizeTaskId(info.taskName);
        const resolvedTaskId = taskIdFromEvent || parsed.taskId;
        const displayName = taskIdFromEvent ? shortTaskName(taskIdFromEvent) : parsed.taskId;
        const canTarget = Boolean(taskIdFromEvent || parsed.taskId);
        const normalizedText = (parsed.text || '').toLowerCase();

        if (
            resolvedTaskId !== GENERAL_TASK_ID &&
            (normalizedText.startsWith('started') || normalizedText.includes(' task started'))
        ) {
            setTaskStatus(resolvedTaskId, TASK_STATUS.RUNNING, { displayName, canTarget });
        }

        const logEntry = createLogEntry(
            parsed.text || info.message,
            info.message || parsed.text,
            info.type === 'task_error' ? 'error' : 'info',
            Date.now(),
            info.time
        );
        appendLogEntry(resolvedTaskId, logEntry, { displayName, canTarget });
    }, [appendLogEntry, setTaskStatus]);

    const appendGeneralLog = useCallback((message) => {
        const logEntry = createLogEntry(message, message);
        appendLogEntry(GENERAL_TASK_ID, logEntry, { displayName: DEFAULT_SYSTEM_LABEL, canTarget: false });
    }, [appendLogEntry]);

    const processIncomingMessages = useCallback(() => {
        const wsManager = wsManagerRef.current;
        if (!wsManager) {
            return;
        }
        while (wsManager.getQueueLength() > 0) {
            const info = wsManager.popFromQueue();
            if (!info) {
                continue;
            }
            if (info.type === 'task_completed') {
                handleTaskCompleted(info);
                eventEmitter.emit('taskCompleted', info);
                continue;
            }
            if (info.message) {
                appendServerLog(info);
            }
        }
    }, [appendServerLog, handleTaskCompleted]);

    const closeCallback = useCallback((event) => {
        console.log('WebSocket connection closed:', event);
    }, []);

    const terminateTask = () => {
        const activeTask = activeTaskId ? tasks[activeTaskId] : null;
        if (!activeTask || activeTask.status !== TASK_STATUS.RUNNING) {
            return; // only terminate the currently selected running task
        }
        if (activeTask.id === GENERAL_TASK_ID) {
            return; // don't terminate system/general
        }
        if (!activeTask.canTarget) {
            return; // task cannot be targeted directly
        }
        const payload = { type: 'terminate_process', taskName: activeTask.id };
        wsManagerRef.current.sendMessage(JSON.stringify(payload));
    };

    const handleDeleteActiveTask = () => {
        const activeTask = activeTaskId ? tasks[activeTaskId] : null;
        if (activeTask && activeTask.status === TASK_STATUS.COMPLETED) {
            removeTask(activeTaskId);
        }
    };

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                const sanitized = sanitizeStoredTasks(parsed);
                setTasks(sanitized);
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
                            status: TASK_STATUS.RUNNING,
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
        if (typeof window === 'undefined') {
            return;
        }
        if (Object.keys(tasks).length) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        } else {
            window.localStorage.removeItem(STORAGE_KEY);
        }
    }, [tasks]);

    useEffect(() => {
        const wsManager = wsManagerRef.current;

        const connectWebSocket = async () => {
            const connected = await wsManager.connect(processIncomingMessages, closeCallback);
            if (!connected) {
                alert(t('connectionFailedAlert'));
            }
        };

        connectWebSocket();

        taskStartListener.current = connectWebSocket;
        clientTaskMessageListener.current = (message) => {
            appendGeneralLog(message);
        };

        eventEmitter.on('taskStart', taskStartListener.current);
        eventEmitter.on('clientTaskMessage', clientTaskMessageListener.current);

        const interval = setInterval(() => {
            if (!wsManager.wss || !wsManager.checkConnection()) {
                connectWebSocket();
            }
        }, 5000);

        return () => {
            wsManager.close();
            eventEmitter.off('taskStart', taskStartListener.current);
            eventEmitter.off('clientTaskMessage', clientTaskMessageListener.current);
            clearInterval(interval);
        };
    }, [appendGeneralLog, closeCallback, processIncomingMessages, t]);

    const sortedTasks = useMemo(() => {
        return Object.values(tasks).sort((a, b) => b.createdAt - a.createdAt);
    }, [tasks]);

    useEffect(() => {
        if (!sortedTasks.length) {
            if (activeTaskId !== null) {
                setActiveTaskId(null);
            }
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
    const canDeleteActive = Boolean(activeTask && activeTask.status === TASK_STATUS.COMPLETED);
    const canTerminateActive = Boolean(
        activeTask &&
        activeTask.status === TASK_STATUS.RUNNING &&
        activeTask.id !== GENERAL_TASK_ID &&
        activeTask.canTarget
    );
    const hasRunningTasks = useMemo(() => (
        Object.values(tasks).some((task) => task.status === TASK_STATUS.RUNNING && task.id !== GENERAL_TASK_ID)
    ), [tasks]);
    const hasAnyTasks = sortedTasks.length > 0;

    const getTaskLabel = (task) => (
        task.id === GENERAL_TASK_ID
            ? t('taskLog.systemTab')
            : task.displayName || shortTaskName(task.id) || task.id
    );

    return (
        <Offcanvas
            className="task-offcanvas"
            show={show}
            onHide={() => handleClose(false)}
            placement="bottom"
        >
            <Offcanvas.Header closeButton>
                <Offcanvas.Title>{t('taskLog')}</Offcanvas.Title>
                <div className="header-actions">
                    <Button
                        className="btn-terminate"
                        onClick={terminateTask}
                        disabled={!canTerminateActive}
                    >
                        {t('terminateTask')}
                    </Button>
                    <Button
                        className="btn-delete"
                        onClick={handleDeleteActiveTask}
                        disabled={!canDeleteActive}
                    >
                        {t('taskLog.deleteLogs')}
                    </Button>
                    <Button
                        className="btn-clear-all"
                        onClick={handleClearAllLogs}
                        title={hasRunningTasks ? t('taskLog.cannotClearRunning') : undefined}
                    >
                        {t('taskLog.clearAllLogs')}
                    </Button>
                </div>
            </Offcanvas.Header>
            <Offcanvas.Body>
                <Row className="task-layout">
                    <Col md={3} className="task-list-panel">
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
                                        <span className={`status-chip ${task.status}`}>
                                            {t(`taskLog.status.${task.status}`)}
                                        </span>
                                    </Button>
                                ))
                            ) : (
                                <div className="task-list__empty">{t('taskLog.noTasks')}</div>
                            )}
                        </div>
                    </Col>
                    <Col md={9} className="task-log-panel">
                        <div className="logs">
                            {activeTask ? (
                                activeTask.logs.length ? (
                                    <ul className="log-list">
                                        {activeTask.logs.map((log) => (
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
                    </Col>
                </Row>
            </Offcanvas.Body>
        </Offcanvas>
    );
}

export default TaskOffcanvas;
