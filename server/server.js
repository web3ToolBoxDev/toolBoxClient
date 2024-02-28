// server.js
const express = require('express');
const router = require('./router');

const app = express();
const port = 30001;

// 使用路由
app.use('/api', router);

app.listen(port, () => {
  console.log(`服务器已启动，监听端口 ${port}`);
});
