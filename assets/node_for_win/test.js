const puppeteer = require('puppeteer-extra');
const lanPlugin = require('puppeteer-extra-plugin-stealth/evasions/navigator.languages');
const userAgentPlugin = require('puppeteer-extra-plugin-stealth/evasions/user-agent-override');
const webglPlugin = require('puppeteer-extra-plugin-stealth/evasions/webgl.vendor');
const fs = require('fs');
const path = require('path');
const findChrome = require('carlo/lib/find_chrome');


let userDataJson = fs.readFileSync(path.resolve(__dirname, '../initData.json'), 'utf-8');
let user = JSON.parse(userDataJson.toString());
let userPrint = JSON.parse(user['fingerPrint']);

puppeteer.use(lanPlugin({ languages: userPrint.lan.split(',') }));
puppeteer.use(userAgentPlugin({ userAgent: userPrint.userAgent }));
puppeteer.use(webglPlugin({ vendor: userPrint.webglVendor, renderer: userPrint.webglRenderer }));
let metamaskEx = path.resolve(__dirname, '../nkbihfbeogaeaoehlefnkodbefgpgknn/10.22.2_0');
let argArr = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disabled-setupid-sandbox',
    '--disable-infobars',
    '--disable-extensions-except=' + metamaskEx
];

(async () => {

  const browser = await puppeteer.launch({ headless: false,
     executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' ,
     ignoreDefaultArgs: ['--enable-automation'],
     args: argArr
    }); // Change headless to false for debugging
  console.log('browser open');
  const page = await browser.newPage();
  // 设置页面参数，禁用 WebRTC
  await page.setExtraHTTPHeaders({
    'WebRTC-Local-IP': '0.0.0.0', // 设置本地 IP 地址
    'WebRTC-Disable-IPv6': 'true', // 禁用 IPv6
    'WebRTC-Multiple-Routes': 'false', // 禁用多个路由
  });

  // 禁用 WebRTC 功能
  await page.evaluateOnNewDocument(() => {
    // 这段 JavaScript 代码在每次导航到新页面时都会执行
    // 禁用 WebRTC
    Object.defineProperty(window, 'RTCPeerConnection', {
      value: function RTCPeerConnection() {
        throw new Error('No WebRTC support');
      },
    });
  });
  await page.goto('https://www.browserscan.net/zh');
  
  // Wait for some time to ensure page content is fully loaded (optional)
  await sleep(5); // Adjust sleep time as needed
  
  // Get the HTML content of the page
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  await sleep(300)
//   console.log(html);


  // Close the browser
  await browser.close();
  console.log('browser close');
})();

function sleep(s) {
  return new Promise(resolve => setTimeout(resolve, s * 1000));
}
