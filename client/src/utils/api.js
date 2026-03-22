import axios from 'axios';
import { eventEmitter } from './eventEmitter';

class APIManager {
    static instance = null;
    constructor() {
        if (!APIManager.instance) {
            this.baseUrl = 'http://localhost:30001/api';
            this._lastRunningAlertAt = 0;
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

    /**
     * Extract the port number from baseUrl (e.g. 'http://localhost:30001/api' -> 30001).
     * Falls back to 30001 if parsing fails.
     */
    _getPort() {
        try {
            const url = new URL(this.baseUrl);
            return parseInt(url.port, 10) || 30001;
        } catch {
            return 30001;
        }
    }

    _resolveCurrentLanguage() {
        if (typeof window === 'undefined') {
            return 'en';
        }
        const stored = window.localStorage.getItem('appLanguage');
        const i18nStored = window.localStorage.getItem('i18nextLng');
        return stored || i18nStored || 'en';
    }

    _withLanguage(taskData) {
        const lang = this._resolveCurrentLanguage();
        if (taskData && typeof taskData === 'object') {
            return {
                ...taskData,
                language: taskData.language || lang
            };
        }
        return { language: lang };
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
        eventEmitter.emit('taskExecuted');
        eventEmitter.emit('taskStart', { taskName: 'openWallet', taskData: { envIds: ids } });
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
        eventEmitter.emit('taskExecuted');
        eventEmitter.emit('taskStart', { taskName: 'initWallet', taskData: { envIds: ids } });
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
    async getAgentTasks() {
        const res = await axios.get(`${this.baseUrl}/getAgentTasks`);
        return res.data;
    }
    async execTask(taskName,taskData = null) {
        const suppressRunningAlert = Boolean(taskData && typeof taskData === 'object' && taskData._suppressRunningAlert);
        const normalizedTaskData = (taskData && typeof taskData === 'object')
            ? { ...taskData }
            : taskData;
        if (normalizedTaskData && typeof normalizedTaskData === 'object') {
            delete normalizedTaskData._suppressRunningAlert;
        }
        try {
            if (typeof window !== 'undefined' && taskName) {
                const stored = window.localStorage.getItem('taskLogsByTask');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    const ids = Object.keys(parsed || {});
                    const isRunning = ids.some((id) => {
                        if (!parsed[id] || parsed[id].status !== 'running') return false;
                        if (id === taskName || String(id).endsWith(`_${taskName}`)) return true;
                        if (taskName === 'syncFunction' && String(id).endsWith('_syncFunction')) return true;
                        return false;
                    });
                    const isIdScopedTask = ['openChrome', 'openWallet', 'initWallet'].includes(taskName);
                    const requestedIds = Array.isArray(taskData?.envIds)
                        ? taskData.envIds
                        : (Array.isArray(taskData?.walletIds) ? taskData.walletIds : []);
                    if (isIdScopedTask && requestedIds.length) {
                        const runningIds = ids.reduce((acc, id) => {
                            if (!parsed[id] || parsed[id].status !== 'running') return acc;
                            const suffix = `_${taskName}`;
                            if (String(id).endsWith(suffix)) {
                                acc.add(String(id).slice(0, -suffix.length));
                            }
                            return acc;
                        }, new Set());
                        const overlap = requestedIds.filter((rid) => runningIds.has(String(rid)));
                        if (overlap.length) {
                            const now = Date.now();
                            if (!suppressRunningAlert && (!this._lastRunningAlertAt || now - this._lastRunningAlertAt > 2000)) {
                                alert('Task is already running');
                                this._lastRunningAlertAt = now;
                            }
                            return { success: false, code: 1003, message: 'Task is already running', runningIds: overlap };
                        }
                        // allow if different ids are running
                        const enrichedTaskData = this._withLanguage(taskData);
                        return await axios.post(`${this.baseUrl}/execTask`, { taskName: taskName,taskData:enrichedTaskData }).then(res => {
                            if (res?.data?.success !== false) {
                                eventEmitter.emit('taskExecuted');
                                eventEmitter.emit('taskStart', { taskName, taskData: enrichedTaskData });
                            }
                            return res.data;
                        });
                    }
                    if (isRunning) {
                        const now = Date.now();
                        if (!suppressRunningAlert && (!this._lastRunningAlertAt || now - this._lastRunningAlertAt > 2000)) {
                            alert('Task is already running');
                            this._lastRunningAlertAt = now;
                        }
                        return { success: false, code: 1003, message: 'Task is already running' };
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to check running tasks:', error);
        }
        const enrichedTaskData = this._withLanguage(normalizedTaskData);
        const res = await axios.post(`${this.baseUrl}/execTask`, { taskName: taskName,taskData:enrichedTaskData });
        if (res?.data?.success !== false) {
            eventEmitter.emit('taskExecuted');
            eventEmitter.emit('taskStart', { taskName, taskData: enrichedTaskData });
        }
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
    async listAiSessions(taskName) {
        const res = await axios.get(`${this.baseUrl}/listAiSessions`, { params: { taskName } });
        return res.data;
    }
    async createAiSession(taskName, name = '') {
        const res = await axios.post(`${this.baseUrl}/createAiSession`, { taskName, name });
        return res.data;
    }
    async deleteAiSession(taskName, sessionId) {
        const res = await axios.post(`${this.baseUrl}/deleteAiSession`, { taskName, sessionId });
        return res.data;
    }
    async getAiSession(taskName, sessionId = '') {
        const res = await axios.get(`${this.baseUrl}/getAiSession`, { params: { taskName, sessionId } });
        return res.data;
    }
    async sendAiMessage(taskName, message, sessionId = '') {
        const res = await axios.post(`${this.baseUrl}/sendAiMessage`, { taskName, message, sessionId });
        return res.data;
    }
    async sendAiOption(taskName, optionId, optionLabel = '', sessionId = '') {
        const res = await axios.post(`${this.baseUrl}/sendAiOption`, { taskName, optionId, optionLabel, sessionId });
        return res.data;
    }
    async updateAiSubTask(taskName, subTaskKey, status, sessionId = '') {
        const res = await axios.post(`${this.baseUrl}/updateAiSubTask`, { taskName, subTaskKey, status, sessionId });
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
        console.log('[api] checkWebSocket ->', this.baseUrl);
        const res = await axios.get(`${this.baseUrl}/checkWebSocket`);
        console.log('[api] checkWebSocket response:', res?.data);
        return res.data;
    }
    async getTaskStatus(taskNames = []) {
        const res = await axios.post(`${this.baseUrl}/getTaskStatus`, { taskNames });
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
    async deleteFingerPrintProxy(id) {
        const res = await axios.post(`${this.baseUrl}/deleteFingerPrintProxy`, { id });
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
    async runInstaller() {
        const res = await axios.post(`${this.baseUrl}/runInstaller`);
        return res.data;
    }
    async getInstallerPath() {
        const res = await axios.get(`${this.baseUrl}/getInstallerPath`);
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

    async resetWalletScriptDirectory() {
        const res = await axios.post(`${this.baseUrl}/resetWalletScriptDirectory`);
        return res.data;
    }

    async setSyncScriptDirectory(directory) {
        const res = await axios.post(`${this.baseUrl}/setSyncScriptDirectory`, { directory });
        return res.data;
    }

    async getSyncScriptDirectory() {
        const res = await axios.get(`${this.baseUrl}/getSyncScriptDirectory`);
        return res.data;
    }

    async resetSyncScriptDirectory() {
        const res = await axios.post(`${this.baseUrl}/resetSyncScriptDirectory`);
        return res.data;
    }

    async getProviderModels(provider, subProvider, apiKey) {
        const params = new URLSearchParams();
        if (provider) params.append('provider', provider);
        if (subProvider) params.append('subProvider', subProvider);
        if (apiKey) params.append('apiKey', apiKey);
        const res = await axios.get(`${this.baseUrl}/getProviderModels?${params.toString()}`);
        return res.data;
    }
    // ── stateService HTTP API ──
    async getStateSessions(agentId = 'jobSeekAgent') {
        const res = await axios.get(`${this.baseUrl}/state/sessions/${agentId}`);
        return res.data;
    }
    async setStateSavePath(savePath) {
        const res = await axios.post(`${this.baseUrl}/state/app/set`, { path: 'savePath', value: savePath });
        return res.data;
    }
    async getStateLanguage() {
        const res = await axios.get(`${this.baseUrl}/state/app/language`);
        return res.data;
    }
    async setStateLanguage(language) {
        const res = await axios.post(`${this.baseUrl}/state/app/language`, { language });
        return res.data;
    }
}
export default APIManager;
