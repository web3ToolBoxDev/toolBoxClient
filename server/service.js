// service.js
const Datastore = require('nedb');
const path = require('path');
const spawn = require('child_process').spawn;


const isBuild = true;
const assetsPath = isBuild ? path.resolve(__dirname,'../../assets') : path.resolve(__dirname, '../assets');

const dbFilePath = path.join(assetsPath, 'db/data.db');
const db = new Datastore({ filename: dbFilePath, autoload: true });

async function openScript() {
  console.log('打开脚本');
  const scriptPath = path.join(assetsPath, 'node_for_mac/test.js');
  const nodePath = path.join(assetsPath, 'node_for_mac/node-v21.6.2-mac/bin/node');
  const child = spawn(nodePath, [scriptPath]);
  return '打开脚本';
  
}

// 插入 hello 消息到 NeDB
async function setHelloMessage(message) {
  return new Promise((resolve, reject) => {
    db.insert({ key: 'hello', value: message }, (err, newDoc) => {
      if (err) {
        reject(err);
        return;
      }
      console.log('插入的文档:', newDoc);
      resolve();
    });
  });
}

// 从 NeDB 中获取 hello 消息
async function getHelloMessage() {
  return new Promise((resolve, reject) => {
    db.findOne({ key: 'hello' }, (err, doc) => {
      if (err) {
        reject(err);
        return;
      }
      if (!doc) {
        reject(new Error('未找到消息'));
        return;
      }
      console.log('Hello message:', doc.value);
      resolve(doc.value);
    });
  });
}

module.exports = {
  setHelloMessage,
  getHelloMessage,
  openScript
};
