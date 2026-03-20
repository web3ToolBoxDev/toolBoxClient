# E2E Verification Tree

This document defines the complete tree-structured verification framework for the toolBoxClient E2E test suite. Each node has explicit parent dependencies, pass criteria, and test mappings.

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

### 2. Navigate to Workspace

| Field | Value |
|-------|-------|
| **Prerequisites** | 1 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 0.2: Navigate to workspace` |
| **Pass criteria** | Page URL contains `#/agentWorkspace`; workspace container element visible |
| **Status** | COVERED |

### 3. Create Session + Bind Env

| Field | Value |
|-------|-------|
| **Prerequisites** | 2 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 0-1: Create session, bind env, configure provider, fill presets with resume upload` (session/env portion) |
| **Pass criteria** | Session ID returned from API; environment bound; provider configured |
| **Status** | COVERED |

### 4. Fill Preset Questions + Upload Resume

| Field | Value |
|-------|-------|
| **Prerequisites** | 3 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 0-1: Create session, bind env, configure provider, fill presets with resume upload` (preset/resume portion) |
| **Pass criteria** | All 5 preset questions answered (count shows 5/5); resume file uploaded via API |
| **Status** | COVERED |

### 5. Profile Collection

| Field | Value |
|-------|-------|
| **Prerequisites** | 4 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 2: Wait for profile collection, click Finish, verify dashboard` |
| **Pass criteria** | AI processing completes within timeout; profile sections populated; Finish button clickable |
| **Status** | COVERED |

### 6. Dashboard Verification

| Field | Value |
|-------|-------|
| **Prerequisites** | 5 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 3: Verify dashboard data (direction, env, provider, platforms)` |
| **Pass criteria** | Direction fields non-empty (`q_job_title`, `q_location`); environment bound; provider set; at least 1 platform listed |
| **Status** | COVERED |

### 7. Login (Open Browser)

| Field | Value |
|-------|-------|
| **Prerequisites** | 6 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 4: Login to Indeed (requires manual intervention)` |
| **Pass criteria** | Browser launches; login page loads; user confirms login; confirm API returns success |
| **Status** | COVERED (skippable via `E2E_SKIP_LOGIN`) |

#### 7.1 Login Confirm Failure Reset

| Field | Value |
|-------|-------|
| **Prerequisites** | 7 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Branch F: F.1-F.2: Login -> close browser -> Confirm should reset to Login` |
| **Pass criteria** | After browser closes, confirm endpoint resets platform status back to "login" state; UI reflects reset |
| **Status** | COVERED |

#### 7.2 Cloudflare Detection + Auto-click

| Field | Value |
|-------|-------|
| **Prerequisites** | 7 |
| **Test file** | `test/tool-service-captcha.spec.js` |
| **Test name** | `CAPTCHA tools E2E` (Cloudflare checkbox detection) |
| **Pass criteria** | Cloudflare challenge detected; auto-click attempted; page proceeds or retries |
| **Status** | PARTIAL (unit-level captcha tool tested; full browser integration not end-to-end) |

### 8. Build Search Tool

| Field | Value |
|-------|-------|
| **Prerequisites** | 6 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 4.5: Build search tool for platforms` |
| **Pass criteria** | Build API returns success; `platform-tools.json` updated with valid script; JD verify passes |
| **Status** | COVERED |

#### 8.1 Build Failure -> AI Analyze -> Rebuild

| Field | Value |
|-------|-------|
| **Prerequisites** | 8 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Branch A: A.1-A.4: Inject fault script, verify selfHeal + rebuild` |
| **Pass criteria** | Fault injected; selfHeal triggers `needsRebuild=true`; AI rebuild produces new script; rebuilt script passes verification |
| **Status** | COVERED |

#### 8.2 Build Success but JD Verify Fail -> Rebuild

| Field | Value |
|-------|-------|
| **Prerequisites** | 8 |
| **Test file** | None |
| **Test name** | N/A |
| **Pass criteria** | Build succeeds but JD structure validation fails; triggers re-build with JD feedback; second build passes JD check |
| **Status** | NOT COVERED |

### 9. Start Workflow

| Field | Value |
|-------|-------|
| **Prerequisites** | 8 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 5: Start workflow and poll until completion` |
| **Pass criteria** | Workflow starts; pipeline status transitions through stages; completes or reaches terminal state |
| **Status** | COVERED |

#### 9.1 Direction Empty -> Interrupt

| Field | Value |
|-------|-------|
| **Prerequisites** | 9 |
| **Test file** | `test/search-pipeline-deep.spec.js` |
| **Test name** | `10. Verify pipeline error handling` (direction validation subset) |
| **Pass criteria** | Pipeline detects empty direction fields; interrupts with actionable error message; does not proceed to search |
| **Status** | PARTIAL (error handling tested but specific empty-direction scenario not isolated) |

#### 9.2 AI Unavailable -> 3-strike Interrupt

| Field | Value |
|-------|-------|
| **Prerequisites** | 9 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Branch D: D.1-D.6: Simulate AI unavailable, verify interrupt + restart recovery` |
| **Pass criteria** | AI provider returns errors; consecutive error count reaches 3; pipeline interrupts; notification sent; restart recovers |
| **Status** | COVERED |

### 10. Search Results Verification

| Field | Value |
|-------|-------|
| **Prerequisites** | 9 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 6: Verify search results (ZERO TOLERANCE: 0 results = FAIL)` |
| **Pass criteria** | Jobs array length > 0; each job has title, company, URL; no duplicate URLs; salary/type fields present where available |
| **Status** | COVERED |

#### 10.1 Search Success (jobs > 0)

| Field | Value |
|-------|-------|
| **Prerequisites** | 10 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 6: Verify search results (ZERO TOLERANCE: 0 results = FAIL)` |
| **Pass criteria** | `results.length > 0`; jobs contain required fields; no malformed entries |
| **Status** | COVERED |

#### 10.2 Search Failure -> selfHeal

| Field | Value |
|-------|-------|
| **Prerequisites** | 10 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Phase 7: Check fix rules, selfHeal, and summary report` + `Branch E: E.1-E.4` |
| **Pass criteria** | selfHeal function invoked; produces diagnosis with actionable fix rules |
| **Status** | COVERED |

##### 10.2.1 selfHeal -> needsRebuild=true -> AI Rebuild

| Field | Value |
|-------|-------|
| **Prerequisites** | 10.2 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Branch A: A.1-A.4: Inject fault script, verify selfHeal + rebuild` |
| **Pass criteria** | selfHeal returns `needsRebuild: true`; AI rebuild triggers; new script deployed |
| **Status** | COVERED |

##### 10.2.2 selfHeal -> AI Unavailable -> Interrupt + Notify

| Field | Value |
|-------|-------|
| **Prerequisites** | 10.2 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Branch D` (partial overlap) |
| **Pass criteria** | selfHeal calls AI; AI returns error; interrupt triggered; user notified via WebSocket |
| **Status** | PARTIAL (AI unavailable tested at pipeline level, not specifically during selfHeal) |

##### 10.2.3 selfHeal -> Browser Closed -> Interrupt + Notify

| Field | Value |
|-------|-------|
| **Prerequisites** | 10.2 |
| **Test file** | None |
| **Test name** | N/A |
| **Pass criteria** | Browser closes mid-selfHeal; pipeline detects disconnection; interrupts with "browser closed" notification |
| **Status** | NOT COVERED |

#### 10.3 Cloudflare Block -> Auto-click -> Retry

| Field | Value |
|-------|-------|
| **Prerequisites** | 10 |
| **Test file** | `test/tool-service-captcha.spec.js` |
| **Test name** | `CAPTCHA tools E2E` |
| **Pass criteria** | Cloudflare challenge detected during search; auto-click resolves; search retries and returns results |
| **Status** | PARTIAL (captcha tool tested in isolation; full search-retry flow not end-to-end) |

#### 10.4 Second Search -> URL Dedup + Keyword Expansion

| Field | Value |
|-------|-------|
| **Prerequisites** | 10.1 |
| **Test file** | `test/full-lifecycle-e2e.spec.js`, `test/search-pipeline-deep.spec.js` |
| **Test name** | `Branch G: G.1-G.5: Run second workflow, verify dedup + keyword expansion`, `8. Second search run — verify dedup + keyword rotation` |
| **Pass criteria** | Second search uses expanded/rotated keywords; results deduplicated against first run URLs; new unique jobs found |
| **Status** | COVERED |

#### 10.5 Page Advancement on High Overlap

| Field | Value |
|-------|-------|
| **Prerequisites** | 10.4 |
| **Test file** | `test/search-pipeline-deep.spec.js` |
| **Test name** | `9. Verify page advancement behavior` |
| **Pass criteria** | When overlap ratio exceeds threshold, search advances to next page; page number increments in search URL |
| **Status** | COVERED |

### 11. Document Generation (Resume/Cover Letter/Interview Prep)

| Field | Value |
|-------|-------|
| **Prerequisites** | 10.1 |
| **Test file** | `test/dashboard-workflow.spec.js` |
| **Test name** | `Dashboard job workflow E2E` (document generation portion) |
| **Pass criteria** | AI generates tailored resume/cover letter for selected job; documents stored and retrievable; interview prep content non-empty |
| **Status** | COVERED |

### 12. Filter + Auto-refresh

| Field | Value |
|-------|-------|
| **Prerequisites** | 10.1 |
| **Test file** | `test/full-lifecycle-e2e.spec.js` |
| **Test name** | `Branch H: H.1-H.4: Test job filters via API` |
| **Pass criteria** | Filter by keyword/location returns subset; auto-refresh re-fetches and merges new results; filter state persists |
| **Status** | COVERED |

### 13. Legacy Features

| Field | Value |
|-------|-------|
| **Prerequisites** | 1 |
| **Test file** | Multiple (see children) |
| **Test name** | N/A (branch node) |
| **Pass criteria** | All child nodes pass |
| **Status** | COVERED |

#### 13.1 Fingerprint Browser CRUD

| Field | Value |
|-------|-------|
| **Prerequisites** | 13 |
| **Test file** | `test/legacy-pages.spec.js`, `test/legacy-api-functional.spec.js` |
| **Test name** | `ChromeManager` (tests 1-8), `Fingerprint Browser API` |
| **Pass criteria** | Create fingerprint profile; read list; update name/proxy; delete single and batch; generate multiple profiles |
| **Status** | COVERED |

#### 13.2 Wallet CRUD + Import/Export

| Field | Value |
|-------|-------|
| **Prerequisites** | 13 |
| **Test file** | `test/legacy-pages.spec.js`, `test/legacy-api-functional.spec.js` |
| **Test name** | `WalletManager` (tests 1-8), `Wallet API` |
| **Pass criteria** | Create wallet; read list; update name; view detail; bind env; initialize; batch delete; import/export |
| **Status** | COVERED |

#### 13.3 Task Import/Execute

| Field | Value |
|-------|-------|
| **Prerequisites** | 13 |
| **Test file** | `test/legacy-pages.spec.js`, `test/task-execution-functional.spec.js` |
| **Test name** | `TaskManage` (tests 1-5), `Task Lifecycle`, `Task Execution E2E` |
| **Pass criteria** | Import task config; configure settings; start task in env mode; monitor execution; task completes |
| **Status** | COVERED |

#### 13.4 Sync Config

| Field | Value |
|-------|-------|
| **Prerequisites** | 13 |
| **Test file** | `test/legacy-pages.spec.js`, `test/task-execution-functional.spec.js` |
| **Test name** | `SyncFunction` (tests 1-2), `Sync Function Config API` |
| **Pass criteria** | Sync config page loads; settings saved and retrievable via API |
| **Status** | COVERED |

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

2. **GATE semantics**: If a parent node fails, all descendant nodes are marked **SKIPPED** (not FAIL). This is already implemented in the test suite via `test.skip(!gatesPassed.xxx, 'GATE: ...')`.

3. **Leaf nodes are verification points**: Only leaf nodes perform actual assertions. Branch nodes (e.g., 10, 10.2, 13) serve as GATE checkpoints that aggregate child results.

4. **Branch node pass rule**: A branch node passes if and only if all its children pass (or are intentionally skipped via environment flags like `E2E_SKIP_LOGIN`).

5. **Independence between subtrees**: Sibling branches (e.g., 7.1 and 7.2, or 10.1 and 10.2) are independent. One sibling failing does not skip the other, unless they share a prerequisite.

6. **Skip vs. Fail distinction**:
   - **SKIP**: Parent gate failed; test cannot run; not counted as failure
   - **FAIL**: Test ran but assertions did not hold; indicates a real defect
   - **PASS**: Test ran and all assertions held

7. **Re-entry after fix**: When a previously-failing parent is fixed, all its SKIPPED children automatically become eligible for execution on the next run.

8. **Environment-conditional nodes**: Some nodes (e.g., 7 Login) can be skipped via environment variables (`E2E_SKIP_LOGIN=1`). Skipping a conditional node does not invalidate its children if an alternative path exists (e.g., pre-authenticated session).

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
