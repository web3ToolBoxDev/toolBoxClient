// Dev log: tee all console output to tmp/ log file when IS_BUILD=false
if (process.env.IS_BUILD === 'false') {
  try { require('../scripts/dev-log'); } catch (e) { /* ignore */ }
}

// Prevent NeDB persistence errors (ENOENT on rename) from crashing the process
process.on('uncaughtException', (err) => {
  if (err && err.code === 'ENOENT' && err.syscall === 'rename' && /\.db~/.test(err.path)) {
    console.error('[NeDB] Persistence write error (non-fatal):', err.message);
    return; // swallow — NeDB will retry on next compaction
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

app.use(express.json());
app.use(cors());
app.use('/api', router);

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

app.listen(port, async () => {
  console.log(`服务器已启动，监听端口 ${port}`);
  webService.initialize(app);

  // Start the memory dbservice process
  const memoryService = require('./services/memoryService');
  memoryService.startDbService();

  // Start the tool service process
  const toolServiceManager = require('./services/toolServiceManager');
  toolServiceManager.startToolService();
});

module.exports = app
