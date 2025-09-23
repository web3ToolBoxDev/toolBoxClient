import React,{useState,useEffect,forwardRef,useImperativeHandle} from 'react';
import { Modal, Button, Row, Col, Form,ProgressBar } from 'react-bootstrap';
import './index.scss';

const CustomModal = forwardRef(({ show, handleClose, title, rowList },ref)=> {
    const [valueObj,setValueObj] = useState({});
    // 新增：多选select当前高亮项
    const [multiSelectActive, setMultiSelectActive] = useState({});

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
    // 多选添加：将select当前高亮项加入已选
    const multipleAdd = (item) => {
      const selected = valueObj[item.key] || [];
      const actives = multiSelectActive[item.key] || [];
      const merged = Array.from(new Set([...selected, ...actives]));
      setValueObj({ ...valueObj, [item.key]: merged });
    };
    // 多选移除：将select当前高亮项从已选中移除
    const multipleMinus = (item) => {
      const selected = valueObj[item.key] || [];
      const actives = multiSelectActive[item.key] || [];
      setValueObj({ ...valueObj, [item.key]: selected.filter(v => !actives.includes(v)) });
    };

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
            return valueObj[key];
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
                            <Col key={colIndex} md={item.colWidth} style={{...item.style, ...(item.type === 'button' ? { display: 'flex', justifyContent: 'flex-end', alignItems: 'center' } : {}) }}>
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
                                  item.multiple ? (
                                    <>
                                      <select
                                        multiple
                                        className="form-select"
                                        value={multiSelectActive[item.key] || []}
                                        onChange={e => {
                                          const actives = Array.from(e.target.selectedOptions).map(opt => opt.value);
                                          setMultiSelectActive(prev => ({ ...prev, [item.key]: actives }));
                                        }}
                                        style={item.style}
                                      >
                                        {item.options.map((option, index) => (
                                          <option key={index} value={option.value}>
                                            {option.text}
                                          </option>
                                        ))}
                                      </select>
                                      {/* 已选项显示与按钮分区 */}
                                      <div style={{ display: 'flex', alignItems: 'center', marginTop: 4, minHeight: 24 }}>
                                        <div style={{ fontSize: 13, color: '#888', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {Array.isArray(valueObj[item.key]) && valueObj[item.key].length > 0
                                            ? valueObj[item.key].map(val => {
                                                const opt = item.options.find(o => o.value === val);
                                                return opt ? opt.text : val;
                                              }).join(', ')
                                            : null}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                          <Button size="sm" variant="outline-secondary" className="p-0 px-2" 
                                            style={{ fontSize: 14, minWidth: 26, height: 26, borderRadius: 4, marginLeft: 8 }}
                                            onClick={() => multipleAdd(item)}>+</Button>
                                          <Button size="sm" variant="outline-secondary" className="p-0 px-2"
                                            style={{ fontSize: 14, minWidth: 26, height: 26, borderRadius: 4 }}
                                            onClick={() => multipleMinus(item)}>-</Button>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <Form.Select
                                      value={valueObj[item.key] || item.defaultValue || ''}
                                      onChange={e => setValueObj({ ...valueObj, [item.key]: e.target.value })}
                                      style={item.style}
                                    >
                                      {item.options.map((option, index) => (
                                        <option key={index} value={option.value}>{option.text}</option>
                                      ))}
                                    </Form.Select>
                                  )
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
