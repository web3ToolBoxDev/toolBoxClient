const config = require('../../config').getInstance();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const util = require('util');
const { checkProxy } = require('./proxyService');
// const { pro } = require('ccxt');


const fpDataPath = path.join(config.getAssetsPath(), 'fpData.json');
let fpData = {};
//检查是否存在fpData.json文件，如果存在则加载
if (fs.existsSync(fpDataPath)) {
    fpData = JSON.parse(fs.readFileSync(fpDataPath));
} else {
    const fpDataJson = JSON.stringify(fpData);
    fs.writeFileSync(fpDataPath, fpDataJson);
}

// envData 以 {id: value} 形式存在内存
const envData = {};

// 启动时自动加载数据库到 envData
(async function loadEnvDataOnStart() {
    try {
        const db = config.getFingerPrintDb();
        const util = require('util');
        const findAsync = util.promisify(db.find).bind(db);
        const fingerprints = await findAsync({});
        if (Array.isArray(fingerprints)) {
            fingerprints.forEach(fp => {
                envData[fp.id || fp._id] = fp;
            });
            console.log(`[envData] Loaded ${Object.keys(envData).length} fingerprints into memory.`);
        }
    } catch (e) {
        console.error('[envData] Failed to load fingerprints on start:', e);
    }
})();

async function loadFingerPrints(filePath) {
    try {
        const data = JSON.parse(fs.readFileSync(filePath));
        fpData = data;
        const requiredKeys = [
            'userdata',
            'matchedFingerprintList',
            'languageFingerprintList',
            'screenFingerprintList'
        ];
        for (const key of requiredKeys) {
            if (!data.hasOwnProperty(key)) {
                return { success: false, message: `loadFingerPrints failed: Missing key ${key}` };
            }
        }


        const fpDataJson = JSON.stringify(fpData);
        fs.writeFileSync(fpDataPath, fpDataJson);
        return { success: true, code: 0, message: 'loadFingerPrints success' };
    } catch (e) {
        console.error(e);
        return { success: false, code: 2001, message: 'loadFingerPrints failed: ' + e.message };
    }
}

async function getFingerPrintCount() {
    try {
        if (!fpData || Object.keys(fpData).length === 0) {
            return { success: false, code: 2002, message: 'No fingerprint data available' };
        }
        const count = Math.max(
            fpData.matchedFingerprintList.length,
            fpData.languageFingerprintList.length,
            fpData.screenFingerprintList.length
        );
        return { success: true, code: 0, message: count };
    } catch (error) {
        console.error('failed to get fingerprint count:', error);
        return { success: false, code: 2003, message: 'failed to get fingerprint count' };
    }
}

async function generateRandomFingerPrint(counts) {
    try {
        counts = parseInt(counts, 10);
        if (isNaN(counts) || counts <= 0) {
            return { success: false, code: 2004, message: 'Invalid counts parameter' };
        }
    }catch (error) {
        console.error('Invalid counts parameter:', error);
        return { success: false, code: 2004, message: 'Invalid counts parameter' };
    }

    // 校验基础数据
    if (!fpData.userdata || !Array.isArray(fpData.userdata.fontsFamily) || fpData.userdata.fontsFamily.length === 0) {
        return { success: false, message: 'fontsFamily missing' };
    }
    if (!Array.isArray(fpData.matchedFingerprintList) || fpData.matchedFingerprintList.length === 0) {
        return { success: false, message: 'matchedFingerprintList missing' };
    }
    if (!Array.isArray(fpData.languageFingerprintList) || fpData.languageFingerprintList.length === 0) {
        return { success: false, message: 'languageFingerprintList missing' };
    }
    if (!Array.isArray(fpData.screenFingerprintList) || fpData.screenFingerprintList.length === 0) {
        return { success: false, message: 'screenFingerprintList missing' };
    }

    const randomIndex = (length) => Math.floor(Math.random() * length);
    const random1 = () => Math.floor(Math.random() * 1000) / 1000;

    for (let i = 0; i < counts; i++) {
        const envId = uuidv4();
        const matchedIdex = randomIndex(fpData.matchedFingerprintList.length);
        const languageIndex = randomIndex(fpData.languageFingerprintList.length);
        const screenIndex = randomIndex(fpData.screenFingerprintList.length);
        const fontsRemoveNum = Math.floor(Math.random() * 10) + 1;
        const removeFonts = [];
        for (let j = 0; j < fontsRemoveNum; j++) {
            const fontsRemoveIndex = randomIndex(fpData.userdata.fontsFamily.length);
            removeFonts.push(fpData.userdata.fontsFamily[fontsRemoveIndex]);
        }

        const fingerprint = {
            id: envId,
            name: envId,
            user_agent: fpData.matchedFingerprintList[matchedIdex].userAgentFingerprint,
            clientHint: fpData.matchedFingerprintList[matchedIdex].clientHintFingerprint,
            webgl: fpData.matchedFingerprintList[matchedIdex].webglFingerprint,
            language_js: fpData.languageFingerprintList[languageIndex].jsLanguage,
            language_http: fpData.languageFingerprintList[languageIndex].httpLanguage,
            screen: fpData.screenFingerprintList[screenIndex],
            canvas: { toDataUrl: random1() },
            hardware: fpData.userdata.hardware || {
                memory: 8,
                concurrency: 8
            },
            fonts_remove: removeFonts.join(','),
            createdAt: Date.now(), // 新增创建时间戳
        };

        config.getFingerPrintDb().insert(fingerprint, (err, newDoc) => {
            if (err) {
                console.error('Error inserting fingerprint into database:', err);
            } else {
                envData[fingerprint.id] = fingerprint; // 写入内存
            }
        });
    }

    return { success: true, code: 0, message: 'Fingerprints generated successfully' };
}

async function getFingerPrints() {
    try {
        // 优先返回内存 envData
        if (Object.keys(envData).length > 0) {
            return { success: true, code: 0, data: { ...envData } };
        }
        const db = config.getFingerPrintDb();
        const findAsync = util.promisify(db.find).bind(db);
        const fingerprints = await findAsync({});
        if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
            return { success: false, code: 2005, message: 'No fingerprints found' };
        }
        
        fingerprints.forEach(fp => {
            envData[fp.id || fp._id] = fp; // 同步到内存
        });
        return { success: true, code: 0, data: { ...envData } };
    } catch (error) {
        console.error('Error fetching fingerprints:', error);
        return { success: false, code: 2006, message: 'Error fetching fingerprints' };
    }
}

async function clearFingerPrints() {
    fpData = {
        userdata: {},
        matchedFingerprintList: [],
        languageFingerprintList: [],
        screenFingerprintList: [],
    };
    const fpDataJson = JSON.stringify(fpData);
    fs.writeFileSync(fpDataPath, fpDataJson);
    return { success: true, code: 0, message: 'Fingerprints cleared successfully' };
}

async function updateFingerPrintName(id, newName) {
    if (!id || !newName) {
        return { success: false, code: 2007, message: 'Invalid parameters' };
    }
    const db = config.getFingerPrintDb();
    const updateAsync = util.promisify(db.update).bind(db);
    try {
        const num = await updateAsync({ id }, { $set: { name: newName } }, {});
        if (num > 0) {
            if (envData[id]) envData[id].name = newName; // 内存同步
            return { success: true, code: 0, message: 'Update successful' };
        } else {
            return { success: false, code: 2008, message: 'Environment not found' };
        }
    } catch (e) {
        return { success: false, code: 2009, message: e.message };
    }
}

async function deleteFingerPrints(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
        return { success: false, code: 2010, message: 'Invalid parameters' };
    }
    const db = config.getFingerPrintDb();
    const removeAsync = util.promisify(db.remove).bind(db);
    try {
        const num = await removeAsync({ id: { $in: ids } }, { multi: true });
        ids.forEach(id => { delete envData[id]; }); // 内存同步
        return { success: true, code: 0, message: `Deleted ${num} fingerprint environments` };
    } catch (e) {
        return { success: false, code: 2011, message: e.message };
    }
}

async function getEnvById(id){
    if (!id) {
        return { success: false, code: 2012, message: 'Invalid parameters' };
    }
    if (envData[id]) {
        return { success: true, code: 0, data: envData[id] };
    }
    const db = config.getFingerPrintDb();
    const findAsync = util.promisify(db.findOne).bind(db);
    try {
        const fingerprint = await findAsync({ id });
        if (fingerprint) {
            envData[id] = fingerprint; // 同步到内存
            return { success: true, code: 0, data: fingerprint };
        } else {
            return { success: false, code: 2013, message: 'Environment not found' };
        }
    } catch (e) {
        return { success: false, code: 2014, message: e.message };
    }
}

async function setEnvById(id, env) {
    if (!id || !env) {
        return { success: false, code: 2015, message: 'Invalid parameters' };
    }
    const db = config.getFingerPrintDb();
    const updateAsync = util.promisify(db.update).bind(db);
    try {
        const num = await updateAsync({ id }, { $set: env }, {});
        if (num > 0) {
            envData[id] = { ...envData[id], ...env }; // 内存同步
            return { success: true, code: 0, message: 'Update successful' };
        } else {
            return { success: false, code: 2016, message: 'Environment not found' };
        }
    } catch (e) {
        return { success: false, code: 2017, message: e.message };
    }
}

async function updateFingerPrintProxy(id, proxy) {
    if (!id || !proxy) {
        return { success: false, code: 2018, message: 'Invalid parameters' };
    }
    const {ipType,ipHost,ipPort,ipUsername,ipPassword} = proxy;
    if (!ipType || !ipHost || !ipPort) {
        return { success: false, code: 2019, message: 'Incomplete proxy parameters' };
    }
    console.log('updateFingerPrintProxy params:', {id, ipType, ipHost, ipPort, ipUsername, ipPassword});
    const fingerprintRes = await getEnvById(id)
    if (!fingerprintRes.success) {
        return { success: false, code: 2020, message: fingerprintRes.message || 'Environment not found' };
    }
    const fingerprint = fingerprintRes.data;
    
    const proxyCheck = await checkProxy(ipType, ipHost, ipPort, ipUsername, ipPassword);
    console.log('proxyCheck:', proxyCheck);
    let proxyInfo = {ipType, ipHost, ipPort, ipUsername, ipPassword, proxyAvailable:false};
    if (proxyCheck.success) {
        proxyInfo.proxyAvailable = true;
        proxyInfo.ip = proxyCheck.data.ip;
        proxyInfo.position = proxyCheck.data.position;
        proxyInfo.country = proxyCheck.data.country;
        proxyInfo.timeZone = proxyCheck.data.timeZone;
        fingerprint.position = proxyCheck.data.position;
        fingerprint.webrtc_public = proxyCheck.data.ip;
        fingerprint.timeZone = proxyCheck.data.timeZone;
    }
    fingerprint.proxy = proxyInfo; // 更新指纹环境的代理信息
    await setEnvById(id, fingerprint); // 同步到内存
    return { success: true, code: 0, message: 'Proxy info updated successfully', data: fingerprint };
}

async function bindWalletEnv(walletId, envId) {
    if (!walletId || !envId) {
        return { success: false, code: 2021, message: 'Invalid parameters' };
    }
    const envRes = await getEnvById(envId);
    if (!envRes.success) {
        return { success: false, code: 2022, message: envRes.message || 'Environment not found' };
    }
    const env = envRes.data;
    // 如果该环境已绑定其他钱包，则禁止绑定
    if (env.bindWalletId && env.bindWalletId !== walletId && env.bindWalletId !== '') {
        return { success: false, code: 2024, message: 'Environment already bound to another wallet' };
    }
    env.bindWalletId = walletId; // 绑定钱包ID
    const setEnvRes = await setEnvById(envId, env);
    if (!setEnvRes.success) {
        return { success: false, code: 2023, message: setEnvRes.message || 'Failed to bind wallet to environment' };
    }
    return { success: true, code: 0, message: 'Wallet bound to environment successfully', data: env };

}

async function unbindWalletEnv(envId) {
    if (!envId) {
        return { success: false, code: 2025, message: 'Invalid parameters' };
    }
    const envRes = await getEnvById(envId);
    if (!envRes.success) {
        return { success: false, code: 2026, message: envRes.message || 'Environment not found' };
    }
    const env = envRes.data;
    if (!env.bindWalletId) {
        return { success: true, code: 0, message: 'Environment not bound to any wallet' };
    }
    env.bindWalletId = '';
    const setEnvRes = await setEnvById(envId, env);
    if (!setEnvRes.success) {
        return { success: false, code: 2027, message: setEnvRes.message || 'Failed to unbind wallet from environment' };
    }

    // 尝试删除对应的 chrome user-data 目录（位于 savePath 下，以 env.id 作为子目录）
    try {
        const savePathObj = config.getSavePath && config.getSavePath();
        let baseSavePath = '';
        if (savePathObj) {
            if (typeof savePathObj === 'string') baseSavePath = savePathObj;
            else if (typeof savePathObj === 'object' && savePathObj.path) baseSavePath = savePathObj.path;
        }
        if (baseSavePath) {
            const userDataPath = path.join(baseSavePath, env.id || env._id);
            if (fs.existsSync(userDataPath)) {
                try {
                    fs.rmSync(userDataPath, { recursive: true, force: true });
                    console.log(`Removed user-data dir for env ${envId}: ${userDataPath}`);
                } catch (e) {
                    console.error(`Failed to remove user-data dir for env ${envId}:`, e.message || e);
                }
            } else {
                // 没有目录，正常返回
                console.log(`No user-data dir to remove for env ${envId} at ${userDataPath}`);
            }
        } else {
            console.log('savePath not configured, skip removing user-data dir');
        }
    } catch (e) {
        console.error('Error while attempting to remove user-data dir on unbind:', e);
    }

    return { success: true, code: 0, message: 'Unbound wallet from environment successfully', data: env };
}

module.exports = {
    loadFingerPrints,
    generateRandomFingerPrint,
    getFingerPrintCount,
    clearFingerPrints,
    getFingerPrints,
    updateFingerPrintName,
    deleteFingerPrints, 
    getEnvById, 
    setEnvById,
    updateFingerPrintProxy,
    bindWalletEnv,
    unbindWalletEnv,
};