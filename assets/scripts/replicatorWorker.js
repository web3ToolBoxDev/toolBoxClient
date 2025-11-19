// replicatorWorker.js
// A slave process that mirrors master events into its own browser instance.
// Launch one worker per slave environment (env).
// Communication protocol (IPC):
//  - { type: 'init', payload: { env, chromePath, savePath, metamaskDir, position } }
//  - { type: 'event', payload: { ...evtFromMaster } }
//  - Optional: { type: 'shutdown' }
//
// Requirements: puppeteer or puppeteer-extra should be available in your project.
// If you already use puppeteer-extra with plugins, switch the import below accordingly.

const path = require('path');

// Prefer the same lib you use in master. Fall back to puppeteer if puppeteer-extra not present.
let puppeteer;
try {
  puppeteer = require('puppeteer-extra');
} catch (e) {
  puppeteer = require('puppeteer');
}

let browser = null;
const pageMap = new Map();      // pageId -> Page
const lastUrl = new Map();      // pageId -> last navigated url

const NON_TYPABLE_INPUT_TYPES = new Set([
  'checkbox','radio','range','color','file','button','submit','reset','image',
  'date','datetime-local','month','time','week'
]);
const SELECT_ALL_MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';
const EVENT_READY_TIMEOUT_MS = 5000;
const EVENT_READY_POLL_INTERVAL_MS = 120;
const WAITABLE_EVENT_TYPES = new Set(['click', 'input', 'change']);
let debugLogsEnabled = /^1|true$/i.test(String(process.env.TOOLBOX_DEBUG_LOGS || process.env.TOOLBOX_SLAVE_DEBUG || ''));

let slaveIndex = 0;
let slaveLabel = '';

function formatSlaveTag() {
  const ordinal = slaveIndex || 0;
  const readable = slaveLabel && slaveLabel !== `slave-${ordinal}` ? slaveLabel : '';
  if (ordinal) {
    return readable ? `slave${ordinal}(${readable})` : `slave${ordinal}`;
  }
  return readable || 'slave';
}

function log(msg, { debug = true } = {}) {
  const payload = {
    type: debug ? 'debug-log' : 'task-log',
    message: msg,
    slaveIndex,
    slaveLabel,
  };

  if (process && process.send) {
    if (!debug || debugLogsEnabled) {
      process.send(payload);
    }
  } else {
    const prefix = `[replicatorWorker][${formatSlaveTag()}${debug ? '|debug' : ''}]`;
    console.log(`${prefix} ${msg}`);
  }
}

function buildFingerprints(env) {
  const base = {
    canvas: env?.canvas,
    hardware: env?.hardware,
    screen: env?.screen,
    clientHint: env?.clientHint,
    languages_js: env?.language_js,
    languages_http: env?.language_http,
    fonts_remove: (env?.fonts_remove || '') + ',Tahoma'
  };
  if (env?.useProxy) {
    base.position = env.position;
    base.timeZone = env.timeZone;
    base.webrtc_public = env.webrtc_public;
  }
  return JSON.stringify(base);
}

function isExtensionUrl(u) {
  return typeof u === 'string' && u.startsWith('chrome-extension://');
}

// 简单的 CSS 选择器转义，处理 Tailwind 等类名中的特殊字符
function escapeCssSelector(sel = '') {
  try {
    return sel
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\//g, '\\/');
  } catch { return sel; }
}

// 判断选择器是否过于泛化（仅标签名且常见非唯一标签）
function isGenericSelector(sel = '') {
  try {
    const s = String(sel || '').trim();
    if (!s) return true;
    const onlyTag = /^[a-zA-Z][a-zA-Z0-9-]*$/.test(s);
    if (!onlyTag) return false;
    const low = s.toLowerCase();
    return ['div','span','path','svg','p','li','g','use'].includes(low);
  } catch { return true; }
}

async function selectorIsUniqueOnPage(page, selector) {
  if (!selector) return false;
  const sel = escapeCssSelector(selector);
  try {
    const count = await page.evaluate((css) => {
      try {
        return document.querySelectorAll(css).length;
      } catch {
        return 0;
      }
    }, sel);
    return count === 1;
  } catch {
    return false;
  }
}

function shouldWaitForSelector(evt = {}) {
  if (!evt || !WAITABLE_EVENT_TYPES.has(evt.type)) return false;
  if (!evt.selector) return false;
  if (evt.type === 'click' && isGenericSelector(evt.selector)) return false;
  return true;
}

async function waitForSelectorReady(page, evt) {
  if (!shouldWaitForSelector(evt)) return true;
  const sel = escapeCssSelector(evt.selector);
  const deadline = evt.__readyDeadline || (evt.__readyDeadline = Date.now() + EVENT_READY_TIMEOUT_MS);
  while (Date.now() <= deadline) {
    try {
      await page.waitForSelector(sel, { timeout: Math.min(EVENT_READY_POLL_INTERVAL_MS, EVENT_READY_TIMEOUT_MS) });
      return true;
    } catch {}
    try { await page.waitForTimeout(EVENT_READY_POLL_INTERVAL_MS); } catch {}
  }
  return false;
}

function isTextLikeInputEvent(evt = {}) {
  try {
    const tag = (evt.tag || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const inputType = (evt.inputType || '').toLowerCase();
      if (!inputType) return true;
      return !NON_TYPABLE_INPUT_TYPES.has(inputType);
    }
    if (evt.isContentEditable) return true;
    return false;
  } catch {
    return false;
  }
}

async function focusElementForInput(page, selector) {
  const sel = selector ? escapeCssSelector(selector) : null;
  if (sel) {
    try {
      await page.waitForSelector(sel, { timeout: 2500 });
      await page.focus(sel);
      return true;
    } catch {}
  }
  try {
    await page.evaluate(() => {
      try {
        if (document && document.activeElement && typeof document.activeElement.focus === 'function') {
          document.activeElement.focus();
        }
      } catch {}
    });
    return true;
  } catch {}
  return false;
}

async function selectAllAndClear(page) {
  try {
    await page.keyboard.down(SELECT_ALL_MODIFIER);
    await page.keyboard.press('KeyA');
  } finally {
    try { await page.keyboard.up(SELECT_ALL_MODIFIER); } catch {}
  }
  try { await page.keyboard.press('Backspace'); } catch {}
}

function computeTypeDelay(text = '') {
  const len = Math.max(1, text.length);
  return Math.max(8, Math.min(35, Math.round(200 / len)));
}

async function simulateTextTypingInput(page, evt, { maskLog = false } = {}) {
  try {
    try { await page.bringToFront(); } catch {}
    const focused = await focusElementForInput(page, evt.selector);
    if (!focused) {
      return false;
    }
    await selectAllAndClear(page);
    const text = evt.value === undefined || evt.value === null ? '' : String(evt.value);
    if (text) {
      await page.keyboard.type(text, { delay: computeTypeDelay(text) });
    }
    log(`Simulated typing input on ${evt.selector || '<active>'} => ${maskLog ? '***' : text}`);
    return true;
  } catch (e) {
    log(`Failed to simulate typing on ${evt.selector || '<active>'}: ${e.message}`, { debug: false });
    return false;
  }
}

async function dispatchTextChangeEvent(page, evt) {
  try {
    const selector = evt.selector ? escapeCssSelector(evt.selector) : null;
    const dispatched = await page.evaluate((payload) => {
      let el = payload.selector ? document.querySelector(payload.selector) : null;
      if (!el && document && document.activeElement) el = document.activeElement;
      if (!el) return false;
      try { el.focus && el.focus(); } catch {}
      const win = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      const EventCtor = (win && win.Event) || Event;
      try {
        const evtInstance = new EventCtor('change', { bubbles: true });
        el.dispatchEvent(evtInstance);
        return true;
      } catch {
        try {
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        } catch {}
      }
      return false;
    }, { selector });
    if (dispatched) {
      log(`Dispatched change event on ${selector || '<active>'}`);
      return true;
    }
  } catch (e) {
    log(`Failed to dispatch change on ${evt.selector || '<active>'}: ${e.message}`, { debug: false });
  }
  return false;
}

async function launch(env, chromePath, savePath, metamaskDir, position) {
  const args = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-infobars',
  ];
  // log(`Slave ${JSON.stringify(env)}`);
  // log(`Chrome path: ${chromePath}`);
  // log(`Metamask dir: ${metamaskDir}`);
  // log(`Save path: ${savePath}`);
  // log(`Position: ${JSON.stringify(position)}`);

  if (env?.language_js) {
    args.push(`--lang=${env.language_js}`);
  }
  if (env?.user_agent) {
    args.push(`--user-agent=${env.user_agent}`);
  }
  if (env?.proxyUrl) {
    args.push(`--proxy-server=${env.proxyUrl}`);
  }
  if (metamaskDir) {
    args.push(`--disable-extensions-except=${metamaskDir}`);
    args.push(`--load-extension=${metamaskDir}`);
  }
  if (position && Number.isFinite(position.x)) {
    args.push(`--window-position=${position.x},${position.y}`);
    args.push(`--window-size=${position.width || 1200},${position.height || 900}`);
  }
  if (env) {
    args.push(`--toolbox=${buildFingerprints(env)}`);
  }

  const userDataDir = path.join(savePath || path.join(__dirname, '.profiles'), env?.id || 'default-slave');

  browser = await puppeteer.launch({
    headless: false,
    executablePath: chromePath,
    userDataDir,
    ignoreDefaultArgs: ['--enable-automation'],
    args,
    defaultViewport: null,
  });

  // Optional: open a blank page to speed up first navigation
  const [page] = await browser.pages();
  if (page) {
    try { await page.setBypassCSP(true); } catch {}
    if (env?.user_agent) {
      try { await page.setUserAgent(env.user_agent); } catch {}
    }
  }

  log(`Launched slave browser for env ${env?.id || 'unknown'}`, { debug: false });
}

async function openOrAttachExtensionPage(targetUrl) {
  // 尝试发现本地扩展 ID
  let localExtOrigin = null;
  const pages = await browser.pages();
  for (const p of pages) {
    const url = p.url();
    if (url && url.startsWith('chrome-extension://')) {
      const m = url.match(/^chrome-extension:\/\/([^/]+)/);
      if (m) { localExtOrigin = `chrome-extension://${m[1]}`; break; }
    }
  }

  // 若传入的是主端 URL，可能含有不同的扩展 ID，尝试替换为本地 ID
  let desiredUrl = targetUrl;
  if (targetUrl && localExtOrigin) {
    desiredUrl = targetUrl.replace(/^chrome-extension:\/\/[^/]+/, localExtOrigin);
  }

  // 优先复用已有同 URL 的扩展页
  for (const p of pages) {
    const url = p.url();
    if (url && url.startsWith('chrome-extension://')) {
      if (!desiredUrl || url === desiredUrl) return p;
    }
  }
  // 未找到：如果提供了 URL，则直接打开
  if (desiredUrl) {
    const p = await browser.newPage();
    try { await p.setBypassCSP(true); } catch {}
    await p.goto(desiredUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    return p;
  }
  return null;
}

async function getOrCreatePage(pageId, wantUrl) {
  if (pageMap.has(pageId)) return pageMap.get(pageId);

  let p = null;
  const targetUrl = wantUrl || lastUrl.get(pageId) || '';
  if (isExtensionUrl(targetUrl)) {
    p = await openOrAttachExtensionPage(targetUrl);
  } else {
    p = await browser.newPage();
    try { await p.setBypassCSP(true); } catch {}
    if (targetUrl) {
      try { await p.goto(targetUrl, { waitUntil: 'domcontentloaded' }); } catch {}
    }
  }
  if (!p) return null;

  pageMap.set(pageId, p);
  return p;
}

// --- Event queue with simple coalescing -------------------------------------
const queue = [];
let draining = false;

function coalesceAndEnqueue(evt) {
  // Remove redundant input events on the same element
  if (evt.type === 'input' && evt.selector) {
    const idx = queue.findIndex(q => q.type === 'input' && q.pageId === evt.pageId && q.selector === evt.selector);
    if (idx >= 0) queue.splice(idx, 1);
  }
  if (evt.type === 'change' && evt.selector) {
    const idx = queue.findIndex(q => q.type === 'change' && q.pageId === evt.pageId && q.selector === evt.selector);
    if (idx >= 0) queue.splice(idx, 1);
  }
  // Coalesce scroll by page
  if (evt.type === 'scroll') {
    const idx = queue.findIndex(q => q.type === 'scroll' && q.pageId === evt.pageId);
    if (idx >= 0) queue.splice(idx, 1);
  }
  // De-dupe navigate to same URL
  if (evt.type === 'navigate') {
    if (lastUrl.get(evt.pageId) === evt.url) {
      return; // skip enqueue
    }
  }
  queue.push(evt);
  if (!draining) void drain();
}

async function drain() {
  draining = true;
  while (queue.length) {
    const evt = queue.shift();
    try {
      await handle(evt);
    } catch (e) {
      log(`handle error (${evt?.type}): ${e.message}`, { debug: false });
    }
  }
  draining = false;
}

async function handle(evt) {
  const { pageId } = evt;

  // 若事件自带 URL，尽早记录（包括 activate/click 等）
  if (evt.url && evt.url !== 'about:blank') {
    if (lastUrl.get(pageId) !== evt.url) lastUrl.set(pageId, evt.url);
  }

  // 提前处理导航，避免为同一 pageId 先创建空白页再另开新标签造成多标签问题
  if (evt.type === 'navigate') {
    const url = evt.url;
    if (!url || url === 'about:blank') return;

    const existing = pageMap.get(pageId) || null;
    lastUrl.set(pageId, url);

    if (isExtensionUrl(url)) {
      const p = await openOrAttachExtensionPage(url);
      if (p) {
        try { await p.setBypassCSP(true); } catch {}
        if (existing && existing !== p) { try { await existing.close({ runBeforeUnload: false }); } catch {} }
        pageMap.set(pageId, p);
        log(`Navigated(extension) bind ${pageId} -> ${url}`);
      }
      return;
    }

    if (existing) {
      try { await existing.goto(url, { waitUntil: 'domcontentloaded' }); } catch {}
      log(`Navigated(reuse) ${pageId} -> ${url}`);
    } else {
      const p = await browser.newPage();
      try { await p.setBypassCSP(true); } catch {}
      try { await p.goto(url, { waitUntil: 'domcontentloaded' }); } catch {}
      pageMap.set(pageId, p);
      log(`Navigated(new) ${pageId} -> ${url}`);
    }
    return;
  }

  // 非导航事件：若还没有记录 URL，但事件提供了 url，则补充
  if (!lastUrl.has(pageId) && evt.url && evt.url !== 'about:blank') {
    lastUrl.set(pageId, evt.url);
  }

  const firstBind = !pageMap.has(pageId);
  // 非导航事件再去获取/创建页面（若新建且有 URL，会自动导航）
  let page = await getOrCreatePage(pageId, lastUrl.get(pageId));
  if (!page) return;

  // 若已存在页面但尚未在目标 URL 上，先导航再执行点击/输入
  const targetUrl = lastUrl.get(pageId) || '';
  try {
    const currentUrl = page.url();
    let needNav = false;
    if (targetUrl) {
      if (!currentUrl || currentUrl === 'about:blank') {
        needNav = true;
      } else {
        try {
          const cu = new URL(currentUrl);
          const tu = new URL(targetUrl);
          // 仅当来源不同才在非导航事件中跳转，避免 SPA 反复 reload
          if (cu.origin !== tu.origin) needNav = true;
        } catch { /* ignore URL parse */ }
      }
    }
    if (needNav) {
      if (isExtensionUrl(targetUrl)) {
        const p2 = await openOrAttachExtensionPage(targetUrl);
        if (p2) {
          try { await p2.setBypassCSP(true); } catch {}
          if (p2 !== page) { try { await page.close({ runBeforeUnload: false }); } catch {} }
          page = p2;
          pageMap.set(pageId, page);
          log(`Rebind(ext) ${pageId} -> ${targetUrl}`);
        }
      } else {
        try { await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }); } catch {}
        log(`Navigate(on-demand) ${pageId} -> ${targetUrl}`);
      }
      try { await page.waitForTimeout(250); } catch {}
    }
  } catch {}

  if (firstBind) {
    log(`Bind on event: ${pageId} -> ${lastUrl.get(pageId) || ''}`);
    try { await page.waitForTimeout(350); } catch {}
  }

  const needsSelectorReady = shouldWaitForSelector(evt);
  if (needsSelectorReady) {
    const ready = await waitForSelectorReady(page, evt);
    if (!ready) {
      log(`Skip ${evt.type} on ${evt.selector || '<no-selector>'} (readiness timeout)`, { debug: false });
      return;
    }
  }

  if (evt.type === 'activate') {
    // Activate the target by bringing it to front
    try {
      await page.bringToFront();
      log(`Activated page: ${pageId} via API`);
    } catch (e) {
      // CDP 兜底
      try {
        const raw = page._client ? (typeof page._client === 'function' ? page._client() : page._client) : null;
        const client = raw || await page.target().createCDPSession();
        await client.send('Page.bringToFront');
        await new Promise(r => setTimeout(r, 80));
        log(`Activated page: ${pageId} via CDP`);
      } catch (e2) {
        log(`Failed to activate page ${pageId}: ${e2.message}`, { debug: false });
      }
    }
    return;
  }

  if (evt.type === 'close') {
    // Close the page
    try {
      const closedPage = pageMap.get(pageId);
      if (closedPage) {
        await closedPage.close();
        pageMap.delete(pageId);
        log(`Closed page: ${pageId}`);
      }
    } catch (e) {
      log(`Failed to close page ${pageId}: ${e.message}`, { debug: false });
    }
    return;
  }

  if (evt.type === 'click') {
    // 确保可见
    try { await page.bringToFront(); } catch {}
    try { await page.waitForTimeout(50); } catch {}

    // 1) 尝试使用较为具体的选择器
    if (evt.selector) {
      const sel = escapeCssSelector(evt.selector);
      let canUseSelector = !isGenericSelector(evt.selector);
      if (!canUseSelector) {
        canUseSelector = await selectorIsUniqueOnPage(page, evt.selector);
      }
      if (canUseSelector) {
        try {
          await page.waitForSelector(sel, { timeout: 1800 });
          const el = await page.$(sel);
          if (el) {
            await el.click({ delay: 10 });
            log(`Clicked via selector: ${sel}`);
            return;
          }
        } catch {}
      }
    }

    // 准备缩放后的坐标（master → slave）
    const masterVW = Number.isFinite(evt.vw) ? evt.vw : 0;
    const masterVH = Number.isFinite(evt.vh) ? evt.vh : 0;

    // 2) DOM 内分发：elementFromPoint + 向上寻找可点击祖先（兼容 shadowRoot）
    if (Number.isFinite(evt.x) && Number.isFinite(evt.y)) {
      try {
        const res = await page.evaluate((payload) => {
          try {
            // 根据 master 视口尺寸缩放坐标
            const curVW = (window && window.innerWidth) || 0;
            const curVH = (window && window.innerHeight) || 0;
            let x = payload.x, y = payload.y;
            if (payload.vw && payload.vh && curVW && curVH) {
              const sx = curVW / payload.vw;
              const sy = curVH / payload.vh;
              x = Math.round(x * sx);
              y = Math.round(y * sy);
            }
            const isClickable = (node) => {
              if (!node || node.nodeType !== 1) return false;
              const tag = (node.tagName || '').toUpperCase();
              if (['BUTTON','A','INPUT','LABEL','SUMMARY'].includes(tag)) return true;
              const role = node.getAttribute && node.getAttribute('role');
              if (role === 'button') return true;
              const tabIdx = node.getAttribute && node.getAttribute('tabindex');
              if (tabIdx !== null && tabIdx !== undefined) return true;
              if (typeof node.onclick === 'function') return true;
              return false;
            };
            const getHost = (n) => {
              const root = n && n.getRootNode ? n.getRootNode() : null;
              return root && root.host ? root.host : null;
            };
            let el = document.elementFromPoint(x, y);
            if (!el) return { kind: 'no-el', x, y };
            let cur = el;
            while (cur && cur !== document && !isClickable(cur)) {
              cur = cur.parentNode || getHost(cur);
            }
            const target = cur || el;
            const evInit = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0 };
            try { target.dispatchEvent(new MouseEvent('pointerdown', evInit)); } catch {}
            try { target.dispatchEvent(new MouseEvent('mousedown', evInit)); } catch {}
            try { target.dispatchEvent(new MouseEvent('pointerup', evInit)); } catch {}
            try { target.dispatchEvent(new MouseEvent('mouseup', evInit)); } catch {}
            try { target.dispatchEvent(new MouseEvent('click', evInit)); } catch {}
            return { kind: 'dom-click', x, y };
          } catch (e) { return { kind: 'dom-click-fail', err: (e && e.message) || String(e) }; }
        }, { x: evt.x, y: evt.y, vw: masterVW, vh: masterVH });
        if (res && res.kind === 'dom-click') { log(`Clicked via dom-click (${res.x},${res.y})`); return; }
      } catch {}
    }

    // 3) 最后兜底为坐标点击（同样按视口缩放）
    if (Number.isFinite(evt.x) && Number.isFinite(evt.y)) {
      try {
        const { x2, y2 } = await page.evaluate((payload) => {
          const curVW = (window && window.innerWidth) || 0;
          const curVH = (window && window.innerHeight) || 0;
          let x = payload.x, y = payload.y;
          if (payload.vw && payload.vh && curVW && curVH) {
            const sx = curVW / payload.vw;
            const sy = curVH / payload.vh;
            x = Math.round(x * sx);
            y = Math.round(y * sy);
          }
          return { x2: x, y2: y };
        }, { x: evt.x, y: evt.y, vw: masterVW, vh: masterVH });
        await page.mouse.click(x2, y2, { delay: 10 });
        log(`Clicked via mouse (${x2},${y2})`);
      } catch {}
    }
    return;
  }

  if (evt.type === 'scroll') {
    await page.evaluate((sx, sy) => window.scrollTo(sx || 0, sy || 0), evt.scrollX, evt.scrollY);
    return;
  }

  if (evt.type === 'input' || evt.type === 'change' || evt.type === 'keydown') {
    const inputTypeLower = (evt.inputType || '').toLowerCase();
    const isPwd = inputTypeLower === 'password' || (evt.tag === 'input' && inputTypeLower === 'password');
    const isTextLike = isTextLikeInputEvent(evt);

    if (evt.type === 'input') {
      if (isPwd) {
        const typedPwd = await simulateTextTypingInput(page, evt, { maskLog: true });
        if (typedPwd) return;
      } else if (isTextLike) {
        const typed = await simulateTextTypingInput(page, evt);
        if (typed) return;
      }
    }

    if (evt.type === 'change') {
      if (isPwd) return;
      if (isTextLike) {
        const dispatched = await dispatchTextChangeEvent(page, evt);
        if (dispatched) return;
      }
    }

    const evalPayload = Object.assign({}, evt, {
      selector: evt.selector ? escapeCssSelector(evt.selector) : null
    });

    await page.evaluate((e) => {
      // 避免使用 instanceof（HTMLInputElement 等）以规避 LavaMoat scuttling 对全局构造器的屏蔽
      let el = e.selector ? document.querySelector(e.selector) : null;
      if (!el && document && document.activeElement) el = document.activeElement;
      if (!el) return;

      const tag = el.tagName ? el.tagName.toLowerCase() : '';
      const inputType = (() => { try { return (el.type || '').toLowerCase(); } catch { return ''; } })();
      const isInput = tag === 'input';
      const isTextarea = tag === 'textarea';
      const isCheckboxLike = isInput && ['checkbox', 'radio'].includes(inputType);

      const getCtor = (name, fallback) => {
        try {
          return (el.ownerDocument && el.ownerDocument.defaultView && el.ownerDocument.defaultView[name]) || fallback;
        } catch { return fallback; }
      };
      const dispatch = (type, init = { bubbles: true }) => {
        try {
          const Ev = getCtor('Event', undefined) || Event;
          el.dispatchEvent(new Ev(type, Object.assign({ bubbles: true }, init)));
        } catch {}
      };
      const dispatchBeforeInput = () => {
        try {
          const IEv = getCtor('InputEvent', undefined);
          if (IEv) el.dispatchEvent(new IEv('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: e.value || '' }));
        } catch {}
      };
      const dispatchInput = () => {
        try {
          const IEv = getCtor('InputEvent', undefined);
          if (IEv) el.dispatchEvent(new IEv('input', { bubbles: true }));
          else el.dispatchEvent(new (getCtor('Event', undefined) || Event)('input', { bubbles: true }));
        } catch { dispatch('input'); }
      };
      const focusEl = () => { try { el.focus && el.focus(); } catch {} };
      const setByNativeSetter = (val) => {
        try {
          let proto = el;
          let desc;
          while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, 'value'))) {
            proto = Object.getPrototypeOf(proto);
          }
          if (desc && typeof desc.set === 'function') {
            desc.set.call(el, val);
          } else {
            // fallback
            // @ts-ignore
            el.value = val;
          }
        } catch {
          // @ts-ignore
          el.value = val;
        }
      };

      if (e.type === 'input') {
        focusEl();
        if (isCheckboxLike) {
          if (typeof e.checked === 'boolean') el.checked = e.checked;
          dispatchInput();
        } else if (isInput || isTextarea || ('value' in el)) {
          setByNativeSetter(e.value ?? '');
          if (inputType === 'password') dispatchBeforeInput();
          dispatchInput();
        } else if (el.isContentEditable) {
          el.textContent = e.value ?? '';
          dispatchInput();
        }
      } else if (e.type === 'change') {
        focusEl();
        if (isCheckboxLike) {
          if (typeof e.checked === 'boolean') el.checked = e.checked;
        } else if ('value' in el || isInput || isTextarea) {
          setByNativeSetter(e.value ?? '');
        } else if (el.isContentEditable) {
          el.textContent = e.value ?? '';
        }
        dispatch('change');
      } else if (e.type === 'keydown') {
        try {
          const KD = getCtor('KeyboardEvent', undefined);
          const init = { bubbles: true, cancelable: true, key: e.key || 'Enter' };
          if (KD) {
            el.dispatchEvent(new KD('keydown', init));
            el.dispatchEvent(new KD('keyup', init));
          } else {
            el.dispatchEvent(new Event('keydown', init));
            el.dispatchEvent(new Event('keyup', init));
          }
        } catch {}
      }
    }, evalPayload);
    return;
  }
}

process.on('message', async (msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'init') {
    const payload = msg.payload || {};
    const { env, chromePath, savePath, metamaskDir, position } = payload;
    if (Number.isFinite(payload.slaveIndex)) {
      slaveIndex = Number(payload.slaveIndex);
    }
    const derivedLabel = payload.slaveLabel || env?.alias || env?.name || env?.bindWalletId || env?.id;
    if (derivedLabel) slaveLabel = derivedLabel;
    if (typeof payload.enableDebugLogs === 'boolean') {
      debugLogsEnabled = payload.enableDebugLogs;
    }
    try {
      await launch(env || {}, chromePath, savePath, metamaskDir, position);
      log('slave ready', { debug: false });
    } catch (e) {
      log('failed to launch: ' + e.message, { debug: false });
      process.exitCode = 1;
    }
    return;
  }
  if (msg.type === 'event') {
    coalesceAndEnqueue(msg.payload);
    return;
  }
  if (msg.type === 'shutdown') {
    try {
      await browser?.close();
    } catch {}
    process.exit(0);
  }
});

process.on('uncaughtException', (e) => log('uncaughtException: ' + e.message, { debug: false }));
process.on('unhandledRejection', (e) => log('unhandledRejection: ' + (e && e.message ? e.message : String(e)), { debug: false }));
