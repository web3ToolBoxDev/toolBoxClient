import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

const STATUS_KEYS = ['pending', 'running', 'review', 'done', 'failed'];

function AITaskPanel({
    activeTask,
    messages = [],
    prompt = null,
    subTasks = [],
    subtaskLogs = {},
    artifacts = [],
    runtimeLogs = [],
    apiKeyConfigured = true,
    interactionDisabled = false,
    autoOpenPreset = false,
    onAutoOpenPresetConsumed,
    onSendMessage,
    onSelectOption,
    onSubmitAnswer,
    onSendAttachments,
    onOpenArtifact
}) {
    const { t } = useTranslation();
    const [pendingMessage, setPendingMessage] = useState('');
    const [showPresetModal, setShowPresetModal] = useState(false);
    const [expandedSubtask, setExpandedSubtask] = useState(null);

    // Auto-open preset modal when triggered by backend (e.g., session first start)
    useEffect(() => {
        if (autoOpenPreset) {
            setShowPresetModal(true);
            if (onAutoOpenPresetConsumed) onAutoOpenPresetConsumed();
        }
    }, [autoOpenPreset, onAutoOpenPresetConsumed]);
    const [pendingAttachments, setPendingAttachments] = useState([]);
    const [pendingRejectedAttachments, setPendingRejectedAttachments] = useState([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const [attachmentNotice, setAttachmentNotice] = useState('');
    const [questionDrafts, setQuestionDrafts] = useState({});
    const [collapsedPresetGroups, setCollapsedPresetGroups] = useState({});
    const [activeUploadQuestion, setActiveUploadQuestion] = useState(null);
    const [activeInlineUploadMessage, setActiveInlineUploadMessage] = useState(null);
    const [armedPasteQuestion, setArmedPasteQuestion] = useState(null);
    const fileInputRef = useRef(null);
    const questionFileInputRef = useRef(null);
    const inlineFileInputRef = useRef(null);
    const chatContentRef = useRef(null);
    const chatListRef = useRef(null);
    const attachmentPolicy = prompt?.attachmentPolicy || null;

    const inferAttachmentKind = (file) => {
        const mime = String(file?.type || '').toLowerCase();
        const name = String(file?.name || '').toLowerCase();
        if (mime.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif|bmp)$/.test(name)) return 'image';
        if (mime.includes('pdf') || /\.pdf$/.test(name)) return 'pdf';
        if (mime.includes('wordprocessingml') || mime.includes('msword') || /\.docx?$/.test(name)) return 'doc';
        if (mime.includes('spreadsheet') || /\.(xlsx|xls|csv)$/.test(name)) return 'sheet';
        if (mime.startsWith('text/') || /\.(txt|md|json|html?)$/.test(name)) return 'text';
        return 'file';
    };

    const readFilePayload = (file, source = 'upload', extra = {}) => (
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = typeof reader.result === 'string' ? reader.result : '';
                const base64 = result.includes(',') ? result.split(',')[1] : result;
                resolve({
                    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                    name: file.name || 'attachment',
                    mimeType: file.type || 'application/octet-stream',
                    size: file.size || 0,
                    source,
                    contentBase64: base64,
                    ...(extra && typeof extra === 'object' ? extra : {})
                });
            };
            reader.onerror = () => reject(new Error('file read failed'));
            reader.readAsDataURL(file);
        })
    );

    const sendFiles = async (files, source = 'upload', extra = {}, options = {}) => {
        if (!Array.isArray(files) || !files.length || typeof onSendAttachments !== 'function') {
            return;
        }
        const maxSizeMB = Number(
            options?.policy?.maxSizeMB ??
            prompt?.attachmentPolicy?.maxSizeMB ??
            4
        );
        const maxSize = Math.max(1, maxSizeMB) * 1024 * 1024;
        const allowedKinds = Array.isArray(options?.policy?.allowedKinds)
            ? options.policy.allowedKinds
            : (Array.isArray(prompt?.attachmentPolicy?.allowedKinds) ? prompt.attachmentPolicy.allowedKinds : []);
        const rejected = [];
        const candidates = files.filter((file) => {
            if (!file) return false;
            if (file.size > maxSize) {
                rejected.push({ name: file.name || 'attachment', reason: 'size', size: file.size || 0, source, ...extra });
                return false;
            }
            const kind = inferAttachmentKind(file);
            if (allowedKinds.length && !allowedKinds.includes(kind)) {
                rejected.push({ name: file.name || 'attachment', reason: 'type', kind, source, ...extra });
                return false;
            }
            return true;
        });
        if (rejected.length) {
            setPendingRejectedAttachments((prev) => [...prev, ...rejected]);
            setAttachmentNotice(
                t('taskLog.ai.attachRejected', '{{count}} file(s) were skipped').replace('{{count}}', String(rejected.length))
            );
        } else {
            setAttachmentNotice('');
        }
        if (!candidates.length) {
            if (options?.autoDispatch && rejected.length) {
                onSendAttachments({
                    attachments: [],
                    rejected,
                    questionId: extra?.questionId || '',
                    questionText: extra?.questionText || ''
                });
            }
            return;
        }
        const payloads = await Promise.all(candidates.map((file) => readFilePayload(file, source, extra)));
        if (options?.autoDispatch) {
            onSendAttachments({
                attachments: payloads,
                rejected,
                questionId: extra?.questionId || '',
                questionText: extra?.questionText || ''
            });
            return;
        }
        setPendingAttachments((prev) => [...prev, ...payloads]);
    };

    const getRejectedReasonLabel = (item) => {
        if (item?.reason === 'type') {
            const kind = item?.kind ? ` (${item.kind})` : '';
            return `${t('taskLog.ai.rejectReasonType', 'Unsupported file type')}${kind}`;
        }
        if (typeof item?.size === 'number' && Number.isFinite(item.size)) {
            const mb = (item.size / (1024 * 1024)).toFixed(2);
            return `${t('taskLog.ai.rejectReasonSize', 'File exceeds size limit')} (${mb}MB)`;
        }
        return t('taskLog.ai.rejectReasonSize', 'File exceeds size limit');
    };

    const renderAttachmentPreview = (att) => {
        const isImage = String(att?.mimeType || '').startsWith('image/');
        const hasBase64 = typeof att?.contentBase64 === 'string' && att.contentBase64.length > 0;
        if (isImage && hasBase64) {
            return (
                <img
                    className="ai-chat-attachment-chip__thumb"
                    src={`data:${att.mimeType || 'image/png'};base64,${att.contentBase64}`}
                    alt={att.name || 'attachment'}
                />
            );
        }
        return (
            <span className="ai-chat-attachment-chip__icon">
                {String(att?.mimeType || '').includes('pdf') ? 'PDF' : 'FILE'}
            </span>
        );
    };

    const renderMessageAttachments = (msg) => {
        const list = Array.isArray(msg?.attachments) ? msg.attachments : [];
        if (!list.length) return null;
        return (
            <div className="ai-chat-item__attachments">
                {list.slice(0, 6).map((att, idx) => (
                    <div key={`${msg.id}-att-${idx}`} className="ai-chat-attachment-chip">
                        {renderAttachmentPreview(att)}
                        <span className="ai-chat-attachment-chip__name">{att.name || 'attachment'}</span>
                    </div>
                ))}
            </div>
        );
    };

    const triggerInlineUpload = (msg) => {
        if (!msg || interactionDisabled) return;
        if (msg.uploadMode === 'paste') {
            setArmedPasteQuestion({
                questionId: msg.questionId || msg.id || '',
                questionText: msg.questionText || msg.content || ''
            });
            setAttachmentNotice(t('taskLog.ai.pasteArmed', 'Paste files now with Ctrl+V'));
            return;
        }
        setActiveInlineUploadMessage(msg);
        inlineFileInputRef.current?.click();
    };

    const policyAllowedKindsLabel = useMemo(() => {
        const kinds = Array.isArray(attachmentPolicy?.allowedKinds) ? attachmentPolicy.allowedKinds : [];
        if (!kinds.length) return t('taskLog.ai.policyAny', 'Any');
        const labelMap = {
            image: t('taskLog.ai.kind.image', 'Image'),
            pdf: t('taskLog.ai.kind.pdf', 'PDF'),
            doc: t('taskLog.ai.kind.doc', 'Document'),
            sheet: t('taskLog.ai.kind.sheet', 'Spreadsheet'),
            text: t('taskLog.ai.kind.text', 'Text'),
            file: t('taskLog.ai.kind.file', 'File')
        };
        return kinds.map((kind) => labelMap[kind] || kind).join(', ');
    }, [attachmentPolicy?.allowedKinds, t]);

    const chatMessages = useMemo(() => {
        return (Array.isArray(messages) ? messages : []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    }, [messages]);

    const expandedSubtaskLogEntries = useMemo(() => {
        if (!expandedSubtask) return [];
        const logs = subtaskLogs[expandedSubtask] || [];
        return logs.map((entry) => ({
            id: entry.id || `stlog-${entry.time}`,
            role: 'system',
            content: `[${t(`taskLog.ai.subTask.${expandedSubtask}`, expandedSubtask)}] ${entry.text}`,
            createdAt: entry.time || Date.now()
        }));
    }, [expandedSubtask, subtaskLogs, t]);


    const parseMessageType = (content = '') => {
        if (typeof content !== 'string') return 'text';
        if (content.startsWith('[attachment]')) return 'attachment';
        if (content.startsWith('[option]')) return 'option';
        if (content.startsWith('[answer]')) return 'answer';
        return 'text';
    };

    const handleSend = () => {
        const message = String(pendingMessage || '').trim();
        if (!message && !pendingAttachments.length && !pendingRejectedAttachments.length) return;
        if (message && typeof onSendMessage === 'function') {
            onSendMessage(message);
            setPendingMessage('');
        }
        if ((pendingAttachments.length || pendingRejectedAttachments.length) && typeof onSendAttachments === 'function') {
            onSendAttachments({
                attachments: pendingAttachments,
                rejected: pendingRejectedAttachments
            });
            setPendingAttachments([]);
            setPendingRejectedAttachments([]);
            setAttachmentNotice('');
        }
    };

    const promptQuestions = Array.isArray(prompt?.questions) ? prompt.questions : [];
    const legacyPromptOptions = Array.isArray(prompt?.options) ? prompt.options : [];
    const promptOptionCount = promptQuestions.length || legacyPromptOptions.length;
    const getQuestionType = (question) => {
        if (Array.isArray(question?.options) && question.options.length) return 'option';
        if (question?.type === 'upload') return 'upload';
        return 'input';
    };
    const isQuestionAnswered = (question) => {
        if (Array.isArray(question?.options) && question.options.length) {
            return Boolean(question.selectedOptionId);
        }
        if (question?.type === 'upload') {
            return Boolean(question.uploaded);
        }
        const draft = String(questionDrafts[question.id] || '').trim();
        const answer = String(question.answerValue || '').trim();
        return Boolean(draft || answer);
    };
    const groupedPromptQuestions = useMemo(() => {
        if (!promptQuestions.length) return [];
        const groups = [];
        const ensureGroup = (key, title) => {
            const existing = groups.find((item) => item.key === key);
            if (existing) return existing;
            const next = { key, title, questions: [] };
            groups.push(next);
            return next;
        };
        promptQuestions.forEach((question) => {
            const rawGroupKey = String(question?.group || question?.section || '').trim();
            if (rawGroupKey) {
                ensureGroup(rawGroupKey, rawGroupKey).questions.push(question);
                return;
            }
            const type = getQuestionType(question);
            if (type === 'option') {
                ensureGroup('selection', t('taskLog.ai.groupSelection', 'Selection')).questions.push(question);
                return;
            }
            if (type === 'upload') {
                ensureGroup('attachment', t('taskLog.ai.groupAttachment', 'Attachment')).questions.push(question);
                return;
            }
            ensureGroup('input', t('taskLog.ai.groupInput', 'Input')).questions.push(question);
        });
        return groups;
    }, [promptQuestions, t]);
    const answeredPresetCount = useMemo(() => {
        if (!promptQuestions.length) return 0;
        return promptQuestions.filter((question) => isQuestionAnswered(question)).length;
    }, [promptQuestions, questionDrafts]);

    const triggerQuestionUpload = (question) => {
        if (!question || interactionDisabled) return;
        if (question.uploadMode === 'paste') {
            setArmedPasteQuestion({
                questionId: question.id || '',
                questionText: question.text || ''
            });
            setAttachmentNotice(t('taskLog.ai.pasteArmed', 'Paste files now with Ctrl+V'));
            return;
        }
        setActiveUploadQuestion(question);
        questionFileInputRef.current?.click();
    };

    useEffect(() => {
        if (!showPresetModal) return;
        const initialDrafts = {};
        promptQuestions.forEach((q) => {
            if (q?.id && (q.type === 'input' || q.type === 'number' || q.type === 'date')) {
                initialDrafts[q.id] = q.answerValue || '';
            }
        });
        setQuestionDrafts(initialDrafts);
        const initialCollapsed = {};
        const seenKeys = new Set();
        promptQuestions.forEach((question, index) => {
            const rawGroupKey = String(question?.group || question?.section || '').trim();
            const fallbackKey = getQuestionType(question) === 'option'
                ? 'selection'
                : (getQuestionType(question) === 'upload' ? 'attachment' : 'input');
            const groupKey = rawGroupKey || fallbackKey;
            if (seenKeys.has(groupKey)) return;
            seenKeys.add(groupKey);
            initialCollapsed[groupKey] = index !== 0;
        });
        setCollapsedPresetGroups(initialCollapsed);
    }, [promptQuestions, showPresetModal]);

    useEffect(() => {
        const containerNode = chatContentRef.current;
        const listNode = chatListRef.current;
        if (!containerNode && !listNode) return;
        const scrollToBottom = () => {
            const targets = [containerNode, listNode].filter(Boolean);
            targets.forEach((node) => {
                if (typeof node.scrollTo === 'function') {
                    node.scrollTo({ top: node.scrollHeight, behavior: 'auto' });
                    return;
                }
                node.scrollTop = node.scrollHeight;
            });
        };
        const rafFn = typeof window !== 'undefined' ? window.requestAnimationFrame : null;
        const cancelRafFn = typeof window !== 'undefined' ? window.cancelAnimationFrame : null;
        let delayedTimer = null;
        if (typeof rafFn === 'function') {
            const raf = rafFn(() => {
                scrollToBottom();
                delayedTimer = setTimeout(scrollToBottom, 120);
            });
            return () => {
                if (typeof cancelRafFn === 'function') {
                    cancelRafFn(raf);
                }
                if (delayedTimer) {
                    clearTimeout(delayedTimer);
                }
            };
        }
        const timer = setTimeout(() => {
            scrollToBottom();
            delayedTimer = setTimeout(scrollToBottom, 120);
        }, 0);
        return () => {
            clearTimeout(timer);
            if (delayedTimer) {
                clearTimeout(delayedTimer);
            }
        };
    }, [chatMessages, prompt, expandedSubtaskLogEntries.length, artifacts.length]);

    return (
        <div className="ai-task-panel">
            <div className="ai-task-panel__main">
                <section className="ai-task-panel__chat">
                    <h5>{t('taskLog.ai.chatTitle')}</h5>
                    {!apiKeyConfigured ? <div className="ai-config-warning">{t('taskLog.ai.missingApiKey')}</div> : null}
                    <div
                        ref={chatContentRef}
                        className={`ai-chat-content ${isDragOver ? 'is-drag-over' : ''}`}
                        onDragEnter={(e) => {
                            e.preventDefault();
                            setIsDragOver(true);
                        }}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragOver(true);
                        }}
                        onDragLeave={(e) => {
                            e.preventDefault();
                            if (!e.currentTarget.contains(e.relatedTarget)) {
                                setIsDragOver(false);
                            }
                        }}
                        onDrop={async (e) => {
                            e.preventDefault();
                            setIsDragOver(false);
                            const dropped = Array.from(e.dataTransfer?.files || []);
                            await sendFiles(dropped, 'drag');
                        }}
                    >
                        {chatMessages.length || expandedSubtaskLogEntries.length ? (
                            <ul ref={chatListRef} className="ai-chat-list">
                                {expandedSubtaskLogEntries.length > 0 && (
                                    <li className="ai-chat-item ai-chat-item--subtask-header">
                                        <span className="ai-chat-item__tag subtask">{t(`taskLog.ai.subTask.${expandedSubtask}`, expandedSubtask)}</span>
                                        <span className="ai-chat-item__content">{t('taskLog.ai.subtaskLogsHint', 'Showing logs for this subtask')}</span>
                                        <Button size="sm" variant="outline-secondary" onClick={() => setExpandedSubtask(null)} className="ms-2">
                                            &times;
                                        </Button>
                                    </li>
                                )}
                                {expandedSubtaskLogEntries.map((entry) => (
                                    <li key={entry.id} className="ai-chat-item ai-chat-item--subtask-log">
                                        <span className="ai-chat-item__content">{entry.content}</span>
                                    </li>
                                ))}
                                {chatMessages.map((msg) => (
                                    <li key={msg.id} className={`ai-chat-item ${msg.role === 'assistant' ? '' : 'user'}`}>
                                        {parseMessageType(msg.content) !== 'text' ? (
                                            <span className={`ai-chat-item__tag ${parseMessageType(msg.content)}`}>
                                                {parseMessageType(msg.content)}
                                            </span>
                                        ) : null}
                                        <span className="ai-chat-item__time">{new Date(msg.createdAt || Date.now()).toLocaleString()}</span>
                                        <span className="ai-chat-item__text">{msg.content}</span>
                                        {renderMessageAttachments(msg)}
                                        {msg?.questionType === 'upload' ? (
                                            <div className="ai-chat-item__options">
                                                <Button
                                                    size="sm"
                                                    variant="outline-light"
                                                    className="ai-option-btn"
                                                    disabled={interactionDisabled}
                                                    onClick={() => triggerInlineUpload(msg)}
                                                >
                                                    {msg?.buttonLabel || (msg?.uploadMode === 'paste'
                                                        ? t('taskLog.ai.pasteForQuestion', 'Paste File')
                                                        : t('taskLog.ai.uploadForQuestion', 'Upload File'))}
                                                </Button>
                                            </div>
                                        ) : null}
                                        {Array.isArray(msg.options) && msg.options.length ? (
                                            <div className="ai-chat-item__options">
                                                {msg.options.map((opt) => (
                                                    <Button
                                                        key={`${msg.id}-${opt.id}`}
                                                        size="sm"
                                                        variant={msg.selectedOptionId === opt.id ? 'primary' : 'outline-light'}
                                                        className="ai-option-btn"
                                                        disabled={interactionDisabled}
                                                        onClick={() => {
                                                            if (typeof onSelectOption !== 'function') return;
                                                            onSelectOption({
                                                                ...opt,
                                                                questionId: msg.questionId || msg.id,
                                                                questionText: msg.questionText || msg.content
                                                            });
                                                        }}
                                                    >
                                                        {opt.label}
                                                    </Button>
                                                ))}
                                            </div>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="placeholder">{t('taskLog.ai.emptyChat')}</div>
                        )}
                    </div>
                    {attachmentPolicy ? (
                        <div className="ai-attachment-policy">
                            <span className="label">{t('taskLog.ai.attachmentPolicy', 'Attachment Policy')}:</span>
                            <span>{`${t('taskLog.ai.policyMaxSize', 'Max size')}: ${Number(attachmentPolicy?.maxSizeMB || 4)}MB`}</span>
                            <span>{`${t('taskLog.ai.policyAllowedKinds', 'Allowed')}: ${policyAllowedKindsLabel}`}</span>
                        </div>
                    ) : null}
                    {pendingAttachments.length ? (
                        <div className="ai-attachment-list">
                            {pendingAttachments.map((item) => (
                                <div key={item.id} className="ai-attachment-item">
                                    <div className="ai-attachment-item__meta">
                                        <div className="ai-attachment-item__preview">
                                            {renderAttachmentPreview(item)}
                                        </div>
                                        <span className="name">{item.name}</span>
                                        <span className="size">{`${Math.max(1, Math.round((item.size || 0) / 1024))}KB`}</span>
                                    </div>
                                    <Button
                                        variant="outline-danger"
                                        size="sm"
                                        onClick={() => setPendingAttachments((prev) => prev.filter((x) => x.id !== item.id))}
                                        disabled={interactionDisabled}
                                    >
                                        {t('common.cancel', 'Cancel')}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    {pendingRejectedAttachments.length ? (
                        <div className="ai-attachment-list ai-attachment-list--rejected">
                            <div className="ai-attachment-list__header">
                                <div className="ai-attachment-list__title">{t('taskLog.ai.rejectedTitle', 'Rejected Attachments')}</div>
                                <Button
                                    variant="outline-danger"
                                    size="sm"
                                    onClick={() => setPendingRejectedAttachments([])}
                                    disabled={interactionDisabled}
                                >
                                    {t('taskLog.ai.clearRejected', 'Clear Rejected')}
                                </Button>
                            </div>
                            {pendingRejectedAttachments.map((item, index) => (
                                <div key={`${item.name}-${item.reason}-${index}`} className="ai-attachment-item ai-attachment-item--rejected">
                                    <div className="ai-attachment-item__meta">
                                        <span className="name">{item.name}</span>
                                        <span className="size">{getRejectedReasonLabel(item)}</span>
                                    </div>
                                    <Button
                                        variant="outline-danger"
                                        size="sm"
                                        onClick={() => setPendingRejectedAttachments((prev) => prev.filter((_, i) => i !== index))}
                                        disabled={interactionDisabled}
                                    >
                                        {t('common.cancel', 'Cancel')}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    <div className="ai-preset-trigger-row">
                        <div className="ai-preset-trigger-meta">
                            <span className="ai-preset-trigger-meta__label">{t('taskLog.ai.presetQuestions', 'Preset Questions')}</span>
                            <span className="ai-preset-trigger-meta__count">{`${answeredPresetCount}/${promptOptionCount}`}</span>
                        </div>
                        <Button
                            variant="outline-light"
                            size="sm"
                            className="ai-preset-trigger"
                            disabled={interactionDisabled || !promptOptionCount}
                            onClick={() => setShowPresetModal(true)}
                        >
                            {`${t('taskLog.ai.chooseOption', 'Choose an option')} (${promptOptionCount})`}
                        </Button>
                    </div>
                    <div className="ai-chat-input">
                        <Form.Control
                            value={pendingMessage}
                            onChange={(e) => setPendingMessage(e.target.value)}
                            placeholder={t('taskLog.ai.inputPlaceholder')}
                            disabled={interactionDisabled}
                            onPaste={async (e) => {
                                const clipboard = e.clipboardData;
                                if (!clipboard) return;
                                const fileCandidates = Array.from(clipboard.items || [])
                                    .filter((item) => item?.kind === 'file')
                                    .map((item) => item.getAsFile())
                                    .filter(Boolean);
                                if (fileCandidates.length) {
                                    e.preventDefault();
                                    if (armedPasteQuestion?.questionId) {
                                        await sendFiles(
                                            fileCandidates,
                                            'paste-question',
                                            {
                                                questionId: armedPasteQuestion.questionId,
                                                questionText: armedPasteQuestion.questionText
                                            },
                                            { autoDispatch: true }
                                        );
                                        setArmedPasteQuestion(null);
                                        setAttachmentNotice('');
                                    } else {
                                        await sendFiles(fileCandidates, 'paste');
                                    }
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                        />
                        <Button
                            variant="outline-light"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={interactionDisabled}
                            title={t('taskLog.ai.attach')}
                        >
                            {t('taskLog.ai.attach')}
                        </Button>
                        <Button
                            onClick={handleSend}
                            disabled={interactionDisabled || (!pendingMessage.trim() && !pendingAttachments.length && !pendingRejectedAttachments.length)}
                        >
                            {t('taskLog.ai.send')}
                        </Button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            hidden
                            onChange={async (e) => {
                                const list = Array.from(e.target.files || []);
                                await sendFiles(list, 'upload');
                                e.target.value = '';
                            }}
                        />
                        <input
                            ref={questionFileInputRef}
                            type="file"
                            multiple={Boolean(activeUploadQuestion?.allowMultiple)}
                            hidden
                            onChange={async (e) => {
                                const list = Array.from(e.target.files || []);
                                await sendFiles(
                                    list,
                                    'upload-question',
                                    {
                                        questionId: activeUploadQuestion?.id || '',
                                        questionText: activeUploadQuestion?.text || ''
                                    },
                                    {
                                        autoDispatch: true,
                                        policy: {
                                            maxSizeMB: activeUploadQuestion?.maxSizeMB,
                                            allowedKinds: activeUploadQuestion?.acceptKinds
                                        }
                                    }
                                );
                                e.target.value = '';
                            }}
                        />
                        <input
                            ref={inlineFileInputRef}
                            type="file"
                            multiple={Boolean(activeInlineUploadMessage?.allowMultiple)}
                            hidden
                            onChange={async (e) => {
                                const list = Array.from(e.target.files || []);
                                await sendFiles(
                                    list,
                                    'upload-inline',
                                    {
                                        questionId: activeInlineUploadMessage?.questionId || activeInlineUploadMessage?.id || '',
                                        questionText: activeInlineUploadMessage?.questionText || activeInlineUploadMessage?.content || ''
                                    },
                                    {
                                        autoDispatch: true,
                                        policy: {
                                            maxSizeMB: activeInlineUploadMessage?.maxSizeMB,
                                            allowedKinds: activeInlineUploadMessage?.acceptKinds
                                        }
                                    }
                                );
                                e.target.value = '';
                            }}
                        />
                    </div>
                    {isDragOver ? <div className="ai-drop-hint">{t('taskLog.ai.dropHint', 'Drop files to attach')}</div> : null}
                    {attachmentNotice ? <div className="ai-drop-hint">{attachmentNotice}</div> : null}
                </section>

                <div className="ai-task-panel__side">
                    <section className="ai-task-panel__subtasks">
                        <h5>{t('taskLog.ai.subTasksTitle', 'AI Subtasks')}</h5>
                        {(Array.isArray(subTasks) ? subTasks : []).length ? (
                            <ul className="ai-subtask-list">
                                {(Array.isArray(subTasks) ? subTasks : []).map((task) => {
                                    const status = STATUS_KEYS.includes(task.status) ? task.status : 'pending';
                                    const isActive = expandedSubtask === task.key;
                                    const label = task.actionLabel
                                        ? t(`taskLog.ai.subTask.${task.key}`, task.actionLabel)
                                        : t(`taskLog.ai.subTask.${task.key}`, task.key);
                                    return (
                                        <li key={task.key}>
                                            <button
                                                type="button"
                                                className={`ai-subtask-card ai-subtask-card--${status}${isActive ? ' ai-subtask-card--active' : ''}`}
                                                disabled={status === 'pending'}
                                                onClick={() => {
                                                    if (status === 'pending') return;
                                                    setExpandedSubtask(isActive ? null : task.key);
                                                }}
                                            >
                                                <span className={`ai-subtask-card__badge ai-subtask-card__badge--${status}`}>
                                                    {status === 'done' ? '\u2713' : status === 'failed' ? '!' : status === 'running' ? '\u25B6' : '\u25CB'}
                                                </span>
                                                <span className="ai-subtask-card__label">{label}</span>
                                                <span className="ai-subtask-card__status">
                                                    {t(`taskLog.ai.status.${status}`, status)}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <div className="placeholder">{t('taskLog.ai.noTask')}</div>
                        )}
                    </section>

                    <section className="ai-task-panel__artifacts">
                        <h5>{t('taskLog.ai.artifactsTitle')}</h5>
                        {Array.isArray(artifacts) && artifacts.length ? (
                            artifacts.map((item) => (
                                <button
                                    type="button"
                                    className="ai-artifact-card ai-artifact-card--button"
                                    key={item.id}
                                    onClick={() => onOpenArtifact && onOpenArtifact(item)}
                                >
                                    <div>{item.title || item.type}</div>
                                    <small>{activeTask?.displayName || t('taskLog.ai.noTask')}</small>
                                </button>
                            ))
                        ) : (
                            <div className="ai-artifact-card">
                                <div>{t('taskLog.ai.noTask')}</div>
                            </div>
                        )}
                    </section>
                </div>
            </div>
            <Modal
                show={showPresetModal}
                onHide={() => setShowPresetModal(false)}
                centered
                size="lg"
                className="ai-preset-modal"
            >
                <Modal.Header closeButton>
                    <Modal.Title>
                        <div className="ai-preset-modal__title">{t('taskLog.ai.chooseOption')}</div>
                        <div className="ai-preset-modal__subtitle">
                            {`${t('taskLog.ai.presetQuestions', 'Preset Questions')}: ${answeredPresetCount}/${promptOptionCount}`}
                        </div>
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {promptQuestions.length ? (
                        <div className="ai-preset-question-list">
                            {prompt?.text ? <div className="ai-preset-modal__intro">{prompt.text}</div> : null}
                            {groupedPromptQuestions.map((group) => {
                                const groupAnswered = group.questions.filter((question) => isQuestionAnswered(question)).length;
                                const collapsed = Boolean(collapsedPresetGroups[group.key]);
                                return (
                                    <div className="ai-preset-group" key={group.key}>
                                        <button
                                            type="button"
                                            className="ai-preset-group__header"
                                            onClick={() => setCollapsedPresetGroups((prev) => ({
                                                ...prev,
                                                [group.key]: !prev[group.key]
                                            }))}
                                        >
                                            <div className="ai-preset-group__title-wrap">
                                                <span className="ai-preset-group__title">{group.title}</span>
                                                <span className="ai-preset-group__count">{`${groupAnswered}/${group.questions.length}`}</span>
                                            </div>
                                            <span className="ai-preset-group__caret">{collapsed ? '+' : '-'}</span>
                                        </button>
                                        {!collapsed ? (
                                            <div className="ai-preset-group__content">
                                                {group.questions.map((question) => (
                                                    <div className="ai-preset-question-item" key={question.id}>
                                                        <div className="ai-preset-question-item__header">
                                                            <div className="ai-option-title">{question.text}</div>
                                                            <span className="ai-preset-question-item__type">
                                                                {getQuestionType(question) === 'option'
                                                                    ? t('taskLog.ai.questionTypeOption', 'Option')
                                                                    : (getQuestionType(question) === 'upload'
                                                                        ? t('taskLog.ai.questionTypeUpload', 'Upload')
                                                                        : t('taskLog.ai.questionTypeInput', 'Input'))}
                                                            </span>
                                                        </div>
                                                        {Array.isArray(question.options) && question.options.length ? (
                                                            <div className="ai-option-list">
                                                                {question.options.map((opt) => (
                                                                    <Button
                                                                        key={opt.id}
                                                                        variant={question.selectedOptionId === opt.id ? 'primary' : 'outline-light'}
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            if (onSelectOption) {
                                                                                onSelectOption({
                                                                                    ...opt,
                                                                                    questionId: question.id,
                                                                                    questionText: question.text
                                                                                });
                                                                            }
                                                                        }}
                                                                        className="ai-option-btn"
                                                                        disabled={interactionDisabled}
                                                                    >
                                                                        {opt.label}
                                                                    </Button>
                                                                ))}
                                                            </div>
                                                        ) : question.type === 'upload' ? (
                                                            <div className="ai-question-input-row">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline-light"
                                                                    onClick={() => triggerQuestionUpload(question)}
                                                                    disabled={interactionDisabled}
                                                                >
                                                                    {question.buttonLabel || (question.uploadMode === 'paste'
                                                                        ? t('taskLog.ai.pasteForQuestion', 'Paste File')
                                                                        : t('taskLog.ai.uploadForQuestion', 'Upload File'))}
                                                                </Button>
                                                                {question.uploaded ? (
                                                                    <span className="ai-preset-question-item__done">{t('taskLog.ai.uploaded', 'Uploaded')}</span>
                                                                ) : null}
                                                            </div>
                                                        ) : (
                                                            <div className="ai-question-input-row">
                                                                <Form.Control
                                                                    size="sm"
                                                                    type={question.inputType || 'text'}
                                                                    value={questionDrafts[question.id] || ''}
                                                                    placeholder={question.placeholder || ''}
                                                                    onChange={(e) => {
                                                                        const value = e.target.value;
                                                                        setQuestionDrafts((prev) => ({ ...prev, [question.id]: value }));
                                                                    }}
                                                                    disabled={interactionDisabled}
                                                                />
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        const value = String(questionDrafts[question.id] || '').trim();
                                                                        if (!value || !onSubmitAnswer) return;
                                                                        onSubmitAnswer({
                                                                            questionId: question.id,
                                                                            questionText: question.text,
                                                                            answer: value
                                                                        });
                                                                    }}
                                                                    disabled={interactionDisabled || !String(questionDrafts[question.id] || '').trim()}
                                                                >
                                                                    {t('common.confirm', 'Confirm')}
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <>
                            <div className="ai-option-title">{prompt?.text || t('taskLog.ai.chooseOption')}</div>
                            <div className="ai-option-list">
                                {legacyPromptOptions.map((opt) => (
                                    <Button
                                        key={opt.id}
                                        variant="outline-light"
                                        size="sm"
                                        onClick={() => {
                                            if (onSelectOption) {
                                                onSelectOption(opt);
                                            }
                                            setShowPresetModal(false);
                                        }}
                                        className="ai-option-btn"
                                        disabled={interactionDisabled}
                                    >
                                        {opt.label}
                                    </Button>
                                ))}
                            </div>
                        </>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="outline-light" size="sm" onClick={() => setShowPresetModal(false)}>
                        {t('common.close', 'Close')}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
}

export default AITaskPanel;
