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
                this.initWalletScriptPath = path.join(this.assetsPath, '/scripts/initWallet.js');
                this.initTwitterScriptPath = path.join(this.assetsPath, '/scripts/initTwitter.js');
                this.initDiscordScriptPath = path.join(this.assetsPath, '/scripts/initDiscord.js');
                this.openWalletScriptPath = path.join(this.assetsPath, '/scripts/openWallet.js');
            } else if (process.platform === "darwin") {
                this.platform = "darwin";
                this.assetsPath = this.isBuild ? path.resolve(__dirname, '../assets') : path.resolve(__dirname, './assets');
                this.defaultExecPath = path.join(this.assetsPath, '/node_for_mac/node-v21.6.2-mac/bin/node');
                this.initWalletScriptPath = path.join(this.assetsPath, '/scripts/initWallet.js');
                this.initTwitterScriptPath = path.join(this.assetsPath, '/scripts/initTwitter.js');
                this.initDiscordScriptPath = path.join(this.assetsPath, '/scripts/initDiscord.js');
                this.openWalletScriptPath = path.join(this.assetsPath, '/scripts/openWallet.js');
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
    getInitWalletScriptPath() {
        return this.initWalletScriptPath;
    }
    getInitTwitterScriptPath() {
        return this.initTwitterScriptPath;
    }
    getInitDiscordScriptPath() {
        return this.initDiscordScriptPath;
    }
    getOpenWalletScriptPath() {
        return this.openWalletScriptPath;
    }

}
module.exports = Config;