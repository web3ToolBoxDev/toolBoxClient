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

    
    async createWallet(params) {
        console.log('params:', params);
        const res = await axios.post(`${this.baseUrl}/createWallet`, params);
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
    async openWallet(params) {
        const res = await axios.post(`${this.baseUrl}/openWallet`, params);
        return res.data;
    }
    async deleteWallets(addresses) {
        const res = await axios.delete(`${this.baseUrl}/deleteWallets`, { data: { addresses: addresses } });
        return res.data;
    }
    async exportWallets(addresses,directory) {
        const res = await axios.post(`${this.baseUrl}/exportWallets`, { addresses: addresses,directory:directory });
        return res.data;
    }
    async importWallets(filePath) {
        const res = await axios.post(`${this.baseUrl}/importWallets`, { filePath: filePath });
        // console.log('res:', res);
        return res.data;
    }
    async initWallets(addresses) {
        const res = await axios.post(`${this.baseUrl}/initWallet`, { addresses: addresses });
        return res.data;
    }
    async importTask(taskObj) {
        const res = await axios.post(`${this.baseUrl}/importTask`, taskObj);
        return res.data;
    }
    async getAllTasks() {
        const res = await axios.get(`${this.baseUrl}/getAllTasks`);
        return res.data;
    }
    async execTask(taskName,wallets) {
        const res = await axios.post(`${this.baseUrl}/execTask`, { taskName: taskName,wallets:wallets });
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
    async initTwitters(addresses) {
        const res = await axios.post(`${this.baseUrl}/initTwitter`, { addresses: addresses });
        return res.data;
    }
    async checkWebSocket(){
        const res = await axios.get(`${this.baseUrl}/checkWebSocket`);
        return res.data;
    }

}
export default APIManager;