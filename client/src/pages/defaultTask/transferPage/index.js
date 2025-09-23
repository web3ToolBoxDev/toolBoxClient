import { Container, Button, Row, Col, Spinner, Modal, Form } from 'react-bootstrap';
import { useState, useEffect } from 'react';
import Web3Manager from '../../../utils/web3';

import AddWalletModal from '../components/addWalletModal';
import ChooseWalletModal from '../components/chooseWalletModal';
import { shortAddress,formatNumber,log } from '../../../utils';





let emptyInfo = {
    from: new Set(),
    to: new Set()
}
let routeList = [];


const web3Manager = Web3Manager.getInstance();


function SetConfigModal({ show, onHide, config, confirm , index }) {
    const [networkList, setNetworkList] = useState([]);
    const [networkValue, setNetworkValue] = useState('');
    const [rpcShow, setRpcShow] = useState(false);
    const [rpc, setRpc] = useState('');
    const [transferType, setTransferType] = useState('');
    const [erc20Address, setErc20] = useState('');
    const [transferAmountType, setTransferAmountType] = useState('');
    const [transferAmount, setTransferAmount] = useState('');
    const [transferPercent, setTransferPercent] = useState('');
    const setNetwork = (value) => {
        if (value === 'setNetwork') {
            setRpcShow(true);
        } else {
            setRpcShow(false);
        }
        setNetworkValue(value);
    }
    const chooseTransferType=(value)=>{
        setTransferType(value);
    }
    const saveConfig = () => {
        if(!networkValue){
            alert('请选择网络');
            return;
        }
        if(!rpc && networkValue === 'setNetwork'){
            alert('请输入rpc');
            return;
        }
        if(!transferType){
            alert('请选择转账类型');
            return;
        }
        
        if(transferType === 'erc20' && !web3Manager.checkAddress(erc20Address)){
            alert('erc20地址错误');
            return;
        }
        if(!transferAmountType){
            alert('请选择转账数量类型');
            return;
        }
        console.log('transferPercent:',transferPercent)
        if(transferAmountType === 'percent'){
            
            let percent = Number(transferPercent);
            
            if(percent <= 0 || percent > 100){
                alert('百分比错误');
                return;
            }
        }
        if(transferAmountType === 'amount'){
            let amount = Number(transferAmount);
            if(amount <= 0){
                alert('数量错误');
                return;
            }
        }
        
        confirm({
            network: networkValue,
            rpc,
            transferType,
            erc20Address,
            transferAmountType,
            transferAmount,
            transferPercent
        },index);
    
    }

    useEffect(() => {
        setNetworkList(web3Manager.getNetworkList());
        if(config){
            config.network&&setNetworkValue(config.network);
            config.rpc&&setRpc(config.rpc);
            config.transferType&&setTransferType(config.transferType);
            config.erc20Address&&setErc20(config.erc20Address);
            config.transferAmountType&&setTransferAmountType(config.transferAmountType);
            config.transferAmount&&setTransferAmount(config.transferAmount);
            config.transferPercent&&setTransferPercent(config.transferPercent);

        }
    },[config])
    return (
        <Modal show={show} onHide={onHide} centered>
                <Modal.Header closeButton>
                    <Modal.Title>{index===-1?'全局配置':`配置第${index+1}个转账`}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Row>
                        <Col>请选择网络</Col>
                        <Col>
                            <Form.Select value={networkValue} onChange={(e) => setNetwork(e.target.value)}>
                                <option value="" disabled>选择网络</option>
                                {networkList.map((network, index) => (
                                    <option key={index} value={network}>{network}</option>
                                ))}
                                <option value={"setNetwork"}>自定义网络</option>
                            </Form.Select>
                        </Col>
                    </Row>
                    {rpcShow&&<Row>
                        <Col>自定义网络</Col>
                        <Col>
                            <Form.Control type="text" value={rpc} placeholder="请输入RPC" 
                                onChange={(e)=>setRpc(e.target.value)}/>
                        </Col>
                    </Row>}
                    
                    <Row>
                        <Col>请选择转账类型</Col>
                        <Col>
                            <Form.Select value={transferType} onChange={(e) => { chooseTransferType(e.target.value) }}>
                                <option value="" disabled>选择转账类型</option>
                                <option value="native">原生token</option>
                                <option value="erc20">erc20</option>
                            </Form.Select>
                        </Col>
                    </Row>
                    {
                        transferType === 'erc20' && <Row>
                            <Col>请输入erc20地址</Col>
                            <Col>
                                <Form.Control type="text" value={erc20Address} placeholder="erc20地址"
                                    onChange={(e) => { setErc20(e.target.value) }} />
                            </Col>
                        </Row>
                    }
                    <Row>
                        <Col>转账数量类型</Col>
                        <Col>
                            <Form.Select value={transferAmountType} onChange={(e)=>setTransferAmountType(e.target.value)}>
                                <option value="" disabled>选择转账数量类型</option>
                                <option value="percent">百分比转账</option>
                                <option value="amount">数量转账</option>
                            </Form.Select>
                        </Col>
                    </Row>
                    {transferAmountType!==""&&<Row>
                        {transferAmountType === "percent"?
                            <>
                                <Col>转账百分比</Col>
                                <Col>
                                    <Form.Control type="text" value={transferPercent} placeholder="转账百分比"
                                        onChange={(e) => { setTransferPercent(e.target.value) }} />
                                </Col>
                            </>:
                            <>
                                <Col>转账数量</Col>
                                <Col>
                                    <Form.Control type="text" value={transferAmount} placeholder="转账数量"
                                        onChange={(e) => { setTransferAmount(e.target.value) }} />
                                </Col>
                            </>
                        }
                    </Row>}

                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={() => saveConfig()}>应用</Button>
                </Modal.Footer>
            </Modal>
    )

}

export default function TransferPage({ task, returnMainPage }) {

    const [chooseWalletModalProp, setChooseWalletModalProp] = useState({ show: false });

    const [routeDisplay, setRouteDisplay] = useState([]);

    const displayName = (info) => {
        // console.log('info:', info);
        if (!info) {
            return '未配置';
        }
        if (info.name) {
            return info.name;
        } else if (info.address) {
            return shortAddress(info.address);
        } else {
            return '未配置';
        }
    }


    const chooseWallet = (wallets, confirmInfo) => {
        let previousLength = routeList.length;

        let {mode,index} = confirmInfo;
        console.log('mode:', mode);
        console.log('wallets:', wallets);
    
        if (mode === 'from') {
            if (emptyInfo.from.size === 0) {
                for (let i = 0; i < wallets.length; i++) {
                    routeList.push({ from: wallets[i], to: null, config:null });
                    emptyInfo.to.add(previousLength + i);
                }
            } else {
                if(index === -1){
                    let walletIndex = 0;
                    while (emptyInfo.from.size > 0 && walletIndex < wallets.length) {
                        let index = emptyInfo.from.values().next().value;
                        routeList[index].from = wallets[walletIndex];
                        emptyInfo.from.delete(index);
                        walletIndex++;
                    }
                    for (let i = walletIndex; i < wallets.length; i++) {
                        routeList.push({ from: wallets[i], to: null, config:null });
                        emptyInfo.to.add(previousLength + i - 1);
                    }
                }else{
                    routeList[index].from = wallets[0];
                    emptyInfo.from.delete(index);
                }
            }
            console.log('emptyInfo:', emptyInfo);
        } else {
            if (emptyInfo.to.size === 0) {
                for (let i = 0; i < wallets.length; i++) {
                    routeList.push({ from: null, to: wallets[i], config:null });
                    emptyInfo.from.add(previousLength + i);
                }
            } else {
                
                if(index === -1){
                    let walletIndex = 0;
                    while (emptyInfo.to.size > 0 && walletIndex < wallets.length) {
                        let index = emptyInfo.to.values().next().value;
                        
                        routeList[index].to = wallets[walletIndex];
                        emptyInfo.to.delete(index);
                        walletIndex++;
                    }
                    console.log('walletIndex:', walletIndex);
                    for (let i = walletIndex; i < wallets.length; i++) {
                        routeList.push({ from: null, to: wallets[i], config:null });
                        console.log('previousLength:', previousLength);
                        emptyInfo.from.add(previousLength + i - 1);
                    }
                    console.log('emptyInfo:', emptyInfo);
                }else{
                    routeList[index].to = wallets[0];
                    emptyInfo.to.delete(index);
                }
            }
        }
        console.log('routeList:', routeList);
    
        setChooseWalletModalProp({ show: false });
        setRouteDisplay(routeList);
    }
    const clickChooseWallet = (mode,index = -1) => {
        setChooseWalletModalProp({
            show: true,
            onHide: () => {
                setChooseWalletModalProp({ show: false });
            },
            confirm: chooseWallet,
            confirmInfo:{mode,index}
        });
    }
    const [addWalletModalProp, setAddWalletModalProp] = useState({ show: false });
    const addWallet = (keyOrAddress, confirmInfo) => {
        console.log('confirmInfo:', confirmInfo);
        let {mode,index} = confirmInfo;
        console.log('keyOrAddress:', keyOrAddress, 'mode:', mode);
        if (mode === 'from') {
            try {
                const address = web3Manager.getAddressFromPrivateKey(keyOrAddress);
                const wallet = { address, privateKey: keyOrAddress };
                if(index === -1){
                    if (emptyInfo.from.size === 0) {
                        routeList.push({ from: wallet, to: null, config:null });
                        emptyInfo.to.add(routeList.length - 1);
                    } else {
                        let index = emptyInfo.from.values().next().value;
                        routeList[index].from = wallet;
                        emptyInfo.from.delete(index);
                    }
                }else{
                    routeList[index].from = wallet;
                    emptyInfo.from.delete(index);
                }
            } catch (e) {
                alert('私钥错误');
            }
        } else {
            const isAddress = web3Manager.checkAddress(keyOrAddress);
            if (isAddress) {
                const wallet = { address: keyOrAddress };
                if(index === -1){
                    if (emptyInfo.to.size === 0) {
                        routeList.push({ from: null, to: wallet, config:null });
                        emptyInfo.from.add(routeList.length - 1);
                    } else {
                        let index = emptyInfo.to.values().next().value;
                        routeList[index].to = wallet;
                        emptyInfo.to.delete(index);
                    }
                }else{
                    routeList[index].to = wallet;
                    emptyInfo.to.delete(index);
                }
            } else {
                alert('地址错误');
            }

        }
        console.log('routeList:', routeList);
        setRouteDisplay(routeList);
        setAddWalletModalProp({ show: false });
    }
    const clickAddWallet = (mode,index=-1) => {
        console.log('clickAddWallet:', mode);
        setAddWalletModalProp({
            show: true,
            onHide: () => {
                setAddWalletModalProp({ show: false });
            },
            mode: mode === 'from' ? 'key' : 'address',
            confirm: addWallet,
            confirmInfo:{mode,index}
        });
    }
    const deleteWallet = (mode, index) => {
        const newRouteList = [...routeList];
        if (mode === 'from') {
            if (newRouteList[index].from) {
                if (newRouteList[index].to) {
                    newRouteList[index].from = null;
                    emptyInfo.from.add(index);
                }else{
                     //删除这一行
                    newRouteList.splice(index,1);
                    if (newRouteList.length === 0) {
                        emptyInfo.from = new Set();
                        emptyInfo.to = new Set();
                    }else{
                        // 更新 emptyInfo 中的索引
                        emptyInfo.to = new Set(Array.from(emptyInfo.to).map(i => (i > index ? i - 1 : i)));
                        emptyInfo.from = new Set(Array.from(emptyInfo.from).map(i => (i > index ? i - 1 : i)));
                    }
                }
            }
        } else {
            if (newRouteList[index].to) {
                if (newRouteList[index].from) {
                    newRouteList[index].to = null;
                    emptyInfo.to.add(index);
                }else{
                    //删除这一行
                    newRouteList.splice(index,1);
                    if(newRouteList.length === 0){
                        emptyInfo.from = new Set();
                        emptyInfo.to = new Set()
                    }else{
                        // 更新 emptyInfo 中的索引
                        emptyInfo.to = new Set(Array.from(emptyInfo.to).map(i => (i > index ? i - 1 : i)));
                        emptyInfo.from = new Set(Array.from(emptyInfo.from).map(i => (i > index ? i - 1 : i)));
                    }
                }
            }
            
        }
        console.log('emptyInfo:', emptyInfo);
        console.log('newRouteList:', newRouteList);
        routeList = newRouteList;
        setRouteDisplay([...routeList]);
    }
    const [setConfigModalProp, setSetConfigModalProp] = useState({ show: false });

    

    
    let defaultConfig = {}
    const processConfig =async (wallet,config) => {
        const newConfig = {...config};
        let balance = await web3Manager.getBalance(wallet.address,newConfig.rpc);
        console.log('balance:',balance);
        let erc20Balance;
        
        if(newConfig.transferType === 'erc20'){
            erc20Balance = await web3Manager.getErc20Balance(wallet.address,newConfig.erc20Address,newConfig.rpc);
            console.log('erc20Balance:',erc20Balance);
            if(newConfig.transferAmountType === 'percent'){
                newConfig.transferAmount = formatNumber(erc20Balance*newConfig.transferPercent/100);
            }
            let transferFee = await web3Manager.estimateErc20TransferGas(wallet.privateKey,newConfig.erc20Address,wallet.address,newConfig.transferAmount,newConfig.rpc);
            if(newConfig.transferAmount > erc20Balance || balance < transferFee){
                newConfig.message = `余额不足，${newConfig.symbol}余额:${formatNumber(erc20Balance)},原生token余额:${formatNumber(balance)}`
            }else{
                newConfig.message = `转账${newConfig.symbol}数量:${formatNumber(newConfig.transferAmount)}`
                newConfig.ready = true;
            }
            
        }else{
            console.log('newConfig',newConfig)
            if(newConfig.transferAmountType === 'percent'){
                
                newConfig.transferAmount = formatNumber(balance*newConfig.transferPercent/100);
            }
            console.log('newConfig.transferAmount:',newConfig.transferAmount)
            let transferFee = await web3Manager.estimateTransferGas(wallet.address,newConfig.transferAmount.toString(),newConfig.rpc);
            console.log('transferFee:',transferFee)
            if(newConfig.transferAmount + transferFee > balance){
                newConfig.message = `余额不足，原生token余额:${formatNumber(balance)}`
            }else{
                newConfig.message = `转账原生token数量:${formatNumber(newConfig.transferAmount)}`;
                newConfig.ready = true;
            } 
        }
        newConfig.balance = balance;
        newConfig.erc20Balance = erc20Balance;
        return newConfig;
    }
    const setTransferConfig = async(config,index) => {
        setSetConfigModalProp({ show: false });
        const newRouteList = [...routeList];
        if(config.network !== 'setNetwork'){
            let rpc = await web3Manager.getRpc(config.network);
            if (rpc) {
                config.rpc = rpc;
            }else{
                alert('当前内置网络rpc连接失败，请选择自定义网络，自行添加rpc');
                return;
            }
        }else{
            if(!(await web3Manager.checkRpc(config.rpc))){
                alert('当前自定义网络连接失败，请检查rpc');
                return;
            }
        }
        if(config.transferType === 'erc20'){ 
            let {symbol,decimals} = (await web3Manager.getErc20Info(config.erc20Address,config.rpc));
            config.symbol = symbol;
            config.decimals = decimals;
        }
        if(index === -1){
            defaultConfig = config;
            setLoadingShow(true);
            setLoadingText('参数加载中');
            for(let i = 0;i<newRouteList.length;i++){
                if(newRouteList[i].from){
                    config = await processConfig(newRouteList[i].from,config);
                    newRouteList[i].config = config;
                }
            }
            setLoadingShow(false);
        }else{
            if(newRouteList[index].from){
                setLoadingShow(true);
                setLoadingText('参数加载中');
                config = await processConfig(newRouteList[index].from,config);
                newRouteList[index].config = config;
                setLoadingShow(false);
            }else{
                alert('请先配置from');
                return;
            }
        }
        routeList = newRouteList;
        setRouteDisplay([...routeList]);
    }
    const [loadingShow, setLoadingShow] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const clickSetConfig = (index = -1) => {
        setSetConfigModalProp({
            show: true,
            onHide: () => {
                setSetConfigModalProp({ show: false });
            },
            config: index===-1?defaultConfig:routeList[index].config,
            confirm: setTransferConfig,
            index
        });
    }

    const fillFrom = () => {
        const newRouteList = [...routeList];
        //以列表中最后一个from为准
        let lastFrom = null;
        for (let i = newRouteList.length - 1; i >= 0; i--) {
            if (newRouteList[i].from) {
                lastFrom = newRouteList[i].from;
                break;
            }
        }

        if (!lastFrom) {
            alert('至少配置一个from');
            return;
        }
        console.log('emptyInfo:', emptyInfo);  
        while (emptyInfo.from.size > 0) {
            let index = emptyInfo.from.values().next().value;
            console.log('index:', index);
            newRouteList[index].from = lastFrom;
            emptyInfo.from.delete(index);
        }
        routeList = newRouteList;
        setRouteDisplay([...routeList]);
    }
    const fillTo = () => {
        const newRouteList = [...routeList];
        //以列表中最后一个to为准
        let lastTo = null;
        for (let i = newRouteList.length - 1; i >= 0; i--) {
            if (newRouteList[i].to) {
                lastTo = newRouteList[i].to;
                break;
            }
        }
        if (!lastTo) {
            alert('至少配置一个to');
            return;
        }

        while (emptyInfo.to.size > 0) {
            let index = emptyInfo.to.values().next().value;
            newRouteList[index].to = lastTo;
            emptyInfo.to.delete(index);
        }
        routeList = newRouteList;
        setRouteDisplay([...routeList]);
    }
    const clear = () => {
        routeList = [];
        setRouteDisplay([]);
        emptyInfo = {
            from: new Set(),
            to: new Set()
        }
    
    }
    
    useEffect(() => {
        clear();
    }, [task])
    
    const execTask = async () => {
        setLoadingShow(true);
        setLoadingText('任务执行中');
        log('开始执行转账任务');
        for (let i = 0; i < routeList.length; i++) {
            const route = routeList[i];
            if (!route.from || !route.to || !route.config || !route.config.ready) {
                log(`第${i + 1}个任务未配置`);
                continue;
            }
            
            let result = null;
            if(route.config.transferType === 'erc20'){
                result = await web3Manager.transferErc20(route.from.privateKey,route.config.erc20Address,route.to.address,route.config.transferAmount,route.config.rpc);
            }else{
                result = await web3Manager.transfer(route.from.privateKey,route.to.address,route.config.transferAmount,route.config.rpc);
            }
            log(`from:${route.from.address} to:${route.to.address} config:${route.config.message} 交易hash:${result}`);
        }
        setLoadingShow(false);
    }

    return (
        <Container>
            <Row>
                <Col md={6}><h3>转账任务</h3></Col>
                <Col md={6}>
                    <div className='d-flex justify-content-end'>
                        <Button variant="primary" onClick={returnMainPage}>返回</Button>
                    </div>
                </Col>
            </Row>
            <Row style={{marginTop:'1.0vw'}}>
                <Col md={2}>
                    <Button style={{ fontSize: '1.2vw', width: '9vw' }} onClick={() => clickChooseWallet('from')}>选择from</Button>
                </Col>
                <Col md={2}>
                    <Button style={{ fontSize: '1.2vw', width: '9vw' }} onClick={() => clickAddWallet('from')}>添加from</Button>
                </Col>
                <Col md={2}>
                    <Button style={{ fontSize: '1.2vw', width: '9vw' }} onClick={() => clickChooseWallet('to')}>选择to</Button>
                </Col>
                <Col md={2}>
                    <Button style={{ fontSize: '1.2vw', width: '9vw' }} onClick={() => clickAddWallet('to')}>添加to</Button>
                </Col>
                <Col md={2}>
                    <Button style={{ fontSize: '1.2vw', width: '9vw' }} onClick={()=>clickSetConfig()}>转账参数</Button>
                </Col>
                <Col md={2}>
                    <Button style={{ fontSize: '1.2vw', width: '9vw' }} onClick={() => clear()}>清空</Button>
                </Col>
            </Row>
            {loadingShow&&<Row>
                <Col className='d-flex justify-content-end' style={{marginTop:'10px'}}>
                    <span style={{fontSize:'1.2vw'}}>{loadingText}</span>

                    <Spinner animation="border" variant="success" size='sm'/>
                </Col>
            </Row>}
            <div style={{ height: '40vw', overflowY: 'auto', border: '2px solid #000', marginTop: '20px' }}>
                <Row style={{borderBottom: '1px solid #000', padding: '10px 0'}}>
                    <Col md={4} style={{ fontSize: '1.5vw' }}>from</Col>
                    <Col md={4} style={{ fontSize: '1.5vw' }}>to</Col>
                    <Col md={4} style={{ fontSize: '1.5vw' }}>转账参数</Col>
                </Row>
                    {routeDisplay.map((route, index) => (
                        <Row key={index} style={{ borderBottom: '1px solid #ccc'  }}>
                            {route.from ? 
                                <>
                                    <Col md={2} style={{ fontSize: '1.0vw',textAlign:'center' }}>{displayName(route.from)}</Col> 
                                    <Col md={2}>
                                        <Button style={{ fontSize: '1.0vw', width: '7vw'  }} onClick={() => deleteWallet('from',index)}>删除</Button>
                                    </Col>
                                </>:
                                <>
                                    <Col md={2}>
                                        <Button style={{ fontSize: '1.0vw', width: '7vw'  }} onClick={() => clickChooseWallet('from',index)}>选择</Button>
                                    </Col>
                                    <Col md={2}>
                                        <Button style={{ fontSize: '1.0vw', width: '7vw'  }} onClick={() => clickAddWallet('from',index)}>添加</Button>
                                    </Col>
                                </>

                            }
                            {route.to ? 
                                <>
                                    <Col md={2} style={{ fontSize: '1.0vw',textAlign:'center' }}>{displayName(route.to)}</Col> 
                                    <Col md={2}>
                                        <Button style={{ fontSize: '1.0vw', width: '7vw'  }} onClick={() => deleteWallet('to',index)}>删除</Button>
                                    </Col>
                                </>:
                                <>
                                    <Col md={2}>
                                        <Button style={{ fontSize: '1.0vw', width: '7vw'  }} onClick={() => clickChooseWallet('to',index)}>选择</Button>
                                    </Col>
                                    <Col md={2}>
                                        <Button style={{ fontSize: '1.0vw', width: '7vw'  }} onClick={() => clickAddWallet('to',index)}>添加</Button>
                                    </Col>
                                </>
                            }
                            <Col md={2} style={{ fontSize: '1.0vw'}}>{(route.config&&route.config.message)?route.config.message:'配置未完成'}</Col>
                            <Col md={2}>
                                <Button style={{ fontSize: '1.0vw', width: '7vw'  }} onClick={()=>clickSetConfig(index)}>配置</Button>
                            </Col>

                        </Row>
                    ))}
            </div>
            <Row style={{marginTop: '2px'}}>
                <Col className='d-flex justify-content-end' md={4}>
                    <span style={{ fontSize: '1.5vw',marginTop:'0.5vw'}}>一对多： </span>
                    <Button style={{ fontSize: '1.2vw', width: '9vw' }} onClick={fillFrom}>填充from</Button>
                </Col>
                <Col className='d-flex justify-content-end' md={4}>
                    <span style={{ fontSize: '1.5vw',marginTop:'0.5vw'}}>多对一： </span>
                    <Button style={{ fontSize: '1.2vw', width: '9vw' }} onClick={fillTo}>填充to</Button>
                </Col>
                <Col className='d-flex justify-content-end' md={4}>
                    <Button style={{ fontSize: '1.2vw', width: '9vw' }} onClick={execTask}>执行任务</Button>
                </Col>
            </Row>
            <ChooseWalletModal {...chooseWalletModalProp} />
            <AddWalletModal {...addWalletModalProp} />
            <SetConfigModal {...setConfigModalProp} />


        </Container>
    )
}
