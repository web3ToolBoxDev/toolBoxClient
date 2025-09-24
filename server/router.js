// router.js
const express = require('express');
const walletService = require('./services/walletService');
const taskService = require('./services/taskService').getInstance();
const proxyService = require('./services/proxyService');
const fingerPrintService = require('./services/fingerPrintService');
const router = express.Router();
const config = require('../config').getInstance();

// 定义路由
// router.get('/openScript', async(req, res) => {
//   const message = await service.openScript();
//   console.log('message:', message);
//   res.send(message);
// });

router.post('/createWallet', async(req, res) => {
  const count = req.body.count || 1;
  const message = await walletService.createWallet(count);
  res.send(message);
});

router.post('/updateWalletName', async(req, res) => {
  const { id, name } = req.body;
  const message = await walletService.updateWalletName(id, name);
  res.send(message);
});
router.get('/getAllWallets', async(req, res) => {
  const message = await walletService.getAllWallets();
  // console.log('message:', message);
  res.send(message);
});
router.put('/updateWallet', async(req, res) => {
  const params = req.body;
  const message = await walletService.updateWallet(params);
  console.log('message:', message);
  res.send(message);
});

router.delete('/deleteWallets', async(req, res) => {
  const ids = req.body.ids;
  const message = await walletService.deleteWallets(ids);
  res.send(message);
});
router.post('/exportWallets', async(req, res) => {
  const ids = req.body.ids;
  const directory = req.body.directory;
  console.log('exportWallets params:', { ids, directory });
  const message = await walletService.exportWallets(ids,directory);
  console.log('message:', message);

  res.send(message);
})
router.post('/importWallets', async(req, res) => {
  const filePath = req.body.filePath;
  try{
    const message = await walletService.importWallets(filePath);
    console.log('message:', message);
    res.send(message);
  }catch(error){
    console.error('error:', error);
    
    res.send(error.message);
  }
})
router.post('/initWallets', async(req, res) => {
  const ids = req.body.ids;
  const message = await walletService.initWallets(ids);
  console.log('message:', message);
  res.send(message);
})
router.post('/openWallets', async(req, res) => {
  const ids = req.body.ids;
  console.log('ids:', ids);
  const message = await walletService.openWallets(ids);
  console.log('message:', message);
  res.send(message);
});
router.post('/importTask', async(req, res) => {
  const taskObj = req.body;
  const message = await taskService.importTask(taskObj);
  res.send(message);
});
router.get('/getAllTasks', async(req, res) => {
  let defaultTask = req.query.defaultTask;
  //转化为boolean
  defaultTask = defaultTask === 'true';
  const message = await taskService.getAllTasks(defaultTask);
  res.send(message);
});
router.post('/execTask', async(req, res) => {
  const taskName = req.body.taskName;
  const taskDataFromFront = req.body.taskData;
  console.log(taskDataFromFront);
  taskService.execTask(taskName,taskDataFromFront);
  res.send({success:true, message: `Task ${taskName} is being executed.` });
});
router.post('/getConfigInfo', async(req, res) => {
  const taskName = req.body.taskName;
  const message = await taskService.getConfigInfo(taskName);
  res.send(message);
});
router.post('/setConfigInfo', async(req, res) => {
  const taskName = req.body.taskName;
  const config = req.body.config;
  const message = await taskService.setConfigInfo(taskName,config);
  res.send(message);
});
router.delete('/deleteTask', async(req, res) => {
  console.log('req.body:', req.body.taskNames);
  const taskNames = req.body.taskNames;
  const delete_num = await taskService.deleteTask(taskNames);
  const message = `delete ${delete_num} tasks`;
  res.send(message);
});
router.post('/setSavePath',async(req,res)=>{
  const path = req.body.path;
  const message = config.setSavePath(path);
  res.send(message);
});
router.get('/getSavePath',async(req,res)=>{
  const message = config.getSavePath();
  res.send(message);
});

router.get('/checkWebSocket',async(req,res)=>{
  const message = await taskService.checkWebSocket();
  res.send(message);
});
router.post('/checkProxy',async(req,res)=>{
  const {ipType,ipHost,ipPort,ipUsername,ipPassword} = req.body;
  console.log('checkProxy params:',req.body);
  const message = await proxyService.checkProxy(ipType,ipHost,ipPort,ipUsername,ipPassword);
  res.send(message);
})
//获取指纹信息数量
router.get('/getFingerPrintCount',async(req,res)=>{
  const count = await fingerPrintService.getFingerPrintCount();
  res.send(count);
})
//导入指纹信息
router.post('/loadFingerPrints',async(req,res)=>{
  const filePath = req.body.filePath;
  const message = await fingerPrintService.loadFingerPrints(filePath);
  res.send(message);
 
})
//生成指纹
router.post('/generateFingerPrints',async(req,res)=>{
  const counts = req.body.counts;
  const message = await fingerPrintService.generateRandomFingerPrint(counts);
  res.send(message);
})
//获取指纹信息
router.get('/getFingerPrints',async(req,res)=>{
  const fingerPrints = await fingerPrintService.getFingerPrints();
  res.send(fingerPrints);
})
//获取指纹生成进度
router.get('/getFingerPrintProgress',async(req,res)=>{
  const message = await walletService.getFingerPrintProgress();
  console.log('finger message:', message);
  res.send(message);
})
//清空指纹数据
router.get('/clearFingerPrints',async(req,res)=>{
  const message = await fingerPrintService.clearFingerPrints();
  res.send(message);
})
// 更新指纹环境代理
router.post('/updateFingerPrintProxy', async (req, res) => {
  const { id, proxy } = req.body;
  const result = await fingerPrintService.updateFingerPrintProxy(id, proxy);
  res.send(result);
});
router.post('/setChromePath', async (req, res) => {
  const chromePath = req.body.path;
  const message = config.setChromePath(chromePath);
  res.send(message);
});

router.get('/getChromePath', async (req, res) => {
  const message = config.getChromePath();
  res.send(message);
});
// 修改指纹环境名称
router.post('/updateFingerPrintName', async (req, res) => {
  const { id, name } = req.body;
  const result = await fingerPrintService.updateFingerPrintName(id, name);
  res.send(result);
});
// 批量删除指纹环境
router.post('/deleteFingerPrints', async (req, res) => {
  const { ids } = req.body;
  const result = await fingerPrintService.deleteFingerPrints(ids);
  res.send(result);
});

router.post('/bindWalletEnv', async (req, res) => {
  const { walletId, envId } = req.body;
  const result = await walletService.bindWalletEnv(walletId, envId);
  res.send(result);
});

router.post('/setWalletScriptDirectory', async (req, res) => {
  const directory = req.body.directory;
  const message = config.setWalletScriptDirectory(directory);

  res.send(message);
});
router.get('/getWalletScriptDirectory', async (req, res) => {
  const message = config.getWalletScriptDirectory();
  res.send(message);
});

router.post('/setSyncScriptDirectory', async (req, res) => {
  const directory = req.body.directory;
  const message = config.setSyncScriptDirectory(directory);
  res.send(message);
});

router.get('/getSyncScriptDirectory', async (req, res) => {
  const message = config.getSyncScriptDirectory();
  res.send(message);
});

router.post('/resetSyncScriptDirectory', async (req, res) => {
  const message = config.resetSyncScriptDirectory();
  res.send(message);
});


module.exports = router;
