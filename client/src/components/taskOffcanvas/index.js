import { useState, useEffect, useRef } from 'react';
import Offcanvas from 'react-bootstrap/Offcanvas';
import { Button } from 'react-bootstrap';
import WebSocketManager from '../../utils/webSocket';
import { eventEmitter } from '../../utils/eventEmitter';
import './index.scss';
import { useTranslation } from 'react-i18next';

function TaskOffcanvas({ show, handleClose }) {
    const [messageList, setMessageList] = useState([]);
    const wsManager = new WebSocketManager();
    const { t } = useTranslation();

    // 用ref保存监听器引用
    const taskStartListener = useRef();
    const clientTaskMessageListener = useRef();

    const clearStoredMessage = () => {
        window.localStorage.setItem('taskMessagesList', JSON.stringify([]));
        setMessageList([]);
    }

    const terminateTask = () => {
        wsManager.sendMessage(JSON.stringify({ type: 'terminate_process' }));
    }
    const messageCallback = () => {
        for (let i = 0; i < wsManager.getQueueLength(); i++) {
            let info = wsManager.popFromQueue();
            let message = '';
            switch (info.type) {
                case 'task_log':
                    message = info.message;
                    break;
                case 'task_completed':
                    console.log('task_completed:', info);
                    eventEmitter.emit('taskCompleted', info);
                    break;
                default:
                    break;
            }
            if (!message) {
                continue;
            }
            let taskMessagesList = JSON.parse(window.localStorage.getItem('taskMessagesList')) || [];
            taskMessagesList.push(message);
            window.localStorage.setItem('taskMessagesList', JSON.stringify(taskMessagesList));
            setMessageList(taskMessagesList);
        }
    }
    const closeCallback = (event) => {
        console.log('连接关闭:', event);
    }

    useEffect(() => {
        wsManager.connect(messageCallback, closeCallback);
        const storedTaskMessagesList = JSON.parse(window.localStorage.getItem('taskMessagesList'));
        if (storedTaskMessagesList) {
            setMessageList(storedTaskMessagesList);
        }

        // 定义并保存监听器
        taskStartListener.current = async () => {
            let connected = await wsManager.connect(messageCallback, closeCallback);
            if (!connected) {
                alert(t('connectionFailedAlert'));
            }
        };
        clientTaskMessageListener.current = (message) => {
            let taskMessagesList = JSON.parse(window.localStorage.getItem('taskMessagesList')) || [];
            taskMessagesList.push(message);
            window.localStorage.setItem('taskMessagesList', JSON.stringify(taskMessagesList));
            setMessageList(taskMessagesList);
        };

        eventEmitter.on('taskStart', taskStartListener.current);
        eventEmitter.on('clientTaskMessage', clientTaskMessageListener.current);

        // 设置定时器检查连接状态
        const interval = setInterval(() => {
            if (!wsManager.checkConnection()) {
                wsManager.connect(messageCallback, closeCallback);
            }
        }, 5000);

        return () => {
            wsManager.close();
            eventEmitter.off('taskStart', taskStartListener.current);
            eventEmitter.off('clientTaskMessage', clientTaskMessageListener.current);
            clearInterval(interval);
        }
    }, [t]);

    return (
        <Offcanvas
            className="task-offcanvas"
            show={show}
            onHide={() => handleClose(false)}
            placement="bottom"
        >
            <Offcanvas.Header closeButton>
                <Offcanvas.Title>{t('taskLog')}</Offcanvas.Title>
            </Offcanvas.Header>
            <Offcanvas.Body>
                <div className="actions">
                    <Button className="btn-terminate mb-2" onClick={terminateTask}>
                        {t('terminateTask')}
                    </Button>
                    <Button className="btn-clear" onClick={clearStoredMessage}>
                        {t('clearMessages')}
                    </Button>
                </div>
                <div className="logs">
                    <ul>
                        {messageList.map((message, index) => (
                            <li key={index}>{message}</li>
                        ))}
                    </ul>
                </div>
            </Offcanvas.Body>
        </Offcanvas>
    );
}

export default TaskOffcanvas;
