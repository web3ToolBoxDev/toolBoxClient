// service.js
const fs = require('fs'); // 加入文件系统模块
const Datastore = require('nedb');
const path = require('path');
const excel = require('exceljs');
const date = require('date-and-time');
const ethers = require('ethers');
const TaskService = require('./taskService')
const taskServiceManager = new TaskService();
const config = require('../../config').getInstance()
const isBuild = config.getIsBuild();


console.log('wallet isBuild:', isBuild)

const assetsPath = config.getAssetsPath();


// 新增一个钱包管理的表
const walletDb = new Datastore({ filename: path.join(assetsPath, 'db/walletData.db'), autoload: true });

// // 创建钱包数据模型
// const WalletSchema = new Schema({
//   address: String,
//   mnemonic: String,
//   privateKey: String,
//   // 其他需要存储的钱包信息字段
// });

// Function to create directory if it does not exist
function createDirectoryIfNotExists(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

async function setSavePath(savePath) {
  //使用将path写入assets文件夹内
  console.log('设置保存路径:', savePath);
  const pathJson = JSON.stringify({ path: savePath });
  try{
    fs.writeFileSync(path.join(assetsPath, 'savePath.json'), pathJson);
    return {success:true};
  }catch(error){
    console.error('设置保存路径时出错:', error);
    return {success:false,error:error};
  }
}
async function getSavePath() {
  //使用将path写入assets文件夹内
  try{
    const pathJson = fs.readFileSync(path.join(assetsPath, 'savePath.json'));
    const pathObj = JSON.parse(pathJson);
    return {success:true,path:pathObj.path};
  }catch(error){
    console.error('获取保存路径时出错:', error);
    return {success:false,error:error};
  }

}
async function createWallet(params) {
  console.log('创建钱包');
  console.log('参数:', params);
  let res = await getSavePath();
  if(!res.success){
    throw new Error('获取保存路径失败');
  }
  const userDataPath = res.path;
  try {
    const {name, address, mnemonic, privateKey } = params;
    const chromeUserDataPath = path.join(userDataPath, address);
    const walletData = {name, address, mnemonic, privateKey, initialized: false, chromeUserDataPath };
    createDirectoryIfNotExists(chromeUserDataPath);
    await new Promise((resolve, reject) => {
      walletDb.insert(walletData, (err, newWallet) => {
        if (err) {
          reject(err);
        } else {
          resolve(newWallet);
        }
      });
    });

    console.log('钱包创建成功:', walletData);
    return walletData;
  } catch (error) {
    console.error('创建钱包时出错:', error);
    throw error;
  }
}

async function getWalletByAddress(address) {
  console.log('根据地址查询钱包:', address);

  try {
    const wallet = await new Promise((resolve, reject) => {
      walletDb.findOne({ address }, (err, doc) => {
        if (err) {
          reject(err);
        } else {
          resolve(doc || null);
        }
      });
    });

    console.log('查询到的钱包:', wallet);
    return wallet;
  } catch (error) {
    console.error('查询钱包时出错:', error);
    throw error;
  }
}

async function getAllWallets() {
  // console.log('查询所有钱包');

  try {
    const wallets = await new Promise((resolve, reject) => {
      walletDb.find({}, (err, docs) => {
        if (err) {
          reject(err);
        } else {
          resolve(docs);
        }
      });
    });

    // console.log('查询到的钱包:', wallets);
    return wallets;
  } catch (error) {
    console.error('查询钱包时出错:', error);
    throw error;
  }
}

async function getWalletCount() {
  console.log('查询钱包数量');

  try {
    const count = await new Promise((resolve, reject) => {
      walletDb.count({}, (err, count) => {
        if (err) {
          reject(err);
        } else {
          resolve(count);
        }
      });
    });

    console.log('钱包数量:', count);
    return count;
  } catch (error) {
    console.error('查询钱包数量时出错:', error);
    throw error;
  }
}
async function updateWallet(params) {
  console.log('更新钱包');
  const { address,
    name, userAgent, ip, language, webglVendor, webglRenderer,initialized,chromeUserDataPath
  } = params;

  if (!address) {
    throw new Error('缺少地址参数');
  }

  try {
    const updatedWallet = await new Promise((resolve, reject) => {
      walletDb.update({ address }, { $set: { name, userAgent, ip, language, webglVendor, webglRenderer,initialized,chromeUserDataPath } }, { returnUpdatedDocs: true }, (err, numAffected, affectedDocuments) => {
        if (err) {
          reject(err);
        } else {
          if (numAffected === 0) {
            reject(new Error('未找到匹配的钱包'));
          } else {
            resolve(affectedDocuments);
          }
        }
      });
    });

    console.log('钱包更新成功:', updatedWallet);
    return updatedWallet;
  } catch (error) {
    console.error('更新钱包时出错:', error);
    throw error;
  }
}
async function deleteWallet(address) {
  console.log('删除钱包:', address);
  //删除chromeUserDataPath
  const wallet = await getWalletByAddress(address);
  if (wallet) {
    fs.rmdirSync(wallet.chromeUserDataPath, { recursive: true });
  }
  try {
    const numRemoved = await new Promise((resolve, reject) => {
      walletDb.remove({ address }, {}, (err, numRemoved) => {
        if (err) {
          reject(err);
        } else {
          resolve(numRemoved);
        }
      });
    });

    console.log('删除钱包数量:', numRemoved);
    return numRemoved;
  } catch (error) {
    console.error('删除钱包时出错:', error);
    throw error;
  }
}
async function deleteWallets(addresses) {
  console.log('删除钱包:', addresses);
  //删除chromeUserDataPath
  for (let i = 0; i < addresses.length; i++) {
    const wallet = await getWalletByAddress(addresses[i]);
    if (wallet) {
      fs.rmdirSync(wallet.chromeUserDataPath, { recursive: true });
    }
  }

  try {
    const numRemoved = await new Promise((resolve, reject) => {
      walletDb.remove({ address: { $in: addresses } }, { multi: true }, (err, numRemoved) => {
        if (err) {
          reject(err);
        } else {
          resolve(numRemoved);
        }
      });
    });

    console.log('删除钱包数量:', numRemoved);
    return numRemoved;
  } catch (error) {
    console.error('删除钱包时出错:', error);
    throw error;
  }
}
async function exportWallets(addresses, directory) {
  console.log('导出钱包:', addresses);
  try {
    const wallets = await new Promise((resolve, reject) => {
      walletDb.find({ address: { $in: addresses } }, (err, docs) => {
        if (err) {
          reject(err);
        } else {
          resolve(docs);
        }
      });
    });

    console.log('查询到的钱包:', wallets);
    
    const wb = new excel.Workbook();
    const ws = wb.addWorksheet('Sheet 1');
    
    // Set headers
    ws.addRow(['address', 'mnemonic', 'privateKey', 'name', 'userAgent', 'IP', 'language', 'webglVendor', 'webglRenderer']);
    
    // Add data
    wallets.forEach(wallet => {
      ws.addRow([
        wallet.address,
        wallet.mnemonic || '', // Ensure empty string if value is null
        wallet.privateKey || '', // Ensure empty string if value is null
        wallet.name || '', // Ensure empty string if value is null
        wallet.userAgent || '', // Ensure empty string if value is null
        wallet.ip || '', // Ensure empty string if value is null
        wallet.language || '', // Ensure empty string if value is null
        wallet.webglVendor || '', // Ensure empty string if value is null
        wallet.webglRenderer || '' // Ensure empty string if value is null
      ]);
    });

    const date_time = date.format(new Date(), 'YYYYMMDDHHmmss');
    const filePath = path.join(directory, `wallets_${date_time}.xlsx`);
    
    await wb.xlsx.writeFile(filePath);
    
    console.log('导出文件路径:', filePath);
    return filePath;
  } catch (error) {
    console.error('导出钱包时出错:', error);
    throw error;
  }
}

async function importWallets(filePath) {
  console.log('导入钱包');
  try {
    const wb = new excel.Workbook();

    await wb.xlsx.readFile(filePath); // Await for the file reading to complete

    const ws = wb.getWorksheet('Sheet 1');
    const wallets = [];

    // Define column headers
    const columnHeaders = ['address', 'mnemonic', 'privateKey', 'name', 'userAgent', 'IP', 'language', 'webglVendor', 'webglRenderer'];

    // Check if column headers match
    const headerRow = ws.getRow(1);
    columnHeaders.forEach((header, index) => {
      if (headerRow.getCell(index + 1).value !== header) {
        throw new Error('导入文件格式错误');
      }
    });

    // 获取现有钱包数量
    const walletCount = await getWalletCount();
    
    let repeatNum = 0;
    
    // Iterate over rows
    for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber++) {
      const row = ws.getRow(rowNumber);
      const wallet = {
        address: row.getCell(1).value,
        mnemonic: row.getCell(2).value,
        privateKey: row.getCell(3).value,
        name: row.getCell(4).value || `钱包${walletCount + rowNumber - 1}`,
        userAgent: row.getCell(5).value,
        ip: row.getCell(6).value,
        language: row.getCell(7).value,
        webglVendor: row.getCell(8).value,
        webglRenderer: row.getCell(9).value
      };

      // Log the first wallet
      if (rowNumber === 2) {
        console.log('导入的钱包:', wallet);
      }

      // Process mnemonic or privateKey
      if (wallet.mnemonic && wallet.mnemonic.trim() !== '') {
        const walletTemp = ethers.Wallet.fromPhrase(wallet.mnemonic);
        wallet.address = walletTemp.address;
        wallet.privateKey = walletTemp.privateKey;
      } else if (wallet.privateKey && wallet.privateKey.trim() !== '' &&
                (!wallet.mnemonic || wallet.mnemonic.trim() === '')) {
        const walletTemp = new ethers.Wallet(wallet.privateKey);
        wallet.address = walletTemp.address;
        wallet.mnemonic = walletTemp.mnemonic;
      } else {
        throw new Error('导入文件格式错误');
      }

      // Check if address already exists in the database
      const walletDbTemp = await getWalletByAddress(wallet.address);
      console.log('walletDbTemp:', walletDbTemp)
      if (!walletDbTemp) {
        // 设置initialized为false,
        wallet.initialized = false;
        let res = await getSavePath();
        if(!res.success){
          throw new Error('获取保存路径失败');
        }
        const userDataPath = res.path;
        // 创建chromeUserDataPath
        const chromeUserDataPath = path.join(userDataPath, wallet.address);
        createDirectoryIfNotExists(chromeUserDataPath);
        wallet.chromeUserDataPath = chromeUserDataPath;
        wallets.push(wallet);
      } else {
        console.log('地址已经存在:', wallet.address);
        repeatNum++;
      }
    }

    console.log('导入的钱包:', wallets);

    // Insert wallets into the database
    await new Promise((resolve, reject) => {
      walletDb.insert(wallets, (err, newDocs) => {
        if (err) {
          reject(err);
        } else {
          resolve(newDocs);
        }
      });
    });

    message = `成功导入${wallets.length}个钱包,有${repeatNum}个钱包重复`;
    return message;
  } catch (error) {
    console.error('导入钱包时出错:', error);
    throw error;
  }
}

async function initSuccessCallBack(wallet){
  wallet.initialized = true;
  await updateWallet(wallet);
}
async function initWallets(addresses) {
  console.log('初始化钱包:', addresses);
  let wallets = [];
  //查询wallet所有信息
  for (let i = 0; i < addresses.length; i++) {
    let wallet = await getWalletByAddress(addresses[i]);
    if (!wallet) {
      throw new Error('未找到匹配的钱包');
    }
    wallets.push(wallet);
  }
  //初始化钱包任务
  taskServiceManager.initWalletsTask(wallets,(wallet)=>{
    console.log(wallet)
    initSuccessCallBack(wallet)});
  return '初始化钱包任务已创建';
  
}









module.exports = {
  createWallet,
  getWalletByAddress,
  getAllWallets,
  getWalletCount,
  updateWallet, // Adding the updateWallet function to exports
  deleteWallet,
  deleteWallets,
  exportWallets,
  importWallets,
  initWallets,
  setSavePath,
  getSavePath
};



