import { Container, Button, Row, Col, Card,Spinner } from 'react-bootstrap';
import { useState } from 'react';
import ChooseWalletModal from '../components/chooseWalletModal';
import APIManager from '../../../utils/api';
import { shortAddress } from '../../../utils';



const apiManager = APIManager.getInstance();
export default function FaucetPage({task ,returnMainPage }) {
    const [walletList, setWalletList] = useState([]);
    const [chooseWalletModalProp, setChooseWalletModalProp] = useState({ show: false });
    const [ipConfigAvailableObj, setIpConfigAvailableObj] = useState({});
    const clickChooseWallet = () => {
        setChooseWalletModalProp({ show: true,
            onHide: () => {setChooseWalletModalProp({ show: false })},
            confirm: (selectedWallets) => {
                let newWalletList = [...walletList];
                
                let newIpConfigAvailableObj = {...ipConfigAvailableObj};
                for(let i = 0; i < selectedWallets.length; i++){
                    let wallet = selectedWallets[i];
                    if(wallet.ipHost&&wallet.ipPort&&wallet.ipUsername&&wallet.ipPassword&&wallet.ipType){
                        newIpConfigAvailableObj[wallet.address] = true;
                    }else{
                        newIpConfigAvailableObj[wallet.address] = false;
                    }
                    newWalletList.push(wallet);
                }
                setWalletList(newWalletList);
                setIpConfigAvailableObj(newIpConfigAvailableObj);
                setChooseWalletModalProp({ show: false });
            },
        });
    }
    const [proxyAvailableObj, setProxyAvailableObj] = useState({});
    const clickCheckProxy = async() => {
        let newProxyAvailableObj = {};
        setLoadingShow(true);
        setLoadingText('检查代理中');
        for(let i = 0; i < walletList.length; i++){
            let wallet = walletList[i];
            if(ipConfigAvailableObj[wallet.address]){
                let res = await apiManager.checkProxy({
                    ipHost:wallet.ipHost,
                    ipPort:wallet.ipPort,
                    ipUsername:wallet.ipUsername,
                    ipPassword:wallet.ipPassword,
                    ipType:wallet.ipType
                });
                console.log('res:',res)
                if(res.success){
                    newProxyAvailableObj[wallet.address] = true;
                }else{
                    newProxyAvailableObj[wallet.address] = false;
                }
            }else{
                newProxyAvailableObj[wallet.address] = false
            }
        }
        setProxyAvailableObj(newProxyAvailableObj);
        setLoadingShow(false);

    }
    const [loadingShow, setLoadingShow] = useState(false);
    const [loadingText, setLoadingText] = useState('');

    const execTask = async() => {
        for(let wallet of walletList){
            if(proxyAvailableObj[wallet.address]){
                wallet['useProxy'] = true;
            }else{
                wallet['useProxy'] = false;
            }
        }
        console.log('walletList:',walletList)
        console.log('task:',task)
        let res = await apiManager.execTask(task.taskKey,walletList,{});
        console.log('res:',res);
        if(res){
            alert('任务启动成功');
        }
    }
    const deleteWallet = (index) => {
        let newWalletList = [...walletList];
        newWalletList.splice(index,1);
        setWalletList(newWalletList);
    }
   
    return (
        <Container>
            <Row>
                <Col md={6}><h3>领水任务</h3></Col>
                <Col md={6}>
                    <div className='d-flex justify-content-end'>
                        <Button variant="primary" style={{fontSize:'1.5vw'}} onClick={returnMainPage}>返回</Button>
                    </div>
                </Col>
            </Row>
            <Row style={{marginTop:'1.0vw'}}>
                <Col md={2}><Button onClick={clickChooseWallet} style={{fontSize:'1.2vw',width:'9vw'}}>选择钱包</Button></Col>
                <Col md={2}><Button onClick={clickCheckProxy} style={{fontSize:'1.2vw',width:'9vw'}}>检查代理</Button></Col>
                <Col md={2}><Button onClick={()=>setWalletList([])} style={{fontSize:'1.2vw',width:'9vw'}}>清空</Button></Col>

            </Row>
            <Row style={{marginTop:'1.0vw'}}>
                <Col>
                    <Card style={{height:'50vw'}}>
                        <Card.Header>
                            <Row>
                                <Col style={{fontSize:'1.5vw'}}>建议在钱包管理页面配置ip代理</Col>
                                {loadingShow&&<Col className='d-flex justify-content-end'>
                                        <span style={{fontSize:'1.2vw'}}>{loadingText}</span>

                                        <Spinner animation="border" variant="success" size='sm'/>
                                    </Col>
                                 }
                            </Row>
                            
                        </Card.Header>
                        <Card.Body>
                            <Row>
                                <Col md={2} style={{ fontSize: '1.2vw' }}>钱包名称</Col>
                                <Col md={2} style={{ fontSize: '1.2vw' }}>地址</Col>
                                <Col md={4} style={{ fontSize: '1.2vw' }}>代理ip</Col>
                                <Col md={2} style={{ fontSize: '1.2vw' }}>连接状态</Col>
                                <Col md={2} style={{ fontSize: '1.2vw' }}>操作</Col>
                            </Row>
                            <div style={{height:'35vw',overflowY:'auto'}}>
                                {walletList.map((wallet, index) => (
                                    <Row key={index}>
                                        <Col md={2} style={{ fontSize: '1.2vw',marginTop:'0.5vw' }}>{wallet.name}</Col>
                                        <Col md={2} style={{ fontSize: '1.2vw',marginTop:'0.5vw' }}>{shortAddress(wallet.address)}</Col>
                                        <Col md={4} style={{ fontSize: '1.2vw',marginTop:'0.5vw' }}>{ipConfigAvailableObj[wallet.address]?wallet.ipHost:'未配置'}</Col>
                                        <Col md={2} style={{ fontSize: '1.2vw',marginTop:'0.5vw' }}>{proxyAvailableObj[wallet.address]?<span style={{color:'green'}}>available</span>:<span style={{color:'red'}}>unavailable</span>}</Col>
                                        <Col md={2} style={{ fontSize: '1.2vw',marginTop:'0.5vw' }}>
                                            <Button onClick={()=>{deleteWallet(index)}} style={{ fontSize: '1.2vw' }}>删除</Button>
                                        </Col>
                                    </Row>
                                ))}
                            </div>
                        </Card.Body>
                        <Card.Footer>
                            <Row>
                                <Col className='d-flex justify-content-end'>
                                    <Button onClick={execTask} style={{ fontSize: '1.2vw' }}>执行</Button>
                                </Col>
                            </Row>
                        </Card.Footer>
                    </Card>
                </Col>
            </Row>
            <ChooseWalletModal {...chooseWalletModalProp}/>
        </Container>)

}