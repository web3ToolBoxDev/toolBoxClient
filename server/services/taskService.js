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

const AI_SUB_TASK_KEYS = ['profile', 'search', 'match', 'resume', 'coverLetter'];
const AI_SUB_TASK_STATUSES = ['pending', 'running', 'review', 'done', 'failed'];

const genSessionId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const normalizeTaskConfig = (raw = {}) => {
    if (!raw || typeof raw !== 'object') {
        return { mode: 'wallet', defaultConfig: {}, envConfigs: {}, walletConfigs: {} };
    }
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

const resolveAiApiKey = (taskConfig = {}) => {
    const normalized = normalizeTaskConfig(taskConfig || {});
    const defaultCfg = normalized.defaultConfig || {};
    return defaultCfg.apiKey || defaultCfg.openaiApiKey || taskConfig?.apiKey || '';
};

const createDefaultAiSubTasks = () => AI_SUB_TASK_KEYS.map((key, idx) => ({
    key,
    status: idx === 0 ? 'running' : 'pending',
    updatedAt: Date.now()
}));

const isAiTaskDefinition = (task = {}) => task?.taskType === 'ai' || task?.aiEnabled === true;

const getAiAssistantReply = (subTaskKey = '') => {
    const map = {
        profile: 'Candidate profile parsed. Next step: collecting matching jobs.',
        search: 'Job search completed. Next step: requirement matching.',
        match: 'Requirement match generated. Next step: drafting resume.',
        resume: 'Resume draft prepared. Next step: drafting cover letter.',
        coverLetter: 'Cover letter draft prepared. Please review outputs before submission.'
    };
    return map[subTaskKey] || 'Task updated.';
};




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
            this.aiSessions = {};
        }
        return TaskService.instance;
    }
    static getInstance() {
        if (!TaskService.instance) {
            TaskService.instance = new TaskService();
        }
        return TaskService.instance;
    }

    _getAiRuntimeTaskName(taskName, sessionId) {
        return `${taskName}__${sessionId}`;
    }

    _parseAiRuntimeTaskName(runtimeTaskName = '') {
        const marker = '__';
        const index = String(runtimeTaskName || '').lastIndexOf(marker);
        if (index <= 0) {
            return null;
        }
        return {
            taskName: runtimeTaskName.slice(0, index),
            sessionId: runtimeTaskName.slice(index + marker.length)
        };
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
            const query = (defaultTask === undefined || defaultTask === null) ? {} : { defaultTask };
            config.getTaskDb().find(query, (err, docs) => {
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
        const allowNoEnv = task.taskType === 'execByWallet' || task.taskType === 'ai';
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

        const buildAiRuntimeContext = async () => {
            const inputRuntimeContext = (taskDataFromFront?.runtimeContext && typeof taskDataFromFront.runtimeContext === 'object')
                ? taskDataFromFront.runtimeContext
                : {};
            const mode = inputRuntimeContext.mode || taskDataFromFront?.mode || 'env';
            const rawEnvIds = Array.isArray(inputRuntimeContext.envIds)
                ? inputRuntimeContext.envIds
                : (Array.isArray(taskDataFromFront?.envIds) ? taskDataFromFront.envIds : []);
            const rawWalletIds = Array.isArray(inputRuntimeContext.walletIds)
                ? inputRuntimeContext.walletIds
                : (Array.isArray(taskDataFromFront?.walletIds) ? taskDataFromFront.walletIds : []);
            const envIdSet = new Set();
            const walletIdSet = new Set();
            const wallets = [];
            const envs = [];
            const runtimeEnvsData = {};
            const baseEnvsData = (inputRuntimeContext.envsData && typeof inputRuntimeContext.envsData === 'object')
                ? inputRuntimeContext.envsData
                : ((taskDataFromFront?.envsData && typeof taskDataFromFront.envsData === 'object') ? taskDataFromFront.envsData : {});

            rawEnvIds.forEach((id) => {
                if (!id) return;
                envIdSet.add(String(id));
            });
            rawWalletIds.forEach((id) => {
                if (!id) return;
                walletIdSet.add(String(id));
            });

            if (walletIdSet.size > 0) {
                const { getWalletById } = require('./walletService');
                for (const walletId of walletIdSet) {
                    try {
                        const res = await getWalletById(walletId);
                        const wallet = res?.data || res;
                        if (!wallet) continue;
                        wallets.push(wallet);
                        if (wallet.bindEnvId) {
                            envIdSet.add(String(wallet.bindEnvId));
                        }
                    } catch (error) {
                        console.warn('[TaskService] buildAiRuntimeContext wallet fetch failed:', walletId, error?.message || error);
                    }
                }
            }

            for (const envId of envIdSet) {
                try {
                    const envRes = await getEnvById(envId);
                    const env = envRes?.data;
                    if (!env) continue;
                    envs.push(env);
                    let mergedEnvData = baseEnvsData[envId] || {};
                    mergedEnvData = await this._attachWalletToEnvData(env, mergedEnvData);
                    runtimeEnvsData[envId] = mergedEnvData;
                } catch (error) {
                    console.warn('[TaskService] buildAiRuntimeContext env fetch failed:', envId, error?.message || error);
                }
            }

            return {
                ...inputRuntimeContext,
                mode,
                envIds: Array.from(envIdSet),
                walletIds: Array.from(walletIdSet),
                envs,
                wallets,
                envsData: runtimeEnvsData,
                walletExtensionPath: path.dirname(config.getInitWalletScriptPath()),
                chromePath: this.chromePath,
                savePath: this.savePath
            };
        };


        let startedAny = false;
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
                startedAny = true;
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
                    startedAny = true;
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
                    startedAny = true;
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
                startedAny = true;
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
                    startedAny = true;
                    await this.checkCompleted(taskNameForWallet);
                }
                break;
            }
            case 'ai': {
                const taskNameAi = `${task.taskName}`;
                if (this.isRunning[taskNameAi]) {
                    return { success: false, code: 1003, message: 'Task is running' };
                }
                const runtimeContext = await buildAiRuntimeContext();
                const taskDataAi = {
                    taskType: 'ai',
                    taskName: task.taskName,
                    aiSessionTemplate: task.aiSessionTemplate || 'default',
                    taskConfig: task.config || {},
                    taskSchema: task.configSchema || task.taskSchema || {},
                    taskDataFromFront: { ...(taskDataFromFront || {}), runtimeContext },
                    runtimeContext,
                    chromePath: this.chromePath,
                    savePath: this.savePath
                };
                this.runTask(taskNameAi, taskDataAi, task.execPath || this.defaultExecPath, task.scriptPath, taskSuccessCallBack, 10 * 60 * 1000);
                startedAny = true;
                this.checkCompleted(taskNameAi);
                break;
            }
            default:
                break;

        }
        if (!startedAny) {
            return { success: false, code: 1013, message: 'No task instance started' };
        }
        return { success: true, code: 0, message: `Task ${taskName} is being executed.` };
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
            case 'agent_state_snapshot':
            case 'agent_session_list':
            case 'agent_conversation_update':
            case 'agent_subtask_update':
            case 'agent_artifact_update':
            case 'agent_error': {
                this.webSocketService.sendToFront({
                    ...data,
                    // Use runtime task name to avoid frontend filtering mismatches
                    taskName,
                    time: new Date().toLocaleString()
                });
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

    _appendAiMessage(session, role, content) {
        if (!session.messages) {
            session.messages = [];
        }
        session.messages.push({
            id: genSessionId(),
            role,
            content,
            createdAt: Date.now()
        });
    }

    _createAiSessionRecord(taskName, name = '') {
        const now = Date.now();
        const sessionOrder = ((this.aiSessions?.[taskName]?.order || []).length + 1);
        const sessionName = String(name || '').trim() || `Session ${sessionOrder}`;
        const session = {
            taskName,
            sessionId: genSessionId(),
            name: sessionName,
            subTasks: createDefaultAiSubTasks(),
            messages: [],
            prompt: null,
            artifacts: [],
            createdAt: now,
            updatedAt: now
        };
        this._appendAiMessage(session, 'assistant', 'AI workspace initialized. Configure API Key before running generation.');
        return session;
    }

    _formatAiSessionPayload(session, task = null) {
        const aiApiKey = resolveAiApiKey(task?.config || {});
        const apiKeyConfigured = Boolean(String(aiApiKey || '').trim());
        return {
            taskName: session.taskName,
            sessionId: session.sessionId,
            name: session.name || '',
            apiKeyConfigured,
            messages: session.messages || [],
            subTasks: session.subTasks || [],
            prompt: session.prompt || null,
            artifacts: session.artifacts || [],
            updatedAt: session.updatedAt || Date.now()
        };
    }

    async _ensureAiSession(taskName, sessionId = null) {
        const task = await this.getTaskByName(taskName);
        if (!task) {
            return { success: false, code: 1002, message: 'Task does not exist' };
        }
        if (!isAiTaskDefinition(task)) {
            return { success: false, code: 1014, message: 'Task is not an AI task' };
        }

        if (!this.aiSessions[taskName]) {
            this.aiSessions[taskName] = {
                taskName,
                activeSessionId: '',
                sessions: {},
                order: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        }

        const workspace = this.aiSessions[taskName];
        let targetSessionId = String(sessionId || '').trim();
        if (!targetSessionId) {
            targetSessionId = workspace.activeSessionId || workspace.order[0] || '';
        }
        if (targetSessionId && workspace.sessions[targetSessionId]) {
            workspace.activeSessionId = targetSessionId;
            workspace.updatedAt = Date.now();
            return { success: true, task, workspace, session: workspace.sessions[targetSessionId] };
        }

        const session = this._createAiSessionRecord(taskName);
        workspace.sessions[session.sessionId] = session;
        workspace.order.push(session.sessionId);
        workspace.activeSessionId = session.sessionId;
        workspace.updatedAt = Date.now();
        return { success: true, task, workspace, session };
    }

    _advanceAiSubTask(session) {
        const runningIdx = (session.subTasks || []).findIndex((item) => item.status === 'running');
        if (runningIdx === -1) {
            return null;
        }
        session.subTasks[runningIdx] = {
            ...session.subTasks[runningIdx],
            status: 'done',
            updatedAt: Date.now()
        };
        const next = session.subTasks[runningIdx + 1];
        if (next && next.status === 'pending') {
            session.subTasks[runningIdx + 1] = {
                ...next,
                status: 'running',
                updatedAt: Date.now()
            };
        }
        return session.subTasks[runningIdx].key;
    }

    _formatAiSessionList(workspace) {
        return (workspace?.order || [])
            .map((id) => workspace.sessions[id])
            .filter(Boolean)
            .map((session) => ({
                sessionId: session.sessionId,
                name: session.name || 'Session',
                updatedAt: session.updatedAt || session.createdAt || Date.now()
            }));
    }

    async _ensureAiTaskRunning(task, sessionId) {
        const runtimeTaskName = this._getAiRuntimeTaskName(task.taskName, sessionId);
        if (this.isRunning[runtimeTaskName]) {
            return { success: true, runtimeTaskName };
        }
        await this.execTask(task.taskName, { mode: 'ai', sessionId });
        return { success: true, runtimeTaskName };
    }

    async listAiSessions(taskName) {
        const ensured = await this._ensureAiSession(taskName);
        if (!ensured.success) {
            return ensured;
        }
        const { workspace } = ensured;
        return {
            success: true,
            code: 0,
            data: {
                taskName,
                activeSessionId: workspace.activeSessionId,
                sessions: this._formatAiSessionList(workspace)
            }
        };
    }

    async createAiSession(taskName, name = '') {
        const ensured = await this._ensureAiSession(taskName);
        if (!ensured.success) {
            return ensured;
        }
        const { workspace, task } = ensured;
        const session = this._createAiSessionRecord(taskName, name);
        workspace.sessions[session.sessionId] = session;
        workspace.order.push(session.sessionId);
        workspace.activeSessionId = session.sessionId;
        workspace.updatedAt = Date.now();
        await this._ensureAiTaskRunning(task, session.sessionId);
        return {
            success: true,
            code: 0,
            data: {
                taskName,
                activeSessionId: workspace.activeSessionId,
                sessions: this._formatAiSessionList(workspace),
                current: this._formatAiSessionPayload(session, task)
            }
        };
    }

    async deleteAiSession(taskName, sessionId) {
        const ensured = await this._ensureAiSession(taskName);
        if (!ensured.success) {
            return ensured;
        }
        const { workspace } = ensured;
        const targetId = String(sessionId || '').trim();
        if (!targetId || !workspace.sessions[targetId]) {
            return { success: false, code: 1020, message: 'AI session not found' };
        }
        const runtimeTaskName = this._getAiRuntimeTaskName(taskName, targetId);
        if (this.webSocketService.getTaskSocket(runtimeTaskName)) {
            this.webSocketService.sendToTask(runtimeTaskName, JSON.stringify({ type: 'terminate_process' }));
        }
        delete workspace.sessions[targetId];
        workspace.order = (workspace.order || []).filter((id) => id !== targetId);
        if (!workspace.order.length) {
            const fallback = this._createAiSessionRecord(taskName);
            workspace.sessions[fallback.sessionId] = fallback;
            workspace.order.push(fallback.sessionId);
            workspace.activeSessionId = fallback.sessionId;
        } else if (workspace.activeSessionId === targetId) {
            workspace.activeSessionId = workspace.order[0];
        }
        workspace.updatedAt = Date.now();
        return {
            success: true,
            code: 0,
            data: {
                taskName,
                activeSessionId: workspace.activeSessionId,
                sessions: this._formatAiSessionList(workspace)
            }
        };
    }

    async getAiSession(taskName, sessionId = null) {
        const ensured = await this._ensureAiSession(taskName, sessionId);
        if (!ensured.success) {
            return ensured;
        }
        const { session, task, workspace } = ensured;
        workspace.activeSessionId = session.sessionId;
        session.updatedAt = Date.now();
        await this._ensureAiTaskRunning(task, session.sessionId);
        return { success: true, code: 0, data: this._formatAiSessionPayload(session, task) };
    }

    async sendAiMessage(taskName, message = '', sessionId = null) {
        const ensured = await this._ensureAiSession(taskName, sessionId);
        if (!ensured.success) {
            return ensured;
        }
        const { session, task } = ensured;
        const cleanMessage = String(message || '').trim();
        if (!cleanMessage) {
            return { success: false, code: 1015, message: 'Message is required' };
        }

        this._appendAiMessage(session, 'user', cleanMessage);
        const aiApiKey = resolveAiApiKey(task?.config || {});
        const apiKeyConfigured = Boolean(String(aiApiKey || '').trim());
        if (!apiKeyConfigured) {
            this._appendAiMessage(session, 'assistant', 'Please configure API Key in task config before proceeding.');
            session.updatedAt = Date.now();
            return { success: true, code: 0, data: this._formatAiSessionPayload(session, task) };
        }
        const runtimeTaskName = this._getAiRuntimeTaskName(taskName, session.sessionId);
        if (!this.webSocketService.getTaskSocket(runtimeTaskName)) {
            this._appendAiMessage(session, 'assistant', 'AI task process is not running. Please reopen AI workspace.');
            session.updatedAt = Date.now();
            return { success: false, code: 1019, message: 'AI task process is not running', data: this._formatAiSessionPayload(session, task) };
        }
        this.webSocketService.sendToTask(runtimeTaskName, JSON.stringify({
            type: 'ai_user_input',
            data: {
                message: cleanMessage
            }
        }));
        session.updatedAt = Date.now();
        return { success: true, code: 0, data: this._formatAiSessionPayload(session, task) };
    }

    async sendAiOption(taskName, optionId = '', optionLabel = '', sessionId = null) {
        const ensured = await this._ensureAiSession(taskName, sessionId);
        if (!ensured.success) {
            return ensured;
        }
        const { session, task } = ensured;
        const cleanOptionId = String(optionId || '').trim();
        if (!cleanOptionId) {
            return { success: false, code: 1018, message: 'Option id is required' };
        }
        const runtimeTaskName = this._getAiRuntimeTaskName(taskName, session.sessionId);
        if (!this.webSocketService.getTaskSocket(runtimeTaskName)) {
            this._appendAiMessage(session, 'assistant', 'AI task process is not running. Please reopen AI workspace.');
            session.updatedAt = Date.now();
            return { success: false, code: 1019, message: 'AI task process is not running', data: this._formatAiSessionPayload(session, task) };
        }
        const cleanOptionLabel = String(optionLabel || '').trim();
        const userChoiceText = cleanOptionLabel || cleanOptionId;
        this._appendAiMessage(session, 'user', `[option] ${userChoiceText}`);
        this.webSocketService.sendToTask(runtimeTaskName, JSON.stringify({
            type: 'ai_user_input',
            data: {
                selectedOption: cleanOptionId,
                selectedOptionLabel: cleanOptionLabel || cleanOptionId
            }
        }));
        session.updatedAt = Date.now();
        return { success: true, code: 0, data: this._formatAiSessionPayload(session, task) };
    }

    async updateAiSubTask(taskName, subTaskKey, status, sessionId = null) {
        const ensured = await this._ensureAiSession(taskName, sessionId);
        if (!ensured.success) {
            return ensured;
        }
        if (!AI_SUB_TASK_STATUSES.includes(status)) {
            return { success: false, code: 1016, message: 'Invalid AI sub task status' };
        }
        const { session, task } = ensured;
        const idx = (session.subTasks || []).findIndex((item) => item.key === subTaskKey);
        if (idx === -1) {
            return { success: false, code: 1017, message: 'AI sub task not found' };
        }
        session.subTasks[idx] = {
            ...session.subTasks[idx],
            status,
            updatedAt: Date.now()
        };
        session.updatedAt = Date.now();
        return { success: true, code: 0, data: this._formatAiSessionPayload(session, task) };
    }

    async checkWebSocket() {
        return this.webSocketService.checkWebSocket();
    }

    async sendAgentCommand(taskName, message) {
        const task = await this.getTaskByName(taskName);
        if (!task) {
            return { success: false, code: 1002, message: 'Task does not exist' };
        }
        if (!isAiTaskDefinition(task)) {
            return { success: false, code: 1014, message: 'Task is not an AI task' };
        }
        const socket = this.webSocketService.getTaskSocket(taskName);
        if (!socket) {
            return { success: false, code: 1019, message: 'AI task process is not running' };
        }
        this.webSocketService.sendToTask(taskName, message);
        return { success: true, code: 0 };
    }
}
module.exports = TaskService;
