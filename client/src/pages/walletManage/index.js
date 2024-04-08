import React, { useState, useEffect,useRef } from 'react';
import { Container, Row, Col, Button, InputGroup, FormControl } from 'react-bootstrap';
import CustomModal from '../../components/customModal';
import Web3Manager from '../../utils/web3';
import APIManager from '../../utils/api';
import { eventEmitter } from '../../utils/eventEmitter';



const web3Manager = Web3Manager.getInstance();
const apiManager = APIManager.getInstance();

const WalletManage = () => {
  const [modalProp, setModalProp] = useState({ show: false });
  const [selectAll, setSelectAll] = useState(false); // State for Select All checkbox

  const childRef = useRef();
  const openEdit = (wallet) => {
    let openEditData = wallet;
    openEditData['ipType'] = wallet['ipType'] || 'http';
    childRef.current.setValueObj(openEditData);
    setModalProp(
      {
        show: true,
        handleClose: handleModalClose,
        title: '查看编辑',
        handleData: (key, value) => {
          openEditData[key] = value;
          childRef.current.updadteValueObj(key, value);
        },
        rowList: [
          [
            {
              type: 'label',
              text: '钱包名称',
              colWidth: 3,
              style: { textAlign: 'right', fontSize: '1.5vw',display: 'flex', alignItems: 'center' ,justifyContent: 'right'},
            },
            {
              type: 'input',
              key: 'name',
              placeholder: '请输入钱包名称',
              value: wallet.name,
              colWidth: 7,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'label',
              text: 'ip代理',
              colWidth: 12,
              style: { textAlign: 'right', fontSize: '1.0vw' },
            }
          ],
          [
            {
              type: 'label',
              text: 'IP代理类型',
              colWidth: 3,
              style: { fontSize: '1.5vw',display: 'flex', alignItems: 'center' ,justifyContent: 'right'},
            },
            {
              type: 'select',
              key: 'ipType',
              defaultValue: wallet.ipType || 'http',
              colWidth: 7,
              options: [
                { value: 'http', text: 'http' },
                { value: 'socks5', text: 'socks5' },
              ],
              style: { textAlign: 'left' }
            },
          ],
          [
            {
              type: 'label',
              text: 'IpHost',
              colWidth: 3,
              style: { fontSize: '1.5vw',display: 'flex', alignItems: 'center' ,justifyContent: 'right' },
            },
            {
              type: 'input',
              key: 'ipHost',
              placeholder: '请输入域名',
              value: wallet.ipHost,
              colWidth: 7,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'label',
              text: '端口',
              colWidth: 3,
              style: { fontSize: '1.5vw',display: 'flex', alignItems: 'center' ,justifyContent: 'right' },
            },
            {
              type: 'input',
              key: 'ipPort',
              placeholder: '请输入端口',
              value: wallet.ipPort,
              colWidth: 7,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'label',
              text: '用户名',
              colWidth: 3,
              style: { fontSize: '1.5vw',display: 'flex', alignItems: 'center' ,justifyContent: 'right'},
            },
            {
              type: 'input',
              key: 'ipUsername',
              placeholder: '请输入用户名',
              value: wallet.ipUsername,
              colWidth: 7,
              style: { textAlign: 'left' },
            }
          ],
          [
            {
              type: 'label',
              text: '密码',
              colWidth: 3,
              style: { fontSize: '1.5vw',display: 'flex', alignItems: 'center' ,justifyContent: 'right' },
            },
            {
              type: 'input',
              key: 'ipPassword',
              placeholder: '请输入密码',
              value: wallet.ipPassword,
              colWidth: 7,
              style: { textAlign: 'left' },
            },
            {
              type: 'button',
              text: '检查代理',
              colWidth: 2,
              style: { marginLeft: 'auto', fontSize: '1.0vw'},
              click: () => {
                console.log(openEditData)
                apiManager.checkProxy({
                  ipType: openEditData.ipType,
                  ipHost: openEditData.ipHost,
                  ipPort: openEditData.ipPort,
                  ipUsername: openEditData.ipUsername,
                  ipPassword: openEditData.ipPassword,
                }).then((res) => {
                  console.log(res);
                  if (res.success) {
                    const ipInfo = res.ipInfo;
                    alert(`代理连接成功，IP地址为${ipInfo.ip},国家为${ipInfo.country}`);
                  } else {
                    alert('代理无法连接');
                  }
                });
              },
            }
          ],
          [
            {
              type: 'label',
              text: 'token信息',
              colWidth: 12,
              style: { textAlign: 'right', fontSize: '1.0vw' },
            }
          ],
          [
            {
              type: 'label',
              text: 'twitterToken',
              colWidth: 3,
              style: { fontSize: '1.5vw',display: 'flex', alignItems: 'center' ,justifyContent: 'right' },
            },
            {
              type: 'input',
              key: 'twitterToken',
              placeholder: '请输入twitter登录token',
              value: wallet.twitterToken,
              colWidth: 7,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'label',
              text: 'discordToken',
              colWidth: 3,
              style: { fontSize: '1.5vw',display: 'flex', alignItems: 'center' ,justifyContent: 'right' },
            },
            {
              type: 'input',
              key: 'discordToken',
              placeholder: '请输入discord登录token',
              value: wallet.discordToken,
              colWidth: 7,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'label',
              text: '指纹信息',
              colWidth: 12,
              style: { textAlign: 'right', fontSize: '1.0vw' },
            }
          ],
          [
            {
              type: 'label',
              text: 'userAgent',
              colWidth: 3,
              style: { fontSize: '1.5vw',display: 'flex', alignItems: 'center' ,justifyContent: 'right' },
            },
            {
              type: 'input',
              key: 'userAgent',
              placeholder: '请输入userAgent',
              value: wallet.userAgent,
              colWidth: 7,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'label',
              text: '语言',
              colWidth: 3,
              style: { fontSize: '1.5vw',display: 'flex', alignItems: 'center' ,justifyContent: 'right' },
            },
            {
              type: 'input',
              key: 'language',
              placeholder: '请输入语言',
              value: wallet.language,
              colWidth: 7,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'label',
              text: 'webglVendor',
              colWidth: 3,
              style: { fontSize: '1.5vw',display: 'flex', alignItems: 'center' ,justifyContent: 'right' },
            },
            {
              type: 'input',
              key: 'webglVendor',
              placeholder: '请输入webglVendor',
              value: wallet.webglVendor,
              colWidth: 7,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'label',
              text: 'webglRenderer',
              colWidth: 3,
              style: { fontSize: '1.5vw',display: 'flex', alignItems: 'center' ,justifyContent: 'right' },
            },
            {
              type: 'input',
              key: 'webglRenderer',
              placeholder: wallet.webglRenderer || '请输入webglRenderer',
              colWidth: 7,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'button',
              text: '提交',
              colWidth: 3,
              style: { marginLeft: 'auto' },
              click: () => {
                console.log(openEditData);
                apiManager.updateWallet({
                  address: wallet.address,
                  name: openEditData.name || wallet.name,
                  ipType: openEditData.ipType || wallet.ipType,
                  ipHost: openEditData.ipHost || wallet.ipHost,
                  ipPort: openEditData.ipPort || wallet.ipPort,
                  ipUsername: openEditData.ipUsername || wallet.ipUsername,
                  ipPassword: openEditData.ipPassword || wallet.ipPassword,
                  twitterToken: openEditData.twitterToken || wallet.twitterToken,
                  discordToken: openEditData.discordToken || wallet.discordToken,
                  userAgent: openEditData.userAgent || wallet.userAgent,
                  language: openEditData.language || wallet.language,
                  webglVendor: openEditData.webglVendor || wallet.webglVendor,
                  webglRenderer: openEditData.webglRenderer || wallet.webglRenderer,
                  walletInitialized: wallet.walletInitialized,
                  chromeUserDataPath: wallet.chromeUserDataPath
                }).then((res) => {
                  console.log(res);
                  if (res) {
                    handleModalClose();
                    window.location.reload();
                  }
                });
              },
            },
          ],
        ],
      }
    );
  }

  const handleModalClose = () => {
    setModalProp({ ...modalProp, show: false });
  };

  const createWallet = () => {
    if (!chromeSavePath){
      alert('请先配置chrome数据存储路径');
      return;
    }
    let createWalletData = {};
    setModalProp({
      show: true,
      handleClose: handleModalClose,
      title: '新建钱包',
      handleData: (key, value) => {
        createWalletData[key] = value;
        childRef.current.updadteValueObj(key, value);
      },
      rowList: [
        [
          {
            type: 'label',
            text: '新建数量',
            colWidth: 4,
            style: { textAlign: 'center' },
          },
          {
            type: 'input',
            key: 'number',
            placeholder: '请输入新建数量',
            colWidth: 8,
            style: { textAlign: 'left' },
          },
        ],
        [
          {
            type: 'button',
            text: '创建',
            colWidth: 4,
            style: { marginLeft: 'auto' },
            click: () => {
              if (createWalletData.number) {
                let number = parseInt(createWalletData.number);
                let curWalletNum = walletList.length;
                for (let i = 0; i < number; i++) {
                  let info = web3Manager.createWallet();
                  console.log(info.mnemonic, info.privateKey, info.address);
                  let num = Math.floor((curWalletNum+i+1)/10);
                  
                  let zeroStr = ''
                  for (let j = 0; j < 5-num; j++) {
                    zeroStr += '0';
                  }
                  apiManager
                    .createWallet({
                      name: `钱包${zeroStr}${curWalletNum + i + 1}`,
                      address: info.address,
                      mnemonic: info.mnemonic,
                      privateKey: info.privateKey,
                    })
                    .then((res) => {
                      console.log(res);
                      if (res) {
                        handleModalClose();
                        window.location.reload();
                      }
                    });
                }
              }
            },
          },
        ],
      ],
    });
  };


  const [walletList, setWalletList] = useState([]);
  const [chromeSavePath, setChromeSavePath] = useState('');

  useEffect(() => {
    apiManager.getSavePath().then((res) => {
      if(res.success){
        setChromeSavePath(res.path);
      }
    })

    // Get all wallets from the server
    apiManager.getAllWallets().then((res) => {
      // Add selected property to each wallet object
      const updatedWalletList = res.map(wallet => ({ ...wallet, selected: false }));
      const sortedWalletList = [...updatedWalletList].sort((a, b) => {
        return a.name.localeCompare(b.name);
      });
      setWalletList(sortedWalletList);
    });
    eventEmitter.on('taskCompleted', async() => {
      console.log('taskCompleted');
      
      //更新钱包状态
      apiManager.getAllWallets().then((res) => {
        // Add selected property to each wallet object
        const updatedWalletList = res.map(wallet => ({ ...wallet, selected: false }));
        const sortedWalletList = [...updatedWalletList].sort((a, b) => {
          return a.name.localeCompare(b.name);
        });
        setWalletList(sortedWalletList);
      });
    });
    


  }, []);

  const checkInfo = (title, info) => {
    setModalProp({
      show: true,
      title: title,
      rowList: [[{ type: 'label', text: info, colWidth: 12 }]],
      handleClose: handleModalClose,
    });
  };


  const handleCopyAddress = (address) => {
    navigator.clipboard.writeText(address);
  };
  const openWallet = (wallet) => {
    setModalProp({
      show: true,
      title: '打开钱包',
      rowList: [
        [
          {
            type: 'button',
            text: '普通打开',
            colWidth: 6,
            style: { display: 'flex', alignItems: 'center', justifyContent: 'center'},
            click: () => {
              apiManager.openWallet({...wallet,useProxy:false}).then((res) => {
                console.log(res);
                if (res.success) {
                  alert(res.message);
                  handleModalClose();
                  window.location.reload();
                } else {
                  alert(res.message);
                }
              });
            },
          },
          {
            type: 'button',
            text: '代理打开',
            colWidth: 6,
            style: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
            click: () => {
              apiManager.openWallet({...wallet,useProxy:true}).then((res) => {
                console.log(res);
                if (res.success) {
                  alert(res.message);
                  handleModalClose();
                  window.location.reload();
                } else {
                  alert(res.message);
                }
              });
            },
          }
        ],
      ],
      handleClose: handleModalClose,
    });
    
  }
  const delectedSelectedWallets = () => {
    const selectedWalletsAddress = walletList
      .filter(wallet => wallet.selected)
      .map(wallet => wallet.address);
    console.log(selectedWalletsAddress);
    apiManager.deleteWallets(selectedWalletsAddress).then((res) => {
      console.log(res);
      if (res) {
        window.location.reload();
      }
    })

  }



  // Toggle Select All checkbox
  const toggleSelectAll = () => {
    setSelectAll(!selectAll);
    // Toggle selected property for all wallets
    const updatedWalletList = walletList.map(wallet => ({ ...wallet, selected: !selectAll }));
    setWalletList(updatedWalletList);
  };

  const handleSelect = (index) => {
    const updatedWalletList = [...walletList];
    updatedWalletList[index].selected = !updatedWalletList[index].selected;
    setWalletList(updatedWalletList);
  }
  const exportSelectedWallets = async () => {
    // console.log(window.electronAPI)
    if (!window.electronAPI) {
      alert('请在Electron环境下运行');
      return;
    }
    // const filePath = await window.electronAPI.openFile()
    const directory = await window.electronAPI.chooseDirectory();
    if (directory) {

      const selectedWalletsAddress = walletList.filter(wallet => wallet.selected)
        .map(wallet => wallet.address);
      if (selectedWalletsAddress.length === 0) {
        alert('请先选择钱包');
        return;
      }
      apiManager.exportWallets(selectedWalletsAddress, directory).then((res) => {
        if (res) {
          const file_path = res;
          alert(`导出成功，文件路径为${file_path}`);
        }
      })
    }

  }
  const importWallet = async () => {
    if (!chromeSavePath){
      alert('请先配置chrome数据存储路径');
      return;
    }
    if (!window.electronAPI) {
      alert('请在Electron环境下运行');
      return;
    }
    const filePath = await window.electronAPI.openFile()
    if (filePath) {
      apiManager.importWallets(filePath).then((res) => {
        console.log(res);
        if (res) {
          alert(res);
          window.location.reload();
        }
      })
    }
  }
  
  const initWallets = () => {
    const selectedWalletsAddress = walletList.filter(wallet => wallet.selected)
      .map(wallet => wallet.address);
    if (selectedWalletsAddress.length === 0) {
      alert('请先选择钱包');
      return;
    }
    
    apiManager.initWallets(selectedWalletsAddress).then((res) => {
      console.log(res);
      if (res) {
        alert(res);
        window.location.reload();
      }
    })
  }
  
  
  const setSavePath = () => {
    if (!window.electronAPI) {
      alert('请在Electron环境下运行');
      return;
    }
    window.electronAPI.chooseDirectory().then((res) => {
      console.log(res);
      if (res) {
        apiManager.setSavePath(res).then((res) => {
          if(res.success){
            alert('设置成功');
            window.location.reload();
          }
        })
      }
    });
  }

  return (
    <Container>
      <h1>钱包管理</h1>
      {chromeSavePath ? <p>chrome数据存储路径：{chromeSavePath}</p>
        : <p>未设置chrome数据存储路径</p>
      }
      <Button onClick={setSavePath} className='ms-1' style={{ fontSize: '1.2vw' }}>
        配置存储路径
      </Button>
      <Button className='ms-1' style={{ fontSize: '1.2vw' }} onClick={createWallet}>
        新建钱包
      </Button>
      {/* Add Select All checkbox */}

      <Button onClick={importWallet} className='ms-1' style={{ fontSize: '1.2vw' }}>
        导入钱包
      </Button>
      <Button onClick={exportSelectedWallets} className='ms-1' style={{ fontSize: '1.2vw' }}>
        导出钱包
      </Button>
      <Button onClick={delectedSelectedWallets} className='ms-1' style={{ fontSize: '1.2vw' }}>
        删除钱包
      </Button>

      <Button onClick={initWallets} className='ms-1' style={{ fontSize: '1.2vw' }}>
        初始化钱包
      </Button>

      <Row>
        <Col md={1} style={{ fontSize: '1.0vw' }}>
          <input type='checkbox' checked={selectAll} onChange={toggleSelectAll} />全选
        </Col>
        <Col md={1} style={{ fontSize: '1.0vw' }}>
          钱包名称
        </Col>
        <Col md={3} style={{ fontSize: '1.0vw' }}>
          地址
        </Col>
        <Col md={1} style={{ fontSize: '1.0vw' }}>
          助记词
        </Col>
        <Col md={1} style={{ fontSize: '1.0vw' }}>
          私钥
        </Col>
        <Col md={1} style={{ fontSize: '1.0vw' }}>
          初始化
        </Col>
        <Col md={1} style={{ fontSize: '1.0vw' }}>
          chrome路径
        </Col>
        <Col md={3} style={{ fontSize: '1.0vw' }}>
          操作
        </Col>
      </Row>
      {walletList.map((wallet, index) => {
        return (
          <Row key={index}>
            {/* Use Select All state for checkbox */}
            <Col md={1}>
              <input type='checkbox' checked={wallet.selected} onChange={() => { handleSelect(index) }} />
            </Col>
            <Col md={1} style={{ fontSize: '1.0vw' }}>{wallet.name}</Col>
            <Col md={3}>
              <InputGroup>
                <FormControl
                  placeholder={`${wallet.address.slice(0, 10)}...${wallet.address.slice(-10)}`}
                  aria-label='Address'
                  aria-describedby='basic-addon2'
                  readOnly
                />
                <Button style={{ fontSize: '0.8vw' }} onClick={() => handleCopyAddress(wallet.address)} variant='outline-secondary'>
                  复制
                </Button>
              </InputGroup>
            </Col>
            <Col md={1}>
              <Button style={{ fontSize: '1.0vw',margin:'1px' }} onClick={() => { checkInfo("助记词", wallet.mnemonic) }}>
                查看
              </Button>
            </Col>
            <Col md={1}>
              <Button style={{ fontSize: '1.0vw',margin:'1px' }} onClick={() => { checkInfo("私钥", wallet.privateKey) }}>
                查看
              </Button>
            </Col>
            <Col md={1}>{wallet.walletInitialized ? '是' : '否'}</Col>
            <Col md={1}>
              <Button style={{ fontSize: '1.0vw' }} onClick={() => { checkInfo("浏览器文件路径", wallet.chromeUserDataPath) }}>
                查看
              </Button>
            </Col>
            <Col md={3}>
              <Button onClick={() => { openEdit(wallet) }} style={{ fontSize: '1.0vw' }}>查看编辑</Button>
              {/* Add View/Edit button */}

              <Button onClick={() => { openWallet({...wallet,useProxy:false}) }} style={{ fontSize: '1.0vw' }} className='ms-2'>
                打开
              </Button>

            </Col>
          </Row>
        );
      })}
      <CustomModal ref={childRef} {...modalProp} />
    </Container>
  );
};

export default WalletManage;
