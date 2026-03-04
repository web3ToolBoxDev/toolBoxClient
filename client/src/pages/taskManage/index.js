import { Container, Button, Row, Col, Card, Modal, Form } from 'react-bootstrap';
import CustomModal from '../../components/customModal';
import SetWalletConfigModal from '../../components/setWalletConfigModal';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { eventEmitter } from '../../utils/eventEmitter';
import APIManager from '../../utils/api';
import { resolveTaskDisplayName } from '../../utils/taskI18n';
import useWalletStore from '../../store/walletStore';
import useFingerPrintStore from '../../store/fingerPrintStore';
import './index.scss';
const TaskManage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const apiManager = APIManager.getInstance();
  const walletsStore = useWalletStore((state) => state.wallets);
  const fetchWallets = useWalletStore((state) => state.fetchWallets);
  const fingerPrintsObj = useFingerPrintStore((state) => state.fingerPrints);
  const fetchFingerPrints = useFingerPrintStore((state) => state.fetchFingerPrints);
  const [modalProp, setModalProp] = useState({});
  const [walletConfigModalProp,setWalletConfigModalProp] = useState({show:false});
  const [taskList, setTaskList] = useState([]);
  const loadTasks = () => {
    apiManager.getAllTasks(false).then((res) => {
      setTaskList(res);
    });
  };
  const [runModal, setRunModal] = useState({ show: false, taskName: '', entry: 'run' });
  const [runMode, setRunMode] = useState('env'); // env | wallet
  const [selectedEnvIds, setSelectedEnvIds] = useState([]);
  const [selectedWalletIds, setSelectedWalletIds] = useState([]);
  const handleModalClose = () => {
    setModalProp({ show: false });
    childRef.current.clearValueObj();
  }
  const childRef = useRef();
  const importTask = () => {
    setModalProp({
      show: true,
      title: t('taskManage.importTitle', '导入任务'),
      handleClose: handleModalClose,
      rowList: [
        [
          { type: 'label', colWidth: 3, text: t('taskManage.taskDir', '任务目录'), style: { textAlign: 'right'} },
          { type: 'input', colWidth: 6, placeholder: t('taskManage.taskDirPlaceholder', '请选择任务目录'), key: 'taskDirectory' },
          {
            type: 'button', colWidth: 2, text: t('common.select', '选择'), style: { marginLeft: 'auto', alignItems: 'center', fontSize: '0.9rem', padding: '0.35rem 0.9rem', minWidth: '90px' },
            click: async () => {
              if (!window.electronAPI) {
                alert(t('taskManage.desktopOnly', '请在桌面端使用'));
                return;
              }
              const dir = await window.electronAPI.chooseDirectory({});
              if (dir) {
                childRef.current.updateValueObj('taskDirectory', dir);
              }
            }
          }
        ],
        [
          {
            type: 'button', colWidth: 4, text: t('common.submit', '提交'), style: { marginLeft: 'auto', fontSize: '0.9rem', padding: '0.4rem 1.1rem', minWidth: '100px' },
            click: async () => {
              const directory = childRef.current?.getValue('taskDirectory');
              if (!directory) {
                alert(t('taskManage.taskDirRequired', '请选择任务目录'));
                return;
              }
              apiManager.importTask({ directory }).then((res) => {
                if (res?.success) {
                  alert(res.message || t('taskManage.importSuccess', '导入成功'));
                  handleModalClose();
                  loadTasks();
                } else {
                  alert(res?.message || t('taskManage.importFailed', '导入失败'));
                }
              });
            }
          }
        ]
      ],
    });
  }
  useEffect(() => {
    loadTasks();
    fetchWallets();
    fetchFingerPrints();

    const handleTasksRefreshed = (tasks) => {
      if (Array.isArray(tasks)) {
        setTaskList(tasks);
      } else {
        loadTasks();
      }
    };
    eventEmitter.on('tasksRefreshed', handleTasksRefreshed);
    return () => {
      if (typeof eventEmitter.off === 'function') {
        eventEmitter.off('tasksRefreshed', handleTasksRefreshed);
      } else if (typeof eventEmitter.removeListener === 'function') {
        eventEmitter.removeListener('tasksRefreshed', handleTasksRefreshed);
      }
    };
  }, [apiManager, fetchWallets, fetchFingerPrints]);
  const [selectAll, setSelectAll] = useState(false);
  const envList = fingerPrintsObj && typeof fingerPrintsObj === 'object' ? Object.values(fingerPrintsObj) : [];
  const walletList = Array.isArray(walletsStore) ? walletsStore : [];

  const toggleSelectEnv = (id) => {
    setSelectedEnvIds((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectWallet = (id) => {
    setSelectedWalletIds((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const getTaskDisplayName = (task) => resolveTaskDisplayName(task, {
    language: i18n?.resolvedLanguage || i18n?.language || 'en'
  });

  const openAiWorkspace = async (task) => {
    const taskName = task?.taskName;
    if (!taskName) return;
    navigate(`/agentWorkspace/${encodeURIComponent(taskName)}`, {
      state: {
        taskDisplayName: getTaskDisplayName(task),
        taskI18n: task?.taskI18n || {},
        taskKey: task?.taskKey || ''
      }
    });
  };

  const closeRunModal = () => {
    setRunModal({ show: false, taskName: '', entry: 'run' });
    setSelectedEnvIds([]);
    setSelectedWalletIds([]);
    setRunMode('env');
  };

  const execTask = (taskName) => {
    setSelectedEnvIds([]);
    setSelectedWalletIds([]);
    setRunMode('env');
    setRunModal({ show: true, taskName, entry: 'run' });
  };

  const isAiTask = (task) => task?.taskType === 'ai' || task?.aiEnabled === true;

  const handleRunConfirm = async () => {
    const currentTask = taskList.find(t => t.taskName === runModal.taskName);
    if (runMode === 'env') {
      if (selectedEnvIds.length === 0) {
        alert(t('taskManage.selectEnv', '请选择环境'));
        return;
      }
      const res = await apiManager.execTask(runModal.taskName, { envIds: selectedEnvIds, mode: 'env' });
      if (res && res.success) {
        alert(t('taskManage.startSuccess', '任务启动成功'));
        closeRunModal();
      } else {
        alert(res?.message || t('taskManage.startFailed', '启动失败'));
      }
      return;
    }

    // wallet mode -> map to envIds via bindEnvId
    if (selectedWalletIds.length === 0) {
      alert(t('taskManage.selectWallet', '请选择钱包'));
      return;
    }
    // execByWallet 支持无需绑定环境直接按钱包运行
    if (currentTask?.taskType === 'execByWallet') {
      const res = await apiManager.execTask(runModal.taskName, { walletIds: selectedWalletIds, mode: 'wallet' });
      if (res && res.success) {
        alert(t('taskManage.startSuccess', '任务启动成功'));
        closeRunModal();
      } else {
        alert(res?.message || t('taskManage.startFailed', '启动失败'));
      }
      return;
    }

    const chosenWallets = walletList.filter(w => selectedWalletIds.includes(w.id));
    const envIds = chosenWallets.map(w => w.bindEnvId).filter(Boolean);
    if (envIds.length === 0) {
      alert(t('taskManage.walletNoEnv', '所选钱包未绑定环境'));
      return;
    }
    const res = await apiManager.execTask(runModal.taskName, { envIds, mode: 'wallet', walletIds: selectedWalletIds });
    if (res && res.success) {
      alert(t('taskManage.startSuccess', '任务启动成功'));
      closeRunModal();
    } else {
      alert(res?.message || t('taskManage.startFailed', '启动失败'));
    }
  };
  // Toggle Select All checkbox
  const toggleSelectAll = () => {
    setSelectAll(!selectAll);
    // Toggle selected property for all wallets
    const updatedTaskList = taskList.map(task => ({ ...task, selected: !selectAll }));
    setTaskList(updatedTaskList);
  };
  const handleSelect = (index) => {
    const updatedTaskList = taskList.map((task, i) => {
      if (i === index) {
        return { ...task, selected: !task.selected };
      }
      return task;
    });
    setTaskList(updatedTaskList);
  }
  const setConfig = (taskName,configSchema,task) => {
    setWalletConfigModalProp({
      taskName,
      configSchema,
      isAiTask: isAiTask(task),
      show: true,
      onHide: () => {
        setWalletConfigModalProp({ show: false });
      },
      confirm: async (config) => {
        if (config) {
          apiManager.setConfigInfo(taskName, config).then((res) => {
            if (res) {
              alert(t('taskManage.configSuccess', '配置成功'));
              setWalletConfigModalProp({ show: false });
            }
          })
        }
      }
    })
  }

  
  const deleteTask = () => {
    const selectedTaskList = taskList.filter(task => task.selected);
    if (selectedTaskList.length === 0) {
      alert(t('taskManage.selectToDelete', '请选择要删除的任务'));
      return;
    }
    const taskNames = selectedTaskList.map(task => task.taskName);
    
    apiManager.deleteTask(taskNames).then((res) => {
      if (res) {
        alert(t('taskManage.deleteSuccess', '删除成功'));
        const updatedTaskList = taskList.filter(task => !task.selected);
        setTaskList(updatedTaskList);
      }
    })
    
  }

  const totalTasks = taskList.length;

  return (
    <Container className="task-manage-page">
      <h1>{t('taskManage.title', '任务管理')}</h1>

      <Card className="control-panel mb-3">
        <Card.Body>
          <div className="btn-row">
            <Button className="btn" onClick={importTask}>{t('taskManage.importBtn', '导入任务')}</Button>
            <Button className="btn" variant="danger" onClick={deleteTask}>{t('taskManage.deleteBtn', '删除任务')}</Button>
          </div>
        </Card.Body>
      </Card>

      <Card className="task-list-card">
        <Card.Header className="d-flex align-items-center justify-content-between">
          <div className="header-checkbox-align">
            <input type='checkbox' checked={selectAll} onChange={toggleSelectAll} />
            <span className="ms-2">{t('taskManage.listTitle', '任务列表')}</span>
          </div>
          <span className="text-muted small">{t('taskManage.total', { count: totalTasks, defaultValue: `共 ${totalTasks} 个` })}</span>
        </Card.Header>
        <Card.Body className="list-scroll">
          {taskList.length > 0 ? taskList.map((task, index) => (
            <Row key={index} className="align-items-center task-row">
              <Col xs={1} className="d-flex justify-content-center">
                <input type='checkbox' checked={Boolean(task.selected)} onChange={() => { handleSelect(index) }} />
              </Col>
              <Col xs={5} className="task-name" title={getTaskDisplayName(task)}>{getTaskDisplayName(task)}</Col>
              <Col xs={3} className="text-center">
                {task.configSchema ? (
                  <Button size="sm" variant="outline-primary" onClick={() => { setConfig(task.taskName,task.configSchema,task) }}>
                    {t('taskManage.configBtn', '配置')}
                  </Button>
                ) : <span className="text-muted">{t('taskManage.noConfig', '无配置')}</span>}
              </Col>
              <Col xs={3} className="text-center">
                <Button
                  size="sm"
                  variant="success"
                  onClick={() => { isAiTask(task) ? openAiWorkspace(task) : execTask(task.taskName); }}
                >
                  {isAiTask(task) ? t('taskManage.openAiWorkspace', '进入AI工作台') : t('taskManage.startBtn', '启动')}
                </Button>
              </Col>
            </Row>
          )) : (
            <div className="text-muted text-center py-4">{t('taskManage.empty', '暂无任务')}</div>
          )}
        </Card.Body>
      </Card>

      <Modal show={runModal.show} onHide={closeRunModal} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{t('taskManage.startTask', '启动任务')}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <div className="d-flex align-items-center mb-3" style={{ gap: '12px' }}>
            <Form.Check
              inline
              type="radio"
              id="run-mode-env"
              label={t('taskManage.runByEnv', '按环境')}
              checked={runMode === 'env'}
              onChange={() => setRunMode('env')}
            />
            <Form.Check
              inline
              type="radio"
              id="run-mode-wallet"
              label={t('taskManage.runByWallet', '按钱包')}
              checked={runMode === 'wallet'}
              onChange={() => setRunMode('wallet')}
            />
          </div>

          {runMode === 'env' ? (
            <div>
              <div className="text-muted mb-2">{t('taskManage.envList', '请选择环境')}</div>
              {envList.map((env) => {
                const envId = env.id || env._id || env.name;
                return (
                  <Row key={envId} className="align-items-center py-1" style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <Col xs={1} className="text-center">
                      <input type='checkbox' checked={selectedEnvIds.includes(envId)} onChange={() => toggleSelectEnv(envId)} />
                    </Col>
                    <Col xs={5} className="text-truncate" title={env.name || envId}>{env.name || envId}</Col>
                    <Col xs={6} className="text-muted text-truncate" title={env.alias || env.remark || env._id || ''}>{env.alias || env.remark || env._id || ''}</Col>
                  </Row>
                );
              })}
            </div>
          ) : (
            <div>
              <div className="text-muted mb-2">{t('taskManage.walletList', '请选择钱包')}</div>
              {walletList.map((w) => (
                <Row key={w.id} className="align-items-center py-1" style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <Col xs={1} className="text-center">
                    <input type='checkbox' checked={selectedWalletIds.includes(w.id)} onChange={() => toggleSelectWallet(w.id)} />
                  </Col>
                  <Col xs={4} className="text-truncate" title={w.name || w.id}>{w.name || w.id}</Col>
                  <Col xs={5} className="text-truncate" title={w.ethAddress}>{w.ethAddress}</Col>
                  <Col xs={2} className="text-muted text-truncate" title={w.bindEnvId || ''}>{w.bindEnvId || t('taskManage.unbound', '未绑定')}</Col>
                </Row>
              ))}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeRunModal}>{t('common.cancel', '取消')}</Button>
          <Button variant="success" onClick={handleRunConfirm}>{t('taskManage.startBtn', '启动')}</Button>
        </Modal.Footer>
      </Modal>

      <CustomModal ref={childRef} {...modalProp} />
      <SetWalletConfigModal {...walletConfigModalProp} />
    </Container>
  );
}
export default TaskManage;
