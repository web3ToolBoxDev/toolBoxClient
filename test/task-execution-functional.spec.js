/**
 * task-execution-functional.spec.js
 *
 * API-level functional tests for task execution and sync features.
 * Covers: task lifecycle (CRUD), task execution with WebSocket protocol,
 * sync script directory config, and agent task queries.
 *
 * Requires the backend to be running on BACKEND_URL (default http://127.0.0.1:30001).
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:30001';

/** Helper: POST JSON and return parsed response */
async function postJson(endpoint, body = {}) {
  const res = await fetch(`${BACKEND}/api${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

/** Helper: DELETE with JSON body */
async function deleteJson(endpoint, body = {}) {
  const res = await fetch(`${BACKEND}/api${endpoint}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

/** Helper: GET and return parsed response */
async function getJson(endpoint) {
  const res = await fetch(`${BACKEND}/api${endpoint}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

/** Guard: ensure backend is reachable */
async function isBackendReady() {
  try {
    const res = await fetch(`${BACKEND}/api/getSavePath`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Group 1: Task Lifecycle (CRUD)
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('Task Lifecycle', () => {
  const EXAMPLE_DIR = path.resolve(__dirname, '..', 'example');
  const IMPORTED_TASK_NAME = '测试任务'; // from example/taskConfig.json

  test.beforeAll(async () => {
    const ready = await isBackendReady();
    expect(ready, 'Backend must be running').toBeTruthy();
  });

  test('T1: GET /api/getAllTasks returns array', async () => {
    const data = await getJson('/getAllTasks');
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('T2: POST /api/importTask imports example task', async () => {
    const result = await postJson('/importTask', { directory: EXAMPLE_DIR });
    expect(result).toBeTruthy();
    expect(result.success).toBe(true);
  });

  test('T3: GET /api/getAllTasks shows imported task', async () => {
    const data = await getJson('/getAllTasks');
    expect(Array.isArray(data)).toBeTruthy();
    const found = data.some((t) => t.taskName === IMPORTED_TASK_NAME);
    expect(found, `Expected "${IMPORTED_TASK_NAME}" in task list`).toBeTruthy();
  });

  test('T4: POST /api/getConfigInfo returns config for imported task', async () => {
    const result = await postJson('/getConfigInfo', { taskName: IMPORTED_TASK_NAME });
    expect(result).toBeTruthy();
    expect(result.success).toBe(true);
    // config may be undefined/empty for a freshly imported task — that's OK
  });

  test('T5: POST /api/setConfigInfo saves config', async () => {
    const newConfig = {
      default: { testInput: 'e2e-value' },
    };
    const result = await postJson('/setConfigInfo', {
      taskName: IMPORTED_TASK_NAME,
      config: newConfig,
    });
    expect(result).toBeTruthy();
    expect(result.success).toBe(true);
  });

  test('T6: POST /api/getConfigInfo verifies saved config', async () => {
    const result = await postJson('/getConfigInfo', { taskName: IMPORTED_TASK_NAME });
    expect(result.success).toBe(true);
    expect(result.config).toBeTruthy();
    expect(result.config.default).toBeTruthy();
    expect(result.config.default.testInput).toBe('e2e-value');
  });

  test('T7: DELETE /api/deleteTask removes imported task', async () => {
    const result = await deleteJson('/deleteTask', { taskNames: [IMPORTED_TASK_NAME] });
    expect(result).toBeTruthy();
    // deleteTask returns { success, code, numRemoved } or a string like "delete 1 tasks"
    if (typeof result === 'object') {
      expect(result.success).toBe(true);
    }
  });

  test('T8: GET /api/getAllTasks confirms task removed', async () => {
    const data = await getJson('/getAllTasks');
    expect(Array.isArray(data)).toBeTruthy();
    const found = data.some((t) => t.taskName === IMPORTED_TASK_NAME);
    expect(found, `"${IMPORTED_TASK_NAME}" should no longer exist`).toBeFalsy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 2: Task Execution E2E
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('Task Execution E2E', () => {
  const TASK_NAME = `e2e_exec_task_${Date.now()}`;
  let tempDir;
  let generatedEnvId;

  test.beforeAll(async () => {
    const ready = await isBackendReady();
    expect(ready, 'Backend must be running').toBeTruthy();
  });

  test.afterAll(async () => {
    // Cleanup: delete imported task
    try {
      await deleteJson('/deleteTask', { taskNames: [TASK_NAME] });
    } catch { /* best effort */ }

    // Cleanup: delete generated fingerprint
    if (generatedEnvId) {
      try {
        await postJson('/deleteFingerPrints', { ids: [generatedEnvId] });
      } catch { /* best effort */ }
    }

    // Cleanup: remove temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch { /* best effort */ }
    }
  });

  test('E1: Create temp task script and config', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-task-'));

    // The task script implements the WebSocket protocol:
    // connect -> heartbeat -> request_task_data -> receive data -> log -> complete
    const scriptContent = `
const WebSocket = require('ws');
const url = process.argv[2];
const ws = new WebSocket(url);

ws.on('open', () => {
  // Start heartbeat
  const hb = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'heart_beat' }));
    } else {
      clearInterval(hb);
    }
  }, 5000);

  // Request task data
  ws.send(JSON.stringify({ type: 'request_task_data', data: '' }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'request_task_data') {
    // Got task data — send a log then complete
    ws.send(JSON.stringify({ type: 'task_log', message: 'E2E test running' }));
    setTimeout(() => {
      ws.send(JSON.stringify({
        type: 'task_completed',
        taskName: '${TASK_NAME}',
        success: true,
        message: 'E2E test completed'
      }));
      setTimeout(() => process.exit(0), 500);
    }, 1000);
  }
  if (msg.type === 'terminate_process') {
    ws.send(JSON.stringify({ type: 'terminate_process' }));
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('WS error:', err.message);
  process.exit(1);
});
`;

    const taskConfig = [
      {
        taskName: TASK_NAME,
        taskI18n: { 'zh-CN': TASK_NAME, en: TASK_NAME },
        scriptPath: './e2e_script.js',
        taskKey: `e2eExecTask_${Date.now()}`,
        defaultTask: false,
        taskType: 'execByWallet',
        taskSchema: {},
      },
    ];

    fs.writeFileSync(path.join(tempDir, 'e2e_script.js'), scriptContent, 'utf8');
    fs.writeFileSync(
      path.join(tempDir, 'taskConfig.json'),
      JSON.stringify(taskConfig, null, 2),
      'utf8'
    );

    expect(fs.existsSync(path.join(tempDir, 'e2e_script.js'))).toBeTruthy();
    expect(fs.existsSync(path.join(tempDir, 'taskConfig.json'))).toBeTruthy();
  });

  test('E2: Import the test task', async () => {
    const result = await postJson('/importTask', { directory: tempDir });
    expect(result).toBeTruthy();
    expect(result.success).toBe(true);

    // Verify it appeared
    const tasks = await getJson('/getAllTasks');
    const found = tasks.some((t) => t.taskName === TASK_NAME);
    expect(found, `Imported task "${TASK_NAME}" should exist`).toBeTruthy();
  });

  test('E3: Generate a fingerprint for execution', async () => {
    const result = await postJson('/generateFingerPrints', { counts: 1 });
    expect(result).toBeTruthy();

    // Get the generated fingerprint ID
    const fps = await getJson('/getFingerPrints');
    expect(fps).toBeTruthy();
    expect(fps.success).toBe(true);
    expect(fps.data).toBeTruthy();

    const ids = Object.keys(fps.data);
    expect(ids.length).toBeGreaterThan(0);
    generatedEnvId = ids[ids.length - 1]; // last one is most recent
  });

  test('E4: Execute task via POST /api/execTask', async () => {
    expect(generatedEnvId, 'Must have a fingerprint env ID').toBeTruthy();

    const result = await postJson('/execTask', {
      taskName: TASK_NAME,
      taskData: {
        envIds: [generatedEnvId],
      },
    });

    expect(result).toBeTruthy();
    // execTask may return { success: true } or { code: 0 } on success
    if (result.success === false) {
      // If it failed, it should not be a "task not found" error
      console.log('execTask result:', result);
    }
    // The task was dispatched (success != false means dispatched)
    expect(result.success).not.toBe(false);
  });

  test('E5: Wait for task completion (poll status)', async () => {
    const maxWait = 30000; // 30 seconds
    const pollInterval = 2000;
    const start = Date.now();
    let completed = false;

    while (Date.now() - start < maxWait) {
      const status = await postJson('/getTaskStatus', { taskNames: [TASK_NAME] });
      if (status && typeof status === 'object') {
        const isRunning = status[TASK_NAME];
        if (isRunning === false) {
          completed = true;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, pollInterval));
    }

    expect(completed, 'Task should complete within 30 seconds').toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 3: Sync Function API (config layer)
// ═══════════════════════════════════════════════════════════════════════════
test.describe.serial('Sync Function Config API', () => {
  let originalDirectory;
  let tempDir;

  test.beforeAll(async () => {
    const ready = await isBackendReady();
    expect(ready, 'Backend must be running').toBeTruthy();

    // Save original directory so we can restore it
    const current = await getJson('/getSyncScriptDirectory');
    originalDirectory = current?.directory || 'default';
  });

  test.afterAll(async () => {
    // Restore original state
    try {
      await postJson('/resetSyncScriptDirectory');
    } catch { /* best effort */ }

    // Remove temp dir
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch { /* best effort */ }
    }
  });

  test('S1: GET /api/getSyncScriptDirectory returns current directory', async () => {
    const result = await getJson('/getSyncScriptDirectory');
    expect(result).toBeTruthy();
    expect(result.success).toBe(true);
    expect(result.directory).toBeTruthy(); // 'default' or an actual path
  });

  test('S2: POST /api/setSyncScriptDirectory sets a custom directory', async () => {
    // Create a temp directory with a minimal taskConfig.json so set succeeds
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-sync-'));
    fs.writeFileSync(
      path.join(tempDir, 'taskConfig.json'),
      JSON.stringify([]),
      'utf8'
    );

    const result = await postJson('/setSyncScriptDirectory', { directory: tempDir });
    expect(result).toBeTruthy();
    expect(result.success).toBe(true);
  });

  test('S3: GET /api/getSyncScriptDirectory returns updated directory', async () => {
    const result = await getJson('/getSyncScriptDirectory');
    expect(result.success).toBe(true);
    expect(result.directory).toBe(tempDir);
  });

  test('S4: POST /api/resetSyncScriptDirectory resets to default', async () => {
    const result = await postJson('/resetSyncScriptDirectory');
    expect(result).toBeTruthy();
    expect(result.success).toBe(true);
  });

  test('S5: GET /api/getSyncScriptDirectory confirms reset', async () => {
    const result = await getJson('/getSyncScriptDirectory');
    expect(result.success).toBe(true);
    // After reset, directory should be 'default' or the built-in path
    // It should NOT be the tempDir anymore
    expect(result.directory).not.toBe(tempDir);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 4: Agent Tasks
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Agent Tasks', () => {
  test.beforeAll(async () => {
    const ready = await isBackendReady();
    expect(ready, 'Backend must be running').toBeTruthy();
  });

  test('A1: GET /api/getAgentTasks returns array', async () => {
    const data = await getJson('/getAgentTasks');
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('A2: Agent task has correct fields (taskType=ai)', async () => {
    const data = await getJson('/getAgentTasks');
    if (data.length === 0) {
      // No agent tasks loaded — skip rather than fail
      test.skip();
      return;
    }

    for (const task of data) {
      expect(task.taskName).toBeTruthy();
      expect(task.taskType).toBe('ai');
      expect(task.scriptPath).toBeTruthy();
      expect(task.taskSchema).toBeTruthy();
      expect(typeof task.taskSchema).toBe('object');
    }
  });
});
