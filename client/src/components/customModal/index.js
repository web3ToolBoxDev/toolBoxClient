import React,{useState,useEffect,forwardRef,useImperativeHandle} from 'react';
import { Modal, Button, Row, Col, Form } from 'react-bootstrap';
import './index.scss';
const CustomModal = forwardRef(({ show, handleClose, title, rowList, handleData },ref)=> {
    const [valueObj,setValueObj] = useState({})
    
    const onChange = (e, key) => {
        handleData(key, e.target.value);
    }
    useEffect(
        ()=>{},
        [valueObj]
    )
    useImperativeHandle(ref, () => ({
        updadteValueObj: (key,value) => {
            setValueObj({...valueObj,[key]:value});
        },
        clearValueObj: () => {
            setValueObj({});
        }
    }));

    return (
        <Modal show={show} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title>{title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {rowList && rowList.map((row, rowIndex) => (
                    <Row key={rowIndex}>
                        {row.map((item, colIndex) => (
                            <Col key={colIndex} md={item.colWidth} style={item.style}>
                                {item.type === 'label' && (
                                    <Form.Label className="text-wrap">{item.text}</Form.Label>
                                )}
                                {item.type === 'text' && (
                                    <Form.Text 
                                    className='overflow-text'
                                    data-content={valueObj[item.key] || item.text}
                                    >
                                        {valueObj[item.key] || item.text}
                                    </Form.Text>
                                        
                                    
                                )}
                                {item.type === 'input' && (
                                    <Form.Control
                                        placeholder={item.placeholder}
                                        onChange={(e) => onChange(e, item.key)}
                                    />
                                )}
                                {item.type === 'button' && (
                                    <Button className='ms-1' style ={item.style} onClick={item.click}>{item.text}</Button>
                                )}
                            </Col>
                        ))}
                    </Row>
                ))}
            </Modal.Body>
        </Modal>
    );
});

export default CustomModal;
