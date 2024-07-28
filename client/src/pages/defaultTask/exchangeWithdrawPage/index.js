import { Container, Button, Row, Col, Card,Modal,Form } from 'react-bootstrap';
import { useState, useEffect, useRef } from 'react';
import CustomModal from '../../../components/customModal';
import AddWalletModal from '../components/addWalletModal';
import ChooseWalletModal from '../components/chooseWalletModal';
import APIManager from '../../../utils/api';
import { eventEmitter } from '../../../utils/eventEmitter';
import { shortAddress,formatNumber } from '../../../utils';



const WithdrawConfigModal = ({show,onHide,data,config, confirm, confirmInfo})=>{
    const [exchangeValue, setExchange] = useState('');
    const [currencyValue, setCurrency] = useState('');
    const [balanceInfo, setBalanceInfo] = useState({});
    const [networkList, setNetworkList] = useState({});
    const [networkValue, setNetwork] = useState('');
    const [totalBalance, setTotalBalance] = useState(null);
    const [amount, setAmount] = useState(undefined);

    useEffect(() => {
        if(data){
            setBalanceInfo(data.balanceInfo)
        }
        if(config){
            setExchange(config.exchange);
            setCurrency(config.currency);
            setNetwork(config.network);
            setAmount(config.amount);
        }else{
            setExchange('');
            setCurrency('');
            setNetwork('');
        }
    },[data]);
    const clickSetExchange = (e) => {
        setExchange(e.target.value);
        setCurrency('');
        setNetwork('');
        setTotalBalance(null);
    }
    const clickSetCurrency = (e) => {
        setCurrency(e.target.value);
        let networks = balanceInfo[exchangeValue].filter((info) => info.currency === e.target.value)[0].networks;
        setNetworkList(networks);
        setTotalBalance(balanceInfo[exchangeValue].filter((info) => info.currency === e.target.value)[0].balance);

    }
    const clickConfirm = ()=>{
        if(!exchangeValue || !currencyValue || !networkValue || !amount){
            alert('请填写完整信息');
            return;
        }
        let config = {
            exchange:exchangeValue,
            currency:currencyValue,
            network:networkValue,
            amount:amount
        }
        confirm(config,confirmInfo);
    }
    return (
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton>
                <Modal.Title>提币配置</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Row>
                    <Col>请选择交易所</Col>
                    <Col>
                        <Form.Select value={exchangeValue} onChange={(e) => clickSetExchange(e)}>
                            <option value="" disabled>选择网络</option>
                            <option value={'binance'}>币安</option>
                            <option value={'okx'}>Okx</option>
                        </Form.Select>
                    </Col>
                </Row>
                {exchangeValue&&<Row>
                    <Col>请选择币种</Col>
                    <Col>
                        <Form.Select value={currencyValue} onChange={(e) => clickSetCurrency(e)}>
                            <option value="" disabled>选择币种</option>
                            {
                                balanceInfo[exchangeValue] && balanceInfo[exchangeValue].map((info, index) => (
                                    <option value={info.currency} key={index}>{info.currency}</option>
                                ))
                            }
                        </Form.Select>
                    </Col>
                </Row>}
                {currencyValue&&<Row>
                    <Col>提币网络</Col>
                    <Col>
                        <Form.Select value={networkValue} onChange={(e) => setNetwork(e.target.value)}>
                            <option value="" disabled>选择网络</option>
                            {
                                networkList && Object.keys(networkList).map((network, index) => (
                                    <option value={network} key={index}>{`${network}  手续费：${networkList[network]}`}</option>
                                ))
                            }
                        </Form.Select>
                    </Col>
                </Row>}
                {networkValue&&<Row>
                    <Col>提币数量</Col>
                    <Col>
                        <Form.Control value={amount} onChange={(e)=>setAmount(e.target.value)}  type='text' placeholder={`余额${totalBalance}`} />
                    </Col>
                </Row>}
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={clickConfirm}>确认</Button>
            </Modal.Footer>
        </Modal>
    )
}


export default function ExchangeWithdrawPage({ task, returnMainPage }) {
    const [apiInfo, setApiInfo] = useState({});
    const apiManager = APIManager.getInstance();

    useEffect(() => {
        let apiInfoFromStorage = JSON.parse(window.localStorage.getItem('apiInfo'));
        if (apiInfoFromStorage) {
            setApiInfo(apiInfoFromStorage);
        }
    }, []);
    const [walletList, setWalletList] = useState([]);
    const [chooseWalletModalProp, setChooseWalletModalProp] = useState({ show: false });
    const clickChooseWallet = (info) => { 
        setChooseWalletModalProp({
            show: true,
            onHide: () => setChooseWalletModalProp({ show: false }),
            confirm: (wallets) => {
                console.log('wallets:', wallets);
                setChooseWalletModalProp({ show: false });
                setWalletList([...walletList, ...wallets]);
            },
            confirmInfo: info
        });
    };
    const [addWalletModalProp, setAddWalletModalProp] = useState({ show: false });
    const clickAddWallet = (info) => {
        setAddWalletModalProp({
            show: true,
            onHide: () => setAddWalletModalProp({ show: false }),
            confirm: (wallet) => {
                console.log('wallet:', wallet);
                setAddWalletModalProp({ show: false });
                setWalletList([...walletList, {address:wallet}]);
            },
            confirmInfo: info
        });
     };
    const deleteWallet = (index) => {
        let newWalletList = [...walletList];
        newWalletList.splice(index, 1);
        setWalletList(newWalletList);
    }
    const [apiKeyModalProp, setApiKeyModalProp] = useState({ show: false });
    const childRef = useRef();

    const [withdrawConfigModalProp, setWithdrawConfigModalProp] = useState({ show: false });
    const [defaultConfig, setDefaultConfig] = useState({});
    const clickWithdrawConfig = (index = -1) => {
        if (!apiInfo['binance'] && !apiInfo['okx']) {
            alert('请先设置ApiKey');
            return;
        }
        if (!balanceInfo['binance'] && !balanceInfo['okx']) {
            alert('请先查询余额');
            return;
        }
        if (!walletList.length) {
            alert('请先添加提币地址');
            return;
        }
        let config;
        if (index === -1) {
            config = defaultConfig;
        }else{
            config = {
                exchange: walletList[index].exchange,
                currency: walletList[index].currency,
                network: walletList[index].network,
                amount: walletList[index].amount
            }
        }
        setWithdrawConfigModalProp({
            show: true,
            onHide: () => setWithdrawConfigModalProp({ show: false }),
            confirm: (config,confirmInfo) => {
                let index = confirmInfo.index;
                if (index === -1) {
                    setDefaultConfig(config);
                    let newWalletList = walletList.map((wallet) => {
                        return { ...wallet, ...config };
                    })
                    setWalletList(newWalletList);
                }else{
                    let newWalletList = [...walletList];
                    newWalletList[index] = { ...newWalletList[index], ...config };
                    setWalletList(newWalletList);
                }
                setWithdrawConfigModalProp({ show: false });
            },
            config,
            data:{
                balanceInfo:balanceInfo,
                apiInfo:apiInfo
            },
            confirmInfo: { index }
        });
    }


    const clickSetApiKey = (exchange) => {
        if (!apiInfo[exchange]) {
            apiInfo[exchange] = {};
        }
        let exchangeApiInfo = apiInfo[exchange];
        childRef.current.setValueObj(exchangeApiInfo);
        if(exchange === 'binance'){
            setApiKeyModalProp({
                show: true,
                title: `设置${exchange} ApiKey`,
                handleClose: () => setApiKeyModalProp({ show: false }),
                handleData: (key, value) => {
                    exchangeApiInfo[key] = value;
                    childRef.current.updateValueObj(key, value);
                },
                rowList: [
                    [
                        { type: 'label', colWidth: 4, text: 'ApiKey', style: { textAlign: 'right', marginLeftRight: '10px' } },
                        { type: 'input', colWidth: 6, placeholder: exchangeApiInfo?.apiKey || '请输入ApiKey', key: 'apiKey' }
                    ],
                    [
                        { type: 'label', colWidth: 4, text: 'Secret', style: { textAlign: 'right', marginLeftRight: '10px' } },
                        { type: 'input', colWidth: 6, placeholder: exchangeApiInfo?.secret || '请输入Secret', key: 'secret' }
                    ],
                    [
                        {
                            type: 'button', colWidth: 12, text: '确认', style: { textAlign: 'right' },
                            click: async () => {
                                setApiKeyModalProp({ show: false });
                                setApiInfo({ ...apiInfo, [exchange]: exchangeApiInfo });
                                window.localStorage.setItem('apiInfo', JSON.stringify(apiInfo));
                            }
                        }
                    ]
                ]
            });
        }else if(exchange === 'okx'){
            setApiKeyModalProp({
                show: true,
                title: `设置${exchange} ApiKey`,
                handleClose: () => setApiKeyModalProp({ show: false }),
                handleData: (key, value) => {
                    exchangeApiInfo[key] = value;
                    childRef.current.updateValueObj(key, value);
                },
                rowList: [
                    [
                        { type: 'label', colWidth: 4, text: 'ApiKey', style: { textAlign: 'right', marginLeftRight: '10px' } },
                        { type: 'input', colWidth: 6, placeholder: exchangeApiInfo?.apiKey || '请输入ApiKey', key: 'apiKey' }
                    ],
                    [
                        { type: 'label', colWidth: 4, text: 'Secret', style: { textAlign: 'right', marginLeftRight: '10px' } },
                        { type: 'input', colWidth: 6, placeholder: exchangeApiInfo?.secret || '请输入Secret', key: 'secret' }
                    ],
                    [
                        { type: 'label', colWidth: 4, text: 'Password', style: { textAlign: 'right', marginLeftRight: '10px' } },
                        { type: 'input', colWidth: 6, placeholder: exchangeApiInfo?.secret || '请输入Password', key: 'password',inputType:'password' }
                    ],
                    [
                        {
                            type: 'button', colWidth: 12, text: '确认', style: { textAlign: 'right' },
                            click: async () => {
                                setApiKeyModalProp({ show: false });
                                setApiInfo({ ...apiInfo, [exchange]: exchangeApiInfo });
                                window.localStorage.setItem('apiInfo', JSON.stringify(apiInfo));

                            }
                        }
                    ]
                ]
            });
        }

    };
    
    const [balanceInfo, setBalanceInfo] = useState({});

    const clickCheckBalance = (exchange) => { 
        if (!apiInfo[exchange]) {
            alert('请先设置ApiKey');
            return;
        }
        let taskData = {
            exchange,
            apiKey: apiInfo[exchange].apiKey,
            secret: apiInfo[exchange].secret,
            password: apiInfo[exchange].password
        };
        apiManager.execTask('ccxtCheckBalance',null ,taskData);

        const messageCallback = (info) => {
            if (info.taskName === 'ccxtCheckBalance') {
                if (info.success) {
                    let result = info.message.message;
                    setBalanceInfo({ ...balanceInfo, [exchange]: result });
                    alert('查询余额成功');
                }else{
                    alert('查询余额失败');
                }
                eventEmitter.off('taskCompleted', messageCallback);
            }
        }
        eventEmitter.emit('taskStart');
        eventEmitter.on('taskCompleted', messageCallback);
        alert('查询余额任务已提交');
    }
    const clickClearAll = () => {
        setWalletList([]);
    }
    const execTask = () => {
        if (!walletList.length) {
            alert('请先添加提币地址');
            return;
        }
        if (!balanceInfo['binance'] && !balanceInfo['okx']) {
            alert('请先查询余额');
            return;
        }
        if (!apiInfo['binance'] && !apiInfo['okx']) {
            alert('请先设置ApiKey');
            return;
        }
        for (let wallet of walletList) {
            if (!wallet.amount) {
                alert('请设置提币数量');
                return;
            }
        }
        let taskData = {
            binance: {
                apiKey: apiInfo['binance'].apiKey,
                secret: apiInfo['binance'].secret
            },
            okx: {
                apiKey: apiInfo['okx'].apiKey,
                secret: apiInfo['okx'].secret,
                password: apiInfo['okx'].password
            },
            walletList
        };
        apiManager.execTask('ccxtWithdraw',null, taskData);

        const messageCallback = (info) => {
            if (info.taskName === 'ccxtWithdraw') {
                if (info.success) {
                    let result = info.message.message;
                    let successNum = result['success'].length;
                    let failNum = result['fail'].length;
                    alert(`提币任务执行成功，成功${successNum}个，失败${failNum}个`);
                }else{
                    alert('提币任务执行失败');
                }
                eventEmitter.off('taskCompleted', messageCallback);
            }
        }
        eventEmitter.emit('taskStart');
        eventEmitter.on('taskCompleted', messageCallback);
        alert('提币任务已提交');
    }
    return (
        <Container>
            <Row>
                <Col md={6}><h3>提币任务</h3></Col>
                <Col md={6}>
                    <div className='d-flex justify-content-end'>
                        <Button variant="primary" style={{fontSize:'1.5vw'}} onClick={returnMainPage}>返回</Button>
                    </div>
                </Col>
            </Row>
            <Row style={{ marginTop: '1.0vw' }}>
                <Col md={6}>
                    <Card>
                        <Card.Header><Card.Title>币安</Card.Title></Card.Header>
                        <Card.Body>
                            <Row>
                                <Col md={4}>
                                    <Button style={{ marginTop: '1.0vw', fontSize: '1.2vw',width:'9vw' }} onClick={() => clickSetApiKey('binance')}>配置Api</Button>
                                    <Button style={{ marginTop: '1.0vw', fontSize: '1.2vw',width:'9vw' }}
                                        onClick={() => clickCheckBalance('binance')}>查询余额</Button>
                                </Col>
                                <Col md={8}>
                                    <Card.Title style={{ fontSize: '1.2vw' }}>可提现资金（现货账户）</Card.Title>
                                    <Container style={{ height: '8vw', overflowY: 'auto', border: '2px solid #000' }}>
                                        
                                        {
                                            balanceInfo['binance'] && balanceInfo['binance'].map((info, index) => (
                                                <Row style={{fontSize:'1.2vw'}} key={index}>
                                                    <Col>{info.currency} : {formatNumber(info.balance)}</Col>
                                                </Row>
                                            ))
                                        }
                                       
                                    </Container>
                                </Col>
                            </Row>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={6}>
                    <Card>
                        <Card.Header><Card.Title>Okx</Card.Title></Card.Header>
                        <Card.Body>
                            <Row>
                                <Col md={4}>
                                    <Button onClick={() => clickSetApiKey('okx')} style={{ marginTop: '1.0vw', fontSize: '1.2vw',width:'9vw' }}>配置Api</Button>
                                    <Button style={{ marginTop: '1.0vw', fontSize: '1.2vw',width:'9vw' }}
                                        onClick={()=>clickCheckBalance('okx')}>查询余额</Button>
                                </Col>
                                <Col md={8}>
                                    <Card.Title style={{ fontSize: '1.2vw' }}>可提现资金（资金账户）</Card.Title>
                                    <Container style={{ height: '8vw', overflowY: 'auto', border: '2px solid #000' }}>
                                        {
                                            balanceInfo['okx'] && balanceInfo['okx'].map((info, index) => (
                                                <Row style={{fontSize:'1.2vw'}} key={index}>
                                                    <Col>{info.currency} : {formatNumber(info.balance)}</Col>
                                                </Row>
                                            ))
                                        }
                                    </Container>
                                </Col>
                            </Row>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
            <Row style={{ marginTop: '1.0vw' }}>
                <Card>
                    <Card.Header>
                        <Row>
                            <Col md={2}><Button onClick={clickChooseWallet} style={{ fontSize: '1.2vw',width:'9vw' }}>选择钱包</Button></Col>
                            <Col md={2}><Button onClick={clickAddWallet} style={{ fontSize: '1.2vw',width:'9vw' }}>添加钱包</Button></Col>
                            <Col md={2}><Button onClick={()=>clickWithdrawConfig(-1)} style={{ fontSize: '1.2vw',width:'9vw' }}>提币配置</Button></Col>
                            <Col md={2}><Button onClick={clickClearAll} style={{ fontSize: '1.2vw',width:'9vw' }}>清空</Button></Col>
                        </Row>
                    </Card.Header>
                    <Card.Body>
                        <Row>
                            <Col md={2} style={{ fontSize: '1.2vw' }}>提币地址</Col>
                            <Col md={2} style={{ fontSize: '1.2vw' }}>交易所</Col>
                            <Col md={2} style={{ fontSize: '1.2vw' }}>币种</Col>
                            <Col md={2} style={{ fontSize: '1.2vw' }}>网络</Col>
                            <Col md={2} style={{ fontSize: '1.2vw' }}>提币数量</Col>
                            <Col md={2} style={{ fontSize: '1.2vw' }}>操作</Col>
                        </Row>
                        <Container style={{ height: '20vw', overflowY: 'auto', border: '2px solid #000' }}>
                            {
                                walletList.map((wallet, index) => (
                                    <Row key={index} style={{fontSize:'1.2vw'}}>
                                        <Col md={2}>{shortAddress(wallet.address)}</Col>
                                        <Col md={2}>{wallet.exchange}</Col>
                                        <Col md={2}>{wallet.currency}</Col>
                                        <Col md={2}>{wallet.network}</Col>
                                        <Col md={2}>{wallet.amount}</Col>
                                        <Col md={2}>
                                            <Row style={{margin:'0.1vw'}}>
                                                <Col md={6}><Button onClick={()=>clickWithdrawConfig(index)} style={{ fontSize: '1.0vw',width:'3vw'}}>修改</Button></Col>
                                                <Col md={6}><Button onClick={()=>deleteWallet(index)} style={{ fontSize: '1.0vw',width:'3vw' }}>删除</Button></Col>
                                            </Row>
                                        </Col>
                                    </Row>
                                ))
                            }
                        </Container>
                    </Card.Body>
                    <Card.Footer>
                        <div className='d-flex justify-content-end'>
                            <Button onClick={execTask} style={{fontSize:'1.5vw'}}>执行</Button>
                        </div>
                    </Card.Footer>
                </Card>
            </Row>
            <CustomModal ref={childRef} {...apiKeyModalProp} />
            <ChooseWalletModal {...chooseWalletModalProp} />
            <AddWalletModal {...addWalletModalProp}/>
            <WithdrawConfigModal {...withdrawConfigModalProp} />
        </Container>
    );
}
