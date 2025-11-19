const WebSocket = require('ws');
const url = process.argv[2];
const puppeteer = require('puppeteer-extra');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');


let ws = new WebSocket(url);
let webSocketReady = false;
let taskData = null;
const ENABLE_DEBUG_LOGS = /^1|true$/i.test(String(process.env.TOOLBOX_DEBUG_LOGS || process.env.TOOLBOX_SLAVE_DEBUG || ''));

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

// 统一消息
function sendHeartBeat() {
    setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'heart_beat' }));
    }, 5000);
}
function sendRequestTaskData() {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'request_task_data', data: '' }));
}
function sendTaskLog(message) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'task_log', message }));
}
function sendDebugLog(message) {
  if (!ENABLE_DEBUG_LOGS) return;
  sendTaskLog(`[debug] ${message}`);
}
function sendTerminateProcess() {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'terminate_process' }));
}

ws.on('open', () => { webSocketReady = true; sendHeartBeat(); });
ws.on('message', (message) => {
    let data = JSON.parse(message);
    switch (data.type) {
        case 'heart_beat':
            break;
        case 'request_task_data':
            taskData = data.data;
            break;
        case 'terminate_process':
            sendTerminateProcess();
            gracefulExit();
            break;
        default:
            break;
    }
});
ws.on('error', (err) => { console.error('[syncFunction] WebSocket error:', err); process.exit(1); });
setInterval(() => {
    if (ws.readyState === WebSocket.CLOSED) {
        try { ws = new WebSocket(url); } catch { }
    }
}, 5000);

function ensureTaskDataIsObject() {
    if (typeof taskData === 'string') {
        try { taskData = JSON.parse(taskData); } catch { }
    }
    return taskData || {};
}

let browsers = [];
async function gracefulExit() {
    try { await Promise.allSettled(browsers.map(b => b.close())); } catch { }
    try { ws.close(); } catch { }
    shutdown();
    process.exit(0);
}

function buildFingerprints(env) {
    const base = {
        canvas: env.canvas,
        hardware: env.hardware,
        screen: env.screen,
        clientHint: env.clientHint,
        languages_js: env.language_js,
        languages_http: env.language_http,
        fonts_remove: (env.fonts_remove || '') + ',Tahoma'
    };
    if (env.useProxy) {
        base.position = env.position;
        base.timeZone = env.timeZone;
        base.webrtc_public = env.webrtc_public;
    }
    return JSON.stringify(base);
}

function buildLaunchArgs(env, metamaskDir) {
    const args = [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disabled-setupid-sandbox',
        '--disable-infobars',
    ];
    if (env && env.user_agent) args.push(`--user-agent=${env.user_agent}`);
    if (env && env.language_js) args.push(`--lang=${env.language_js}`);
    if (metamaskDir) {
        args.push(`--disable-extensions-except=${metamaskDir}`);
        args.push(`--load-extension=${metamaskDir}`);
    }
    if (env && env.useProxy && env.proxyUrl) args.push(`--proxy-server=${env.proxyUrl}`);
    if (env) args.push(`--toolbox=${buildFingerprints(env)}`);
    return args;
}



function isExtensionUrl(url) {
    return typeof url === 'string' && url.startsWith('chrome-extension://');
}

let masterBrowser = null;
let slaveWorkers = [];
let pageIdSeq = 0;
const pageIdByTargetId = new Map();  // target._targetId -> pageId
const pageById = new Map();          // pageId -> Page
const lastUrlByPageId = new Map();   // pageId -> url
const pageStateSnapshot = new Map(); // pageId -> { url, exists: true/false }
let monitorTimer = null;
let lastActivePageId = null;        // 追踪上次激活的页面，防止重复激活

const WINDOW_LAYOUT = Object.freeze({
  master: { x: 0, y: 0, width: 900, height: 700 },
  slave: { x: 120, y: 120, width: 900, height: 700, gapX: 20, gapY: 0 }
});

// 新增：记录每个 Page 的 CDP 客户端与注入状态
const cdpClientByPage = new WeakMap();
const cdpNavHooked = new WeakSet();
const eondInstalled = new WeakSet();
// 新增：标记是否已为该 Page 注入主世界脚本
const cdpMainWorldInjected = new WeakSet();

// 全局事件整流，防止同一 Payload 被重复广播
const EVENT_HASH_TTL_MS = 300;
const MAX_EVENT_HASH_CACHE = 2048;
const recentEventHashes = new Map();

function resolveSlaveLabel(env = {}, ordinal) {
  return env.alias || env.name || env.remark || env.tag || env.bindWalletId || env.id || `slave-${ordinal}`;
}

function formatSlaveTag(ordinal, label) {
  if (!Number.isFinite(ordinal) || ordinal <= 0) return '[slave]';
  return label && label !== `slave-${ordinal}` ? `[slave${ordinal}:${label}]` : `[slave${ordinal}]`;
}

function normalizeEventForHash(evt = {}) {
  try {
    const normalized = { type: evt.type || '' };
    if (evt.pageId) normalized.pageId = evt.pageId;
    switch (normalized.type) {
      case 'click':
        normalized.selector = (evt.selector || '').toLowerCase();
        normalized.button = typeof evt.button === 'number' ? evt.button : 0;
        normalized.x = Number.isFinite(evt.x) ? Math.round(evt.x) : 0;
        normalized.y = Number.isFinite(evt.y) ? Math.round(evt.y) : 0;
        break;
      case 'input':
      case 'change':
        normalized.selector = (evt.selector || '').toLowerCase();
        normalized.value = evt.value ?? '';
        if (typeof evt.checked === 'boolean') normalized.checked = evt.checked;
        break;
      case 'scroll':
        normalized.selector = (evt.selector || '').toLowerCase();
        normalized.scrollTop = Number.isFinite(evt.scrollTop) ? Math.round(evt.scrollTop) : Number.isFinite(evt.scrollY) ? Math.round(evt.scrollY) : 0;
        normalized.scrollLeft = Number.isFinite(evt.scrollLeft) ? Math.round(evt.scrollLeft) : Number.isFinite(evt.scrollX) ? Math.round(evt.scrollX) : 0;
        break;
      case 'keydown':
        normalized.key = evt.key || '';
        break;
      case 'navigate':
        normalized.url = evt.url || '';
        break;
      default:
        if (evt.selector) normalized.selector = (evt.selector || '').toLowerCase();
        break;
    }
    return normalized;
  } catch {
    return { type: evt?.type || '' };
  }
}

function hashEventPayload(evt = {}) {
  try {
    const normalized = normalizeEventForHash(evt);
    return JSON.stringify(normalized);
  } catch {
    return null;
  }
}

function shouldDropEventHash(hash) {
  if (!hash) return false;
  const now = Date.now();
  const prev = recentEventHashes.get(hash);
  if (prev && (now - prev) <= EVENT_HASH_TTL_MS) {
    return true;
  }
  recentEventHashes.set(hash, now);
  if (recentEventHashes.size > MAX_EVENT_HASH_CACHE) {
    for (const [key, ts] of recentEventHashes.entries()) {
      if ((now - ts) > EVENT_HASH_TTL_MS) {
        recentEventHashes.delete(key);
      }
      if (recentEventHashes.size <= MAX_EVENT_HASH_CACHE) break;
    }
  }
  return false;
}

function spawnSlaveWorkers(slaveEnvs, options) {
  const { chromePath, savePath, metamaskDir, positionBase } = options;
  const defaultSlaveWindow = WINDOW_LAYOUT.slave || {};
  const SLAVE_WINDOW = Object.assign({}, defaultSlaveWindow, positionBase || {});
  const gapX = Number.isFinite(SLAVE_WINDOW.gapX) ? SLAVE_WINDOW.gapX : (defaultSlaveWindow.gapX ?? 20);
  const gapY = Number.isFinite(SLAVE_WINDOW.gapY) ? SLAVE_WINDOW.gapY : (defaultSlaveWindow.gapY ?? 0);
  sendTaskLog(`[syncFunction] Launching ${slaveEnvs.length} slave processes...`);

  slaveWorkers = slaveEnvs.map((env, i) => {
    const worker = fork(path.resolve(__dirname, 'replicatorWorker.js'));
    const ordinal = i + 1;
    const label = resolveSlaveLabel(env, ordinal);
    const tag = formatSlaveTag(ordinal, label);
    const position = {
      x: SLAVE_WINDOW.x + i * (SLAVE_WINDOW.width + gapX),
      y: SLAVE_WINDOW.y + i * gapY,
      width: SLAVE_WINDOW.width,
      height: SLAVE_WINDOW.height,
    };
  sendTaskLog(`${tag} starting up...`);
    worker.send({
      type: 'init',
      payload: {
        env,
        chromePath,
        savePath,
        metamaskDir,
        position,
        slaveIndex: ordinal,
        slaveLabel: label,
        enableDebugLogs: ENABLE_DEBUG_LOGS,
      }
    });
    worker.on('message', (m) => {
      if (!m || !m.type) return;
      const msg = m.message || '';
      if (m.type === 'task-log' || m.type === 'log') {
        const formatted = msg ? `${tag} ${msg}` : tag;
        sendTaskLog(formatted);
        return;
      }
      if (m.type === 'debug-log') {
        if (ENABLE_DEBUG_LOGS) {
          const formatted = msg ? `${tag} [debug] ${msg}` : `${tag} [debug]`;
          sendTaskLog(formatted);
        }
        return;
      }
    });
    worker.on('exit', (code, signal) => {
      sendTaskLog(`${tag} 退出 code=${code} signal=${signal}`);
    });
    return worker;
  });
}

function broadcastToSlaves(evt) {
    for (const w of slaveWorkers) {
        try { w.send({ type: 'event', payload: evt }); } catch { }
    }
}

/** ------------ Master browser ------------ */
async function launchMaster(masterEnv, chromePath, savePath, metamaskDir, position) {
    const args = buildLaunchArgs(masterEnv, metamaskDir);
    const userDataDir = path.join(savePath, masterEnv.id);
    if (position && Number.isFinite(position.x)) {
        args.push(`--window-position=${position.x},${position.y}`);
        args.push(`--window-size=${position.width || 1200},${position.height || 900}`);
    }
    masterBrowser = await puppeteer.launch({
        headless: false,
        executablePath: chromePath,
        userDataDir: userDataDir,
        ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: null,
        args,
    });
    browsers.push(masterBrowser);
  sendTaskLog('[syncFunction] Master browser launched');
    return masterBrowser;
}

function cleanupPageMappings(pid) {
  try { pageById.delete(pid); } catch {}
  try { lastUrlByPageId.delete(pid); } catch {}
  try { pageStateSnapshot.delete(pid); } catch {}
  // 如果你还保留 targetId -> pageId 的映射，这里一并清理
  try {
    for (const [tid, mapped] of pageIdByTargetId.entries()) {
      if (mapped === pid) pageIdByTargetId.delete(tid);
    }
  } catch {}
}

// 新增：使用 CDP 在隔离世界里注入监听（适用于 chrome-extension:// 页面）
async function installCdpListener(page, pageId) {
  try {
    let client = cdpClientByPage.get(page);
    if (!client) {
      client = await page.target().createCDPSession();
      await client.send('Runtime.enable');
      await client.send('Page.enable');
      cdpClientByPage.set(page, client);

      // 只注册一次 binding 回调
      client.on('Runtime.bindingCalled', async (e) => {
        if (e.name !== '__cdpReport') return;
        try {
          const evt = JSON.parse(e.payload || '{}');
          evt.pageId = pageId;
          if (!evt.url) { try { evt.url = await page.url(); } catch {} }
          if (evt.type === 'activate') {
            if (lastActivePageId !== pageId) {
              lastActivePageId = pageId;
              sendTaskLog(`[sync] Page activated (cdp): ${pageId}`);
              broadcastToSlaves({ type: 'activate', pageId });
            }
            return;
          }
          if (evt.type === 'deactivate') { broadcastToSlaves({ type: 'deactivate', pageId }); return; }
          const evtHash = hashEventPayload(evt);
          if (evtHash && shouldDropEventHash(evtHash)) {
            return;
          }
          broadcastToSlaves(evt);
        } catch {}
      });
    }

    // 帮助函数：获取顶层 Frame URL
    const getTopUrl = async () => {
      try {
        const { frameTree } = await client.send('Page.getFrameTree');
        return (frameTree && frameTree.frame && frameTree.frame.url) || '';
      } catch { return ''; }
    };

    // 两套注入脚本：
    // 1) 普通网页（http/https）：主世界监听 + 自定义事件桥（shadow 支持，含 attachShadow 钩子）
    const mainWorldSource = `(() => {
        const send = (evt) => { try { document.dispatchEvent(new CustomEvent('__tbxEvt', { detail: evt, bubbles: true, composed: true })); } catch {} };
        const now = () => { try { return performance.now(); } catch { return Date.now(); } };
        let lastKey = '';
        let lastTs = 0;
        const dedupe = (evt) => {
          try {
            const key = [evt.type, evt.selector || '', evt.tag || '', evt.x || 0, evt.y || 0].join('|');
            const t = now();
            if (key === lastKey && (t - lastTs) < 120) return true;
            lastKey = key; lastTs = t; return false;
          } catch { return false; }
        };
        const isElem = (n) => !!(n && n.nodeType === 1);
        const buildSelector = (el) => {
          try {
            if (!isElem(el)) return null;
            if (el.id) return '#' + el.id;
            const cls = (el.classList && el.classList.length) ? ('.' + Array.from(el.classList).join('.')) : '';
            const tag = (el.tagName ? el.tagName.toLowerCase() : '');
            return tag ? (tag + cls) : null;
          } catch { return null; }
        };
        const enrichCommon = (e, t) => {
          const m = e; // Mouse/Poi
          const tag = (t && t.tagName) ? t.tagName.toLowerCase() : '';
          let inputType = ''; try { inputType = (t && t.type) ? String(t.type).toLowerCase() : ''; } catch {}
          const x = (m && Number.isFinite(m.clientX)) ? m.clientX : 0;
          const y = (m && Number.isFinite(m.clientY)) ? m.clientY : 0;
          const sel = buildSelector(t);
          const out = { selector: sel, tag, inputType, x, y };
          try { if (tag === 'input' && (inputType === 'checkbox' || inputType === 'radio')) out.checked = !!t.checked; } catch {}
          try { out.vw = window.innerWidth || 0; out.vh = window.innerHeight || 0; out.dpr = window.devicePixelRatio || 1; } catch {}
          return out;
        };
        const handleClickish = (type) => (e) => {
          try {
            const t = (e && e.composedPath && e.composedPath()[0]) || e.target || null;
            if (!t) return;
            const payload = Object.assign({ type: 'click' }, enrichCommon(e, t));
            if (dedupe(payload)) return;
            send(payload);
          } catch {}
        };
        const handleInput = (e) => {
          try {
            const t = (e && e.composedPath && e.composedPath()[0]) || e.target || null; if (!t) return;
            const sel = buildSelector(t);
            let value = '';
            try {
              if (t && 'value' in t) value = t.value || '';
              else if (t && t.isContentEditable) value = t.textContent || '';
            } catch {}
            const tag = (t && t.tagName) ? t.tagName.toLowerCase() : '';
            let inputType = ''; try { inputType = (t && t.type) ? String(t.type).toLowerCase() : ''; } catch {}
            const payload = { type: (e.type === 'change') ? 'change' : 'input', selector: sel, value, tag, inputType };
            try { if (tag === 'input' && (inputType === 'checkbox' || inputType === 'radio')) payload.checked = !!t.checked; } catch {}
            send(payload);
          } catch {}
        };
        const installOnRoot = (root) => {
          try {
            // pointer/mouse 事件尽量在捕获阶段提前拿到
            root.addEventListener('pointerdown', handleClickish('pointerdown'), true);
            root.addEventListener('mousedown', handleClickish('mousedown'), true);
            root.addEventListener('click', handleClickish('click'), true);
            root.addEventListener('input', handleInput, true);
            root.addEventListener('change', handleInput, true);
          } catch {}
        };
        // 装配 document 与现有 open shadowRoot
        installOnRoot(document);
        try {
          const all = document.querySelectorAll('*');
          for (let i = 0; i < all.length; i++) {
            const el = all[i];
            try { if (el && el.shadowRoot) installOnRoot(el.shadowRoot); } catch {}
          }
        } catch {}
        // 监听后续 attachShadow
        try {
          const origAttach = Element.prototype.attachShadow;
          if (origAttach && !origAttach.__tbxWrapped) {
            Element.prototype.attachShadow = function(init) {
              const sr = origAttach.call(this, init);
              try { installOnRoot(sr); } catch {}
              return sr;
            };
            Element.prototype.attachShadow.__tbxWrapped = true;
          }
        } catch {}
        // 其他全局事件
        try {
          let st;
          window.addEventListener('scroll', () => { clearTimeout(st); st = setTimeout(() => { try { document && send({ type: 'scroll', scrollX: window.scrollX || 0, scrollY: window.scrollY || 0 }); } catch {} }, 80); }, { passive: true });
        } catch {}
        try {
          const report = () => { const visible = document.visibilityState === 'visible'; send({ type: visible ? 'activate' : 'deactivate' }); };
          document.addEventListener('DOMContentLoaded', report, { once: true });
          document.addEventListener('visibilitychange', report, true);
          window.addEventListener('focus', () => send({ type: 'activate' }), true);
          window.addEventListener('blur', () => send({ type: 'deactivate' }), true);
        } catch {}
      })();`;

    // 2) 扩展页面（chrome-extension://）：最小化注入，避免 hook attachShadow，直接通过 binding 回传
    const extWorldSource = `(() => {
      if (window.__tbxExtInstalled) return; window.__tbxExtInstalled = true;
      const send = (evt) => { try { globalThis.__cdpReport(JSON.stringify(evt)); } catch {} };
      const now = () => { try { return performance.now(); } catch { return Date.now(); } };
      let lastKey = ''; let lastTs = 0;
      const dedupe = (evt) => { try { const key = [evt.type, evt.selector||'', evt.tag||'', evt.x||0, evt.y||0].join('|'); const t = now(); if (key===lastKey && (t-lastTs)<120) return true; lastKey=key; lastTs=t; return false; } catch { return false; } };
      const isElem = (n) => !!(n && n.nodeType === 1);
      const buildSelector = (el) => { try { if (!isElem(el)) return null; if (el.id) return '#' + el.id; const cls = (el.classList && el.classList.length) ? ('.' + Array.from(el.classList).join('.')) : ''; const tag = (el.tagName ? el.tagName.toLowerCase() : ''); return tag ? (tag + cls) : null; } catch { return null; } };
      const enrichCommon = (e,t) => { const m = e; const tag = (t && t.tagName) ? t.tagName.toLowerCase() : ''; let inputType = ''; try { inputType = (t && t.type) ? String(t.type).toLowerCase() : ''; } catch {} const x = (m && Number.isFinite(m.clientX)) ? m.clientX : 0; const y = (m && Number.isFinite(m.clientY)) ? m.clientY : 0; const sel = buildSelector(t); const out = { selector: sel, tag, inputType, x, y }; try { if (tag==='input' && (inputType==='checkbox' || inputType==='radio')) out.checked = !!t.checked; } catch {} try { out.vw = window.innerWidth || 0; out.vh = window.innerHeight || 0; out.dpr = window.devicePixelRatio || 1; } catch {} return out; };
      const handleClickish = (type) => (e) => { try { const t = (e && e.composedPath && e.composedPath()[0]) || e.target || null; if (!t) return; const payload = Object.assign({ type: 'click' }, enrichCommon(e, t)); if (dedupe(payload)) return; send(payload); } catch {} };
      const handleInput = (e) => { try { const t = (e && e.composedPath && e.composedPath()[0]) || e.target || null; if (!t) return; const sel = buildSelector(t); let value = ''; try { if (t && 'value' in t) value = t.value || ''; else if (t && t.isContentEditable) value = t.textContent || ''; } catch {} const tag = (t && t.tagName) ? t.tagName.toLowerCase() : ''; let inputType = ''; try { inputType = (t && t.type) ? String(t.type).toLowerCase() : ''; } catch {} const payload = { type: (e.type === 'change') ? 'change' : 'input', selector: sel, value, tag, inputType }; try { if (tag==='input' && (inputType==='checkbox' || inputType==='radio')) payload.checked = !!t.checked; } catch {} send(payload); } catch {} };
      const installOn = (root) => { try { root.addEventListener('pointerdown', handleClickish('pointerdown'), true); root.addEventListener('mousedown', handleClickish('mousedown'), true); root.addEventListener('click', handleClickish('click'), true); root.addEventListener('input', handleInput, true); root.addEventListener('change', handleInput, true); } catch {} };
      installOn(document);
      try { let st; window.addEventListener('scroll', () => { clearTimeout(st); st = setTimeout(() => { send({ type: 'scroll', scrollX: window.scrollX || 0, scrollY: window.scrollY || 0 }); }, 80); }, { passive: true }); } catch {}
      try { const report = () => { const visible = document.visibilityState === 'visible'; send({ type: visible ? 'activate' : 'deactivate' }); }; document.addEventListener('DOMContentLoaded', report, { once: true }); document.addEventListener('visibilitychange', report, true); window.addEventListener('focus', () => send({ type: 'activate' }), true); window.addEventListener('blur', () => send({ type: 'deactivate' }), true);} catch {}
    })();`;

    // 当前页是否为扩展页
    const topUrl = await getTopUrl();
    const isExtPage = /^chrome-extension:\/\//.test(topUrl);

    // 扩展页：为所有执行上下文添加 binding；并注入最小脚本
    if (isExtPage) {
      try { await client.send('Runtime.addBinding', { name: '__cdpReport' }); } catch {}
      if (!cdpMainWorldInjected.has(page)) {
        try { await client.send('Page.addScriptToEvaluateOnNewDocument', { source: extWorldSource }); } catch {}
        cdpMainWorldInjected.add(page);
      }
      // 立即在当前文档安装
      try {
        await client.send('Runtime.evaluate', {
          expression: extWorldSource,
          includeCommandLineAPI: false,
          awaitPromise: false,
          returnByValue: false,
        });
      } catch {}
    } else {
      // 普通网页：主世界脚本 + 隔离世界桥
      if (!cdpMainWorldInjected.has(page)) {
        try { await client.send('Page.addScriptToEvaluateOnNewDocument', { source: mainWorldSource }); } catch {}
        cdpMainWorldInjected.add(page);
      }
      // 隔离世界桥接
      const inject = async () => {
        const { frameTree } = await client.send('Page.getFrameTree');
        const frameId = frameTree && frameTree.frame && frameTree.frame.id ? frameTree.frame.id : undefined;
        if (!frameId) return;
        const { executionContextId } = await client.send('Page.createIsolatedWorld', {
          frameId,
          worldName: 'toolboxWorld',
          grantUniversalAccess: true,
        });
        try { await client.send('Runtime.addBinding', { name: '__cdpReport', executionContextId }); } catch (_) {
          try { await client.send('Runtime.addBinding', { name: '__cdpReport' }); } catch {}
        }
        const bridgeSource = `(() => {
          try {
            const forward = (e) => { try { globalThis.__cdpReport(JSON.stringify(e && e.detail ? e.detail : {})); } catch {} };
            document.addEventListener('__tbxEvt', forward, true);
          } catch {}
        })();`;
        await client.send('Runtime.evaluate', {
          expression: bridgeSource,
          contextId: executionContextId,
          includeCommandLineAPI: false,
          awaitPromise: false,
          returnByValue: false,
        });
        // 确保当前文档也已安装主世界监听
        try {
          await client.send('Runtime.evaluate', {
            expression: mainWorldSource,
            includeCommandLineAPI: false,
            awaitPromise: false,
            returnByValue: false,
          });
        } catch {}
      };
      await inject();

      // 只挂一次导航重注入钩子（区分扩展/普通页）
      if (!cdpNavHooked.has(page)) {
        cdpNavHooked.add(page);
        page.on('framenavigated', async (frame) => {
          try {
            if (frame.parentFrame()) return;
            const u = frame.url();
            if (/^chrome-extension:\/\//.test(u)) {
              try { await client.send('Runtime.addBinding', { name: '__cdpReport' }); } catch {}
              await client.send('Runtime.evaluate', { expression: extWorldSource, includeCommandLineAPI: false, awaitPromise: false, returnByValue: false });
            } else {
              await inject();
            }
          } catch {}
        });
      }
    }

    // 扩展页也需要在导航后确保重新安装（仅挂一次）
    if (!cdpNavHooked.has(page)) {
      cdpNavHooked.add(page);
      page.on('framenavigated', async (frame) => {
        try {
          if (frame.parentFrame()) return;
          const u = frame.url();
          if (/^chrome-extension:\/\//.test(u)) {
            try { await client.send('Runtime.addBinding', { name: '__cdpReport' }); } catch {}
            await client.send('Runtime.evaluate', { expression: extWorldSource, includeCommandLineAPI: false, awaitPromise: false, returnByValue: false });
          }
        } catch {}
      });
    }
  } catch (e) {
    sendTaskLog(`[sync] installCdpListener error: ${e && e.message ? e.message : e}`);
  }
}

/** Add auto-injection to collect basic events and forward via exposed function */
async function wirePage(page, pageId) {
  pageById.set(pageId, page);
  try { await page.setBypassCSP(true); } catch {}

  // —— 暴露桥 ——：集中处理并向 slave 广播；对 activate 去重
  await page.exposeFunction('__reportEvent', (evt) => {
    if (!evt || typeof evt !== 'object') return;
    evt.pageId = pageId;
    if (!evt.url) { try { evt.url = page.url(); } catch {} }

    if (evt.type === 'activate') {
      if (lastActivePageId !== pageId) {
        lastActivePageId = pageId;
        sendTaskLog(`[sync] Page activated: ${pageId}`);
        broadcastToSlaves({ type: 'activate', pageId });
      }
      return; // 避免重复下发
    }
    if (evt.type === 'deactivate') { broadcastToSlaves({ type: 'deactivate', pageId }); return; }
    broadcastToSlaves(evt);
  }).catch(() => {});

  // 统一改为 CDP 注入（普通页与扩展页一致）
  await installCdpListener(page, pageId).catch(() => {});

  // —— 导航事件：仅负责同步导航（CDP 自身会在导航后自动重注入）——（仅 top frame）
  page.on('framenavigated', async (frame) => {
    if (frame.parentFrame()) return;
    const url = frame.url();
    try { /* CDP 注入的重载由 installCdpListener 自身挂载的钩子处理，这里仅做导航广播 */ } catch {}
    lastUrlByPageId.set(pageId, url);
    broadcastToSlaves({ type: 'navigate', pageId, url });
  });

  page.on('close', () => {
    sendTaskLog(`[sync] Page closed: ${pageId}`);
    cleanupPageMappings(pageId);
    broadcastToSlaves({ type: 'close', pageId });
  });

  page.bringToFront().catch(() => {});
}


async function wireNewTargets(browser) {
    browser.on('targetcreated', async (target) => {
        try {
            if (target.type() !== 'page' && target.type() !== 'background_page') return;
            const page = await target.page();
            if (!page) return;
            const pageId = `p-${++pageIdSeq}`;
            await wirePage(page, pageId);
            // 记录 targetId 与 pageId 的映射，用于 targetchanged 事件查找
            if (target._targetId) {
                pageIdByTargetId.set(target._targetId, pageId);
            }
            const url = page.url();
            if (url && url !== 'about:blank') {
                lastUrlByPageId.set(pageId, url);
                broadcastToSlaves({ type: 'navigate', pageId, url });
            }
        } catch (e) {
            sendTaskLog('targetcreated wire error: ' + e.message);
        }
    });

    // Monitor active target changes
    browser.on('targetchanged', async (target) => {
        try {
            if (target.type() !== 'page') return;
            sendDebugLog(`[syncFunction] targetchanged event for target: ${target.url()}`);
            
            // 1. 尝试从 targetId 映射找到 pageId（最快）
            let pageId = pageIdByTargetId.get(target._targetId);
            
            // 2. 如果没找到，尝试从 page 对象查找（备选方案）
            if (!pageId) {
                const currentPage = await target.page();
                if (!currentPage) return;
                pageId = Array.from(pageById.entries()).find(([, page]) => page === currentPage)?.[0];
                // 同时更新映射关系
                if (pageId && target._targetId) {
                    pageIdByTargetId.set(target._targetId, pageId);
                }
            }
            
            // 3. 去重：只在页面确实改变时才广播
            if (pageId && pageId !== lastActivePageId) {
                lastActivePageId = pageId;
                sendTaskLog(`[sync] Active target changed to: ${pageId}`);
                broadcastToSlaves({ type: 'activate', pageId });
            }
        } catch (e) {
            sendTaskLog('targetchanged monitor error: ' + e.message);
        }
    });
}


function stopPageMonitor() {
    if (monitorTimer) {
        clearInterval(monitorTimer);
        monitorTimer = null;
    }
}

/** ------------ Main orchestration ------------ */
async function startSync(payload) {
    const {
        masterEnv = {},
        slaveEnvs = [],
        chromePath,
        savePath,
        metamaskDir,
        startUrl,
    initialPosition,
    slaveInitialPosition
    } = payload || {};

    if (!slaveEnvs.length) {
      sendTaskLog('slaveEnvs missing; at least one slave environment is required.');
    }

  const masterWindow = Object.assign({}, WINDOW_LAYOUT.master, initialPosition || {});

  await launchMaster(masterEnv, chromePath, savePath, metamaskDir, masterWindow);
    await wireNewTargets(masterBrowser);

    // Ensure first page exists and wired
    const pages = await masterBrowser.pages();
    const first = pages[0] || await masterBrowser.newPage();
    const firstId = `p-${++pageIdSeq}`;
    await wirePage(first, firstId);
    const currentUrl = first.url();
    if (currentUrl && currentUrl !== 'about:blank') {
        lastUrlByPageId.set(firstId, currentUrl);
        broadcastToSlaves({ type: 'navigate', pageId: firstId, url: currentUrl });
    }

    // Spawn slaves
  const slaveWindowBase = Object.assign({}, WINDOW_LAYOUT.slave, slaveInitialPosition || {});
  spawnSlaveWorkers(slaveEnvs, { chromePath, savePath, metamaskDir, positionBase: slaveWindowBase });

    // Open start URL if provided
    if (startUrl) {
        try {
            await first.goto(startUrl, { waitUntil: 'domcontentloaded' });
        } catch (e) {
            sendTaskLog('Failed to navigate to startUrl: ' + e.message);
        }
    }

  sendTaskLog('Multi-process sync ready (Master captures → broadcasts to slaves)');
}

async function shutdown() {
  sendTaskLog('Starting cleanup and shutdown...');
    stopPageMonitor();
    lastActivePageId = null;  // 清理激活态追踪
    for (const w of slaveWorkers) {
        try { w.send({ type: 'shutdown' }); } catch { }
        try { w.disconnect(); } catch { }
        try { w.kill('SIGKILL'); } catch { }
    }
    slaveWorkers = [];
    if (masterBrowser) {
        try { await masterBrowser.close(); } catch { }
        masterBrowser = null;
    }
  sendTaskLog('Shutdown complete');
}

/** ------------ IPC & CLI ------------ */
process.on('message', async (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'init') {
        try { await startSync(msg.payload || {}); }
        catch (e) { sendTaskLog('init error: ' + e.message); process.exitCode = 1; }
        return;
    }
    if (msg.type === 'terminate_process') {
        await shutdown();
        process.exit(0);
    }
});

process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });
process.on('uncaughtException', async (e) => { sendTaskLog('uncaughtException: ' + e.message); await sleep(10); });
process.on('unhandledRejection', async (e) => { sendTaskLog('unhandledRejection: ' + (e && e.message ? e.message : String(e))); await sleep(10); });


// // Allow running standalone for quick manual tests:
// if (require.main === module) {
//     (async () => {
//         // Minimal demo payload. Replace fields with your actual project values or send via IPC.
//         const demoPayload = {
//             masterEnv: { id: 'master', language_js: 'en-US' },
//             slaveEnvs: [{ id: 'slave-1', language_js: 'en-US' }, { id: 'slave-2', language_js: 'en-US' }],
//             chromePath: undefined, // let puppeteer pick bundled Chromium or set an explicit Chrome path
//             savePath: path.join(__dirname, '.profiles'),
//             metamaskDir: undefined, // absolute path if you need extension
//             startUrl: 'https://example.org',
///             initialPosition: { x: 40, y: 40, width: 1280, height: 900 },
///         };
///         await startSync(demoPayload);
///     })();
/// }


function hasManifest(dir) {
    if (!dir) return false;
    const manifestPath = path.join(dir, 'manifest.json');
    return fs.existsSync(manifestPath);
}


function resolveMetamaskDir(walletExtensionPath) {
    // 1) 如果传入的就是扩展根目录
    if (hasManifest(walletExtensionPath)) return walletExtensionPath;
    // 2) 如果传入的是脚本目录，尝试其子目录 metamask-chrome-13.2.0
    const candidate = walletExtensionPath ? path.join(walletExtensionPath, 'metamask-chrome-13.2.0') : null;
    if (hasManifest(candidate)) return candidate;
    // 3) 回退到当前脚本同级的默认目录
    const local = path.resolve(__dirname, './metamask-chrome-13.2.0');
    if (hasManifest(local)) return local;
    return null;
}


// ----- 主流程 -----
// 仅当通过命令行直接运行时执行（非 fork 子进程）
if (!process.send) {
    (async () => {
        while (true) {
            if (webSocketReady) {
                sendRequestTaskData();
                if (taskData) break;
            }
            await sleep(1000);
        }

        const currentTaskData = ensureTaskDataIsObject();
        const { envs = [], taskDataFromFront = {}, chromePath, savePath, walletExtensionPath } = currentTaskData || {};
        if (!chromePath || !savePath) {
            console.error('[syncFunction] Missing chromePath or savePath');
            return gracefulExit();
        }

        // 解析 master/slaves 对应的 env
        const { masterId, slaveIds = [] } = taskDataFromFront || {};
        const masterEnv = envs.find(e => e && e.bindWalletId === masterId);
        const slaveEnvs = envs.filter(e => e && slaveIds.includes(e.bindWalletId));
        if (!masterEnv || slaveEnvs.length === 0) {
            console.error('[syncFunction] Master or slave environments not found');
            return gracefulExit();
        }

        const metamaskDir = resolveMetamaskDir(walletExtensionPath);
        if (!metamaskDir) {
            sendTaskLog('[syncFunction] No valid MetaMask extension directory (manifest.json missing)');
            console.error('[syncFunction] MetaMask extension directory invalid; manifest.json missing');
            return gracefulExit();
        }
  sendTaskLog('[syncFunction] Using extension directory: ' + metamaskDir);

        const payload = {
            masterEnv,
            slaveEnvs,
            chromePath,
            savePath,
            metamaskDir,
            startUrl: taskDataFromFront.startUrl || '',
      initialPosition: WINDOW_LAYOUT.master,
      slaveInitialPosition: WINDOW_LAYOUT.slave,
        };
        await startSync(payload);

    })();
}
module.exports = { startSync };