# toolBoxClient

一步一步编写web3工具——Step-by-Step Development of Web3 Tools

## 编译安装

安装之前,请确认安装好了node.js,npm和yarn

第一步安装node相关依赖

```bash
git clone git@github.com:web3ToolBoxDev/toolBoxClient.git
cd toolBoxClient
yarn install
```

第二步打包react前端项目

```bash
yarn build
```

第三步进入assets/node_for_mac或assets/node_for_win，安装相应的node依赖

```bash
//mac系统
cd assets/node_for_mac
//win系统
cd assets/node_for_win
yarn install
```

第三步打包electron,打包前请确认根目录下config.js的IS_BUILD参数为true

```bash
yarn dist
```

即可在dist目录中找到可执行安装文件

## 脚本接入

### 概述

该文档旨在指导开发人员接入 WebSocket 服务，实现与工具箱的实时通信。目前暂时支持JavaScript脚本,接入示例代码请见[example](https://github.com/web3ToolBoxDev/toolBoxClient/blob/main/example/example.js)

### 前提条件

- Node.js 环境
- 熟悉 JavaScript 编程语言

### 步骤

#### 1. 安装依赖

确保安装了 `ws` 模块，该模块提供了 WebSocket 的实现。

```bash
npm install ws
```

#### 2. 接入工具箱

工具箱采用了WebSocket协议进行通讯，工具箱通过调用子进程启动三方脚本，web socket的链接地址将通过进程参数传递给脚本。示例代码如下：

```javascript
const webSocket = require('ws');
const url = process.argv[2];
let ws = new webSocket(url);
```

#### 3. 消息格式

工具箱采用json定义了以下消息格式

- 心跳消息，工具箱用于确认进程是否正常运行，定时发送心跳消息至工具箱，如超过60秒未收到相应消息，工具箱将关闭脚本进程

```json
{
    {
        "type": "heart_beat"
    }
}
```

```javascript
//定时发送心跳消息
setInterval(() => {
    ws.send(JSON.stringify({type: 'heart_beat'}));
}, 5000);
```

- 请求任务数据信息，在WebSocket连接成功后即可请求数据，0.1.0版本可获取工具箱回传消息格式如下

```json
//请求消息格式
{
    "type": "request_task_data",
    "data":""
}
```

```json
//回传消息格式
{
  "type": "request_task_data",
  "data": {
    "name":"钱包名称",
    "address":"钱包地址",
    "mnemonic":"钱包助记词",
    "privateKey":"钱包私钥",
    "initialized":false, //是否完成初始化，初始化以后可以获取浏览器文件路径
    "chromeUserDataPath":"浏览器用户文件储存路径",
    "ip":"用户配置的代理ip",
    "userAgent":"用户配置的浏览器userAgent信息",
    "language":"用户配置的浏览器language信息",
    "webglVendor":"用户配置的浏览器webglVendor信息",
    "webglRenderer":"用户配置的浏览器webglRenderer信息",
    "config":"脚本自定义的config信息（将在后续文档中解释）"
  },
  "time": "2024/3/15 17:56:11"
}
```

- 任务日志消息，用于显示任务进度的消息，工具箱收到消息后会展示在用户前端

```json
{
  "type": "task_log",
  "message": "任务日志信息"
}
```

- 任务终止信息，由用户在工具箱客户端发出，进程接收到消息后需要主动结束任务

```json
{
  "type": "task_terminate"
}
```

- 任务完成信息，任务结束后需要发送任务结束消息，工具箱收到消息后会关闭进程

```json
{
  "type": "task_completed"
}
```

- 任务报错信息，任务执行出错后将出错信息回传客户前端

```json
{
  "type": "task_error",
  "message": "错误信息"
}
```

#### 4. 发送消息

通过调用 `ws.send` 方法向工具箱发送消息。

```javascript
ws.send(JSON.stringify({type: 'task_completed'}));
```

#### 5. 接收消息

通过监听 `message` 事件接收工具箱发送的消息。

```javascript
ws.on('message', function incoming(data) {
    console.log(data);
});
```

#### 6. 脚本配置

工具箱支持导入json文件，用户可配置脚本所需信息，以example中的[币安提币脚本](https://github.com/web3ToolBoxDev/toolBoxClient/blob/main/example/binance.js)为例，用户导入[json配置文件](https://github.com/web3ToolBoxDev/toolBoxClient/blob/main/example/config.json)后，可以用户自行编辑，目前格式统一为键值对的形式，用户配置后可以在请求数据时，通过config获取

## 问题反馈

如果在使用中遇到问题，进入discord @Aming [点击进入社区](https://discord.gg/mf5Crp4fH2)
