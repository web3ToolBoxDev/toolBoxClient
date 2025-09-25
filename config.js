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
	#fingerPrintDb;
	// 内存维护所有路径
	_paths = {};
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
			this.initWalletScriptPath = '';
			this.openWalletScriptPath = '';
        

            // 初始化时加载所有路径到内存
            this._loadAllPathsFromJson();

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
			this.#fingerPrintDb = new Datastore({
				filename: path.join(cacheInfo.path, "/db/fingerPrint.db"),
				autoload: true,
			});
        }
        return Config.instance;
    }
    // 内存优先加载所有路径
    _loadAllPathsFromJson() {
        const savePathFile = path.join(this.getAssetsPath(), "savePath.json");
        if (fs.existsSync(savePathFile)) {
            try {
                this._paths = JSON.parse(fs.readFileSync(savePathFile));
            } catch (e) {
                this._paths = {};
            }
        }
    }
    _saveAllPathsToJson() {
        const savePathFile = path.join(this.getAssetsPath(), "savePath.json");
        fs.writeFileSync(savePathFile, JSON.stringify(this._paths));
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
    getWalletDb() {
		return this.#walletDb;
	}
	getTaskDb() {
		return this.#taskDb;
	}
	getFingerPrintDb() {
		return this.#fingerPrintDb;
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
	// 从指定目录加载并 upsert 任务（taskConfig.json）
	_loadTasksFromDirectory(directory) {
		try {
			const taskConfigPath = path.join(directory, 'taskConfig.json');
			if (!fs.existsSync(taskConfigPath)) {
				return { success: false, message: '未检测到 taskConfig.json，跳过任务加载' };
			}
			const raw = fs.readFileSync(taskConfigPath, 'utf-8');
			let taskArr = [];
			try {
				taskArr = JSON.parse(raw);
			} catch (e) {
				return { success: false, message: 'taskConfig.json 解析失败: ' + e.message };
			}
			if (!Array.isArray(taskArr)) {
				return { success: false, message: 'taskConfig.json 格式错误，应为数组' };
			}
			if (!this.#taskDb) {
				// 可能尚未设置 savePath，先不报错，后续可再次设置或调用
				return { success: true, message: '任务数据库未初始化，已跳过任务导入' };
			}
			// upsert 每个任务
			taskArr.forEach((task) => {
				if (task.scriptPath) {
					// 将相对路径提升为绝对路径（以所选目录为基准）
					task.scriptPath = path.join(directory, task.scriptPath);
				}
				if (task.configSchemaPath) {
					try {
						const schemaPath = path.join(directory, task.configSchemaPath);
						if (fs.existsSync(schemaPath)) {
							task.configSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
						}
					} catch (e) {
						console.warn('加载任务 configSchema 失败:', e.message);
					}
				}
				if (typeof task.defaultTask === 'undefined') {
					task.defaultTask = false;
				}
				this.#taskDb.findOne({ taskName: task.taskName }, (err, doc) => {
					if (err) {
						console.error('查询任务失败:', err);
						return;
					}
					if (!doc) {
						this.#taskDb.insert(task);
					} else {
						this.#taskDb.update({ taskName: task.taskName }, task);
					}
				});
			});
			return { success: true };
		} catch (e) {
			console.error('从目录加载任务失败:', e);
			return { success: false, message: e.message };
		}
	}
	setSavePath(savePath) {
		// 合并 path 到 savePath.json，保留其它字段
		console.log("设置保存路径:", savePath);
		this._paths.path = savePath;
		this._saveAllPathsToJson();
		this.#walletDb = new Datastore({
			filename: path.join(savePath, "db/walletData.db"),
			autoload: true,
		});
		this.#taskDb = new Datastore({
			filename: path.join(savePath, "/db/task.db"),
			autoload: true,
		});
		this.#fingerPrintDb = new Datastore({
			filename: path.join(savePath, "/db/fingerPrint.db"),
			autoload: true,
		});
		this.loadDefaultTask();
		// 如果之前已设置过钱包脚本目录/同步脚本目录，则在初始化 DB 后加载其中的任务
		if (this._paths.walletScriptDirectory) {
			this._loadTasksFromDirectory(this._paths.walletScriptDirectory);
		}
		if (this._paths.syncScriptDirectory) {
			this._loadTasksFromDirectory(this._paths.syncScriptDirectory);
		}
		return { success: true };
	}
	getSavePath() {
		// 优先从内存获取
		if (this._paths.path) {
			return { success: true, path: this._paths.path };
		}
		// 回退从文件获取
		this._loadAllPathsFromJson();
		return { success: !!this._paths.path, path: this._paths.path };
	}
	setChromePath(chromePath) {
        console.log("设置Chrome路径:", chromePath);
        this._paths.chromePath = chromePath;
        this._saveAllPathsToJson();
        return { success: true };
    }

    getChromePath() {
        if (this._paths.chromePath) {
            return { success: true, path: this._paths.chromePath };
        }
        this._loadAllPathsFromJson();
        return { success: !!this._paths.chromePath, path: this._paths.chromePath };
    }
	// 获取 initWallet/openWallet 脚本路径（优先用户设置，其次默认 assets/scripts）
	getInitWalletScriptPath() {
		const p = this._paths.initWalletScriptPath;
		if (p && fs.existsSync(p)) {
			return p;
		}
		return path.join(this.defaultScriptPath, 'initWallet.js');
	}
	getOpenWalletScriptPath() {
		const p = this._paths.openWalletScriptPath;
		if (p && fs.existsSync(p)) {
			return p;
		}
		return path.join(this.defaultScriptPath, 'openWallet.js');
	}
	// 获取钱包脚本目录：若用户已设置且有效则返回目录路径，否则返回 'default'
	getWalletScriptDirectory() {
		const dir = this._paths.walletScriptDirectory;
		if (
			dir &&
			fs.existsSync(dir) &&
			fs.existsSync(path.join(dir, 'initWallet.js')) &&
			fs.existsSync(path.join(dir, 'openWallet.js'))
		) {
			return { success: true, code: 0, directory: dir };
		}
		return { success: true, code: 0, directory: 'default' };
	}

	// 获取同步脚本目录：若用户已设置且有效则返回目录路径，否则返回 'default'
	getSyncScriptDirectory() {
		const dir = this._paths.syncScriptDirectory;
		if (dir && fs.existsSync(dir)) {
			return { success: true, code: 0, directory: dir };
		}
		return { success: true, code: 0, directory: 'default' };
	}
	setWalletScriptDirectory(directory) {
		console.log("设置钱包脚本目录:", directory);
		const initWalletPath = path.join(directory, 'initWallet.js');
		const openWalletPath = path.join(directory, 'openWallet.js');
		if (!fs.existsSync(initWalletPath) || !fs.existsSync(openWalletPath)) {
			return { success: false, code: 1, message: '目录中缺少initWallet.js或openWallet.js' };
		}
		this.initWalletScriptPath = initWalletPath;
		this.openWalletScriptPath = openWalletPath;
		this._paths.walletScriptDirectory = directory;
		this._paths.initWalletScriptPath = initWalletPath;
		this._paths.openWalletScriptPath = openWalletPath;
		this._saveAllPathsToJson();
		// 加载并 upsert 自定义目录下的任务
		const loadRes = this._loadTasksFromDirectory(directory);
		if (!loadRes.success) {
			return { success: false, code: 2, message: loadRes.message || '加载任务失败' };
		}
		return { success: true, code: 0, ...(loadRes?.message ? { message: loadRes.message } : {}) };
	}

	setSyncScriptDirectory(directory) {
		console.log("设置同步脚本目录:", directory);
		if (!fs.existsSync(directory)) {
			return { success: false, code: 1, message: '目录不存在' };
		}
		this._paths.syncScriptDirectory = directory;
		this._saveAllPathsToJson();
		// 加载并 upsert 自定义目录下的任务
		const loadRes = this._loadTasksFromDirectory(directory);
		if (!loadRes.success) {
			return { success: false, code: 2, message: loadRes.message || '加载任务失败' };
		}
		return { success: true, code: 0, ...(loadRes?.message ? { message: loadRes.message } : {}) };
	}

	resetSyncScriptDirectory() {
		console.log("重置同步脚本目录到默认");
		delete this._paths.syncScriptDirectory;
		this._saveAllPathsToJson();
		try {
			// 仅重新加载默认的 syncFunction 任务
			const defaultTaskConfig = require(path.join(this.assetsPath, "/defaultTaskConfig.json"));
			const syncTask = Array.isArray(defaultTaskConfig) ? defaultTaskConfig.find(t => t.taskName === 'syncFunction') : null;
			if (!this.#taskDb) {
				return { success: false, code: 1, message: '任务数据库未初始化' };
			}
			if (syncTask) {
				const taskObj = { ...syncTask };
				if (taskObj.scriptPath) {
					taskObj.scriptPath = path.join(this.defaultScriptPath, taskObj.scriptPath);
				}
				if (typeof taskObj.defaultTask === 'undefined') {
					taskObj.defaultTask = true;
				}
				// upsert 同名任务
				this.#taskDb.update({ taskName: taskObj.taskName }, taskObj, { upsert: true });
			} else {
				console.warn('[resetSyncScriptDirectory] defaultTaskConfig 未找到 syncFunction 配置');
			}
			return { success: true, code: 0 };
		} catch (e) {
			console.error('[resetSyncScriptDirectory] 重新加载默认 syncFunction 失败:', e);
			return { success: false, code: 2, message: e.message };
		}
	}
	
	
}
module.exports = Config;