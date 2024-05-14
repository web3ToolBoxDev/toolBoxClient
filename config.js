const path = require('path');
const Datastore = require('nedb');
const fs = require('fs'); // 加入文件系统模块
let IS_BUILD = true;
// 方便调试: IS_BUILD=false yarn dev
if (process.env["IS_BUILD"]?.toLowerCase() === "false") {
	IS_BUILD = false;
}

class Config {
    static instance = null;
    #walletDb;
	#taskDb;
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
            this.ip2LocationDbPath = path.join(this.assetsPath, '/ip2location/IP2LOCATION-LITE-DB11.BIN');

            let cacheInfo = this.getSavePath();
			// getSavePath().then(el=>{
			if (!cacheInfo.path) {
				return;
			}
			this.#walletDb = new Datastore({
				filename: path.join(cacheInfo.path, "db/walletData.db"),
				autoload: true,
			});

			this.#taskDb = new Datastore({
				filename: path.join(cacheInfo.path, "/db/task.db"),
				autoload: true,
			});
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
    getIp2LocationDbPath() {
        return this.ip2LocationDbPath;
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
    getWalletDb() {
		return this.#walletDb;
	}
	getTaskDb() {
		return this.#taskDb;
	}
	setSavePath(savePath) {
		//使用将path写入assets文件夹内
		console.log("设置保存路径:", savePath);
		this.#walletDb = new Datastore({
			filename: path.join(savePath, "db/walletData.db"),
			autoload: true,
		});
		this.#taskDb = new Datastore({
			filename: path.join(savePath, "/db/task.db"),
			autoload: true,
		});
		const pathJson = JSON.stringify({ path: savePath });
		try {
			fs.writeFileSync(
				path.join(this.getAssetsPath(), "savePath.json"),
				pathJson
			);
			return { success: true };
		} catch (error) {
			console.error("设置保存路径时出错:", error);
			return { success: false, error: error };
		}
	}
	getSavePath() {
		//使用将path写入assets文件夹内
		try {
			const pathJson = fs.readFileSync(
				path.join(this.getAssetsPath(), "savePath.json")
			);
			const pathObj = JSON.parse(pathJson);
			return { success: true, path: pathObj.path };
		} catch (error) {
			console.error("获取保存路径时出错:", error);
			return { success: false, error: error };
		}
	}
}
module.exports = Config;