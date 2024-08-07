const webSocketService = require('./webSocketService').getInstance();
const spawn = require('child_process').spawn;
const {startProxy,stopProxy,checkProxy} = require('./proxyService');
const {sleep} = require('../utils');

const config = require('../../config').getInstance();
const isBuild = config.getIsBuild();

const fs = require('fs');


console.log('task isBuild:',isBuild);




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
            data:data,
            time:dateTime
        });
    }
    
    taskLogMessage(log) {
        const dateTime = new Date().toLocaleString();
        return JSON.stringify({
            type: 'task_log',
            message: log,
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
    
    taskCompletedMessage(taskName,success,msg) {
        const dateTime = new Date().toLocaleString();
        return JSON.stringify({
            type: 'task_completed',
            time: dateTime,
            taskName: taskName,
            success: success,
            message: msg
        });
    }
    
    taskErrorMessge(msg) {
        const dateTime = new Date().toLocaleString();
        return JSON.stringify({
            type: 'task_error',
            message: msg,
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
        // 检查taskName是否重复
        const task = await this.getTaskByName(taskObj.taskName);
        if (task) {
            return {success:false,message:'任务名称重复'};
        }

        if(taskObj.configSchemaPath)
            taskObj.configSchema = JSON.parse(fs.readFileSync(taskObj.configSchemaPath, 'utf-8'));
        //默认任务为false
        if(!taskObj.defaultTask){
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
            config.getTaskDb().findOne({ taskName}, (err, doc) => {
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
    shortTaskName(taskName){
        if(taskName.indexOf('_')===-1){
            return taskName;
        }
        const [address,splitTaskName] = taskName.split('_');
        const shortAddress = address.slice(0,5)+'...'+address.slice(-5);
        return `${shortAddress}_${splitTaskName}`;
    }
    async execTask(taskName,wallets,taskDataFromFront){ 
        console.log('execTask:',taskName,wallets,taskDataFromFront);
        const task = await this.getTaskByName(taskName);
        if (!task) {
            return {success:false,message:'任务不存在'};
        }
        console.log('task:',task);
        
        switch(task.taskType){
            case 'execWithoutWallet':{
                console.log('无钱包执行任务',task)
                let taskNameNew = `${task.taskName}`;
                if(this.isRunning[taskNameNew]){
                    return {success:false,message:'任务正在执行'};
                }
                const taskData = {};
                if(task.config){
                    taskData.config = task.config;
                }
                if(taskDataFromFront){
                    taskData.taskDataFromFront = taskDataFromFront;
                    let config = taskDataFromFront.config;
                    if(config && config.useProxy){
                        taskData.useProxy = true;
                        taskData.ipType = config.ipType;
                        taskData.ipHost = config.ipHost;
                        taskData.ipPort = config.ipPort;
                        taskData.ipUsername = config.ipUsername;
                        taskData.ipPassword = config.ipPassword;
                    
                    }
                    
                }
                console.log('taskNameNew:',taskNameNew);
                this.runTask(taskNameNew,taskData,task.execPath||this.defaultExecPath,task.scriptPath);
                break;
            }
            


            case 'execByOrder':
                console.log('顺序执行任务',task)
                for(let i=0;i<wallets.length;i++){
                    let wallet=wallets[i];
                    let taskName = `${wallet.address}_${task.taskName}`;
                    
                    if(this.isRunning[taskName]){
                        continue;
                    }
                    let config = {}
                    if(task.config){
                        if(task.config[wallet.address]){
                            config[wallet.address] = task.config[wallet.address];
                        }
                        config['default'] = task.config['default'];
                    }
                    const taskData = {...wallet,config,taskDataFromFront};
                    this.runTask(taskName,taskData,task.execPath||this.defaultExecPath,task.scriptPath);
                    await this.checkCompleted(taskName);
                }
                break;
            case 'execByAsync':
                for(let i=0;i<wallets.length;i++){
                    let wallet=wallets[i];
                    let taskName = `${wallet.address}_${task.taskName}`;
                    if(this.isRunning[taskName]){
                        continue;
                    }
                    let config = {}
                    if(task.config){
                        if(task.config[wallet.address]){
                            config[wallet.address] = task.config[wallet.address];
                        }
                        config['default'] = task.config['default'];
                        
                    }
                    const taskData = {...wallet,config,taskDataFromFront};
                    this.runTask(taskName,taskData,task.execPath||this.defaultExecPath,task.scriptPath);
                    this.checkCompleted(taskName);
                }
                break;
            case 'execAll':
                let taskName = `${task.taskName}`;
                if(this.isRunning[taskName]){
                    return {success:false,message:'任务正在执行'};
                }
                let config = {}
                if(task.config){
                    config = task.config;
                }
                const taskData = {wallets,config,taskDataFromFront};
                this.runTask(taskName,taskData,task.execPath||this.defaultExecPath,task.scriptPath);
                this.checkCompleted(taskName);
                break;
            default:
                break;
            
            

        }
    }

    async deleteTask(taskNames) {
        return new Promise((resolve, reject) => {
            config.getTaskDb().remove({ taskName: { $in: taskNames } }, { multi: true }, (err, numRemoved) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(numRemoved);
                }
            });
        });
    }

    

    
    processMsg(taskName,msg,taskData) {
        let data = JSON.parse(msg);
        switch (data.type) {
            case 'heart_beat':{
                this.lastHeartBeatTime[taskName] = Date.now();
                this.webSocketService.sendToTask(taskName,this.heartBeatMessage());
                break;}
            case 'request_task_data':{
                let taskMsg = this.requestTaskData(taskData);
                console.log('request_task_data:', taskMsg);
                this.webSocketService.sendToTask(taskName,taskMsg);
                break;}
            case 'task_log':{
                console.log('task_log:', data.message);
                this.webSocketService.sendToFront(this.taskLogMessage(`任务:${this.shortTaskName(taskName)} ${data.message}`));
                break;}
            case 'terminate_process':{
                this.webSocketService.sendToFront(this.taskLogMessage(`任务:${this.shortTaskName(taskName)}被终止`));
                break;}
            case 'task_completed':{
                this.isCompleted[taskName] = true;
                if(data.success){
                    this.isSuccess[taskName] = true;
                }
                this.webSocketService.sendToFront(this.taskLogMessage(`任务:${this.shortTaskName(taskName)}执行完成`));
                this.webSocketService.sendToFront(this.taskCompletedMessage(taskName,data.success,data.message));
                break;}
            default:
                break;
        }
    }
    async runTask(taskName,taskData,execPath,scriptPath,taskSuccessCallBack = undefined,timeout = 60000){
        if(taskData.useProxy && taskData.ipType && taskData.ipHost && taskData.ipPort){
            const info = await checkProxy(taskData.ipType,taskData.ipHost,taskData.ipPort,taskData.ipUsername,taskData.ipPassword);
            
            if(!info.success){
                this.webSocketService.sendToFront(this.taskLogMessage(`任务:${this.shortTaskName(taskName)}代理检测失败`));
                return;
            }
            this.isUseProxy[taskName] = true;
            const url =  await startProxy(taskName,taskData.ipType,taskData.ipHost,taskData.ipPort,taskData.ipUsername,taskData.ipPassword);
            
            taskData.ipInfo = {...info.ipInfo,proxyUrl:url};
        }
        this.isRunning[taskName]=true;
        
        this.lastHeartBeatTime[taskName]=Date.now();
        this.isCompleted[taskName] = false;
        this.isSuccess[taskName] = false;
        let taskDataJson = JSON.stringify(taskData);
        
        let url=this.webSocketService.createTaskWebSocket(taskName,(msg)=>{
            // console.log('收到任务进程消息',msg);
            this.processMsg(taskName,msg,taskDataJson)});
        const childProcess = spawn(execPath,[scriptPath,url]);
        this.webSocketService.sendToFront(this.taskLogMessage(`任务:${this.shortTaskName(taskName)}开始执行`));
        childProcess.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });
        childProcess.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
            const message = `任务:${this.shortTaskName(taskName)}发生错误:${data}`;
            this.isRunning[taskName]=false;
            this.webSocketService.closeTaskWebSocket();

            this.webSocketService.sendToFront(this.taskLogMessage(message));
            this.isCompleted[taskName] = true;
            this.isRunning[taskName] = false;
        });
        childProcess.on('close', (code) => {
            console.log(`child process exited with code ${code}`);
            this.isRunning[taskName]=false;
            this.webSocketService.closeTaskWebSocket();
            this.isCompleted[taskName] = true;
            this.isRunning[taskName] = false;
        });
        this.heartBeatTimeoutId[taskName] = setInterval(() => {
            const currentTime = Date.now();
            const heartBeatThreshold = currentTime - timeout;
            if (this.lastHeartBeatTime[taskName] < heartBeatThreshold) {
                clearInterval(this.heartBeatTimeoutId[taskName]);
                this.isRunning[taskName] = false;
                this.webSocketService.closeTaskWebSocket(taskName);
                this.webSocketService.sendToFront(this.taskLogMessage(`任务:${this.shortTaskName(taskName)}执行超时`));
                this.isCompleted[taskName] = true;
                this.webSocketService.sendToFront(this.taskCompletedMessage(taskName,false,{type:'timeout',message:'任务执行超时'}));
                this.isRunning[taskName] = false;
                
                return;
            } 
            if(this.isCompleted[taskName]){
                clearInterval(this.heartBeatTimeoutId[taskName]);
                if(taskSuccessCallBack){
                    if(this.isSuccess[taskName]){
                        taskSuccessCallBack(taskData);
                    }
                }
                this.isRunning[taskName] = false;
                this.webSocketService.closeTaskWebSocket(taskName);

            }
        }, 1000);
    }
    async checkCompleted(taskName){
        while(true){
            await sleep(1000);
            if(!this.isRunning[taskName] && this.isCompleted[taskName]){
                this.isCompleted[taskName] = false;
                if(this.isUseProxy[taskName]){
                    stopProxy(taskName);
                    delete this.isUseProxy[taskName];
                }
                break;
            }
        }
    }
    
    async initWalletsTask(wallets,initSuccessCallBack){
        // console.log(initSuccessCallBack)
        console.log('initWalletsTask:',wallets)
        console.log('wsFront:',this.webSocketService.wsFrontServer);
        if(wallets.length===0){
            return {success:false,message:'没有钱包'};
        }
        if(!this.webSocketService){
            return {success:false,message:'WebSocketService未初始化'};
        }
        for(let i=0;i<wallets.length;i++){
            let wallet=wallets[i];
            let taskName = `${wallet.address}_initWallet`;
            if(this.isRunning[taskName]){
                continue;
            }
            this.runTask(taskName,wallet,this.defaultExecPath,this.initWalletScriptPath,initSuccessCallBack);
            await this.checkCompleted(taskName);
        }
    }
    async openWallet(wallet){
        let taskName = `${wallet.address}_打开`;
        console.log('wsFront',this.webSocketService.wsFrontServer)
        if(this.isRunning[taskName]){
            return {success:false,message:'任务正在执行'};
        }
        this.runTask(taskName,wallet,this.defaultExecPath,this.openWalletScriptPath);
        this.checkCompleted(taskName);
        return {success:true,message:'任务已执行，请在任务信息查看任务信息'};
    }
    
    async getConfigInfo(taskName){
        const task = await this.getTaskByName(taskName);
        if (!task) {
            return {success:false,message:'任务不存在'};
        }
        try{
            return {success:true,config:task.config};
        }catch(error){
            return {success:false,message:error.message};
        }
    }
    async setConfigInfo(taskName,taskConfig){
        const task = await this.getTaskByName(taskName);
        if (!task) {
            return {success:false,message:'任务不存在'};
        }
       
        try{
            //更新task配置信息
            task.config = taskConfig;
            config.getTaskDb().update({taskName:taskName},task,{returnUpdatedDocs:true});
            return {success:true};
        }catch(error){
            return {success:false,message:error.message};
        }
    }
    async checkWebSocket(){
        this.webSocketService.checkWebSocket()
    }
}
module.exports = TaskService;
