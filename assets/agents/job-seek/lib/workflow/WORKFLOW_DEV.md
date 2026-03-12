# Workflow System — Development Status & Architecture

PRD Reference: `C:\Users\z5866\Documents\Toolbox\workflowPrd\workflowPrd.md`
Phase 9 Plan: See `dynamic-memory-plan.md` → Phase 9

---

## Architecture Overview

```
dashboardServer.js  (:30003)        ← HTTP server, serves dashboard HTML + JSON APIs
  ├── /api/dashboard/:sid            — profile/direction/subtask data
  ├── /api/jobs/:sid                 — job card CRUD
  ├── /api/pipeline/:sid/*           — search pipeline control
  ├── /api/workflow-status/:sid      — platform cell visual states
  └── /dashboard/:sid                — HTML page with workflow grid UI

workflow/
  ├── workflowEngine.js              — 4-step orchestrator (customizeProfile → search → generate → apply)
  ├── workflowConfig.js              — config builder, validation, source metadata
  ├── workflowStore.js               — in-memory config/run/history store
  ├── workflowViewModel.js           — stable DTO for frontend rendering
  ├── platformStore.js               — platform CRUD, location presets, tool persistence
  ├── platformService.js             — login flow, browser launch, login verification
  ├── scriptBuilder.js               — AI-driven Puppeteer script generation (5-step)
  └── steps/
        ├── customizeProfile.js      — validate profile + direction
        ├── search.js                — delegates to searchPipeline
        ├── generate.js              — tailor resume + cover letter per job
        └── apply.js                 — tracks application submissions
```

---

## Implemented Features (Stories 9.1–9.16)

### 9.1 Workflow Engine & Config ✅
- `workflowEngine.js`: start/stop/resume/getStatus, login check, async pipeline
- `workflowConfig.js`: buildDefaultConfig(), validateConfig(), mergeConfig(), SOURCE_META
- `workflowStore.js`: config/run/history CRUD, step status updates
- `workflowViewModel.js`: buildViewModel() DTO

### 9.2 Platform Store & Presets ✅
- `platformStore.js`: addPlatform/removePlatform/updatePlatform/getPlatform
- Location-based presets (REGION_PRESETS): canada, us, uk, germany, china, japan, australia, india
- `initWithPresets(sessionId, location)` — auto-seeds platforms by region
- Tool script disk persistence (`data/platform-tools.json`) — survives session restarts
- `_restoreTools()` — auto-loads saved scripts on platform creation

### 9.3 Platform Service — Login & Browser ✅
- `platformService.js`: launchLogin(), verifyLogin(), confirmLogin(), bindEnv()
- `LOGIN_DETECTORS[]` — 15 platform selectors (Indeed, LinkedIn, Glassdoor, Boss直聘, etc.)
- EnvId hierarchy: platform-level > session-level
- Proxy support: auto-start proxy if env has proxy config
- Shared browser tracking: `_envBrowsers` Map(envId → browserId)

### 9.4 Shared Browser for Same EnvId ✅
- Multiple platforms with same envId share browser process
- New tabs via `page_new` tool, `_pageIndex` per platform

### 9.5 Cascading Login Verification ✅
- 3-tier: DOM selector → screenshot + AI → manual confirmation
- `setScreenshotVerifier()` — injectable AI verifier function
- Stale selector detection: `_staleSelectorHints` map
- `getStaleSelectorHints()` / `clearStaleSelectorHint()` for AI-powered updates

### 9.6 CLI Screenshot Verification ✅
- claude-code/codex-cli stdin piping for screenshot analysis

### 9.7 Dashboard Workflow Grid UI ✅
- HTML rendered in `buildDashboardHTML()` (dashboardServer.js)
- Platform Status grid: login / search / apply columns
- Env selector dropdown per platform
- Login/Verify/Confirm buttons
- Tool build buttons (Generate Search Tool / Generate Apply Tool)
- Cell visual states via `computeCellVisual()`
- `updatePlatformCell()` / `getWorkflowStatus()` APIs

### 9.8 Loading Overlay & Throttle ✅
- `_busyCells` set in dashboard HTML JS
- Spinner overlay during async operations

### 9.9–9.10 E2E Provider Support + Env API Proxy ✅
- `/api/envs` endpoint for dashboard env selectors

### 9.13 AI Script Builder — Search Tool ✅
- `scriptBuilder.js`: buildTool() — 5-step flow:
  1. Page Load (reuse logged-in browser or launch fresh)
  2. DOM Analysis (page_evaluate + screenshot)
  3. AI Script Generation (prompt + DOM + screenshot → AI → code block extraction)
  4. Verification (execute script via pageProxy → screenshot → AI verdict)
  5. Store (platformStore.updateToolStatus → disk persistence)
- `buildPageProxy()` — Puppeteer-like API bridging to toolServiceClient
- `executeSearchScript()` — run stored search script against live platform
- `healScript()` — AI-powered self-healing for broken scripts
- Anti-bot detection (`_detectAntiBot`)
- Max 3 retries on verification failure

---

## ✅ Merge Issues — ALL RESOLVED

### Issue 1: Missing API Routes in dashboardServer — FIXED

All routes registered. **dashboard-features.e2e.test.js** (38 tests) + **workflow-api.e2e.test.js** (18 tests) pass.

### Issue 2: platformService ↔ dashboardServer Bridge — FIXED

Added `_syncToDashboard()` bridge in platformService to call `updatePlatformCell()` after login/verify/confirm.

### Issue 3: Dashboard HTML — FIXED

All interactive elements (login, build, execute, settings modals, stats, i18n, SSE) are functional.

---

## PRD Coverage Analysis (up to "Build Search Tool")

| PRD Section | Feature | Code Status |
|---|---|---|
| §3.1 Control Bar | Start/Stop + Status | Backend logic ✅, HTTP routes ❌ |
| §3.2 Config Triggers | Add Website, Global Settings, Alerts | Backend logic ✅, HTTP routes ❌ |
| §3.6 Add Target Website Modal | Platform CRUD | platformStore ✅, HTTP routes ❌ |
| §4.1 Grid Structure | Dynamic columns | HTML in dashboardServer ✅ |
| §4.2 Column Headers | Icon, name, mode, status | HTML ✅ |
| §4.3 Row Headers | Step numbers, colors | HTML ✅ |
| §4.4 Step 1 — Connection + Tool Build | Login, Generate Search/Apply Tool | platformService ✅, scriptBuilder ✅, routes ❌ |
| §4.4 Step 2 — Search | executeSearchScript | scriptBuilder ✅, routes ❌ |
| §4.5 Cell Status Overlays | Visual states | computeCellVisual() ✅, CSS in HTML ✅ |
| §4.6 Stuck State | Error + retry buttons | Backend partial ✅, routes ❌ |
| §7.1 Workflow Control API | start/stop/status | workflowEngine ✅, routes ❌ |
| §7.3 Platform Management API | CRUD + connect + retry | platformStore + platformService ✅, routes ❌ |
| §7.4 Script Builder API | build/status/script/test | scriptBuilder ✅, routes ❌ |
| §8.2 Search Tool Build Flow | 5-step AI pipeline | scriptBuilder.buildTool() ✅ |
| §8.4 Build Progress UI | Progress bar, logs | HTML partial ✅, WebSocket ❌ |
| §8.5 AI Prompt Spec | Search script prompt | buildGeneratePrompt() ✅ |
| §8.6 Script Storage | Version, buildLog, screenshots | platformStore + disk ✅ |
| §9.1 Workflow Engine | Pipeline orchestration | workflowEngine ✅ |
| §10.1 Platform Data Model | Full interface | platformStore.createPlatform() ✅ |
| §10.3 Workflow State Model | cellStates, stats | workflowStore ✅ |
| §10.4 PlatformTool Model | status, script, version, buildLog | platformStore ✅ |

---

## Sprint Status

### Sprint 1+2 ✅ — Route Registration + Dashboard HTML
- All 30+ HTTP routes registered in dashboardServer
- Platform service bridge functional
- Dashboard HTML with control bar, modals, grid, filters, pagination
- 56 E2E tests pass (38 dashboard-features + 18 workflow-api)

### Sprint 3 ✅ — Remaining Features (excl auto-apply)
| Story | Feature | Status |
|---|---|---|
| 9.21 | Stuck Detection & Status Reflect | ✅ `checkStuckSteps()`, configurable timeouts |
| 9.22 | Runtime Script Self-Healing | ✅ Auto-heal on execute failure |
| 9.23 | Cell Status Overlays (CSS) | ✅ `.cell-running`, `.cell-stuck`, `.cell-building` |
| 9.24 | Partial Execution | ✅ `skipStep()`, `retryStep()` APIs |
| 9.25 | Schedule Engine | ✅ `scheduleEngine.js` — interval, time window, max runs |
| 9.26 | Dashboard i18n | ✅ zh-CN/en translations, `switchLang()` toggle |
| 9.27 | SSE Live Push | ✅ `EventSource` stream, auto-reconnect, keepalive |
| 9.28 | Dashboard Stats Panel | ✅ `/api/workflow/:sid/stats`, HTML stats grid |
| 9.29 | AI Stale Selector Update | ✅ `/api/workflow/:sid/stale-selectors` routes |
| 18 E2E tests | workflow-sprint3.e2e.test.js | ✅ All pass |

### Excluded (per user request)
| Story | Feature | Reason |
|---|---|---|
| 9.17 | Apply Tool Builder | Auto-apply excluded |
| 9.19 | Auto Apply (Step 4) | Auto-apply excluded |
| 9.20 | Pre-Apply Email Confirmation | Depends on 9.19 |

---

## File Inventory

### Core Modules
| File | Lines | Tests | Description |
|---|---|---|---|
| `workflowEngine.js` | 241 | workflowEngine.test.js | 4-step orchestrator |
| `workflowConfig.js` | 169 | workflowConfig.test.js | Config builder + validator |
| `workflowStore.js` | 209 | workflowStore.test.js | In-memory config/run/history |
| `workflowViewModel.js` | 76 | — | Frontend view model DTO |
| `platformStore.js` | 344 | platformStore.test.js | Platform CRUD + tool persistence |
| `platformService.js` | 533 | platformService.test.js | Login, browser, verification |
| `scriptBuilder.js` | 863 | scriptBuilder.test.js | AI script build + execute + heal |

### Step Handlers
| File | Description |
|---|---|
| `steps/customizeProfile.js` | Validates profile + direction ready |
| `steps/search.js` | Delegates to searchPipeline, polls for completion |
| `steps/generate.js` | Per-job tailor_resume + cover_letter |
| `steps/apply.js` | Tracks application submissions |

### E2E Tests
| File | Tests For |
|---|---|
| `dashboard-features.e2e.test.js` | Stories 9.11–9.16 (routes MISSING in server!) |
| `workflow-api.e2e.test.js` | Workflow API endpoints |

### Dashboard Server (dashboardServer.js) — Full Route Inventory
| Route | Method | Status |
|---|---|---|
| `/api/dashboard/:sid` | GET | ✅ |
| `/api/jobs/:sid` | GET | ✅ (query + filter + pagination) |
| `/api/jobs/:sid` | POST | ✅ (upsert) |
| `/api/jobs/:sid/status` | POST | ✅ |
| `/api/pipeline/:sid/*` | Various | ✅ (start/stop/status/generate/history) |
| `/api/workflow-status/:sid` | GET | ✅ |
| `/api/workflow-status/:sid/:pid/update` | POST | ✅ |
| `/api/workflow/:sid/status` | GET | ✅ |
| `/api/workflow/:sid/start` | POST | ✅ |
| `/api/workflow/:sid/stop` | POST | ✅ |
| `/api/workflow/:sid/resume` | POST | ✅ |
| `/api/workflow/:sid/config` | GET | ✅ (auto-creates default) |
| `/api/workflow/:sid/config` | PUT | ✅ (merge + validate) |
| `/api/workflow/:sid/view-model` | GET | ✅ (auto-configures) |
| `/api/workflow/:sid/login-status/:source` | GET | ✅ |
| `/api/workflow/:sid/login/:source` | POST | ✅ |
| `/api/workflow/:sid/history` | GET | ✅ |
| `/api/workflow/:sid/stats` | GET | ✅ |
| `/api/workflow/:sid/stuck` | GET | ✅ |
| `/api/workflow/:sid/retry/:step` | POST | ✅ |
| `/api/workflow/:sid/skip/:step` | POST | ✅ |
| `/api/workflow/:sid/stale-selectors` | GET | ✅ |
| `/api/workflow/:sid/stale-selectors/clear` | POST | ✅ |
| `/api/workflow/:sid/schedule` | GET/POST | ✅ |
| `/api/workflow/:sid/schedule/pause` | POST | ✅ |
| `/api/workflow/:sid/schedule` | DELETE | ✅ |
| `/api/platforms/:sid` | GET | ✅ (auto-init presets) |
| `/api/platforms/:sid` | POST | ✅ (201 on success) |
| `/api/platforms/:sid/:pid` | DELETE | ✅ |
| `/api/platforms/:sid/:pid/login` | POST | ✅ (404 for unknown) |
| `/api/platforms/:sid/:pid/verify-login` | POST | ✅ |
| `/api/platforms/:sid/:pid/confirm-login` | POST | ✅ |
| `/api/platforms/:sid/:pid/bind-env` | POST | ✅ |
| `/api/platforms/:sid/:pid/tools/:type/build-log` | GET | ✅ |
| `/api/platforms/:sid/:pid/tools/search/build` | POST | ✅ |
| `/api/platforms/:sid/:pid/tools/apply/build` | POST | ✅ |
| `/api/platforms/:sid/:pid/tools/search/execute` | POST | ✅ (auto-heal) |
| `/api/platforms/:sid/:pid/tools/search/heal` | POST | ✅ |
| `/api/events/:sid` | GET | ✅ (SSE stream) |
| `/api/envs` | GET | ✅ |
| `/api/active-session` | GET | ✅ |
| `/dashboard` | GET | ✅ (redirect) |
| `/dashboard/:sid` | GET | ✅ (HTML + i18n) |
| `/ping` | GET | ✅ |
| `/debug` | GET | ✅ |
| `/shutdown` | POST | ✅ |
