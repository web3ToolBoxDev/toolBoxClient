// router.js
const express = require('express');
const walletService = require('./services/walletService');
const taskService = require('./services/taskService').getInstance();
const proxyService = require('./services/proxyService');
const fingerPrintService = require('./services/fingerPrintService');
const router = express.Router();
const config = require('../config').getInstance();
const memoryService = require('./services/memoryService');

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
  const { id, ...wallet } = req.body;
  const message = await walletService.updateWallet(id, wallet);
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
  try {
    const result = await taskService.execTask('openWallet', { walletIds: ids });
    if (result && result.success === false) {
      return res.send(result);
    }
    return res.send({ success: true, code: 0, message: 'Open-wallet task dispatched' });
  } catch (error) {
    console.error('openWallets error:', error);
    return res.send({ success: false, code: 3009, message: error.message || 'openWallets error' });
  }
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
router.get('/getAgentTasks', async(req, res) => {
  const message = await taskService.getAgentTasks();
  res.send(message);
});
router.post('/execTask', async(req, res) => {
  const taskName = req.body.taskName;
  const taskDataFromFront = req.body.taskData;
  console.log(taskDataFromFront);
  const result = await taskService.execTask(taskName, taskDataFromFront);
  if (result && result.success === false) {
    return res.send(result);
  }
  return res.send(result || { success: true, code: 0, message: `Task ${taskName} is being executed.` });
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
// BUG-004: Independent session endpoint that reads sessions.json directly from savePath,
// bypassing taskService (which depends on task.db that may not exist in new savePath)
router.get('/getAgentSessions/:agentName', async (req, res) => {
    const agentName = req.params.agentName;
    const savePath = config.getSavePath().path;
    if (!savePath) {
        return res.send({ success: false, message: 'No savePath configured' });
    }
    const sessFile = require('path').join(savePath, 'agents', agentName, 'data', 'sessions.json');
    console.log(`[router] getAgentSessions: reading ${sessFile}`);
    try {
        if (!require('fs').existsSync(sessFile)) {
            console.log(`[router] getAgentSessions: file not found → returning empty`);
            return res.send({ success: true, sessions: [], activeSessionId: '' });
        }
        const raw = JSON.parse(require('fs').readFileSync(sessFile, 'utf8'));
        const sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
        console.log(`[router] getAgentSessions: found ${sessions.length} sessions: [${sessions.map(s => s.name || s.id).join(', ')}]`);
        return res.send({
            success: true,
            activeSessionId: raw.activeSessionId || '',
            sessions: sessions.map(s => ({
                id: s.id,
                name: s.name || 'Session',
                updatedAt: s.updatedAt || Date.now()
            }))
        });
    } catch (e) {
        console.error('[router] getAgentSessions error:', e.message);
        return res.send({ success: true, sessions: [], activeSessionId: '' });
    }
});

router.get('/getAiSession', async (req, res) => {
  const taskName = req.query.taskName;
  const sessionId = req.query.sessionId;
  const message = await taskService.getAiSession(taskName, sessionId);
  res.send(message);
});
router.get('/listAiSessions', async (req, res) => {
  const taskName = req.query.taskName;
  const message = await taskService.listAiSessions(taskName);
  res.send(message);
});
router.post('/createAiSession', async (req, res) => {
  const { taskName, name } = req.body || {};
  const result = await taskService.createAiSession(taskName, name);
  res.send(result);
});
router.post('/deleteAiSession', async (req, res) => {
  const { taskName, sessionId } = req.body || {};
  const result = await taskService.deleteAiSession(taskName, sessionId);
  res.send(result);
});
router.post('/sendAiMessage', async (req, res) => {
  const { taskName, message, sessionId } = req.body || {};
  const result = await taskService.sendAiMessage(taskName, message, sessionId);
  res.send(result);
});
router.post('/sendAiOption', async (req, res) => {
  const { taskName, optionId, optionLabel, sessionId } = req.body || {};
  const result = await taskService.sendAiOption(taskName, optionId, optionLabel, sessionId);
  res.send(result);
});
router.post('/updateAiSubTask', async (req, res) => {
  const { taskName, subTaskKey, status, sessionId } = req.body || {};
  const result = await taskService.updateAiSubTask(taskName, subTaskKey, status, sessionId);
  res.send(result);
});
router.post('/resetAgentForTest', async (req, res) => {
  const { taskName } = req.body || {};
  const result = await taskService.sendAgentCommand(
    taskName,
    JSON.stringify({ type: 'agent_reset_for_test', payload: {} })
  );
  res.send(result);
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
  const message = await config.setSavePath(path);
  // Clear cached AI sessions so next access reads from new savePath
  try { taskService.resetAiSessions(); } catch (e) {
    console.error('[router] resetAiSessions after savePath change failed:', e.message);
  }
  // Switch StateService persistence to new savePath so it reads/writes correct data
  try {
    const { StateService } = require('./services/stateService');
    const svc = StateService.getInstance();
    svc.onSavePathChanged(path);
    // Notify agent via SSE by setting app.savePath (triggers state.changed → SSE broadcast)
    svc.set('app.savePath', path);
  } catch (e) {
    console.error('[router] stateService.onSavePathChanged failed:', e.message);
  }
  // Restart dbservice so it picks up the new savePath
  try { await memoryService.restartDbService(); } catch (e) {
    console.error('[router] restartDbService after savePath change failed:', e.message);
  }
  res.send(message);
});
// 重新加载保存路径下的 DB 数据（用于二次安装后的同步）
router.get('/getSavePath',async(req,res)=>{
  const message = config.getSavePath();
  res.send(message);
});

router.get('/checkWebSocket',async(req,res)=>{
  const message = await taskService.checkWebSocket();
  res.send(message);
});

// Comprehensive readiness check
// Core services (server + webSocket) must be ready before the UI unblocks.
// AI services (dbservice port 30002, toolService port 30004) are optional here —
// they can take 30-60s on first run due to ML model loading. They are reported
// in `checks` for informational purposes but do NOT block `success`.
router.get('/readiness', async (req, res) => {
  const checks = { server: true, webSocket: false, dbservice: false, toolService: false };
  try {
    // WebSocket — always returns success:true synchronously
    const wsResult = taskService.checkWebSocket ? taskService.checkWebSocket() : { success: true };
    checks.webSocket = !!(wsResult && wsResult.success !== false);
  } catch (_) { checks.webSocket = true; }
  try {
    // dbservice (optional — AI memory features; slow on first run due to ML model loading)
    const http = require('http');
    await new Promise((resolve) => {
      const r = http.get('http://127.0.0.1:30002/health', { timeout: 1000 }, (resp) => {
        checks.dbservice = resp.statusCode === 200;
        resp.resume();
        resolve();
      });
      r.on('error', () => resolve());
      r.on('timeout', () => { r.destroy(); resolve(); });
    });
  } catch (_) {}
  try {
    // toolService (optional — AI tool execution; reported but does not block UI)
    const http = require('http');
    await new Promise((resolve) => {
      const r = http.get('http://127.0.0.1:30004/health', { timeout: 1000 }, (resp) => {
        checks.toolService = resp.statusCode === 200;
        resp.resume();
        resolve();
      });
      r.on('error', () => resolve());
      r.on('timeout', () => { r.destroy(); resolve(); });
    });
  } catch (_) {}
  // Only core services (server + webSocket) gate the UI overlay
  const coreReady = checks.server && checks.webSocket;
  if (!coreReady) {
    const failed = Object.entries(checks).filter(([k, v]) => ['server','webSocket'].includes(k) && !v).map(([k]) => k);
    console.log(`[readiness] Core NOT ready: ${failed.join(', ')} still pending`);
  }
  res.send({ success: coreReady, checks });
});
router.post('/getTaskStatus', async (req, res) => {
  const { taskNames } = req.body || {};
  const message = taskService.getTaskRunningStatus(taskNames);
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
  res.send({...count,testError:'testError' });
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

router.get('/getEnvById/:id',async(req,res)=>{
  const result = await fingerPrintService.getEnvById(req.params.id);
  res.send(result);
})

// Start proxy for an env and return the proxy URL + geo data
router.post('/startProxyForEnv/:id',async(req,res)=>{
  const { checkAndStartProxy } = require('./services/proxyService');
  const envRes = await fingerPrintService.getEnvById(req.params.id);
  if (!envRes.success || !envRes.data) {
    return res.send({ success: false, message: 'Env not found' });
  }
  const env = envRes.data;
  if (!env.proxy || !env.proxy.ipHost || !env.proxy.ipPort) {
    return res.send({ success: false, message: 'No proxy configured for this env' });
  }
  const proxyRes = await checkAndStartProxy(
    `agent_${req.params.id}`,
    env.proxy.ipType, env.proxy.ipHost, env.proxy.ipPort,
    env.proxy.ipUsername, env.proxy.ipPassword
  );
  res.send(proxyRes);
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
router.post('/deleteFingerPrintProxy', async (req, res) => {
  const { id } = req.body;
  const result = await fingerPrintService.deleteFingerPrintProxy(id);
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

// ── mini_installer 管理 ──
router.post('/setInstallerPath', async (req, res) => {
  const installerPath = req.body.path;
  const message = config.setInstallerPath(installerPath);
  res.send(message);
});

router.get('/getInstallerPath', async (req, res) => {
  const message = config.getInstallerPath();
  res.send(message);
});

router.post('/runInstaller', async (req, res) => {
  const message = await config.runInstaller();
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
  const current = config.getWalletScriptDirectory();
  const currentDir = current && current.directory ? current.directory : 'default';
  const message = await config.setWalletScriptDirectory(directory);
  const nextDir = directory || 'default';
  if (message && message.success && currentDir !== nextDir) {
    await walletService.resetAllWalletsInitialized();
  }
  res.send(message);
});
router.get('/getWalletScriptDirectory', async (req, res) => {
  const message = config.getWalletScriptDirectory();
  res.send(message);
});

router.post('/resetWalletScriptDirectory', async (req, res) => {
  const message = config.resetWalletScriptDirectory();
  if (message && message.success) {
    await walletService.resetAllWalletsInitialized();
  }
  res.send(message);
});

router.post('/setSyncScriptDirectory', async (req, res) => {
  const directory = req.body.directory;
  const message = await config.setSyncScriptDirectory(directory);
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


router.get('/memory/health', memoryService.handleHealth);
router.post('/memory/store', memoryService.handleStore);
router.post('/memory/search', memoryService.handleSearch);
router.delete('/memory/clear', memoryService.handleClear);

const providerModelService = require('./services/providerModelService');

router.get('/getProviderModels', async (req, res) => {
  const { provider, subProvider, apiKey } = req.query;
  const result = await providerModelService.getProviderModels(
    String(provider || '').trim(),
    String(subProvider || '').trim(),
    String(apiKey || '').trim()
  );
  res.send(result);
});

const toolServiceManager = require('./services/toolServiceManager');

router.get('/tools/health', toolServiceManager.handleHealth);
router.get('/tools/list', toolServiceManager.handleListTools);
router.post('/tools/register', toolServiceManager.handleRegisterTool);
router.post('/tools/execute', toolServiceManager.handleExecuteTool);
router.post('/tools/restart', toolServiceManager.handleRestart);

module.exports = router;
