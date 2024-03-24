import React, { useState, useEffect } from 'react';
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


  const openEdit = (wallet) => {
    let openEditData = {};
    setModalProp(
      {
        show: true,
        handleClose: handleModalClose,
        title: '查看编辑',
        handleData: (key, value) => {
          openEditData[key] = value;
          // console.log(openEditData);
        },
        rowList: [
          [
            {
              type: 'label',
              text: '钱包名称',
              colWidth: 4,
              style: { textAlign: 'right' },
            },
            {
              type: 'input',
              key: 'name',
              placeholder: wallet.name || '请输入钱包名称',
              colWidth: 8,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'label',
              text: 'IP代理',
              colWidth: 4,
              style: { textAlign: 'right' },
            },
            {
              type: 'input',
              key: 'ip',
              placeholder: wallet.ip || '请输入IP代理',
              colWidth: 8,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'label',
              text: 'twitterToken',
              colWidth: 4,
              style: { textAlign: 'right' },
            },
            {
              type: 'input',
              key: 'twitterToken',
              placeholder: wallet.twitterToken || '请输入twitter登录token',
              colWidth: 8,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'label',
              text: 'discordToken',
              colWidth: 4,
              style: { textAlign: 'right' },
            },
            {
              type: 'input',
              key: 'discordToken',
              placeholder: wallet.discordToken || '请输入discord登录token',
              colWidth: 8,
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
              colWidth: 4,
              style: { textAlign: 'right' },
            },
            {
              type: 'input',
              key: 'userAgent',
              placeholder: wallet.userAgent || '请输入userAgent',
              colWidth: 8,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'label',
              text: '语言',
              colWidth: 4,
              style: { textAlign: 'right' },
            },
            {
              type: 'input',
              key: 'language',
              placeholder: wallet.language || '请输入语言',
              colWidth: 8,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'label',
              text: 'webglVendor',
              colWidth: 4,
              style: { textAlign: 'right' },
            },
            {
              type: 'input',
              key: 'webglVendor',
              placeholder: wallet.webglVendor || '请输入webglVendor',
              colWidth: 8,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'label',
              text: 'webglRenderer',
              colWidth: 4,
              style: { textAlign: 'right' },
            },
            {
              type: 'input',
              key: 'webglRenderer',
              placeholder: wallet.webglRenderer || '请输入webglRenderer',
              colWidth: 8,
              style: { textAlign: 'left' },
            },
          ],
          [
            {
              type: 'button',
              text: '提交',
              colWidth: 4,
              style: { marginLeft: 'auto' },
              click: () => {
                console.log(openEditData);
                apiManager.updateWallet({
                  address: wallet.address,
                  name: openEditData.name || wallet.name,
                  ip: openEditData.ip || wallet.ip,
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
        console.log(createWalletData);
      },
      rowList: [
        [
          {
            type: 'label',
            text: '新建数量',
            colWidth: 4,
            style: { textAlign: 'right' },
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
                  apiManager
                    .createWallet({
                      name: `钱包${curWalletNum + i + 1}`,
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
    console.log(wallet.walletInitialized);
    if (!wallet.walletInitialized) {
      alert('请先初始化钱包');
      return;
    }
    apiManager.openWallet(wallet).then((res) => {
      console.log(res);
      if (res.success) {
        alert('打开成功');
      }else{
        alert(res.message);
      }
      window.location.reload();
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
              <Button style={{ fontSize: '1.0vw' }} onClick={() => { checkInfo("助记词", wallet.mnemonic) }}>
                查看
              </Button>
            </Col>
            <Col md={1}>
              <Button style={{ fontSize: '1.0vw' }} onClick={() => { checkInfo("私钥", wallet.privateKey) }}>
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

              <Button onClick={() => { openWallet(wallet) }} style={{ fontSize: '1.0vw' }} className='ms-2'>
                打开
              </Button>
            </Col>
          </Row>
        );
      })}
      <CustomModal {...modalProp} />
    </Container>
  );
};

export default WalletManage;
