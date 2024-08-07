import { Container, Button, Row, Col, Card } from 'react-bootstrap';
import CustomModal from '../../../components/customModal';
import { useState,useEffect,useRef } from 'react';
import APIManager from '../../../utils/api';
import WebSocketManager from '../../../utils/webSocket';
import { eventEmitter } from '../../../utils/eventEmitter';
//引入path模块
import path from 'path-browserify';



const apiManager = APIManager.getInstance();
const wsManager = WebSocketManager.getInstance();

export default function TwitterMonitorPage({ task, returnMainPage }) {
    const [customModalProp, setCustomModalProp] = useState({ show: false });
    const [taskData, setTaskData] = useState({});
    function checkCallBack(info){
        console.log('info:',info);
                                
        if(info.taskName === 'checkEmail'){
            info.success ? alert('测试成功') : alert('测试失败');
        }

    }
    useEffect(() => {
        const emailConfigS = window.localStorage.getItem('emailConfig');
        const ipProxyConfigS = window.localStorage.getItem('ipProxyConfig');
        const twitterConfigS = window.localStorage.getItem('twitterConfig');
        const monitorListS = window.localStorage.getItem('monitorList');
        setTaskData({config:{...JSON.parse(emailConfigS),
            ...JSON.parse(ipProxyConfigS),
            ...JSON.parse(twitterConfigS)},
            monitorList:JSON.parse(monitorListS)});
                

        eventEmitter.on('taskCompleted',checkCallBack);
        return () => {
            eventEmitter.off('taskCompleted',checkCallBack);
        }
    },[]);
    
    
    const childRef = useRef();
    const clickSetSenderEmail = () => {
        const newTaskData = { ...taskData };
        //从缓存中读取email配置
        const configS = window.localStorage.getItem('emailConfig');
        let config = configS ? JSON.parse(configS) : {};
        console.log('configS', configS);
        childRef.current.setValueObj(config);
        
        
        setCustomModalProp({
            show: true,
            title: '设置发件邮箱',
            handleData:(key,value)=>{
                console.log(key,value);
                config[key] = value;
            },
            handleClose: () => { setCustomModalProp({ show: false }) },
            rowList: [
                [
                    { type: 'label', colWidth: 4, text: 'SMTP服务器', style: { textAlign: 'right', marginLeftRight: '10px' } },
                    { type: 'input', colWidth: 6, placeholder: '请输入SMTP服务器', key: 'smtpServer', value: config.smtpServer }

                ],
                [
                    { type: 'label', colWidth: 4, text: 'SMTP端口', style: { textAlign: 'right', marginLeftRight: '10px' } },
                    { type: 'input', colWidth: 6, placeholder:  '请输入SMTP端口', key: 'smtpPort', value: config.smtpPort }

                ],
                [
                    { type: 'label', colWidth: 4, text: '发件邮箱', style: { textAlign: 'right', marginLeftRight: '10px' } },
                    { type: 'input', colWidth: 6, placeholder:'请输入邮箱账号', key: 'sendMailAccount', value: config.sendMailAccount }
                ],
                [
                    { type: 'label', colWidth: 4, text: '授权码', style: { textAlign: 'right', marginLeftRight: '10px' } },
                    { type: 'input', colWidth: 6, placeholder: '请输入授权码', key: 'sendMailPassword', inputType: 'password', value: config.sendMailPassword }

                ],
                [
                    { type: 'label', colWidth: 4, text: '收件邮箱', style: { textAlign: 'right', marginLeftRight: '10px' } },
                    { type: 'input', colWidth: 6, placeholder:'请输入邮箱账号', key: 'receiveMailAccount',value: config.receiveMailAccount }
                ],
                
                
                [
                    { type: 'button', colWidth: 9, text: '测试发送', style: { marginTop:'1vw', textAlign: 'center' },
                        click: () => {
                            console.log('测试发送');
                            console.log('config',config);
                            //config缓存到localstorage
                            window.localStorage.setItem('emailConfig',JSON.stringify(config));
                            

                            apiManager.execTask('checkEmail',null,{config}).then((res)=>{
                                console.log('res:',res);
                            })
                        }
                    },
                    { type: 'button', colWidth: 3, text: '保存', style: { marginTop:'1vw', textAlign: 'center' },
                        click: () => {
                            newTaskData.config = {...taskData.config,...config};
                            setTaskData(newTaskData);
                            setCustomModalProp({ show: false });
                        }
                    }
                ]
            ]
        });
    }
    const clickSetIpProxy = () => {
        const newTaskData = { ...taskData };
        const configS = window.localStorage.getItem('ipProxyConfig');
        let config = configS ? JSON.parse(configS) : {};
        childRef.current.setValueObj(config);
        setCustomModalProp({
            show: true,
            title: '设置IP代理',
            handleClose: () => { setCustomModalProp({ show: false }) },
            handleData:(key,value)=>{
                config[key] = value;
                childRef.current.updateValueObj(key,value);
            },
            rowList: [
                [
                    { type: 'label', colWidth: 4, text: 'IP地址', style: { textAlign: 'right', marginLeftRight: '10px' } },
                    { type: 'input', colWidth: 6, placeholder: '请输入IP地址', key: 'ipHost' }
                ],
                [
                    { type: 'label', colWidth: 4, text: '端口', style: { textAlign: 'right', marginLeftRight: '10px' } },
                    { type: 'input', colWidth: 6, placeholder: '请输入端口', key: 'ipPort' }

                ],
                [
                    { type: 'label', colWidth: 4, text: '用户名', style: { textAlign: 'right', marginLeftRight: '10px' } },
                    { type: 'input', colWidth: 6, placeholder: '请输入用户名', key: 'ipUsername' }

                ],
                [
                    { type: 'label', colWidth: 4, text: '密码', style: { textAlign: 'right', marginLeftRight: '10px' } },
                    { type: 'input', colWidth: 6, placeholder: '请输入密码', key: 'ipPassword' }

                ],
                [
                    { type: 'label', colWidth: 4, text: '类型', style: { textAlign: 'right', marginLeftRight: '10px' } },
                    { type: 'select', colWidth: 6, key: 'ipType',defaultValue:config.ipType || 'http', options: [{ value: 'http', text: 'http' }, { value: 'socks5', text: 'socks5' }] }

                ],
                [
                    { type: 'button', colWidth: 9, text: '测试代理', style: { marginTop: '1vw', textAlign: 'center' },
                        click: () => {
                            console.log('测试代理');
                            window.localStorage.setItem('ipProxyConfig',JSON.stringify(config));
                            apiManager.checkProxy(config).then((res)=>{
                                if(res.success){
                                    alert(`测试成功,ip:${res.ipInfo.ip},国家:${res.ipInfo.country},时区:${res.ipInfo.timeZone}`);
                                }else{
                                    alert('测试失败');
                                }
                            })
                        }
                    },
                    { type: 'button', colWidth: 3, text: '保存', style: { marginTop: '1vw', textAlign: 'center' },
                        click: () => {
                            newTaskData.config = {...taskData.config,...config};
                            setTaskData(newTaskData);
                            console.log('newTaskData:',newTaskData);
                            setCustomModalProp({ show: false });
                        }
                    }
                ]
            ]
        });
    }
    const clickSetTwitter = () => {
        const newTaskData = { ...taskData };
        const configS = window.localStorage.getItem('twitterConfig');
        let config = configS ? JSON.parse(configS) : {};
        childRef.current.setValueObj(config);
        setCustomModalProp({
            show: true,
            title: '设置推特',
            handleClose: () => { setCustomModalProp({ show: false }) },
            handleData:(key,value)=>{
                config[key] = value;
                childRef.current.updateValueObj(key,value);
            },
            rowList: [
                [
                    { type: 'label', colWidth: 4, text: 'twitterToken', style: { textAlign: 'right', marginLeftRight: '10px' } },
                    { type: 'input', colWidth: 6, placeholder: '请输入twitterToken', key: 'twitterToken' }
                ],
                [
                    { type: 'label', colWidth: 4, text: '刷新时间间隔（分钟）', style: { textAlign: 'right', marginLeftRight: '10px' } },
                    { type: 'input', colWidth: 6, placeholder: '请输入刷新分钟', key: 'refreshInterval' }
                ],
                [
                    { type: 'button', colWidth: 3, text: '保存', style: { marginLeft: 'auto' },
                        click: () => {
                            console.log('config',config);
                            
                            config.refreshInterval = Number(config.refreshInterval);
                            if(isNaN(config.refreshInterval)){
                                alert('请输入数字');
                                return;
                            }
                            if(config.refreshInterval <= 0){
                                alert('请输入大于0的数字');
                                return;
                            }
                            
                            newTaskData.config = {...taskData.config,...config};
                            setTaskData(newTaskData);
                            window.localStorage.setItem('twitterConfig',JSON.stringify(config));
                            setCustomModalProp({ show: false });
                            
                        }
                    },
                ]
            ]
        });
    }

    const addMonitorUrl = () => {
        const newTaskData = { ...taskData };
        newTaskData.monitorList = newTaskData.monitorList || [];
        let monitorUrl = '';
        childRef.current.clearValueObj();
        setCustomModalProp({
            show: true,
            title: '添加关注url',
            handleData:(key,value)=>{
                monitorUrl = value;
            },
            handleClose: () => { setCustomModalProp({ show: false }) },
            rowList: [
                [
                    { type: 'label', colWidth: 3, text: '新增url', style: { fontSize:'1.5vw',textAlign: 'right',marginTop:'0.8vw' } },
                    { type: 'input', colWidth: 6, placeholder: '请输入url', key: 'monitorUrl' },
                    { type: 'button', colWidth: 3, text: '添加', style: {fontSize:'1.5vw',textAlign: 'center' },
                        click: () => {
                            newTaskData.monitorList = [...newTaskData.monitorList, monitorUrl];
                            window.localStorage.setItem('monitorList',JSON.stringify(newTaskData.monitorList));
                            setTaskData(newTaskData);
                            setCustomModalProp({ show: false });
                            console.log('newTaskData:', newTaskData);
                        }
                    }
                ]
            ]
        });
    }
    const deleteUrl = (index) => {
        const newTaskData = { ...taskData };
        newTaskData.monitorList.splice(index,1);
        window.localStorage.setItem('monitorList',JSON.stringify(newTaskData.monitorList));
        setTaskData(newTaskData);
    }
    const clearList = () => {
        const newTaskData = { ...taskData };
        newTaskData.monitorList = [];
        window.localStorage.setItem('monitorList',JSON.stringify(newTaskData.monitorList));
        setTaskData(newTaskData);
    }
    const execTask = async(useProxy) => {
        let config = taskData.config;
        if(useProxy){
            if(!config.ipHost || !config.ipPort || !config.ipUsername || !config.ipPassword || !config.ipType){
                alert('请配置IP代理');
                return;
            }else{
                config.useProxy = true;
            }
        }
        let res = await apiManager.getSavePath();
        if(!res.success){
            alert('请先在钱包管理配置文件保存路径');
            return;
        }
        console.log('savePath:',res.path);
        config.chromeUserDataPath = path.join(res.path,'twitterMonitor');

        setTaskData({...taskData,config});
        if(!taskData.config || !taskData.config.smtpServer || !taskData.config.smtpPort || !taskData.config.sendMailAccount || !taskData.config.sendMailPassword || !taskData.config.receiveMailAccount){
            alert('请配置邮箱');
            return;
        }
        if(!taskData.config || !taskData.config.twitterToken || !taskData.config.refreshInterval){
            alert('请配置推特');
            return;
        }
        
        
        apiManager.execTask(task.taskKey,[],taskData).then((res)=>{
            console.log('res:',res);
            if(res){
                alert('任务启动成功');
            }
        })
    }
    const terminateTask = () => {
        wsManager.sendMessage(JSON.stringify({ type: 'terminate_process' }));
    }


    return (
        <Container>
            <Row>
                <Col md={6}><h3>推特监视器</h3></Col>
                <Col md={6}>
                    <div className='d-flex justify-content-end'>
                        <Button variant="primary" style={{ fontSize: '1.5vw' }} onClick={returnMainPage}>返回</Button>
                    </div>
                </Col>
            </Row>
            <Row style={{ marginTop: '1.0vw' }}>
                <Col md>
                    <Card style={{ height: '18vw' }}>
                        <Card.Header>
                            <Row>
                                <Col><Card.Title>监视器配置</Card.Title></Col>
                                
                            </Row>
                        </Card.Header>
                        <Card.Body>
                            <Row>
                                <Col md={6}>
                                    <Row>
                                        <Col md={4} className='d-flex justify-content-center' style={{ fontSize: '1.2vw' }}>
                                            <span style={{ marginTop: '0.3vw' }}>邮箱配置</span></Col>
                                        <Col md={8} className='d-flex justify-content-end' style={{ fontSize: '1.2vw' }}>
                                            <Button onClick={clickSetSenderEmail} variant="primary" style={{ fontSize: '1.2vw', width: '20vw' }}>点击配置</Button>
                                        </Col>
                                    </Row>
                                    <Row style={{ marginTop: '1vw' }}>
                                        <Col md={4} className='d-flex justify-content-center' style={{ fontSize: '1.2vw' }}><span style={{ marginTop: '0.3vw' }}>推特配置</span></Col>
                                        <Col md={8} className='d-flex justify-content-end' style={{ fontSize: '1.2vw' }}>
                                            <Button onClick={clickSetTwitter} variant="primary" style={{ fontSize: '1.2vw', width: '20vw' }}>点击配置</Button>
                                        </Col>
                                    </Row>
                    
                                </Col>

                                <Col md={6}>
                                    <Row>
                                        <Col md={4} className='d-flex justify-content-center' style={{ fontSize: '1.2vw' }}>
                                            <span style={{ marginTop: '0.3vw' }}>IP代理</span></Col>
                                        <Col md={8} className='d-flex justify-content-end' style={{ fontSize: '1.2vw' }}>
                                            <Button onClick={clickSetIpProxy} variant="primary" style={{ fontSize: '1.2vw', width: '20vw' }}>点击配置</Button>
                                        </Col>
                                    </Row>
                                    <Row style={{ marginTop: '1vw' }}>
                                        <Col className='d-flex justify-content-end'>
                                            <Button style={{ fontSize: '1.2vw' }}>应用</Button>
                                        </Col>
                                    </Row>
                                    
                                </Col>
                            </Row>

                        </Card.Body>
                    </Card>
                </Col>
            </Row>
            <Row style={{ marginTop: '1.0vw' }}>
                <Col>
                    <Card>
                        <Card.Header>
                            <Row>
                                <Col md={6}>
                                    <Button onClick={addMonitorUrl} style={{ fontSize: '1.2vw' }}>添加监控url</Button></Col>
                                <Col md={6} className='d-flex justify-content-end'>
                                    <Button onClick={clearList} style={{ fontSize: '1.2vw' }}>清空</Button></Col>
                            </Row>
                        </Card.Header>
                        <Card.Body>
                            <div style={{height:'25vw',overflowY:'auto'}}>
                                {taskData.monitorList && taskData.monitorList.map((url, index) => (
                                    <Row key={index}>
                                        <Col md={10} style={{ fontSize: '1.2vw', marginTop: '0.5vw' }}>{url}</Col>
                                        <Col md={2} style={{ fontSize: '1.2vw', marginTop: '0.5vw' }}>
                                            <Button onClick={(index)=>deleteUrl(index)} style={{ fontSize: '1.2vw' }}>删除</Button>
                                        </Col>
                                    </Row>
                                ))}
                            </div>
                        </Card.Body>
                        <Card.Footer>
                            <Row>
                                <Col className='d-flex justify-content-end'>
                                    <Button onClick={()=>execTask(true)} style={{ fontSize: '1.2vw' }}>代理启动</Button>
                                    <Button onClick={()=>execTask(false)}style={{ fontSize: '1.2vw',marginLeft:'1.0vw' }}>启动</Button>
                                    <Button onClick={()=>terminateTask()}style={{ fontSize: '1.2vw',marginLeft:'1.0vw' }}>结束任务</Button>
                                </Col>
                            </Row>
                        </Card.Footer>
                    </Card>
                </Col>
            </Row>
            <CustomModal ref={childRef} {...customModalProp} />
        </Container>
    )
}