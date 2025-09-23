import React,{useState,useEffect,forwardRef,useImperativeHandle} from 'react';
import { Modal, Button, Row, Col, Form,ProgressBar } from 'react-bootstrap';
import './index.scss';

const CustomModal = forwardRef(({ show, handleClose, title, rowList },ref)=> {
    const [valueObj,setValueObj] = useState({});

    // 初始化 valueObj，保证 defaultValue 生效
    useEffect(() => {
        if (rowList && Array.isArray(rowList)) {
            const initialObj = {};
            rowList.forEach(row => {
                row.forEach(item => {
                    if ((item.type === 'input' || item.type === 'select') && item.defaultValue !== undefined) {
                        initialObj[item.key] = item.defaultValue;
                    }
                });
            });
            setValueObj(obj => ({ ...initialObj, ...obj }));
        }
    }, [rowList]);

    const onChange = (e, key) => {
        setValueObj({...valueObj,[key]:e.target.value});
    }
    // useEffect 依赖警告修复，移除无用 useEffect

    useImperativeHandle(ref, () => ({
        updateValueObj: (key,value) => {
            setValueObj({...valueObj,[key]:value});
        },
        clearValueObj: () => {
            setValueObj({});
        },
        setValueObj: (obj) => {
            setValueObj(obj);
        },
        getValue: (key) => {
            return valueObj[key] || '';
        }
    }));

    return (
        <Modal show={show} onHide={handleClose} className="custom-modal">
            <Modal.Header closeButton>
                <Modal.Title>{title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {rowList && rowList.map((row, rowIndex) => (
                    <Row key={rowIndex} style={{margin:'1px'}}>
                        {row.map((item, colIndex) => (
                            <Col key={colIndex} md={item.colWidth} style={{...item.style}}>
                                {item.type === 'label' && (
                                    <Form.Label className="text-wrap">{item.text}</Form.Label>
                                )}
                                {item.type === 'text' && (
                                    <Form.Text
                                        className='overflow-text'
                                        data-content={valueObj[item.key] || item.text}
                                        title={valueObj[item.key] || item.text}
                                    >
                                        {valueObj[item.key] || item.text}
                                    </Form.Text>
                                )}
                                {item.type === 'input' && (
                                    <Form.Control
                                        placeholder={item.placeholder}
                                        onChange={(e) => onChange(e, item.key)}
                                        value={valueObj[item.key] || ''}
                                        type={item.inputType}
                                    />
                                )}
                                {item.type === 'select' && (
                                    <Form.Select
                                        value={valueObj[item.key] || item.defaultValue || ''}
                                        onChange={(e) => onChange(e, item.key)}
                                        style={item.style}
                                    >
                                        {item.options.map((option, index) => (
                                            <option key={index} value={option.value}>{option.text}</option>
                                        ))}
                                    </Form.Select>
                                )}
                                {item.type === 'button' && (
                                    <Button className='ms-1' style={item.style} onClick={item.click}>{item.text}</Button>
                                )}
                                {item.type === 'progress' && (
                                    <ProgressBar now={valueObj[item.key]} />
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
