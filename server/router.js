// router.js
const express = require('express');
const walletService = require('./services/walletService');
const taskService = require('./services/taskService').getInstance();
const proxyService = require('./services/proxyService');
const router = express.Router();

// 定义路由
// router.get('/openScript', async(req, res) => {
//   const message = await service.openScript();
//   console.log('message:', message);
//   res.send(message);
// });
router.post('/createWallet', async(req, res) => {
  const params = req.body;
  const message = await walletService.createWallet(params);
  console.log('message:', message);
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
  const addresses = req.body.addresses;
  console.log('addresses:', addresses);
  const deleteNum = await walletService.deleteWallets(addresses);
  const message = `delete ${deleteNum} wallets`;
  res.send(message);
});
router.post('/exportWallets', async(req, res) => {
  const addresses = req.body.addresses;
  const directory = req.body.directory;
  const message = await walletService.exportWallets(addresses,directory);
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
router.post('/initWallet', async(req, res) => {
  const addresses = req.body.addresses;
  const message = await walletService.initWallets(addresses);
  console.log('message:', message);
  res.send(message);
})
router.post('/openWallet', async(req, res) => {
  const wallet = req.body;
  const message = await taskService.openWallet(wallet);
  console.log('message:', message);
  res.send(message);
});
router.post('/importTask', async(req, res) => {
  const taskObj = req.body;
  const message = await taskService.importTask(taskObj);
  res.send(message);
});
router.get('/getAllTasks', async(req, res) => {
  const message = await taskService.getAllTasks();
  res.send(message);
});
router.post('/execTask', async(req, res) => {
  const taskName = req.body.taskName;
  const wallets = req.body.wallets;
  console.log(wallets)
  taskService.execTask(taskName,wallets);
  res.send("任务已执行，请在任务信息查看任务信息");
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
  const message = await walletService.setSavePath(path);
  res.send(message);
});
router.get('/getSavePath',async(req,res)=>{
  const message = await walletService.getSavePath();
  res.send(message);
});

router.get('/checkWebSocket',async(req,res)=>{
  const message = await taskService.checkWebSocket();
  res.send(message);
});
router.post('/checkProxy',async(req,res)=>{
  const {ipType,ipHost,ipPort,ipUsername,ipPassword} = req.body;
  const message = await proxyService.checkProxy(ipType,ipHost,ipPort,ipUsername,ipPassword);
  res.send(message);
})
module.exports = router;
