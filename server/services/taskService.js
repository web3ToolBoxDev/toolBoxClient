const webSocketService = require('./webSocketService').getInstance();
const spawn = require('child_process').spawn;
const {  stopProxy, checkAndStartProxy } = require('./proxyService');
const { sleep } = require('../utils');
const config = require('../../config').getInstance();
const isBuild = config.getIsBuild();
const { getEnvById } = require('./fingerPrintService');

const fs = require('fs');




console.log('task isBuild:', isBuild);




// 统一任务结束和资源释放
function finishTask(self, taskName, success, message) {
    // 防止重复执行 finishTask
    if (!self._finishing) self._finishing = {};
    if (self._finishing[taskName]) return;
    self._finishing[taskName] = true;

    try {
        // 确保有用于标记是否已发送完成通知的结构
        if (!self._sentCompleted) self._sentCompleted = {};
        // 仅在尚未发送过完成通知时发送，避免重复推送
        if (!self._sentCompleted[taskName]) {
            self.webSocketService.closeTaskWebSocket(taskName);
            self.webSocketService.sendToFront(self.taskCompletedMessage(taskName, success, message));
            self._sentCompleted[taskName] = true;
        }

        // 标记运行/完成状态（不要立即删除，保留一段时间以便外部检查）
        self.isRunning[taskName] = false;
        self.isCompleted[taskName] = true;

        // 停用代理等资源
        if (self.isUseProxy && self.isUseProxy[taskName]) {
            stopProxy(taskName);
            delete self.isUseProxy[taskName];
        }

        // 延迟清理状态（保留 completed 标记 5 秒，保证 checkCompleted 能感知）
        setTimeout(() => {
            try {
                if (self.isRunning && typeof self.isRunning[taskName] !== 'undefined') {
                    delete self.isRunning[taskName];
                }
                if (self.isCompleted && typeof self.isCompleted[taskName] !== 'undefined') {
                    delete self.isCompleted[taskName];
                }
                if (self.isSuccess && typeof self.isSuccess[taskName] !== 'undefined') {
                    delete self.isSuccess[taskName];
                }
                // 保留 _sentCompleted 标记用于后续判断
            } catch (e) {
                console.error('finishTask deferred cleanup error:', e);
            }
        }, 5000);
    } finally {
        // 清理 _finishing 标记，允许后续调用感知到已完成状态
        delete self._finishing[taskName];
    }
}

class TaskService {
    static instance;
    constructor() {
        if (!TaskService.instance) {
            TaskService.instance = this;
            this.webSocketService = webSocketService;
            console.log("WebSocketService instance:", this.webSocketService);
            this.isRunning = {};
            this.isUseProxy = {};
            this.heartBeatTimeoutId = {};
            this.lastHeartBeatTime = {};
            this.isCompleted = {};
            this.defaultExecPath = config.getDefaultExecPath();
            this.initWalletScriptPath = config.getInitWalletScriptPath();
            this.openWalletScriptPath = config.getOpenWalletScriptPath();
            this.chromePath = config.getChromePath().path;
            this.savePath = config.getSavePath().path;

            this.isSuccess = {};
        }
        return TaskService.instance;
    }
    static getInstance() {
        if (!TaskService.instance) {
            TaskService.instance = new TaskService();
        }
        return TaskService.instance;
    }

    //任务进程和服务端通讯的消息格式
    //心跳消息
    heartBeatMessage() {
        const dateTime = new Date().toLocaleString();
        return JSON.stringify({
            type: 'heart_beat',
            time: dateTime
        });
    }
    //用于子进程请求任务信息
    requestTaskData(data) {
        const dateTime = new Date().toLocaleString();
        return JSON.stringify({
            type: 'request_task_data',
            data: data,
            time: dateTime
        });
    }

    taskLogMessage(log, code = 0) {
        const dateTime = new Date().toLocaleString();
        return JSON.stringify({
            type: 'task_log',
            message: log,
            code,
            time: dateTime
        });
    }

    terminateProcessMessage() {
        const dateTime = new Date().toLocaleString();
        return JSON.stringify({
            type: 'terminate_process',
            time: dateTime
        });
    }

    taskCompletedMessage(taskName, success, msg, code = 0) {
        const dateTime = new Date().toLocaleString();
        return JSON.stringify({
            type: 'task_completed',
            time: dateTime,
            taskName: taskName,
            success: success,
            message: msg,
            code
        });
    }

    taskErrorMessge(msg, code = 1000) {
        const dateTime = new Date().toLocaleString();
        return JSON.stringify({
            type: 'task_error',
            message: msg,
            code,
            time: dateTime
        });
    }


    /**
     * 配置json格式示例
     * {
     *    "rpc":{"type":"input"}
     *    "network":{"type":"select","options":["mainnet","testnet"]}
     * }
     * 
     */
    async importTask(taskObj) {
        // Check for duplicate taskName
        const task = await this.getTaskByName(taskObj.taskName);
        if (task) {
            return { success: false, code: 1001, message: 'Task name already exists' };
        }

        if (taskObj.configSchemaPath)
            taskObj.configSchema = JSON.parse(fs.readFileSync(taskObj.configSchemaPath, 'utf-8'));
        //默认任务为false
        if (!taskObj.defaultTask) {
            taskObj.defaultTask = false;
        }
        return new Promise((resolve, reject) => {
            config.getTaskDb().insert(taskObj, (err, doc) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(doc);
                }
            });
        });

    }

    async getTaskByName(taskName) {
        return new Promise((resolve, reject) => {
            config.getTaskDb().findOne({ taskName }, (err, doc) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(doc);
                }
            });
        });
    }
    async getAllTasks(defaultTask) {

        return new Promise((resolve, reject) => {
            config.getTaskDb().find({ defaultTask }, (err, docs) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(docs);
                }
            });
        });
    }
    shortTaskName(taskName) {
        if (taskName.indexOf('_') === -1) {
            return taskName;
        }
        const [address, splitTaskName] = taskName.split('_');
        const shortAddress = address.slice(0, 5) + '...' + address.slice(-5);
        return `${shortAddress}_${splitTaskName}`;
    }
    /**
     * 
     * @param {*} taskName 
     * @param {*} taskDataFromFront //前端可能包含以下参数
     * envIds, 指纹环境ID数组
     * data， 其他任务所需数据
     * @returns 
     */
    async execTask(taskName, taskDataFromFront) {
        console.log('execTask:', taskName, taskDataFromFront);
        const task = await this.getTaskByName(taskName);
        if (!task) {
            return { success: false, code: 1002, message: 'Task does not exist' };
        }

        let ids = [];
        if (taskDataFromFront && taskDataFromFront.envIds) {
            ids = taskDataFromFront.envIds;
        }
        // envId:data
        let envsData = {};
        if (taskDataFromFront && taskDataFromFront.envsData) {
            envsData = taskDataFromFront.envsData;
        }

        let taskSuccessCallBack = undefined;
        if (taskDataFromFront && taskDataFromFront.successCallBack) {
            taskSuccessCallBack = taskDataFromFront.successCallBack;
        }


        switch (task.taskType) {
            case 'execWithoutWallet': {
                let taskNameNew = `${task.taskName}`;
                if (this.isRunning[taskNameNew]) {
                    return { success: false, code: 1003, message: 'Task is running' };
                }
                const taskData = {};
                if (task.config) {
                    taskData.config = task.config;
                }
                if (taskDataFromFront) {
                    taskData.taskDataFromFront = taskDataFromFront;
                    let config = taskDataFromFront.config;
                    if (config && config.useProxy) {
                        taskData.useProxy = true;
                        taskData.ipType = config.ipType;
                        taskData.ipHost = config.ipHost;
                        taskData.ipPort = config.ipPort;
                        taskData.ipUsername = config.ipUsername;
                        taskData.ipPassword = config.ipPassword;

                    }

                }
                console.log('taskNameNew:', taskNameNew);
                this.runTask(taskNameNew, taskData, task.execPath || this.defaultExecPath, task.scriptPath);
                break;
            }


            case 'execByOrder':
                console.log('顺序执行任务', task)
                for (let i = 0; i < ids.length; i++) {
                    let id = ids[i];
                    let env = (await getEnvById(id)).data;
                    let envData = envsData[id] || {};
                    // 使用 env.id 保证唯一性，回退到 env.name 以兼容旧数据
                    let taskName = `${env.id || env.name}_${task.taskName}`;
                    if (this.isRunning[taskName]) {
                        continue;
                    }

                    const taskData = { env,envData, taskDataFromFront, chromePath: this.chromePath, savePath: this.savePath };
                    this.runTask(taskName, taskData, task.execPath || this.defaultExecPath, task.scriptPath, taskSuccessCallBack);
                    await this.checkCompleted(taskName);
                }
                break;
            case 'execByAsync':
                for (let i = 0; i < ids.length; i++) {
                    let id = ids[i];
                    let env = (await getEnvById(id)).data;
                    let envData = envsData[id] || {};
                    // 使用 env.id 保证唯一性，回退到 env.name 以兼容旧数据
                    let taskName = `${env.id || env.name}_${task.taskName}`;
                    if (this.isRunning[taskName]) {
                        continue;
                    }

                    const taskData = { env,envData, taskDataFromFront, chromePath: this.chromePath, savePath: this.savePath };
                    this.runTask(taskName, taskData, task.execPath || this.defaultExecPath, task.scriptPath, taskSuccessCallBack);
                    this.checkCompleted(taskName);
                }
                break;
            case 'execAll':
                let taskNameAll = `${task.taskName}`;
                if (this.isRunning[taskNameAll]) {
                    return { success: false, code: 1003, message: 'Task is running' };
                }
                let envs = [];
                if (ids.length > 0) {
                    for (let i = 0; i < ids.length; i++) {
                        let id = ids[i];
                        let env = (await getEnvById(id)).data;
                        if (env) {
                            envs.push(env);
                        }
                    }
                }
                const taskDataAll = { envs,envsData, taskDataFromFront, chromePath: this.chromePath, savePath: this.savePath };
                this.runTask(taskNameAll, taskDataAll, task.execPath || this.defaultExecPath, task.scriptPath, taskSuccessCallBack);
                this.checkCompleted(taskNameAll);
                break;
            default:
                break;

        }
    }

    async deleteTask(taskNames) {
        return new Promise((resolve, reject) => {
            config.getTaskDb().remove({ taskName: { $in: taskNames } }, { multi: true }, (err, numRemoved) => {
                if (err) {
                    reject({ success: false, code: 1004, message: 'Delete task failed' });
                } else {
                    resolve({ success: true, code: 0, numRemoved });
                }
            });
        });
    }




    processMsg(taskName, msg, taskData) {
        let data = JSON.parse(msg);
        switch (data.type) {
            case 'heart_beat': {
                this.lastHeartBeatTime[taskName] = Date.now();
                this.webSocketService.sendToTask(taskName, this.heartBeatMessage());
                break;
            }
            case 'request_task_data': {
                let taskMsg = this.requestTaskData(taskData);
                console.log('request_task_data:', taskMsg);
                this.webSocketService.sendToTask(taskName, taskMsg);
                break;
            }
            case 'task_log': {
                console.log('task_log:', data.message);
                this.webSocketService.sendToFront(
                    this.taskLogMessage(`Task:${this.shortTaskName(taskName)} ${data.message}`)
                );
                break;
            }
            case 'terminate_process': {
                this.webSocketService.sendToFront(
                    this.taskLogMessage(`Task:${this.shortTaskName(taskName)} terminated`)
                );
                break;
            }
            case 'task_completed': {
                console.log('task_completed:', taskName, data);
                this.isCompleted[taskName] = true;
                if (data.success) {
                    this.isSuccess[taskName] = true;
                }
                this.webSocketService.sendToFront(
                    this.taskLogMessage(`Task:${this.shortTaskName(taskName)} completed`)
                );
                break;
            }
            default:
                break;
        }
    }
    async runTask(taskName, taskData, execPath, scriptPath, taskSuccessCallBack = undefined, timeout = 60000) {
        try {
            console.log('runTask:', taskName, taskData, execPath, scriptPath);
            // 在任务真正开始前，重置完成通知标记，允许同名任务后续发送完成通知
            if (!this._sentCompleted) this._sentCompleted = {};
            this._sentCompleted[taskName] = false;
            // 检查环境是否配置代理，执行checkAndStartProxy
            if (taskData.env && taskData.env.proxy && taskData.env.proxy.ipType && taskData.env.proxy.ipHost && taskData.env.proxy.ipPort) {
                const proxyRes = await checkAndStartProxy(taskName,taskData.env.proxy.ipType, taskData.env.proxy.ipHost, taskData.env.proxy.ipPort, taskData.env.proxy.ipUsername, taskData.env.proxy.ipPassword);
                if (proxyRes.success && proxyRes.data) {
                    const { url, ip, position, country, timeZone } = proxyRes.data;
                    taskData.env.position = position;
                    taskData.env.country = country;
                    taskData.env.timeZone = timeZone;
                    taskData.env.webrtc_public = ip;
                    taskData.env.proxyUrl = url;
                    taskData.env.useProxy = true;
                    this.isUseProxy[taskName] = true;
                    this.webSocketService.sendToFront(this.taskLogMessage(`Task:${this.shortTaskName(taskName)} use proxy:${url}`));
                }
            }
            this.isRunning[taskName] = true;
            this.lastHeartBeatTime[taskName] = Date.now();
            this.isCompleted[taskName] = false;
            this.isSuccess[taskName] = false;
            let taskDataJson = JSON.stringify(taskData);
            let url = this.webSocketService.createTaskWebSocket(taskName, (msg) => {
                this.processMsg(taskName, msg, taskDataJson)
            });
            const childProcess = spawn(execPath, [scriptPath, url]);
            this.webSocketService.sendToFront(this.taskLogMessage(`Task:${this.shortTaskName(taskName)} started`));
            childProcess.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
            });

            // 收集 stderr 信息，并标记是否发生错误；不要在此处直接 finishTask，等待 child close 后统一判断
            let childHadError = false;
            let stderrBuffer = '';
            childProcess.stderr.on('data', (data) => {
                const str = String(data);
                console.error(`stderr: ${str}`);
                childHadError = true;
                stderrBuffer += str;
                // 也把错误日志推送到前端
                this.webSocketService.sendToFront(this.taskLogMessage(`Task:${this.shortTaskName(taskName)} stderr: ${str}`));
            });

            childProcess.on('close', (code) => {
                console.log(`child process exited with code ${code}`);
                // 优先依据子进程 stderr 判断错误；否则依据任务内部通过 websocket 上报的 isSuccess
                try {
                    if (childHadError) {
                        const message = `Task process stderr output: ${stderrBuffer || ('exit code ' + code)}`;
                        this.webSocketService.sendToFront(this.taskLogMessage(`Task:${this.shortTaskName(taskName)} failed: ${message}`));
                        finishTask(this, taskName, false, message);
                        return;
                    }

                    if (this.isSuccess[taskName]) {
                        // 任务通过内部上报成功
                        if (taskSuccessCallBack) {
                            try {
                                console.log('call taskSuccessCallBack:', taskName);
                                taskSuccessCallBack(taskData);
                            } catch (err) {
                                console.error('taskSuccessCallBack error:', err);
                            }
                        }
                        finishTask(this, taskName, true, `Task exited with code ${code}`);
                        return;
                    }

                    // 如果既没有 stderr，也没有内部上报成功，视为失败（可能子进程非零退出）
                    const message = `Task exited with code ${code}`;
                    this.webSocketService.sendToFront(this.taskLogMessage(`Task:${this.shortTaskName(taskName)} exited: ${message}`));
                    finishTask(this, taskName, false, message);
                } catch (err) {
                    console.error('on close handler error:', err);
                    finishTask(this, taskName, false, `Task close handler error: ${err.message}`);
                }
            });

            this.heartBeatTimeoutId[taskName] = setInterval(() => {
                const currentTime = Date.now();
                const heartBeatThreshold = currentTime - timeout;
                if (this.lastHeartBeatTime[taskName] < heartBeatThreshold) {
                    clearInterval(this.heartBeatTimeoutId[taskName]);
                    finishTask(this, taskName, false, { type: 'timeout', message: 'Task timeout' });
                    return;
                }
                if (this.isCompleted[taskName]) {
                    clearInterval(this.heartBeatTimeoutId[taskName]);
                    try {
                        // console.log('task_completed callback:', taskName, taskData, this.isSuccess[taskName]);
                        if (taskSuccessCallBack && this.isSuccess[taskName]) {
                            console.log('call taskSuccessCallBack:', taskName);
                            taskSuccessCallBack(taskData);
                        }
                    } catch (err) {
                        console.error('taskSuccessCallBack error:', err);
                    }
                    finishTask(this, taskName, true, 'Task completed');
                }
            }, 1000);
        } catch (err) {
            console.error('runTask error:', err);
            this.webSocketService.sendToFront(this.taskErrorMessge(err.message));
            finishTask(this, taskName, false, `Task run error: ${err.message}`);
        }
    }
    async checkCompleted(taskName) {
        try {
            while (true) {
                await sleep(1000);
                // 如果 finishTask 已发送完成通知，直接退出循环
                if (this._sentCompleted && this._sentCompleted[taskName]) {
                    break;
                }
                // 保持兼容：如果检测到运行结束且标记为已完成，则触发一次 finishTask 并退出
                if ((!this.isRunning[taskName] || this.isRunning[taskName] === false) && (this.isCompleted[taskName] === true)) {
                    finishTask(this, taskName, true, 'Task completed (checkCompleted)');
                    break;
                }
            }
        } catch (err) {
            console.error('checkCompleted error:', err);
        }
    }
    
    async getConfigInfo(taskName) {
        const task = await this.getTaskByName(taskName);
        if (!task) {
            return { success: false, code: 1002, message: 'Task does not exist' };
        }
        try {
            return { success: true, code: 0, config: task.config };
        } catch (error) {
            return { success: false, code: 1009, message: error.message };
        }
    }
    async setConfigInfo(taskName, taskConfig) {
        const task = await this.getTaskByName(taskName);
        if (!task) {
            return { success: false, code: 1002, message: 'Task does not exist' };
        }

        try {
            //更新task配置信息
            task.config = taskConfig;
            config.getTaskDb().update({ taskName: taskName }, task, { returnUpdatedDocs: true });
            return { success: true, code: 0 };
        } catch (error) {
            return { success: false, code: 1010, message: error.message };
        }
    }
    async checkWebSocket() {
        this.webSocketService.checkWebSocket()
    }
}
module.exports = TaskService;
