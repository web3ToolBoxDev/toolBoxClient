const Datastore = require('nedb');
const path = require('path');
const WebSocketService = require('./webSocketService');
const spawn = require('child_process').spawn;

const config = require('../../config').getInstance();
const isBuild = config.getIsBuild();

const fs = require('fs');
console.log('task isBuild:',isBuild);

const assetsPath = config.getAssetsPath();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const taskDb = new Datastore({
    filename: path.join(assetsPath, '/db/task.db'),
    autoload: true
});
class TaskService {
    static instance;
    constructor() {
        if (!TaskService.instance) {
            TaskService.instance = this;
            this.webSocketService = WebSocketService.getInstance();
            console.log("WebSocketService instance:", this.webSocketService);
            this.isRunning = {};
            this.heartBeatTimeoutId = {};
            this.lastHeartBeatTime = {};
            this.isCompleted = {};
            this.defaultExecPath = config.getDefaultExecPath();
            this.initTaskScriptPath = config.getInitTaskScriptPath();
            this.openWalletScriptPath = config.getOpenWalletScriptPath();
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
    
    taskCompletedMessage(msg) {
        const dateTime = new Date().toLocaleString();
        return JSON.stringify({
            type: 'task_completed',
            time: dateTime,
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
    
    async importTask(taskObj) {
        // 检查taskName是否重复
        const task = await this.getTaskByName(taskObj.taskName);
        if (task) {
            return {success:false,message:'任务名称重复'};
        }
        return new Promise((resolve, reject) => {
            taskDb.insert(taskObj, (err, doc) => {
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
            taskDb.findOne({ taskName}, (err, doc) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(doc);
                }
            });
        });
    }
    async getAllTasks() {
        return new Promise((resolve, reject) => {
            taskDb.find({}, (err, docs) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(docs);
                }
            });
        }
        );
    }
    async execTask(taskName,wallets) {
        const task = await this.getTaskByName(taskName);
        if (!task) {
            return {success:false,message:'任务不存在'};
        }
        for(let i=0;i<wallets.length;i++){
            let wallet=wallets[i];
            let taskName = `${wallet.address}_${task.taskName}`;
            
            if(this.isRunning[taskName]){
                continue;
            }
            const taskData = {...wallet,configPath:task.configPath};
            this.runTask(taskName,taskData,task.execPath||this.defaultExecPath,task.scriptPath);
            await this.checkCompleted(taskName);
        }
    }

    async deleteTask(taskNames) {
        return new Promise((resolve, reject) => {
            taskDb.remove({ taskName: { $in: taskNames } }, { multi: true }, (err, numRemoved) => {
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
                this.webSocketService.sendToFront(this.taskLogMessage(`任务:${taskName}开始执行`));
                break;}
            case 'task_log':{
                console.log('task_log:', data.message);
                this.webSocketService.sendToFront(this.taskLogMessage(data.message));
                break;}
            case 'terminate_process':{
                this.webSocketService.sendToFront(this.taskLogMessage(`任务:${taskName}被终止`));
                break;}
            case 'task_completed':{
                this.isCompleted[taskName] = true;
                break;}
            default:
                break;
        }
    }
    async runTask(taskName,taskData,execPath,scriptPath,taskCompletedCallBack = undefined,timeout = 60000){
        this.isRunning[taskName]=true;
        let taskDataJson = JSON.stringify(taskData);
        this.lastHeartBeatTime[taskName]=Date.now();
        
        let url=this.webSocketService.createTaskWebSocket(taskName,(msg)=>{
            // console.log('收到任务进程消息',msg);
            this.processMsg(taskName,msg,taskDataJson)});
        const childProcess = spawn(execPath,[scriptPath,url]);
        childProcess.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });
        childProcess.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
            const message = `任务:${taskName}发生错误:${data}`;
            this.isRunning[taskName]=false;
            this.webSocketService.closeTaskWebSocket();

            this.webSocketService.sendToFront(this.taskLogMessage(message));
            this.isCompleted[taskName] = true;
        });
        childProcess.on('close', (code) => {
            console.log(`child process exited with code ${code}`);
            this.isRunning[taskName]=false;
            this.webSocketService.closeTaskWebSocket();
            this.isCompleted[taskName] = true;
        });
        this.heartBeatTimeoutId[taskName] = setInterval(() => {
            const currentTime = Date.now();
            const heartBeatThreshold = currentTime - timeout;
            if (this.lastHeartBeatTime[taskName] < heartBeatThreshold) {
                this.isRunning[taskName] = false;
                this.webSocketService.closeTaskWebSocket(taskName);
                this.webSocketService.sendToFront(this.taskLogMessage(`任务:${taskName}执行超时`));
                clearInterval(this.heartBeatTimeoutId[taskName]);
            } 
            if(this.isCompleted[taskName]){
                clearInterval(this.heartBeatTimeoutId[taskName]);
                if(taskCompletedCallBack){
                    taskCompletedCallBack(taskData);
                }
                this.webSocketService.sendToFront(this.taskCompletedMessage(`任务:${taskName}执行完成`));
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
                break;
            }
        }
    }
    
    async initWalletsTask(wallets,initSuccessCallBack){
        // console.log(initSuccessCallBack)
        console.log('initWalletsTask:',wallets)
        if(wallets.length===0){
            return {success:false,message:'没有钱包'};
        }
        if(!this.webSocketService){
            return {success:false,message:'WebSocketService未初始化'};
        }
        for(let i=0;i<wallets.length;i++){
            let wallet=wallets[i];
            let taskName = `initWallet_${wallet.address}`;
            if(this.isRunning[taskName]){
                continue;
            }
            this.runTask(taskName,wallet,this.defaultExecPath,this.initTaskScriptPath,initSuccessCallBack);
            await this.checkCompleted(taskName);
        }
    }
    async openWallet(wallet){
        let taskName = `openWallet_${wallet.address}`;
        this.runTask(taskName,wallet,this.defaultExecPath,this.openWalletScriptPath);
        await this.checkCompleted(taskName);
    }
    async getConfigInfo(taskName){
        const task = await this.getTaskByName(taskName);
        if (!task) {
            return {success:false,message:'任务不存在'};
        }
        const configPath = task.configPath;
        let configInfo = {};
        try{
            configInfo = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            return {success:true,configInfo};
        }catch(error){
            return {success:false,message:error.message};
        }
    }
    async setConfigInfo(taskName,config){
        const task = await this.getTaskByName(taskName);
        if (!task) {
            return {success:false,message:'任务不存在'};
        }
        const configPath = task.configPath;
        try{
            fs.writeFileSync(configPath, JSON.stringify(config));
            return {success:true};
        }catch(error){
            return {success:false,message:error.message};
        }
    }
}
module.exports = TaskService;