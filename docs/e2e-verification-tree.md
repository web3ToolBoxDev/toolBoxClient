# E2E Verification Tree

This document defines the complete tree-structured verification framework for the toolBoxClient E2E test suite. Each node has explicit parent dependencies, pass criteria, test mappings, blocking classification, evidence requirements, failure categories, and retry paths.

## Failure Categories

| Category | Description | Typical Symptoms |
|----------|-------------|------------------|
| `environment` | Service not running, port conflict, Chrome not found, API key missing | Connection refused, process not found, timeout on startup |
| `build` | React/Electron build error, dependency missing, script compilation failure | Module not found, syntax error, webpack failure |
| `data_propagation` | State not synced between layers (Direction->Pipeline, Env->Dashboard, Profile->Workflow) | Empty fields downstream, stale data, missing context |
| `extraction` | AI parsing failure, scraper error, wrong selectors, anti-bot block | 0 results, malformed output, timeout on page interaction |
| `verification` | Assertion wrong, test logic error, timing issue, flaky selector | Test fails but feature works manually, intermittent failures |
| `ux_state_sync` | UI shows stale data, session switch not reflected, status not updated | Visual mismatch, button state wrong, panel not refreshed |

## Test Tiers

| Tier | Nodes | Purpose | Duration |
|------|-------|---------|----------|
| `smoke` | 1, 2, 3, 4, 5, 6, 10.1 | Quick sanity check — services up, session works, search returns results | ~1 min |
| `critical_path` | 1-10.1 | Main happy-path flow from startup through first successful search | ~5 min |
| `full_acceptance` | All nodes including branches (7.x, 8.x, 9.x, 10.x, 11, 12, 13.x) | Complete verification including failure branches, recovery, and legacy | ~15 min |

## Tree Structure

```
1. Start Services
2. Navigate to Workspace
3. Create Session + Bind Env
4. Fill Preset Questions + Upload Resume
5. Profile Collection
6. Dashboard Verification
7. Login (Open Browser)
   7.1 Login Confirm Failure Reset
   7.2 Cloudflare Detection + Auto-click
8. Build Search Tool
   8.1 Build Failure -> AI Analyze -> Rebuild
   8.2 Build Success but JD Verify Fail -> Rebuild
9. Start Workflow
   9.1 Direction Empty -> Interrupt
   9.2 AI Unavailable -> 3-strike Interrupt
10. Search Results Verification
    10.1 Search Success (jobs > 0)
    10.2 Search Failure -> selfHeal
        10.2.1 selfHeal -> needsRebuild=true -> AI Rebuild
        10.2.2 selfHeal -> AI Unavailable -> Interrupt + Notify
        10.2.3 selfHeal -> Browser Closed -> Interrupt + Notify
    10.3 Cloudflare Block -> Auto-click -> Retry
    10.4 Second Search -> URL Dedup + Keyword Expansion
    10.5 Page Advancement on High Overlap
11. Document Generation (Resume/Cover Letter/Interview Prep)
12. Filter + Auto-refresh
13. Legacy Features
    13.1 Fingerprint Browser CRUD
    13.2 Wallet CRUD + Import/Export
    13.3 Task Import/Execute
    13.4 Sync Config
```

## Node Definitions

### 1. Start Services

| Field | Value |
|-------|-------|
| **Prerequisites** | None (root node) |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 0.1: Start frontend + backend` |
| **Pass criteria** | Backend responds on port 30001 (`/api/ping` returns 200); frontend accessible on port 3000 |
| **Status** | COVERED |
| **Gate** | `blocking` — all downstream nodes depend on running services |
| **Evidence** | `[api_response]` — `/api/ping` returns HTTP 200 |
| **Failure category** | `environment` |
| **Retry** | `re_entry_node: 1, auto_retry: false, manual_step: "Check ports 3000/30001 are free, restart services"` |

### 2. Navigate to Workspace

| Field | Value |
|-------|-------|
| **Prerequisites** | 1 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 0.2: Navigate to workspace` |
| **Pass criteria** | Page URL contains `#/agentWorkspace`; workspace container element visible |
| **Status** | COVERED |
| **Gate** | `blocking` — workspace must load before any agent operations |
| **Evidence** | `[dom_state]` — URL hash matches, workspace container element present |
| **Failure category** | `build` |
| **Retry** | `re_entry_node: 2, auto_retry: true` |

### 3. Create Session + Bind Env

| Field | Value |
|-------|-------|
| **Prerequisites** | 2 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 0-1: Create session, bind env, configure provider, fill presets with resume upload` (session/env portion) |
| **Pass criteria** | Session ID returned from API; environment bound; provider configured |
| **Status** | COVERED |
| **Gate** | `blocking` — no env = no browser operations, no pipeline execution |
| **Evidence** | `[api_response, dom_state]` — session API returns ID + env binding confirmed in dashboard |
| **Failure category** | `data_propagation` |
| **Retry** | `re_entry_node: 3, auto_retry: true` |

### 4. Fill Preset Questions + Upload Resume

| Field | Value |
|-------|-------|
| **Prerequisites** | 3 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 0-1: Create session, bind env, configure provider, fill presets with resume upload` (preset/resume portion) |
| **Pass criteria** | All 5 preset questions answered (count shows 5/5); resume file uploaded via API |
| **Status** | COVERED |
| **Gate** | `blocking` — profile collection requires preset answers and resume |
| **Evidence** | `[api_response, file_output]` — preset count 5/5 from API + resume file stored |
| **Failure category** | `data_propagation` |
| **Retry** | `re_entry_node: 4, auto_retry: true` |

### 5. Profile Collection

| Field | Value |
|-------|-------|
| **Prerequisites** | 4 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 2: Wait for profile collection, click Finish, verify dashboard` |
| **Pass criteria** | AI processing completes within timeout; profile sections populated; Finish button clickable |
| **Status** | COVERED |
| **Gate** | `blocking` — dashboard and direction depend on collected profile |
| **Evidence** | `[api_response, dom_state]` — profile sections non-empty from API + Finish button enabled in DOM |
| **Failure category** | `extraction` |
| **Retry** | `re_entry_node: 5, auto_retry: false, manual_step: "Check AI provider connectivity and retry profile collection"` |

### 6. Dashboard Verification

| Field | Value |
|-------|-------|
| **Prerequisites** | 5 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 3: Verify dashboard data (direction, env, provider, platforms)` |
| **Pass criteria** | Direction fields non-empty (`q_job_title`, `q_location`); environment bound; provider set; at least 1 platform listed |
| **Status** | COVERED |
| **Gate** | `blocking` — empty direction = search will fail; missing env = browser won't launch |
| **Evidence** | `[api_response, dom_state]` — direction fields populated in API response + dashboard UI shows env/provider/platforms |
| **Failure category** | `data_propagation` |
| **Retry** | `re_entry_node: 5, auto_retry: false, manual_step: "Re-run profile collection or manually set direction fields"` |

### 7. Login (Open Browser)

| Field | Value |
|-------|-------|
| **Prerequisites** | 6 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 4: Login to Indeed (requires manual intervention)` |
| **Pass criteria** | Browser launches; login page loads; user confirms login; confirm API returns success |
| **Status** | COVERED (skippable via `E2E_SKIP_LOGIN`) |
| **Gate** | `blocking` — logged-in session required for search; children 7.1/7.2 test failure branches |
| **Evidence** | `[browser_verify, api_response]` — browser window opened + login confirm API returns success |
| **Failure category** | `environment` |
| **Retry** | `re_entry_node: 7, auto_retry: false, manual_step: "Click Cloudflare checkbox if blocked, then complete login manually"` |

#### 7.1 Login Confirm Failure Reset

| Field | Value |
|-------|-------|
| **Prerequisites** | 7 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Branch F: F.1-F.2: Login -> close browser -> Confirm should reset to Login` |
| **Pass criteria** | After browser closes, confirm endpoint resets platform status back to "login" state; UI reflects reset |
| **Status** | COVERED |
| **Gate** | `observation` — failure branch test; does not block main flow |
| **Evidence** | `[dom_state, api_response]` — UI shows Login button + platform status reset in API |
| **Failure category** | `ux_state_sync` |
| **Retry** | `re_entry_node: 7, auto_retry: false, manual_step: "Re-open browser and close again to reproduce"` |

#### 7.2 Cloudflare Detection + Auto-click

| Field | Value |
|-------|-------|
| **Prerequisites** | 7 |
| **Test file** | `test/tool-service-captcha.spec.js` |
| **Test name** | `CAPTCHA tools E2E` (Cloudflare checkbox detection) |
| **Pass criteria** | Cloudflare challenge detected; auto-click attempted; page proceeds or retries |
| **Status** | PARTIAL (unit-level captcha tool tested; full browser integration not end-to-end) |
| **Gate** | `observation` — manual fallback exists; auto-click is best-effort |
| **Evidence** | `[screenshot, log_check]` — Cloudflare challenge visible in screenshot + captcha tool log entry |
| **Failure category** | `extraction` |
| **Retry** | `re_entry_node: 7, auto_retry: false, manual_step: "Click Cloudflare checkbox manually"` |

### 8. Build Search Tool

| Field | Value |
|-------|-------|
| **Prerequisites** | 6 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 4.5: Build search tool for platforms` |
| **Pass criteria** | Build API returns success; `platform-tools.json` updated with valid script; JD verify passes |
| **Status** | COVERED |
| **Gate** | `blocking` — no search tool = pipeline cannot execute search |
| **Evidence** | `[api_response, file_output]` — build API success + `platform-tools.json` contains valid script with status=ready |
| **Failure category** | `build` |
| **Retry** | `re_entry_node: 8, auto_retry: true` |

#### 8.1 Build Failure -> AI Analyze -> Rebuild

| Field | Value |
|-------|-------|
| **Prerequisites** | 8 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Branch A: A.1-A.4: Inject fault script, verify selfHeal + rebuild` |
| **Pass criteria** | Fault injected; selfHeal triggers `needsRebuild=true`; AI rebuild produces new script; rebuilt script passes verification |
| **Status** | COVERED |
| **Gate** | `observation` — failure-branch test; build success path (node 8) is the gate |
| **Evidence** | `[file_output, api_response, log_check]` — fixRules in `platform-tools.json` + tool status=ready after rebuild + selfHeal log entry |
| **Failure category** | `extraction` |
| **Retry** | `re_entry_node: 8, auto_retry: true` |

#### 8.2 Build Success but JD Verify Fail -> Rebuild

| Field | Value |
|-------|-------|
| **Prerequisites** | 8 |
| **Test file** | None |
| **Test name** | N/A |
| **Pass criteria** | Build succeeds but JD structure validation fails; triggers re-build with JD feedback; second build passes JD check |
| **Status** | NOT COVERED |
| **Gate** | `observation` — failure-branch test; main build path handles this automatically |
| **Evidence** | `[api_response, log_check]` — JD verify fail response + rebuild trigger log + second build passes |
| **Failure category** | `extraction` |
| **Retry** | `re_entry_node: 8, auto_retry: true` |

### 9. Start Workflow

| Field | Value |
|-------|-------|
| **Prerequisites** | 8 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 5: Start workflow and poll until completion` |
| **Pass criteria** | Workflow starts; pipeline status transitions through stages; completes or reaches terminal state |
| **Status** | COVERED |
| **Gate** | `blocking` — workflow must start for any search results to appear |
| **Evidence** | `[api_response, ws_event]` — workflow start API success + pipeline status WebSocket events received |
| **Failure category** | `data_propagation` |
| **Retry** | `re_entry_node: 9, auto_retry: true` |

#### 9.1 Direction Empty -> Interrupt

| Field | Value |
|-------|-------|
| **Prerequisites** | 9 |
| **Test file** | `test/search-pipeline-deep.spec.js` |
| **Test name** | `10. Verify pipeline error handling` (direction validation subset) |
| **Pass criteria** | Pipeline detects empty direction fields; interrupts with actionable error message; does not proceed to search |
| **Status** | PARTIAL (error handling tested but specific empty-direction scenario not isolated) |
| **Gate** | `blocking` — empty direction means search is guaranteed to fail |
| **Evidence** | `[log_check, ws_event]` — pipeline interrupt log + error notification WebSocket event |
| **Failure category** | `data_propagation` |
| **Retry** | `re_entry_node: 6, auto_retry: false, manual_step: "Fill direction fields in dashboard, then restart workflow"` |

#### 9.2 AI Unavailable -> 3-strike Interrupt

| Field | Value |
|-------|-------|
| **Prerequisites** | 9 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Branch D: D.1-D.6: Simulate AI unavailable, verify interrupt + restart recovery` |
| **Pass criteria** | AI provider returns errors; consecutive error count reaches 3; pipeline interrupts; notification sent; restart recovers |
| **Status** | COVERED |
| **Gate** | `blocking` — 3 consecutive AI failures = pipeline halted |
| **Evidence** | `[log_check, ws_event, api_response]` — consecutive error count in logs + interrupt WebSocket event + restart API success |
| **Failure category** | `environment` |
| **Retry** | `re_entry_node: 9, auto_retry: false, manual_step: "Verify AI provider API key and connectivity, then restart workflow"` |

### 10. Search Results Verification

| Field | Value |
|-------|-------|
| **Prerequisites** | 9 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 6: Verify search results (ZERO TOLERANCE: 0 results = FAIL)` |
| **Pass criteria** | Jobs array length > 0; each job has title, company, URL; no duplicate URLs; salary/type fields present where available |
| **Status** | COVERED |
| **Gate** | `blocking` — 0 results = entire downstream pipeline (docs, filter, dedup) is meaningless |
| **Evidence** | `[api_response, log_check]` — jobs array from API with length > 0 + pipeline log shows searched > 0 |
| **Failure category** | `extraction` |
| **Retry** | `re_entry_node: 9, auto_retry: true` |

#### 10.1 Search Success (jobs > 0)

| Field | Value |
|-------|-------|
| **Prerequisites** | 10 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 6: Verify search results (ZERO TOLERANCE: 0 results = FAIL)` |
| **Pass criteria** | `results.length > 0`; jobs contain required fields; no malformed entries |
| **Status** | COVERED |
| **Gate** | `blocking` — downstream nodes (11, 12, 10.4) require at least 1 job |
| **Evidence** | `[api_response, log_check]` — jobs > 0 from API + pipeline log shows searched > 0 |
| **Failure category** | `extraction` |
| **Retry** | `re_entry_node: 9, auto_retry: true` |

#### 10.2 Search Failure -> selfHeal

| Field | Value |
|-------|-------|
| **Prerequisites** | 10 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 7: Check fix rules, selfHeal, and summary report` + `Branch E: E.1-E.4` |
| **Pass criteria** | selfHeal function invoked; produces diagnosis with actionable fix rules |
| **Status** | COVERED |
| **Gate** | `blocking` — selfHeal outcome determines rebuild vs interrupt path |
| **Evidence** | `[api_response, log_check]` — selfHeal diagnosis in API response + fix rules logged |
| **Failure category** | `extraction` |
| **Retry** | `re_entry_node: 10, auto_retry: true` |

##### 10.2.1 selfHeal -> needsRebuild=true -> AI Rebuild

| Field | Value |
|-------|-------|
| **Prerequisites** | 10.2 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Branch A: A.1-A.4: Inject fault script, verify selfHeal + rebuild` |
| **Pass criteria** | selfHeal returns `needsRebuild: true`; AI rebuild triggers; new script deployed |
| **Status** | COVERED |
| **Gate** | `observation` — rebuild is automatic recovery; pipeline continues |
| **Evidence** | `[api_response, file_output, log_check]` — needsRebuild=true in response + new script in `platform-tools.json` + rebuild log entry |
| **Failure category** | `extraction` |
| **Retry** | `re_entry_node: 10, auto_retry: true` |

##### 10.2.2 selfHeal -> AI Unavailable -> Interrupt + Notify

| Field | Value |
|-------|-------|
| **Prerequisites** | 10.2 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Branch D` (partial overlap) |
| **Pass criteria** | selfHeal calls AI; AI returns error; interrupt triggered; user notified via WebSocket |
| **Status** | PARTIAL (AI unavailable tested at pipeline level, not specifically during selfHeal) |
| **Gate** | `blocking` — AI unavailable during selfHeal = no recovery possible |
| **Evidence** | `[ws_event, log_check]` — interrupt WebSocket notification + AI error in selfHeal log |
| **Failure category** | `environment` |
| **Retry** | `re_entry_node: 9, auto_retry: false, manual_step: "Verify AI provider API key and connectivity, then restart workflow"` |

##### 10.2.3 selfHeal -> Browser Closed -> Interrupt + Notify

| Field | Value |
|-------|-------|
| **Prerequisites** | 10.2 |
| **Test file** | None |
| **Test name** | N/A |
| **Pass criteria** | Browser closes mid-selfHeal; pipeline detects disconnection; interrupts with "browser closed" notification |
| **Status** | NOT COVERED |
| **Gate** | `blocking` — no browser = no recovery possible |
| **Evidence** | `[ws_event, log_check]` — browser-closed WebSocket notification + disconnect detection in log |
| **Failure category** | `environment` |
| **Retry** | `re_entry_node: 7, auto_retry: false, manual_step: "Re-open browser and login, then restart workflow"` |

#### 10.3 Cloudflare Block -> Auto-click -> Retry

| Field | Value |
|-------|-------|
| **Prerequisites** | 10 |
| **Test file** | `test/tool-service-captcha.spec.js` |
| **Test name** | `CAPTCHA tools E2E` |
| **Pass criteria** | Cloudflare challenge detected during search; auto-click resolves; search retries and returns results |
| **Status** | PARTIAL (captcha tool tested in isolation; full search-retry flow not end-to-end) |
| **Gate** | `observation` — Cloudflare is intermittent; manual fallback exists |
| **Evidence** | `[screenshot, log_check, browser_verify]` — Cloudflare page in screenshot + captcha detection log + browser state after retry |
| **Failure category** | `extraction` |
| **Retry** | `re_entry_node: 10, auto_retry: false, manual_step: "Click Cloudflare checkbox manually, then retry search"` |

#### 10.4 Second Search -> URL Dedup + Keyword Expansion

| Field | Value |
|-------|-------|
| **Prerequisites** | 10.1 |
| **Test file** | `test/full-lifecycle-e2e.spec.js`, `test/search-pipeline-deep.spec.js` |
| **Test name** | `Branch G: G.1-G.5: Run second workflow, verify dedup + keyword expansion`, `8. Second search run — verify dedup + keyword rotation` |
| **Pass criteria** | Second search uses expanded/rotated keywords; results deduplicated against first run URLs; new unique jobs found |
| **Status** | COVERED |
| **Gate** | `observation` — dedup quality does not block workflow completion |
| **Evidence** | `[api_response, log_check]` — dedup count in API response + keyword rotation in pipeline log |
| **Failure category** | `verification` |
| **Retry** | `re_entry_node: 10.4, auto_retry: true` |

#### 10.5 Page Advancement on High Overlap

| Field | Value |
|-------|-------|
| **Prerequisites** | 10.4 |
| **Test file** | `test/search-pipeline-deep.spec.js` |
| **Test name** | `9. Verify page advancement behavior` |
| **Pass criteria** | When overlap ratio exceeds threshold, search advances to next page; page number increments in search URL |
| **Status** | COVERED |
| **Gate** | `observation` — page advancement is optimization; search still works without it |
| **Evidence** | `[log_check, api_response]` — page number increment in pipeline log + updated search URL in API |
| **Failure category** | `verification` |
| **Retry** | `re_entry_node: 10.4, auto_retry: true` |

### 11. Document Generation (Resume/Cover Letter/Interview Prep)

| Field | Value |
|-------|-------|
| **Prerequisites** | 10.1 |
| **Test file** | `test/dashboard-workflow.spec.js` |
| **Test name** | `Dashboard job workflow E2E` (document generation portion) |
| **Pass criteria** | AI generates tailored resume/cover letter for selected job; documents stored and retrievable; interview prep content non-empty |
| **Status** | COVERED |
| **Gate** | `observation` — document generation failure does not block search or filter |
| **Evidence** | `[api_response, file_output]` — generated documents returned from API + files stored on disk |
| **Failure category** | `extraction` |
| **Retry** | `re_entry_node: 11, auto_retry: true` |

### 12. Filter + Auto-refresh

| Field | Value |
|-------|-------|
| **Prerequisites** | 10.1 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Branch H: H.1-H.4: Test job filters via API` |
| **Pass criteria** | Filter by keyword/location returns subset; auto-refresh re-fetches and merges new results; filter state persists |
| **Status** | COVERED |
| **Gate** | `observation` — filter is UI convenience; does not block core workflow |
| **Evidence** | `[api_response, dom_state]` — filtered results from API + filter UI state preserved after refresh |
| **Failure category** | `ux_state_sync` |
| **Retry** | `re_entry_node: 12, auto_retry: true` |

### 13. Legacy Features

| Field | Value |
|-------|-------|
| **Prerequisites** | 1 |
| **Test file** | Multiple (see children) |
| **Test name** | N/A (branch node) |
| **Pass criteria** | All child nodes pass |
| **Status** | COVERED |
| **Gate** | `observation` — legacy features are independent from agent workflow |
| **Evidence** | N/A (branch node — see children) |
| **Failure category** | N/A |
| **Retry** | N/A |

#### 13.1 Fingerprint Browser CRUD

| Field | Value |
|-------|-------|
| **Prerequisites** | 13 |
| **Test file** | `test/legacy-pages.spec.js`, `test/legacy-api-functional.spec.js` |
| **Test name** | `ChromeManager` (tests 1-8), `Fingerprint Browser API` |
| **Pass criteria** | Create fingerprint profile; read list; update name/proxy; delete single and batch; generate multiple profiles |
| **Status** | COVERED |
| **Gate** | `observation` — CRUD failure does not block other legacy features |
| **Evidence** | `[api_response, dom_state]` — CRUD API responses + profile list reflects changes in UI |
| **Failure category** | `verification` |
| **Retry** | `re_entry_node: 13.1, auto_retry: true` |

#### 13.2 Wallet CRUD + Import/Export

| Field | Value |
|-------|-------|
| **Prerequisites** | 13 |
| **Test file** | `test/legacy-pages.spec.js`, `test/legacy-api-functional.spec.js` |
| **Test name** | `WalletManager` (tests 1-8), `Wallet API` |
| **Pass criteria** | Create wallet; read list; update name; view detail; bind env; initialize; batch delete; import/export |
| **Status** | COVERED |
| **Gate** | `observation` — wallet CRUD is independent |
| **Evidence** | `[api_response, dom_state]` — wallet API responses + wallet list reflects changes in UI |
| **Failure category** | `verification` |
| **Retry** | `re_entry_node: 13.2, auto_retry: true` |

#### 13.3 Task Import/Execute

| Field | Value |
|-------|-------|
| **Prerequisites** | 13 |
| **Test file** | `test/legacy-pages.spec.js`, `test/task-execution-functional.spec.js` |
| **Test name** | `TaskManage` (tests 1-5), `Task Lifecycle`, `Task Execution E2E` |
| **Pass criteria** | Import task config; configure settings; start task in env mode; monitor execution; task completes |
| **Status** | COVERED |
| **Gate** | `observation` — task execution is independent |
| **Evidence** | `[api_response, ws_event, log_check]` — task API responses + execution WebSocket events + task completion log |
| **Failure category** | `environment` |
| **Retry** | `re_entry_node: 13.3, auto_retry: true` |

#### 13.4 Sync Config

| Field | Value |
|-------|-------|
| **Prerequisites** | 13 |
| **Test file** | `test/legacy-pages.spec.js`, `test/task-execution-functional.spec.js` |
| **Test name** | `SyncFunction` (tests 1-2), `Sync Function Config API` |
| **Pass criteria** | Sync config page loads; settings saved and retrievable via API |
| **Status** | COVERED |
| **Gate** | `observation` — sync config is independent |
| **Evidence** | `[api_response, dom_state]` — sync config API response + settings visible in UI |
| **Failure category** | `verification` |
| **Retry** | `re_entry_node: 13.4, auto_retry: true` |

## Coverage Report

| Metric | Count | Details |
|--------|-------|---------|
| **Total nodes** | 30 | All leaf + branch nodes in the tree |
| **Leaf nodes** (actual verification points) | 25 | Excluding pure branch nodes (10, 10.2, 13) |
| **Covered** | 20 | Nodes with direct test mapping and full pass criteria |
| **Partial** | 3 | 7.2, 9.1, 10.2.2, 10.3 — tested at unit/isolation level but not full E2E |
| **Not covered** | 2 | 8.2, 10.2.3 — no test exists |
| **Coverage %** | **80%** (20/25 leaf nodes) |
| **Including partial** | **92%** (23/25 leaf nodes have some coverage) |

### Gate Summary

| Gate Type | Count | Nodes |
|-----------|-------|-------|
| **Blocking** | 16 | 1, 2, 3, 4, 5, 6, 7, 8, 9, 9.1, 9.2, 10, 10.1, 10.2, 10.2.2, 10.2.3 |
| **Observation** | 14 | 7.1, 7.2, 8.1, 8.2, 10.2.1, 10.3, 10.4, 10.5, 11, 12, 13, 13.1, 13.2, 13.3, 13.4 |

### Failure Category Distribution

| Category | Count | Nodes |
|----------|-------|-------|
| `environment` | 5 | 1, 7, 9.2, 10.2.2, 10.2.3, 13.3 |
| `build` | 2 | 2, 8 |
| `data_propagation` | 4 | 3, 4, 6, 9, 9.1 |
| `extraction` | 7 | 5, 7.2, 8.1, 8.2, 10, 10.1, 10.2, 10.2.1, 10.3, 11 |
| `verification` | 4 | 10.4, 10.5, 13.1, 13.2, 13.4 |
| `ux_state_sync` | 2 | 7.1, 12 |

### Nodes Needing Implementation

| Node | Description | Priority |
|------|-------------|----------|
| 8.2 | Build Success but JD Verify Fail -> Rebuild | P1 — core build reliability path |
| 10.2.3 | selfHeal -> Browser Closed -> Interrupt + Notify | P2 — edge case resilience |

### Partial Coverage Gaps

| Node | Gap | Effort |
|------|-----|--------|
| 7.2 | Cloudflare auto-click tested in isolation, not in full login flow | Medium — requires real Cloudflare encounter |
| 9.1 | Direction empty interrupt not isolated as separate test case | Low — add specific test to pipeline-deep |
| 10.2.2 | AI unavailable during selfHeal specifically (vs. general pipeline) | Low — extend Branch D with selfHeal context |
| 10.3 | Cloudflare during search not tested end-to-end | Medium — requires Cloudflare simulation |

## Tree Traversal Rules

1. **Pre-order traversal**: Parent nodes must pass before any child node executes. The tree is traversed depth-first, left-to-right.

2. **GATE semantics**: If a `blocking` parent node fails, all descendant nodes are marked **SKIPPED** (not FAIL). `observation` nodes that fail produce a **WARNING** but do not skip children. This is already implemented in the test suite via `test.skip(!gatesPassed.xxx, 'GATE: ...')`.

3. **Leaf nodes are verification points**: Only leaf nodes perform actual assertions. Branch nodes (e.g., 10, 10.2, 13) serve as GATE checkpoints that aggregate child results.

4. **Branch node pass rule**: A branch node passes if and only if all its `blocking` children pass. `observation` children may fail without failing the branch.

5. **Independence between subtrees**: Sibling branches (e.g., 7.1 and 7.2, or 10.1 and 10.2) are independent. One sibling failing does not skip the other, unless they share a prerequisite.

6. **Skip vs. Fail vs. Warning distinction**:
   - **SKIP**: Blocking parent gate failed; test cannot run; not counted as failure
   - **FAIL**: Test ran but assertions did not hold; indicates a real defect
   - **WARNING**: Observation node failed; logged but does not block downstream
   - **PASS**: Test ran and all assertions held

7. **Re-entry after fix**: When a previously-failing parent is fixed, all its SKIPPED children automatically become eligible for execution on the next run. The `re_entry_node` field in each node's retry section indicates the optimal restart point.

8. **Environment-conditional nodes**: Some nodes (e.g., 7 Login) can be skipped via environment variables (`E2E_SKIP_LOGIN=1`). Skipping a conditional node does not invalidate its children if an alternative path exists (e.g., pre-authenticated session).

9. **Evidence collection**: Each node must collect the evidence types specified in its `evidence` field. A node cannot be marked PASS without all required evidence successfully captured.

10. **Retry semantics**: When a node fails, check its `retry` section. If `auto_retry: true`, the system re-executes from `re_entry_node` automatically. If `auto_retry: false`, the `manual_step` must be completed before re-entry.

## Test File Index

| File | Nodes Covered |
|------|---------------|
| `test/full-lifecycle-e2e.spec.js` | 1, 2, 3, 4, 5, 6, 7, 7.1, 8, 8.1, 9, 9.2, 10, 10.1, 10.2, 10.2.1, 10.4, 12 |
| `test/search-pipeline-deep.spec.js` | 9.1 (partial), 10.4, 10.5 |
| `test/dashboard-workflow.spec.js` | 11 |
| `test/tool-service-captcha.spec.js` | 7.2 (partial), 10.3 (partial) |
| `test/onboarding-e2e.spec.js` | 3, 4, 5 (alternative path) |
| `test/legacy-pages.spec.js` | 13.1, 13.2, 13.3, 13.4 |
| `test/legacy-api-functional.spec.js` | 13.1, 13.2 |
| `test/task-execution-functional.spec.js` | 13.3, 13.4 |
| `test/v130-regression.spec.js` | Cross-cutting regression checks |
| `test/v130-electron-regression.spec.js` | Cross-cutting Electron regression checks |
