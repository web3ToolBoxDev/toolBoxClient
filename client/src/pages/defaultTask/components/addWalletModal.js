import React, { useState } from 'react';
import { Modal, Button, Row, Col, Form } from 'react-bootstrap';
export default function AddWalletModal({ show, onHide, mode, confirm,confirmInfo }) {
    const [keyOrAddress, setKeyOrAddress] = useState('');
    const addWallet = () => {
        confirm(keyOrAddress, confirmInfo);
    }

    return (
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton>添加钱包</Modal.Header>
            <Modal.Body style={{ maxHeight: 'calc(7vwh - 200px)', overflowY: 'auto' }}>
                <Row>
                    <Col>{mode === 'key' ? '请输入私钥' : '请输入地址'}</Col>
                    <Col>
                        <Form.Control value={keyOrAddress} type="text" placeholder={mode === 'key' ? '请输入私钥' : '请输入地址'} onChange={(e) => setKeyOrAddress(e.target.value)} />
                    </Col>
                </Row>
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={() => addWallet()}>确认</Button>
            </Modal.Footer>
        </Modal>
    )
}