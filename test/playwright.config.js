const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  workers: 1,            // serial — tests share a single backend on :30001
  timeout: 600 * 1000,  // 10 min per test (real AI calls)
  expect: {
    timeout: 120 * 1000, // 2 min per expect (waiting for AI response)
  },
  use: {
    baseURL: 'http://localhost:3000',
    headless: false,     // show browser for debugging
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [['list']],
});
