import React, { useEffect, useState } from 'react';
import { Modal, Button, Row, Col } from 'react-bootstrap';
import APIManager from '../../../utils/api';
import { shortAddress } from '../../../utils';
const apiManager = APIManager.getInstance();


export default function ChooseWalletModal({ show, onHide, confirm,confirmInfo }) {
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
    const chooseWallet = () => {
        const selectedWallets = wallets.filter(wallet => wallet.selected);
        confirm(selectedWallets, confirmInfo);
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
    return (
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton>选择钱包</Modal.Header>
            <Modal.Body style={{ height: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                <Row>
                    <Col md={1} style={{ fontSize: '1.2vw' }}>
                        <input type='checkbox' checked={selectAll} onChange={toggleSelectAll} />全选
                    </Col>
                    <Col md={4} style={{ fontSize: '1.2vw' }}>
                        钱包名称
                    </Col>
                    <Col md={7} style={{ fontSize: '1.2vw' }}>
                        钱包地址
                    </Col>
                </Row>
                {wallets.map((wallet, index) => (
                    <Row key={index}>
                        <Col md={1}>
                            <input type='checkbox' checked={wallet.selected} onChange={() => handleSelect(index)} />
                        </Col>
                        <Col md={4}>
                            {wallet.name}
                        </Col>
                        <Col md={7}>
                            {shortAddress(wallet.address)}
                        </Col>
                    </Row>
                ))}
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={chooseWallet}>确认</Button>
            </Modal.Footer>
        </Modal>
    )
}