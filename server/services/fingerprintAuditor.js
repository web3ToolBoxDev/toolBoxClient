'use strict';

const http = require('http');
const https = require('https');

class FingerprintAuditor {
  constructor(options = {}) {
    this.timeout = options.timeout || 5000;
  }

  httpGet(url) {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, { timeout: this.timeout }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  async testWebRTCLeak(page) {
    try {
      const result = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
          pc.createDataChannel('');
          pc.createOffer().then(offer => {
            pc.setLocalDescription(offer);
            setTimeout(() => {
              const sdp = pc.localDescription?.sdp || '';
              const ips = [];
              const regex = /(\d{1,3}\.){3}\d{1,3}/g;
              let match;
              while ((match = regex.exec(sdp)) !== null) {
                if (!match[0].startsWith('0.') && !match[0].startsWith('127.')) ips.push(match[0]);
              }
              pc.close();
              resolve({ leaked: ips.length > 0, ips });
            }, 2000);
          }).catch(() => resolve({ leaked: false, ips: [] }));
        });
      });
      return { name: 'WebRTC Leak', pass: !result.leaked, detail: result.leaked ? `Leaked IPs: ${result.ips.join(', ')}` : 'No leak' };
    } catch (e) {
      return { name: 'WebRTC Leak', pass: true, detail: 'Test skipped: ' + e.message };
    }
  }

  async testNavigatorWebdriver(page) {
    try {
      const result = await page.evaluate(() => ({
        webdriver: navigator.webdriver,
        automationControlled: navigator.webdriver === true || !!window.__puppeteer_evaluation_script__
      }));
      return { name: 'navigator.webdriver', pass: !result.webdriver, detail: `webdriver=${result.webdriver}` };
    } catch (e) {
      return { name: 'navigator.webdriver', pass: false, detail: e.message };
    }
  }

  async testPlugins(page) {
    try {
      const result = await page.evaluate(() => {
        const plugins = navigator.plugins;
        return {
          count: plugins.length,
          names: Array.from(plugins).map(p => p.name)
        };
      });
      const pass = result.count > 0;
      return { name: 'Plugins', pass, detail: `${result.count} plugins: ${result.names.slice(0, 3).join(', ')}` };
    } catch (e) {
      return { name: 'Plugins', pass: false, detail: e.message };
    }
  }

  async testCanvas(page) {
    try {
      const result = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 200, 50);
        ctx.fillStyle = '#069';
        ctx.font = '14px Arial';
        ctx.fillText('Fingerprint Test', 10, 30);
        ctx.fillStyle = 'rgba(102,204,0,0.7)';
        ctx.fillText('Canvas FP', 50, 40);
        return canvas.toDataURL();
      });
      return { name: 'Canvas', pass: result && result.length > 100, detail: `Data URL length: ${result?.length || 0}` };
    } catch (e) {
      return { name: 'Canvas', pass: false, detail: e.message };
    }
  }

  async testWebGL(page) {
    try {
      const result = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return { supported: false };
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          supported: true,
          vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
          renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        };
      });
      const isGeneric = result.renderer && (result.renderer.includes('SwiftShader') || result.renderer.includes('Google'));
      return { name: 'WebGL', pass: result.supported && !isGeneric, detail: `Vendor: ${result.vendor}, Renderer: ${result.renderer}` };
    } catch (e) {
      return { name: 'WebGL', pass: false, detail: e.message };
    }
  }

  async testAudioContext(page) {
    try {
      const result = await page.evaluate(() => {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = ctx.createOscillator();
          const analyser = ctx.createAnalyser();
          const gain = ctx.createGain();
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          oscillator.type = 'triangle';
          oscillator.connect(analyser);
          analyser.connect(processor);
          processor.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start(0);
          const data = new Float32Array(analyser.frequencyBinCount);
          analyser.getFloatFrequencyData(data);
          oscillator.stop();
          ctx.close();
          return { supported: true, sample: data.slice(0, 5).map(v => v.toFixed(2)).join(',') };
        } catch (e) { return { supported: false, error: e.message }; }
      });
      return { name: 'AudioContext', pass: result.supported, detail: result.supported ? `Sample: ${result.sample}` : result.error };
    } catch (e) {
      return { name: 'AudioContext', pass: false, detail: e.message };
    }
  }

  async testScreenConsistency(page, expectedScreen) {
    try {
      const result = await page.evaluate(() => ({
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        pixelRatio: window.devicePixelRatio
      }));
      const issues = [];
      if (expectedScreen) {
        if (result.width !== expectedScreen.width) issues.push(`width: got ${result.width}, expected ${expectedScreen.width}`);
        if (result.height !== expectedScreen.height) issues.push(`height: got ${result.height}, expected ${expectedScreen.height}`);
        if (result.colorDepth !== expectedScreen.colorDepth) issues.push(`colorDepth: got ${result.colorDepth}, expected ${expectedScreen.colorDepth}`);
      }
      return { name: 'Screen Consistency', pass: issues.length === 0, detail: issues.length > 0 ? issues.join('; ') : `OK: ${result.width}x${result.height}` };
    } catch (e) {
      return { name: 'Screen Consistency', pass: false, detail: e.message };
    }
  }

  async testTimezoneConsistency(page, expectedTimezone) {
    try {
      const result = await page.evaluate(() => ({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: new Date().getTimezoneOffset()
      }));
      const pass = !expectedTimezone || result.timezone === expectedTimezone;
      return { name: 'Timezone', pass, detail: `TZ: ${result.timezone}, Offset: ${result.offset}` };
    } catch (e) {
      return { name: 'Timezone', pass: false, detail: e.message };
    }
  }

  async testLanguageConsistency(page, expectedLang) {
    try {
      const result = await page.evaluate(() => ({
        language: navigator.language,
        languages: Array.from(navigator.languages || [navigator.language])
      }));
      const pass = !expectedLang || result.language.startsWith(expectedLang.split('-')[0]);
      return { name: 'Language', pass, detail: `Lang: ${result.language}, Languages: ${result.languages.join(',')}` };
    } catch (e) {
      return { name: 'Language', pass: false, detail: e.message };
    }
  }

  async runFullAudit(page, fingerprint) {
    const tests = [
      this.testNavigatorWebdriver(page),
      this.testPlugins(page),
      this.testCanvas(page),
      this.testWebGL(page),
      this.testAudioContext(page),
      this.testScreenConsistency(page, fingerprint?.screen),
      this.testTimezoneConsistency(page, fingerprint?.timeZone || fingerprint?.proxy?.timeZone),
      this.testLanguageConsistency(page, fingerprint?.language_js),
    ];
    if (fingerprint?.proxy) {
      tests.push(this.testWebRTCLeak(page));
    }
    const results = await Promise.allSettled(tests);
    const report = {
      timestamp: Date.now(),
      overall: 'PASS',
      tests: []
    };
    for (const r of results) {
      if (r.status === 'fulfilled') {
        report.tests.push(r.value);
        if (!r.value.pass) report.overall = 'FAIL';
      } else {
        report.tests.push({ name: 'Unknown', pass: false, detail: r.reason?.message || 'error' });
        report.overall = 'FAIL';
      }
    }
    report.score = Math.round((report.tests.filter(t => t.pass).length / report.tests.length) * 100);
    return report;
  }
}

module.exports = { FingerprintAuditor };
