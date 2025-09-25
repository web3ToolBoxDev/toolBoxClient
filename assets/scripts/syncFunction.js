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
    throw new Error(`用户数据目录不存在: ${userDataDir}`);
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

function setupMasterPageSync(masterPage, pageId, slavePageGetters) {
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
    // 避免向 globalThis/window 写入属性，使用闭包中常量承载 pageId
    const __PID = pid;
    const safeReport = (msg) => { try { if (window.__reportEvent) window.__reportEvent(msg); } catch (e) {} };

    const getSelector = (el) => {
      if (!(el instanceof Element)) return null;
      if (el.id) return `#${el.id}`;
      const parts = [];
      while (el && el.nodeType === 1) {
        const tag = el.tagName; // 使用局部常量避免闭包引用循环变量
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
      if (root && root.dataset && root.dataset.syncBound === '1') return; // 避免重复绑定
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

async function replicateEventToSlave(page, evt) {
  try {
    if (evt.type === 'navigate') {
      await page.goto(evt.url, { waitUntil: 'networkidle2' });
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
    console.error('[syncFunction] 缺少 chromePath 或 savePath');
    return gracefulExit();
  }

  // 解析 master/slaves 对应的 env
  const { masterId, slaveIds = [] } = taskDataFromFront || {};
  const masterEnv = envs.find(e => e && e.bindWalletId === masterId);
  const slaveEnvs = envs.filter(e => e && slaveIds.includes(e.bindWalletId));
  if (!masterEnv || slaveEnvs.length === 0) {
    console.error('[syncFunction] 未找到 master 或 slaves 的环境');
    return gracefulExit();
  }

  const metamaskDir = resolveMetamaskDir(walletExtensionPath);
  if (!metamaskDir) {
    sendTaskLog('[syncFunction] 未找到有效的 MetaMask 扩展目录（缺少 manifest.json）');
    console.error('[syncFunction] MetaMask 扩展目录无效，manifest.json 不存在');
    return gracefulExit();
  }
  sendTaskLog('[syncFunction] 使用扩展目录: ' + metamaskDir);

  // 启动 Master 与 Slave 浏览器
  const MASTER_WINDOW = { x: 0, y: 0, width: 900, height: 700 };
  const SLAVE_WINDOW = { x: 920, y: 0, width: 900, height: 700 };

  sendTaskLog('[syncFunction] 启动 Master 浏览器...');
  const masterBrowser = await launchChromeForEnv(masterEnv, chromePath, savePath, metamaskDir, MASTER_WINDOW);

  sendTaskLog('[syncFunction] 启动 Slave 浏览器...');
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
    return async function getPage(pageId) {
      // 如果不存在则按需创建
      if (!map.has(pageId)) {
        const p = await browser.newPage();
        map.set(pageId, p);
        return p;
      }
      return map.get(pageId);
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
      for (const getPage of slavePagesGetters) {
        const sp = await getPage(firstId);
        if (sp) await replicateEventToSlave(sp, navEvt);
      }
    }
  });

  // 监听 Master 新标签页，分配 pageId，并在各 Slave 创建对应标签页
  masterBrowser.on('targetcreated', async (target) => {
    if (target.type() === 'page') {
      const newPage = await target.page();
      const pageId = `page-${pageIndex++}`;
      setupMasterPageSync(newPage, pageId, slavePagesGetters);
      // 初始导航同步
      try {
        const navEvt = { type: 'navigate', pageId, url: newPage.url() };
        for (const getPage of slavePagesGetters) {
          const sp = await getPage(pageId);
          if (sp && navEvt.url) await replicateEventToSlave(sp, navEvt);
        }
      } catch {}
      // 新标签页后续导航同步（例如地址栏输入后按回车）
      newPage.on('framenavigated', async (frame) => {
        if (frame === newPage.mainFrame()) {
          const navEvt2 = { type: 'navigate', pageId, url: newPage.url() };
          for (const getPage of slavePagesGetters) {
            const sp = await getPage(pageId);
            if (sp && navEvt2.url) await replicateEventToSlave(sp, navEvt2);
          }
        }
      });
    }
  });

  // 进程保活，直到收到终止
  sendTaskLog('[syncFunction] 已启动 Master/Slave 同步，按服务端控制结束。');
  // 不发送 task_completed，让服务端以心跳维持任务
})();
