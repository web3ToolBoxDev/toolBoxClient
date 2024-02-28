// router.js
const express = require('express');
const service = require('./service');

const router = express.Router();

// 定义路由
router.get('/openScript', async(req, res) => {
  const message = await service.openScript();
  console.log('message:', message);
  res.send(message);
});


module.exports = router;
