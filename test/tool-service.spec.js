// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * E2E Test: toolService lifecycle — startup, health, register, execute.
 *
 * Prerequisites:
 *   - `yarn dev` running (starts toolService on :30004 via toolServiceManager)
 *
 * Run:
 *   npx playwright test -c test/playwright.config.js test/tool-service.spec.js
 */

const TOOL_SERVICE_URL = 'http://127.0.0.1:30004';
const BACKEND_URL = 'http://127.0.0.1:30001/api';

test.describe('toolService E2E', () => {

    test('toolService is healthy after yarn dev', async () => {
        // Direct call to toolService
        const resp = await fetch(`${TOOL_SERVICE_URL}/health`);
        expect(resp.ok).toBeTruthy();
        const data = await resp.json();
        expect(data.success).toBe(true);
        expect(data.service).toBe('toolService');
    });

    test('toolService is accessible via backend proxy', async () => {
        const resp = await fetch(`${BACKEND_URL}/tools/health`);
        expect(resp.ok).toBeTruthy();
        const data = await resp.json();
        expect(data.success).toBe(true);
        expect(data.service).toBe('toolService');
    });

    test('register, list, and execute a tool via proxy', async () => {
        // Register
        const regResp = await fetch(`${BACKEND_URL}/tools/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'e2e_echo',
                description: 'Echo params back',
                parameters: { type: 'object' },
                category: 'test'
            })
        });
        expect(regResp.ok).toBeTruthy();
        const regData = await regResp.json();
        expect(regData.success).toBe(true);

        // List
        const listResp = await fetch(`${BACKEND_URL}/tools/list`);
        expect(listResp.ok).toBeTruthy();
        const listData = await listResp.json();
        expect(listData.success).toBe(true);
        const names = listData.tools.map(t => t.name);
        expect(names).toContain('e2e_echo');

        // Execute (remote-registered tools return placeholder)
        const execResp = await fetch(`${BACKEND_URL}/tools/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'e2e_echo', params: { msg: 'hello' } })
        });
        expect(execResp.ok).toBeTruthy();
        const execData = await execResp.json();
        expect(execData.success).toBe(true);
    });

    test('config endpoint returns chromePath', async () => {
        const resp = await fetch(`${TOOL_SERVICE_URL}/config`);
        expect(resp.ok).toBeTruthy();
        const data = await resp.json();
        expect(data).toHaveProperty('chromePath');
        expect(data).toHaveProperty('savePath');
        // chromePath should be set if savePath.json exists
        if (data.chromePath) {
            expect(data.chromePath).toContain('chrome');
        }
    });
});
