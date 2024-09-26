import { Container, Button, Row, Col, Spinner, Modal, Form } from 'react-bootstrap';
import { useState, useEffect, useRef } from 'react';
import ChooseWalletModal from '../components/chooseWalletModal';
import AddWalletModal from '../components/addWalletModal';
import Web3Manager from '../../../utils/web3';
import CustomModal from '../../../components/customModal';
import { shortAddress, sleep, formatNumber, log } from '../../../utils';


const priorities = {
    'execTask': 0,
    'deleteWallet': 1,
    'setConfig': 2,
    'updatePairInfo': 3,
};





const web3Manager = Web3Manager.getInstance();
function SetConfigModal({ show, onHide, config, confirm, index }) {
    const [networkList, setNetworkList] = useState([]);
    const [networkValue, setNetworkValue] = useState('');
    const [rpcShow, setRpcShow] = useState(false);
    const [rpc, setRpc] = useState('');

    const [pairAddress, setPairAddress] = useState('');

    const [slippagePercent, setSlippagePercent] = useState('');
    const [costType, setCostType] = useState('');
    const [leftCostPercent, setLeftCostPercent] = useState('');
    const [rightCostPercent, setRightCostPercent] = useState('');
    const [leftCostAmount, setLeftCostAmount] = useState('');
    const [rightCostAmount, setRightCostAmount] = useState('');

    const setNetwork = (value) => {
        if (value === 'setNetwork') {
            setRpcShow(true);
        } else {
            setRpcShow(false);
        }

        setNetworkValue(value);
    }

    const saveConfig = async () => {
        if (!networkValue) {
            alert('请选择网络');
            return;
        }
        if (!rpc && networkValue === 'setNetwork') {
            alert('请输入rpc');
            return;
        }


        if (!web3Manager.checkAddress(pairAddress)) {
            alert('请输入正确的uniV2PairAddress');
            return;
        }
        if (leftCostAmount && rightCostAmount) {
            alert('只能设置一边的花费');
            return;
        }
        if (leftCostPercent && rightCostPercent) {
            alert('只能设置一边的花费');
            return;
        }
        let netRpc = '';
        if (networkValue !== 'setNetwork') {
            netRpc = await web3Manager.getRpc(networkValue);

            if (!netRpc) {
                alert('不支持的网络');
                return;
            }
        } else {
            netRpc = rpc;
        }


        confirm({
            network: networkValue,
            rpc: netRpc,
            pairAddress,
            costType,
            leftCostPercent,
            rightCostPercent,
            leftCostAmount,
            rightCostAmount,
            slippagePercent,
        }, index);

    }

    useEffect(() => {
        setNetworkList(web3Manager.getNetworkList(['ETH', 'BSC']));
        console.log('config', config);
        if (config) {
            config.network && setNetworkValue(config.network);
            config.rpc && setRpc(config.rpc);
            if (config.network === 'setNetwork') {
                setRpcShow(true);
            }

            config.pairAddress && setPairAddress(config.pairAddress);

            config.slippagePercent && setSlippagePercent(config.slippagePercent);

        }
    }, [config])
    const clickSetNetwork = (e) => {
        if (e.target.value === networkValue) {
            setRpcShow(true);
            return
        }
        setNetwork(e.target.value);
        
        setPairAddress('');
    }
    return (
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton>
                <Modal.Title>{index === -1 ? '全局配置' : `配置第${index + 1}个交易`}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {index === -1 && <Row>
                    <Col>请选择网络</Col>
                    <Col>
                        <Form.Select value={networkValue} onChange={(e) => clickSetNetwork(e)}>
                            <option value="" disabled>选择网络</option>
                            {networkList.map((network, index) => (
                                <option key={index} value={network}>{network}</option>
                            ))}
                            <option value={"setNetwork"}>自定义网络</option>
                        </Form.Select>
                    </Col>
                </Row>}
                {index === -1 && rpcShow && <Row>
                    <Col>自定义网络</Col>
                    <Col>
                        <Form.Control type="text" value={rpc} placeholder="请输入RPC"
                            onChange={(e) => setRpc(e.target.value)} />
                    </Col>
                </Row>}


                <Row>
                    <Col>请输入池子LP地址</Col>
                    <Col>
                        <Form.Control type="text" value={pairAddress} placeholder="请输入池子LP地址"
                            onChange={(e) => { setPairAddress(e.target.value) }} />
                    </Col>
                </Row>
                <Row>
                    <Col>请选择交易类型</Col>
                    <Col>
                        <Form.Select value={costType} onChange={(e) => { setCostType(e.target.value) }}>
                            <option value="" disabled>选择交易类型</option>
                            <option value="amount">数量</option>
                            <option value="percent">百分比</option>
                        </Form.Select>
                    </Col>
                </Row>
                {costType === 'amount' && <>
                    <Row>
                        <Col>左币种花费</Col>
                        <Col>
                            <Form.Control type="text" value={leftCostAmount} placeholder="左币种花费"
                                onChange={(e) => { setLeftCostAmount(e.target.value) }} />
                        </Col>
                    </Row>
                    <Row>
                        <Col>右币种花费</Col>
                        <Col>
                            <Form.Control type="text" value={rightCostAmount} placeholder="右币种花费"
                                onChange={(e) => { setRightCostAmount(e.target.value) }} />
                        </Col>
                    </Row>

                </>}
                {costType === 'percent' && <>
                    <Row>
                        <Col>左币种花费百分比</Col>
                        <Col>
                            <Form.Control type="text" value={leftCostPercent} placeholder="左币种花费百分比"
                                onChange={(e) => { setLeftCostPercent(e.target.value) }} />
                        </Col>
                    </Row>
                    <Row>
                        <Col>右币种花费百分比</Col>
                        <Col>
                            <Form.Control type="text" value={rightCostPercent} placeholder="右币种花费百分比"
                                onChange={(e) => { setRightCostPercent(e.target.value) }} />
                        </Col>
                    </Row>
                </>}


                <Row>

                    <Col>滑点（百分比）：</Col>
                    <Col>
                        <Form.Control type="text" value={slippagePercent} placeholder="滑点"
                            onChange={(e) => { setSlippagePercent(e.target.value) }} />
                    </Col>

                </Row>

            </Modal.Body>
            <Modal.Footer>
                <Button onClick={() => saveConfig()}>应用</Button>
            </Modal.Footer>
        </Modal>
    )

}

export default function PrivateSwap({ task, returnMainPage }) {
    const [walletList, setWalletListT] = useState([]);
    const [chooseWalletModalProp, setChooseWalletModalProp] = useState({ show: false });
    const setWalletList = (walletList) => {
        //把walletList中的BigInt转换为string

        window.localStorage.setItem('tradeWalletList', JSON.stringify(walletList));
        setWalletListT(walletList);
    }
    //读取缓存walletList
    useEffect(() => {
        const getWalletList = () => {
            const walletListLocal = window.localStorage.getItem('tradeWalletList');
            if (walletListLocal !== 'null') {
                console.log('walletListLocal type:', typeof walletListLocal);
                console.log('walletListLocal:', walletListLocal);
                setWalletList(JSON.parse(walletListLocal));
            } else {
                console.log('walletListLocalNull:', walletListLocal);
                setWalletList([]);
            }
            const defaultConfigLocal = window.localStorage.getItem('tradeDefaultConfig');
            if (defaultConfigLocal !== 'null') {
                console.log('defaultConfigLocal type:', typeof defaultConfigLocal);
                console.log('defaultConfigLocal:', defaultConfigLocal);
                setDefaultConfig(JSON.parse(defaultConfigLocal));
            }

            reUpdateRef.current = true;
        }
        getWalletList();
    }, [])
    
    const actionQueueRef = useRef([]);
    const isProcessingRef = useRef(false); // 使用 useRef 来管理 isProcessing
    const reUpdateRef = useRef(false);

    const queueAction = async(action) => {
        
        actionQueueRef.current.push(action);
            // 根据优先级重新排序
        actionQueueRef.current.sort((a, b) => priorities[a.type] - priorities[b.type]);
        
        processAction();
    };
    const processAction = async () => {
        if(isProcessingRef.current){
            return;
        }
        isProcessingRef.current = true;

        while(actionQueueRef.current.length > 0){
            const action = actionQueueRef.current.shift()
            if(action.type === 'execTask'){
                reUpdateRef.current = true;
                await execTask();
            }else if(action.type === 'deleteWallet'){
                reUpdateRef.current = true;
                console.log('deleteWallet:',action.index);
                await deleteWallet(action.index);
                console.log('deleteWalletEnd:',action.index);
            }else if(action.type === 'setConfig'){
                reUpdateRef.current = true;
                console.log('setConfig:',action.index);
                await updatePairInfo({type:action.type,index:action.index,pairInfo:action.pairInfo});
                console.log('setConfigEnd:',action.index);
            }else if(action.type === 'updatePairInfo'){

                if(reUpdateRef.current){
                    console.log('reUpdate:',reUpdateRef.current);
                    actionQueueRef.current = [];
                    isProcessingRef.current = false;
                    reUpdateRef.current = false;
                    return;
                }
                await updatePairInfo({type:action.type,index:action.index,pairInfo:action.pairInfo});
            }
        }
        isProcessingRef.current = false;
        if(actionQueueRef.current.length > 0){
            processAction()
        }
    }

    const [gasPrice, setGasPrice] = useState(0);
    const [gasMultiplier, setGasMultiplier] = useState(1);
    const [gasCost, setGasCost] = useState(0);
    const [taskRunning, setTaskRunning] = useState(false);
    const calculateGasCost = (gasPrice, gasMultiplier) => {
        setGasCost(web3Manager.calculateSwapGasFee(gasPrice, gasMultiplier) * walletList.length);
    }
    //定时更新pair
    useEffect(() => {
        if (taskRunning) {
            return;
        }
        console.log('reUpdateRef:', reUpdateRef.current);
        const updatePair = async () => {
            const pairInfoObj = {}
            for (let i = 0; i < walletList.length; i++) {
                let pairAddress = walletList[i].pairInfo?.pairAddress;
                if (pairAddress) {
                    
                    if (!pairInfoObj[pairAddress]) {
                        pairInfoObj[pairAddress] = {};
                        const pairInfo = await web3Manager.getUniV2Reserve(pairAddress, walletList[i].pairInfo.rpc);
                        pairInfoObj[pairAddress].leftTokenReserve = pairInfo.leftTokenReserve;
                        pairInfoObj[pairAddress].rightTokenReserve = pairInfo.rightTokenReserve;
                        console.log('pairInfoObj:', pairInfoObj);
                    }

                    queueAction({type:'updatePairInfo',index:i,pairInfo:{...walletList[i].pairInfo,...pairInfoObj[pairAddress]}});
                }
            }
            if (walletList.length > 0 && walletList[0]?.pairInfo?.rpc) {
                console.log('pairRpc:', walletList[0].pairInfo.rpc);    
                const gasPriceNow = await web3Manager.getGasPrice(walletList[0].pairInfo.rpc);
                setGasPrice(gasPriceNow);
                calculateGasCost(gasPriceNow, gasMultiplier);
                console.log('gasPrice:', gasPriceNow);
            }

        }
        updatePair();
        const interval = setInterval(() => {
            updatePair();
        }, 10000);
        return () => {
            clearInterval(interval);
        }
    }, [reUpdateRef.current, taskRunning])
    const clickChooseWallet = () => {
        if(taskRunning){
            alert('任务执行中，请稍后');
            return
        }
        setChooseWalletModalProp({
            show: true,
            onHide: () => { setChooseWalletModalProp({ show: false }) },
            confirm: (selectedWallets) => {
                let newWalletList = [...walletList];
                for (let i = 0; i < selectedWallets.length; i++) {
                    let wallet = selectedWallets[i];
                    newWalletList.push(wallet);
                }
                setWalletList(newWalletList);
                setChooseWalletModalProp({ show: false });
                reUpdateRef.current = true;
            },
        });
    }
    const [addWalletModalProp, setAddWalletModalProp] = useState({ show: false });
    const clickAddWallet = () => {
        if(taskRunning){
            alert('任务进行中，请稍后');
            return;
        }
        setAddWalletModalProp({
            show: true,
            onHide: () => { setAddWalletModalProp({ show: false }) },
            confirm: (privateKey) => {
                const address = web3Manager.getAddressFromPrivateKey(privateKey);
                let newWalletList = [...walletList];
                newWalletList.push({
                    privateKey,
                    address,
                });
                setWalletList(newWalletList);
                setAddWalletModalProp({ show: false });
                reUpdateRef.current = true;
            },
            mode: 'key',
        });
    }
    const [configModalProp, setConfigModalProp] = useState({ show: false });
    const [defaultConfig, setDefaultConfig] = useState({});
    const clickSetConfig = (index) => {
        if(taskRunning){
            alert('任务运行中，请稍后尝试');
            return
        }
        setConfigModalProp({
            show: true,
            onHide: () => { setConfigModalProp({ show: false }) },
            config: index === -1 ? defaultConfig : walletList[index].pairInfo,
            confirm: async (config, index) => {
                console.log('setConfig:', config)
                if (config.pairAddress) {
                    const pairInfo = await web3Manager.getUniV2Info(config.pairAddress, config.rpc);
                    console.log('pairInfo:', pairInfo);
                    queueAction({type:"setConfig",index,pairInfo:{ ...config, ...pairInfo }})
                    reUpdateRef.current = true;
                }
                if (index === -1) {
                    setDefaultConfig(config);
                    window.localStorage.setItem('tradeDefaultConfig', JSON.stringify(config));
                }

                setConfigModalProp({ show: false });
            },
            index,
        });
    }
    



    const updatePairInfo = async ({type,index, pairInfo}) => {
        if (index === -1) {
            for (let i = 0; i < walletList.length; i++) {
                console.log('updatePairInfo:', i, pairInfo);
                queueAction({type,index:i,pairInfo});
            }
            return;
        }
        console.log(type, index, pairInfo);
        setLoadingShow(true);
        setLoadingText('更新配置中');
        let newWalletList = [...walletList];
        console.log('index:', index);
        let wallet = newWalletList[index];
        
        let leftTokenBalance = pairInfo.leftNative ? await web3Manager.getBalance(wallet.address, pairInfo.rpc) :
            await web3Manager.getErc20Balance(wallet.address, pairInfo.leftTokenAddress, pairInfo.rpc);
        let rightTokenBalance = pairInfo.rightNative ? await web3Manager.getBalance(wallet.address, pairInfo.rpc) :
            await web3Manager.getErc20Balance(wallet.address, pairInfo.rightTokenAddress, pairInfo.rpc);
        
        if (pairInfo.costType === 'percent') {
            if (pairInfo.leftCostPercent) {
                console.log(pairInfo.leftTokenSymbol, leftTokenBalance);

                pairInfo.leftTokenCost = formatNumber(leftTokenBalance * pairInfo.leftCostPercent / 100);
                //如果leftNative为true，说明是eth，需要减去gas
                if (pairInfo.leftNative) {
                    pairInfo.leftTokenCost = formatNumber(pairInfo.leftTokenCost);
                }
            }
            if (pairInfo.rightCostPercent) {
                console.log(pairInfo.rightTokenSymbol, rightTokenBalance);
                pairInfo.rightTokenCost = formatNumber(rightTokenBalance * pairInfo.rightCostPercent / 100);
                if (pairInfo.rightNative) {
                    console.log('gasCost:', gasCost);
                    console.log('walletList.length:', walletList.length);
                    console.log('rightTokenCost:', pairInfo.rightTokenCost);
                    pairInfo.rightTokenCost = formatNumber(pairInfo.rightTokenCost);
                }
            }
        }else if(pairInfo.costType === 'amount'){
            if (pairInfo.leftCostAmount) {
                pairInfo.leftTokenCost = pairInfo.leftCostAmount;
            }
            if (pairInfo.rightCostAmount) {
                pairInfo.rightTokenCost = pairInfo.rightCostAmount;
            }
        }
        
        if (pairInfo.leftTokenCost) {
            let gain = web3Manager.getSwapAmount(
                {
                    inAmount: pairInfo.leftTokenCost,
                    inDecimals: pairInfo.leftTokenDecimals,
                    outDecimals: pairInfo.rightTokenDecimals,
                    inReserve: pairInfo.leftTokenReserve,
                    outReserve: pairInfo.rightTokenReserve,
                }
            )
            pairInfo.rightTokenGain = formatNumber(gain);
            pairInfo.rightTokenGainMin = pairInfo.slippagePercent ? formatNumber(gain * (1 - pairInfo.slippagePercent / 100)) : formatNumber(gain);
        }
        if (pairInfo.rightTokenCost) {
            let gain = web3Manager.getSwapAmount(
                {
                    inAmount: pairInfo.rightTokenCost,
                    inDecimals: pairInfo.rightTokenDecimals,
                    outDecimals: pairInfo.leftTokenDecimals,
                    inReserve: pairInfo.rightTokenReserve,
                    outReserve: pairInfo.leftTokenReserve,
                }
            )
            pairInfo.leftTokenGain = formatNumber(gain);
            pairInfo.leftTokenGainMin = pairInfo.slippagePercent ? formatNumber(gain * (1 - pairInfo.slippagePercent / 100)) : formatNumber(gain);
        }
        const newPairInfo = { ...pairInfo };
        newPairInfo.leftTokenBalance = leftTokenBalance;
        newPairInfo.rightTokenBalance = rightTokenBalance;
        // console.log('pairInfo:', pairInfo);
        wallet.pairInfo = newPairInfo;
        newWalletList[index] = wallet;
        // console.log('newWalletList:',newWalletList);
        setWalletList(newWalletList);
        await sleep(1000);
        if (!taskRunning) {
            setLoadingShow(false);
        }
    }

    const clickDeleteWallet = async(index)=>{
        if(taskRunning){
            alert("任务执行中请稍后操作")
        }
        queueAction({type:"deleteWallet",index})
    }
    const deleteWallet = async(index) => {
        let newWalletList = [...walletList];
        newWalletList.splice(index, 1);
        setWalletList(newWalletList);
    }
    const [customModalProp, setCustomModalProp] = useState({ show: false });
    const clickModifyOrder = (fromIndex) => {
        let toIndex = -1;
        setCustomModalProp({
            show: true,
            handleClose: () => { setCustomModalProp({ show: false }) },
            title: '修改顺序',
            handleData: (key, value) => {
                console.log('key:', key, 'value:', value);
                toIndex = value;
            },
            rowList: [
                [
                    {
                        type: 'label',
                        text: '修改顺序'
                    },
                    {
                        type: 'input',
                        placeholder: '请输入目标序号',
                        key: 'toIndex',
                        inputType: 'number'
                    }
                ],
                [
                    {
                        type: 'button',
                        text: '确定',
                        colWidth: 3,
                        style: { marginLeft: 'auto' },
                        click: () => {
                            console.log('toIndex:', toIndex);

                            toIndex = toIndex - 1;
                            if (toIndex >= walletList.length) {
                                toIndex = walletList.length - 1;
                            }
                            if (toIndex < 0) {
                                toIndex = 0;
                            }
                            let newWalletList = [...walletList];
                            let wallet = newWalletList[fromIndex];
                            newWalletList.splice(fromIndex, 1);
                            newWalletList.splice(toIndex, 0, wallet);
                            setWalletList(newWalletList);
                            setCustomModalProp({ show: false });
                        }
                    }
                ]

            ]

        });
    }
    const childRef = useRef();

    const clickSetGasMultiplier = () => {
        let gasMultiplierCur = 1;
        setCustomModalProp({
            show: true,
            handleClose: () => { setCustomModalProp({ show: false }) },
            title: '设置gas倍数',
            handleData: (key, value) => {
                gasMultiplierCur = value
            },
            rowList: [
                [
                    {
                        type: 'label',
                        text: '设置gas倍数'
                    },
                    {
                        type: 'input',
                        placeholder: '请输入gas倍数',
                        key: 'gasMultiplier',
                        inputType: 'number',
                        value: gasMultiplier
                    }
                ],
                [
                    {
                        type: 'button',
                        text: '确定',
                        colWidth: 3,
                        style: { marginLeft: 'auto' },
                        click: () => {
                            if (gasMultiplierCur <= 1) {
                                alert('请输入大于1的数');
                                return;
                            }
                            setGasMultiplier(gasMultiplierCur);
                            calculateGasCost(gasPrice, gasMultiplierCur);
                            setCustomModalProp({ show: false });
                        }
                    }
                ]

            ]

        });
    }

    const execTask = async () => {
        log('开始执行隐私交易任务');
        if (taskRunning) {
            alert('任务正在执行中');
            return;
        }
        const callback = ({ type, message }) => {
            if (type === 'log') {
                log(message);
            } else if (type === 'error') {
                alert('任务出错，请查看日志');
                setTaskRunning(false);
                setLoadingShow(false);
                log(message);
            } else if (type === 'success') {
                alert('任务执行成功');
                setTaskRunning(false);
                setLoadingShow(false);
                log(message);
            }
        }

        setTaskRunning(true);
        setLoadingShow(true);
        setLoadingText('执行任务中');
        const pairRecord = {};
        const taskList = walletList.map((wallet) => {

            let slippagePercent = wallet.pairInfo.slippagePercent;
            if (pairRecord[wallet.pairInfo.pairAddress]) {
                slippagePercent = 100;
            } else {
                pairRecord[wallet.pairInfo.pairAddress] = true;
            }
            let inAddress;
            let outAddress;
            let inAmount;
            let outAmount;
            let inNative;
            let outNative;
            let inDecimals;
            let outDecimals;

            if (wallet.pairInfo.leftTokenCost && wallet.pairInfo.leftTokenCost > 0) {

                inAddress = wallet.pairInfo.leftTokenAddress;
                outAddress = wallet.pairInfo.rightTokenAddress;
                inAmount = wallet.pairInfo.leftTokenCost;

                if(inAmount <= 0){
                    log(`${wallet.address} inAmount <= 0,skip`);
                    return -1;
                }
                outAmount = formatNumber(wallet.pairInfo.rightTokenGain * (1 - slippagePercent / 100));
                inNative = wallet.pairInfo.leftNative;
                outNative = wallet.pairInfo.rightNative;
                inDecimals = wallet.pairInfo.leftTokenDecimals;
                outDecimals = wallet.pairInfo.rightTokenDecimals;
            } else if (wallet.pairInfo.rightTokenCost && wallet.pairInfo.rightTokenCost > 0) {
                inAddress = wallet.pairInfo.rightTokenAddress;
                outAddress = wallet.pairInfo.leftTokenAddress;
                inAmount = wallet.pairInfo.rightTokenCost;

                if(inAmount <= 0){
                    log(`${wallet.address} inAmount <= 0,skip`);
                    return -1;
                }
                outAmount = formatNumber(wallet.pairInfo.leftTokenGain * (1 - slippagePercent / 100));
                inNative = wallet.pairInfo.rightNative;
                outNative = wallet.pairInfo.leftNative;
                inDecimals = wallet.pairInfo.rightTokenDecimals;
                outDecimals = wallet.pairInfo.leftTokenDecimals;
            }else{
                log(`${wallet.name || shortAddress(wallet.address)} leftTokenCost and rightTokenCost both 0,skip`);
                return -1;
            }

            return {
                privateKey: wallet.privateKey,
                inAddress,
                outAddress,
                inAmount,
                outAmount,
                inNative,
                outNative,
                rpc: wallet.pairInfo.rpc,
                inDecimals,
                outDecimals,
            }
        });

        
        web3Manager.execPrivateSwapTask(taskList.filter((task)=>task !== -1), gasMultiplier, callback);

    }

    const [loadingShow, setLoadingShow] = useState(false);
    const [loadingText, setLoadingText] = useState('');

    return (
        <Container>
            <Row>
                <Col md={3}><h3>隐私交易</h3></Col>
                <Col md={3} style={{ fontSize: '1.5vw' }}>
                    支持eth uniswapV2<br />支持bsc pancakeV2
                </Col>
                <Col md={6}>
                    <div className='d-flex justify-content-end'>
                        <Button variant="primary" style={{ fontSize: '1.5vw' }} onClick={returnMainPage}>返回</Button>
                    </div>
                </Col>
            </Row>
            <Row style={{ marginTop: '1.0vw' }}>
                <Col md={2}>
                    <Button style={{ fontSize: '1.2vw', width: '9vw' }} onClick={clickChooseWallet}>选择钱包</Button>
                </Col>
                <Col md={2}>
                    <Button style={{ fontSize: '1.2vw', width: '9vw' }} onClick={clickAddWallet}>添加钱包</Button>
                </Col>
                <Col md={2}>
                    <Button style={{ fontSize: '1.2vw', width: '9vw' }} onClick={() => clickSetConfig(-1)}>设置配置</Button>
                </Col>
                <Col md={2}>
                </Col>
                <Col md={4}>
                    {loadingShow &&
                        <><span style={{ fontSize: '1.2vw' }}>{loadingText}</span>
                            <Spinner animation="border" variant="success" size='sm' /></>
                    }
                </Col>
            </Row>
            <Row style={{ border: '2px solid #000', marginTop: '20px' }}>
                <Row style={{ borderBottom: '1px solid #000', marginLeft: '3px' }}>
                    <Col md={2} style={{ fontSize: '1.5vw' }}>账户</Col>
                    <Col md={2} style={{ fontSize: '1.5vw' }}>左币种</Col>
                    <Col md={2} style={{ fontSize: '1.5vw' }}>右币种</Col>
                    <Col md={2} style={{ fontSize: '1.5vw' }}>{"左->右 数量"}</Col>
                    <Col md={2} style={{ fontSize: '1.5vw' }}>{"右->左 数量"}</Col>
                    <Col md={2} style={{ fontSize: '1.5vw' }}>操作</Col>
                </Row>
                <div style={{ height: '40vw', overflowY: 'auto', }}>
                    {walletList.map((wallet, index) => (
                        <Row key={index} style={{ borderBottom: '1px solid #000', padding: '2px 0' }}>
                            <Col md={2} style={{ fontSize: '1.2vw' }}>
                                <Row><Col>{wallet.name ? wallet.name : shortAddress(wallet.address)}</Col></Row>
                                <Row><Col>{`第${index + 1}笔交易`}</Col></Row>
                                <Row><Col><Button style={{ fontSize: '1vw' }} onClick={() => clickModifyOrder(index)}>修改顺序</Button></Col></Row>
                            </Col>
                            <Col md={2} style={{ fontSize: '1.2vw' }}>
                                <Row><Col>{wallet.pairInfo?.leftTokenSymbol ? `symbol:${wallet.pairInfo?.leftTokenSymbol}` : ''}</Col></Row>
                                <Row><Col>{wallet.pairInfo?.leftTokenBalance ? `余额:${formatNumber(wallet.pairInfo?.leftTokenBalance)}` : ''}</Col></Row>
                            </Col>
                            <Col md={2} style={{ fontSize: '1.2vw' }}>
                                <Row><Col>{wallet.pairInfo?.rightTokenSymbol ? `symbol:${wallet.pairInfo?.rightTokenSymbol}` : ''}</Col></Row>
                                <Row><Col>{wallet.pairInfo?.rightTokenBalance ? `余额:${formatNumber(wallet.pairInfo?.rightTokenBalance)}` : ''}</Col></Row>
                            </Col>
                            <Col md={2} style={{ fontSize: '1.2vw' }}>
                                {wallet.pairInfo?.leftTokenCost && wallet.pairInfo?.rightTokenGain && <Row><Col>
                                    {`${wallet.pairInfo?.leftTokenCost} -> ${wallet.pairInfo?.rightTokenGain} 最少${wallet.pairInfo?.rightTokenGainMin}`}</Col></Row>}
                            </Col>
                            <Col md={2} style={{ fontSize: '1.2vw' }}>
                                {wallet.pairInfo?.rightTokenCost && wallet.pairInfo?.leftTokenGain && <Row><Col>
                                    {`${wallet.pairInfo?.rightTokenCost} -> ${wallet.pairInfo?.leftTokenGain} 最少${wallet.pairInfo?.leftTokenGainMin}`}</Col></Row>}
                            </Col>
                            <Col md={2} style={{ fontSize: '1.2vw' }}>
                                <Button style={{ fontSize: '1.0vw', margin: "1px 1px" }} onClick={() => clickSetConfig(index)}>设置</Button>
                                <Button variant="danger" style={{ fontSize: '1.0vw', margin: "1px 1px" }} onClick={() => clickDeleteWallet(index)}>删除</Button>
                            </Col>
                        </Row>
                    ))}
                </div>
            </Row>
            {gasPrice && <span style={{ fontSize: '1.2vw' }}>{`当前gas:${formatNumber(gasPrice)}gwei,gas倍数${gasMultiplier},预计花费gas${formatNumber(gasCost)}ETH`}</span>}
            <Row style={{ marginTop: '1.0vw', float: 'right' }}>
                <Col md={2}>
                    <Button onClick={() => execTask()} style={{ fontSize: '1.2vw', width: '9vw' }}>开始交易</Button>
                </Col>
            </Row>

            <Row style={{ marginTop: '1.0vw', marginRight: '1.0vw', float: 'right' }}>
                <Col md={4}>
                    <Button onClick={() => { clickSetGasMultiplier() }} style={{ fontSize: '1.2vw', width: '9vw' }}>gas倍数</Button>
                </Col>
            </Row>



            <ChooseWalletModal {...chooseWalletModalProp} />
            <AddWalletModal {...addWalletModalProp} />
            <SetConfigModal {...configModalProp} />
            <CustomModal ref={childRef} {...customModalProp} />


        </Container>
    )
}