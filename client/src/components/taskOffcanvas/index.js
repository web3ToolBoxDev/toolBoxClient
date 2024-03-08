import { useState, useEffect } from 'react';
import Offcanvas from 'react-bootstrap/Offcanvas';
import { Button, Row, Col } from 'react-bootstrap';
import WebSocketManager from '../../utils/webSocket';
import { eventEmitter } from '../../utils/eventEmitter';


function TaskOffcanvas({ show, handleClose }) {
    const [messageList, setMessageList] = useState([]);
    const ws = new WebSocketManager();
    const messageCallback = () => {
        for (let i = 0; i < ws.getQueueLength(); i++) {
            let info = ws.popFromQueue();
            let message = '';
            switch (info.type){
                case 'task_log':
                    message = info.message;
                    break;
                case 'task_completed':
                    message = info.message;
                    eventEmitter.emit('taskCompleted');
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

    const clearStoredMessage = () => {
        window.localStorage.setItem('taskMessagesList', JSON.stringify([]));
        setMessageList([]);
    }

    const teminateTask = () => {
        ws.sendMessage(JSON.stringify({ type: 'terminate_process' }));
    }

    useEffect(() => {
        ws.connect(messageCallback, closeCallback);
        const storedTaskMessagesList = JSON.parse(window.localStorage.getItem('taskMessagesList'));
        console.log('storedTaskMessagesList:', storedTaskMessagesList);
        if (storedTaskMessagesList) {
            setMessageList(storedTaskMessagesList);
        }
    }, []);

    return (
        <>
            <Offcanvas show={show} onHide={() => { handleClose(false) }} placement='bottom' style={{ height: '50%' }}>
                <Offcanvas.Header closeButton>
                    <Offcanvas.Title>任务日志</Offcanvas.Title>
                </Offcanvas.Header>
                <Offcanvas.Body style={{ display: 'flex' }}>
                    <div style={{ flex: '0 0 auto', width: '100px', paddingRight: '10px' }}>
                        {/* Left section */}
                        <Row>
                            <Col md={12}>
                                <Button variant="primary" onClick={teminateTask} style={{ fontSize: '1.2vw', margin: '10px' }}>结束任务</Button>
                                <Button onClick={clearStoredMessage} variant="primary" style={{ fontSize: '1.2vw', margin: '10px' }}>清空消息</Button>
                            </Col>
                        </Row>
                    </div>
                    <div style={{ flex: '1', overflowY: 'auto', border: '1px solid #201D32', padding: '12px' }}>
                        {/* Right section with scrollbar */}
                        <Row>
                            <Col md={12}>
                                {/* Add your content here */}
                                <ul>
                                    {messageList.map((message, index) => (
                                        <li key={index}>{message}</li>
                                    ))}
                                </ul>
                                {/* Add more content if needed */}
                            </Col>
                        </Row>
                    </div>
                </Offcanvas.Body>
            </Offcanvas>
        </>
    );
}

export default TaskOffcanvas;
