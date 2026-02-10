import { Container, Button, Card, Row, Col } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import APIManager from "../../utils/api";
import CustomModal from '../../components/customModal';
import useFingerPrintStore from '../../store/fingerPrintStore';
import usePathStore from '../../store/pathStore';
import useWalletStore from '../../store/walletStore';
import { eventEmitter } from '../../utils/eventEmitter';
import './index.scss';





const ChromeManager = () => {
    const { t } = useTranslation();
    const api = APIManager.getInstance();
    const fingerPrintsObj = useFingerPrintStore(state => state.fingerPrints);
    const setFingerPrints = useFingerPrintStore(state => state.setFingerPrints);
    const setWallets = useWalletStore(state => state.setWallets);
    const wallets = useWalletStore(state => state.wallets);
    // 兼容对象结构
    const fingerPrints = useMemo(() => (
        fingerPrintsObj && typeof fingerPrintsObj === 'object' ? Object.values(fingerPrintsObj) : []
    ), [fingerPrintsObj]);
    // 排序：先按createdAt正序，再按id正序
    const sortedFingerPrints = useMemo(() => (
        fingerPrints.slice().sort((a, b) => {
            if ((a.createdAt || 0) !== (b.createdAt || 0)) {
                return (a.createdAt || 0) - (b.createdAt || 0);
            }
            if ((a.id || '') < (b.id || '')) return -1;
            if ((a.id || '') > (b.id || '')) return 1;
            return 0;
        })
    ), [fingerPrints]);

    const savePath = usePathStore(state => state.savePath);
    const chromePath = usePathStore(state => state.chromePath);
    const fetchPaths = usePathStore(state => state.fetchPaths);
    const [modalProps, setModalProps] = useState({
        show: false,
        title: '',
        rowList: []
    });
    const modalRef = useRef();
    const selectAllRef = useRef(null);
    const skipNextSyncRef = useRef(false);

    const [baseFingerprintCount, setBaseFingerprintCount] = useState(0);
    const [selectedIds, setSelectedIds] = useState([]);
    const fetchBaseFingerprintCount = useCallback(async () => {
        try {
            const data = await api.getFingerPrintCount();
            if (data && data.success) {
                setBaseFingerprintCount(data.message || 0);
                modalRef.current.updateValueObj('baseFingerprintCount', data.message || 0);
            } else {
                console.error(t('fetchBaseFingerprintCountError'), data.message || t('unknownError'));
            }
        } catch (error) {
            console.error(t('fetchBaseFingerprintCountError'), error);
        }
    }, [api, t]);




    useEffect(() => {
        fetchPaths();
        fetchBaseFingerprintCount();
    }, [fetchPaths, fetchBaseFingerprintCount]);

    useEffect(() => {
        if (!selectAllRef.current) return;
        const total = Array.isArray(fingerPrints) ? fingerPrints.length : 0;
        const selected = Array.isArray(selectedIds) ? selectedIds.length : 0;
        selectAllRef.current.indeterminate = selected > 0 && selected < total;
    }, [selectedIds, fingerPrints]);

    const syncDataFromSavePath = useCallback(async (path) => {
        if (!path) return;
        const res = await api.setSavePath(path);
        if (res && res.success) {
            if (res.data && res.data.fingerprints) {
                setFingerPrints(res.data.fingerprints);
            } else {
                setFingerPrints({});
            }
            if (res.data && Array.isArray(res.data.wallets)) {
                setWallets(res.data.wallets);
            } else {
                setWallets([]);
            }
            if (res.data && Array.isArray(res.data.tasks)) {
                eventEmitter.emit('tasksRefreshed', res.data.tasks);
            }
            fetchBaseFingerprintCount();
        }
    }, [api, fetchBaseFingerprintCount, setFingerPrints, setWallets]);

    useEffect(() => {
        if (!savePath) return;
        if (skipNextSyncRef.current) {
            skipNextSyncRef.current = false;
            return;
        }
        syncDataFromSavePath(savePath);
    }, [savePath, syncDataFromSavePath]);

    const setChromePathHandler = async () => {
        if (!window.electronAPI) {
            alert(t('runInElectron'));
            return;
        }
        const res = await window.electronAPI.openFile();
        if (res) {
            window.localStorage.setItem('chromePath', res);
            await api.setChromePath(res);
            fetchPaths();
            alert(t('setSuccess'));
        }
    };

    const setSavePathHandler = async () => {
        if (!window.electronAPI) {
            alert(t('runInElectron'));
            return;
        }
        const res = await window.electronAPI.chooseDirectory();
        if (res) {
            window.localStorage.setItem('savePath', res);
            const refreshRes = await api.setSavePath(res);
            if (refreshRes && refreshRes.success) {
                if (refreshRes.data && refreshRes.data.fingerprints) {
                    setFingerPrints(refreshRes.data.fingerprints);
                } else {
                    setFingerPrints({});
                }
                if (refreshRes.data && Array.isArray(refreshRes.data.wallets)) {
                    setWallets(refreshRes.data.wallets);
                } else {
                    setWallets([]);
                }
                if (refreshRes.data && Array.isArray(refreshRes.data.tasks)) {
                    eventEmitter.emit('tasksRefreshed', refreshRes.data.tasks);
                }
                fetchBaseFingerprintCount();
            }
            skipNextSyncRef.current = true;
            fetchPaths();
            alert(t('setSuccess'));
        }
    };

    const refreshFingerPrints = async () => {
        const res = await api.getFingerPrints();
        if (res && res.success && res.data) {
            setFingerPrints(res.data); // 这一步会全局更新
        }
    };

    const openGenerateFingerprintModal = async () => {
        // console.log('openGenerateFingerprintModal');
        setModalProps({
            show: true,
            title: t('generateFingerprint'),
            handleClose: () => {
                setModalProps({
                    show: false
                });
            },
            rowList: [
                // [
                //     {
                //         type: 'label',
                //         text: t('downloadBaseFingerPrintCount'),
                //         colWidth: 9,
                //     },
                //     {
                //         type: 'button',
                //         text: t('downloadButton'),
                //         style: { marginLeft: 'auto', marginRight: '1rem', },
                //         colWidth: 2,
                //         click: () => {
                //             if (!window.electronAPI) {
                //                 alert(t('runInElectron'));
                //                 return;
                //             }
                //             window.electronAPI.openLink('https://web3toolbox.app/');
                //         }
                //     },
                // ],
                // [
                //     {
                //         type: 'label',
                //         text: t('importBaseFingerPrintCount'),
                //         colWidth: 9
                //     },
                //     {
                //         type: 'button',
                //         text: t('importButton'),
                //         colWidth: 2,
                //         style: { marginLeft: 'auto', marginRight: '1rem', },
                //         click: () => {
                //             if (!window.electronAPI) {
                //                 alert(t('runInElectron'));
                //                 return;
                //             }
                //             window.electronAPI.openFile().then((res) => {
                //                 if (res) {
                //                     api.loadFingerPrints(res).then(async (data) => {
                //                         if (data && data.success) {
                //                             alert(t('importSuccess'));
                //                             fetchBaseFingerprintCount();
                //                         } else {
                //                             alert(t('importFailed') + ': ' + (data.message || t('unknownError')));
                //                         }
                //                     }).catch((error) => {
                //                         console.error(t('importError'), error);
                //                         alert(t('importFailed'));
                //                     });
                //                 }
                //             });
                //         }
                //     }
                // ],
                // [
                //     {
                //         type: 'label',
                //         text: t('baseFingerprintNumber'),
                //         colWidth: 6,
                //     },
                //     {
                //         type: 'text',
                //         key: 'baseFingerprintCount',
                //         text: baseFingerprintCount || 0,
                //         colWidth: 2,
                //         style: { marginLeft: 'auto', marginRight: '1rem', },
                //     },
                //     {
                //         type: 'button',
                //         text: t('clearBaseFPButton'),
                //         colWidth: 2,
                //         style: { marginLeft: 'auto', marginRight: '1rem', },
                //         click: () => {
                //             // console.log('clearBaseFPButton clicked');
                //             api.clearFingerPrints().then((data) => {
                //                 if (data && data.success) {
                //                     alert(t('clearSuccess'));
                //                     fetchBaseFingerprintCount();
                //                 } else {
                //                     alert(t('clearFailed') + ': ' + (data.message || t('unknownError')));
                //                 }
                //             }).catch((error) => {
                //                 console.error(t('clearError'), error);
                //                 alert(t('clearFailed'));
                //             });
                //         }
                //     }
                // ],
                [
                    {
                        type: 'label',
                        text: t('generateFingerprintCount'),
                        colWidth: 5,
                    },
                    {
                        type: 'input',
                        key: 'generateCount',
                        inputType: 'number',
                        colWidth: 3,
                        style: { marginLeft: 'auto', marginRight: '1rem', },
                        inputProps: { min: 1, step: 1, inputMode: 'numeric', pattern: '[0-9]*' },
                        onChange: (e, _value, valueObj) => {
                            const value = e.target.value;
                            if (value === '') {
                                return '';
                            }
                            if (/^\d+$/.test(value)) {
                                return value;
                            }
                            return valueObj?.generateCount ?? '';
                        }
                    },
                    {
                        type: 'button',
                        text: t('generateButton'),
                        colWidth: 3,
                        style: { textAlign: 'center', minWidth: '80px' },
                        click: () => {
                            console.log('generateButton clicked');
                            console.log('modalRef.current.valueObj:', modalRef.current.getValue('generateCount'));
                            const rawCount = modalRef.current.getValue('generateCount');
                            const generateCount = parseInt(rawCount, 10);
                            if (!Number.isFinite(generateCount) || generateCount <= 0) {
                                alert(t('invalidGenerateCount'));
                                return;
                            }
                            api.generateFingerPrints(generateCount).then((data) => {
                                if (data && data.success) {
                                    alert(t('generateSuccess'));
                                    fetchBaseFingerprintCount();
                                    // 刷新指纹列表
                                    refreshFingerPrints();
                                    setModalProps({ show: false });
                                } else {
                                    alert(t('generateFailed') + ': ' + (data.message || t('unknownError')));
                                }
                            }).catch((error) => {
                                console.error(t('generateError'), error);
                                alert(t('generateFailed'));
                            });
                        }
                    }
                ]
            ]

        });
        // modalRef.current.openModal();
    };



    // 选中/取消选中单个环境
    const toggleSelect = (id) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
        );
    };

    const checkEnvDetail = (fp) => {
        setModalProps({
            show: true,
            title: t('envDetail'),
            handleClose: () => {
                setModalProps({
                    show: false
                });
            },
            rowList: [
                [
                    { type: 'label', text: t('envName'), colWidth: 3 },
                    { type: 'text', key: 'envName', text: fp.name || '', colWidth: 9 }
                ],
                [
                    { type: 'label', text: t('userAgent'), colWidth: 3 },
                    { type: 'text', key: 'userAgent', text: fp.user_agent || '', colWidth: 9 }
                ],
                [
                    { type: 'label', text: t('webgl'), colWidth: 3 },
                    { type: 'text', key: 'webgl', text: fp.webgl ? JSON.stringify(fp.webgl) : '', colWidth: 9 }
                ],
                [
                    { type: 'label', text: t('languageJs'), colWidth: 3 },
                    { type: 'text', key: 'languageJs', text: fp.language_js || '', colWidth: 9 }
                ],
                [
                    { type: 'label', text: t('languageHttp'), colWidth: 3 },
                    { type: 'text', key: 'languageHttp', text: fp.language_http || '', colWidth: 9 }
                ],
                [
                    { type: 'label', text: t('screen'), colWidth: 3 },
                    { type: 'text', key: 'screen', text: fp.screen ? JSON.stringify(fp.screen) : '', colWidth: 9 }
                ],
                [
                    { type: 'label', text: t('canvas'), colWidth: 3 },
                    { type: 'text', key: 'canvas', text: fp.canvas ? JSON.stringify(fp.canvas) : '', colWidth: 9 }
                ],
                [
                    { type: 'label', text: t('hardware'), colWidth: 3 },
                    { type: 'text', key: 'hardware', text: fp.hardware ? JSON.stringify(fp.hardware) : '', colWidth: 9 }
                ],
                [
                    { type: 'label', text: t('fontsRemove'), colWidth: 3 },
                    { type: 'text', key: 'fontsRemove', text: fp.fonts_remove || '', colWidth: 9 }
                ],
                [
                    { type: 'label', text: t('position'), colWidth: 3 },
                    { type: 'text', key: 'position', text: fp.position ? JSON.stringify(fp.position) : '', colWidth: 9 }
                ],
                [
                    { type: 'label', text: t('timeZone'), colWidth: 3 },
                    { type: 'text', key: 'timeZone', text: fp.timeZone || '', colWidth: 9 }
                ],
                [
                    { type: 'label', text: t('webrtc_public'), colWidth: 3 },
                    { type: 'text', key: 'webrtc_public', text: fp.webrtc_public || '', colWidth: 9 }
                ]

            ]
        });
    }

    // 修改环境名称
    const modifyEnvName = (id) => {
        const fp = fingerPrintsObj[id];
        setModalProps({
            show: true,
            title: t('editEnvName'),
            handleClose: () => {
                setModalProps({
                    show: false,
                });
            },
            rowList: [
                [
                    { type: 'label', text: t('envName'), colWidth: 3 },
                    { type: 'input', key: 'envNameInput', inputType: 'text', colWidth: 7, placeholder: t('inputEnvName'), defaultValue: fp.name || '' },
                    { type: 'button', text: t('save'), colWidth: 2, click: () => {
                        const newName = modalRef.current.getValue('envNameInput');
                        if (!newName) {
                            alert(t('2007'));
                            return;
                        }
                        api.updateFingerPrintName(id, newName).then((data) => {
                            if (data && data.success) {
                                alert(t('0'));
                                const updatedFingerPrints = { ...fingerPrintsObj, [id]: { ...fp, name: newName } };
                                setFingerPrints(updatedFingerPrints);
                            } else {
                                alert(t(data.code) + ': ' + (data.message || t('unknownError')));
                            }
                        }).catch((error) => {
                            console.error(t('2009'), error);
                            alert(t('2009'));
                        });
                        setModalProps({ show: false });
                    }}
                ]
            ]
        });
    }

    // 删除选中环境
    const deleteSelected = async () => {
        if (selectedIds.length === 0) {
            alert(t('noSelected'));
            return;
        }
        // 调用后端批量删除
        const res = await api.deleteFingerPrints(selectedIds);
        if (res && res.success) {
            const removedEnvIds = new Set(selectedIds);
            const walletsToDelete = Array.isArray(wallets)
                ? wallets.filter((w) => w.bindEnvId && removedEnvIds.has(w.bindEnvId)).map((w) => w.id)
                : [];

            if (walletsToDelete.length) {
                const walletRes = await api.deleteWallets(walletsToDelete);
                if (!walletRes || !walletRes.success) {
                    console.error('deleteWallets failed:', walletRes);
                } else {
                    const remainingWallets = wallets.filter((w) => !walletsToDelete.includes(w.id));
                    setWallets(remainingWallets);
                }
            }

            try {
                const storedGroups = localStorage.getItem('syncGroups');
                if (storedGroups) {
                    const parsed = JSON.parse(storedGroups);
                    if (Array.isArray(parsed)) {
                        const removedWalletSet = new Set(walletsToDelete);
                        const filtered = parsed.filter((group) => {
                            const mode = group.mode || 'wallet';
                            if (mode === 'env') {
                                if (removedEnvIds.has(group.master)) return false;
                                const slaves = Array.isArray(group.slaves) ? group.slaves : [];
                                return !slaves.some((id) => removedEnvIds.has(id));
                            }
                            if (removedWalletSet.has(group.master)) return false;
                            const slaves = Array.isArray(group.slaves) ? group.slaves : [];
                            return !slaves.some((id) => removedWalletSet.has(id));
                        });
                        localStorage.setItem('syncGroups', JSON.stringify(filtered));
                    }
                }
            } catch (error) {
                console.error('Failed to update syncGroups:', error);
            }

            // 前端同步移除
            const newObj = { ...fingerPrintsObj };
            selectedIds.forEach(id => { delete newObj[id]; });
            setFingerPrints(newObj);
            setSelectedIds([]);
            alert(t('deleteSuccess'));
        } else {
            alert(t('deleteFailed') + ': ' + (res && res.message ? res.message : t('unknownError', '未知错误')));
        }
    };

    // 打开指纹环境
    const openEnv = (id) => {
        api.execTask('openChrome', { envIds:[id] }).then((res) => {
            console.log('openEnv response:', res);
            if (res && res.success) {
                alert(t('openEnvSuccess', res.message));
            } else {
                alert(t('openEnvFailed') + ': ' + (res.message || t('unknownError', '未知错误')));
            }
        }).catch((error) => {
            console.error(t('openEnvError', '打开环境错误'), error);
            alert(t('openEnvFailed') + ': ' + (error.message || t('unknownError', '未知错误')));
        });
    }

    // 设置IP代理
    const setIpConfig = async (id) => {
        let fp = fingerPrintsObj[id];
        try {
            const latest = await api.getFingerPrints();
            if (latest && latest.success && latest.data && latest.data[id]) {
                fp = latest.data[id];
            }
        } catch (error) {
            console.error('Failed to fetch latest fingerprint:', error);
        }
        console.log('setIpConfig fp:', fp.name);
        const hasProxy = Boolean(fp?.proxy?.ipHost && fp?.proxy?.ipPort);
        const ipTypeDefault = hasProxy ? (fp?.proxy?.ipType || fp?.proxy_type || 'http') : 'http';
        const ipHostDefault = hasProxy ? (fp?.proxy?.ipHost || '') : '';
        const ipPortDefault = hasProxy ? (fp?.proxy?.ipPort || '') : '';
        const ipUsernameDefault = hasProxy ? (fp?.proxy?.ipUsername || '') : '';
        const ipPasswordDefault = hasProxy ? (fp?.proxy?.ipPassword || '') : '';
        console.log('Proxy defaults:', { ipTypeDefault, ipHostDefault, ipPortDefault, ipUsernameDefault, ipPasswordDefault });
        setModalProps({
            show: true,
            title: t('configProxy'),
            handleClose: () => {
                setModalProps({
                    show: false,
                });
            },
            rowList: [
                [
                    { type: 'label', text: t('envName'), colWidth: 3 },
                    { type: 'text', key: 'envName', text: fp.name || '', colWidth: 9 }
                ],
                [
                    { type: 'label', text: t('proxyType'), colWidth: 3 },
                    { type: 'select', key: 'ipType', colWidth: 7, options: [
                        { text: 'HTTP', value: 'http' },
                        { text: 'SOCKET', value: 'socket' }
                    ], defaultValue: ipTypeDefault },
                ],
                [
                    { type: 'label', text: t('proxyIpAddress'), colWidth: 3 },
                    { type: 'input', key: 'ipHost', inputType: 'text', colWidth: 7, placeholder: t('inputProxyIp'), defaultValue: ipHostDefault },
                ],
                [
                    { type: 'label', text: t('proxyPort'), colWidth: 3 },
                    { type: 'input', key: 'ipPort', inputType: 'number',colWidth: 7, placeholder: t('inputProxyPort'), defaultValue: ipPortDefault },
                ],
                [
                    { type: 'label', text: t('proxyUsername'), colWidth: 3 },
                    { type: 'input', key: 'ipUsername', inputType: 'text', colWidth: 7, placeholder: t('inputProxyUsername'), defaultValue: ipUsernameDefault },
                ],
                [
                    { type: 'label', text: t('proxyPassword'), colWidth: 3 },
                    { type: 'input', key: 'ipPassword', inputType: 'password', colWidth: 7, placeholder: t('inputProxyPassword'), defaultValue: ipPasswordDefault },
                ],
                [
                    { type: 'label', text: '', colWidth: 2 },
                    { type: 'button', text: t('testProxy'), colWidth: 3, 
                        click: () => {
                            const ipType = modalRef.current.getValue('ipType') || 'http';
                            const ipHost = modalRef.current.getValue('ipHost');
                            const ipPort = modalRef.current.getValue('ipPort');
                            const ipUsername = modalRef.current.getValue('ipUsername');
                            const ipPassword = modalRef.current.getValue('ipPassword');
                            if (!ipHost || !ipPort) {
                                alert(t('2019'));
                                return;
                            }
                            console.log('Testing proxy:', ipType, ipHost, ipPort, ipUsername, ipPassword);
                            api.checkProxy({ipType, ipHost, ipPort, ipUsername, ipPassword}).then((data) => {
                                if (data && data.success) {
                                    alert(t('0'));
                                    console.log('Proxy test result:', data);
                                } else {
                                    alert(t(data.code) + ': ' + (data.message || t('unknownError')));
                                }
                            }).catch((error) => {
                                console.error(t('4006'), error);
                                alert(t('4006'));
                            });
                        }},
                    { type: 'button', text: t('deleteProxy'), colWidth: 3, click: () => {
                        api.deleteFingerPrintProxy(id).then((data) => {
                            if (data && data.success) {
                                alert(t('updateSuccess'));
                                const newFingerPrints = { ...fingerPrintsObj, [id]: { ...fp, proxy: null } };
                                setFingerPrints(newFingerPrints);
                                setModalProps({ show: false });
                            } else {
                                alert(t('updateFailed') + ': ' + (data.message || t('unknownError', '未知错误')));
                            }
                        }).catch((error) => {
                            console.error(t('updateError', '更新错误:'), error);
                            alert(t('updateFailed', '更新失败'));
                        });
                    } },
                    { type: 'button', text: t('saveConfig'), colWidth: 3, click: () => {
                        const ipType = modalRef.current.getValue('ipType') || 'http';
                        const ipHost = modalRef.current.getValue('ipHost');
                        const ipPort = modalRef.current.getValue('ipPort');
                        const ipUsername = modalRef.current.getValue('ipUsername');
                        const ipPassword = modalRef.current.getValue('ipPassword');

                        if (!ipHost || !ipPort) {
                            alert(t('2019'));
                            return;
                        }

                        api.updateFingerPrintProxy(id, {
                            ipType,
                            ipHost,
                            ipPort,
                            ipUsername,
                            ipPassword
                        }).then((data) => {
                            if (data && data.success) {
                                alert(t('updateSuccess'));
                                // 更新本地状态
                                const newFingerPrints = { ...fingerPrintsObj, [id]: { ...fp, proxy: data.data?.proxy || fp?.proxy } };
                                setFingerPrints(newFingerPrints);
                                setModalProps({ show: false });
                            } else {
                                alert(t('updateFailed') + ': ' + (data.message || t('unknownError', '未知错误')));
                            }
                        }).catch((error) => {
                            console.error(t('updateError', '更新错误:'), error);
                            alert(t('updateFailed', '更新失败'));
                        });
                    } },
                    
                ]
            ]
        });
        setTimeout(() => {
            if (!modalRef.current) return;
            modalRef.current.updateValueObj('ipType', ipTypeDefault);
            modalRef.current.updateValueObj('ipHost', ipHostDefault);
            modalRef.current.updateValueObj('ipPort', ipPortDefault);
            modalRef.current.updateValueObj('ipUsername', ipUsernameDefault);
            modalRef.current.updateValueObj('ipPassword', ipPasswordDefault);
        }, 0);
    }


    return (
        <Container className="chrome-manager-page">
            <h1>{t('chromeManage')}</h1>
            <Card className="control-panel mb-4">
                <Card.Body>
                    <div className="panel-labels mb-3">
                        <Row className="align-items-center mb-2">
                            <Col className="d-flex align-items-center" style={{ minWidth: 0 }}>
                                <span className="label-title">{t('currentChromePath')}：</span>
                                <span
                                    className="label-value"
                                    style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        maxWidth: 220
                                    }}
                                >
                                    {chromePath
                                        ? chromePath
                                        : <span className="text-warning">{t('notConfigured')}</span>
                                    }
                                </span>
                            </Col>
                            <Col xs="auto" className="text-end ms-auto">
                                <Button className="btn-chrome-path" onClick={setChromePathHandler}>
                                    {chromePath ? t('change') : t('setChromePath')}
                                </Button>
                            </Col>
                        </Row>
                        <Row className="align-items-center mb-2">
                            <Col className="d-flex align-items-center" style={{ minWidth: 0 }}>
                                <span className="label-title">{t('currentSavePath')}：</span>
                                <span
                                    className="label-value"
                                    style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        maxWidth: 220
                                    }}
                                >
                                    {savePath
                                        ? savePath
                                        : <span className="text-warning">{t('notConfigured')}</span>
                                    }
                                </span>
                            </Col>
                            <Col xs="auto" className="text-end ms-auto">
                                <Button className="btn-config-path" onClick={setSavePathHandler}>
                                    {savePath ? t('change') : t('setSavePath')}
                                </Button>
                            </Col>
                        </Row>
                    </div>
                    <div className="btn-row">
                        <Button className="btn-generate-fingerprint" onClick={openGenerateFingerprintModal}>
                            {t('generateFingerprint')}
                        </Button>
                    </div>
                </Card.Body>
            </Card>
            <CustomModal ref={modalRef} {...modalProps} />

            {/* 新增：指纹环境列表展示 */}
            <Card className="fingerprint-list-card mt-4">
                <Card.Header className="d-flex justify-content-between align-items-center">
                    <div className="header-checkbox-align">
                        <input
                            ref={selectAllRef}
                            type="checkbox"
                            checked={Array.isArray(fingerPrints) && fingerPrints.length > 0 && selectedIds.length === fingerPrints.length}
                            onChange={e => {
                                if (e.target.checked) {
                                    setSelectedIds(fingerPrints.map(fp => fp.id));
                                } else {
                                    setSelectedIds([]);
                                }
                            }}
                            style={{ marginRight: 8 }}
                        />
                        <span>{t('fingerprintEnvs')}</span>
                    </div>
                    <Button size="sm" variant="danger" onClick={deleteSelected}>{t('deleteSelected')}</Button>
                </Card.Header>
                <Card.Body className="fingerprint-list-scroll">
                    {Array.isArray(sortedFingerPrints) && sortedFingerPrints.length > 0 ? (
                        sortedFingerPrints.map((fp, idx) => (
                            <Row key={fp.id || idx} className="align-items-center fingerprint-row">
                                <Col xs={1} className="d-flex align-items-center p-0">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(fp.id)}
                                        onChange={() => toggleSelect(fp.id)}

                                    />
                                </Col>
                                <Col xs={4} className="env-name text-truncate p-0" title={fp.name}>{fp.name}</Col>
                                <Col xs="auto" className="p-0">
                                    <Button size="sm" variant="outline-primary" className="me-1" onClick={() => modifyEnvName(fp.id)}>{t('edit')}</Button>
                                    <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => setIpConfig(fp.id)}>{t('configProxy')}</Button>
                                    <Button size="sm" variant="outline-info" className="me-1" onClick={()=>checkEnvDetail(fp)}>{t('viewDetail')}</Button>
                                    <Button size="sm" variant="outline-success" onClick={() => openEnv(fp.id)}>{t('open')}</Button>
                                </Col>
                            </Row>
                        ))
                    ) : null}
                    {(!Array.isArray(fingerPrints) || fingerPrints.length === 0) && (
                        <div className="text-muted">{t('noFingerprints')}</div>
                    )}
                </Card.Body>
            </Card>
        </Container>
    );
}
export default ChromeManager;