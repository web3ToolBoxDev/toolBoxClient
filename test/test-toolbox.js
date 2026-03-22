/**
 * Toolbox 集成测试脚本
 * 测试内容：
 *   1. mini_installer 路径获取
 *   2. 运行安装器
 *   3. Chrome 路径获取
 *   4. 指纹生成（新格式验证）
 *   5. 指纹数据完整性校验
 *   6. 启动浏览器 + 指纹注入验证
 *
 * 使用方式：
 *   npm run test:toolbox [-- --skip-install] [-- --skip-browser]
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const API_BASE = process.env.API_BASE || 'http://localhost:30001/api';
const SKIP_INSTALL = process.argv.includes('--skip-install');
const SKIP_BROWSER = process.argv.includes('--skip-browser');

// ─── HTTP helpers ───

function apiGet(endpoint) {
    return new Promise((resolve, reject) => {
        http.get(`${API_BASE}${endpoint}`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { resolve(data); }
            });
        }).on('error', reject);
    });
}

function apiPost(endpoint, body = {}) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const url = new URL(`${API_BASE}${endpoint}`);
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { resolve(data); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ─── Test helpers ───

let passed = 0, failed = 0;

function assert(condition, msg) {
    if (condition) {
        console.log(`  ✅ ${msg}`);
        passed++;
    } else {
        console.log(`  ❌ ${msg}`);
        failed++;
    }
}

function section(title) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ${title}`);
    console.log('═'.repeat(60));
}

// ─── Tests ───

async function testInstallerPath() {
    section('1. mini_installer 路径管理');

    // GET 安装器路径
    const getRes = await apiGet('/getInstallerPath');
    console.log('  getInstallerPath:', JSON.stringify(getRes));
    assert(getRes.success === true, 'getInstallerPath 返回成功');
    assert(getRes.path && getRes.path.length > 0, `安装器路径非空: ${getRes.path}`);

    if (getRes.path) {
        const exists = fs.existsSync(getRes.path);
        assert(exists, `安装器文件存在: ${getRes.path}`);
    }

    // SET 自定义路径测试
    const testPath = path.resolve(__dirname, '../assets/mini_installer.exe');
    const setRes = await apiPost('/setInstallerPath', { path: testPath });
    assert(setRes.success === true, 'setInstallerPath 返回成功');

    const getRes2 = await apiGet('/getInstallerPath');
    assert(getRes2.path === testPath, `路径已更新为: ${getRes2.path}`);

    // 恢复原路径
    if (getRes.path) {
        await apiPost('/setInstallerPath', { path: getRes.path });
        console.log('  ↩ 已恢复原始安装器路径');
    }
}

async function testRunInstaller() {
    section('2. 运行安装器');

    if (SKIP_INSTALL) {
        console.log('  ⏭ 跳过安装（--skip-install）');
        return;
    }

    console.log('  ⏳ 正在运行 mini_installer.exe（可能需要 1-2 分钟）...');
    const res = await apiPost('/runInstaller');
    console.log('  runInstaller 结果:', JSON.stringify(res));
    assert(res.success === true, `安装结果: ${res.message}`);
    if (res.chromePath) {
        assert(fs.existsSync(res.chromePath), `Chrome 已安装到: ${res.chromePath}`);
    }
}

async function testChromePath() {
    section('3. Chrome 路径获取');

    const res = await apiGet('/getChromePath');
    console.log('  getChromePath:', JSON.stringify(res));
    assert(res.success === true, 'getChromePath 返回成功');
    assert(res.path && res.path.length > 0, `Chrome 路径: ${res.path}`);

    if (res.path) {
        const exists = fs.existsSync(res.path);
        assert(exists, `Chrome 可执行文件存在`);
    }
    return res.path;
}

async function testFingerPrintGeneration() {
    section('4. 指纹生成（新格式）');

    // 生成 2 个指纹
    const genRes = await apiPost('/generateFingerPrints', { counts: 2 });
    console.log('  generateFingerPrints:', JSON.stringify(genRes));
    assert(genRes.success === true, '指纹生成成功');

    // 获取所有指纹
    const fpRes = await apiGet('/getFingerPrints');
    assert(fpRes.success === true, '获取指纹列表成功');

    const fps = fpRes.data ? Object.values(fpRes.data) : [];
    assert(fps.length >= 2, `指纹数量: ${fps.length} (≥2)`);

    return fps;
}

function testFingerPrintFormat(fps) {
    section('5. 指纹数据格式校验');

    // 取最新的 2 个
    const sorted = fps.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const testFps = sorted.slice(0, 2);

    for (let idx = 0; idx < testFps.length; idx++) {
        const fp = testFps[idx];
        const label = `指纹 #${idx + 1} (${fp.id?.slice(0, 8)}...)`;
        console.log(`\n  ── ${label} ──`);

        // 基本字段
        assert(typeof fp.id === 'string' && fp.id.length > 0, '  id 存在');
        assert(typeof fp.user_agent === 'string', '  user_agent 存在');

        // clientHint
        assert(fp.clientHint && typeof fp.clientHint === 'object', '  clientHint 是对象');
        assert(typeof fp.clientHint?.platform === 'string', '  clientHint.platform 存在');
        assert(typeof fp.clientHint?.architecture === 'string', '  clientHint.architecture 存在');

        // canvas (新格式)
        assert(fp.canvas && typeof fp.canvas === 'object', '  canvas 是对象');
        assert(typeof fp.canvas?.toDataUrl === 'number', '  canvas.toDataUrl 存在 (旧版)');
        assert(typeof fp.canvas?.seed === 'number' && fp.canvas.seed > 0, `  canvas.seed = ${fp.canvas?.seed} (新版)`);

        // audio (新格式)
        assert(fp.audio && typeof fp.audio === 'object', '  audio 是对象 (非 float)');
        assert(typeof fp.audio?.seed === 'number' && fp.audio.seed > 0, `  audio.seed = ${fp.audio?.seed} (新版)`);

        // webgl (新格式)
        assert(fp.webgl && typeof fp.webgl === 'object', '  webgl 是对象');
        assert(typeof fp.webgl?.renderer === 'string', `  webgl.renderer 存在`);
        assert(typeof fp.webgl?.vendor === 'string', `  webgl.vendor 存在`);
        assert(Array.isArray(fp.webgl?.extensions), `  webgl.extensions 是数组 (${fp.webgl?.extensions?.length} 个)`);
        assert(fp.webgl?.extensions?.length >= 12, `  webgl.extensions ≥ 12 个`);
        assert(fp.webgl?.extensions?.includes('WEBGL_debug_renderer_info'), '  webgl.extensions 包含 WEBGL_debug_renderer_info');
        assert(fp.webgl?.params && typeof fp.webgl.params.MAX_TEXTURE_SIZE === 'number',
            `  webgl.params.MAX_TEXTURE_SIZE = ${fp.webgl?.params?.MAX_TEXTURE_SIZE}`);

        // hardware
        assert(fp.hardware && typeof fp.hardware.memory === 'number', `  hardware.memory = ${fp.hardware?.memory}`);
        assert(typeof fp.hardware?.concurrency === 'number', `  hardware.concurrency = ${fp.hardware?.concurrency}`);

        // clientRect
        assert(typeof fp.clientRect === 'number', `  clientRect = ${fp.clientRect}`);

        // fonts_remove
        assert(typeof fp.fonts_remove === 'string', `  fonts_remove 存在`);

        // language
        assert(typeof fp.language_js === 'string', `  language_js = ${fp.language_js}`);
        assert(typeof fp.language_http === 'string', `  language_http = ${fp.language_http}`);
    }

    // 验证两个指纹的 seed 不同
    if (testFps.length >= 2) {
        const [fp1, fp2] = testFps;
        assert(fp1.canvas.seed !== fp2.canvas.seed, `  两个指纹 canvas.seed 不同 (${fp1.canvas.seed} vs ${fp2.canvas.seed})`);
        assert(fp1.audio.seed !== fp2.audio.seed, `  两个指纹 audio.seed 不同 (${fp1.audio.seed} vs ${fp2.audio.seed})`);
    }
}

async function testBrowserLaunch(chromePath, fps) {
    section('6. 浏览器启动 + 指纹验证');

    if (SKIP_BROWSER) {
        console.log('  ⏭ 跳过浏览器启动（--skip-browser）');
        return;
    }

    if (!chromePath || !fs.existsSync(chromePath)) {
        console.log('  ⏭ Chrome 不存在，跳过浏览器测试');
        return;
    }

    let puppeteer;
    try {
        puppeteer = require('puppeteer-core');
    } catch {
        try {
            puppeteer = require('puppeteer-extra');
        } catch {
            try {
                puppeteer = require('puppeteer');
            } catch {
                console.log('  ⏭ puppeteer 未安装，跳过浏览器测试');
                return;
            }
        }
    }

    const fp = fps[0];
    const toolboxJson = JSON.stringify({
        audio: fp.audio,
        clientRect: fp.clientRect,
        webgl: fp.webgl,
        canvas: fp.canvas,
        hardware: fp.hardware,
        clientHint: fp.clientHint,
        languages_js: fp.language_js,
        languages_http: fp.language_http,
        fonts_remove: fp.fonts_remove,
    });

    const tmpDir = path.join(require('os').tmpdir(), `toolbox-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    console.log('  ⏳ 启动浏览器...');
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: chromePath,
        ignoreDefaultArgs: ['--enable-automation'],
        userDataDir: tmpDir,
        args: [
            '--disable-infobars',
            '--no-first-run',
            '--no-default-browser-check',
            `--user-agent=${fp.user_agent}`,
            `--lang=${fp.language_js}`,
            `--toolbox=${toolboxJson}`,
        ],
        defaultViewport: null,
    });

    const page = (await browser.pages())[0] || await browser.newPage();

    try {
        // 测试 navigator.webdriver
        const webdriver = await page.evaluate(() => navigator.webdriver);
        assert(webdriver === false, `navigator.webdriver = ${webdriver}`);

        // 测试 hardwareConcurrency
        const concurrency = await page.evaluate(() => navigator.hardwareConcurrency);
        assert(concurrency === fp.hardware.concurrency,
            `hardwareConcurrency = ${concurrency} (期望 ${fp.hardware.concurrency})`);

        // 测试 deviceMemory
        const memory = await page.evaluate(() => navigator.deviceMemory);
        assert(memory === fp.hardware.memory,
            `deviceMemory = ${memory} (期望 ${fp.hardware.memory})`);

        // 测试 Connection API
        const connection = await page.evaluate(() => ({
            rtt: navigator.connection?.rtt,
            downlink: navigator.connection?.downlink,
            effectiveType: navigator.connection?.effectiveType,
        }));
        assert(connection.rtt === 50, `connection.rtt = ${connection.rtt} (期望 50)`);
        assert(connection.downlink === 10, `connection.downlink = ${connection.downlink} (期望 10)`);
        assert(connection.effectiveType === '4g', `connection.effectiveType = ${connection.effectiveType} (期望 4g)`);

        // 测试 Speech Synthesis (需等待 voices 加载)
        const voiceInfo = await page.evaluate(() => new Promise((resolve) => {
            const check = () => {
                const voices = speechSynthesis.getVoices();
                if (voices.length > 0) {
                    const localCount = voices.filter(v => v.localService).length;
                    resolve({ total: voices.length, localCount });
                }
            };
            speechSynthesis.onvoiceschanged = check;
            check();
            setTimeout(() => resolve({ total: 0, localCount: 0 }), 3000);
        }));
        assert(voiceInfo.localCount === 0,
            `语音: ${voiceInfo.total} 个, 本地语音 ${voiceInfo.localCount} 个 (期望 0)`);

        // 测试 MediaDevices
        const devices = await page.evaluate(async () => {
            try {
                const d = await navigator.mediaDevices.enumerateDevices();
                return {
                    total: d.length,
                    audioInput: d.filter(x => x.kind === 'audioinput').length,
                    audioOutput: d.filter(x => x.kind === 'audiooutput').length,
                    videoInput: d.filter(x => x.kind === 'videoinput').length,
                };
            } catch { return { total: -1 }; }
        });
        assert(devices.audioInput <= 1, `audioInput 设备: ${devices.audioInput} (≤1)`);
        assert(devices.videoInput <= 1, `videoInput 设备: ${devices.videoInput} (≤1)`);
        assert(devices.audioOutput <= 1, `audioOutput 设备: ${devices.audioOutput} (≤1)`);

        // 测试 WebGL extensions
        const webglInfo = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl');
            if (!gl) return null;
            return {
                extensions: gl.getSupportedExtensions(),
                maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            };
        });
        if (webglInfo) {
            assert(webglInfo.extensions.length <= fp.webgl.extensions.length,
                `WebGL 扩展: ${webglInfo.extensions.length} 个 (白名单 ${fp.webgl.extensions.length} 个)`);
            assert(webglInfo.maxTextureSize === fp.webgl.params.MAX_TEXTURE_SIZE,
                `MAX_TEXTURE_SIZE = ${webglInfo.maxTextureSize} (期望 ${fp.webgl.params.MAX_TEXTURE_SIZE})`);
        }

        // 测试 Canvas 指纹确定性
        const canvasHash1 = await page.evaluate(() => {
            const c = document.createElement('canvas');
            c.width = 200; c.height = 50;
            const ctx = c.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('Fingerprint', 2, 15);
            return c.toDataURL();
        });
        const canvasHash2 = await page.evaluate(() => {
            const c = document.createElement('canvas');
            c.width = 200; c.height = 50;
            const ctx = c.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('Fingerprint', 2, 15);
            return c.toDataURL();
        });
        assert(canvasHash1 === canvasHash2, 'Canvas toDataURL 确定性: 两次结果一致');

        // 测试 AudioBuffer 噪声
        const audioTest = await page.evaluate(() => {
            try {
                const ctx = new OfflineAudioContext(1, 4410, 44100);
                const buf = ctx.createBuffer(1, 128, 44100);
                const data = buf.getChannelData(0);
                const hasNoise = data.some(v => v !== 0);
                return { hasNoise, sample: data[0] };
            } catch { return { hasNoise: false, sample: 0 }; }
        });
        assert(audioTest.hasNoise === true,
            `AudioBuffer 噪声: ${audioTest.hasNoise} (sample[0]=${audioTest.sample})`);

        // 测试 Runtime.enable 泄露
        const leakTest = await page.evaluate(() => {
            return new Promise((resolve) => {
                let leaked = false;
                const obj = {};
                Object.defineProperty(obj, 'test', {
                    get: () => { leaked = true; return 'leaked'; }
                });
                console.debug(obj);
                setTimeout(() => resolve(leaked), 100);
            });
        });
        assert(leakTest === false, `Runtime.enable 泄露: ${leakTest} (期望 false)`);

    } finally {
        await browser.close();
        // 清理临时目录
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
}

async function testCleanup(fps) {
    section('7. 清理测试指纹');

    // 删除本次测试生成的指纹
    const testIds = fps
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 2)
        .map(f => f.id);

    if (testIds.length > 0) {
        const delRes = await apiPost('/deleteFingerPrints', { ids: testIds });
        assert(delRes.success === true, `删除 ${testIds.length} 个测试指纹`);
    }
}

// ─── Main ───

async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║         Toolbox 集成测试                                ║');
    console.log('║  测试指纹生成、安装器管理、浏览器启动                     ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\n  API: ${API_BASE}`);
    console.log(`  跳过安装: ${SKIP_INSTALL}`);
    console.log(`  跳过浏览器: ${SKIP_BROWSER}`);

    try {
        // 先检查 API 是否可用
        try {
            await apiGet('/getSavePath');
        } catch (e) {
            console.error('\n❌ 无法连接到工具箱后端 API (localhost:3000)');
            console.error('   请先启动工具箱应用，然后重新运行此测试');
            process.exit(1);
        }

        await testInstallerPath();
        await testRunInstaller();
        const chromePath = await testChromePath();
        const fps = await testFingerPrintGeneration();
        testFingerPrintFormat(fps);
        await testBrowserLaunch(chromePath, fps);
        await testCleanup(fps);

        // 汇总
        console.log('\n' + '═'.repeat(60));
        console.log(`  测试完成: ✅ ${passed} 通过, ❌ ${failed} 失败`);
        console.log('═'.repeat(60));

        process.exit(failed > 0 ? 1 : 0);
    } catch (e) {
        console.error('\n❌ 测试异常:', e.message);
        console.error(e.stack);
        process.exit(1);
    }
}

main();
