const webSocketService = require('./webSocketService').getInstance();
const spawn = require('child_process').spawn;
const {  stopProxy, checkAndStartProxy } = require('./proxyService');
const { sleep } = require('../utils');
const config = require('../../config').getInstance();
const isBuild = config.getIsBuild();
const { getEnvById } = require('./fingerPrintService');
// 移除顶层从 walletService 解构，避免循环依赖导致 undefined
// const { getWalletById } = require('./walletService');

const fs = require('fs');
const path = require('path');




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
            this.taskProcesses = {};
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

    taskLogMessage(log, code = 0, taskName = undefined) {
        const dateTime = new Date().toLocaleString();
        const payload = {
            type: 'task_log',
            message: log,
            code,
            time: dateTime
        };
        if (taskName) {
            payload.taskName = taskName;
        }
        return JSON.stringify(payload);
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
        if (!taskObj || typeof taskObj !== 'object' || Array.isArray(taskObj)) {
            return { success: false, code: 1000, message: 'Invalid task payload' };
        }
        // 新逻辑：按目录导入 taskConfig.json 中声明的任务
        if (taskObj && taskObj.directory) {
            const { directory } = taskObj;
            try {
                if (!fs.existsSync(directory)) {
                    return { success: false, code: 1005, message: '目录不存在' };
                }
                const res = await config.loadTasksFromDirectory(directory);
                if (res && res.success) {
                    return { success: true, code: 0, message: res.message || '导入成功' };
                }
                return { success: false, code: 1006, message: res?.message || '导入失败' };
            } catch (e) {
                return { success: false, code: 1007, message: e.message };
            }
        }

        // 兼容旧逻辑：单任务手动录入
        const task = await this.getTaskByName(taskObj.taskName);
        if (task) {
            return { success: false, code: 1001, message: 'Task name already exists' };
        }

        if (taskObj.configSchemaPath)
            taskObj.configSchema = JSON.parse(fs.readFileSync(taskObj.configSchemaPath, 'utf-8'));
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
                    // 过滤掉空/无 taskName 的脏数据
                    const clean = (docs || []).filter(d => d && d.taskName);
                    resolve(clean);
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

    isProcessAlive(taskName) {
        const proc = this.taskProcesses ? this.taskProcesses[taskName] : null;
        if (!proc) return false;
        if (proc.exitCode !== null) return false;
        if (proc.killed) return false;
        return true;
    }

    getTaskRunningStatus(taskNames = []) {
        const names = Array.isArray(taskNames) ? taskNames : [];
        const result = {};
        const runningMap = this.isRunning || {};
        const runningKeys = Object.keys(runningMap);

        names.forEach((name) => {
            if (!name) return;
            if (typeof runningMap[name] !== 'undefined') {
                result[name] = Boolean(runningMap[name]) || this.isProcessAlive(name);
                return;
            }
            const shortName = this.shortTaskName(name);
            const matched = runningKeys.find((key) => this.shortTaskName(key) === shortName);
            if (matched) {
                result[name] = Boolean(runningMap[matched]) || this.isProcessAlive(matched);
                return;
            }
            result[name] = this.isProcessAlive(name);
        });

        return { success: true, data: result };
    }

    // 将绑定的钱包信息添加到 envData 中（若存在 bindWalletId）
    async _attachWalletToEnvData(env, envData = {}) {
        try {
            if (env && env.bindWalletId) {
                // 延迟引入，避免循环依赖
                const { getWalletById } = require('./walletService');
                const res = await getWalletById(env.bindWalletId);
                let walletDoc = null;
                if (res && res.success && res.data) {
                    walletDoc = res.data;
                } else if (res && (res.id || res._id || res.mnemonic || res.ethAddress)) {
                    // 兼容 getWalletById 直接返回文档的情况
                    walletDoc = res;
                }
                if (walletDoc) {
                    return { ...envData, wallet: walletDoc };
                }
            }
        } catch (e) {
            console.error('[TaskService] _attachWalletToEnvData error:', e);
        }
        return envData;
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

        // 每次执行时刷新路径，避免使用旧配置
        this.chromePath = config.getChromePath().path;
        this.savePath = config.getSavePath().path;

        // syncFunction 全局限流：仅允许单实例运行，提示先结束现有任务
        if (taskName === 'syncFunction') {
            
            const hasRunningSync = Object.entries(this.isRunning || {}).some(([name, running]) => {
                console.log('check running syncFunction:', name, running);
                return running && (name === 'syncFunction' || String(name || '').endsWith('_syncFunction'));
            });
            console.log('hasRunningSync:', hasRunningSync);
            if (hasRunningSync) {
                return { success: false, code: 1003, message: 'syncFunction task is running, please terminate the existing task first' };
            }
        }

        if ((taskName === 'openWallet' || taskName === 'initWallet') && Array.isArray(taskDataFromFront?.walletIds)) {
            const walletIds = Array.from(new Set(taskDataFromFront.walletIds));
            const envIds = [];
            const walletIdsByEnvId = {};
            const uninitialized = [];
            for (const walletId of walletIds) {
                const { getWalletById } = require('./walletService');
                const res = await getWalletById(walletId);
                const wallet = res?.data || res;
                if (!wallet) {
                    return { success: false, code: 3004, message: `Wallet with ID ${walletId} not found` };
                }
                if (!wallet.bindEnvId) {
                    return { success: false, code: 3003, message: `Wallet ${wallet.name || walletId} not bound to fingerprint env` };
                }
                if (taskName === 'openWallet' && !wallet.walletInitialized) {
                    uninitialized.push({ id: wallet.id, name: wallet.name });
                    continue;
                }
                envIds.push(wallet.bindEnvId);
                walletIdsByEnvId[wallet.bindEnvId] = wallet.id;
            }
            if (taskName === 'openWallet' && uninitialized.length > 0) {
                return { success: false, code: 3011, message: 'Some wallets are not initialized', uninitialized };
            }
            taskDataFromFront = {
                ...(taskDataFromFront || {}),
                envIds,
                envsData: taskDataFromFront?.envsData || {},
                walletIdsByEnvId
            };
        }

        let ids = [];
        if (taskDataFromFront && taskDataFromFront.envIds) {
            ids = taskDataFromFront.envIds;
        }
        // 钱包直连型任务允许无 env（只要有 walletIds）
        const allowNoEnv = task.taskType === 'execByWallet';
        if ((!Array.isArray(ids) || ids.length === 0) && !allowNoEnv) {
            return { success: false, code: 1011, message: '缺少可执行的环境，请选择后重试' };
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


        const normalizeTaskConfig = (raw = {}) => {
            const knownKeys = ['default', 'envConfigs', 'walletConfigs', 'mode'];
            const flatWalletConfigs = {};
            Object.keys(raw).forEach((k) => {
                if (knownKeys.includes(k)) return;
                if (raw[k] && typeof raw[k] === 'object') {
                    flatWalletConfigs[k] = raw[k];
                }
            });
            return {
                mode: raw.mode || 'wallet',
                defaultConfig: raw.default || {},
                envConfigs: raw.envConfigs || {},
                walletConfigs: (raw.walletConfigs && Object.keys(raw.walletConfigs).length > 0) ? raw.walletConfigs : flatWalletConfigs,
            };
        };

        const resolveConfigForTarget = (taskConfig, env, envData) => {
            const cfg = normalizeTaskConfig(taskConfig || {});
            const { mode, defaultConfig, envConfigs, walletConfigs } = cfg;
            if (mode === 'env') {
                const envKey = env?.id || env?._id || env?.name;
                const override = envKey ? (envConfigs[envKey] || {}) : {};
                return { ...defaultConfig, ...override, __mode: mode };
            }
            const walletKey = envData?.wallet?.address || env?.wallet?.address || env?.bindWalletId || envData?.walletAddress;
            const override = walletKey ? (walletConfigs[walletKey] || {}) : {};
            return { ...defaultConfig, ...override, __mode: mode };
        };

        // 计算钱包扩展路径：固定为 initWallet.js 所在目录（不做判断与校验）
        const walletExtensionPath = (taskDataFromFront?.mode === 'env')
            ? null
            : path.dirname(config.getInitWalletScriptPath());

        const buildTaskContext = async (id) => {
            const envRes = await getEnvById(id);
            const env = envRes?.data;
            if (!env) {
                return null;
            }
            let envData = envsData[id] || {};
            envData = await this._attachWalletToEnvData(env, envData);
            const resolvedConfig = resolveConfigForTarget(task.config, env, envData);
            const walletIdOverride = taskDataFromFront?.walletIdsByEnvId?.[env.id || env._id || env.name];
            const taskNameBase = (task.taskName === 'openWallet' || task.taskName === 'initWallet')
                ? (walletIdOverride || env.bindWalletId || env.id || env.name)
                : (env.id || env.name);
            const taskNameForEnv = `${taskNameBase}_${task.taskName}`;
            const taskDataPayload = {
                env,
                envData,
                taskDataFromFront: { ...(taskDataFromFront || {}), config: resolvedConfig },
                chromePath: this.chromePath,
                savePath: this.savePath,
                walletExtensionPath,
            };
            return { taskNameForEnv, taskDataPayload };
        };

        const buildWalletContext = async (walletId) => {
            try {
                const { getWalletById } = require('./walletService');
                const res = await getWalletById(walletId);
                const wallet = res?.data || res;
                if (!wallet) return null;
                const envData = { wallet };
                const resolvedConfig = resolveConfigForTarget(task.config, {}, envData);
                const taskNameForWallet = `${wallet.address || wallet.id || 'wallet'}_${task.taskName}`;
                const taskDataPayload = {
                    env: null,
                    envData,
                    taskDataFromFront: { ...(taskDataFromFront || {}), config: resolvedConfig },
                    chromePath: this.chromePath,
                    savePath: this.savePath,
                    walletExtensionPath,
                };
                return { taskNameForWallet, taskDataPayload };
            } catch (e) {
                console.error('[TaskService] buildWalletContext error:', e);
                return null;
            }
        };


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
                    const id = ids[i];
                    const ctx = await buildTaskContext(id);
                    if (!ctx) continue;
                    const { taskNameForEnv, taskDataPayload } = ctx;
                    if (this.isRunning[taskNameForEnv]) {
                        continue;
                    }
                    this.runTask(taskNameForEnv, taskDataPayload, task.execPath || this.defaultExecPath, task.scriptPath, taskSuccessCallBack);
                    await this.checkCompleted(taskNameForEnv);
                }
                break;
            case 'execByAsync':
                await Promise.all(ids.map(async (id) => {
                    const ctx = await buildTaskContext(id);
                    if (!ctx) return;
                    const { taskNameForEnv, taskDataPayload } = ctx;
                    if (this.isRunning[taskNameForEnv]) {
                        return;
                    }
                    this.runTask(taskNameForEnv, taskDataPayload, task.execPath || this.defaultExecPath, task.scriptPath, taskSuccessCallBack);
                    this.checkCompleted(taskNameForEnv);
                }));
                break;
            case 'execAll':
                let taskNameAll = `${task.taskName}`;
                if (this.isRunning[taskNameAll]) {
                    return { success: false, code: 1003, message: 'Task is running' };
                }
                let envs = [];
                const configsByEnv = {};
                if (ids.length > 0) {
                    for (let i = 0; i < ids.length; i++) {
                        let id = ids[i];
                        let env = (await getEnvById(id)).data;
                        if (env) {
                            envs.push(env);
                            const key = env.id || env._id || env.name;
                            const base = envsData[key] || {};
                            envsData[key] = await this._attachWalletToEnvData(env, base);
                            configsByEnv[key] = resolveConfigForTarget(task.config, env, envsData[key]);
                        }
                    }
                }
                
                const taskDataAll = { 
                    envs, 
                    envsData, 
                    taskDataFromFront: { ...(taskDataFromFront || {}), configMode: (task.config && task.config.mode) || 'wallet', configsByEnv }, 
                    chromePath: this.chromePath, 
                    savePath: this.savePath,
                    walletExtensionPath: walletExtensionPath
                };
                this.runTask(taskNameAll, taskDataAll, task.execPath || this.defaultExecPath, task.scriptPath, taskSuccessCallBack);
                this.checkCompleted(taskNameAll);
                break;
            case 'execByWallet': {
                const walletIds = Array.isArray(taskDataFromFront?.walletIds) ? taskDataFromFront.walletIds : [];
                if (walletIds.length === 0) {
                    return { success: false, code: 1012, message: '缺少可执行的钱包，请选择后重试' };
                }
                for (let i = 0; i < walletIds.length; i++) {
                    const ctx = await buildWalletContext(walletIds[i]);
                    if (!ctx) continue;
                    const { taskNameForWallet, taskDataPayload } = ctx;
                    if (this.isRunning[taskNameForWallet]) {
                        continue;
                    }
                    this.runTask(taskNameForWallet, taskDataPayload, task.execPath || this.defaultExecPath, task.scriptPath, taskSuccessCallBack);
                    await this.checkCompleted(taskNameForWallet);
                }
                break;
            }
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
                this.webSocketService.sendToFront({
                    type: 'task_heartbeat',
                    taskName,
                    time: new Date().toLocaleString()
                });
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
                    this.taskLogMessage(`Task:${this.shortTaskName(taskName)} ${data.message}`, 0, taskName)
                );
                break;
            }
            case 'terminate_process': {
                this.webSocketService.sendToFront(
                    this.taskLogMessage(`Task:${this.shortTaskName(taskName)} terminated`, 0, taskName)
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
                    this.taskLogMessage(`Task:${this.shortTaskName(taskName)} completed`, 0, taskName)
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
            const effectiveTimeout = String(taskName || '').includes('syncFunction')
                ? Math.max(timeout, 5 * 60 * 1000)
                : timeout;
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
                    this.webSocketService.sendToFront(this.taskLogMessage(`Task:${this.shortTaskName(taskName)} use proxy:${url}`, 0, taskName));
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
            this.taskProcesses[taskName] = childProcess;
            this.webSocketService.sendToFront(this.taskLogMessage(`Task:${this.shortTaskName(taskName)} started`, 0, taskName));
            this.webSocketService.sendToFront({
                type: 'task_started',
                taskName,
                time: new Date().toLocaleString()
            });
            childProcess.stdout.on('data', (data) => {
                const str = String(data);
                console.log(`stdout: ${str}`);
                // this.webSocketService.sendToFront(
                //     this.taskLogMessage(`Task:${this.shortTaskName(taskName)} stdout: ${str}`, 0, taskName)
                // );
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
                this.webSocketService.sendToFront(this.taskLogMessage(`Task:${this.shortTaskName(taskName)} stderr: ${str}`, 0, taskName));
            });

            childProcess.on('close', (code) => {
                console.log(`child process exited with code ${code}`);
                if (this.taskProcesses && this.taskProcesses[taskName]) {
                    delete this.taskProcesses[taskName];
                }
                // 优先依据子进程 stderr 判断错误；否则依据任务内部通过 websocket 上报的 isSuccess
                try {
                    if (childHadError) {
                        const message = `Task process stderr output: ${stderrBuffer || ('exit code ' + code)}`;
                        this.webSocketService.sendToFront(this.taskLogMessage(`Task:${this.shortTaskName(taskName)} failed: ${message}`, 0, taskName));
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
                    this.webSocketService.sendToFront(this.taskLogMessage(`Task:${this.shortTaskName(taskName)} exited: ${message}`, 0, taskName));
                    finishTask(this, taskName, false, message);
                } catch (err) {
                    console.error('on close handler error:', err);
                    finishTask(this, taskName, false, `Task close handler error: ${err.message}`);
                }
            });

            this.heartBeatTimeoutId[taskName] = setInterval(() => {
                const currentTime = Date.now();
                const heartBeatThreshold = currentTime - effectiveTimeout;
                if (this.lastHeartBeatTime[taskName] < heartBeatThreshold) {
                    if (this.isProcessAlive(taskName)) {
                        // 进程仍在运行，维持运行状态，避免前端误判完成
                        this.lastHeartBeatTime[taskName] = currentTime;
                        this.webSocketService.sendToFront(
                            this.taskLogMessage(`Task:${this.shortTaskName(taskName)} heartbeat timeout but process still alive`, 0, taskName)
                        );
                        return;
                    }
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
        return this.webSocketService.checkWebSocket();
    }
}
module.exports = TaskService;
