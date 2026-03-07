// Dev log: tee all console output to tmp/ log file when IS_BUILD=false
if (process.env.IS_BUILD === 'false') {
  try { require('../scripts/dev-log'); } catch (e) { /* ignore */ }
}

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

app.listen(port, async () => {
  console.log(`服务器已启动，监听端口 ${port}`);
  webService.initialize(app);

  // Start the memory dbservice process
  const memoryService = require('./services/memoryService');
  memoryService.startDbService();
});

module.exports = app
