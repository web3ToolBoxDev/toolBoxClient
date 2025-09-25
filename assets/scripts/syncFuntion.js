
import chromeLauncher from 'chrome-launcher';
import puppeteer from 'puppeteer';
import WebSocket, { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';

// —— 配置区 ——

// unpacked MetaMask 本地目录
const LOCAL_METAMASK_DIR    = path.resolve(process.cwd(), 'metamask-chrome-12.18.3');
// unpacked 版本的扩展 ID
const METAMASK_EXTENSION_ID = 'nkbihfbeogaeaoehlefnkodbefgpgknn';

// Master/Slave 浏览器窗口位置与尺寸
const MASTER_WINDOW = { x: 0,   y: 0,   width: 800, height: 600 };
const SLAVE_WINDOW  = { x: 800, y: 0,   width: 800, height: 600 };
// 初始页面
const DEFAULT_URL   = 'about:blank';
// WebSocket 端口
const WS_PORT       = 3000;

// 用户数据目录
const MASTER_USER_DATA = path.resolve(process.cwd(), '.chrome_master_profile');
const SLAVE_USER_DATA  = path.resolve(process.cwd(), '.chrome_slave_profile');

// 判断是 Master 还是 Slave
const role = process.argv[2] || 'master';
if (!['master', 'slave'].includes(role.toLowerCase())) {
  console.error('参数错误！请使用： node index.js master 或 node index.js slave');
  process.exit(1);
}

// 获取系统 Chrome 可执行文件路径
async function getChromeExecutable() {
  const installations = await chromeLauncher.Launcher.getInstallations();
  if (installations && installations.length) {
    return installations[0]; // 取第一个安装路径
  }
  throw new Error('未找到系统 Chrome 可执行文件路径');
}

// —— Master 端逻辑 —— 
async function startMaster() {
  // —— 1. 先启动 WS Server，并把收到的消息再广播给其它客户端 —— 
  const wss = new WebSocketServer({ port: WS_PORT });
  console.log('[Master WS] Server 已就绪，监听端口', WS_PORT);

  const slaves = new Set();
  wss.on('connection', ws => {
    console.log('[Master WS] 有客户端连接');
    slaves.add(ws);

    // 收到来自任意客户端（包括页面里的 WSClient）的消息，就转发给其他所有客户端
    ws.on('message', rawMsg => {
      for (const cli of slaves) {
        if (cli !== ws && cli.readyState === WebSocket.OPEN) {
          cli.send(rawMsg);
        }
      }
    });

    ws.on('close', () => {
      slaves.delete(ws);
      console.log('[Master WS] 客户端断开');
    });
  });

  // —— 2. 再启动 Puppeteer 浏览器并加载 MetaMask —— 
  console.log('[Master] 获取系统 Chrome 路径...');
  const chromePath = await getChromeExecutable();
  console.log(`[Master] Chrome 可执行路径：${chromePath}`);

  console.log('[Master] 使用 Puppeteer 启动 Master 浏览器 (加载本地 MetaMask)...');
  const browserMaster = await puppeteer.launch({
    headless: false,
    executablePath: chromePath,
    userDataDir: MASTER_USER_DATA,
    defaultViewport: null,
    args: [
      `--window-position=${MASTER_WINDOW.x},${MASTER_WINDOW.y}`,
      `--window-size=${MASTER_WINDOW.width},${MASTER_WINDOW.height}`,
      `--disable-extensions-except=${LOCAL_METAMASK_DIR}`,
      `--load-extension=${LOCAL_METAMASK_DIR}`
    ]
  });
  console.log('[Master] 浏览器已启动，MetaMask 已加载。');

  // 多标签页 & 页面同步
  const masterPages = [];
  const pageMap = new Map();
  let pageIndex = 0;

  // 初始化 page-0
  const initialPages = await browserMaster.pages();
  let initialPage = initialPages.find(p => p.url().startsWith('about:blank'));
  if (!initialPage) initialPage = initialPages[0];
  const firstId = 'page-0';
  masterPages.push({ pageId: firstId, page: initialPage });
  pageMap.set(initialPage, firstId);
  await setupMasterPage(initialPage, firstId);
  pageIndex = 1;

  // 监听新标签页创建
  browserMaster.on('targetcreated', async target => {
    if (target.type() === 'page') {
      const newPage = await target.page();
      const pageId = `page-${pageIndex++}`;
      masterPages.push({ pageId, page: newPage });
      pageMap.set(newPage, pageId);
      console.log(`[Master] 新标签页创建，ID=${pageId}`);
      await setupMasterPage(newPage, pageId);
      // 将新标签创建消息广播给 Slave
      for (const ws of slaves) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'newtab', pageId }));
        }
      }
    }
  });

  // 注入页面同步脚本：滚动、元素点击、输入、导航
  async function setupMasterPage(page, pageId) {
    await page.evaluateOnNewDocument(pageId => {
      console.log('[Master Debug] evaluateOnNewDocument 注入 page=' + pageId);
      window.__PAGE_ID = pageId;

      const ws = new WebSocket('ws://localhost:3000');
      window.__MASTER_WS__ = ws;
      ws.addEventListener('open', () => {
        console.log('[Master Debug] 页面 ' + pageId + ' 的 WS 已连接');
        if (window.location.href && window.location.href !== 'about:blank') {
          const initMsg = {
            type: 'navigate',
            pageId: window.__PAGE_ID,
            url: window.location.href
          };
          ws.send(JSON.stringify(initMsg));
          console.log('[Master Debug] 已 send navigate →', initMsg);
        }
      });
      ws.addEventListener('error', e => {
        console.error('[Master Debug] 页面 ' + pageId + ' 的 WS 错误：', e);
      });

      function getUniqueSelector(el) {
        if (!(el instanceof Element)) return null;
        if (el.id) return `#${el.id}`;
        const parts = [];
        while (el && el.nodeType === 1) {
          let sel = el.tagName.toLowerCase();
          if (el.classList.length > 0) sel += `.${el.classList.item(0)}`;
          const parent = el.parentNode;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
            if (siblings.length > 1) {
              const idx = siblings.indexOf(el) + 1;
              sel += `:nth-of-type(${idx})`;
            }
          }
          parts.unshift(sel);
          el = el.parentElement;
        }
        return parts.join(' > ');
      }

      // 点击事件监听
      window.addEventListener('click', e => {
        console.log(`[Master Debug] 页面 ${pageId} 拦截到点击：`, e.target.tagName, `(${e.clientX},${e.clientY})`);
        const selector = getUniqueSelector(e.target);
        const msg = {
          type: 'click',
          pageId: pageId,
          x: e.clientX,
          y: e.clientY,
          button: e.button,
          selector
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
          console.log('[Master Debug] 已 send click →', msg);
        } else {
          console.warn('[Master Debug] WS 未打开，无法 send click');
        }
      }, true);

      // 输入事件监听
      window.addEventListener('input', e => {
        const target = e.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) {
          const selector = getUniqueSelector(target);
          const value = (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
            ? target.value
            : target.innerText;
          console.log(`[Master Debug] 页面 ${pageId} 拦截到输入：`, selector, value);
          const msg = {
            type: 'input',
            pageId: pageId,
            selector,
            value
          };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
            console.log('[Master Debug] 已 send input →', msg);
          }
        }
      }, true);

      // 滚动事件监听
      let scrollTimeout = null;
      window.addEventListener('scroll', () => {
        if (scrollTimeout) return;
        scrollTimeout = setTimeout(() => {
          console.log(`[Master Debug] 页面 ${pageId} 拦截到 scroll：(${window.scrollX},${window.scrollY})`);
          const msg = {
            type: 'scroll',
            pageId: pageId,
            scrollX: window.scrollX,
            scrollY: window.scrollY
          };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
            console.log('[Master Debug] 已 send scroll →', msg);
          }
          scrollTimeout = null;
        }, 100);
      }, true);

      // 单页应用的后退/前进监听
      window.addEventListener('popstate', () => {
        const msg = {
          type: 'navigate',
          pageId: pageId,
          url: window.location.href
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
          console.log('[Master Debug] 已 send navigate →', msg);
        }
      });
    }, pageId);

    // 监听主进程中的导航（直接链接跳转）
    page.on('framenavigated', async frame => {
      if (frame === page.mainFrame()) {
        const newUrl = page.url();
        console.log(`[Master] 页面 ${pageId} 导航到 ${newUrl}`);
        const navMsg = {
          type: 'navigate',
          pageId,
          url: newUrl
        };
        for (const ws of slaves) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(navMsg));
          }
        }
      }
    });
  }

  // 侦听 MetaMask 通知页(notification.html) 弹出并同步
  browserMaster.on('targetcreated', async target => {
    const url = target.url();
    if (url.startsWith(`chrome-extension://${METAMASK_EXTENSION_ID}/notification.html`)) {
      const notifPage = await target.page();
      if (!notifPage) return;
      console.log('[Master] 检测到 MetaMask 通知页，URL:', url);
      const notifMsg = { type: 'open-metamask-notification', url };
      for (const ws of slaves) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(notifMsg));
        }
      }
    }
  });

  // MetaMask popup 同步：按 Ctrl+M
  console.log('[Master] 按 Ctrl+M 打开 MetaMask popup，按 Ctrl+C 退出。');
  process.stdin.setRawMode(true);
  process.stdin.on('data', async buffer => {
    if (buffer[0] === 0x0d) { // Ctrl+M
      console.log('[Master] 收到 Ctrl+M，调用 chrome.action.openPopup()');
      await masterOpenMetaMaskPopup(browserMaster);
      const popupMsg = { type: 'open-metamask-popup' };
      for (const ws of slaves) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(popupMsg));
        }
      }
    }
    if (buffer[0] === 0x03) process.exit(0); // Ctrl+C
  });
}

async function masterOpenMetaMaskPopup(browser) {
  const targets = await browser.targets();
  const bgTarget = targets.find(
    t => t.url().startsWith(`chrome-extension://${METAMASK_EXTENSION_ID}`) &&
         t.type() === 'background_page'
  );
  if (!bgTarget) {
    console.error('[Master] 无法定位 MetaMask background target');
    return;
  }
  const bgPage = await bgTarget.page();
  if (!bgPage) {
    console.error('[Master] 无法获取 MetaMask background page');
    return;
  }
  try {
    await bgPage.evaluate(() => chrome.action.openPopup());
    console.log('[Master] 已调用 chrome.action.openPopup()');
  } catch (e) {
    console.error('[Master] 调用 chrome.action.openPopup() 失败：', e.message);
  }
}

// —— Slave 端逻辑 —— 
async function startSlave() {
  console.log('[Slave] 获取系统 Chrome 路径...');
  const chromePath = await getChromeExecutable();
  console.log(`[Slave] Chrome 可执行路径：${chromePath}`);

  console.log('[Slave] 使用 Puppeteer 启动 Slave Chrome (加载本地 MetaMask)...');
  const browserSlave = await puppeteer.launch({
    headless: false,
    executablePath: chromePath,
    userDataDir: SLAVE_USER_DATA,
    defaultViewport: null,
    args: [
      `--window-position=${SLAVE_WINDOW.x},${SLAVE_WINDOW.y}`,
      `--window-size=${SLAVE_WINDOW.width},${SLAVE_WINDOW.height}`,
      `--disable-extensions-except=${LOCAL_METAMASK_DIR}`,
      `--load-extension=${LOCAL_METAMASK_DIR}`
    ]
  });
  console.log('[Slave] 浏览器已启动，MetaMask 已加载。');

  // 多标签页 & 页面同步
  const slavePages = new Map();

  // page-0 初始化
  const allPages = await browserSlave.pages();
  let initialPage = allPages.find(p => p.url().startsWith('about:blank'));
  if (!initialPage) initialPage = allPages[0];
  slavePages.set('page-0', initialPage);
  console.log('[Slave] 分配 page-0');

  // WebSocket 客户端
  const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
  ws.on('open', () => {
    console.log('[Slave Debug] WS 已连接 Master');
  });
  ws.on('error', err => {
    console.error('[Slave Debug] WS 错误：', err);
  });

  ws.on('message', async raw => {
    console.log('[Slave Debug] 收到 raw 消息：', raw.toString());
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      console.error('[Slave Debug] JSON.parse 失败：', e);
      return;
    }

    // 1. 新标签页
    if (msg.type === 'newtab') {
      const { pageId } = msg;
      const newPage = await browserSlave.newPage();
      slavePages.set(pageId, newPage);
      console.log(`[Slave Debug] 创建新标签页 ${pageId}`);
      return;
    }

    // 2. 页面导航
    if (msg.type === 'navigate') {
      const { pageId, url } = msg;
      const targetPage = slavePages.get(pageId);
      if (targetPage) {
        console.log(`[Slave Debug] 页面 ${pageId} 导航到 ${url}`);
        try {
          await targetPage.goto(url, { waitUntil: 'networkidle2' });
        } catch (err) {
          console.warn(`[Slave Debug] 页面 ${pageId} 导航失败：`, err.message);
        }
      }
      return;
    }

    // 3. 点击
    if (msg.type === 'click') {
      const { pageId, x, y, selector } = msg;
      console.log(`[Slave Debug] 收到 click → page=${pageId}, (${x},${y}), selector=${selector}`);
      const targetPage = slavePages.get(pageId);
      if (targetPage) {
        let clicked = false;
        if (selector) {
          try {
            await targetPage.waitForSelector(selector, { timeout: 3000 });
            const el = await targetPage.$(selector);
            if (el) {
              console.log(`[Slave Debug] 页面 ${pageId} 用 selector 点击 ${selector}`);
              await el.click();
              clicked = true;
            }
          } catch {
            console.warn(`[Slave Debug] 页面 ${pageId} selector="${selector}" 未找到，尝试坐标点击`);
          }
        }
        if (!clicked) {
          console.log(`[Slave Debug] 页面 ${pageId} 坐标点击 (${x},${y})`);
          await targetPage.mouse.click(x, y);
        }
      }
      return;
    }

    // 4. 滚动
    if (msg.type === 'scroll') {
      const { pageId, scrollX, scrollY } = msg;
      console.log(`[Slave Debug] 收到 scroll → page=${pageId}, (${scrollX},${scrollY})`);
      const targetPage = slavePages.get(pageId);
      if (targetPage) {
        await targetPage.evaluate((xx, yy) => window.scrollTo(xx, yy), scrollX, scrollY);
      }
      return;
    }

    // 5. 输入
    if (msg.type === 'input') {
      const { pageId, selector, value } = msg;
      console.log(`[Slave Debug] 收到 input → page=${pageId}, selector=${selector}, value=${value}`);
      const targetPage = slavePages.get(pageId);
      if (targetPage) {
        try {
          await targetPage.waitForSelector(selector, { timeout: 5000 });
          await targetPage.evaluate(
            (_sel, _val) => {
              const el = document.querySelector(_sel);
              if (!el) return;
              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                el.focus();
                el.value = _val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
              } else if (el.isContentEditable) {
                el.focus();
                el.innerText = _val;
                el.dispatchEvent(new InputEvent('input', { bubbles: true }));
              }
            },
            selector,
            value
          );
          console.log(`[Slave Debug] 页面 ${pageId} 在 ${selector} 上输入：${value}`);
        } catch {
          console.warn(`[Slave Debug] 页面 ${pageId} 等待 selector "${selector}" 超时，跳过输入同步`);
        }
      }
      return;
    }

    // 6. 打开 MetaMask popup
    if (msg.type === 'open-metamask-popup') {
      console.log('[Slave Debug] 收到 open-metamask-popup 指令');
      await slaveOpenMetaMaskPopup(browserSlave);
      return;
    }

    // 7. 打开 MetaMask 通知页
    if (msg.type === 'open-metamask-notification') {
      const { url } = msg;
      console.log('[Slave Debug] 收到 open-metamask-notification 指令，URL:', url);
      try {
        const notifPage = await browserSlave.newPage();
        await notifPage.goto(url, { waitUntil: 'networkidle2' });
        console.log('[Slave Debug] 已打开 MetaMask 通知页');
      } catch (e) {
        console.error('[Slave Debug] 打开通知页失败：', e.message);
      }
      return;
    }
  });

  console.log('[Slave] 正在监听 Master 的同步指令，包括页面、popup 与通知页同步…');
}

async function slaveOpenMetaMaskPopup(browser) {
  const targets = await browser.targets();
  const bgTarget = targets.find(
    t => t.url().startsWith(`chrome-extension://${METAMASK_EXTENSION_ID}`) &&
         t.type() === 'background_page'
  );
  if (!bgTarget) {
    console.error('[Slave] 无法定位 MetaMask background target');
    return;
  }
  const bgPage = await bgTarget.page();
  if (!bgPage) {
    console.error('[Slave] 无法获取 MetaMask background page');
    return;
  }
  try {
    await bgPage.evaluate(() => chrome.action.openPopup());
    console.log('[Slave] 已调用 chrome.action.openPopup()');
  } catch (e) {
    console.error('[Slave] 调用 chrome.action.openPopup() 失败：', e.message);
  }
}

// 启动分发
if (role.toLowerCase() === 'master') {
  startMaster().catch(err => {
    console.error('[Master] 启动失败：', err);
    process.exit(1);
  });
} else {
  startSlave().catch(err => {
    console.error('[Slave] 启动失败：', err);
    process.exit(1);
  });
}
