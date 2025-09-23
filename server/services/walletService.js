// service.js
const path = require('path');
const excel = require('exceljs');
const date = require('date-and-time');
const taskServiceManager = require('./taskService').getInstance();
const config = require('../../config').getInstance();
const isBuild = config.getIsBuild();
const { createDirectoryIfNotExists } = require('../utils.js');
const fingerPrintService = require('./fingerPrintService.js');
const web3Manager = require('../web3');
const { v4: uuidv4 } = require('uuid');


console.log('wallet isBuild:', isBuild)

let wallets = {};
(async () => {
  try {
    const docs = await new Promise((resolve, reject) => {
      config.getWalletDb().find({}, (err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    });
    wallets = docs.reduce((acc, cur) => {
      acc[cur.id] = cur;
      return acc;
    }, {});
    console.log('wallets initialized:', Object.keys(wallets).length);
  } catch (e) {
    console.error('wallets initialization failed:', e);
  }
})();

// Wallet creation
// API codes: 3001 - Invalid wallet count, 3002 - Save path fetch failed, 3003 - Insert wallet error
 async function createWallet(count=1) {
   console.log('createWallet, count:', count);
   if (count < 1) {
     return { success: false, code: 3001, message: 'Invalid wallet count' };
   }
   const res = await config.getSavePath();
   if (!res.success) {
     return { success: false, code: 3002, message: 'Save path fetch failed' };
   }

   const walletsToInsert = [];
   try {
     for (let i = 0; i < count; i++) {
       const walletId = uuidv4();
       const wallet = web3Manager.createWallet();
       const mnemonic = wallet.mnemonic;
       const ethPrivateKey = wallet.privateKey;
       const ethAddress = wallet.address;
       const solWallet = web3Manager.createSolWalletFromMnemonic(mnemonic);
       const solAddress = solWallet.solAddress;
       const solPrivateKey = solWallet.solPrivateKey;
       const curWallet = {
         id: walletId,
         name: walletId,
         ethAddress,
         ethPrivateKey,
         solAddress,
         solPrivateKey,
         mnemonic,
         bindEnvId: '',
         walletType: 'metamask',
         walletPluginPath: '',
         walletInitialized: false,
         createdAt: Date.now(),
       };
       walletsToInsert.push(curWallet);
       wallets[walletId] = curWallet; // update in-memory cache
     }

     // Bulk insert and await result
     await new Promise((resolve, reject) => {
       config.getWalletDb().insert(walletsToInsert, (err, newDocs) => {
         if (err) reject(err);
         else resolve(newDocs);
       });
     });

     return { success: true, code: 0, message: `Created ${count} wallets`, wallets };
   } catch (error) {
     console.error('createWallet error:', error);
     return { success: false, code: 3003, message: error.message || 'Insert wallet error' };
   }
 }

async function updateWalletName(id, name) {
  console.log('updateWalletName:', id, name);
  if (!id || !name) {
    throw new Error('Missing id or name parameter');
  }
  try {
    const updatedWallet = await new Promise((resolve, reject) => {
      config.getWalletDb().update({ id }, { $set: { name } }, { returnUpdatedDocs: true }, (err, numAffected, affectedDocuments) => {
        if (err) {
          reject(err);
        } else {
          if (numAffected === 0) {
            reject(new Error('Wallet not found'));
          } else {
            resolve(affectedDocuments);
            wallets[id] = { ...wallets[id], name }; // update in-memory cache
          }
        }
      });
    }
    );
    console.log('wallet name updated:', updatedWallet);
    return { success: true, code: 0, message: 'Wallet name updated', wallet: updatedWallet };
  } catch (error) {
    console.error('updateWalletName error:', error);
    // If wallet not found
    if (error.message && error.message.includes('Wallet not found')) {
      return { success: false, code: 3004, message: 'Wallet not found' };
    }
    return { success: false, code: 3003, message: error.message || 'updateWalletName error' };
  }
}

async function getWalletById(id) {
  console.log('getWalletById:', id);
  if (!id) {
    throw new Error('Missing id parameter');
  }
  const wallet = wallets[id];
  if (!wallet) {
    // 从db查询
    const docs = await new Promise((resolve, reject) => {
      config.getWalletDb().find({ id }, (err, docs) => {
        if (err) {
          reject(err);
        } else {
          resolve(docs);
        }
      });
    });
    if (docs.length === 0) {
      throw new Error('Wallet not found');
    }else {
      wallets[id] = docs[0]; // update in-memory cache
      return docs[0];
    }
  }
  return { success: true, code: 0, message: 'Wallet retrieved', data: wallet };

}

async function getAllWallets() {
  try {
    const wallets = await new Promise((resolve, reject) => {
      config.getWalletDb()?.find({}, (err, docs) => {
        if (err) {
          reject(err);
        } else {
          resolve(docs);
        }
      });
    });

    return wallets;
  } catch (error) {
    console.error('getAllWallets error:', error);
    throw error;
  }
}

async function getWalletCount() {
  console.log('getWalletCount');

  try {
    const count = await new Promise((resolve, reject) => {
      config.getWalletDb().count({}, (err, count) => {
        if (err) {
          reject(err);
        } else {
          resolve(count);
        }
      });
    });

    console.log('wallet count:', count);
    return count;
  } catch (error) {
    console.error('getWalletCount error:', error);
    throw error;
  }
}
async function updateWallet(id,wallet) {
  console.log('updateWallet:', id, wallet);
  if (!id || !wallet) {
    throw new Error('Missing id or wallet parameter');
  }
  try {
    const updatedWallet = await new Promise((resolve, reject) => {
      config.getWalletDb().update({ id }, { $set: wallet }, { returnUpdatedDocs: true }, (err, numAffected, affectedDocuments) => {
        if (err) {
          reject(err);
        } else {
          if (numAffected === 0) {
            reject(new Error('Wallet not found'));
          } else {
            resolve(affectedDocuments);
            wallets[id] = { ...wallets[id], ...wallet }; // update in-memory cache
          }
        }
      });
    });
    console.log('wallet updated:', updatedWallet);
    return { success: true, code: 0, message: 'Wallet updated', wallet: updatedWallet };
  } catch (error) {
    console.error('updateWallet error:', error);
    if (error.message && error.message.includes('Wallet not found')) {
      return { success: false, code: 3004, message: 'Wallet not found' };
    }
    return { success: false, code: 3003, message: error.message || 'updateWallet error' };
  }

  
}

async function deleteWallets(ids) {
  ids = Array.isArray(ids) ? ids : [ids]; // ensure ids is an array
  try {
    // 先解绑所有被删除钱包已绑定的指纹环境
    for (const id of ids) {
      const wallet = wallets[id];
      if (wallet && wallet.bindEnvId) {
        await fingerPrintService.unbindWalletEnv(wallet.bindEnvId);
      }
    }
    const numRemoved = await new Promise((resolve, reject) => {
      config.getWalletDb().remove({ id: { $in: ids } }, { multi: true }, (err, numRemoved) => {
        if (err) {
          reject(err);
        } else {
          resolve(numRemoved);
        }
      });
    });
    wallets = Object.fromEntries(
      Object.entries(wallets).filter(([key]) => !ids.includes(key))
    ); // update in-memory cache
    return { success: true, code: 0, message: `Deleted ${numRemoved} wallets`, numRemoved };
  } catch (error) {
    console.error('deleteWallets error:', error);
    throw error;
  }
}
async function exportWallets(ids, directory) {
  console.log('exportWallets:', ids, directory);
  try {
    const exportedWallets = ids.map(id => wallets[id] || null).filter(wallet => wallet !== null);
    if (exportedWallets.length === 0) {
      return { success: false, code: 3004, message: 'No matching wallets' };
    }
    // Create a new workbook
    const wb = new excel.Workbook();
    // Add a new worksheet
    const ws = wb.addWorksheet('Sheet 1');
    // Define column headers
    const columnHeaders = ['id','name', 'mnemonic', 'ethAddress', 'ethPrivateKey', 'solAddress', 'solPrivateKey'];
    // Add column headers to the first row
    ws.addRow(columnHeaders);
    // Iterate over wallets and add them to the worksheet
    exportedWallets.forEach(wallet => {
      const row = [
        wallet.id,
        wallet.name,
        wallet.mnemonic,
        wallet.ethAddress,
        wallet.ethPrivateKey,
        wallet.solAddress,
        wallet.solPrivateKey
      ];
      ws.addRow(row);
    }); 
    // Create the directory if it doesn't exist
    createDirectoryIfNotExists(directory);
    // Define the file path
    const fileName = `wallets_${date.format(new Date(), 'YYYYMMDD_HHmmss')}.xlsx`;
    const filePath = path.join(directory, fileName);
    // Write the workbook to the file
    await wb.xlsx.writeFile(filePath);
    console.log('export file path:', filePath);
    return { success: true, code: 0, message: 'Wallets exported', filePath };
  } catch (error) {
    console.error('exportWallets error:', error);
    return { success: false, code: 3006, message: error.message || 'Wallet export failed' };
  }
}

async function importWallets(filePath) {
  console.log('importWallets');
  try {
    const wb = new excel.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.getWorksheet('Sheet 1');
    const walletsToInsert = [];
    const columnHeaders = ['id', 'name', 'mnemonic', 'ethAddress', 'ethPrivateKey', 'solAddress', 'solPrivateKey'];
    const headerRow = ws.getRow(1);
    columnHeaders.forEach((header, index) => {
      if (headerRow.getCell(index + 1).value !== header) {
        return { success: false, code: 3007, message: 'Import file format error' };
      }
    });
    // get existing wallet mnemonics
    const allWallets = await getAllWallets();
    const existMnemonics = new Set(allWallets.map(w => w.mnemonic).filter(Boolean));
    let repeatNum = 0;
    for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber++) {
      const row = ws.getRow(rowNumber);
      const mnemonic = row.getCell(3).value;
      if (mnemonic && existMnemonics.has(mnemonic)) {
        repeatNum++;
        continue;
      }
      // 生成新 id
      const walletId = uuidv4();
      const wallet = {
        id: walletId,
        name: row.getCell(2).value || walletId,
        mnemonic: mnemonic,
        ethAddress: row.getCell(4).value,
        ethPrivateKey: row.getCell(5).value,
        solAddress: row.getCell(6).value,
        solPrivateKey: row.getCell(7).value,
        walletInitialized: false,
        createdAt: Date.now(),
      };
      
      walletsToInsert.push(wallet);
      wallets[walletId] = wallet; // update in-memory cache
    }
    // 插入数据库
    await new Promise((resolve, reject) => {
      config.getWalletDb().insert(walletsToInsert, (err, newDocs) => {
        if (err) reject(err);
        else resolve(newDocs);
      });
    });
    let message = `Imported ${walletsToInsert.length} wallets, ${repeatNum} duplicates`;
    return { success: true, code: 0, message };
  } catch (error) {
    console.error('importWallets error:', error);
    return { success: false, code: 3003, message: error.message || 'importWallets error' };
  }
}

async function initSuccessCallBack(arg1, arg2){
  // 简化回调处理：支持两种签名：initSuccessCallBack(payload) 或 initSuccessCallBack(taskName, payload)
  const payload = typeof arg1 === 'string' ? arg2 : arg1;
  console.log('initSuccessCallBack payload:', payload);
  if (!payload) {
    return { success: false, code: 3008, message: 'no payload' };
  }

  const updated = [];
  const tryUpdateById = async (id) => {
    if (!id) return null;
    try {
      const res = await updateWallet(id, { walletInitialized: true });
      if (res && res.success) {
        updated.push(id);
      }
    } catch (e) {
      console.error('initSuccessCallBack updateWallet 异常:', e);
    }
  };

  // 1) payload.env（单个环境）
  if (payload.env) {
    const env = payload.env;
    if (env.bindWalletId) await tryUpdateById(env.bindWalletId);
  }

  // 2) payload.wallet（直接传钱包对象）
  if (payload.wallet) {
    const w = payload.wallet;
    const id = w.id || w._id;
    if (id) await tryUpdateById(id);
  }

  // 3) payload.envData / payload.envsData：对象，key->value
  const scan = async (container) => {
    if (!container || typeof container !== 'object') return;
    for (const key of Object.keys(container)) {
      const val = container[key];
      if (!val) continue;
      // 如果是 env-like
      if (val.bindWalletId) {
        await tryUpdateById(val.bindWalletId);
        continue;
      }
      // 如果是 wallet-like
      const id = val.id || val._id;
      if (id) {
        await tryUpdateById(id);
      }
    }
  };

  await scan(payload.envData);
  await scan(payload.envsData);

  // 4) payload 直接为 wallet-like
  if ((payload.id || payload._id) && (payload.mnemonic || payload.ethAddress || payload.bindEnvId)) {
    const id = payload.id || payload._id;
    await tryUpdateById(id);
  }

  if (updated.length === 0) {
    console.warn('initSuccessCallBack: no wallet updated');
    return { success: false, code: 3008, message: 'no wallet updated' };
  }

  return { success: true, code: 0, message: 'updated wallets', updated };
}
async function initWallets(ids) {
  console.log('initWallets:', ids);
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('ids must be a non-empty array');
  }
  try {
    const envsData = {};
    const envIds = [];
    const setIds = new Set(ids);
    for (const id of setIds) {
      const wallet = wallets[id];
      if (!wallet) {
        throw new Error(`Wallet with ID ${id} not found`);
      }
      if (!wallet.bindEnvId) {
        throw new Error(`Wallet ${wallet.name} not bound to fingerprint env`);
      }
      envIds.push(wallet.bindEnvId);
      envsData[wallet.bindEnvId] = wallet;
    }


    // 执行初始化任务
    const taskName = 'initWallet';
    const taskData = { envIds, envsData, successCallBack: initSuccessCallBack};
    // execTask is blocking and will throw on error; no additional validation needed here
    await taskServiceManager.execTask(taskName, taskData);
    
    return { success: true, code: 0, message: 'Init-wallet task dispatched' };
  } catch (error) {
    console.error('initWallets error:', error);
    return { success: false, code: 3010, message: error.message || 'initWallets dispatch failed' };
  }
  
  
}




async function bindWalletEnv(walletId, envId) {
  console.log('bindWalletEnv:', walletId, envId);
  try {
    // 查询钱包
    const walletRes = await getWalletById(walletId);
    if (!walletRes.success) {
      return { success: false, code: 3004, message: walletRes.message || 'Wallet query failed' };
    }
    const wallet = walletRes.data;
    if (!wallet) {
      return { success: false, code: 3004, message: 'Wallet not found' };
    }
    // 如果钱包已绑定环境，先解绑原环境
    if(wallet.bindEnvId && wallet.bindEnvId !== envId) {
      await fingerPrintService.unbindWalletEnv(wallet.bindEnvId);
    }
    // 绑定指纹环境
    const fpRes = await fingerPrintService.bindWalletEnv(walletId, envId);
    console.log('fingerprint bind result:', fpRes);
    if (!fpRes || !fpRes.success) {
      return { success: false, code: 3003, message: fpRes?.message || 'Fingerprint bind failed' };
    }
    // 更新钱包绑定环境ID
    const updateRes = await updateWallet(wallet.id, { bindEnvId: envId, walletInitialized: false });
    if (!updateRes.success) {
      return { success: false, code: 3003, message: updateRes.message || 'Wallet bind update failed' };
    }
    return { success: true, code: 0, message: 'Wallet environment bound', wallet: updateRes.wallet };
  } catch (error) {
    console.error('bindWalletEnv error:', error);
    return { success: false, code: 3003, message: error.message || 'bindWalletEnv error' };
  }
 }

async function openWallets(ids) {
  console.log('openWallets:', ids);
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('ids must be a non-empty array');
  }
  try {
    const envsData = {};
    const envIds = [];
    const setIds = new Set(ids);
    const uninitialized = [];
    for (const id of setIds) {
      const wallet = wallets[id];
      if (!wallet) {
        throw new Error(`Wallet with ID ${id} not found`);
      }
      if (!wallet.bindEnvId) {
        throw new Error(`Wallet ${wallet.name} not bound to fingerprint env`);
      }
      // Check if wallet has been initialized before attempting to open
      if (!wallet.walletInitialized) {
        uninitialized.push({ id: wallet.id, name: wallet.name });
        continue;
      }
      envIds.push(wallet.bindEnvId);
      envsData[wallet.bindEnvId] = wallet;
    }

    if (uninitialized.length > 0) {
      // Return a clear error code and the list of wallets that are not initialized
      return { success: false, code: 3011, message: 'Some wallets are not initialized', uninitialized };
    }

    // execute open-wallet task
    const taskName = 'openWallet';
    const taskData = { envIds, envsData };
    // execTask is blocking and will throw on error; no additional validation needed here
    taskServiceManager.execTask(taskName, taskData);

    return { success: true, code: 0, message: 'Open-wallet task dispatched' };
  } catch (error) {
    console.error('openWallets error:', error);
    return { success: false, code: 3009, message: error.message || 'openWallets error' };
  }
 }

 module.exports = {
  createWallet,
  updateWalletName,
  getWalletById,
  getAllWallets,
  getWalletCount,
  updateWallet, // Adding the updateWallet function to exports
  deleteWallets,
  exportWallets,
  importWallets,
  initWallets,
  openWallets,
  bindWalletEnv
};



