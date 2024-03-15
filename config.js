const path = require('path');
IS_BUILD = true;

class Config {
    static instance = null;
    constructor() {
        if (!Config.instance) {
            Config.instance = this;
            this.isBuild = IS_BUILD;
            if (process.platform === "win32") {
                this.platform = "win32";
                this.assetsPath = this.isBuild ? path.resolve(__dirname, '../assets') : path.resolve(__dirname, './assets');
                this.defaultExecPath = path.join(this.assetsPath, '/node_for_win/node-v21.6.2-win/node.exe');
                this.initTaskScriptPath = path.join(this.assetsPath, '/node_for_win/initWallet.js');
                this.openWalletScriptPath = path.join(this.assetsPath, '/node_for_win/openWallet.js');
            } else if (process.platform === "darwin") {
                this.platform = "darwin";
                this.assetsPath = this.isBuild ? path.resolve(__dirname, '../assets') : path.resolve(__dirname, './assets');
                this.defaultExecPath = path.join(this.assetsPath, '/node_for_mac/node-v21.6.2-mac/bin/node');
                this.initTaskScriptPath = path.join(this.assetsPath, '/node_for_mac/initWallet.js');
                this.openWalletScriptPath = path.join(this.assetsPath, '/node_for_mac/openWallet.js');
            } else {
                console.log("当前平台不是 Windows 也不是 macOS");
            }
            
        }
        return Config.instance;
    }
    static getInstance() {
        if (!Config.instance) {
            console.log('new Config');
            Config.instance = new Config();
        }
        return Config.instance;
    }
    getIsBuild() {
        return this.isBuild;
    }
    getPlatform() {
        return this.platform;
    }
    getAssetsPath() {
        return this.assetsPath;
    }
    getDefaultExecPath() {
        return this.defaultExecPath;
    }
    getInitTaskScriptPath() {
        return this.initTaskScriptPath;
    }
    getOpenWalletScriptPath() {
        return this.openWalletScriptPath;
    }

}
module.exports = Config;