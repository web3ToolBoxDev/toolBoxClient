#!/usr/bin/env node
/**
 * test-sync-monitor.js - 测试定时监听和事件驱动的混合同步
 * 
 * 测试场景：
 * 1. 启动 Master + 1 个 Slave
 * 2. 在 Master 中创建新页面
 * 3. 观察 Slave 是否同步创建
 * 4. 在 Master 中关闭页面
 * 5. 观察 Slave 是否同步关闭
 */

const { fork } = require('child_process');
const path = require('path');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
    console.log('=== 开始测试同步监听机制 ===\n');

    // 准备配置
    const testPayload = {
        masterEnv: { 
            id: 'master', 
            language_js: 'zh-CN'
        },
        slaveEnvs: [
            { 
                id: 'slave-1', 
                language_js: 'zh-CN'
            }
        ],
        chromePath: undefined,
        savePath: path.join(__dirname, '.test-profiles'),
        metamaskDir: undefined,
        startUrl: 'https://example.com',
        initialPosition: { x: 40, y: 40, width: 1280, height: 900 }
    };

    // 启动 syncFunction 主进程
    const syncProc = fork(path.join(__dirname, 'assets/scripts/syncFunction.js'));

    console.log('[测试] 启动 syncFunction 进程\n');

    // 等待启动就绪
    await sleep(2000);

    // 向 syncFunction 发送初始化消息
    syncProc.send({
        type: 'init',
        payload: testPayload
    });

    console.log('[测试] 已发送 init 消息，等待 Master + Slave 启动...\n');

    // 监听日志
    const logs = [];
    syncProc.on('message', (msg) => {
        if (msg && msg.type === 'log') {
            logs.push(msg.message);
            console.log(`[Master Log] ${msg.message}`);
        }
    });

    // 等待初始化完成（观察日志）
    await sleep(5000);

    console.log('\n=== 测试场景 1: 创建新页面 ===');
    console.log('预期: Master 创建 p-1，Slave 同步创建');
    console.log('观察日志中是否有:');
    console.log('  - Master: "[monitor] 检测到新页面: p-x" 或 targetcreated 事件');
    console.log('  - Slave: 新建页面并导航到 URL\n');

    await sleep(3000);

    console.log('\n=== 测试场景 2: 定时监听去重 ===');
    console.log('预期: 同一页面的 URL 变化只广播一次');
    console.log('观察日志中是否有:');
    console.log('  - 同一 pageId 只有一条 "navigate" 事件');
    console.log('  - timer 检测到相同 URL 时跳过广播\n');

    await sleep(3000);

    console.log('\n=== 测试场景 3: 页面关闭同步 ===');
    console.log('预期: Master 关闭页面，Slave 同步关闭');
    console.log('观察日志中是否有:');
    console.log('  - Master: "[monitor] 页面 p-x 已关闭"');
    console.log('  - Slave: "Closed page: p-x"\n');

    await sleep(3000);

    // 输出日志统计
    console.log('\n=== 日志统计 ===');
    const navigateCount = logs.filter(l => l.includes('navigate')).length;
    const closeCount = logs.filter(l => l.includes('close')).length;
    const monitorCount = logs.filter(l => l.includes('[monitor]')).length;
    const activateCount = logs.filter(l => l.includes('activate') || l.includes('activate')).length;

    console.log(`navigate 事件: ${navigateCount}`);
    console.log(`close 事件: ${closeCount}`);
    console.log(`monitor 扫描: ${monitorCount}`);
    console.log(`activate 事件: ${activateCount}`);

    // 清理
    console.log('\n[测试] 发送 terminate 信号...\n');
    syncProc.send({ type: 'terminate_process' });

    await sleep(2000);

    console.log('=== 测试完成 ===');
    syncProc.kill();
    process.exit(0);
}

// 运行测试
test().catch(err => {
    console.error('测试失败:', err);
    process.exit(1);
});
