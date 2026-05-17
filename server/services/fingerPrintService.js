const config = require('../../config').getInstance();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const util = require('util');
const { checkProxy } = require('./proxyService');

const HARDWARE_PROFILES = {
  high_end: [
    { memory: 16, concurrency: 8 },
    { memory: 16, concurrency: 12 },
    { memory: 32, concurrency: 8 },
    { memory: 32, concurrency: 16 },
  ],
  mid_range: [
    { memory: 8, concurrency: 4 },
    { memory: 8, concurrency: 8 },
    { memory: 16, concurrency: 4 },
    { memory: 16, concurrency: 6 },
  ],
  low_end: [
    { memory: 4, concurrency: 2 },
    { memory: 4, concurrency: 4 },
    { memory: 8, concurrency: 2 },
  ],
  mobile: [
    { memory: 4, concurrency: 4 },
    { memory: 6, concurrency: 8 },
    { memory: 8, concurrency: 8 },
  ]
};

const SCREEN_PROFILES = [
  { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelRatio: 1 },
  { width: 2560, height: 1440, availWidth: 2560, availHeight: 1400, colorDepth: 24, pixelRatio: 1 },
  { width: 1366, height: 768, availWidth: 1366, availHeight: 728, colorDepth: 24, pixelRatio: 1 },
  { width: 1536, height: 864, availWidth: 1536, availHeight: 824, colorDepth: 24, pixelRatio: 1 },
  { width: 1440, height: 900, availWidth: 1440, availHeight: 860, colorDepth: 24, pixelRatio: 1 },
  { width: 3840, height: 2160, availWidth: 3840, availHeight: 2120, colorDepth: 24, pixelRatio: 2 },
  { width: 1280, height: 720, availWidth: 1280, availHeight: 680, colorDepth: 24, pixelRatio: 1 },
  { width: 1600, height: 900, availWidth: 1600, availHeight: 860, colorDepth: 24, pixelRatio: 1 },
  { width: 390, height: 844, availWidth: 390, availHeight: 844, colorDepth: 32, pixelRatio: 3 },
  { width: 412, height: 915, availWidth: 412, availHeight: 915, colorDepth: 24, pixelRatio: 3.5 },
  { width: 375, height: 812, availWidth: 375, availHeight: 812, colorDepth: 32, pixelRatio: 3 },
  { width: 414, height: 896, availWidth: 414, availHeight: 896, colorDepth: 24, pixelRatio: 2 },
];

const FONT_SETS = {
  windows: [
    'Arial','Calibri','Cambria','Candara','Comic Sans MS','Consolas',
    'Constantia','Corbel','Courier New','Franklin Gothic','Gabriola',
    'Georgia','Impact','Lucida Console','Lucida Sans Unicode',
    'Microsoft Sans Serif','Palatino Linotype','Segoe UI','Tahoma',
    'Times New Roman','Trebuchet MS','Verdana','Wingdings'
  ],
  macos: [
    'American Typewriter','Arial','Avenir','Baskerville','Chalkboard',
    'Courier','Courier New','Futura','Geneva','Georgia','Helvetica',
    'Helvetica Neue','Impact','Lucida Grande','Marker Felt','Noteworthy',
    'Optima','Palatino','Times','Times New Roman','Trebuchet MS','Verdana','Zapfino'
  ],
  linux: [
    'DejaVu Sans','DejaVu Serif','DejaVu Sans Mono','Droid Sans',
    'Droid Serif','Droid Sans Mono','FreeSans','FreeSerif','FreeMono',
    'Liberation Sans','Liberation Serif','Liberation Mono',
    'Noto Sans','Noto Serif','Noto Mono','Ubuntu','Ubuntu Mono'
  ],
  android: [
    'Droid Sans','Droid Serif','Droid Sans Mono','Noto Sans',
    'Noto Serif','Roboto','Roboto Mono'
  ],
  ios: [
    'American Typewriter','Arial','Avenir','Baskerville','Chalkboard',
    'Courier','Courier New','Futura','Geneva','Georgia','Helvetica',
    'Helvetica Neue','Impact','Marker Felt','Noteworthy','Optima',
    'Palatino','Times','Times New Roman','Trebuchet MS','Verdana'
  ]
};

class SecureRandom {
  constructor(seed) {
    this.s = new Uint32Array(4);
    this.s[0] = seed >>> 0;
    this.s[1] = (seed * 1103515245 + 12345) >>> 0;
    this.s[2] = (this.s[0] * 1103515245 + 12345) >>> 0;
    this.s[3] = (this.s[1] * 1103515245 + 12345) >>> 0;
    for (let i = 0; i < 10; i++) this.next();
  }
  next() {
    let s1 = this.s[0];
    const s0 = this.s[1];
    this.s[0] = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;
    this.s[1] = s1;
    return (this.s[0] + this.s[1]) >>> 0;
  }
  nextFloat() { return (this.next() % 1000000) / 1000000; }
  nextInt(min, max) { return min + (this.next() % (max - min + 1)); }
}

function inferOS(ua) {
  const u = (ua || '').toLowerCase();
  if (u.includes('iphone') || u.includes('ipad')) return 'ios';
  if (u.includes('android')) return 'android';
  if (u.includes('mac os x') || u.includes('macos')) return 'macos';
  if (u.includes('linux') && !u.includes('android')) return 'linux';
  if (u.includes('windows')) return 'windows';
  return 'windows';
}

function inferHardwareProfile(ua) {
  const u = (ua || '').toLowerCase();
  if (u.includes('mobile') || u.includes('iphone') || u.includes('android')) return 'mobile';
  if (u.includes('macbook') || u.includes('xps') || u.includes('thinkpad')) return Math.random() > 0.5 ? 'high_end' : 'mid_range';
  if (u.includes('windows nt 10')) return Math.random() > 0.3 ? 'mid_range' : 'high_end';
  if (u.includes('windows nt 6.1') || u.includes('windows nt 6.0')) return 'low_end';
  return 'mid_range';
}

function pickHardware(ua) {
  const profile = inferHardwareProfile(ua);
  const pool = HARDWARE_PROFILES[profile] || HARDWARE_PROFILES.mid_range;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickScreen(ua) {
  const u = (ua || '').toLowerCase();
  const isMobile = u.includes('mobile') || u.includes('iphone') || u.includes('android');
  const pool = isMobile ? SCREEN_PROFILES.filter(s => s.pixelRatio >= 2) : SCREEN_PROFILES.filter(s => s.pixelRatio === 1);
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickFonts(ua, count) {
  const os = inferOS(ua);
  const fontSet = FONT_SETS[os] || FONT_SETS.windows;
  const shuffled = [...fontSet].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function generateAudioNoise(seed) {
  const rng = new SecureRandom(seed);
  return {
    dynamicsCompressor: rng.nextFloat() * 0.001,
    analyserNode: rng.nextFloat() * 0.0001,
    oscillator: rng.nextFloat() * 0.01,
    convolver: rng.nextFloat() * 0.00001,
    seed: seed
  };
}

function validateFingerprintConsistency(fp) {
  const issues = [];
  if (!fp) return { valid: false, issues: ['null fingerprint'] };
  const ua = (fp.user_agent || '').toLowerCase();
  if (ua.includes('windows') && fp.clientHint && fp.clientHint.platform && !fp.clientHint.platform.toLowerCase().includes('windows')) {
    issues.push('UA Windows vs ClientHints platform mismatch');
  }
  if (ua.includes('mac') && fp.clientHint && fp.clientHint.platform && !fp.clientHint.platform.toLowerCase().includes('mac')) {
    issues.push('UA macOS vs ClientHints platform mismatch');
  }
  if (ua.includes('mac') && fp.webgl && fp.webgl.renderer && fp.webgl.renderer.includes('NVIDIA')) {
    issues.push('Mac UA with NVIDIA GPU is suspicious');
  }
  if (fp.screen) {
    const isMobile = ua.includes('mobile') || ua.includes('iphone') || ua.includes('android');
    if (isMobile && fp.screen.width > 1024) issues.push('Mobile UA with desktop screen resolution');
    if (!isMobile && fp.screen.width < 1024) issues.push('Desktop UA with mobile screen resolution');
  }
  if (ua.includes('mobile') && fp.hardware && fp.hardware.memory > 8) {
    issues.push('Mobile device with unusually high memory');
  }
  if (fp.proxy && fp.proxy.timeZone && fp.timeZone && fp.proxy.timeZone !== fp.timeZone) {
    issues.push('Proxy timezone mismatch with fingerprint timezone');
  }
  return { valid: issues.length === 0, issues };
}

const fpDataPath = path.join(config.getAssetsPath(), 'fpData.json');
let fpData = {};
if (fs.existsSync(fpDataPath)) {
    fpData = JSON.parse(fs.readFileSync(fpDataPath));
} else {
    try {
        fs.mkdirSync(path.dirname(fpDataPath), { recursive: true });
        fs.writeFileSync(fpDataPath, JSON.stringify(fpData));
    } catch (e) {
        console.error('[fingerPrintService] Failed to create fpData.json:', e.message);
    }
}

const envData = {};

function migrateFingerprint(fp) {
    if (!fp) return false;
    let changed = false;
    const randomSeed = () => Math.floor(Math.random() * 99999) + 1;
    if (typeof fp.audio === 'number' || fp.audio === undefined || fp.audio === null) {
        fp.audio = { seed: randomSeed() };
        changed = true;
    }
    if (typeof fp.canvas === 'number' || fp.canvas === undefined || fp.canvas === null) {
        fp.canvas = { toDataUrl: (Math.random() * 10), seed: randomSeed() };
        changed = true;
    } else if (typeof fp.canvas === 'object' && fp.canvas.seed === undefined) {
        fp.canvas.seed = randomSeed();
        changed = true;
    }
    return changed;
}

function isFingerPrintDbAvailable() {
    const db = config.getFingerPrintDb();
    return db !== null && db !== undefined;
}

(async function loadEnvDataOnStart() {
    try {
        if (!isFingerPrintDbAvailable()) {
            console.log('[envData] FingerPrint database not initialized yet, skipping data load');
            return;
        }
        const db = config.getFingerPrintDb();
        const util = require('util');
        const findAsync = util.promisify(db.find).bind(db);
        const fingerprints = await findAsync({});
        if (Array.isArray(fingerprints)) {
            const updateAsync = util.promisify(db.update).bind(db);
            for (const fp of fingerprints) {
                const migrated = migrateFingerprint(fp);
                const orphanFields = ['proxyUrl', 'useProxy', 'country', 'position', 'webrtc_public', 'timeZone'];
                const hasOrphans = !fp.proxy && orphanFields.some(f => fp[f] !== undefined);
                if (hasOrphans) {
                    const fieldsToUnset = {};
                    for (const f of orphanFields) {
                        if (fp[f] !== undefined) {
                            fieldsToUnset[f] = true;
                            delete fp[f];
                        }
                    }
                    try { await updateAsync({ id: fp.id }, { $unset: fieldsToUnset }, {}); } catch (_) {}
                    console.log(`[envData] Cleaned orphan proxy fields for env ${fp.name || fp.id}`);
                }
                if (fp.language_js && (fp.language_js.includes(';q=') || fp.language_js.includes(','))) {
                    const simpleLang = fp.language_js.split(',')[0].split(';')[0].trim();
                    fp.language_js = simpleLang;
                    try { await updateAsync({ id: fp.id }, { $set: { language_js: simpleLang } }, {}); } catch (_) {}
                    console.log(`[envData] Fixed language_js for env ${fp.name || fp.id}: -> ${simpleLang}`);
                }
                envData[fp.id || fp._id] = fp;
                if (migrated) {
                    try { await updateAsync({ id: fp.id }, { $set: { audio: fp.audio, canvas: fp.canvas } }, {}); } catch (_) {}
                }
            }
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
            'languageFingerprintList'
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
            fpData.languageFingerprintList.length
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
    } catch (error) {
        console.error('Invalid counts parameter:', error);
        return { success: false, code: 2004, message: 'Invalid counts parameter' };
    }
    if (!isFingerPrintDbAvailable()) {
        return { success: false, code: 2030, message: 'FingerPrint database not available. Please set save path first.' };
    }
    if (!fpData.userdata || !Array.isArray(fpData.userdata.fontsFamily) || fpData.userdata.fontsFamily.length === 0) {
        return { success: false, message: 'fontsFamily missing' };
    }
    if (!Array.isArray(fpData.matchedFingerprintList) || fpData.matchedFingerprintList.length === 0) {
        return { success: false, message: 'matchedFingerprintList missing' };
    }
    if (!Array.isArray(fpData.languageFingerprintList) || fpData.languageFingerprintList.length === 0) {
        return { success: false, message: 'languageFingerprintList missing' };
    }
    const randomIndex = (length) => Math.floor(Math.random() * length);
    const rng = new SecureRandom(Date.now());
    for (let i = 0; i < counts; i++) {
        const envId = uuidv4();
        const matchedIdx = randomIndex(fpData.matchedFingerprintList.length);
        const languageIndex = randomIndex(fpData.languageFingerprintList.length);
        const ua = fpData.matchedFingerprintList[matchedIdx].userAgentFingerprint;
        const hardware = pickHardware(ua);
        const screen = pickScreen(ua);
        const osFonts = FONT_SETS[inferOS(ua)] || FONT_SETS.windows;
        const fontsRemoveCount = rng.nextInt(1, Math.min(10, osFonts.length));
        const removeFonts = pickFonts(ua, fontsRemoveCount);
        const audioSeed = rng.next();
        const fingerprint = {
            id: envId,
            name: envId,
            user_agent: ua,
            clientHint: fpData.matchedFingerprintList[matchedIdx].clientHintFingerprint,
            webgl: fpData.matchedFingerprintList[matchedIdx].webglFingerprint,
            language_js: fpData.languageFingerprintList[languageIndex].jsLanguage,
            language_http: fpData.languageFingerprintList[languageIndex].httpLanguage,
            screen: screen,
            canvas: { toDataUrl: rng.nextFloat() * 10, seed: rng.next() },
            hardware: hardware,
            audio: generateAudioNoise(audioSeed),
            clientRect: rng.nextFloat(),
            fonts_remove: removeFonts.join(','),
            createdAt: Date.now(),
        };
        const validation = validateFingerprintConsistency(fingerprint);
        if (!validation.valid) {
            console.warn(`[fingerPrintService] Fingerprint consistency warning for ${envId}: ${validation.issues.join('; ')}`);
        }
        config.getFingerPrintDb().insert(fingerprint, (err, newDoc) => {
            if (err) {
                console.error('Error inserting fingerprint into database:', err);
            } else {
                envData[fingerprint.id] = fingerprint;
            }
        });
    }
    return { success: true, code: 0, message: 'Fingerprints generated successfully' };
}

async function getFingerPrints() {
    try {
        if (Object.keys(envData).length > 0) {
            return { success: true, code: 0, data: { ...envData } };
        }
        if (!isFingerPrintDbAvailable()) {
            return { success: false, code: 2031, message: 'FingerPrint database not available. Please set save path first.' };
        }
        const db = config.getFingerPrintDb();
        const findAsync = util.promisify(db.find).bind(db);
        const fingerprints = await findAsync({});
        if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
            return { success: false, code: 2005, message: 'No fingerprints found' };
        }
        for (const fp of fingerprints) {
            migrateFingerprint(fp);
            envData[fp.id || fp._id] = fp;
        }
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
        languageFingerprintList: []
    };
    const fpDataJson = JSON.stringify(fpData);
    fs.writeFileSync(fpDataPath, fpDataJson);
    return { success: true, code: 0, message: 'Fingerprints cleared successfully' };
}

async function updateFingerPrintName(id, newName) {
    if (!id || !newName) {
        return { success: false, code: 2007, message: 'Invalid parameters' };
    }
    if (!isFingerPrintDbAvailable()) {
        return { success: false, code: 2032, message: 'FingerPrint database not available. Please set save path first.' };
    }
    const db = config.getFingerPrintDb();
    const updateAsync = util.promisify(db.update).bind(db);
    try {
        const num = await updateAsync({ id }, { $set: { name: newName } }, {});
        if (num > 0) {
            if (envData[id]) envData[id].name = newName;
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
    if (!isFingerPrintDbAvailable()) {
        return { success: false, code: 2033, message: 'FingerPrint database not available. Please set save path first.' };
    }
    const db = config.getFingerPrintDb();
    const removeAsync = util.promisify(db.remove).bind(db);
    try {
        const num = await removeAsync({ id: { $in: ids } }, { multi: true });
        ids.forEach(id => { delete envData[id]; });
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
    if (!isFingerPrintDbAvailable()) {
        return { success: false, code: 2034, message: 'FingerPrint database not available. Please set save path first.' };
    }
    const db = config.getFingerPrintDb();
    const findAsync = util.promisify(db.findOne).bind(db);
    try {
        const fingerprint = await findAsync({ id });
        if (fingerprint) {
            if (migrateFingerprint(fingerprint)) {
                try {
                    const updateAsync2 = util.promisify(db.update).bind(db);
                    await updateAsync2({ id }, { $set: { audio: fingerprint.audio, canvas: fingerprint.canvas } }, {});
                } catch (_) {}
            }
            envData[id] = fingerprint;
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
    if (!isFingerPrintDbAvailable()) {
        return { success: false, code: 2035, message: 'FingerPrint database not available. Please set save path first.' };
    }
    const db = config.getFingerPrintDb();
    const updateAsync = util.promisify(db.update).bind(db);
    try {
        const num = await updateAsync({ id }, { $set: env }, {});
        if (num > 0) {
            envData[id] = { ...envData[id], ...env };
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
    fingerprint.proxy = proxyInfo;
    await setEnvById(id, fingerprint);
    return { success: true, code: 0, message: 'Proxy info updated successfully', data: fingerprint };
}

async function deleteFingerPrintProxy(id) {
    if (!id) {
        return { success: false, code: 2018, message: 'Invalid parameters' };
    }
    const fingerprintRes = await getEnvById(id);
    if (!fingerprintRes.success) {
        return { success: false, code: 2020, message: fingerprintRes.message || 'Environment not found' };
    }
    const fingerprint = fingerprintRes.data;
    fingerprint.proxy = null;
    delete fingerprint.proxy_type;
    delete fingerprint.proxy_ip;
    delete fingerprint.proxy_port;
    delete fingerprint.proxy_username;
    delete fingerprint.proxy_password;
    delete fingerprint.position;
    delete fingerprint.webrtc_public;
    delete fingerprint.timeZone;
    delete fingerprint.proxyUrl;
    delete fingerprint.useProxy;
    delete fingerprint.country;
    const fieldsToUnset = {
        proxy_type: true, proxy_ip: true, proxy_port: true,
        proxy_username: true, proxy_password: true,
        position: true, webrtc_public: true, timeZone: true,
        proxyUrl: true, useProxy: true, country: true
    };
    if (isFingerPrintDbAvailable()) {
        const db = config.getFingerPrintDb();
        const updateAsync = util.promisify(db.update).bind(db);
        try {
            await updateAsync({ id }, { $set: { proxy: null }, $unset: fieldsToUnset }, {});
        } catch (_) {}
    }
    envData[id] = fingerprint;
    return { success: true, code: 0, message: 'Proxy info cleared', data: fingerprint };
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
    if (env.bindWalletId && env.bindWalletId !== walletId && env.bindWalletId !== '') {
        return { success: false, code: 2024, message: 'Environment already bound to another wallet' };
    }
    env.bindWalletId = walletId;
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

async function reinitializeDatabase() {
    try {
        if (!isFingerPrintDbAvailable()) {
            return { success: false, code: 2036, message: 'FingerPrint database still not available after reinitialization' };
        }
        Object.keys(envData).forEach(key => delete envData[key]);
        const db = config.getFingerPrintDb();
        const util = require('util');
        const findAsync = util.promisify(db.find).bind(db);
        const fingerprints = await findAsync({});
        if (Array.isArray(fingerprints)) {
            fingerprints.forEach(fp => {
                envData[fp.id || fp._id] = fp;
            });
            console.log(`[envData] Reloaded ${Object.keys(envData).length} fingerprints into memory.`);
        }
        return { success: true, code: 0, message: `Database reinitialized successfully, loaded ${Object.keys(envData).length} fingerprints` };
    } catch (e) {
        console.error('[envData] Failed to reinitialize database:', e);
        return { success: false, code: 2037, message: 'Failed to reinitialize database: ' + e.message };
    }
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
    deleteFingerPrintProxy,
    bindWalletEnv,
    unbindWalletEnv,
    reinitializeDatabase,
    isFingerPrintDbAvailable,
    validateFingerprintConsistency,
    HARDWARE_PROFILES,
    SCREEN_PROFILES,
    FONT_SETS,
    pickHardware,
    pickScreen,
    pickFonts,
    generateAudioNoise,
    inferOS,
    inferHardwareProfile,
    SecureRandom,
};
