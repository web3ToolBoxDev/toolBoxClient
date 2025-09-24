import React,{useState,useEffect,forwardRef,useImperativeHandle} from 'react';
import { Modal, Button, Row, Col, Form,ProgressBar } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import './index.scss';

const CustomModal = forwardRef(({ show, handleClose, title, rowList },ref)=> {
    const [valueObj,setValueObj] = useState({});
    const { t } = useTranslation();

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
    // 多选添加：将指定选项加入已选
    const multipleAdd = (itemKey, optionValue) => {
      const selected = valueObj[itemKey] || [];
      const newSelected = Array.from(new Set([...selected, optionValue]));
      setValueObj({ ...valueObj, [itemKey]: newSelected });
    };
    // 多选移除：将指定选项从已选中移除
    const multipleMinus = (itemKey, optionValue) => {
      const selected = valueObj[itemKey] || [];
      const newSelected = selected.filter(v => v !== optionValue);
      setValueObj({ ...valueObj, [itemKey]: newSelected });
    };
    // 检查选项是否已选中（使用Set优化时间复杂度）
    const isOptionSelected = (itemKey, optionValue) => {
      const selected = valueObj[itemKey] || [];
      const selectedSet = new Set(selected);
      return selectedSet.has(optionValue);
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
                                      {/* 选项列表，整个选项可点击 */}
                                      <div className="multiple-select-container" style={item.style}>
                                        {item.options.map((option, index) => {
                                          const isSelected = isOptionSelected(item.key, option.value);
                                          return (
                                            <div 
                                              key={index} 
                                              className={`multiple-select-option ${isSelected ? 'selected' : ''}`}
                                              onClick={() => isSelected 
                                                ? multipleMinus(item.key, option.value) 
                                                : multipleAdd(item.key, option.value)
                                              }
                                            >
                                              <span className="option-text">{option.text}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {/* 已选项显示 */}
                                      {(() => {
                                        if (!Array.isArray(valueObj[item.key]) || valueObj[item.key].length === 0) {
                                          return null;
                                        }
                                        
                                        const selectedTexts = valueObj[item.key].map(val => {
                                          const opt = item.options.find(o => o.value === val);
                                          return opt ? opt.text : val;
                                        });
                                        
                                        const fullText = selectedTexts.join(', ');
                                        const maxLength = 60; // 设置最大显示长度
                                        const displayText = fullText.length <= maxLength ? fullText : fullText.slice(0, maxLength) + '...';
                                        
                                        return (
                                          <div 
                                            className="selected-items-display"
                                            title={fullText}
                                          >
                                            {t('customModal.selected')} ({valueObj[item.key].length}): {displayText}
                                          </div>
                                        );
                                      })()}
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
