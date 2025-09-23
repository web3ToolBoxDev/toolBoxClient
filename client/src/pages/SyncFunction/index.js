import React, { useState, useRef } from 'react';
import { Container, Card, Row, Col, Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import CustomModal from '../../components/customModal';
import useWalletStore from '../../store/walletStore';
import { useEffect } from 'react';


const SyncFunction = () => {
    const { t } = useTranslation();
    const [selectedMaster, setSelectedMaster] = useState(null);
    const [selectedSlaves, setSelectedSlaves] = useState([]);
    const [groups, setGroups] = useState([]); // [{master, slaves, status}]
    const [modalProp, setModalProp] = useState({ show: false });
    const wallets = useWalletStore((state) => state.wallets);
    const fetchWallets = useWalletStore((state) => state.fetchWallets);
    const childRef = useRef();
    const [walletList, setWalletList] = useState([]);



    useEffect(() => {
        fetchWallets().then(() => {
            // 处理获取到的钱包数据
            console.log('Fetched wallets:', wallets);
            setWalletList(wallets.filter(w => w.walletInitialized));
        });
    }, []);



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
        setGroups([...groups, { master: selectedMaster, slaves: [...selectedSlaves], status: 'stopped' }]);
        setSelectedMaster(null);
        setSelectedSlaves([]);
    };
    // 启动group
    const handleStartGroup = (idx) => {
        setGroups(groups.map((g, i) => i === idx ? { ...g, status: 'running' } : g));
        alert(t('sync.groupStarted'));
    };

    // 展示已选master/slaves
    const masterName = walletList.find(w => w.id === selectedMaster)?.name || t('sync.noMaster');
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
                    <Row>
                        <Col className="text-center">
                            <Button className="btn" onClick={openMasterModal}>
                                {t('sync.chooseMaster')}
                            </Button>
                            <div style={{ marginTop: 8, fontSize: 13, color: '#888' }}>{t('sync.selectedMaster')}: {masterName}</div>
                        </Col>
                        <Col className="text-center">
                            <Button className="btn" onClick={openSlavesModal}>
                                {t('sync.chooseSlaves')}
                            </Button>
                            <div style={{ marginTop: 8, fontSize: 13, color: '#888' }}>
                                {t('sync.selectedSlaves')}: {
                                    selectedSlaves.length === 0 ? t('sync.noSlaves') :
                                    getDisplayNames(selectedSlaves.map(id => walletList.find(w => w.id === id)?.name).filter(Boolean), 2, 8, t('sync.unit'), t)
                                }
                            </div>
                        </Col>
                        <Col className="text-center">
                            <Button className="btn" onClick={handleAddGroup}>
                                {t('sync.addGroup')}
                            </Button>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>
            <CustomModal ref={childRef} {...modalProp} />
            {/* group列表部分 */}
            <Card className="browser-list-card mt-4">
                <Card.Header className="d-flex justify-content-between align-items-center">
                    <div className="header-checkbox-align">
                        <span>{t('sync.groupList')}</span>
                    </div>
                </Card.Header>
                <Card.Body className="browser-list-scroll">
                    {groups.length > 0 ? (
                        groups.map((group, idx) => (
                            <Row key={idx} className="align-items-center browser-row">
                                <Col xs={3} className="browser-name text-truncate p-0" title={group.master}>
                                    <span style={{ color: '#007bff', fontWeight: 600 }}>{walletList.find(w => w.id === group.master)?.name || group.master}</span>
                                </Col>
                                <Col xs={5} className="p-0">
                                    {(() => {
                                        const names = group.slaves.map(id => walletList.find(w => w.id === id)?.name).filter(Boolean);
                                        return getDisplayNames(names, 2, 8, t('sync.unit'), t);
                                    })()}
                                </Col>
                                <Col xs={2} className="p-0">
                                    <span style={{
                                        padding: '2px 8px',
                                        borderRadius: 8,
                                        fontSize: 12,
                                        background: group.status === 'running' ? '#28a745' : '#6c757d',
                                        color: '#fff',
                                    }}>
                                        {group.status === 'running' ? t('sync.status.running') : t('sync.status.stopped')}
                                    </span>
                                </Col>
                                <Col xs="auto" className="p-0">
                                    <Button size="sm" variant="outline-success" onClick={() => handleStartGroup(idx)} disabled={group.status === 'running'}>
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
