import { Container, Button, Row, Col } from 'react-bootstrap';
import CustomModal from '../../components/customModal';
import SetWalletConfigModal from '../../components/setWalletConfigModal';
import ChooseWalletModal from '../../components/chooseWalletModal';
import { useState, useRef, useEffect } from 'react';
import APIManager from '../../utils/api';
const TaskManage = () => {
  const apiManager = APIManager.getInstance();
  const [modalProp, setModalProp] = useState({});
  const [walletConfigModalProp,setWalletConfigModalProp] = useState({show:false});
  const [chooseWalletModalProp, setChooseWalletModalProp] = useState({show:false});//{show:false}
  const handleModalClose = () => {
    setModalProp({ show: false });
    childRef.current.clearValueObj();
  }
  const childRef = useRef();
  const importTask = () => {
    let taskObj = {
    }
    setModalProp({
      show: true,
      title: '导入任务',
      handleClose: handleModalClose,
      handleData: (key, value) => {
        taskObj[key] = value;
      },

      rowList: [
        [
          { type: 'label', colWidth: 4, text: '任务名称', style: { textAlign: 'right', paddingRight: '10px' } },
          { type: 'input', colWidth: 6, placeholder: '请输入任务名称', key: 'taskName' }
        ],
        [
          { type: 'label', colWidth: 4, text: '执行路径', style: { textAlign: 'right', paddingRight: '10px' } },
          { type: 'text', colWidth: 6, text: '不填使用默认路径', key: 'execPath' },
          {
            type: 'button', colWidth: 2, text: '选择', style: { fontSize: '1.2vw', border: '1px' },
            click: async () => {
              if (!window.electronAPI) {
                alert('请在桌面端使用');
                return;
              }
              const filePath = await window.electronAPI.openFile()
              if (filePath) {
                taskObj['execPath'] = filePath;
                childRef.current.updateValueObj('execPath', filePath);
              }
            }
          }
        ],
        [
          { type: 'label', colWidth: 4, text: '脚本路径', style: { textAlign: 'right', paddingRight: '10px' } },
          { type: 'text', colWidth: 6, text: '必须指定脚本路径', key: 'scriptPath' },
          {
            type: 'button', colWidth: 2, text: '选择', style: { fontSize: '1.2vw', border: '1px' },
            click: async () => {
              if (!window.electronAPI) {
                alert('请在桌面端使用');
                return;
              }
              const filePath = await window.electronAPI.openFile()
              if (filePath) {
                taskObj['scriptPath'] = filePath;
                childRef.current.updateValueObj('scriptPath', filePath);
              }
            }
          }
        ],
        [
          { type: 'label', colWidth: 4, text: '脚本配置路径', style: { textAlign: 'right', paddingRight: '10px' } },
          { type: 'text', colWidth: 6, text: '不填默认无配置', key: 'configSchemaPath' },
          {
            type: 'button', colWidth: 2, text: '选择', style: { fontSize: '1.2vw', border: '1px' },
            click: async () => {
              if (!window.electronAPI) {
                alert('请在桌面端使用');
                return;
              }
              const filePath = await window.electronAPI.openFile()
              if (filePath) {
                taskObj['configSchemaPath'] = filePath;
                childRef.current.updateValueObj('configSchemaPath', filePath);
              }
            }
          }
        ],
        [
          { type: 'label', colWidth: 4, text: '任务类型', style: { textAlign: 'right', paddingRight: '10px' } },
          { type: 'select', colWidth: 6, style: { fontSize: '1.2vw' },
            options: [{ value: 'execByOrder', text: '顺序执行' }, { value: 'execByAsync', text: '同步执行' },{value:'execAll',text:'全量执行'}],
            defaultValue: 'execByOrder',
            key: 'taskType' }
        ],
        [
          {
            type: 'button', colWidth: 4, text: '提交', style: { marginLeft: 'auto', fontSize: '1.5vw' },
            click: async () => {
              if (!taskObj['taskName']) {
                alert('请填写任务名称');
                return;
              }
              if (!taskObj['scriptPath']) {
                alert('请填写脚本路径');
                return;
              }
              if (!taskObj['taskType']) {
                taskObj['taskType'] = "execByOrder";
              }
              apiManager.importTask(taskObj).then((res) => {
                if (res) {
                  alert('导入成功');
                  handleModalClose();
                  window.location.reload();
                }
              }
              )

            }
          }
        ]
      ],
    });
  }
  const [taskList, setTaskList] = useState([]);
  useEffect(() => {
    apiManager.getAllTasks(false).then((res) => {
      console.log('res:', res);
      setTaskList(res);
    })
  }, [apiManager])
  const [selectAll, setSelectAll] = useState(false);
  const execTask = (taskName) => {
    setChooseWalletModalProp({
      show: true,
      onHide: () => {
        setChooseWalletModalProp({ show: false });
      },
      confirm: async (selectedWallets) => {
        apiManager.execTask(taskName, selectedWallets).then((res) => {
          if (res) {
            alert('任务启动成功');
            setChooseWalletModalProp({ show: false });
            window.location.reload();
          }
        })
      }
      
    })
  }
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
  const setConfig = (taskName,configSchema) => {
    setWalletConfigModalProp({
      taskName,
      configSchema,
      show: true,
      onHide: () => {
        setWalletConfigModalProp({ show: false });
      },
      confirm: async (config) => {
        if (config) {
          apiManager.setConfigInfo(taskName, config).then((res) => {
            if (res) {
              alert('配置成功');
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
      alert('请选择要删除的任务');
      return;
    }
    const taskNames = selectedTaskList.map(task => task.taskName);
    
    apiManager.deleteTask(taskNames).then((res) => {
      if (res) {
        alert('删除成功');
        const updatedTaskList = taskList.filter(task => !task.selected);
        setTaskList(updatedTaskList);
      }
    })
    
  }

  return (
    <Container>
      <h1>任务管理</h1>
      <Button className='ms-1' style={{ fontSize: '1.2vw' }} onClick={importTask}>
        导入任务
      </Button>
      <Button className='ms-1' style={{ fontSize: '1.2vw' }} onClick={deleteTask}>
        删除任务
      </Button>
      <Row>
        <Col md={1} style={{ fontSize: '1.0vw' }}>
          <input type='checkbox' checked={selectAll} onChange={toggleSelectAll} />全选
        </Col>
        <Col md={5} style={{ fontSize: '1.0vw' }}>
          任务名称
        </Col>
        <Col md={3} style={{ fontSize: '1.0vw' }}>
          配置任务
        </Col>
        <Col md={3} style={{ fontSize: '1.0vw' }}>
          启动任务
        </Col>

      </Row>
      {taskList.map((task, index) => {
        return (
          <Row key={index}>
            {/* Use Select All state for checkbox */}
            <Col md={1}>
              <input type='checkbox' checked={task.selected} onChange={() => { handleSelect(index) }} />
            </Col>
            <Col md={5}>{task.taskName}</Col>

            <Col md={3}>
              {task.configSchema ? (<Button style={{ fontSize: '1.0vw',margin:'1px' }} onClick={() => { setConfig(task.taskName,task.configSchema) }}>
                配置
              </Button>) : "无配置"}
            </Col>
            <Col md={3}>
              <Button style={{ fontSize: '1.0vw',margin:'1px' }} onClick={() => { execTask(task.taskName) }}>
                启动
              </Button>
            </Col>

          </Row>)
      })}
      <CustomModal ref={childRef} {...modalProp} />
      <SetWalletConfigModal {...walletConfigModalProp} />
      <ChooseWalletModal {...chooseWalletModalProp} />
    </Container>
  );
}
export default TaskManage;