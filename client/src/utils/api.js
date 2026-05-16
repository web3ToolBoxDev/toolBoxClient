import axios from 'axios';
import { eventEmitter } from './eventEmitter';

class APIManager {
    static instance = null;
    constructor() {
        if (!APIManager.instance) {
            this.baseUrl = null;
            this._lastRunningAlertAt = 0;
            APIManager.instance = this;
        }
        return APIManager.instance;
    }

    static _resolvePort() {
        try {
            if (typeof window !== 'undefined') {
                if (window.electronAPI && typeof window.electronAPI.getBackendPort === 'function') {
                    const ipcPort = window.electronAPI.getBackendPort();
                    if (ipcPort && Number.isFinite(ipcPort)) return ipcPort;
                }
                if (window.__API_PORT__ && Number.isFinite(window.__API_PORT__)) {
                    return window.__API_PORT__;
                }
            }
        } catch (e) { /* ignore */ }
        return 30001;
    }

    _getPort() { return APIManager._resolvePort(); }

    _resolveCurrentLanguage() {
        if (typeof window === 'undefined') return 'en';
        return window.localStorage.getItem('appLanguage') || window.localStorage.getItem('i18nextLng') || 'en';
    }

    _withLanguage(taskData) {
        const lang = this._resolveCurrentLanguage();
        if (taskData && typeof taskData === 'object') {
            return { ...taskData, language: taskData.language || lang };
        }
        return { language: lang };
    }

    // Use electronAPI proxy when available, fallback to direct HTTP
    async _proxy(method, path, body) {
        if (window.electronAPI && typeof window.electronAPI.checkProxy === 'function') {
            try {
                const fn = {
                    'get-save-path': () => window.electronAPI.getSavePath(),
                    'set-save-path': () => window.electronAPI.setSavePath(body),
                    'get-chrome-path': () => window.electronAPI.getChromePath(),
                    'set-chrome-path': () => window.electronAPI.setChromePath(body),
                    'check-proxy': () => window.electronAPI.checkProxy(body),
                    'get-fingerprints': () => window.electronAPI.getFingerPrints(),
                    'generate-fingerprints': () => window.electronAPI.generateFingerPrints(body),
                    'get-fingerprint-count': () => window.electronAPI.getFingerPrintCount(),
                }[path];
                if (fn) return await fn();
            } catch (e) { /* fallback to HTTP */ }
        }
        // Fallback: direct HTTP to backend
        const port = this._getPort();
        const url = `http://localhost:${port}/api/${path}`;
        try {
            const config = { timeout: 10000, headers: { 'Content-Type': 'application/json' } };
            const res = method === 'GET' ? await axios.get(url, config)
                : method === 'DELETE' ? await axios.delete(url, config)
                : await axios.post(url, body, config);
            return res.data;
        } catch (e) {
            return { success: false, message: e.message };
        }
    }

    async createWallets(params) { return this._proxy('post', 'createWallet', params); }
    async updateWalletName(id, name) { return this._proxy('post', 'updateWalletName', { id, name }); }
    async getAllWallets() { return this._proxy('get', 'getAllWallets'); }
    async updateWallet(params) { return this._proxy('put', 'updateWallet', params); }
    async openWallets(ids) { const r = await this._proxy('post', 'openWallets', { ids }); if (r?.success !== false) { eventEmitter.emit('taskExecuted'); eventEmitter.emit('taskStart', { taskName: 'openWallet', taskData: { envIds: ids } }); } return r; }
    async deleteWallets(ids) { return this._proxy('delete', 'deleteWallets', { ids }); }
    async exportWallets(ids, directory) { return this._proxy('post', 'exportWallets', { ids, directory }); }
    async importWallets(filePath) { return this._proxy('post', 'importWallets', { filePath }); }
    async initWallets(ids) { const r = await this._proxy('post', 'initWallets', { ids }); if (r?.success !== false) { eventEmitter.emit('taskExecuted'); eventEmitter.emit('taskStart', { taskName: 'initWallet', taskData: { envIds: ids } }); } return r; }
    async importTask(taskObj) { return this._proxy('post', 'importTask', taskObj); }
    async getAllTasks(defaultTask) { return this._proxy('get', 'getAllTasks?defaultTask=' + defaultTask); }
    async getAgentTasks() { return this._proxy('get', 'getAgentTasks'); }
    async execTask(taskName, taskData = null) { const enriched = this._withLanguage(taskData); return this._proxy('post', 'execTask', { taskName, taskData: enriched }); }
    async getConfigInfo(taskName) { return this._proxy('post', 'getConfigInfo', { taskName }); }
    async setConfigInfo(taskName, config) { return this._proxy('post', 'setConfigInfo', { taskName, config }); }
    async getAgentSessions(agentName = 'job-seek') { return this._proxy('get', 'getAgentSessions/' + agentName); }
    async listAiSessions(taskName) { return this._proxy('get', 'listAiSessions?taskName=' + taskName); }
    async createAiSession(taskName, name = '') { return this._proxy('post', 'createAiSession', { taskName, name }); }
    async deleteAiSession(taskName, sessionId) { return this._proxy('post', 'deleteAiSession', { taskName, sessionId }); }
    async getAiSession(taskName, sessionId = '') { return this._proxy('get', 'getAiSession?taskName=' + taskName + '&sessionId=' + sessionId); }
    async sendAiMessage(taskName, message, sessionId = '') { return this._proxy('post', 'sendAiMessage', { taskName, message, sessionId }); }
    async sendAiOption(taskName, optionId, optionLabel = '', sessionId = '') { return this._proxy('post', 'sendAiOption', { taskName, optionId, optionLabel, sessionId }); }
    async updateAiSubTask(taskName, subTaskKey, status, sessionId = '') { return this._proxy('post', 'updateAiSubTask', { taskName, subTaskKey, status, sessionId }); }
    async deleteTask(taskNames) { return this._proxy('delete', 'deleteTask', { taskNames }); }
    async setSavePath(path) { return this._proxy('post', 'setSavePath', { path }); }
    async getSavePath() { return this._proxy('get', 'getSavePath'); }
    async getWalletScriptDirectory() { return this._proxy('get', 'getWalletScriptDirectory'); }
    async initTwitters(addresses) { return this._proxy('post', 'initTwitter', { addresses }); }
    async checkWebSocket() { return this._proxy('get', 'checkWebSocket'); }
    async checkReadiness() { return this._proxy('get', 'readiness'); }
    async getTaskStatus(taskNames = []) { return this._proxy('post', 'getTaskStatus', { taskNames }); }
    async checkProxy(params) { return this._proxy('post', 'checkProxy', params); }
    async getFingerPrintCount() { return this._proxy('get', 'getFingerPrintCount'); }
    async loadFingerPrints(filePath) { return this._proxy('post', 'loadFingerPrints', { filePath }); }
    async generateFingerPrints(counts) { return this._proxy('post', 'generateFingerPrints', { counts }); }
    async getFingerPrints() { return this._proxy('get', 'getFingerPrints'); }
    async updateFingerPrintName(id, name) { return this._proxy('post', 'updateFingerPrintName', { id, name }); }
    async clearFingerPrints() { return this._proxy('get', 'clearFingerPrints'); }
    async updateFingerPrintProxy(id, proxy) { return this._proxy('post', 'updateFingerPrintProxy', { id, proxy }); }
    async deleteFingerPrintProxy(id) { return this._proxy('post', 'deleteFingerPrintProxy', { id }); }
    async setChromePath(path) { return this._proxy('post', 'setChromePath', { path }); }
    async getChromePath() { return this._proxy('get', 'getChromePath'); }
    async runInstaller() { return this._proxy('post', 'runInstaller'); }
    async getInstallerPath() { return this._proxy('get', 'getInstallerPath'); }
    async deleteFingerPrints(ids) { return this._proxy('post', 'deleteFingerPrints', { ids }); }
    async openEnv(id, headless = true, useFingerprintChromium = false) { return this._proxy('post', 'openEnv', { id, headless, useFingerprintChromium }); }
    async bindWalletEnv(walletId, envId) { return this._proxy('post', 'bindWalletEnv', { walletId, envId }); }
    async setWalletScriptDirectory(directory) { return this._proxy('post', 'setWalletScriptDirectory', { directory }); }
    async resetWalletScriptDirectory() { return this._proxy('post', 'resetWalletScriptDirectory'); }
    async setSyncScriptDirectory(directory) { return this._proxy('post', 'setSyncScriptDirectory', { directory }); }
    async getSyncScriptDirectory() { return this._proxy('get', 'getSyncScriptDirectory'); }
    async resetSyncScriptDirectory() { return this._proxy('post', 'resetSyncScriptDirectory'); }
    async getProviderModels(provider, subProvider, apiKey) { return this._proxy('get', 'getProviderModels?provider=' + provider + '&subProvider=' + subProvider + '&apiKey=' + apiKey); }
    async getStateSessions(agentId = 'jobSeekAgent') { return this._proxy('get', 'state/sessions/' + agentId); }
    async setStateSavePath(savePath) { return this._proxy('post', 'state/app/set', { path: 'savePath', value: savePath }); }
    async getStateLanguage() { return this._proxy('get', 'state/app/language'); }
    async setStateLanguage(language) { return this._proxy('post', 'state/app/language', { language }); }
    async validateFingerprint(id) { return this._proxy('post', 'validateFingerprint', { id }); }
    async getFingerprintAudit(id) { return this._proxy('get', 'fingerprintAudit/' + id); }
    async getTLSConfig(browser = 'chrome', version = '120', platform = 'windows') { return this._proxy('get', 'tls/config?browser=' + browser + '&version=' + version + '&platform=' + platform); }
    async getJA3Signature(browser = 'chrome', version = '120') { return this._proxy('get', 'tls/ja3?browser=' + browser + '&version=' + version); }
    async checkMemoryHealth() { return this._proxy('get', 'memory/health'); }
    async storeMemory(data) { return this._proxy('post', 'memory/store', data); }
    async searchMemory(query) { return this._proxy('post', 'memory/search', query); }
    async clearMemory() { return this._proxy('delete', 'memory/clear'); }
    async checkToolsHealth() { return this._proxy('get', 'tools/health'); }
    async listTools() { return this._proxy('get', 'tools/list'); }
    async executeTool(name, params) { return this._proxy('post', 'tools/execute', { name, params }); }
}
export default APIManager;
