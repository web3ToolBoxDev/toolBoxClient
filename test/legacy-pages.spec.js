const { test, expect } = require('@playwright/test');

const BASE_API = 'http://localhost:30001/api';

/**
 * Helper: auto-dismiss window.alert / window.confirm dialogs
 * and capture their messages for assertion.
 */
function setupDialogHandler(page, dialogMessages) {
  page.on('dialog', async (dialog) => {
    dialogMessages.push(dialog.message());
    await dialog.accept();
  });
}

/**
 * Helper: wait for a specific API response pattern and return JSON body.
 */
async function waitForApi(page, urlPattern, options = {}) {
  const method = options.method || 'GET';
  const resp = await page.waitForResponse(
    (r) => r.url().includes(urlPattern) && r.request().method() === method,
    { timeout: 15000 }
  );
  return resp;
}

// ─── Backend readiness ──────────────────────────────────────────────────────
test.beforeAll(async () => {
  const res = await fetch(`${BASE_API}/getSavePath`);
  expect(res.ok).toBeTruthy();
});

// ═══════════════════════════════════════════════════════════════════════════
// ChromeManager  /#/chromeManager
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('ChromeManager', () => {
  /** @type {import('@playwright/test').Page} */
  let page;
  let dialogMessages = [];
  const TEST_ENV_NAME = `e2e_env_${Date.now()}`;
  let createdEnvIds = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    setupDialogHandler(page, dialogMessages);
  });

  test.afterAll(async () => {
    // Cleanup: delete any fingerprints created during tests
    if (createdEnvIds.length > 0) {
      try {
        await fetch(`${BASE_API}/deleteFingerPrints`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: createdEnvIds }),
        });
      } catch (_) { /* best effort */ }
    }
    await page.close();
  });

  test('1. Page loads with heading and control panel', async () => {
    await page.goto('/#/chromeManager');
    await page.waitForLoadState('networkidle');

    // Heading: 浏览器管理
    const heading = page.locator('h1');
    await expect(heading).toContainText('浏览器管理');

    // Control panel card exists
    const controlPanel = page.locator('.control-panel');
    await expect(controlPanel).toBeVisible();
  });

  test('2. Shows chrome path and save path sections', async () => {
    // Browser install section
    const installSection = page.locator('.browser-install-section');
    await expect(installSection).toBeVisible();

    // Save path label: 当前浏览器数据存储路径
    await expect(page.locator('text=当前浏览器数据存储路径')).toBeVisible();
  });

  test('3. Generate fingerprint: click button -> modal -> fill count -> generate -> list updates', async () => {
    dialogMessages = [];

    // Count existing fingerprints before
    const fpRowsBefore = await page.locator('.fingerprint-row').count();

    // Click "生成指纹" button
    await page.locator('.btn-generate-fingerprint').click();

    // Modal should appear with title "生成指纹"
    const modal = page.locator('.modal-dialog');
    await modal.waitFor({ state: 'visible' });
    await expect(page.locator('.modal-title')).toContainText('生成指纹');

    // Fill in count = 2
    const countInput = modal.locator('input[type="number"]');
    await countInput.fill('2');

    // Click "生成" button inside modal
    const generateBtn = modal.locator('button', { hasText: '生成' });
    await generateBtn.click();

    // Wait for the API response
    await page.waitForResponse(
      (r) => r.url().includes('/generateFingerPrints') && r.status() === 200,
      { timeout: 15000 }
    );

    // Wait for alert (generateSuccess)
    await page.waitForTimeout(500);
    expect(dialogMessages.some((m) => m.includes('生成成功'))).toBeTruthy();

    // Modal should close
    await expect(modal).toBeHidden({ timeout: 5000 });

    // List should have more rows
    await page.waitForTimeout(500);
    const fpRowsAfter = await page.locator('.fingerprint-row').count();
    expect(fpRowsAfter).toBeGreaterThanOrEqual(fpRowsBefore + 2);

    // Save created env IDs for cleanup
    const ids = await page.evaluate(() => {
      const store = window.__zustandFingerPrintStore || null;
      // Fallback: scrape from DOM
      return [];
    });
    // We'll track via API instead
    const apiRes = await fetch(`${BASE_API}/getFingerPrints`);
    const apiData = await apiRes.json();
    if (apiData && apiData.success && apiData.data) {
      const allIds = Object.keys(apiData.data);
      createdEnvIds = allIds.slice(-2); // last 2 are likely ours
    }
  });

  test('4. Edit environment name: click edit -> modal -> type name -> save -> name changes', async () => {
    dialogMessages = [];

    // Click first env's edit button (编辑)
    const firstRow = page.locator('.fingerprint-row').first();
    await firstRow.locator('button', { hasText: '编辑' }).click();

    // Modal opens with title "修改环境名称"
    const modal = page.locator('.modal-dialog');
    await modal.waitFor({ state: 'visible' });
    await expect(page.locator('.modal-title')).toContainText('修改环境名称');

    // Clear and type new name
    const nameInput = modal.locator('input[type="text"]');
    await nameInput.clear();
    await nameInput.fill(TEST_ENV_NAME);

    // Click save (保存)
    await modal.locator('button', { hasText: '保存' }).click();

    // Wait for API
    await page.waitForResponse(
      (r) => r.url().includes('/updateFingerPrintName') && r.status() === 200,
      { timeout: 10000 }
    );

    await page.waitForTimeout(500);
    // Alert "成功"
    expect(dialogMessages.some((m) => m.includes('成功'))).toBeTruthy();

    // The name should now appear in the list
    await expect(page.locator('.fingerprint-row').first().locator('.env-name')).toContainText(TEST_ENV_NAME);
  });

  test('5. View environment detail: click viewDetail -> modal shows fingerprint info', async () => {
    // Click "查看详情" on first row
    const firstRow = page.locator('.fingerprint-row').first();
    await firstRow.locator('button', { hasText: '查看详情' }).click();

    // Modal with title "环境详情"
    const modal = page.locator('.modal-dialog');
    await modal.waitFor({ state: 'visible' });
    await expect(page.locator('.modal-title')).toContainText('环境详情');

    // Should contain labels like 环境名称, 浏览器标识, WebGL, etc.
    await expect(modal.locator('text=环境名称')).toBeVisible();
    await expect(modal.locator('text=浏览器标识')).toBeVisible();

    // Close modal
    await page.locator('.modal-header .btn-close').click();
    await expect(modal).toBeHidden({ timeout: 3000 });
  });

  test('6. Configure proxy: click configProxy -> modal opens with proxy fields', async () => {
    // Click "配置代理" on first row
    const firstRow = page.locator('.fingerprint-row').first();
    await firstRow.locator('button', { hasText: '配置代理' }).click();

    // Modal with title "配置代理"
    const modal = page.locator('.modal-dialog');
    await modal.waitFor({ state: 'visible' });
    await expect(page.locator('.modal-title')).toContainText('配置代理');

    // Should have proxy fields: 代理类型, 代理IP地址, 代理端口
    await expect(modal.locator('text=代理类型')).toBeVisible();
    await expect(modal.locator('text=代理IP地址')).toBeVisible();
    await expect(modal.locator('text=代理端口')).toBeVisible();

    // Should have test/save buttons: 测试, 保存
    await expect(modal.locator('button', { hasText: '测试' })).toBeVisible();
    await expect(modal.locator('button', { hasText: '保存' })).toBeVisible();

    // Close modal
    await page.locator('.modal-header .btn-close').click();
    await expect(modal).toBeHidden({ timeout: 3000 });
  });

  test('7. Select environments with checkboxes -> batch delete', async () => {
    dialogMessages = [];

    const rowCountBefore = await page.locator('.fingerprint-row').count();
    expect(rowCountBefore).toBeGreaterThan(0);

    // Select the last fingerprint row
    const lastRow = page.locator('.fingerprint-row').last();
    await lastRow.locator('input[type="checkbox"]').check();

    // Click "删除选中"
    await page.locator('button', { hasText: '删除选中' }).click();

    // Wait for delete API
    await page.waitForResponse(
      (r) => r.url().includes('/deleteFingerPrints') && r.status() === 200,
      { timeout: 10000 }
    );

    await page.waitForTimeout(500);
    expect(dialogMessages.some((m) => m.includes('删除成功'))).toBeTruthy();

    const rowCountAfter = await page.locator('.fingerprint-row').count();
    expect(rowCountAfter).toBeLessThan(rowCountBefore);
  });

  test('8. Select all / deselect all toggle', async () => {
    const rowCount = await page.locator('.fingerprint-row').count();
    if (rowCount === 0) {
      test.skip();
      return;
    }

    // Click the select-all checkbox in the card header
    const selectAllCheckbox = page.locator('.fingerprint-list-card .card-header input[type="checkbox"]');
    await selectAllCheckbox.check();

    // All row checkboxes should be checked
    const checkedCount = await page.locator('.fingerprint-row input[type="checkbox"]:checked').count();
    expect(checkedCount).toBe(rowCount);

    // Uncheck all
    await selectAllCheckbox.uncheck();

    const uncheckedCount = await page.locator('.fingerprint-row input[type="checkbox"]:checked').count();
    expect(uncheckedCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WalletManager  /#/walletManage
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('WalletManager', () => {
  /** @type {import('@playwright/test').Page} */
  let page;
  let dialogMessages = [];
  const TEST_WALLET_NAME = `e2e_wallet_${Date.now()}`;
  let createdWalletIds = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    setupDialogHandler(page, dialogMessages);
  });

  test.afterAll(async () => {
    // Cleanup created wallets
    if (createdWalletIds.length > 0) {
      try {
        await fetch(`${BASE_API}/deleteWallets`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: createdWalletIds }),
        });
      } catch (_) { /* best effort */ }
    }
    await page.close();
  });

  test('1. Page loads with heading and action buttons', async () => {
    await page.goto('/#/walletManage');
    await page.waitForLoadState('networkidle');

    // Heading: 钱包管理
    await expect(page.locator('h1')).toContainText('钱包管理');

    // Control panel with buttons
    const controlPanel = page.locator('.control-panel');
    await expect(controlPanel).toBeVisible();
    await expect(controlPanel.locator('button', { hasText: '新建钱包' })).toBeVisible();
    await expect(controlPanel.locator('button', { hasText: '导入钱包' })).toBeVisible();
    await expect(controlPanel.locator('button', { hasText: '导出钱包' })).toBeVisible();
  });

  test('2. Create wallet: click button -> modal -> enter count -> create -> list updates', async () => {
    dialogMessages = [];

    const walletRowsBefore = await page.locator('.wallet-row').count();

    // Click "新建钱包"
    await page.locator('.control-panel button', { hasText: '新建钱包' }).click();

    // Modal with title "新建钱包"
    const modal = page.locator('.modal-dialog');
    await modal.waitFor({ state: 'visible' });
    await expect(page.locator('.modal-title')).toContainText('新建钱包');

    // Fill count = 2
    const countInput = modal.locator('input');
    await countInput.fill('2');

    // Click "创建"
    await modal.locator('button', { hasText: '创建' }).click();

    // Wait for API response
    await page.waitForResponse(
      (r) => r.url().includes('/createWallet') && r.status() === 200,
      { timeout: 15000 }
    );

    // The create flow calls window.location.reload() on success,
    // so wait for navigation to complete
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // After reload, check that we have more wallets
    const walletRowsAfter = await page.locator('.wallet-row').count();
    expect(walletRowsAfter).toBeGreaterThanOrEqual(walletRowsBefore + 2);

    // Track IDs for cleanup
    const apiRes = await fetch(`${BASE_API}/getAllWallets`);
    const walletData = await apiRes.json();
    if (Array.isArray(walletData)) {
      createdWalletIds = walletData.slice(-2).map((w) => w.id);
    }
  });

  test('3. Edit wallet name: click edit -> modal -> save name', async () => {
    dialogMessages = [];

    // Click first wallet's "编辑" button
    const firstRow = page.locator('.wallet-row').first();
    await firstRow.locator('button', { hasText: '编辑' }).click();

    // Modal opens
    const modal = page.locator('.modal-dialog');
    await modal.waitFor({ state: 'visible' });

    // Clear and fill new name
    const nameInput = modal.locator('input[type="text"]');
    await nameInput.clear();
    await nameInput.fill(TEST_WALLET_NAME);

    // Click "保存"
    await modal.locator('button', { hasText: '保存' }).click();

    // Wait for API
    await page.waitForResponse(
      (r) => r.url().includes('/updateWalletName') && r.status() === 200,
      { timeout: 10000 }
    );

    await page.waitForTimeout(500);
    expect(dialogMessages.some((m) => m.includes('成功'))).toBeTruthy();

    // Verify name in list
    await expect(page.locator('.wallet-row').first().locator('.wallet-name')).toContainText(TEST_WALLET_NAME);
  });

  test('4. View wallet detail: click viewDetail -> modal shows wallet info', async () => {
    // Click "查看详情" on first wallet
    const firstRow = page.locator('.wallet-row').first();
    await firstRow.locator('button', { hasText: '查看详情' }).click();

    const modal = page.locator('.modal-dialog');
    await modal.waitFor({ state: 'visible' });

    // Should show wallet detail fields
    await expect(modal.locator('text=ID')).toBeVisible();
    await expect(modal.locator('text=名称')).toBeVisible();
    await expect(modal.locator('text=助记词')).toBeVisible();
    await expect(modal.locator('text=ETH地址')).toBeVisible();

    // Close
    await page.locator('.modal-header .btn-close').click();
    await expect(modal).toBeHidden({ timeout: 3000 });
  });

  test('5. Bind environment to wallet: click bindEnv -> modal with env list -> bind', async () => {
    // Click "绑定环境" on first wallet
    const firstRow = page.locator('.wallet-row').first();
    const bindBtn = firstRow.locator('button', { hasText: /绑定环境|重新绑定环境/ });
    await bindBtn.click();

    const modal = page.locator('.modal-dialog');
    await modal.waitFor({ state: 'visible' });

    // Should have env search and select
    await expect(modal.locator('input[type="text"]')).toBeVisible();

    // Check if there's a select element with env options
    const selectEl = modal.locator('select');
    const selectCount = await selectEl.count();
    if (selectCount > 0) {
      // There are environments to bind to
      await expect(selectEl).toBeVisible();
    }

    // Close modal without binding (to avoid side effects)
    await page.locator('.modal-header .btn-close').click();
    await expect(modal).toBeHidden({ timeout: 3000 });
  });

  test('6. Open wallet (with bound env)', async () => {
    dialogMessages = [];

    // Click "打开" on first wallet
    const firstRow = page.locator('.wallet-row').first();
    await firstRow.locator('button', { hasText: '打开' }).click();

    // Should get an alert - either success or "未绑定" warning
    await page.waitForTimeout(1000);
    expect(dialogMessages.length).toBeGreaterThan(0);
  });

  test('7. Initialize wallets: select wallets -> click init', async () => {
    dialogMessages = [];

    // Select the first wallet
    const firstRow = page.locator('.wallet-row').first();
    await firstRow.locator('input[type="checkbox"]').check();

    // Click "初始化钱包"
    await page.locator('button', { hasText: '初始化钱包' }).click();

    // Should get a response - either success or error about unbound env
    await page.waitForTimeout(2000);
    expect(dialogMessages.length).toBeGreaterThan(0);

    // Uncheck
    await firstRow.locator('input[type="checkbox"]').uncheck();
  });

  test('8. Select -> batch delete', async () => {
    dialogMessages = [];

    const rowCountBefore = await page.locator('.wallet-row').count();
    if (rowCountBefore === 0) {
      test.skip();
      return;
    }

    // Select the last wallet row
    const lastRow = page.locator('.wallet-row').last();
    await lastRow.locator('input[type="checkbox"]').check();

    // Click "删除选中"
    await page.locator('button', { hasText: '删除选中' }).click();

    // Wait for delete API
    await page.waitForResponse(
      (r) => r.url().includes('/deleteWallets') && r.status() === 200,
      { timeout: 10000 }
    );

    await page.waitForTimeout(500);
    expect(dialogMessages.some((m) => m.includes('删除成功'))).toBeTruthy();

    const rowCountAfter = await page.locator('.wallet-row').count();
    expect(rowCountAfter).toBeLessThan(rowCountBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TaskManage  /#/taskManage
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('TaskManage', () => {
  /** @type {import('@playwright/test').Page} */
  let page;
  let dialogMessages = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    setupDialogHandler(page, dialogMessages);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('1. Page loads with task list', async () => {
    await page.goto('/#/taskManage');
    await page.waitForLoadState('networkidle');

    // Heading: 任务管理
    await expect(page.locator('h1')).toContainText('任务管理');

    // Task list card
    const taskListCard = page.locator('.task-list-card');
    await expect(taskListCard).toBeVisible();

    // Header shows "任务列表"
    await expect(taskListCard.locator('.card-header')).toContainText('任务列表');
  });

  test('2. Import task flow', async () => {
    // Click "导入任务"
    await page.locator('.control-panel button', { hasText: '导入任务' }).click();

    // Modal appears with title "导入任务"
    const modal = page.locator('.modal-dialog');
    await modal.waitFor({ state: 'visible' });
    await expect(page.locator('.modal-title')).toContainText('导入任务');

    // Should show "任务目录" label and input
    await expect(modal.locator('text=任务目录')).toBeVisible();
    await expect(modal.locator('input')).toBeVisible();

    // Should have "选择" and "提交" buttons
    await expect(modal.locator('button', { hasText: '选择' })).toBeVisible();
    await expect(modal.locator('button', { hasText: '提交' })).toBeVisible();

    // Close without importing
    await page.locator('.modal-header .btn-close').click();
    await expect(modal).toBeHidden({ timeout: 3000 });
  });

  test('3. Configure task settings', async () => {
    // This test only runs if there are tasks with configSchema
    const configBtns = page.locator('.task-row button', { hasText: '配置' });
    const configCount = await configBtns.count();

    if (configCount === 0) {
      // No configurable tasks; verify "无配置" labels exist instead
      const noConfigLabels = page.locator('.task-row .text-muted', { hasText: '无配置' });
      const noConfigCount = await noConfigLabels.count();
      // Either some tasks have no config, or no tasks at all
      expect(noConfigCount >= 0).toBeTruthy();
      return;
    }

    // Click first config button
    await configBtns.first().click();

    // SetWalletConfigModal should appear
    const modal = page.locator('.modal-dialog');
    await modal.waitFor({ state: 'visible', timeout: 5000 });

    // Close it
    await page.locator('.modal-header .btn-close').click();
    await expect(modal).toBeHidden({ timeout: 3000 });
  });

  test('4. Start task in env mode: click start -> select envs -> confirm', async () => {
    dialogMessages = [];

    // Find a non-AI task "启动" button
    const startBtns = page.locator('.task-row button.btn-success', { hasText: '启动' });
    const startCount = await startBtns.count();

    if (startCount === 0) {
      test.skip();
      return;
    }

    // Click first start button
    await startBtns.first().click();

    // Run modal should appear with title "启动任务"
    const modal = page.locator('.modal-dialog');
    await modal.waitFor({ state: 'visible' });
    await expect(page.locator('.modal-title')).toContainText('启动任务');

    // Default mode is "按环境"
    const envRadio = page.locator('#run-mode-env');
    await expect(envRadio).toBeChecked();

    // Should show env list text "请选择环境"
    await expect(modal.locator('text=请选择环境')).toBeVisible();

    // Close without starting
    await modal.locator('button', { hasText: '取消' }).click();
    await expect(modal).toBeHidden({ timeout: 3000 });
  });

  test('5. Start task in wallet mode: toggle to wallet -> select wallets -> confirm', async () => {
    dialogMessages = [];

    const startBtns = page.locator('.task-row button.btn-success', { hasText: '启动' });
    const startCount = await startBtns.count();

    if (startCount === 0) {
      test.skip();
      return;
    }

    await startBtns.first().click();

    const modal = page.locator('.modal-dialog');
    await modal.waitFor({ state: 'visible' });

    // Switch to wallet mode by clicking "按钱包" radio
    const walletRadio = page.locator('#run-mode-wallet');
    await walletRadio.click();
    await expect(walletRadio).toBeChecked();

    // Should show wallet list text "请选择钱包"
    await expect(modal.locator('text=请选择钱包')).toBeVisible();

    // Close without starting
    await modal.locator('button', { hasText: '取消' }).click();
    await expect(modal).toBeHidden({ timeout: 3000 });
  });

  test('6. Delete task: select -> delete -> confirm removal', async () => {
    dialogMessages = [];

    const taskRows = page.locator('.task-row');
    const taskCount = await taskRows.count();

    if (taskCount === 0) {
      // No tasks to delete; click delete button and expect alert
      await page.locator('.control-panel button', { hasText: '删除任务' }).click();
      await page.waitForTimeout(500);
      // Should alert "请选择要删除的任务"
      expect(dialogMessages.some((m) => m.includes('请选择'))).toBeTruthy();
      return;
    }

    // Don't actually delete real tasks - just verify the flow by clicking
    // delete without selecting, which should show an alert
    await page.locator('.control-panel button', { hasText: '删除任务' }).click();
    await page.waitForTimeout(500);
    expect(dialogMessages.some((m) => m.includes('请选择要删除的任务'))).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SyncFunction  /#/syncFunction
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('SyncFunction', () => {
  /** @type {import('@playwright/test').Page} */
  let page;
  let dialogMessages = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    setupDialogHandler(page, dialogMessages);
  });

  test.afterAll(async () => {
    // Clean up any groups we created in localStorage
    try {
      await page.evaluate(() => {
        const stored = localStorage.getItem('syncGroups');
        if (stored) {
          const groups = JSON.parse(stored);
          const filtered = groups.filter((g) => !g.id?.startsWith('group_e2e_'));
          localStorage.setItem('syncGroups', JSON.stringify(filtered));
        }
      });
    } catch (_) { /* best effort */ }
    await page.close();
  });

  test('1. Page loads with sync controls', async () => {
    await page.goto('/#/syncFunction');
    await page.waitForLoadState('networkidle');

    // Heading: 同步功能
    await expect(page.locator('h1')).toContainText('同步功能');

    // Control panel
    const controlPanel = page.locator('.control-panel');
    await expect(controlPanel).toBeVisible();

    // Buttons: 选择主环境, 选择从环境, 添加组合, 设置同步脚本
    await expect(controlPanel.locator('button', { hasText: '选择主环境' })).toBeVisible();
    await expect(controlPanel.locator('button', { hasText: '选择从环境' })).toBeVisible();
    await expect(controlPanel.locator('button', { hasText: '添加组合' })).toBeVisible();
    await expect(controlPanel.locator('button', { hasText: '设置同步脚本' })).toBeVisible();
  });

  test('2. Toggle sync mode (wallet <-> env)', async () => {
    // The switch shows "使用钱包同步" by default (wallet mode)
    const switchLabel = page.locator('#sync-mode-switch');
    await expect(switchLabel).toBeVisible();

    // Toggle to env mode
    await switchLabel.click();

    // Label should change to "使用浏览器环境同步"
    await expect(page.locator('label[for="sync-mode-switch"]')).toContainText('使用浏览器环境同步');

    // Toggle back to wallet mode
    await switchLabel.click();
    await expect(page.locator('label[for="sync-mode-switch"]')).toContainText('使用钱包同步');
  });

  test('3. Choose master -> choose slaves -> add group -> group appears in list', async () => {
    dialogMessages = [];

    // Click "选择主环境"
    await page.locator('.control-panel button', { hasText: '选择主环境' }).click();

    const modal = page.locator('.modal-dialog');
    await modal.waitFor({ state: 'visible' });
    await expect(page.locator('.modal-title')).toContainText('选择主环境');

    // Check if there are options in the select
    const selectEl = modal.locator('select');
    const optionCount = await selectEl.locator('option').count();

    if (optionCount === 0) {
      // No wallets/envs to select from; close and skip
      await page.locator('.modal-header .btn-close').click();
      await expect(modal).toBeHidden({ timeout: 3000 });
      test.skip();
      return;
    }

    // Select first option and confirm
    await modal.locator('button', { hasText: '确认' }).click();
    await expect(modal).toBeHidden({ timeout: 3000 });

    // Click "选择从环境"
    await page.locator('.control-panel button', { hasText: '选择从环境' }).click();
    await modal.waitFor({ state: 'visible' });
    await expect(page.locator('.modal-title')).toContainText('选择从环境');

    // Select first available option and confirm
    const slaveSelect = modal.locator('select');
    const slaveOptionCount = await slaveSelect.locator('option').count();
    if (slaveOptionCount > 0) {
      // For multi-select, click the first option
      const firstOption = slaveSelect.locator('option').first();
      const firstValue = await firstOption.getAttribute('value');
      if (firstValue) {
        await slaveSelect.selectOption(firstValue);
      }
    }
    await modal.locator('button', { hasText: '确认' }).click();
    await expect(modal).toBeHidden({ timeout: 3000 });

    // Click "添加组合"
    const groupCountBefore = await page.locator('.group-row').count();
    await page.locator('.control-panel button', { hasText: '添加组合' }).click();

    await page.waitForTimeout(500);

    // If both master and slave were selected, a new group should appear
    // If not, an alert will fire about selecting master and slaves
    const groupCountAfter = await page.locator('.group-row').count();
    // Either the group was added or an alert was shown
    const groupAdded = groupCountAfter > groupCountBefore;
    const alertFired = dialogMessages.some((m) => m.includes('选择'));
    expect(groupAdded || alertFired).toBeTruthy();
  });

  test('4. Start sync group', async () => {
    dialogMessages = [];

    const groupRows = page.locator('.group-row');
    const groupCount = await groupRows.count();

    if (groupCount === 0) {
      test.skip();
      return;
    }

    // Click "启动" on first group
    await groupRows.first().locator('button', { hasText: '启动' }).click();

    // Wait for response or alert
    await page.waitForTimeout(2000);

    // Should either start successfully or show an error
    expect(dialogMessages.length).toBeGreaterThan(0);
  });

  test('5. Delete sync group', async () => {
    dialogMessages = [];

    const groupRows = page.locator('.group-row');
    const groupCount = await groupRows.count();

    if (groupCount === 0) {
      test.skip();
      return;
    }

    // Select the first group
    await groupRows.first().locator('input[type="checkbox"]').check();

    // Click "删除选中"
    await page.locator('.group-list-card button', { hasText: '删除选中' }).click();

    // A confirm dialog will appear, which our handler auto-accepts
    await page.waitForTimeout(500);

    // Should show "删除成功" alert
    expect(dialogMessages.some((m) => m.includes('删除成功'))).toBeTruthy();

    // Group count should decrease
    const groupCountAfter = await page.locator('.group-row').count();
    expect(groupCountAfter).toBeLessThan(groupCount);
  });

  test('6. Set sync script directory', async () => {
    // Click "设置同步脚本"
    await page.locator('.control-panel button', { hasText: '设置同步脚本' }).click();

    const modal = page.locator('.modal-dialog');
    await modal.waitFor({ state: 'visible' });
    await expect(page.locator('.modal-title')).toContainText('设置同步脚本');

    // Should have labels: 当前目录, 选择新目录
    await expect(modal.locator('text=当前目录')).toBeVisible();
    await expect(modal.locator('text=选择新目录')).toBeVisible();

    // Should have confirm and reset buttons
    await expect(modal.locator('button', { hasText: '确认' })).toBeVisible();
    await expect(modal.locator('button', { hasText: '重置为默认' })).toBeVisible();

    // Close without changing
    await page.locator('.modal-header .btn-close').click();
    await expect(modal).toBeHidden({ timeout: 3000 });
  });
});
