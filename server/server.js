// Dev log: tee all console output to tmp/ log file when IS_BUILD=false
if (process.env.IS_BUILD === 'false') {
  try { require('../scripts/dev-log'); } catch (e) { /* ignore */ }
}

process.on('uncaughtException', (err) => {
  if (err && err.code === 'ENOENT') {
    if (err.syscall === 'rename' && /\.db~/.test(err.path)) {
      console.error('[NeDB] Persistence write error (non-fatal):', err.message);
      return;
    }
    if (err.syscall === 'open' || err.syscall === 'write') {
      console.error('[FS] Non-fatal ENOENT:', err.message);
      return;
    }
  }
  console.error('[FATAL] Uncaught exception:', err);
  process.exit(1);
});

const express = require('express');
const cors = require('cors');
const router = require('./router');
const expressWs = require('express-ws');
const webService = require('./services/webSocketService').getInstance();
const app = express();
const port = 30001;

// 使用 expressWs
expressWs(app);

app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use('/api', router);
const stateRoutes = require('./routes/stateRoutes');
app.use('/api/state', stateRoutes);

// Proxy /dashboard/* to dashboardServer on port 30003
const http = require('http');
app.use('/dashboard', (req, res) => {
  const target = `http://127.0.0.1:30003/dashboard${req.url}`;
  http.get(target, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  }).on('error', () => {
    res.status(502).send('Dashboard server not available on port 30003');
  });
});
app.use('/api/dashboard', (req, res) => {
  const target = `http://127.0.0.1:30003/api/dashboard${req.url}`;
  http.get(target, (proxyRes) => {
    let body = '';
    proxyRes.on('data', c => body += c);
    proxyRes.on('end', () => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      res.end(body);
    });
  }).on('error', () => {
    res.status(502).json({ error: 'Dashboard server not available' });
  });
});

const memoryService = require('./services/memoryService');
const toolServiceMgr = require('./services/toolServiceManager');

app.listen(port, '127.0.0.1', async () => {
  console.log(`服务器已启动，监听端口 ${port}`);

  try {
    if (process.parentPort) {
      process.parentPort.postMessage({ type: 'server-port', port });
    }
  } catch (e) {
    // Not running inside Electron utilityProcess — ignore
  }
  webService.initialize(app);

  memoryService.startDbService();
  toolServiceMgr.startToolService();
});

// Flush StateService pending writes on shutdown so no data is lost
function _flushStateOnExit() {
  try {
    const { StateService } = require('./services/stateService');
    const svc = StateService.instance;
    if (svc) {
      console.log('[shutdown] Flushing StateService pending writes...');
      svc.flushAll();
    }
  } catch (e) {
    console.error('[shutdown] flushAll failed:', e.message);
  }
}
process.on('exit', _flushStateOnExit);
process.on('SIGINT', () => { _flushStateOnExit(); memoryService.stopDbService(); toolServiceMgr.stopToolService(); process.exit(0); });
process.on('SIGTERM', () => { _flushStateOnExit(); memoryService.stopDbService(); toolServiceMgr.stopToolService(); process.exit(0); });

module.exports = app
