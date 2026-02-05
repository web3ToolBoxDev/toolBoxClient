# toolBoxClient

Step-by-Step Development of Web3 Tools

## English

**Important:** The default MetaMask password is web3toolbox. For customization, please contact Aming.

### Browser

The current web3toolbox v1.0.0 corresponds to the browser at:
https://github.com/web3ToolBoxDev/mychrome-patches

Fingerprint features require using the browser above.

### Build & Install

Before installation, make sure Node.js, npm, and Yarn are installed.

Step 1: Install Node dependencies.

```bash
git clone git@github.com:web3ToolBoxDev/toolBoxClient.git
cd toolBoxClient
yarn install
```

Step 2: Build the React frontend.

```bash
yarn build
```

Step 3: Enter assets/scripts and install its Node dependencies.

```bash
cd assets/scripts
yarn install
```

Step 4: Build Electron. Before packaging, make sure IS_BUILD in config.js (root) is set to true.

```bash
yarn dist
```

The installer can be found in the dist directory.

### Script Integration

#### Overview

This document guides developers to integrate with the WebSocket service for real-time communication with the toolbox. Currently only JavaScript scripts are supported. See the integration example at [example](https://github.com/web3ToolBoxDev/toolBoxClient/blob/main/example/example.js).
There are three script execution modes:
1. Sequential: when running against multiple accounts, each account completes before the next starts.
2. Concurrent: multiple accounts start together; performance depends on machine resources.
3. Full: the script receives the full account list; the data format differs from the first two modes.

#### Task Package & taskConfig.json

Since 0.1.2, “Import Task” in the UI selects a directory that contains `taskConfig.json`. The backend reads this file and registers tasks. Example directory structure:

```
your-task-dir/
  taskConfig.json
  example.js        # your script file
  other-assets...
```

`taskConfig.json` is an array; each item describes a task. Example (same as `example/taskConfig.json`):

```json
[
  {
    "taskName": "测试任务",              // task display name
    "scriptPath": "./example.js",       // script path (relative to taskConfig.json)
    "taskKey": "testTask",              // unique key (optional)
    "defaultTask": false,                 // default task
    "taskType": "execByOrder",          // execByOrder | execByAsync | execAll | execByWallet
    "taskSchema": {                      // optional: form schema (compatible with configSchema)
      "testInput": { "type": "input", "text": "测试输入框" },
      "testSelect": {
        "type": "select",
        "options": [
          { "value": "test1", "text": "选择框1" },
          { "value": "test2", "text": "选择框2" },
          { "value": "test3", "text": "选择框3" }
        ],
        "defaultValue": "test2"
      }
    }
  }
]
```

Field descriptions:

- `taskName`: task display name.
- `scriptPath`: script path, **relative to the directory of taskConfig.json**.
- `taskType`:
  - `execByOrder` sequential (per environment/wallet).
  - `execByAsync` concurrent.
  - `execAll` receive full environment list in one request.
  - `execByWallet` run by wallet only (no environment binding; frontend sends `walletIds`).
- `taskSchema`/`configSchema`: used by the frontend to generate dynamic config forms. If only `taskSchema` is provided on import, it is mapped to `configSchema` automatically.
- `defaultTask`, `taskKey`: optional identifiers/defaults.

Config delivery:

- Single-environment tasks (execByOrder/execByAsync): the backend merges `default` with the target config based on mode (wallet/env) and passes it to `taskData.taskDataFromFront.config`.
- Full tasks (execAll): the script can read `taskData.taskDataFromFront.configsByEnv` (per environment) and `configMode`.

Note: schemas in `taskConfig.json` define the form only and do not include actual values. Real values are entered via the frontend “Config” button and saved into the task record.

Test task package (env config verification):

- A ready-to-import test package is included at [test/envTask](test/envTask). It runs in `execByOrder` mode and logs env fields plus merged config so you can verify both common config and per-env config are received correctly.
- Use Task Management → Import Task, pick the test/envTask directory, then run in “By Environment” mode.

#### Prerequisites

- Node.js environment
- Familiarity with JavaScript

#### Steps

1. Install dependencies

   Install the `ws` module, which provides the WebSocket implementation.

   ```bash
   npm install ws
   ```

2. Connect to toolbox

   The toolbox communicates via WebSocket. It launches third-party scripts as child processes and passes the WebSocket URL through process arguments. Example:

   ```javascript
   const webSocket = require('ws');
   const url = process.argv[2];
   let ws = new webSocket(url);
   ```

  Reconnect handling (recommended): if the connection drops, reconnect and **re-send** `request_task_data` after `open`. This ensures the script receives task payload after reconnect.

    Frontend WebSocket reliability: the client now sends heartbeats and will auto-reconnect; the server buffers recent task logs while the frontend is disconnected and flushes them on reconnect.

3. Message formats

   The toolbox uses JSON for the following message formats.

   - Heartbeat message: the toolbox checks if the process is alive. Send heartbeats periodically; if no message is received for 60 seconds, the toolbox will close the script process.

   ```json
   {
       {
           "type": "heart_beat"
       }
   }
   ```

   ```javascript
   // send heartbeat periodically
   setInterval(() => {
       ws.send(JSON.stringify({type: 'heart_beat'}));
   }, 5000);
   ```

   - Request task data: once the WebSocket is connected, request data. The response format in v0.1.2 is as follows.

   ```json
   // request format
   {
       "type": "request_task_data",
       "data":""
   }
   ```

   Sequential / concurrent (execByOrder / execByAsync) response data:

   ```json
   {
     "type": "request_task_data",
     "data": {
       "env": {               // fingerprint env (id/alias/UA/language/fingerprint/proxy)
         "id": "env-id",
         "alias": "env-alias",
         "user_agent": "...",
         "language_js": "en-US",
         "proxyUrl": "http://...",   // when proxy is enabled
         "useProxy": true
       },
       "envData": {
         "wallet": {          // wallet info if env is bound to wallet
           "name": "wallet-1",
           "address": "0x1234...",
           "mnemonic": "...",
           "privateKey": "...",
           "walletInitialized": false,
           "chromeUserDataPath": ".../User Data"
         }
       },
       "taskDataFromFront": {
         "mode": "wallet",             // wallet | env
         "envIds": ["env-id"],
         "walletIds": ["wallet-id"],   // only in wallet mode
         "config": {                    // merged config (default + target)
           "__mode": "wallet",
           "testInput": "...",
           "testSelect": "test2"
         }
       },
       "chromePath": "C:/.../chrome.exe",
       "savePath": "C:/.../profiles",
       "walletExtensionPath": ".../metamask"  // null in env mode
     }
   }
   ```

   Wallet-only execution (execByWallet, wallet direct without environment) response data:

   ```json
   {
     "type": "request_task_data",
     "data": {
       "env": null,
       "envData": {
         "wallet": {
           "name": "wallet-1",
           "address": "0x1234...",
           "mnemonic": "...",
           "privateKey": "..."
         }
       },
       "taskDataFromFront": {
         "mode": "wallet",
         "walletIds": ["wallet-id"],
         "config": {
           "__mode": "wallet",
           "testInput": "...",
           "testSelect": "test2"
         }
       },
       "chromePath": "C:/.../chrome.exe",
       "savePath": "C:/.../profiles",
       "walletExtensionPath": ".../metamask"
     }
   }
   ```

   Full execution (execAll) response data:

   ```json
   {
     "type": "request_task_data",
     "data": {
       "envs": [ { "id": "env-1", "alias": "...", "user_agent": "..." }, { "id": "env-2" } ],
       "envsData": {
         "env-1": { "wallet": { "address": "0xabc..." } },
         "env-2": { "wallet": { "address": "0xdef..." } }
       },
       "taskDataFromFront": {
         "configMode": "wallet",       // wallet | env
         "configsByEnv": {              // merged config per env
           "env-1": { "testInput": "..." },
           "env-2": { "testInput": "..." }
         }
       },
       "chromePath": "C:/.../chrome.exe",
       "savePath": "C:/.../profiles",
       "walletExtensionPath": ".../metamask"  // null in env mode
     }
   }
   ```

   - Task log message: used to show task progress on the UI.

   ```json
   {
     "type": "task_log",
     "message": "任务日志信息"
   }
   ```

   - Task terminate message: sent by the user; the process should stop the task when received.

   ```json
   {
     "type": "task_terminate"
   }
   ```

   - Task completed message: send when the task finishes; the toolbox will close the process.

   ```json
   {
     "type": "task_completed"
   }
   ```

   - Task error message: send error details to the frontend when the task fails.

   ```json
   {
     "type": "task_error",
     "message": "错误信息"
   }
   ```

4. Send messages

   Use `ws.send` to send messages to the toolbox.

   ```javascript
   ws.send(JSON.stringify({type: 'task_completed'}));
   ```

5. Receive messages

   Listen to the `message` event to receive messages from the toolbox.

   ```javascript
   ws.on('message', function incoming(data) {
       console.log(data);
   });
   ```

6. Script configuration

   In v0.1.2, script configuration supports per-wallet settings. The config format currently supports `input` and `select` types. Example:

   ```json
   {
       "testInput": {"type":"input", "text":"测试输入框"}, 
       "testSelect": {"type":"select", "options": [
           {"value":"test1", "text":"选择框1"},
           {"value":"test2", "text":"选择框2"},
           {"value":"test3", "text":"选择框3"}
       ], "defaultValue":"test2"}
   }
   ```

   Example: if the user sets the common input to “测试1” and selects “选择框3”, the request data will contain:

   ```json
   {
     ...,
     "config":{
       "default":{
         "testInput":"测试1",
         "testSelect":"选择框3"
       }
     }
   }
   ```

### Support

If you encounter issues, join the Discord and @Aming: [community link](https://discord.gg/mf5Crp4fH2)

### License

Apache-2.0. See [LICENSE](LICENSE).

## 中文

**重要说明：** MetaMask 默认密码为 web3toolbox，如需定制请联系 Aming。

### 浏览器说明

当前版本 web3toolbox v1.0.0 对应浏览器：
https://github.com/web3ToolBoxDev/mychrome-patches

使用指纹功能需要使用上述浏览器。

### 编译安装

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

第三步进入assets/scripts，安装相应的node依赖

```bash
cd assets/scripts
yarn install
```

第三步打包electron,打包前请确认根目录下config.js的IS_BUILD参数为true

```bash
yarn dist
```

即可在dist目录中找到可执行安装文件

### 脚本接入

#### 概述

该文档旨在指导开发人员接入 WebSocket 服务，实现与工具箱的实时通信。目前暂时支持JavaScript脚本,接入示例代码请见[example](https://github.com/web3ToolBoxDev/toolBoxClient/blob/main/example/example.js)
接入的脚本执行方式存在以下三种：
1. 顺序执行，在多个账户执行脚本时，将按照顺序一个账户完成脚本任务后，下一个账户才能执行脚本
2. 同步执行，在多个账户执行脚本时，将同时按不同账户启动脚本，执行将受到电脑性能的影响
3. 全量执行，与前两种执行模式不同的是，脚本将获取到全量的账户信息，改执行模式获取到的数据与前两种不同

#### 任务包与 taskConfig.json

自 0.1.2 起，前端“导入任务”改为选择包含 `taskConfig.json` 的目录。后端会读取该文件并注册任务。目录结构示例：

```
your-task-dir/
  taskConfig.json
  example.js        # 你的脚本文件
  other-assets...
```

`taskConfig.json` 为数组，每个元素描述一个任务，示例（与 `example/taskConfig.json` 一致）：

```json
[
  {
    "taskName": "测试任务",              // 任务名称（前端展示）
    "scriptPath": "./example.js",       // 脚本相对路径（相对 taskConfig.json 所在目录）
    "taskKey": "testTask",              // 唯一键，可选
    "defaultTask": false,                 // 是否默认任务
    "taskType": "execByOrder",          // execByOrder | execByAsync | execAll | execByWallet
    "taskSchema": {                      // 可选：表单 schema（兼容旧字段 configSchema）
      "testInput": { "type": "input", "text": "测试输入框" },
      "testSelect": {
        "type": "select",
        "options": [
          { "value": "test1", "text": "选择框1" },
          { "value": "test2", "text": "选择框2" },
          { "value": "test3", "text": "选择框3" }
        ],
        "defaultValue": "test2"
      }
    }
  }
]
```

字段说明：

- `taskName`：任务显示名。
- `scriptPath`：脚本路径，**相对 taskConfig.json 所在目录**。
- `taskType`：
  - `execByOrder` 顺序执行（逐个环境/钱包）。
  - `execByAsync` 并发执行。
  - `execAll` 一次性收到全量环境列表。
  - `execByWallet` 仅按钱包执行（无需绑定环境，前端传 `walletIds`）。
- `taskSchema`/`configSchema`：用于前端动态生成配置表单。导入时若只有 `taskSchema` 会自动映射为 `configSchema`。
- `defaultTask`、`taskKey`：可选，供识别或默认任务使用。

配置下发：

- 单环境任务（execByOrder/execByAsync）：后端会根据配置模式（按钱包或按环境）合并 `default` 与对应目标配置，传入脚本的 `taskData.taskDataFromFront.config`。
- 全量任务（execAll）：脚本可读取 `taskData.taskDataFromFront.configsByEnv`（按环境）及 `configMode`。

注意：`taskConfig.json` 中的 schema 仅定义表单，不含实际配置值；具体配置由前端“配置”按钮填写并保存后写入任务记录。

#### 前提条件

- Node.js 环境
- 熟悉 JavaScript 编程语言

#### 步骤

1. 安装依赖

   确保安装了 `ws` 模块，该模块提供了 WebSocket 的实现。

   ```bash
   npm install ws
   ```

2. 接入工具箱

   工具箱采用了WebSocket协议进行通讯，工具箱通过调用子进程启动三方脚本，web socket的链接地址将通过进程参数传递给脚本。示例代码如下：

   ```javascript
   const webSocket = require('ws');
   const url = process.argv[2];
   let ws = new webSocket(url);
   ```

3. 消息格式

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

   - 请求任务数据信息，在WebSocket连接成功后即可请求数据，0.1.2版本可获取工具箱回传消息格式如下

   ```json
   //请求消息格式
   {
       "type": "request_task_data",
       "data":""
   }
   ```

   顺序执行 / 并发执行（execByOrder / execByAsync）获取的数据如下：

   ```json
   {
     "type": "request_task_data",
     "data": {
       "env": {               // 指纹环境，包含 id/alias/UA/语言/指纹/代理等
         "id": "env-id",
         "alias": "env-alias",
         "user_agent": "...",
         "language_js": "en-US",
         "proxyUrl": "http://...",   // 若开启代理
         "useProxy": true
       },
       "envData": {
         "wallet": {          // 若环境已绑定钱包，则附带钱包信息
           "name": "wallet-1",
           "address": "0x1234...",
           "mnemonic": "...",
           "privateKey": "...",
           "walletInitialized": false,
           "chromeUserDataPath": ".../User Data"
         }
       },
       "taskDataFromFront": {
         "mode": "wallet",             // wallet | env
         "envIds": ["env-id"],
         "walletIds": ["wallet-id"],   // 仅 wallet 模式存在
         "config": {                    // 已合并后的配置（按模式合并 default + 目标配置）
           "__mode": "wallet",
           "testInput": "...",
           "testSelect": "test2"
         }
       },
       "chromePath": "C:/.../chrome.exe",
       "savePath": "C:/.../profiles",
       "walletExtensionPath": ".../metamask"  // env 模式时为 null
     }
   }
   ```

   按钱包执行（execByWallet，钱包直连不依赖环境）获取的数据如下：

   ```json
   {
     "type": "request_task_data",
     "data": {
       "env": null,
       "envData": {
         "wallet": {
           "name": "wallet-1",
           "address": "0x1234...",
           "mnemonic": "...",
           "privateKey": "..."
         }
       },
       "taskDataFromFront": {
         "mode": "wallet",
         "walletIds": ["wallet-id"],
         "config": {
           "__mode": "wallet",
           "testInput": "...",
           "testSelect": "test2"
         }
       },
       "chromePath": "C:/.../chrome.exe",
       "savePath": "C:/.../profiles",
       "walletExtensionPath": ".../metamask"
     }
   }
   ```

   全量执行（execAll）获取的数据如下：

   ```json
   {
     "type": "request_task_data",
     "data": {
       "envs": [ { "id": "env-1", "alias": "...", "user_agent": "..." }, { "id": "env-2" } ],
       "envsData": {
         "env-1": { "wallet": { "address": "0xabc..." } },
         "env-2": { "wallet": { "address": "0xdef..." } }
       },
       "taskDataFromFront": {
         "configMode": "wallet",       // wallet | env
         "configsByEnv": {              // 针对每个环境合并后的配置
           "env-1": { "testInput": "..." },
           "env-2": { "testInput": "..." }
         }
       },
       "chromePath": "C:/.../chrome.exe",
       "savePath": "C:/.../profiles",
       "walletExtensionPath": ".../metamask"  // env 模式下为 null
     }
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

4. 发送消息

   通过调用 `ws.send` 方法向工具箱发送消息。

   ```javascript
   ws.send(JSON.stringify({type: 'task_completed'}));
   ```

5. 接收消息

   通过监听 `message` 事件接收工具箱发送的消息。

   ```javascript
   ws.on('message', function incoming(data) {
       console.log(data);
   });
   ```

6. 脚本配置

   V0.1.2 调整脚本配置功能，实现不同钱包可拥有独立配置,脚本配置格式目前支持input和select两种，以下为脚本配置格式

   ```json
   {
       "testInput": {"type":"input", "text":"测试输入框"}, 
       "testSelect": {"type":"select", "options": [
           {"value":"test1", "text":"选择框1"},
           {"value":"test2", "text":"选择框2"},
           {"value":"test3", "text":"选择框3"}
       ], "defaultValue":"test2"}
   }
   ```

   例如用户通用配置的测试输入框的输入内容"测试1"，选择"选择框3"后，请求数据将收到以下信息

   ```json
   {
     ...,
     "config":{
       "default":{
         "testInput":"测试1",
         "testSelect":"选择框3"
       }
     }
   }
   ```

### 问题反馈

如果在使用中遇到问题，进入discord @Aming [点击进入社区](https://discord.gg/mf5Crp4fH2)

### License

Apache-2.0，详见 [LICENSE](LICENSE)。
