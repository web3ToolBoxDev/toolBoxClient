import APIManager from "../../utils/api";
import { Modal, Button, Row, Col } from "react-bootstrap";
import { useState, useEffect } from "react";
const ChooseWalletModal = ({ show, onHide, confirm }) => {
    const apiManager = APIManager.getInstance();
    const [wallets, setWallets] = useState([]);
    const [selectAll, setSelectAll] = useState(false);
    const toggleSelectAll = () => {
        setSelectAll(!selectAll);
        const newWallets = wallets.map((wallet) => {
            wallet.selected = !selectAll;
            return wallet;
        });
        setWallets(newWallets);
    }
    const handleSelect = (index) => {
        const newWallets = wallets.map((wallet, i) => {
            if (i === index) {
                wallet.selected = !wallet.selected;
            }
            return wallet;
        });
        setWallets(newWallets);
    }
    
    useEffect(() => {
        apiManager.getAllWallets().then((res) => {
            const newWallets = res.map((wallet) => {
                wallet.selected = false;
                return wallet;
            });
            const sortedWallets = newWallets.sort((a, b) => a.name.localeCompare(b.name));
            setWallets(sortedWallets);
        });
    }, [show]);

    return (
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton>
                <Modal.Title>选择钱包</Modal.Title>
            </Modal.Header>
            <Modal.Body style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                <Row>
                    <Col md={1} style={{ fontSize: '1.0vw' }}>
                        <input type='checkbox' checked={selectAll} onChange={toggleSelectAll} />全选
                    </Col>
                    <Col md={4} style={{ fontSize: '1.0vw' }}>
                        钱包名称
                    </Col>
                    <Col md={7} style={{ fontSize: '1.0vw' }}>
                        钱包地址
                    </Col>
                </Row>
                {wallets.map((wallet, index) => (
                    <Row key={index}>
                        <Col md={1} style={{ fontSize: '1.0vw' }}>
                            <input type='checkbox' checked={wallet.selected} onChange={() => handleSelect(index)} />
                        </Col>
                        <Col md={4} style={{ fontSize: '1.0vw' }}>
                            {wallet.name}
                        </Col>
                        <Col md={7} style={{ fontSize: '1.0vw' }}>
                            {wallet.address}
                        </Col>
                    </Row>
                ))}
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={() => { 
                    const selectedWallets = wallets.filter((wallet) => wallet.selected).map((wallet) => ({ ...wallet, useProxy: false }));
                    confirm(selectedWallets);
                }}>普通执行</Button>
                <Button onClick={() => {
                    const selectedWallets = wallets.filter((wallet) => wallet.selected).map((wallet) => ({ ...wallet, useProxy: true }));
                    confirm(selectedWallets, true);
                }}>代理执行</Button>
            </Modal.Footer>
        </Modal>
    );
}
export default ChooseWalletModal;
