# Web3ToolBox 问题追踪日志

## 环境信息
- **运行环境**: PVE 虚拟机，Debian 13 带桌面
- **GPU**: Virtio 1.0 GPU (虚拟显卡，无独立显卡)
- **渲染器**: llvmpipe (LLVM 19.1.7, 256 bits) — 软件渲染
- **显示**: X11 (DISPLAY=:10)，无 Xvfb/Xorg 进程（通过 PVE 虚拟显示）
- **Electron**: v29.0.1
- **Node.js**: v24.15.0

---

## 问题清单

### 🔴 P0 — 严重问题（阻断启动）

#### 1. Electron 窗口创建后立即消失
- **发现时间**: 2026-05-16
- **现象**: Electron 主进程在窗口创建后约 25-36 秒自动退出
- **根因**: 
  1. GPU 进程在虚拟机中不断崩溃 (`viz_main_impl.cc(196)` 错误)
  2. `window-all-closed` 事件触发 `app.quit()`
  3. `before-quit` 处理器中的 `e.preventDefault()` + `app.quit()` 模式导致进程无法正常退出
- **修复**:
  1. 添加 `app.disableHardwareAcceleration()` 和多个 `--disable-gpu-*` 命令行开关
  2. 修改 `window-all-closed` 处理器，在 Linux 上不自动退出
  3. 简化 `before-quit` 处理器，移除 `e.preventDefault()` 循环
- **状态**: ✅ 已修复

#### 2. config.getInstance() TDZ 问题
- **发现时间**: 2026-05-16
- **现象**: `ReferenceError: Cannot access 'config' before initialization`
- **根因**: electron utilityProcess 中模块加载顺序与 node 不同，模块级 `const config = require('../../config').getInstance()` 在 config.js 初始化完成前被访问
- **修复**: 将所有模块级 `config` 引用改为函数内延迟加载
- **影响文件**: `toolServiceManager.js`, `memoryService.js`, `router.js`
- **状态**: ✅ 已修复

#### 3. IS_BUILD 环境变量未传递
- **发现时间**: 2026-05-16
- **现象**: 启动脚本设置了 `IS_BUILD=false`，但 electron 主进程中 `isBuild` 为 `true`
- **根因**: 环境变量在子进程中丢失
- **修复**: 确保启动脚本正确传递环境变量
- **状态**: ✅ 已修复

---

### 🟡 P1 — 中等问题（影响功能）

#### 4. 指纹系统基础功能缺失
- **发现时间**: 2026-05-16
- **现象**: 硬件参数全部硬编码 (memory=8, concurrency=8)，屏幕指纹已注释
- **修复**:
  1. 添加 13 种硬件配置，按设备类型分配
  2. 添加 12 种屏幕分辨率配置
  3. 添加 5 种操作系统字体集
  4. 升级音频噪声算法 (xorshift128+)
  5. 添加指纹一致性校验系统
- **状态**: ✅ 已修复

#### 5. 前后端 API 不匹配
- **发现时间**: 2026-05-16
- **现象**: 前端调用的 API 后端缺少对应路由
- **缺少的后端路由**:
  - `POST /api/openEnv`
  - `POST /api/initTwitters`
  - `GET /api/state/sessions/:agentId`
  - `POST /api/state/app/set`
  - `GET/POST /api/state/app/language`
- **修复**: 添加所有缺失的后端路由和前端 API 方法
- **状态**: ✅ 已修复

#### 6. 子服务路径解析错误
- **发现时间**: 2026-05-16
- **现象**: `Cannot find module '/home/jimwong/projects/dbservice/index.js'`
- **根因**: `IS_BUILD=false` 时路径解析为 `../../dbservice/` 而非 `../../../toolBoxClient/dbservice/`
- **修复**: 确保 IS_BUILD 环境变量正确传递
- **状态**: ✅ 已修复

---

### 🟢 P2 — 轻微问题（优化项）

#### 7. 窗口尺寸过小
- **现象**: 默认窗口 800x600，在桌面环境下偏小
- **建议**: 调整为 1200x800 或更大
- **状态**: ⏳ 待优化

#### 8. GPU 进程崩溃日志
- **现象**: 即使禁用了 GPU，仍有 `viz_main_impl.cc(196)` 错误日志
- **影响**: 不影响功能，但日志嘈杂
- **状态**: ⏳ 待优化

---

## 修复文件清单

### 后端文件
| 文件 | 修复内容 |
|------|---------|
| `server/services/fingerPrintService.js` | 硬件/屏幕/字体/音频/一致性校验 |
| `server/services/fingerprintAuditor.js` | 新建（指纹检测模块） |
| `server/services/tlsFingerprint.js` | 新建（TLS 指纹伪装） |
| `server/services/memoryService.js` | config 延迟加载 |
| `server/services/toolServiceManager.js` | config 延迟加载 + FP_CHROMIUM_PATH |
| `server/server.js` | 扩展 uncaughtException 处理 |
| `server/router.js` | 新增 6 个路由 + config 延迟加载 |
| `config.js` | 添加 fingerprintChromiumPath + getFingerprintChromiumPath() |

### 前端文件
| 文件 | 修复内容 |
|------|---------|
| `client/src/utils/api.js` | 新增 16 个 API 方法 |
| `electron.js` | GPU 禁用 + 窗口管理 + before-quit 修复 |
| `preload.js` | openFile 参数透传 |

### 配置文件
| 文件 | 修复内容 |
|------|---------|
| `assets/fingerprint-chromium/` | 集成 adryfish/fingerprint-chromium 144 |
| `.gitignore` | 排除 fingerprint-chromium 二进制 |
| `桌面/启动Web3ToolBox.sh` | 简化启动参数 |

---

## 测试结果

### 通过的测试
- ✅ 后端 30001 端口正常监听
- ✅ dbservice 30002 端口正常监听
- ✅ toolService 30004 端口正常监听
- ✅ `/api/readiness` 返回全部通过
- ✅ `/api/tls/config` 返回 TLS 配置
- ✅ WebSocket 前端连接成功
- ✅ 指纹生成全链路（硬件/屏幕/字体/音频）
- ✅ 一致性校验正确检测不匹配
- ✅ 模块加载无 TDZ 错误

### 待验证
- ⏳ 窗口在虚拟机桌面环境中稳定显示
- ⏳ 用户通过前端 UI 创建指纹环境
- ⏳ 配置 SOCKS 代理 (100.100.106.53:20010)
- ⏳ 通过 fingerprint-chromium 打开 www.google.com

---

## 已知限制
1. **虚拟机 GPU**: Virtio GPU + llvmpipe 软件渲染，Electron 窗口可能不稳定
2. **窗口管理**: 在 PVE 虚拟桌面环境下，窗口可能需要手动激活才能显示
3. **fingerprint-chromium**: 需要手动下载预编译二进制，不支持自动更新
