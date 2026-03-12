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

## ⚠️ Merge Issues Found

### Issue 1: Missing API Routes in dashboardServer

**dashboard-features.e2e.test.js** expects these routes that **DO NOT EXIST** in dashboardServer.js:

| Expected Route | PRD Section | Status |
|---|---|---|
| `GET /api/workflow/:sid/status` | §7.1 | ❌ NOT in dashboardServer |
| `POST /api/workflow/:sid/start` | §7.1 | ❌ NOT in dashboardServer |
| `POST /api/workflow/:sid/stop` | §7.1 | ❌ NOT in dashboardServer |
| `GET /api/workflow/:sid/config` | §7.2 | ❌ NOT in dashboardServer |
| `PUT /api/workflow/:sid/config` | §7.2 | ❌ NOT in dashboardServer |
| `GET /api/workflow/:sid/view-model` | — | ❌ NOT in dashboardServer |
| `GET /api/platforms/:sid` | §7.3 | ❌ NOT in dashboardServer |
| `POST /api/platforms/:sid` | §7.3 | ❌ NOT in dashboardServer |
| `DELETE /api/platforms/:sid/:pid` | §7.3 | ❌ NOT in dashboardServer |
| `POST /api/platforms/:sid/:pid/login` | §7.3 | ❌ NOT in dashboardServer |
| `POST /api/platforms/:sid/:pid/verify-login` | §7.3 | ❌ NOT in dashboardServer |
| `POST /api/platforms/:sid/:pid/confirm-login` | §7.3 | ❌ NOT in dashboardServer |
| `POST /api/platforms/:sid/:pid/bind-env` | §7.3 | ❌ NOT in dashboardServer |
| `POST /api/platforms/:sid/:pid/tools/search/build` | §7.4 | ❌ NOT in dashboardServer |
| `POST /api/platforms/:sid/:pid/tools/search/execute` | §7.4 | ❌ NOT in dashboardServer |
| `GET /api/jobs/:sid` (with filter/pagination) | §7.5 | ❌ NOT in dashboardServer |

**Root Cause**: Stories 9.11–9.16 were developed and tested but the route registration code was never merged into dashboardServer.js. The workflow modules (workflowEngine, platformStore, platformService, scriptBuilder) exist and have full implementations, but the **HTTP bridge** connecting them to the dashboard is missing.

**dashboardServer currently has**:
- ✅ `/api/workflow-status/:sid` — platform cell visual states (read)
- ✅ `/api/workflow-status/:sid/:pid/update` — update cell state (write)
- ✅ `/api/dashboard/:sid` — profile/direction/subtask data
- ✅ `/api/jobs/:sid` (POST) — upsert single job
- ✅ `/api/jobs/:sid/status` (POST) — update job status
- ✅ `/api/pipeline/:sid/*` — search pipeline control
- ❌ Missing: all workflow engine routes, platform CRUD routes, script builder routes, job query routes with filtering

### Issue 2: platformService ↔ dashboardServer Bridge Missing

`platformService.js` updates `platformStore` connection status but **never calls `dashboardServer.updatePlatformCell()`**. This means:
- Login/verify actions update internal platformStore state
- Dashboard UI "Platform Status" grid always shows empty/default values
- The two systems are disconnected

**Fix needed**: After each platformService operation (launchLogin, verifyLogin, confirmLogin, buildTool), call `updatePlatformCell()` to sync the visual state to the dashboard.

### Issue 3: Dashboard HTML Workflow Grid ↔ Missing Endpoints

The HTML rendered by `buildDashboardHTML()` contains JavaScript that calls the workflow API routes (e.g., login, verify, build tool buttons). Since these routes don't exist in the HTTP server, all interactive buttons in the workflow grid will fail with 404.

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

## Next Steps (P1 Priority)

### Must Fix First (Merge Issues)
1. **Register missing API routes in dashboardServer.js** — Wire all `/api/workflow/*`, `/api/platforms/*`, `/api/jobs/*` (query) routes to their backend modules
2. **Bridge platformService → dashboardServer** — Call `updatePlatformCell()` after login/verify/build operations
3. **Verify dashboard-features.e2e.test.js passes** — All 9.11–9.16 E2E tests should pass once routes are registered

### Then Continue P1 Stories
| Story | Feature | PRD |
|---|---|---|
| 9.17 | Apply Tool Builder | §8.3 |
| 9.18 | Generate Materials (Step 3) | §9.1 Step 3 |
| 9.19 | Auto Apply (Step 4) | §9.1 Step 4, §3.4 |
| 9.20 | Pre-Apply Email Confirmation | §3.5, §4.4 Step 4 |
| 9.21 | Status Reflect & Stuck Detection | §4.5, §4.6 |
| 9.22 | Runtime Script Self-Healing | §9.4 |
| 9.23 | Cell Status Overlays (CSS) | §4.5 |
| 9.24 | Partial Execution | §4.7 |
| 9.25 | Schedule Engine | §3.7, §7.7 |
| 9.26 | Dashboard i18n | §3.8 |
| 9.27 | WebSocket Live Push | §7.9 |
| 9.28 | Dashboard Stats Panel | §5 |
| 9.29 | AI Stale Selector Update | — |

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

### Dashboard Server (dashboardServer.js)
| Route | Method | Status |
|---|---|---|
| `/api/dashboard/:sid` | GET | ✅ Working |
| `/api/jobs/:sid` | POST | ✅ Working (upsert) |
| `/api/jobs/:sid/status` | POST | ✅ Working |
| `/api/pipeline/:sid/start` | POST | ✅ Working |
| `/api/pipeline/:sid/stop` | POST | ✅ Working |
| `/api/pipeline/:sid/status` | GET | ✅ Working |
| `/api/pipeline/:sid/generate-resume` | POST | ✅ Working |
| `/api/pipeline/:sid/generate-cover-letter` | POST | ✅ Working |
| `/api/pipeline/:sid/mark-applied` | POST | ✅ Working |
| `/api/pipeline/:sid/history` | GET | ✅ Working |
| `/api/workflow-status/:sid` | GET | ✅ Working |
| `/api/workflow-status/:sid/:pid/update` | POST | ✅ Working |
| `/api/envs` | GET | ✅ Working |
| `/api/active-session` | GET | ✅ Working |
| `/dashboard` | GET | ✅ Working (redirect) |
| `/dashboard/:sid` | GET | ✅ Working (HTML) |
| `/ping` | GET | ✅ Working |
| `/debug` | GET | ✅ Working |
| `/shutdown` | POST | ✅ Working |
