const path = require('path');
const Datastore = require('nedb');
const fs = require('fs'); // 加入文件系统模块
let IS_BUILD = true;

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
            this.assetsPath = this.isBuild ? path.resolve(__dirname, '../assets') : path.resolve(__dirname, './assets');
            this.defaultScriptPath = path.join(this.assetsPath, '/scripts');

            if (process.platform === "win32") {
                this.platform = "win32";
                this.defaultExecPath = path.join(this.assetsPath, '/node_for_win/node-v21.6.2-win/node.exe');
            } else if (process.platform === "darwin") {
                this.platform = "darwin";
                this.defaultExecPath = path.join(this.assetsPath, '/node_for_mac/node-v21.6.2-mac/bin/node');
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
    getDefaultScriptPath(relativePath) {
        return path.join(this.defaultScriptPath, relativePath);
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
        return path.join(this.defaultScriptPath, '/initWallet.js');
    }
    getOpenWalletScriptPath() {
        return path.join(this.defaultScriptPath, '/openWallet.js');
    }
    getWalletDb() {
		return this.#walletDb;
	}
	getTaskDb() {
		return this.#taskDb;
	}
	loadDefaultTask() {
		const defaultTaskConfig = require(path.join(this.assetsPath, "/defaultTaskConfig.json"));
		//根据taskName加载默认任务，如果不存在则插入
		const taskNames = defaultTaskConfig.map((el) => el.taskName);
		taskNames.forEach((taskName) => {
			this.#taskDb.findOne({ taskName: taskName }, (err, doc) => {
				if (err) {
					console.error("加载默认任务时出错:", err);
					return;
				}
				let taskObj = defaultTaskConfig.find((el) => el.taskName === taskName);
				if(taskObj.scriptPath){
					taskObj.scriptPath = path.join(this.defaultScriptPath, taskObj.scriptPath);
				}
				//如果不存在则插入，存在替换
				if (!doc) {
					this.#taskDb.insert(taskObj);
				} else {
					this.#taskDb.update({ taskName: taskName }, taskObj);
				}
				
			});
		});
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
		this.loadDefaultTask();
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