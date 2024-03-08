const express = require('express');
const cors = require('cors');
const router = require('./router');
const expressWs = require('express-ws');
const webService = require('./services/webSocketService').getInstance();
const app = express();
const port = 30001;

// 使用 expressWs
expressWs(app);
webService.initialize(app);
app.use(express.json());
app.use(cors());
app.use('/api', router);


app.listen(port, () => {
  console.log(`服务器已启动，监听端口 ${port}`);
});

module.exports = app
