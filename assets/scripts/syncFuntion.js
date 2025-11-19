const WebSocket = require('ws');
const url = process.argv[2];
const puppeteer = require('puppeteer-extra');
const path = require('path');
const fs = require('fs');

let ws = new WebSocket(url);
let webSocketReady = false;
let taskData = null;

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
    try { ws = new WebSocket(url); } catch {}
  }
}, 5000);

function ensureTaskDataIsObject() {
  if (typeof taskData === 'string') {
    try { taskData = JSON.parse(taskData); } catch {}
  }
  return taskData || {};
}

let browsers = [];
async function gracefulExit() {
  try { await Promise.allSettled(browsers.map(b => b.close())); } catch {}
  try { ws.close(); } catch {}
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
    `--user-agent=${env.user_agent}`,
    `--lang=${env.language_js}`,
    `--disable-extensions-except=${metamaskDir}`,
    `--load-extension=${metamaskDir}`,
  ];
  if (env.useProxy && env.proxyUrl) args.push(`--proxy-server=${env.proxyUrl}`);
  args.push(`--toolbox=${buildFingerprints(env)}`);
  return args;
}

async function launchChromeForEnv(env, chromePath, savePath, metamaskDir, position) {
  const userDataDir = path.join(savePath, env.id);
  if (!fs.existsSync(userDataDir)) {
  throw new Error(`User data directory not found: ${userDataDir}`);
  }
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: chromePath,
    ignoreDefaultArgs: ['--enable-automation'],
    userDataDir,
    args: [
      ...buildLaunchArgs(env, metamaskDir),
      ...(position ? [
        `--window-position=${position.x},${position.y}`,
        `--window-size=${position.width},${position.height}`,
      ] : [])
    ],
    defaultViewport: null,
  });
  browsers.push(browser);
  return browser;
}

function isExtensionUrl(url) {
  return typeof url === 'string' && url.startsWith('chrome-extension://');
}

// 使用 CDP 在 Slave 侧创建/唤起扩展页面（避免 page.goto 导航受限）
async function openExtensionOnSlave(browser, url) {
  try {
    const conn = browser._connection || browser.connection || null;
    if (!conn) return null;
    await conn.send('Target.createTarget', { url });
    const base = url.split('#')[0].split('?')[0];
    const target = await browser.waitForTarget(t => {
      try { return (t.url() || '').startsWith(base); } catch { return false; }
    }, { timeout: 5000 });
    if (!target) return null;
    const page = await target.page();
    return page || null;
  } catch (e) {
    sendTaskLog('[syncFunction] openExtensionOnSlave error: ' + e.message);
    return null;
  }
}

function setupMasterPageSync(masterPage, pageId, slavePageGetters) {
  try { masterPage.setBypassCSP(true).catch(() => {}); } catch {}

  // 让页面事件回调到 Node
  masterPage.exposeFunction('__reportEvent', async (evt) => {
    try {
      // 广播到所有 slave 页面
      for (const getPage of slavePageGetters) {
        const page = await getPage(pageId);
        if (!page) continue;
        await replicateEventToSlave(page, evt);
      }
    } catch (e) {
      sendTaskLog('[syncFunction] relay error: ' + e.message);
    }
  }).catch(() => {});

  masterPage.evaluateOnNewDocument((pid) => {
    const __PID = pid;
    const safeReport = (msg) => { try { if (window.__reportEvent) window.__reportEvent(msg); } catch (e) {} };

    const getSelector = (el) => {
      if (!(el instanceof Element)) return null;
      if (el.id) return `#${el.id}`;
      const parts = [];
      while (el && el.nodeType === 1) {
        const tag = el.tagName;
        let sel = tag.toLowerCase();
        if (el.classList.length > 0) sel += `.${el.classList.item(0)}`;
        const parent = el.parentNode;
        if (parent) {
          const siblings = Array.from(parent.children).filter((c) => c.tagName === tag);
          if (siblings.length > 1) {
            const idx = siblings.indexOf(el) + 1;
            sel += `:nth-of-type(${idx})`;
          }
        }
        parts.unshift(sel);
        el = el.parentElement;
      }
      return parts.join(' > ');
    };

    window.addEventListener('click', (e) => {
      const selector = getSelector(e.target);
      safeReport({ type: 'click', pageId: __PID, x: e.clientX, y: e.clientY, button: e.button, selector });
    }, true);

    window.addEventListener('input', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) {
        const selector = getSelector(t);
        const value = (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) ? t.value : t.innerText;
        safeReport({ type: 'input', pageId: __PID, selector, value });
      }
    }, true);

    let scrollTimeout = null;
    window.addEventListener('scroll', () => {
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => {
        safeReport({ type: 'scroll', pageId: __PID, scrollX: window.scrollX, scrollY: window.scrollY });
        scrollTimeout = null;
      }, 100);
    }, true);
  }, pageId).catch(() => {});

  // 立即为当前已加载的文档绑定一次（MetaMask 解锁页等不会自动重载的页面）
  masterPage.evaluate((pid) => {
    try {
      const root = document.documentElement;
      if (root && root.dataset && root.dataset.syncBound === '1') return;
      if (root && root.dataset) root.dataset.syncBound = '1';
      const __PID = pid;
      const safeReport = (msg) => { try { if (window.__reportEvent) window.__reportEvent(msg); } catch (e) {} };

      const getSelector = (el) => {
        if (!(el instanceof Element)) return null;
        if (el.id) return `#${el.id}`;
        const parts = [];
        while (el && el.nodeType === 1) {
          const tag = el.tagName;
          let sel = tag.toLowerCase();
          if (el.classList.length > 0) sel += `.${el.classList.item(0)}`;
          const parent = el.parentNode;
          if (parent) {
            const siblings = Array.from(parent.children).filter((c) => c.tagName === tag);
            if (siblings.length > 1) {
              const idx = siblings.indexOf(el) + 1;
              sel += `:nth-of-type(${idx})`;
            }
          }
          parts.unshift(sel);
          el = el.parentElement;
        }
        return parts.join(' > ');
      };

      window.addEventListener('input', (e) => {
        const t = e.target;
        if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) {
          const selector = getSelector(t);
          const value = (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) ? t.value : t.innerText;
          safeReport({ type: 'input', pageId: __PID, selector, value });
        }
      }, true);
      window.addEventListener('change', (e) => {
        const t = e.target;
        if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) {
          const selector = getSelector(t);
          const payload = { type: 'change', pageId: __PID, selector };
          if (t instanceof HTMLInputElement && (t.type === 'checkbox' || t.type === 'radio')) {
            payload.checked = !!t.checked;
          } else {
            payload.value = t.value;
          }
          safeReport(payload);
        }
      }, true);
      window.addEventListener('keydown', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) return;
        const interesting = ['Enter', 'Tab'];
        if (!interesting.includes(e.key)) return;
        const selector = getSelector(t);
        safeReport({ type: 'keydown', pageId: __PID, selector, key: e.key, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey });
      }, true);
    } catch {}
  }, pageId).catch(() => {});
}

const lastUrlByPageId = new Map();

async function replicateEventToSlave(page, evt) {
  try {
    if (evt.type === 'navigate') {
      lastUrlByPageId.set(evt.pageId, evt.url);
      if (!evt.url || evt.url === 'about:blank') return; // 跳过空导航
      if (isExtensionUrl(evt.url)) {
        // 扩展 URL 的创建/附着由 getPage + openExtensionOnSlave 负责，这里不 goto
        return;
      }
      try {
        await page.goto(evt.url, { waitUntil: 'domcontentloaded' });
      } catch (e) {
        sendTaskLog('[syncFunction] navigate skip: ' + (e && e.message ? e.message : e));
      }
      return;
    }
    if (evt.type === 'click') {
      let clicked = false;
      if (evt.selector) {
        try {
          await page.waitForSelector(evt.selector, { timeout: 3000 });
          const el = await page.$(evt.selector);
          if (el) { await el.click(); clicked = true; }
        } catch {}
      }
      if (!clicked) await page.mouse.click(evt.x, evt.y);
      return;
    }
    if (evt.type === 'scroll') {
      await page.evaluate((xx, yy) => window.scrollTo(xx, yy), evt.scrollX, evt.scrollY);
      return;
    }
    if (evt.type === 'input') {
      await page.evaluate((sel, val) => {
        const el = document.querySelector(sel);
        if (!el) return;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.focus(); el.value = val; el.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (el.isContentEditable) {
          el.focus(); el.innerText = val; el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        }
      }, evt.selector, evt.value);
      return;
    }
  } catch (e) {
    sendTaskLog('[syncFunction] replicate error: ' + e.message);
  }
}

function hasManifest(dir) {
  try { return !!dir && fs.existsSync(path.join(dir, 'manifest.json')); } catch { return false; }
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

async function attachExistingExtensionPages(browser, slavePagesGetters) {
  try {
    const targets = browser.targets ? browser.targets() : [];
    for (const t of targets) {
      try {
        const u = t.url && t.url();
        if (isExtensionUrl(u)) {
          const page = await t.page();
          if (page) {
            const pid = `ext-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
            lastUrlByPageId.set(pid, u);
            sendTaskLog('[syncFunction] Found extension page, binding for sync: ' + (u || '<unknown>'));
            setupMasterPageSync(page, pid, slavePagesGetters);
            page.on('framenavigated', async (frame) => {
              if (frame === page.mainFrame()) {
                const navEvt = { type: 'navigate', pageId: pid, url: page.url() };
                lastUrlByPageId.set(pid, navEvt.url);
                for (const getPage of slavePagesGetters) {
                  const sp = await getPage(pid);
                  if (sp && navEvt.url) await replicateEventToSlave(sp, navEvt);
                }
              }
            });
          }
        }
      } catch (e) {}
    }
  } catch (e) {
    sendTaskLog('[syncFunction] attachExistingExtensionPages error: ' + e.message);
  }
}

async function handleTargetCreated(target, slavePagesGetters) {
  try {
    const type = target.type();
    if (type !== 'page' && type !== 'background_page') return;
    const u = target.url && target.url();
    if (isExtensionUrl(u)) {
      const page = await target.page();
      if (!page) return;
      const pageId = `ext-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      lastUrlByPageId.set(pageId, u || '');
  sendTaskLog('[syncFunction] Captured extension target: ' + (u || '<unknown>'));
      setupMasterPageSync(page, pageId, slavePagesGetters);

      try {
        const navEvt = { type: 'navigate', pageId, url: page.url() };
        for (const getPage of slavePagesGetters) {
          const sp = await getPage(pageId);
          if (sp && navEvt.url) await replicateEventToSlave(sp, navEvt);
        }
      } catch (e) {}

      page.on('framenavigated', async (frame) => {
        if (frame === page.mainFrame()) {
          const navEvt2 = { type: 'navigate', pageId, url: page.url() };
          lastUrlByPageId.set(pageId, navEvt2.url);
          for (const getPage of slavePagesGetters) {
            const sp = await getPage(pageId);
            if (sp && navEvt2.url) await replicateEventToSlave(sp, navEvt2);
          }
        }
      });
    }
  } catch (e) {
    sendTaskLog('[syncFunction] handleTargetCreated error: ' + e.message);
  }
}

// ----- 主流程 -----
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

  // 启动 Master 与 Slave 浏览器
  const MASTER_WINDOW = { x: 0, y: 0, width: 900, height: 700 };
  const SLAVE_WINDOW = { x: 920, y: 0, width: 900, height: 700 };

  sendTaskLog('[syncFunction] Launching Master browser...');
  const masterBrowser = await launchChromeForEnv(masterEnv, chromePath, savePath, metamaskDir, MASTER_WINDOW);

  sendTaskLog('[syncFunction] Launching Slave browser...');
  const slaveBrowsers = [];
  for (let i = 0; i < slaveEnvs.length; i++) {
    const pos = { ...SLAVE_WINDOW, x: SLAVE_WINDOW.x + i * (SLAVE_WINDOW.width + 20) };
    const b = await launchChromeForEnv(slaveEnvs[i], chromePath, savePath, metamaskDir, pos);
    slaveBrowsers.push(b);
  }

  // 初始页映射：page-0
  const masterPages = await masterBrowser.pages();
  let initialMasterPage = masterPages.find(p => p.url().startsWith('about:blank')) || masterPages[0];

  const slavePagesGetters = slaveBrowsers.map((browser) => {
    const map = new Map();

    async function waitForExtensionTarget(url, timeoutMs = 2500) {
      const isExt = (u) => typeof u === 'string' && u.startsWith('chrome-extension://');
      const start = Date.now();
      let lastSeen = null;
      while (Date.now() - start < timeoutMs) {
        const targets = browser.targets ? browser.targets() : [];
        for (const t of targets) {
          try {
            const tu = t.url && t.url();
            if (isExt(tu)) {
              lastSeen = tu;
              const baseWant = (url || '').split('#')[0].split('?')[0];
              const baseSeen = (tu || '').split('#')[0].split('?')[0];
              if (!url || baseSeen === baseWant) {
                const p = await t.page();
                if (p) return p;
              }
            }
          } catch {}
        }
        await sleep(120);
      }
  if (url) sendTaskLog('[syncFunction] Extension page not found; last seen: ' + (lastSeen || 'null'));
      return null;
    }

    return async function getPage(pageId) {
      if (map.has(pageId)) return map.get(pageId);

      if (pageId && pageId.startsWith('ext-')) {
        const wantUrl = lastUrlByPageId.get(pageId) || null;
        let existing = await waitForExtensionTarget(wantUrl);
        if (!existing && wantUrl) {
          existing = await openExtensionOnSlave(browser, wantUrl);
        }
        if (existing) {
          map.set(pageId, existing);
          return existing;
        }
        return null; // 等待下一次事件再尝试
      }

      // 普通页面：按需创建，并放宽 CSP 以提升注入成功率
      const p = await browser.newPage();
      try { await p.setBypassCSP(true); } catch {}
      map.set(pageId, p);
      return p;
    };
  });

  let pageIndex = 0;
  const firstId = 'page-0';
  setupMasterPageSync(initialMasterPage, firstId, slavePagesGetters);
  pageIndex = 1;

  // 主页面导航 -> 同步到从页面
  initialMasterPage.on('framenavigated', async (frame) => {
    if (frame === initialMasterPage.mainFrame()) {
      const navEvt = { type: 'navigate', pageId: firstId, url: initialMasterPage.url() };
      lastUrlByPageId.set(firstId, navEvt.url);
      for (const getPage of slavePagesGetters) {
        const sp = await getPage(firstId);
        if (sp) await replicateEventToSlave(sp, navEvt);
      }
    }
  });

  // 监听 Master 新 target，包括扩展页面
  masterBrowser.on('targetcreated', async (target) => {
    try {
      const type = target.type();
      if (type === 'page') {
        const newPage = await target.page();
        if (!newPage) return;
        const url = newPage.url();
        if (isExtensionUrl(url)) {
          // 交给扩展处理器
          await handleTargetCreated(target, slavePagesGetters);
          return;
        }  

        const pageId = `page-${pageIndex++}`;
        lastUrlByPageId.set(pageId, url || '');
        setupMasterPageSync(newPage, pageId, slavePagesGetters);
        try {
          const navEvt = { type: 'navigate', pageId, url: newPage.url() };
          for (const getPage of slavePagesGetters) {
            const sp = await getPage(pageId);
            if (sp && navEvt.url) await replicateEventToSlave(sp, navEvt);
          }
        } catch {}
        newPage.on('framenavigated', async (frame) => {
          if (frame === newPage.mainFrame()) {
            const navEvt2 = { type: 'navigate', pageId, url: newPage.url() };
            lastUrlByPageId.set(pageId, navEvt2.url);
            for (const getPage of slavePagesGetters) {
              const sp = await getPage(pageId);
              if (sp && navEvt2.url) await replicateEventToSlave(sp, navEvt2);
            }
          }
        });
      } else if (target.type && (target.type() === 'background_page')) {
        await handleTargetCreated(target, slavePagesGetters);
      }
    } catch (e) {
      sendTaskLog('[syncFunction] targetcreated handler error: ' + e.message);
    }
  });

  // 启动后扫描已存在的扩展页面并绑定
  await attachExistingExtensionPages(masterBrowser, slavePagesGetters);

  // 进程保活，直到收到终止
  sendTaskLog('[syncFunction] Master/Slave synchronization running; awaiting server instructions to exit.');
  sendTaskLog('[syncFunction] Debug tip: regular pages use page.goto, extension sync attaches/creates windows; CDP will create one if the slave cannot see it.');
  // 不发送 task_completed，让服务端以心跳维持任务
})();
