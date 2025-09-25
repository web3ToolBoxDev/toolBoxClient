import React, { useState, useRef } from 'react';
import { Container, Card, Row, Col, Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import CustomModal from '../../components/customModal';
import useWalletStore from '../../store/walletStore';
import APIManager from '../../utils/api';
import { useEffect } from 'react';
import './index.scss';


const SyncFunction = () => {
    const { t } = useTranslation();
    const apiManager = APIManager.getInstance();
    const [selectedMaster, setSelectedMaster] = useState(null);
    const [selectedSlaves, setSelectedSlaves] = useState([]);
    const [groups, setGroups] = useState([]); // [{master, slaves, id}]
    const [selectedGroupIds, setSelectedGroupIds] = useState([]);
    const [modalProp, setModalProp] = useState({ show: false });
    const wallets = useWalletStore((state) => state.wallets);
    const fetchWallets = useWalletStore((state) => state.fetchWallets);
    const childRef = useRef();
    const [walletList, setWalletList] = useState([]);



    // 从 localStorage 加载 groups
    const loadGroupsFromStorage = () => {
        try {
            const storedGroups = localStorage.getItem('syncGroups');
            if (storedGroups) {
                const parsedGroups = JSON.parse(storedGroups);
                setGroups(parsedGroups.map((group, index) => ({ ...group, id: group.id || `group_${index}` })));
            }
        } catch (error) {
            console.error('Failed to load groups from localStorage:', error);
        }
    };

    // 保存 groups 到 localStorage
    const saveGroupsToStorage = (newGroups) => {
        try {
            localStorage.setItem('syncGroups', JSON.stringify(newGroups));
        } catch (error) {
            console.error('Failed to save groups to localStorage:', error);
        }
    };

    useEffect(() => {
        fetchWallets().then(() => {
            // 处理获取到的钱包数据
            console.log('Fetched wallets:', wallets);
            setWalletList(wallets.filter(w => w.walletInitialized));
        });
        // 加载存储的 groups
        loadGroupsFromStorage();
    }, []);



    // 启动当前选择（master/slaves）的同步任务
    const startSyncForCurrentSelection = async (masterId, slaveIds) => {
        try {
            // 将 walletId 映射为其绑定的指纹环境 ID（bindEnvId）
            const masterEnvId = walletList.find(w => w.id === masterId)?.bindEnvId;
            const slaveEnvIds = (slaveIds || [])
                .map(id => walletList.find(w => w.id === id)?.bindEnvId)
                .filter(Boolean);

            // 简单校验
            if (!masterEnvId) {
                alert(t('sync.masterNotBoundEnv') || 'Master wallet not bound to an environment');
                return false;
            }
            if (slaveEnvIds.length === 0) {
                alert(t('sync.noValidSlavesEnv') || 'No valid slave environments found');
                return false;
            }

            // 去重
            const envIds = Array.from(new Set([masterEnvId, ...slaveEnvIds]));
            console.log('Starting syncFunction task with envIds:', envIds, 'masterId:', masterId, 'slaveIds:', slaveIds);
            const result = await apiManager.execTask('syncFunction', {
                envIds,
                masterId,
                slaveIds
            });
            if (result && result.success) {
                // 可选：给出成功提示
                // alert(t('sync.groupStarted'));
                return true;
            }
            // alert(t('sync.startFailed'));
            return false;
        } catch (error) {
            console.error('startSyncForCurrentSelection error:', error);
            // alert(t('sync.startError'));
            return false;
        }
    };


    // 打开选择master钱包modal
    const openMasterModal = (searchValue = '') => {
        setModalProp({
            show: true,
            title: t('sync.chooseMaster'),
            handleClose: () => setModalProp({ show: false }),
            rowList: [
                [
                    { type: 'input', key: 'walletSearch', inputType: 'text', colWidth: 8, placeholder: t('searchWalletName'), defaultValue: searchValue },
                    {
                        type: 'button', text: t('search'), colWidth: 4, click: () => {
                            const searchVal = childRef.current?.getValue('walletSearch') || '';
                            openMasterModal(searchVal);
                        }
                    }
                ],
                [
                    {
                        type: 'select',
                        key: 'walletId',
                        colWidth: 12,
                        options: walletList
                            .filter(w => {
                                if (selectedSlaves.includes(w.id)) return false;
                                if (typeof searchValue === 'string' && searchValue) {
                                    return w.name.toLowerCase().includes(searchValue.toLowerCase());
                                }
                                return true;
                            })
                            .map(w => ({ value: w.id, text: w.name })),
                        defaultValue: selectedMaster || (walletList.filter(w => !selectedSlaves.includes(w.id))[0]?.id || ''),
                        placeholder: t('selectWallet'),
                    }
                ],
                [
                    {
                        type: 'button',
                        text: t('confirmButton'),
                        colWidth: 12,
                        click: () => {
                            const walletId = childRef.current.getValue('walletId');
                            setSelectedMaster(walletId);
                            childRef.current?.updateValueObj('walletSearch', '');
                            setModalProp({ show: false });
                        }
                    }
                ]
            ]
        });
    };

    // 打开选择slaves环境modal
    const openSlavesModal = (searchValue = '') => {
        setModalProp({
            show: true,
            title: t('sync.chooseSlaves'),
            handleClose: () => setModalProp({ show: false }),
            rowList: [
                [
                    { type: 'input', key: 'envSearch', inputType: 'text', colWidth: 8, placeholder: t('searchEnvName'), defaultValue: searchValue },
                    {
                        type: 'button', text: t('search'), colWidth: 4, click: () => {
                            const searchVal = childRef.current?.getValue('envSearch') || '';
                            
                            openSlavesModal(searchVal);
                        }
                    }
                ],
                [
                    {
                        type: 'select',
                        key: 'envIds',
                        colWidth: 12,
                        options: walletList
                            .filter(e => {
                                if (selectedMaster && e.id === selectedMaster) return false;
                                if (typeof searchValue === 'string' && searchValue) {
                                    return e.name.toLowerCase().includes(searchValue.toLowerCase());
                                }
                                return true;
                            })
                            .map(e => ({ value: e.id, text: e.name })),
                        defaultValue: selectedSlaves || [],
                        placeholder: t('selectEnv'),
                        multiple: true
                    }
                ],
                [
                    {
                        type: 'button',
                        text: t('confirmButton'),
                        colWidth: 12,
                        click: () => {
                            let envIds = childRef.current.getValue('envIds');
                            if (typeof envIds === 'string') envIds = envIds ? [envIds] : [];
                            setSelectedSlaves(envIds);
                            childRef.current?.updateValueObj('envSearch', '');
                            setModalProp({ show: false });
                        }
                    }
                ]
            ]
        });
    };

    // 选中/取消选中单个 group
    const toggleSelectGroup = (groupId) => {
        setSelectedGroupIds((prev) =>
            prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
        );
    };

    // 全选/取消全选
    const toggleSelectAllGroups = () => {
        if (selectedGroupIds.length === groups.length) {
            setSelectedGroupIds([]);
        } else {
            setSelectedGroupIds(groups.map(g => g.id));
        }
    };

    // 添加group
    const handleAddGroup = () => {
        if (!selectedMaster || selectedSlaves.length === 0) {
            alert(t('sync.selectMasterAndSlaves'));
            return;
        }
        const exists = groups.some(g => g.master === selectedMaster && JSON.stringify(g.slaves.sort()) === JSON.stringify([...selectedSlaves].sort()));
        if (exists) {
            alert(t('sync.groupExists'));
            return;
        }
        // 先缓存当前选择，供启动任务使用
        const masterId = selectedMaster;
        const slaveIds = [...selectedSlaves];

        const newGroup = { 
            id: `group_${Date.now()}`, 
            master: masterId, 
            slaves: [...slaveIds]
        };
        const newGroups = [...groups, newGroup];
        setGroups(newGroups);
        saveGroupsToStorage(newGroups);

        // 调用后端启动同步任务
        startSyncForCurrentSelection(masterId, slaveIds).then((ok) => {
            if (ok) {
                alert(t('sync.groupStarted'));
            } else {
                alert(t('sync.startFailed'));
            }
        });

        // 重置当前选择
        setSelectedMaster(null);
        setSelectedSlaves([]);
    };
    // 启动group
    const handleStartGroup = (idx) => {
        const g = groups[idx];
        if (!g) return;
        startSyncForCurrentSelection(g.master, g.slaves).then((ok) => {
            if (ok) {
                alert(t('sync.groupStarted'));
            } else {
                alert(t('sync.startFailed'));
            }
        });
    };

    // 删除选中的 groups
    const deleteSelectedGroups = () => {
        if (selectedGroupIds.length === 0) {
            alert(t('noSelected'));
            return;
        }
        
        if (window.confirm(t('sync.confirmDeleteGroups', { count: selectedGroupIds.length }))) {
            const newGroups = groups.filter(g => !selectedGroupIds.includes(g.id));
            setGroups(newGroups);
            saveGroupsToStorage(newGroups);
            setSelectedGroupIds([]);
            alert(t('deleteSuccess'));
        }
    };

    // 设置同步脚本目录
    const setSyncScriptDirectory = async () => {
        // 获取当前脚本目录状态
        let currentDirectory = 'default';
        try {
            const result = await apiManager.getSyncScriptDirectory();
            if (result.success && result.directory !== 'default') {
                currentDirectory = result.directory;
            }
        } catch (error) {
            console.error('获取当前脚本目录失败:', error);
        }

        setModalProp({
            show: true,
            title: t('setSyncScriptDirectory'),
            handleClose: () => setModalProp({ show: false }),
            rowList: [
                [
                    { type: 'label', text: t('syncScriptDirectory.current'), colWidth: 4 },
                    { type: 'text', key: 'currentDir', text: currentDirectory, colWidth: 8 }
                ],
                [
                    { type: 'label', text: t('syncScriptDirectory.selectNew'), colWidth: 4 },
                    { 
                        type: 'input', 
                        key: 'directoryPath', 
                        inputType: 'text', 
                        colWidth: 5, 
                        placeholder: t('syncScriptDirectory.placeholder'), 
                        defaultValue: '' 
                    },
                    {
                        type: 'button',
                        text: t('syncScriptDirectory.selectFolder'),
                        colWidth: 3,
                        click: async () => {
                            try {
                                if (!window.electronAPI) {
                                    alert(t('runInElectron'));
                                    return;
                                }
                                const scriptDirectory = await window.electronAPI.chooseDirectory({});
                                if (scriptDirectory) {
                                    childRef.current?.updateValueObj('directoryPath', scriptDirectory);
                                }

                            } catch (error) {
                                console.error('选择文件夹失败:', error);
                                alert(t('syncScriptDirectory.selectError'));
                            }
                        }
                    }
                ],
                [
                    {
                        type: 'button',
                        text: t('confirmButton'),
                        colWidth: 6,
                        click: async () => {
                            const directoryPath = childRef.current?.getValue('directoryPath');
                            if (!directoryPath || directoryPath.trim() === '') {
                                alert(t('syncScriptDirectory.pathRequired'));
                                return;
                            }

                            try {
                                const result = await apiManager.setSyncScriptDirectory(directoryPath);
                                if (result.success) {
                                    alert(t('syncScriptDirectory.setSuccess'));
                                    setModalProp({ show: false });
                                } else {
                                    alert(t('syncScriptDirectory.setFailed') + ': ' + (result.message || ''));
                                }
                            } catch (error) {
                                console.error('设置脚本目录失败:', error);
                                alert(t('syncScriptDirectory.setError'));
                            }
                        }
                    },
                    {
                        type: 'button',
                        text: t('resetToDefault'),
                        colWidth: 6,
                        click: async () => {
                            try {
                                const result = await apiManager.resetSyncScriptDirectory();
                                if (result.success) {
                                    alert(t('syncScriptDirectory.resetSuccess'));
                                    setModalProp({ show: false });
                                } else {
                                    alert(t('syncScriptDirectory.resetFailed'));
                                }
                            } catch (error) {
                                console.error('重置脚本目录失败:', error);
                                alert(t('syncScriptDirectory.resetError'));
                            }
                        }
                    }
                ]
            ]
        });
    };

    // 展示已选master/slaves
    const masterWalletName = walletList.find(w => w.id === selectedMaster)?.name || t('sync.noMaster');
    const masterName = masterWalletName === t('sync.noMaster') ? masterWalletName : 
        (masterWalletName.length > 15 ? masterWalletName.slice(0, 15) + '...' : masterWalletName);
    // 名称截断与tooltip显示工具
    function getDisplayNames(names, maxShow, maxNameLen, unit, t) {
        const ellipsis = (str, len) => str.length > len ? str.slice(0, len) + '...' : str;
        const showArr = names.slice(0, maxShow).map(n => ellipsis(n, maxNameLen));
        const showNames = showArr.join(', ');
        const moreCount = names.length - maxShow;
        const tooltip = names.join(', ');
        return (
            <span style={{ color: '#6c757d' }} title={tooltip}>
                {showNames}
                {moreCount > 0 ? ` ...(${names.length}${unit})` : ''}
            </span>
        );
    }

    return (
        <Container className="sync-function-page">
            <h1 style={{ textAlign: 'center' }}>{t('syncFunction.title')}</h1>
            {/* 控制面板 */}
            <Card className="control-panel mb-4">
                <Card.Body>
                    <div className="btn-row">
                        <Button className="btn" onClick={() => openMasterModal()}>
                            {t('sync.chooseMaster')}
                        </Button>
                        <Button className="btn" onClick={() => openSlavesModal()}>
                            {t('sync.chooseSlaves')}
                        </Button>
                        <Button className="btn" onClick={handleAddGroup}>
                            {t('sync.addGroup')}
                        </Button>
                        <Button className="btn" onClick={() => setSyncScriptDirectory()}>
                            {t('setSyncScriptDirectory')}
                        </Button>
                    </div>
                </Card.Body>
            </Card>

            {/* 选择展示面板 */}
            <Card className="selection-display-card mb-4">
                <Card.Header>
                    <span>{t('sync.currentSelection')}</span>
                </Card.Header>
                <Card.Body>
                    <Row className="align-items-center h-100 w-100">
                        <Col md={5} className="selection-section">
                            <div className="selection-label">{t('sync.selectedMaster')}:</div>
                            <div className="selection-content">
                                {selectedMaster ? (
                                    <span className="wallet-badge master-badge" title={walletList.find(w => w.id === selectedMaster)?.name}>
                                        <i className="fas fa-crown"></i> {masterName}
                                    </span>
                                ) : (
                                    <span className="empty-selection">{t('sync.noMaster')}</span>
                                )}
                            </div>
                        </Col>
                        <Col md={2} className="text-center d-flex align-items-center justify-content-center">
                            <div className="arrow-separator">→</div>
                        </Col>
                        <Col md={5} className="selection-section">
                            <div className="selection-label">{t('sync.selectedSlaves')}:</div>
                            <div className="selection-content">
                                {selectedSlaves.length === 0 ? (
                                    <span className="empty-selection">{t('sync.noSlaves')}</span>
                                ) : (
                                    <div className="slaves-container">
                                        {selectedSlaves.slice(0, 3).map(slaveId => {
                                            const slaveName = walletList.find(w => w.id === slaveId)?.name;
                                            const displayName = slaveName && slaveName.length > 12 ? slaveName.slice(0, 12) + '...' : slaveName;
                                            return (
                                                <span key={slaveId} className="wallet-badge slave-badge" title={slaveName}>
                                                    <i className="fas fa-user"></i> {displayName}
                                                </span>
                                            );
                                        })}
                                        {selectedSlaves.length > 3 && (
                                            <span className="more-count">+{selectedSlaves.length - 3} {t('sync.more')}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <CustomModal ref={childRef} {...modalProp} />
            {/* group列表部分 */}
            <Card className="group-list-card mt-4">
                <Card.Header className="d-flex justify-content-between align-items-center">
                    <div className="header-checkbox-align">
                        <input
                            type="checkbox"
                            checked={groups.length > 0 && selectedGroupIds.length === groups.length}
                            indeterminate={selectedGroupIds.length > 0 && selectedGroupIds.length < groups.length}
                            onChange={toggleSelectAllGroups}
                            style={{ marginRight: 8 }}
                        />
                        <span>{t('sync.groupList')}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                        <Button size="sm" variant="danger" onClick={deleteSelectedGroups}>{t('deleteSelected')}</Button>
                    </div>
                </Card.Header>
                <Card.Body className="group-list-scroll">
                    {groups.length > 0 ? (
                        groups.map((group, idx) => (
                            <Row key={group.id} className="align-items-center group-row">
                                <Col xs={1} className="d-flex align-items-center p-0">
                                    <input
                                        type="checkbox"
                                        checked={selectedGroupIds.includes(group.id)}
                                        onChange={() => toggleSelectGroup(group.id)}
                                    />
                                </Col>
                                <Col xs={3} className="group-name text-truncate p-0" title={walletList.find(w => w.id === group.master)?.name || group.master}>
                                    <span style={{ color: '#007bff', fontWeight: 600 }}>
                                        {(() => {
                                            const fullName = walletList.find(w => w.id === group.master)?.name || group.master;
                                            return fullName.length > 15 ? fullName.slice(0, 15) + '...' : fullName;
                                        })()}
                                    </span>
                                </Col>
                                <Col xs={5} className="p-0">
                                    {(() => {
                                        const names = group.slaves.map(id => walletList.find(w => w.id === id)?.name).filter(Boolean);
                                        return getDisplayNames(names, 2, 8, t('sync.unit'), t);
                                    })()}
                                </Col>
                                {/* 移除状态展示列 */}
                                <Col xs="auto" className="p-0">
                                    <Button size="sm" variant="outline-success" onClick={() => handleStartGroup(idx)}>
                                        {t('sync.startGroup')}
                                    </Button>
                                </Col>
                            </Row>
                        ))
                    ) : (
                        <div className="text-muted">{t('sync.noGroups')}</div>
                    )}
                </Card.Body>
            </Card>
        </Container>
    );
};

export default SyncFunction;
