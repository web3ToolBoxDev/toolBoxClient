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
	getConfigDir() {
		const userDataDir = process.env.APP_USER_DATA;
		if (userDataDir) {
			return userDataDir;
		}
		return this.getAssetsPath();
	}
	_loadAllPathsFromJson() {
		const configDir = this.getConfigDir();
		const savePathFile = path.join(configDir, "savePath.json");
		const legacySavePathFile = path.join(this.getAssetsPath(), "savePath.json");

		if (!fs.existsSync(configDir)) {
			try {
				fs.mkdirSync(configDir, { recursive: true });
			} catch (e) {
				// fallback to assets path if userData dir creation fails
			}
		}

		if (fs.existsSync(savePathFile)) {
			try {
				this._paths = JSON.parse(fs.readFileSync(savePathFile));
				return;
			} catch (e) {
				this._paths = {};
			}
		}

		if (fs.existsSync(legacySavePathFile)) {
			try {
				this._paths = JSON.parse(fs.readFileSync(legacySavePathFile));
				// migrate legacy config to userData dir
				try {
					fs.writeFileSync(savePathFile, JSON.stringify(this._paths));
				} catch (e) {
					// ignore migration failures
				}
			} catch (e) {
				this._paths = {};
			}
		}
	}
	_saveAllPathsToJson() {
		const configDir = this.getConfigDir();
		if (!fs.existsSync(configDir)) {
			fs.mkdirSync(configDir, { recursive: true });
		}
		const savePathFile = path.join(configDir, "savePath.json");
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
				if (taskObj.scriptPath && !path.isAbsolute(taskObj.scriptPath)) {
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
	async _loadTasksFromDirectory(directory) {
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

			const normalizeTask = (task) => {
				const cloned = { ...task };
				if (cloned.scriptPath && !path.isAbsolute(cloned.scriptPath)) {
					cloned.scriptPath = path.join(directory, cloned.scriptPath);
				}
				if (!cloned.configSchema && cloned.taskSchema) {
					cloned.configSchema = cloned.taskSchema;
				}
				if (typeof cloned.defaultTask === 'undefined') {
					cloned.defaultTask = false;
				}
				return cloned;
			};

			const isValidTask = (task) => {
				return task && typeof task === 'object' && typeof task.taskName === 'string' && typeof task.scriptPath === 'string';
			};

			const validTasks = taskArr.filter(isValidTask).map(normalizeTask);
			const results = await Promise.all(validTasks.map((task) => new Promise((resolve) => {
				this.#taskDb.findOne({ taskName: task.taskName }, (err, doc) => {
					if (err) {
						console.error('查询任务失败:', err);
						return resolve({ task: task.taskName, success: false, message: err.message });
					}
					if (!doc) {
						this.#taskDb.insert(task, (insertErr) => {
							if (insertErr) {
								console.error('插入任务失败:', insertErr);
								return resolve({ task: task.taskName, success: false, message: insertErr.message });
							}
							return resolve({ task: task.taskName, success: true });
						});
					} else {
						const mergedTask = { ...doc, ...task };
						if (typeof task.config === 'undefined' && typeof doc.config !== 'undefined') {
							mergedTask.config = doc.config;
						}
						if (typeof task.configSchema === 'undefined' && typeof doc.configSchema !== 'undefined') {
							mergedTask.configSchema = doc.configSchema;
						}
						this.#taskDb.update({ taskName: task.taskName }, mergedTask, {}, (updateErr) => {
							if (updateErr) {
								console.error('更新任务失败:', updateErr);
								return resolve({ task: task.taskName, success: false, message: updateErr.message });
							}
							return resolve({ task: task.taskName, success: true });
						});
					}
				});
			}))); 

			const failed = results.filter(item => !item.success);
			if (failed.length > 0) {
				const reason = failed.map(f => `${f.task}:${f.message || 'unknown'}`).join('; ');
				return { success: false, message: `部分任务导入失败: ${reason}` };
			}
			return { success: true, message: `已加载 ${validTasks.length} 个任务` };
		} catch (e) {
			console.error('从目录加载任务失败:', e);
			return { success: false, message: e.message };
		}
	}

	// 对外公开目录加载方法
	async loadTasksFromDirectory(directory) {
		return this._loadTasksFromDirectory(directory);
	}
	async setSavePath(savePath) {
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
			await this._loadTasksFromDirectory(this._paths.walletScriptDirectory);
		}
		if (this._paths.syncScriptDirectory) {
			await this._loadTasksFromDirectory(this._paths.syncScriptDirectory);
		}
		return await this.refreshData();
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
	async setWalletScriptDirectory(directory) {
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
		const loadRes = await this._loadTasksFromDirectory(directory);
		const ignoreMissingTaskConfig =
			loadRes && !loadRes.success && String(loadRes.message || '').includes('未检测到 taskConfig.json');
		if (!loadRes.success && !ignoreMissingTaskConfig) {
			return { success: false, code: 2, message: loadRes.message || '加载任务失败' };
		}
		// 确保 initWallet/openWallet 指向新目录脚本（即使没有 taskConfig.json）
		try {
			if (this.#taskDb) {
				const defaultTaskConfig = require(path.join(this.assetsPath, '/defaultTaskConfig.json'));
				const taskMap = {
					initWallet: initWalletPath,
					openWallet: openWalletPath,
				};
				Object.entries(taskMap).forEach(([taskName, scriptPath]) => {
					const base = Array.isArray(defaultTaskConfig)
						? defaultTaskConfig.find((t) => t.taskName === taskName)
						: null;
					const taskObj = {
						...(base || { taskName, taskType: 'execByOrder', defaultTask: true }),
						scriptPath,
					};
					if (typeof taskObj.defaultTask === 'undefined') {
						taskObj.defaultTask = true;
					}
					this.#taskDb.update({ taskName }, taskObj, { upsert: true });
				});
			}
		} catch (e) {
			console.error('[setWalletScriptDirectory] update task paths failed:', e);
		}
		return {
			success: true,
			code: 0,
			...(loadRes?.message ? { message: loadRes.message } : {})
		};
	}

	resetWalletScriptDirectory() {
		console.log("重置钱包脚本目录到默认");
		delete this._paths.walletScriptDirectory;
		delete this._paths.initWalletScriptPath;
		delete this._paths.openWalletScriptPath;
		this._saveAllPathsToJson();
		try {
			const defaultTaskConfig = require(path.join(this.assetsPath, "/defaultTaskConfig.json"));
			if (!this.#taskDb) {
				return { success: false, code: 1, message: '任务数据库未初始化' };
			}
			const tasks = Array.isArray(defaultTaskConfig) ? defaultTaskConfig : [];
			['initWallet', 'openWallet'].forEach((taskName) => {
				const base = tasks.find((t) => t.taskName === taskName);
				if (!base) return;
				const taskObj = { ...base };
				if (taskObj.scriptPath && !path.isAbsolute(taskObj.scriptPath)) {
					taskObj.scriptPath = path.join(this.defaultScriptPath, taskObj.scriptPath);
				}
				if (typeof taskObj.defaultTask === 'undefined') {
					taskObj.defaultTask = true;
				}
				this.#taskDb.update({ taskName: taskObj.taskName }, taskObj, { upsert: true });
			});
			return { success: true, code: 0 };
		} catch (e) {
			console.error('[resetWalletScriptDirectory] failed:', e);
			return { success: false, code: 2, message: e.message };
		}
	}

	async setSyncScriptDirectory(directory) {
		console.log("设置同步脚本目录:", directory);
		if (!fs.existsSync(directory)) {
			return { success: false, code: 1, message: '目录不存在' };
		}
		this._paths.syncScriptDirectory = directory;
		this._saveAllPathsToJson();
		// 加载并 upsert 自定义目录下的任务
		const loadRes = await this._loadTasksFromDirectory(directory);
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
				if (taskObj.scriptPath && !path.isAbsolute(taskObj.scriptPath)) {
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

	// 重新加载保存路径下的 DB 数据（用于二次安装后的同步）
	async refreshData() {
		try {
			const savePathRes = this.getSavePath();
			const savePath = savePathRes?.path;
			if (!savePath) {
				return { success: false, code: 5001, message: 'Save path not configured' };
			}

			const dbDir = path.join(savePath, 'db');
			const hasWalletDb = fs.existsSync(path.join(dbDir, 'walletData.db'));
			const hasTaskDb = fs.existsSync(path.join(dbDir, 'task.db'));
			const hasFingerPrintDb = fs.existsSync(path.join(dbDir, 'fingerPrint.db'));

			let wallets = [];
			let tasks = [];
			let fingerprints = {};

			if (hasWalletDb) {
				const walletService = require('./server/services/walletService');
				await walletService.reinitializeWalletDatabase();
				try {
					const walletDocs = await walletService.getAllWallets();
					wallets = Array.isArray(walletDocs) ? walletDocs : [];
				} catch (e) {
					wallets = [];
				}
			}

			if (hasFingerPrintDb) {
				const fingerPrintService = require('./server/services/fingerPrintService');
				await fingerPrintService.reinitializeDatabase();
				try {
					const fpRes = await fingerPrintService.getFingerPrints();
					if (fpRes && fpRes.success && fpRes.data) {
						fingerprints = fpRes.data;
					}
				} catch (e) {
					fingerprints = {};
				}
			}

			if (hasTaskDb) {
				const taskService = require('./server/services/taskService').getInstance();
				try {
					tasks = await taskService.getAllTasks(false);
				} catch (e) {
					tasks = [];
				}
			}

			return {
				success: true,
				hasDb: { wallet: hasWalletDb, task: hasTaskDb, fingerprint: hasFingerPrintDb },
				data: { wallets, tasks, fingerprints }
			};
		} catch (e) {
			return { success: false, code: 5002, message: e.message || 'Refresh data failed' };
		}
	}
	
	
}
module.exports = Config;