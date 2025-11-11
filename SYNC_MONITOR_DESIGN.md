# 定时监听 vs 事件驱动 - 混合方案设计

## 问题陈述

实现双层同步机制时，需要考虑以下冲突场景：
1. **点击创建新标签页** → Master 创建页面 + Slave 异步创建页面 = 重复页面？
2. **定时器检测到页面变化** → 同时广播 navigate/close 事件 = 状态不一致？
3. **URL 变化既通过 navigate 事件又通过定时器检测** = 重复处理？
4. **用户手动在 Slave 创建页面** → Master 定时器无感知 = 同步丢失？

## 解决方案：混合事件驱动 + 定时监听

### 架构设计

```
Master Browser
├─ Event-Driven Layer (实时性强)
│  ├─ targetcreated listener → 新页面立即创建 + 注入事件监听
│  ├─ targetchanged listener → 激活态变化立即同步
│  ├─ 页面内 click/input/scroll 事件 → 实时广播到 Slave
│  └─ 广播延迟: ~50-100ms
│
└─ Timer-Based Monitor Layer (容错性强) 【1秒检查一次】
   ├─ 检测新页面（targetcreated 可能被错过的情况）
   ├─ 检测页面关闭（可能缺少关闭事件的情况）
   ├─ 检测 URL 变化（SPA 导航或脚本导航）
   └─ 去重：只广播上次未广播过的状态变化
```

### 关键去重机制

#### 1. **URL 变化去重**
```javascript
// 只在 URL 确实变化时才广播
const lastUrl = lastUrlByPageId.get(pageId);
if (url && lastUrl !== url) {
    lastUrlByPageId.set(pageId, url);
    broadcastToSlaves({ type: 'navigate', pageId, url });
}
```
- 多个事件来源都会更新 `lastUrlByPageId`（targetcreated + timer）
- 只有首次不同的 URL 才会触发广播

#### 2. **页面创建去重**
```javascript
// 检查是否已经存在该页面
let pageId = Array.from(pageById.entries())
    .find(([, p]) => p === page)?.[0];

if (!pageId) {
    // 仅当不存在时才创建新 pageId
    pageId = `p-${++pageIdSeq}`;
    await wirePage(page, pageId);
}
```
- targetcreated 先发现 → 创建 pageId + 注入事件监听
- 1秒后定时器再次扫描 → 找到已存在的 pageId，跳过创建

#### 3. **页面关闭去重**
```javascript
// 维护快照，跟踪已知页面状态
pageStateSnapshot.set(pageId, {
    url: lastUrlByPageId.get(pageId),
    exists: true/false  // 当前是否存在
});

// 只在从 exists:true 变为 exists:false 时才广播 close 事件
if (snapshot.exists && !currentPageIds.has(pageId)) {
    broadcastToSlaves({ type: 'close', pageId });
    pageStateSnapshot.set(pageId, { ...snapshot, exists: false });
}
```
- 状态快照防止重复的 close 事件

### 工作流程示例

#### 场景 A：用户点击链接打开新标签
```
1. 用户点击 <a href="..."> target="_blank"
2. [Event] targetcreated 触发
   → 创建 pageId = p-2
   → wirePage(p-2) 注入事件监听
   → 检测 URL = "https://example.com"
   → broadcastToSlaves({ type: 'navigate', pageId: 'p-2', url: '...' })
3. [Slave] 接收到 navigate 事件
   → getOrCreatePage('p-2') 创建对应页面
   → page.goto('https://example.com')
4. [Timer] 1秒后扫描页面
   → 找到 p-2 已存在
   → URL 与 lastUrlByPageId 相同，跳过重复广播 ✓ 去重成功
5. 结果：Master 和 Slave 都有 1 个 p-2 页面，且 URL 一致 ✓
```

#### 场景 B：用户手动在 Slave 浏览器创建页面（打开新标签，然后导航到某个地址）
```
1. [Master 事件层] 无感知（用户操作在 Slave 端）
2. [Master 定时器] 1秒后扫描
   → 发现 Master 页面列表没有变化
   → Slave 侧的新页面 Master 看不见 ✗ 不会同步
```
**说明**：这种场景需要在 Slave 侧添加反向同步逻辑（暂未实现）

#### 场景 C：用户在 Master 快速打开多个标签并关闭一个
```
1. 快速创建 p-3, p-4, p-5
   [Event] 3 个 targetcreated 事件分别创建 3 个 pageId
   [Broadcast] 3 个 navigate 事件分别发送到 Slave
2. 用户关闭 p-4
   [Event] 无专用的 targetdestroyed 事件（Chromium 没有）
3. [Timer] 1秒后扫描
   → 当前页面 = [p-3, p-5]
   → pageStateSnapshot 中 p-4 = { exists: true }
   → 检测到 p-4 不在当前列表
   → broadcastToSlaves({ type: 'close', pageId: 'p-4' })
   → 更新 pageStateSnapshot: p-4 = { exists: false }
4. [Slave] 接收 close 事件
   → closedPage = pageMap.get('p-4')
   → closedPage.close()
   → pageMap.delete('p-4') ✓ 同步成功
```

#### 场景 D：SPA 导航（无新页面创建）
```
1. 用户在 p-1 页面点击链接（React Router 路由跳转）
   [在页面内发生] navigate 事件被捕获
   → broadcastToSlaves({ type: 'navigate', pageId: 'p-1', url: 'https://example.com/page2' })
2. [Timer] 1秒后扫描
   → p-1.url() = 'https://example.com/page2'
   → lastUrlByPageId['p-1'] 也是 'https://example.com/page2'
   → 条件 lastUrl !== url 不成立，跳过重复广播 ✓ 去重成功
```

### 冲突防御策略

| 冲突场景 | 防御机制 | 优先级 |
|---------|--------|-------|
| 重复创建页面 | pageId 只在首次生成，之后查找已有 | 高 |
| 重复 navigate 事件 | lastUrlByPageId 跟踪，URL 相同则跳过 | 高 |
| 重复 close 事件 | pageStateSnapshot 状态机，exists 转移控制 | 中 |
| URL 值陈旧 | targetcreated 立即更新 lastUrlByPageId | 中 |
| 事件丢失 | 定时器定期扫描作为兜底 | 低 |

## 性能特征

- **事件驱动层**：延迟 ~50-100ms（IPC + Puppeteer API）
- **定时监听层**：延迟 ~1000ms，CPU 开销 <1%（每秒一次扫描）
- **总同步延迟**：50-100ms（event-driven 为主）/ 1000ms max（timer 兜底）
- **去重开销**：O(1) Map 查找，可忽略

## 已实现的代码位置

### Master (syncFunction.js)
- `startPageMonitor(browser)` - 定时扫描函数
- `stopPageMonitor()` - 清理定时器
- `pageStateSnapshot` - 页面状态快照 Map
- 调用位置：`startSync()` 中启动，`shutdown()` 中清理

### Slave (replicatorWorker.js)
- `if (evt.type === 'close')` - 处理 close 事件
- 自动关闭对应的 pageId 页面

## 后续改进方向

1. **Slave → Master 反向同步**：Slave 中的用户操作无法同步回 Master
   - 方案：在 Slave 侧也添加定时监听，发送状态变化回 Master

2. **事件合并**：目前 navigate + click 可能导致冗余请求
   - 方案：在 Slave handle() 中检测连续的 navigate + click，优化处理顺序

3. **冲突日志**：便于调试去重是否生效
   - 方案：在 lastUrlByPageId 更新前后增加日志记录

4. **页面指纹**：更精准的页面识别
   - 方案：除 URL 外还考虑标题、内容哈希等元数据
