const { test, expect } = require('@playwright/test');

test('task offcanvas websocket reconnects after disconnect', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('task-info-button').click();
  await expect(page.getByTestId('task-offcanvas')).toBeVisible();

  await page.waitForFunction(() => window.__wsManager && window.__wsManager.checkConnection());

  await page.evaluate(() => {
    if (window.__wsManager && window.__wsManager.wss) {
      window.__wsManager.wss.close();
    }
  });

  await page.waitForFunction(() => window.__wsManager && !window.__wsManager.checkConnection());
  await page.waitForFunction(() => window.__wsManager && window.__wsManager.checkConnection(), null, {
    timeout: 15000,
  });
});
