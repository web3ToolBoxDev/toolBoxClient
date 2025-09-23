import React, { useState, useEffect, useRef } from 'react';
import { Container, Row, Col, Button, Card } from 'react-bootstrap';
import CustomModal from '../../components/customModal';
import APIManager from '../../utils/api';
import { eventEmitter } from '../../utils/eventEmitter';
import { useTranslation } from 'react-i18next';
import usePathStore from '../../store/pathStore';
import useFingerPrintStore from '../../store/fingerPrintStore';
import './index.scss';


const apiManager = APIManager.getInstance();

const DeletingOverlay = ({ show, text }) => {
  if (!show) return null;
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(255,255,255,0.85)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      fontSize: 24,
      color: '#333',
      fontWeight: 500
    }}>
      <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
        <span className="visually-hidden">Loading...</span>
      </div>
      <div>{text}</div>
    </div>
  );
};

const WalletManage = () => {
  const { t } = useTranslation();
  const [modalProp, setModalProp] = useState({ show: false });
  const [walletList, setWalletList] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const savePath = usePathStore((state) => state.savePath);
  const fetchPaths = usePathStore((state) => state.fetchPaths);
  const fingerPrints = useFingerPrintStore((state) => state.fingerPrints);
  const fetchFingerPrints = useFingerPrintStore((state) => state.fetchFingerPrints);

  const childRef = useRef();

  const updateWalletList = async () => {
    const res = await apiManager.getAllWallets();
    console.log('getAllWallets res:', res);
    // Sort by createdAt ascending (oldest first), then by id ascending
    const updatedWalletList = res
      .slice()
      .sort((a, b) => {
        if ((a.createdAt || 0) !== (b.createdAt || 0)) {
          return (a.createdAt || 0) - (b.createdAt || 0);
        }
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return 0;
      })
      .map(wallet => ({ ...wallet, selected: false }));
    setWalletList(updatedWalletList);
  };





  useEffect(() => {
    fetchPaths();
    updateWalletList();


    // 去重集合，避免同一 taskName 多次触发 reload
    const handled = new Set();

    const onTaskCompleted = async (info) => {
      if (!info || !info.taskName) return;
      if (!info.taskName.includes('initWallet')) return;
      // 已处理过同名任务则忽略
      if (handled.has(info.taskName)) return;
      handled.add(info.taskName);

      // 仅在任务成功时刷新；失败仅记录
      if (info.success) {
        setTimeout(() => window.location.reload(), 500);
      } else {
        console.warn('initWallet task failed:', info);
      }
    };

    eventEmitter.on('taskCompleted', onTaskCompleted);

    // cleanup：卸载监听器，防止热重载或重复添加监听
    return () => {
      if (typeof eventEmitter.off === 'function') {
        eventEmitter.off('taskCompleted', onTaskCompleted);
      } else if (typeof eventEmitter.removeListener === 'function') {
        eventEmitter.removeListener('taskCompleted', onTaskCompleted);
      }
    };
  }, []);

  // 选中/取消选中单个钱包
  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.length === walletList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(walletList.map(w => w.id));
    }
  };

  // 编辑钱包名称
  const modifyWalletName = (wallet) => {
    setModalProp({
      show: true,
      title: t('editWalletName'),
      handleClose: () => setModalProp({ ...modalProp, show: false }),
      rowList: [
        [
          { type: 'label', text: t('walletName'), colWidth: 3 },
          { type: 'input', key: 'walletName', inputType: 'text', colWidth: 7, placeholder: t('inputWalletName'), defaultValue: wallet.name || '' },
          {
            type: 'button', text: t('save'), colWidth: 2, click: () => {
              const newName = childRef.current.getValue('walletName');
              if (!newName) {
                alert(t('2007'));
                return;
              }
              apiManager.updateWalletName(wallet.id, newName).then((data) => {
                if (data && data.success) {
                  alert(t('0'));
                  setWalletList(walletList.map(w => w.id === wallet.id ? { ...w, name: newName } : w));
                } else {
                  alert(t(data.code) + ': ' + (data.message || t('unknownError')));
                }
                setModalProp({ show: false });
              });
            }
          }
        ]
      ]
    });
  };

  // 查看钱包详情
  const checkWalletDetail = (wallet) => {
    setModalProp({
      show: true,
      title: t('walletDetail'),
      handleClose: () => setModalProp({ ...modalProp, show: false }),
      rowList: [
        [
          { type: 'label', text: t('walletDetail.id'), colWidth: 3 },
          { type: 'text', key: 'id', text: wallet.id || '', colWidth: 9 }
        ],
        [
          { type: 'label', text: t('walletDetail.name'), colWidth: 3 },
          { type: 'text', key: 'walletName', text: wallet.name || '', colWidth: 9 }
        ],
        [
          { type: 'label', text: t('walletDetail.mnemonic'), colWidth: 3 },
          { type: 'text', key: 'mnemonic', text: wallet.mnemonic || '', colWidth: 9 }
        ],
        [
          { type: 'label', text: t('walletDetail.ethAddress'), colWidth: 3 },
          { type: 'text', key: 'ethAddress', text: wallet.ethAddress || '', colWidth: 9 }
        ],
        [
          { type: 'label', text: t('walletDetail.ethPrivateKey'), colWidth: 3 },
          { type: 'text', key: 'ethPrivateKey', text: wallet.ethPrivateKey || '', colWidth: 9 }
        ],
        [
          { type: 'label', text: t('walletDetail.solAddress'), colWidth: 3 },
          { type: 'text', key: 'solAddress', text: wallet.solAddress || '', colWidth: 9 }
        ],
        [
          { type: 'label', text: t('walletDetail.solPrivateKey'), colWidth: 3 },
          { type: 'text', key: 'solPrivateKey', text: wallet.solPrivateKey || '', colWidth: 9 }
        ]
      ]
    });
  };

  // 绑定指纹环境
  const bindEnv = (wallet, search = '') => {

    const fpKeys = Object.keys(fingerPrints);
    if (search && search.trim() !== '') {
      const filteredKeys = fpKeys.filter(key => fingerPrints[key].name.toLowerCase().includes(search.toLowerCase())
      );
      if (filteredKeys.length === 0) {
        alert(t('noMatchingEnv'));
        return;
      }
    }
    // 计算可选项
    const searchValue = childRef.current?.getValue('envSearch') || '';
    // 只显示未被其它钱包绑定的环境，或已绑定到当前钱包的环境
    const filteredKeys = fpKeys.filter(key => {
      const fp = fingerPrints[key];

      const matchSearch = !searchValue || (fp.name && fp.name.toLowerCase().includes(searchValue.toLowerCase()));

      const notBound = !fp.bindWalletId || fp.bindWalletId === '';

      return matchSearch && notBound;
    });
    const selectOptions = filteredKeys.map(key => ({ value: key, text: fingerPrints[key].name }));

    // 默认选中第一个
    let defaultEnvId = selectOptions.length > 0 ? selectOptions[0].value : '';
    // 修复：每次弹窗打开前重置envId
    if (childRef.current && typeof childRef.current.updateValueObj === 'function') {
      childRef.current.updateValueObj('envId', defaultEnvId);
    }
    setModalProp({
      show: true,
      title: t('bindEnv'),
      handleClose: () => setModalProp({ ...modalProp, show: false }),
      rowList: [
        [
          { type: 'label', text: t('bindEnvTip'), colWidth: 6 },
          wallet.bindEnvId ? { type: 'text', key: 'bindEnvName', text: fingerPrints[wallet.bindEnvId]?.name || t('unknownEnv'), colWidth: 6 } : {}
        ],
        [
          { type: 'input', key: 'envSearch', inputType: 'text', colWidth: 8, placeholder: t('searchEnvName') },
          {
            type: 'button', text: t('search'), colWidth: 4, click: () => {
              const search = childRef.current.getValue('envSearch') || '';
              bindEnv(wallet, search);
            }
          }
        ],
        [
          {
            type: 'select',
            key: 'envId',
            colWidth: 8,
            options: selectOptions,
            defaultValue: defaultEnvId,
            placeholder: t('selectEnv'),
          },
          {
            type: 'button',
            text: t('bind'),
            colWidth: 4,
            click: () => {
              const envId = childRef.current.getValue('envId');
              if (!envId) {
                alert(t('2007'));
                return;
              }
              apiManager.bindWalletEnv(wallet.id, envId).then((data) => {
                if (data && data.success) {
                  alert(t('0'));
                  setModalProp({ show: false });
                  refreshWalletAndFingerPrints();
                } else {
                  alert(t(data.code) + ': ' + (data.message || t('unknownError')));
                }
              });
            }
          }
        ]
      ]
    });
  };

  // 删除选中钱包
  const deleteSelected = () => {
    if (selectedIds.length === 0) {
      alert(t('noSelected'));
      return;
    }
    setDeleting(true);
    console.log('Deleting wallets:', selectedIds);
    apiManager.deleteWallets(selectedIds).then((res) => {
      setDeleting(false);
      if (res && res.success) {
        setWalletList(walletList.filter(w => !selectedIds.includes(w.id)));
        setSelectedIds([]);
        alert(t('deleteSuccess'));
        fetchFingerPrints(); // refresh fingerprint envs
      } else {
        alert(t('deleteFailed') + ': ' + (res && res.message ? res.message : t('unknownError')));
      }
    }).catch((err) => {
      setDeleting(false);
      alert(t('deleteFailed') + ': ' + (err && err.message ? err.message : t('unknownError')));
    });
  };
  const handleModalClose = () => {
    setModalProp({ ...modalProp, show: false });
  };

  const createWallet = () => {
    if (!savePath) {
      alert(t('wallet.alert.setSavePath'));
      return;
    }

    setModalProp({
      show: true,
      handleClose: handleModalClose,
      title: t('wallet.modal.create.title'),

      rowList: [
        [
          {
            type: 'label',
            text: t('wallet.modal.create.countLabel'),
            colWidth: 4,
            style: { textAlign: 'center' },
          },
          {
            type: 'input',
            key: 'count',
            placeholder: t('wallet.modal.create.countPlaceholder'),
            colWidth: 8,
            style: { textAlign: 'left' },
          },
        ],
        [
          {
            type: 'button',
            text: t('wallet.modal.create.createButton'),
            colWidth: 4,
            style: { marginLeft: 'auto' },
            click: () => {
              const countInput = childRef.current.getValue('count');
              console.log('countInput', countInput);
              if (countInput) {
                try {
                  let count = parseInt(countInput);

                  // let curWalletNum = walletList.length;
                  if (isNaN(count) || count <= 0) {
                    alert(t('wallet.modal.create.invalidNumber'));
                    return;
                  }
                  apiManager.createWallets({
                    count,
                  }).then((res) => {
                    console.log(res);
                    if (res.success) {
                      alert(t('wallet.modal.create.successCreated', { count }));
                      handleModalClose();
                      window.location.reload();
                    } else {
                      alert(res.message);
                    }
                  }
                  );
                } catch (error) {
                  console.error('Create wallet failed:', error);
                  alert(t('wallet.modal.create.failedGeneric'));
                }

              }
            },
          },
        ],
      ],
    });
  };

  // 导出钱包
  const exportWallet = () => {
    setModalProp({
      show: true,
      handleClose: handleModalClose,
      title: t('exportWallet'),
      rowList: [
        [
          {
            type: 'label',
            text: t('chooseExportDirectory'),
            colWidth: 4,
            style: { textAlign: 'center', fontWeight: 'bold' },
          },
          {
            type: 'text',
            key: 'directory',
            text: childRef.current?.getValue('directory') || '',
            colWidth: 4,
            style: { textAlign: 'left', fontStyle: 'italic', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          },
          {
            type: 'button',
            text: t('chooseDirectory'),
            colWidth: 4,
            style: { textAlign: 'left' },
            click: async () => {
              if (!window.electronAPI) {
                alert(t('runInElectron'));
                return;
              }
              const directory = await window.electronAPI.chooseDirectory();
              if (directory) {
                childRef.current.updateValueObj('directory', directory);
                setModalProp((prev) => ({ ...prev })); // 强制刷新弹窗内容
              }
            }
          },
        ],
        [
          {
            type: 'button',
            text: t('exportWallet'),
            colWidth: 4,
            style: { marginLeft: 'auto' },
            click: () => {
              const directory = childRef.current.getValue('directory');
              if (directory) {
                const ids = selectedIds.length > 0 ? selectedIds : walletList.map(w => w.id);
                if (!Array.isArray(ids) || ids.length === 0) {
                  alert(t('noSelected'));
                  return;
                }
                apiManager.exportWallets(ids, directory).then((res) => {
                  if (res.success) {
                    alert(t('exportSuccess'));
                    handleModalClose();
                  } else {
                    alert(res.message);
                  }
                });
              } else {
                alert(t('invalidExportDirectory'));
              }
            },
          },
        ],
      ],
    });
  }

  const importWallet = () => {
    setModalProp({
      show: true,
      handleClose: handleModalClose,
      title: t('importWallet'),
      rowList: [
        [
          {
            type: 'label',
            text: t('chooseImportFile'),
            colWidth: 4,
            style: { textAlign: 'center', fontWeight: 'bold' },
          },
          {
            type: 'text',
            key: 'filePath',
            text: childRef.current?.getValue('filePath') || '',
            colWidth: 4,
            style: { textAlign: 'left', fontStyle: 'italic', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          },
          {
            type: 'button',
            text: t('chooseFile'),
            colWidth: 4,
            style: { textAlign: 'left' },
            click: async () => {
              if (!window.electronAPI) {
                alert(t('runInElectron'));
                return;
              }
              const filePath = await window.electronAPI.openFile({ filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
              if (filePath) {
                childRef.current.updateValueObj('filePath', filePath);
                setModalProp((prev) => ({ ...prev })); // 强制刷新弹窗内容
              }
            }
          },
        ],
        [
          {
            type: 'button',
            text: t('importWallet'),
            colWidth: 4,
            style: { marginLeft: 'auto' },
            click: () => {
              const filePath = childRef.current.getValue('filePath');
              if (filePath) {
                apiManager.importWallets(filePath).then((res) => {
                  if (res.success) {
                    alert(t('importSuccess') + `: ${res.message}`);
                  } else {
                    alert(t('importFailed') + ': ' + (res.message || t('unknownError')));
                  }
                  handleModalClose();
                  window.location.reload();
                }).catch((err) => {
                  alert(t('importFailed') + ': ' + (err.message || t('unknownError')));
                });
              } else {
                alert(t('invalidImportFile'));
              }
            },
          },
        ],
      ],
    });
  };


  const refreshWalletAndFingerPrints = () => {
    fetchFingerPrints();
    apiManager.getAllWallets().then((res) => {
      // Sort by createdAt ascending (oldest first), then by id ascending
      const updatedWalletList = res
        .slice()
        .sort((a, b) => {
          if ((a.createdAt || 0) !== (b.createdAt || 0)) {
            return (a.createdAt || 0) - (b.createdAt || 0);
          }
          if (a.id < b.id) return -1;
          if (a.id > b.id) return 1;
          return 0;
        })
        .map(wallet => ({ ...wallet, selected: false }));
      setWalletList(updatedWalletList);
    });
  };

  // setInitWallet = () => {
  const setWalletScriptDirectory = async () => {
    const currentScriptDirectory = usePathStore.getState().walletScriptDirectory;
    console.log('current script directory:', currentScriptDirectory);
    setModalProp({
      show: true,
      handleClose: handleModalClose,
      title: t('setWalletScriptDirectory'),
      rowList: [
        [
          {
            type: 'label',
            text: t('chooseScriptDirectory'),
            colWidth: 4,
            style: { textAlign: 'center', fontWeight: 'bold' },
          },
          {
            type: 'text',
            key: 'scriptDirectory',
            text: currentScriptDirectory || '',
            colWidth: 4,
            style: { textAlign: 'left', fontStyle: 'italic', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          },
          {
            type: 'button',
            text: t('chooseButton'),
            colWidth: 4,
            style: { textAlign: 'left' },
            click: async () => {
              if (!window.electronAPI) {
                alert(t('runInElectron'));
                return;
              }
              const scriptDirectory = await window.electronAPI.chooseDirectory({});
              if (scriptDirectory) {
                childRef.current.updateValueObj('scriptDirectory', scriptDirectory);
                setModalProp((prev) => ({ ...prev })); // 强制刷新弹窗内容
              }
            }
          },
        ],
        [
          {
            type: 'button',
            text: t('confirmButton'),
            colWidth: 4,
            style: { marginLeft: 'auto' },
            click: () => {
              const scriptDirectory = childRef.current.getValue('scriptDirectory');
              if (scriptDirectory) {
                apiManager.setWalletScriptDirectory(scriptDirectory).then((res) => {
                  if (res.success) {
                    alert(t('setSuccess'));
                    usePathStore.getState().fetchWalletScriptDirectory();
                    handleModalClose();
                  } else {
                    console.log('set wallet script directory failed:', res.message);
                    alert(t('setFailed') + ': ' + (res.message || t('unknownError')));
                  }
                });
              } else {
                alert(t('invalidScriptPath'));
              }
            },
          },
        ],
      ],
    });
  }
  const initWallets = () => {
    const selectedWallets = walletList.filter(wallet => selectedIds.includes(wallet.id));
    if (selectedWallets.length === 0) {
      alert(t('noSelected'));
      return;
    }
    apiManager.initWallets(selectedWallets.map(wallet => wallet.id)).then(async (res) => {
      console.log('initWallets res:', res);
      if (res.success) {
        await updateWalletList();
        alert(t('initSuccess'));
        
      } else {
        console.warn('initWallets failed:', res);
      }
    });
  }

  // 新增：打开单个钱包（调用后端任务启动打开流程）
  const openWallet = (wallet) => {
    if (!wallet) return;
    if (!wallet.bindEnvId) {
      alert(t('wallet.open.notBound'));
      return;
    }
    apiManager.openWallets([wallet.id]).then((res) => {
      console.log('openWallet res:', res);
      if (res && res.success) {
        alert(t('wallet.open.started'));
      } else {
        console.warn('openWallet failed:', res);
        alert((res && res.message) ? res.message : t('wallet.open.failed'));
      }
    }).catch((err) => {
      console.error('openWallet error:', err);
      alert(t('wallet.open.failed') + ': ' + (err.message || err));
    });
  }

  return (
    <Container className="wallet-manager-page">
      <DeletingOverlay show={deleting} text={t('deletingInProgress')} />
      <h1 style={{ textAlign: 'center' }}>{t('walletManager')}</h1>
      <Card className="control-panel mb-4">
        <Card.Body>
          <div className="btn-row">
            <Button className="btn" onClick={() => createWallet()}>{t('createWallet')}</Button>
            <Button className="btn" onClick={() => importWallet()}>{t('importWallet')}</Button>
            <Button className="btn" onClick={() => exportWallet()}>{t('exportWallet')}</Button>
            <Button className="btn" onClick={() => setWalletScriptDirectory()}>{t('setWalletScriptDirectory')}</Button>
          </div>
        </Card.Body>
      </Card>
      <CustomModal ref={childRef} {...modalProp} />

      <Card className="wallet-list-card mt-4">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <div className="header-checkbox-align">
            <input
              type="checkbox"
              checked={walletList.length > 0 && selectedIds.length === walletList.length}
              indeterminate={selectedIds.length > 0 && selectedIds.length < walletList.length}
              onChange={toggleSelectAll}
              style={{ marginRight: 8 }}
            />
            <span>{t('walletList')}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <Button size="sm" variant="primary" onClick={() => initWallets()}>{t('initWallets')}</Button>
            <Button size="sm" variant="danger" onClick={deleteSelected}>{t('deleteSelected')}</Button>
          </div>
        </Card.Header>
        <Card.Body className="wallet-list-scroll">
          {Array.isArray(walletList) && walletList.length > 0 ? (
            walletList.map((wallet) => (
              <Row key={wallet.id} className="align-items-center wallet-row">
                <Col xs={1} className="d-flex align-items-center p-0">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(wallet.id)}
                    onChange={() => toggleSelect(wallet.id)}
                  />
                </Col>
                <Col xs={4} className="wallet-name text-truncate p-0" title={wallet.name}>
                  <span style={{ color: wallet.walletInitialized ? '#28a745' : undefined }}>
                    {wallet.name}
                  </span>
                </Col>
                <Col xs="auto" className="p-0">
                  <Button size="sm" variant="outline-primary" className="me-1" onClick={() => modifyWalletName(wallet)}>{t('edit')}</Button>
                  <Button size="sm" variant="outline-info" className="me-1" onClick={() => checkWalletDetail(wallet)}>{t('viewDetail')}</Button>
                  <Button size="sm" variant="outline-secondary" className="me-1" onClick={() => bindEnv(wallet)}> {
                    wallet.bindEnvId ? t('rebindEnv') : t('bindEnv')}</Button>
                  <Button size="sm" variant="outline-success" onClick={() => openWallet(wallet)}>{t('open')}</Button>
                </Col>
              </Row>
            ))
          ) : (
            <div className="text-muted">{t('noWallets')}</div>
          )}
        </Card.Body>
      </Card>
    </Container>
  );
};

export default WalletManage;

