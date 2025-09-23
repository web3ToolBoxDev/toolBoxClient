import axios from 'axios';

class APIManager {
    static instance = null;
    constructor() {
        if (!APIManager.instance) {
            this.baseUrl = 'http://localhost:30001/api';
            APIManager.instance = this;
        }
        return APIManager.instance;
    }
    static getInstance() {
        if (!APIManager.instance) {
            APIManager.instance = new APIManager();
        }
        return APIManager.instance;
    }

    
    async createWallets(params) {
        console.log('params:', params);
        const res = await axios.post(`${this.baseUrl}/createWallet`, params);
        return res.data;
    }
    async updateWalletName(id, name) {
        const res = await axios.post(`${this.baseUrl}/updateWalletName`, { id, name });
        return res.data;
    }
    async getAllWallets() {
        const res = await axios.get(`${this.baseUrl}/getAllWallets`);
        return res.data;
    }
    async updateWallet(params) {
        const res = await axios.put(`${this.baseUrl}/updateWallet`, params);
        return res.data;
    }
    async openWallets(ids) {
        const res = await axios.post(`${this.baseUrl}/openWallets`, { ids: ids });
        return res.data;
    }
    async deleteWallets(ids) {
        const res = await axios.delete(`${this.baseUrl}/deleteWallets`, { data:{ids} });
        return res.data;
    }
    async exportWallets(ids,directory) {
        const res = await axios.post(`${this.baseUrl}/exportWallets`, { ids,directory });
        return res.data;
    }
    async importWallets(filePath) {
        const res = await axios.post(`${this.baseUrl}/importWallets`, { filePath: filePath });
        // console.log('res:', res);
        return res.data;
    }
    async initWallets(ids) {
        const res = await axios.post(`${this.baseUrl}/initWallets`, { ids: ids });
        return res.data;
    }
    async importTask(taskObj) {
        const res = await axios.post(`${this.baseUrl}/importTask`, taskObj);
        return res.data;
    }
    async getAllTasks(defaultTask) {
        const res = await axios.get(`${this.baseUrl}/getAllTasks?defaultTask=${defaultTask}`);
        return res.data;
    }
    async execTask(taskName,taskData = null) {
        const res = await axios.post(`${this.baseUrl}/execTask`, { taskName: taskName,taskData:taskData });
        return res.data;
    }
    async getConfigInfo(taskName) {
        const res = await axios.post(`${this.baseUrl}/getConfigInfo`, { taskName: taskName });
        return res.data;
    }
    async setConfigInfo(taskName,config) {
        const res = await axios.post(`${this.baseUrl}/setConfigInfo`, { taskName: taskName,config:config });
        return res.data;
    }
    async deleteTask(taskNames) {
        const res = await axios.delete(`${this.baseUrl}/deleteTask`, { data: { taskNames: taskNames } });
        return res.data;
    }
    async setSavePath(path) {
        const res = await axios.post(`${this.baseUrl}/setSavePath`, { path: path });
        return res.data;
    }
    async getSavePath() {
        const res = await axios.get(`${this.baseUrl}/getSavePath`);
        return res.data;
    }
    async getWalletScriptDirectory() {
        const res = await axios.get(`${this.baseUrl}/getWalletScriptDirectory`);
        return res.data;
    }
    async initTwitters(addresses) {
        const res = await axios.post(`${this.baseUrl}/initTwitter`, { addresses: addresses });
        return res.data;
    }
    async checkWebSocket(){
        const res = await axios.get(`${this.baseUrl}/checkWebSocket`);
        return res.data;
    }
    async checkProxy(params){
        
        const res = await axios.post(`${this.baseUrl}/checkProxy`, params);
        return res.data;
        
    }
    //获取指纹信息数量
    async getFingerPrintCount(){
        const res = await axios.get(`${this.baseUrl}/getFingerPrintCount`);
        return res.data
    }
    //导入指纹excel
    async loadFingerPrints(filePath){
        const res = await axios.post(`${this.baseUrl}/loadFingerPrints`, { filePath: filePath });
        return res.data;
    }
    //生成指纹数据
    async generateFingerPrints(counts){
        const res = await axios.post(`${this.baseUrl}/generateFingerPrints`, { counts: counts });
        return res.data;
    }
    //获取指纹信息
    async getFingerPrints(){
        const res = await axios.get(`${this.baseUrl}/getFingerPrints`);
        return res.data;
    }
    //获取执行进度
    async getFingerPrintProgress(){
        const res = await axios.get(`${this.baseUrl}/getFingerPrintProgress`);
        console.log('res:', res);
        return res.data;
    }
    //更新指纹环境名称
    async updateFingerPrintName(id, name) {
        const res = await axios.post(`${this.baseUrl}/updateFingerPrintName`, { id, name });
        return res.data;
    }
    //清空指纹数据
    async clearFingerPrints(){
        const res = await axios.get(`${this.baseUrl}/clearFingerPrints`);
        return res.data;
    }
    async updateFingerPrintProxy(id, proxy) {
        const res = await axios.post(`${this.baseUrl}/updateFingerPrintProxy`, { id, proxy });
        return res.data;
    }
    async setChromePath(path) {
        const res = await axios.post(`${this.baseUrl}/setChromePath`, { path });
        return res.data;
    }
    async getChromePath() {
        const res = await axios.get(`${this.baseUrl}/getChromePath`);
        return res.data;
    }
    //删除指纹环境
    async deleteFingerPrints(ids) {
        const res = await axios.post(`${this.baseUrl}/deleteFingerPrints`, { ids });
        return res.data;
    }
    async openEnv(id) {
        const res = await axios.post(`${this.baseUrl}/openEnv`, { id });
        return res.data;
    }
    async bindWalletEnv(walletId, envId) {
        const res = await axios.post(`${this.baseUrl}/bindWalletEnv`, { walletId, envId });
        return res.data;
    }

    async setWalletScriptDirectory(directory) {
        const res = await axios.post(`${this.baseUrl}/setWalletScriptDirectory`, { directory });
        return res.data;
    }
}
export default APIManager;