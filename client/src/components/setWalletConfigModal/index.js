import APIManager from "../../utils/api";
import { Modal, Button, Row, Col } from "react-bootstrap";
import { useState, useEffect,useRef } from "react";
import CustomModal from "../customModal";

const SetWalletConfigModal = ({ taskName,configSchema,show, onHide, confirm }) => {
    const apiManager = APIManager.getInstance();
    const [wallets, setWallets] = useState([]);
    const [modalProp, setModalProp] = useState({show:false});
    const [config, setConfig] = useState({});
    const childRef = useRef();
    useEffect(() => {
        apiManager.getAllWallets().then((res) => {
            const newWallets = res.map((wallet) => {
                wallet.selected = false;
                return wallet;
            });
            const sortedWallets = newWallets.sort((a, b) => a.name.localeCompare(b.name));
            setWallets(sortedWallets);
        });
        apiManager.getConfigInfo(taskName).then((res) => {
            if(res.success){
                console.log('res:',res)
                setConfig(res.config);
            }
        })
    }, [apiManager,taskName]);
    const setConfigProp = async(who) => {
        let record = {}
        try{
            record = {...config[who]};
        }catch(e){
            console.log('error:',e)
        }
        console.log('record:',record)
        childRef.current.setValueObj(record);
        let rowList = Object.keys(configSchema).map((key) => {
            if (configSchema[key].type === 'input') {
                return [
                    { type: 'label', colWidth: 4, text: configSchema[key].text||key, style: { fontSize:'1.5vw',textAlign: 'right', paddingRight: '10px' } },
                    { type: 'input', colWidth: 6, key: key,value:record[key],placeholder:`请输入${key}`,style:{fontSize:'1.5vw'}}
                ]
            }else if (configSchema[key].type === 'select') {
                return [
                    { type: 'label', colWidth: 4, text: key, style: { textAlign: 'right', paddingRight: '10px' } },
                    { type: 'select', colWidth: 6, key: key, options: configSchema[key].options,defaultValue:record[key]||configSchema[key].defaultValue}
                ]
            }
            return [];
        });
        rowList.push([
            { type: 'button', colWidth: 12, text: '确认', style: { textAlign: 'right' },
             click: () => {
                setConfig({...config,[who]:record})
                setModalProp({show:false});
            }
        }]);
        let title = '修改配置';
        if(who === 'default'){
            title = '修改通用配置'
        }else{
            let shortAddress = who.substring(0, 6) + '...' + who.substring(who.length - 4, who.length);
            title = `修改${shortAddress}的配置`
        }
        setModalProp({
            show: true,
            title,
            handleClose: () => {
                setModalProp({show:false});
            },
            handleData: (key, value) => {
                record[key] = value;
            },
            rowList
        });
    }
    const handleConfirm = () => {
        confirm(config);
    }
    const emptyConfig = () => {
        let emptyConfig = {default:config.default}
        apiManager.setConfigInfo(taskName, emptyConfig).then((res) => {
            if (res) {
              alert('所有配置已清空');
              setConfig(emptyConfig);
            }
          })
    }

    return (
        <>
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton>
                <Modal.Title>配置任务
                    
                </Modal.Title>
                <p style={{fontSize:'0.5vm',marginTop: '20px',margin:'2px'}}>未配置钱包将采用通用配置</p>
            </Modal.Header>
            <Modal.Body style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                <Row>
                    <Col md={6} >
                        <Button style={{ fontSize: '1.0vw', margin: '1px' }} onClick={()=>setConfigProp('default')}>修改通用配置</Button>
                    </Col>
                    <Col md={6}>
                        <Button style={{ fontSize: '1.0vw', margin: '1px' }} onClick={emptyConfig}>清除钱包配置</Button>
                    </Col>
                </Row>
                <Row>
                    <Col md={2} style={{ fontSize: '1.0vw' }}>
                        钱包名称
                    </Col>
                    <Col md={6} style={{ fontSize: '1.0vw' }}>
                        钱包地址
                    </Col>

                </Row>
                {wallets.map((wallet, index) => (
                    <Row key={index}>
                        <Col md={2} style={{ fontSize: '1.0vw', textAlign: 'left', display: 'flex', alignItems: 'center' }}>
                            {wallet.name}
                        </Col>
                        <Col md={6} style={{ fontSize: '1.0vw', textAlign: 'left', display: 'flex', alignItems: 'center' }}>
                            {wallet.address}
                        </Col>
                        <Col md={4} style={{ fontSize: '1.0vw', textAlign: 'left', display: 'flex', alignItems: 'center' }}>
                            <Button style={{ fontSize: '1.0vw', margin: '1px' }} onClick={()=>setConfigProp(wallet.address)}>修改配置</Button>
                        </Col>
                    </Row>
                ))}
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={handleConfirm}>确认</Button>
            </Modal.Footer>
        </Modal>
        <CustomModal ref={childRef} {...modalProp} />
        </>
    );
}
export default SetWalletConfigModal;