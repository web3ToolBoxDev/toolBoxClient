# Ability Evidence Library

This document captures reusable evidence of engineering ability extracted from project design discussions, architecture decisions, and implementation reviews.

Purpose:
- Preserve high-signal evidence for job search and portfolio writing
- Continuously append new capability signals during development
- Convert design conversations into resume, interview, and case-study material

How to use:
- Add new entries whenever a design discussion reveals a strong capability
- Prefer concrete evidence over generic claims
- Tie each item to a workflow, architecture decision, debugging decision, or execution strategy

## Core Profile

Suggested external positioning:

`AI Agent / Full Stack Engineer focused on workflow orchestration, browser execution runtime, memory systems, tool platforms, and real-world automation reliability.`

Chinese summary:

`偏 Agent 工作流、浏览器执行环境、记忆系统、工具平台与真实自动化可靠性的 AI 全栈工程师。`

## Evidence Entries

### 1. Agent Workflow Design

Evidence:
- Designed multi-stage workflows such as `search -> generate -> apply`
- Proposed failure-recovery loops such as `build failed / pipeline failed -> AI fallback research -> output fix rule -> rebuild`
- Required `screenshot + script + log + previous prompt/rules` to be included as recovery inputs

Capability signals:
- Workflow decomposition
- Failure recovery design
- Self-healing agent workflow
- Context-aware rebuild strategy

Resume-ready phrasing:
- Designed multi-stage agent workflows with failure-recovery and rebuild loops, enabling context-aware self-healing execution.

### 2. Agent Verification Workflow

Evidence:
- Standardized verification steps for AI reply wait, dashboard update wait, subtask validation, memory recall validation, and real-browser validation
- Defined cascading validation: DOM check first, screenshot plus AI fallback second, stale selector reporting third
- Distinguished mock verification from real-environment verification

Capability signals:
- Verification workflow design
- Cascading fallback strategy
- Real-environment validation
- Agent QA design

Resume-ready phrasing:
- Designed a self-verification workflow for agent features, combining DOM checks, screenshot-based AI fallback, and real-environment validation.

### 3. Tool Platform Architecture

Evidence:
- Separated shared capabilities from domain-specific capabilities
- Kept general tools in `toolService` and domain tools in vertical agents
- Proposed tool registration so AI can discover which tools are available at runtime

Capability signals:
- Platform architecture
- Tool abstraction
- Tool registry and orchestration
- Multi-agent reuse design

Resume-ready phrasing:
- Designed a modular tool platform separating shared tools from domain-specific agent capabilities, improving reuse across multiple AI workflows.

### 4. Browser Execution Runtime Design

Evidence:
- Built around fingerprint browser execution as the agent runtime foundation
- Required env, wallet, and session data to be injected and persisted into agent execution
- Distinguished default browser mode from customized browser mode
- Added proxy IP to geo, timezone, and WebRTC consistency handling

Capability signals:
- Browser runtime design
- Execution context injection
- Fingerprint/browser consistency
- Real browser automation infrastructure

Resume-ready phrasing:
- Built a browser execution layer for agents with fingerprint-aware runtime injection, environment persistence, and geo/timezone/WebRTC consistency.

### 5. Memory and Retrieval Architecture

Evidence:
- Proposed independent memory space per agent
- Pushed `dbservice` into an isolated subprocess
- Used semantic memory plus structured knowledge storage
- Focused on recall, deletion correctness, dashboard synchronization, and profile update propagation

Capability signals:
- Layered memory design
- Semantic versus factual memory separation
- Retrieval-enhanced workflow design
- Persistence boundary design

Resume-ready phrasing:
- Designed a layered memory system combining semantic recall and structured knowledge persistence for multi-session agent workflows.

### 6. Runtime State and Context Propagation

Evidence:
- Identified that provider choice should flow from `AI panel -> session -> pipeline`
- Rejected incorrect fixes based on PATH detection when the real issue was state propagation failure
- Repeatedly preferred server-side environment fetch by `envId` over front-end parameter dependence

Capability signals:
- State flow design
- Runtime configuration integrity
- Session context propagation
- Root cause analysis

Resume-ready phrasing:
- Identified and fixed runtime context propagation issues across UI, session, and execution pipeline, ensuring configuration integrity for agent providers and browser environments.

### 7. Root Cause Analysis and AI Solution Review

Evidence:
- Corrected AI-proposed fixes that addressed symptoms rather than architecture
- Reframed bugs as state design, workflow design, or context propagation problems
- Added missing inputs such as previous prompt/rules into recovery logic

Capability signals:
- Root cause analysis
- Review of AI-generated solutions
- Architectural correction
- Boundary-aware debugging

Resume-ready phrasing:
- Reviewed and corrected AI-generated implementation plans, consistently redirecting fixes from patch-level workarounds to architecture-level solutions.

### 8. Product-to-Engineering Translation

Evidence:
- Designed workflows first, then used AI to expand them into PRD and implementation details
- Defined toggles, confirmation points, platform differences, and async execution behavior
- Translated user scenarios into service boundaries, tool layering, verification chains, and workflow steps

Capability signals:
- Product abstraction
- Workflow modeling
- PRD-to-architecture translation
- Human-in-the-loop design

Resume-ready phrasing:
- Translated product workflows into executable agent system designs, including service boundaries, verification chains, and configurable automation steps.

### 9. Real-Environment Reliability Thinking

Evidence:
- Explicitly treated mock-only verification as insufficient
- Found inconsistencies between dashboard-triggered behavior and real `openChrome` execution
- Insisted on validating login and state synchronization in real fingerprint browser environments

Capability signals:
- Production realism
- Reliability engineering
- Environment parity awareness
- Verification rigor

Resume-ready phrasing:
- Established real-environment validation standards to ensure agent behavior matched actual browser runtime conditions rather than mock-only test paths.

### 10. High-Friction Web Automation Design

Evidence:
- Planned browser fallback when job information could not be reliably fetched through HTTP
- Proposed OCR/CAPTCHA handling as a shared tool capability
- Focused on login detection, selector staleness, screenshot-assisted decision making, and browser-first recovery

Capability signals:
- High-friction web automation
- Anti-bot aware execution design
- Fallback capture strategy
- Browser-first workflow adaptation

Resume-ready phrasing:
- Designed resilient web automation workflows for high-friction sites, including browser fallback, CAPTCHA handling, and adaptive verification strategies.

## Strong Conversation-Derived Signals

These are narrower but still high-value signals extracted from design discussions.

### 11. Failure Context Persistence and Rebuild Logic

Evidence:
- Identified that failure context was lost after build completion
- Proposed feeding `screenshot + script + logs + previous prompt context` into fallback analysis
- Designed rebuild trigger logic so the next generation pass could use prior failure evidence

Capability signals:
- Failure persistence design
- Context-aware retry
- Rebuild loop engineering

Resume-ready phrasing:
- Designed a failure-context persistence and rebuild loop so agent retries could use prior screenshots, scripts, logs, and prompt history instead of regenerating statelessly.

### 12. Verification Timing and Async State Awareness

Evidence:
- Required E2E validation to wait for AI reply before sending the next user action
- Required assertions only after dashboard state changed
- Challenged stuck waits and timeout assumptions in verification logic

Capability signals:
- Async workflow validation
- Event sequencing
- State-aware E2E design

Resume-ready phrasing:
- Defined async-aware verification logic for agent workflows, ensuring tests waited on AI replies and downstream dashboard state transitions before asserting success.

### 13. User Intent and Configuration Integrity

Evidence:
- Rejected PATH/environment-based fixes when the user had already selected a provider in the UI
- Treated user-selected provider state as a contract that must reach the runtime pipeline

Capability signals:
- User intent preservation
- Configuration integrity
- Runtime contract design

Resume-ready phrasing:
- Enforced configuration integrity by treating user-selected agent providers as runtime contracts that must propagate through session and execution pipelines.

### 14. Task Orchestration and Lifecycle Management

Evidence:
- Personally implemented major parts of task orchestration in `taskService`
- Designed execution flow, task lifecycle handling, runtime task naming, completion logic, and running-state tracking
- Managed task-level success/failure signaling, cleanup, and deferred state retention for external checks

Capability signals:
- Task orchestration
- Lifecycle management
- Runtime control
- Long-running job management

Resume-ready phrasing:
- Designed and implemented task orchestration and lifecycle management for long-running agent workflows, including execution control, state tracking, completion signaling, and cleanup logic.

### 15. Real-Time Messaging and WebSocket Protocol Design

Evidence:
- Personally implemented major parts of message communication and WebSocket behavior
- Defined task/front communication patterns for logs, heartbeats, task completion, termination, and agent-specific messages
- Built buffering and routing behavior for frontend and task-side messages

Capability signals:
- Real-time communication design
- WebSocket protocol design
- Message routing
- Event-driven system design

Resume-ready phrasing:
- Designed the real-time messaging protocol between frontend and execution runtime, using WebSocket-based heartbeats, log streaming, status updates, and command routing for agent tasks.

### 16. Frontend-Backend Runtime Synchronization

Evidence:
- Built communication flow across Electron, React frontend, Express backend, and task runtime
- Implemented state synchronization for sessions, conversations, subtasks, artifacts, logs, and execution updates
- Supported reconnect, buffering, and runtime message replay behavior

Capability signals:
- Frontend-backend runtime synchronization
- Cross-layer integration
- Stateful real-time UI updates
- Runtime observability support

Resume-ready phrasing:
- Built real-time runtime synchronization across Electron, React, Express, and task processes, enabling live session state, execution updates, logs, and artifact streaming.

### 17. Agent Runtime Event Modeling

Evidence:
- Structured runtime messages around task logs, heartbeats, task completion, termination, snapshots, session updates, subtask updates, execution state, and error handling
- Supported agent-specific message families and task-specific routing behavior

Capability signals:
- Event modeling
- Runtime protocol abstraction
- Agent-state event design
- Communication contract design

Resume-ready phrasing:
- Modeled agent runtime events and communication contracts for snapshots, subtask updates, execution state, logs, completion, and error handling.

### 18. Multi-Agent Workflow Governance and Gatekeeper Design

Evidence:
- Discovered role collapse failure in production: Coordinator accumulated 6+ rounds of debugging context, drifted from original user instruction ("verify all green before release"), and released with 6 unverified acceptance nodes
- Analyzed root causes: no enforcement mechanism for phase transitions, cognitive fatigue from iterative debugging, implicit scope creep from "just one more fix"
- Designed a Gatekeeper role with memory isolation: receives only acceptance graph + task log + user instruction, immune to sunk cost bias that affected Coordinator after long execution
- Defined 5 mandatory GATE trigger points (G1-G5) in the workflow lifecycle, with Strict mode for release gates
- Established iteration threshold (max 2 direct code changes by Coordinator before mandatory Dev agent delegation) to prevent role boundary erosion
- Designed structured audit output format covering acceptance graph scan, user instruction alignment, role behavior audit, and process management audit

Capability signals:
- Multi-agent governance design
- Role separation enforcement
- Cognitive bias mitigation in AI agent systems
- Workflow phase-gate architecture
- Memory isolation as a design tool for objectivity
- Post-incident analysis and systemic fix design

Resume-ready phrasing:
- Designed a Gatekeeper governance role for multi-agent workflows, using memory isolation to prevent cognitive drift during long-running tasks. Introduced mandatory phase gates, iteration thresholds, and structured audit protocols after identifying role collapse as the root cause of a premature release.

### 19. Stateless Agent Lifecycle Design for Audit Integrity

Evidence:
- Identified that reusing a Gatekeeper agent instance across multiple GATE checks would accumulate context and defeat the purpose of memory isolation — the same cognitive drift problem it was designed to prevent
- Designed an ephemeral lifecycle: each GATE check spawns a fresh agent with only acceptance graph + task log + user instruction, outputs PASS/FAIL, then immediately releases — no retained or resumed state
- Explicitly prohibited SendMessage-based continuation, background execution (which allows Coordinator to skip waiting), and reusing a FAIL'd instance for re-audit after fixes
- Defined FAIL-then-reaudit as a new spawn (not resume), ensuring the re-audit agent has zero knowledge of the previous failure's context and judges purely on current state
- Documented lifecycle rules in both the Gatekeeper spec (why) and the Coordinator spec (how to dispatch), ensuring both sides of the contract are explicit

Capability signals:
- Stateless audit agent design
- Ephemeral process lifecycle management
- Separation of concerns between auditor and dispatcher
- Contract-based multi-agent coordination
- Preventing second-order bias in governance systems

Resume-ready phrasing:
- Designed a stateless, ephemeral lifecycle for audit agents in multi-agent workflows, ensuring each governance check runs with zero accumulated context. Prohibited instance reuse, background execution, and FAIL-instance resumption to maintain audit objectivity across long-running task chains.

### 18. Chromium Fingerprint Consistency and Anti-Bot Debugging

Evidence:
- Isolated Cloudflare Turnstile failures on `ca.indeed.com` to the `languages_js` fingerprint payload using controlled parameter elimination
- Used multi-profile comparison to prove the issue was configuration-specific rather than a global browser failure
- Correctly hypothesized that the language hook was incomplete even after BrowserScan showed consistency for `navigator.languages`, `Accept-Language`, and `Intl`
- Ruled out JavaScript-layer getter detection because the modification was implemented in C++/Blink rather than JS monkey-patching
- Traced the real root cause to unhooked worker-side paths, where `navigator.languages` in Web Worker / Service Worker / Dedicated-Shared Worker contexts still returned renderer-level language data instead of the toolbox-injected value
- Extended the same toolbox hook to `WorkerNavigator::GetAcceptLanguages()` and the relevant worker fetch context implementations, eliminating cross-context inconsistency and allowing Cloudflare Turnstile to pass

Capability signals:
- Chromium / Blink debugging
- Anti-bot / fingerprint consistency engineering
- Cross-context runtime analysis
- Root cause isolation under adversarial detection
- C++ browser runtime patching
- Worker / main-thread consistency design

Resume-ready phrasing:
- Diagnosed and fixed a Chromium fingerprint consistency issue that triggered Cloudflare Turnstile, tracing the root cause to incomplete `navigator.languages` hooks across Worker and Service Worker contexts and extending the C++ patch set to restore cross-context consistency.

### 19. Workflow Scope Design and State-Machine Boundary Definition

Evidence:
- Reframed the job list header into a control panel that could trigger partial workflows on selected jobs rather than only one monolithic end-to-end workflow
- Defined action-to-workflow mapping such as "generate job documents" triggering only resume / cover letter / interview prep, and "auto apply" triggering only submission-related automation for selected jobs
- Challenged an AI-generated plan that exposed too many manual status controls
- Correctly separated status transitions into automatic program-managed states versus limited user-managed overrides
- Identified that most states (`discovered`, `matched`, `tailored`, `reviewed`, `submitted`, `followed_up`) should be system-driven, while only exceptional cases like manual external submission and user archive actions should remain manual

Capability signals:
- Workflow product design
- State machine ownership design
- Human-in-the-loop boundary definition
- UX-to-runtime translation
- Partial workflow orchestration
- Product judgment over AI-generated plans

Resume-ready phrasing:
- Designed workflow-scoped control actions and state-machine boundaries for a job-seeking agent, ensuring routine status transitions were program-driven while reserving only exceptional cases for manual user overrides.

### 20. AI-First Document Generation Strategy

Evidence:
- Rejected low-value hardcoded interview-prep templates and redesigned the output as an AI coaching prompt that users could hand off to ChatGPT/Claude for richer interactive interview preparation
- Proactively questioned whether resume, cover letter, and interview-prep generation should remain separate template outputs
- Evaluated generation quality and efficiency tradeoffs between multiple template-based outputs versus a single high-quality AI generation call with structured delimiters for parsing
- Pushed the system toward AI-generated, role-specific job documents rather than mock or placeholder content

Capability signals:
- AI product judgment
- Output strategy design
- Quality-versus-latency tradeoff analysis
- LLM output structuring
- User-value prioritization

Resume-ready phrasing:
- Redesigned job document generation around AI-first outputs, replacing low-value templates with structured high-quality resume, cover letter, and interview-prep generation flows optimized for downstream user interaction.

### 21. Fail-Fast Workflow Reliability and Failure-State Persistence

Evidence:
- Explicitly rejected silent fallback to low-quality templates when AI generation was unavailable
- Reframed generation failures as workflow state problems rather than temporary content fallbacks
- Required `search`, `generate`, and `apply` flows to persist unsuccessful task states for later notification, recovery, and user awareness
- Prioritized document quality as a core requirement for application success, even if that meant interrupting the workflow instead of producing weak substitute outputs

Capability signals:
- Fail-fast system design
- Workflow reliability policy design
- Failure-state persistence
- User trust and quality-bar ownership
- Notification-ready state modeling

Resume-ready phrasing:
- Defined fail-fast reliability rules for search, document-generation, and apply workflows, persisting unsuccessful task states for recovery and notification instead of masking failures with low-quality fallback outputs.

### 22. Streaming Workflow Redesign and Stop-Condition Correctness

Evidence:
- Identified that the original search flow processed sites in coarse phases (`search all jobs` -> `batch match later`), which made `targetCount` ineffective while only `maxResults` actually constrained execution
- Reframed the workflow around per-job streaming evaluation: each discovered job should immediately trigger AI scoring, and when generation is enabled, the same AI call should produce `matchScore + resume + coverLetter + interviewPrep`
- Explicitly tied workflow control to business-correct stop conditions by checking whether the platform had already reached `targetCount` before continuing search
- Pushed the design away from delayed batch processing toward incremental output, earlier user value, and fewer redundant AI calls

Capability signals:
- Workflow efficiency design
- Stop-condition correctness
- Streaming pipeline thinking
- Incremental orchestration
- Cost/latency optimization
- Product judgment over execution granularity

Resume-ready phrasing:
- Redesigned a job-search workflow from batch post-processing to per-item streaming evaluation, making `targetCount` a true stop condition while combining match scoring and document generation into a more efficient incremental AI pipeline.

### 23. Workflow-Level Failure Recovery and No-Fake-Success Policy

Evidence:
- Rejected a proposed fallback chain of `Combined AI -> aiMatcher -> algorithmic matching`, explicitly removing algorithmic matching because low-quality non-AI output should not silently keep the workflow running
- Defined a stricter failure policy: if AI is unavailable, the workflow should error out instead of producing misleading or degraded results
- Distinguished between per-job task state and workflow-level task state, requiring both to be tracked separately
- Proposed storing workflow task history as a reverse-ordered list in the `workProgress` offcanvas so users could inspect interrupted runs
- Designed failure recovery controls such as delete and restart actions for failed tasks
- Defined targeted restart behavior: regenerate documents if generation failed mid-flow, or rebuild the search tool and retry the original search objective if search failed

Capability signals:
- Workflow-level failure modeling
- Quality-bar enforcement
- Failure recovery UX design
- Task hierarchy design
- No-fake-success product judgment
- Restartable orchestration design

Resume-ready phrasing:
- Defined workflow-level failure and recovery rules for an AI job-search system, removing misleading non-AI fallbacks and adding restartable task-state management for interrupted search and document-generation flows.

### 24. Execution-State vs Result-State UI Modeling

Evidence:
- Corrected an AI-generated plan that treated the workflow task log as a per-job history view
- Reframed the `Workflow Progress` offcanvas as a workflow-level execution panel that should display only the currently processing job and unfinished work
- Explicitly separated UI responsibilities: completed job outcomes should live in the job list as durable result state, while in-progress and interrupted workflow details should remain in the workflow-progress panel
- Preserved the failure-recovery controls on unfinished workflow items rather than mixing completed and active job information in the same execution log surface

Capability signals:
- UI state modeling
- Execution-state vs result-state separation
- Workflow observability design
- Product clarification over AI-generated plans
- Human-facing orchestration UX

Resume-ready phrasing:
- Designed clear execution-state vs result-state boundaries for an AI workflow UI, using a workflow-progress panel for in-flight work and a job list for completed status outcomes.

### 25. Information Hierarchy and Dual-Format Artifact Design

Evidence:
- Reassessed dashboard content priority and explicitly deprioritized the personal-profile section relative to the job list
- Proposed making lower-priority profile content collapsible so the job list could move to the front as the primary operational view
- Required generated resume, cover letter, and interview-prep outputs to serve two purposes at once: downloadable artifacts (doc/prompt) and UI-native display artifacts suitable for in-app review
- Proposed generating an additional structured display format (such as JSON) so artifacts could be opened in a modal and rendered by sections instead of as one flat document
- Added UX requirements for modal-based section loading and download actions from within the preview flow

Capability signals:
- Information hierarchy design
- Artifact presentation strategy
- UI/UX prioritization
- Dual-format content system thinking
- In-app preview architecture
- Product judgment over dashboard focus

Resume-ready phrasing:
- Redesigned dashboard information hierarchy and artifact presentation flows, prioritizing operational job views while introducing dual-format generated outputs for both downloadable documents and structured in-app preview.

### 26. User-Guided Matching Preference Design

Evidence:
- Identified a real mismatch between static resume skills and actual job-search intent, observing that legacy Java/Kettle experience caused the system to overmatch Java backend roles when the real preference was Node.js backend work
- Proposed adding explicit user-configurable search and matching preferences in settings/workflow input rather than relying only on inferred profile data
- Designed the preference input as an additional signal for AI evaluation so match scoring could account for current intent, not just historical experience
- Reframed matching from pure profile-based retrieval toward preference-aware ranking

Capability signals:
- Relevance tuning design
- User-intent modeling
- Preference-aware matching
- Human-in-the-loop ranking control
- Product judgment over search quality

Resume-ready phrasing:
- Improved job-matching relevance by adding user-configurable preference signals to search and scoring workflows, allowing AI evaluation to weight current role intent alongside historical profile data.

### 27. Degraded-Success UX and Anti-Debug Recovery Generalization

Evidence:
- Challenged a flow where JD extraction failed after retries but the script still appeared as a successful build because the system downgraded to HTTP fetch and marked the tool ready
- Correctly identified the product risk in treating degraded capability as apparent success, especially when the warning was effectively hidden in a tooltip
- Investigated the real site behavior and hypothesized that Indeed had injected anti-debug logic causing extraction to hang during inspection
- Drove the design from a site-specific anti-debug patch toward a reusable recovery pattern: detect extraction failure, run a shared anti-debugger tool, then retry extraction
- Explicitly pushed for anti-debug handling to become a general tool in the platform rather than a one-off script patch

Capability signals:
- Degraded-success UX judgment
- Recovery-tool generalization
- High-friction site debugging
- Automation resilience design
- Product critique over status semantics
- Shared-tool abstraction

Resume-ready phrasing:
- Identified misleading degraded-success states in automation flows and generalized site-specific anti-debug handling into a reusable recovery-tool pattern for repeated extraction failures.

### 28. Transparent Runtime Mitigation and Domain-Level Recovery Memory

Evidence:
- Asked whether AI-generated search scripts should explicitly know about anti-debug logic or whether the mitigation should stay below the prompt layer
- Correctly preferred keeping anti-debug handling in the runtime infrastructure so AI-generated scripts would stay clean and domain logic would not be polluted by defensive code
- Recognized that the existing timeout/retry wrapper (`tc`) already provided transparent mitigation coverage for most browser actions, plus higher-level script retries
- Proposed a stronger optimization: when anti-debug behavior is detected during build/runtime, persist a domain-level memory map such as `{\"domain\": true}` so later visits can pre-inject anti-debug mitigation instead of re-learning through repeated timeouts
- Shifted the design from reactive retries toward remembered runtime adaptation

Capability signals:
- Infrastructure-first design
- Prompt-layer boundary judgment
- Runtime transparency design
- Domain memory optimization
- Cost/latency reduction through learned recovery
- Platform thinking over one-off fixes

Resume-ready phrasing:
- Kept anti-debug mitigation below the prompt layer and proposed domain-level recovery memory so repeated visits could pre-apply runtime defenses instead of re-triggering costly timeout-based retries.

### 29. Multi-Agent Role Architecture and Coordination Design

Evidence:
- Proposed a role-based agent architecture with a coordinator responsible for decomposing user requests and routing work to PM, development, testing, and QA roles
- Explicitly supported both parallel and serial execution modes depending on task dependency
- Defined elastic role spawning, such as creating multiple developer or tester agents when the workload justified parallelization
- Required persistent task logging so users could inspect execution history and role-level progress
- Added conflict detection responsibilities to the coordinator so new work would be blocked when it overlapped with already running tasks
- Proposed separate development and test environments so implementation and validation could proceed concurrently without stepping on each other
- Assigned QA a real-environment acceptance role tied back to PM-defined requirements and plans
- Proposed explicit inter-role communication and exchange logs so development, QA, and other roles could pass findings and iteration requests through persistent channels
- Recognized that preserving role-specific working memory (for example, routing QA feedback back to the same development role that implemented the feature) could accelerate bug-fix iteration and reduce context loss
- Proposed explicit lifecycle management for role instances, questioning when agents should be created, kept alive, or released instead of assuming roles remain permanently online
- Modeled roles as reusable definitions/images with runtime instances, analogous to instantiating a class or launching a container from an image
- Clarified ownership boundaries by treating the coordinator as the user-invoked root instance while subordinate role instances should be created and managed by the coordinator
- Proposed operator visibility features such as commands to inspect currently running role instances
- Considered portability from the start, proposing that role workflows be generated and reused across projects through markdown-defined agent development workflows
- Explicitly pushed to separate project-specific environment traits from reusable workflow definitions, such as avoiding hardcoded assumptions about how QA should open or access a real environment
- Asked how asynchronous task completion should be surfaced back to the user and what notification model should exist for completed implementation or QA acceptance work
- Proposed QA-produced acceptance artifacts such as screenshots and verification outputs that could be stored in known directories or logs for later inspection
- Clarified the desired human interaction model: the user should mainly delegate through the coordinator and then review acceptance artifacts, task status, or logs rather than micromanaging every sub-role
- Explicitly questioned which moments still require human intervention, showing concern for balancing autonomy with controlled user oversight
- Re-evaluated whether a dedicated PM role was necessary at all, proposing either a coordinator-mediated PM confirmation step or collapsing PM responsibilities into the coordinator to reduce unnecessary role overhead
- Required requirement confirmation to remain user-visible before implementation started, preserving a human approval gate even if the PM role were removed
- Identified that dev and QA environments would require truly separate runtime configuration, including non-conflicting ports
- Recognized that supporting parallel development and verification might require code-generation or service-startup changes so the development environment could be launched independently from the QA validation environment

Capability signals:
- Multi-agent systems thinking
- Coordinator / dispatcher design
- Role-based workflow orchestration
- Conflict-aware scheduling
- Parallel execution planning
- Dev/test environment strategy
- Real-environment acceptance modeling
- Inter-agent communication design
- Role-memory continuity design
- Agent lifecycle management
- Instance ownership and observability design
- Workflow portability design
- Environment abstraction thinking
- Async completion notification design
- Human oversight boundary definition
- Acceptance-artifact workflow design
- Role minimization judgment
- Human approval gate design
- Environment isolation design
- Parallel environment configuration thinking

Resume-ready phrasing:
- Designed a role-based multi-agent coordination model with a central dispatcher, conflict-aware task routing, parallel role execution, persistent task logging, and separate development/test environments for concurrent implementation and real-world QA validation.

### 30. Platform-First Architecture Narrative

Evidence:
- During README rewriting, rejected the initial "single AI application" framing and reframed the entire project as a platform with three foundational layers (browser runtime, memory, tool service) plus a standardized agent protocol
- Explicitly separated infrastructure from application logic, positioning Job Seek as the first application scenario rather than the whole product
- Required the architecture diagram to show agents connecting via WebSocket protocol, making the extensibility visible to readers
- This reframing changed the hiring signal from "built a job search app" to "designed an AI agent runtime platform"

Capability signals:
- Platform architecture thinking
- Infrastructure vs application separation
- Extensibility-first design
- Technical narrative and positioning judgment

Resume-ready phrasing:
- Architected an AI agent runtime platform separating browser execution, persistent memory, and shared tool layers from application logic, with a standardized WebSocket protocol enabling plug-and-play agent integration.

### 31. Regression Safety and Non-AI Feature Protection

Evidence:
- During v1.3.0 package optimization, identified that excluding `assets/scripts/node_modules/` from the build would break all non-AI features (openChrome, openWallet, syncFunction, checkEmail) because those scripts run as spawned child processes with their own dependency resolution
- Caught this before release by asking whether non-AI features had been verified — they had not
- Immediately reverted the exclusion and verified via API that openChrome successfully launched env1 fingerprint browser
- Later identified that `electron` and `app-builder-bin` (375MB of build tools) were being bundled into the installer via an overly broad `node_modules/**/*` files pattern, which was the actual root cause of installer bloat

Capability signals:
- Build pipeline debugging
- Dependency resolution understanding (child process vs parent)
- Regression prevention instinct
- Root cause analysis on installer size

Resume-ready phrasing:
- Prevented a release-breaking regression by identifying that build optimization would sever child-process dependency resolution for core features, then traced the actual installer bloat to build tools bundled via an overly broad packaging pattern.

### 32. QA Acceptance Standard Self-Audit and Governance Design

Evidence:
- Identified that previous E2E tests passed with 0 search results because assertions were lenient (WARNING instead of FAIL) and env binding was broken silently
- Recognized the systemic root cause: no formal acceptance standard hierarchy, no mandatory GATE checks, and no distinction between "code exists" and "code works"
- Designed a 5-level acceptance standard framework (L1-Code through L5-Real Environment) requiring each acceptance criterion to be tagged with its verification level
- Introduced mandatory GATE tests as pre-flight checks before workflow execution — any GATE failure blocks all downstream tests
- Defined causal-chain verification: every step's input must come from the previous step's verified output, not just checking the final result
- Codified "0 results = FAIL" and "code presence ≠ functional verification" as explicit QA rules

Capability signals:
- Quality assurance governance design
- Acceptance standard framework
- Self-audit and process improvement
- Verification rigor at scale
- Root cause analysis on testing failures

Resume-ready phrasing:
- Designed a 5-level acceptance standard framework (L1-Code to L5-Real Environment) with mandatory GATE pre-checks and causal-chain verification after discovering that previous E2E tests silently passed with zero search results due to broken env binding and lenient assertions.

### 33. Multi-Agent Parallel Development Orchestration

Evidence:
- Organized v1.3.0 bug fixes into 5 parallel groups (A-E) by file dependency, launching subagents in worktree isolation to avoid merge conflicts
- Managed cherry-pick workflow from worktree branches to dev, resolving conflicts when multiple agents modified `searchPipeline.js`
- Coordinated 14 bug fixes across P0-P3 priorities with dependency-aware sequencing

Capability signals:
- Parallel task decomposition
- Dependency-aware scheduling
- Git worktree orchestration
- Multi-agent development coordination

Resume-ready phrasing:
- Orchestrated parallel multi-agent development across 5 worktree-isolated groups, managing 14 bug fixes with dependency-aware scheduling and conflict-free cherry-pick integration.

### 34. Anti-Detection Browser Runtime Debugging

Evidence:
- Diagnosed root cause of all E2E search failures: `ignoreDefaultArgs: ['--enable-automation']` was commented out in `browserPool.js`, exposing `navigator.webdriver=true` to Cloudflare
- Distinguished between `openChrome` (child process, applies fingerprint) vs `toolService browser_launch` (Puppeteer, missing fingerprint flags)
- Identified that Chrome's `--disable-blink-features=AutomationControlled` warning bar itself could be detected by Cloudflare as an automation signal
- Fixed by uncommenting `ignoreDefaultArgs`, adding `--disable-infobars`, and implementing `envId` auto-fetch from main backend

Capability signals:
- Browser automation anti-detection
- Puppeteer/Chrome flag debugging
- Cross-process architecture understanding
- Adversarial environment debugging

Resume-ready phrasing:
- Diagnosed and fixed a fingerprint browser anti-detection failure where commented-out Puppeteer flags exposed automation signals to Cloudflare, then unified the browser launch path across child-process and toolService architectures.

### 35. Direction/Profile State Synchronization Architecture

Evidence:
- Traced a critical data flow bug across 4 layers: UI preset answers → agent state (`selectedAnswers`) → dashboard server → workflow engine → search pipeline
- Identified that `_buildDashboardAndFinish()` created the dashboard successfully but `profileSections` was empty because profile data lived in `masterProfile` not `profileSections`
- Found that workflow config (`workflowStore.getConfig`) only contained `region/location/sources/steps` but NOT direction data, causing pipeline to receive empty `q_job_title`
- Fixed by adding masterProfile fallback in 4 workflow endpoints and ensuring `_buildDashboardAndFinish` syncs profile data

Capability signals:
- Cross-layer state flow debugging
- Data synchronization architecture
- Multi-endpoint consistency
- Root cause analysis across service boundaries

Resume-ready phrasing:
- Traced and fixed a cross-layer state synchronization bug where direction and profile data failed to propagate from UI through agent state, dashboard server, workflow engine, and search pipeline, affecting 4 API endpoints.

### 36. Verification Process Self-Audit and Governance Reform

Evidence:
- After discovering 7 instances of false-pass QA results, conducted a systematic self-audit identifying 5 root causes: no user perspective, self-set lenient standards, urgency to mark complete, missing causal chain thinking, and insufficient environment understanding
- Designed corrective measures: L1-L5 verification levels, GATE checkpoints, UI-first principle, zero-tolerance for empty data, false-pass self-check question
- Updated 3 workflow governance files (wf-coord.md, wf-qa.md, acceptance-standards.md) with enforceable rules
- Documented 6 specific anti-patterns from real failures as "unacceptable pass" examples

Capability signals:
- Process self-audit capability
- Quality governance design
- Systematic failure analysis
- Continuous improvement culture
- Engineering management thinking

Resume-ready phrasing:
- Conducted systematic QA process self-audit after discovering false-pass results, then designed and codified L1-L5 verification levels, GATE checkpoints, and causal-chain validation rules into the team's workflow governance system.

### #37 — E2E Verification Tree Architecture
- **Date**: 2026-03-20
- **Context**: v1.3->v1.4 development revealed systematic QA failures: 7+ human interventions needed, false-positive pass rates, missing test steps (build tool), 0-result searches marked as pass
- **Capability**: Designed tree-structured E2E verification framework where test nodes have explicit parent dependencies, enabling coverage gap detection and preventing skipped steps. Enhanced with 4 dimensions: (1) blocking vs observation gate classification so parent failures either SKIP children or emit warnings; (2) per-node evidence requirements (screenshot, dom_state, api_response, ws_event, file_output, browser_verify, log_check) defining what proof is needed for PASS; (3) failure category tagging (environment, build, data_propagation, extraction, verification, ux_state_sync) for faster root-cause triage; (4) retry/re-entry paths with auto_retry flags and manual_step instructions for systematic recovery
- **Evidence**: 15/15 E2E tests passing after tree-driven redesign; previously 6/7 with core search untested. 30 nodes classified across 16 blocking gates and 14 observation nodes, with 3 test tiers (smoke/critical_path/full_acceptance)
- **Skills**: Test Architecture, Quality Engineering, Dependency Graph Design, CI/CD Pipeline Design, Failure Taxonomy Design, Evidence-Based Verification

### 38. Ghost Process Root Cause Analysis Beyond Code

Evidence:
- Discovered that repeated "ENOENT fix -> rebuild -> test failure" cycles were all caused by a stale dev process from 24 hours prior still occupying port 30001, not by any code defect
- Diagnosed the root cause by observing that killing the ghost process and restarting immediately resolved all failures, proving the bug was environmental rather than code-level
- Recognized that multiple rounds of code-level "fixes" were wasted effort because the real problem existed outside the codebase entirely

Capability signals:
- System-level debugging beyond source code
- Root cause analysis across environment and process layers
- Ghost process and port conflict diagnosis
- Wasted-effort pattern recognition

Resume-ready phrasing:
- Diagnosed a persistent build-test failure loop caused by a stale background process occupying the service port, ending multiple rounds of unnecessary code-level debugging by identifying the root cause as environmental rather than code-level.

### 39. Data Storage Architecture and Service-Layer Migration

Evidence:
- Identified that `sessions.json` was being stored in the project installation directory, creating portability and upgrade-safety issues
- Proposed relocating persistent data to the user-configured `savePath` to survive reinstalls and updates
- Further pushed the design from direct file read/write to StateService-managed persistence, enforcing proper separation of concerns and enabling future storage backend changes without caller-side rewrites

Capability signals:
- Data architecture design
- Separation of concerns enforcement
- Upgrade and migration safety thinking
- Service-layer abstraction over raw I/O

Resume-ready phrasing:
- Redesigned session data persistence from in-place file writes to a StateService-managed architecture with user-configurable storage paths, improving upgrade safety and enforcing separation of concerns.

### 40. Port Conflict Self-Healing System Design

Evidence:
- Rejected a "pre-build port cleanup" script as a band-aid and required a runtime self-healing solution at the code level
- Designed a full-chain dynamic port resolution: `server.js` detects port conflicts and selects an available port, `electron.js` reads the actual bound port, and the frontend receives the correct backend URL
- Ensured the solution worked transparently without user intervention, covering both dev and production environments

Capability signals:
- Self-healing system design
- Full-stack port resolution architecture
- User experience prioritization over manual workarounds
- Root-cause elimination over symptom patching

Resume-ready phrasing:
- Designed a self-healing port resolution system spanning server startup, Electron main process, and React frontend, automatically detecting and resolving port conflicts instead of relying on manual cleanup scripts.

### 41. Multi-Agent Role Separation and Non-Blocking Coordination Refactor

Evidence:
- Diagnosed that the Coordinator agent was stalling because it combined requirement analysis, task dispatch, and code implementation into a single context window, causing context overflow
- Proposed extracting PM as an independent role responsible for requirement analysis and acceptance criteria, leaving the Coordinator as a pure dispatcher
- Designed non-blocking agent dispatch where sub-agents run in background with callback notifications instead of blocking the Coordinator's context with synchronous execution
- Added a conversation-mode design where the Coordinator presents options to the user rather than making autonomous decisions, reducing error accumulation from wrong assumptions

Capability signals:
- Multi-agent architecture refactoring
- Responsibility separation and context budget management
- Non-blocking async coordination design
- Human-in-the-loop interaction modeling
- System bottleneck diagnosis

Resume-ready phrasing:
- Refactored a multi-agent coordination system by extracting PM as an independent role and converting synchronous agent dispatch to non-blocking callbacks, resolving context overflow that caused coordinator stalls.

### 42. Build Quality Gate Automation

Evidence:
- After encountering repeated post-build failures from memory leaks, missing dependencies, and ghost processes, identified that manual pre-release checks were insufficient and error-prone
- Drove the creation of automated pre-dist detection scripts that verify port availability, dependency integrity, and process cleanliness before allowing a build to proceed
- Transformed a pattern of "build first, debug later" into "gate first, build only when clean"

Capability signals:
- Quality gate engineering
- CI/CD pipeline thinking
- Build process reliability
- Shift-left quality assurance
- Process automation over manual checklists

Resume-ready phrasing:
- Established automated pre-distribution quality gates that verify port availability, dependency integrity, and process cleanliness, converting repeated post-build debugging cycles into a fail-fast pre-build validation pipeline.

### 43. Project-Level Acceptance Tree Governance and Traceability Design

Evidence:
- Detected a governance gap after asking whether a completed fix had been added back into the acceptance tree, revealing that only generic standards (`acceptance-standards.md`), one-off QA reports, and code-level pre-dist checks existed, but no continuously maintained project-level acceptance tree
- Distinguished between universal QA rules and project-specific acceptance nodes, clarifying that the framework defined verification rules while the project lacked a persistent tree tracking concrete feature nodes and current status
- Required future development to flow through the acceptance tree: PM documents must declare where new nodes are added, test must derive test cases and E2E coverage from those nodes, and QA must verify newly added leaf nodes are bug-free
- Extended the current implementation path by adding concrete regression checks to `pre-dist.js` and `wf-qa.md`, while pushing for a durable tree structure to become the single source of truth for project acceptance

Capability signals:
- Requirements-to-testing traceability design
- Project-level acceptance governance
- QA process architecture
- Single-source-of-truth thinking for verification
- Structured development workflow enforcement

Resume-ready phrasing:
- Defined a project-level acceptance tree model that links PM requirements, test-case generation, E2E coverage, and QA signoff, turning scattered verification artifacts into a traceable acceptance workflow for ongoing development.

### 44. Dependency-Driven Acceptance Topology and Minimal Verification Path Design

Evidence:
- Challenged a flat acceptance grouping model by identifying that top-level modules were not truly parallel in verification cost, because they contained hidden dependency layers such as `Core Infrastructure -> Data Management -> AI Agent / Browser -> UI`
- Proposed rebuilding the acceptance tree as a dependency topology rather than a feature bucket list, so validation could move bottom-up and automatically skip higher layers when a lower dependency fails
- Defined the idea of a "minimal verification path": when a change touches one node, verification should traverse only the affected dependency chain instead of running full regression
- Applied the concept to a concrete change (`dbservice restart`) and showed how the system could derive the shortest affected validation route rather than retesting unrelated areas
- Framed the redesign as an architectural optimization that reduces validation cost and makes PM-driven acceptance planning more precise

Capability signals:
- Dependency graph modeling for verification
- Minimal-path regression design
- Acceptance architecture optimization
- Cost-aware validation strategy
- System-structure reasoning beyond feature lists

Resume-ready phrasing:
- Redesigned acceptance planning around dependency topology and minimal verification paths, allowing regression scope to be derived from affected dependency chains instead of full feature-by-feature retesting.

### 45. File-to-Acceptance-Node Indexing and Reverse Traceability Design

Evidence:
- Proposed enriching acceptance-tree nodes with explicit `files: []` mappings so code changes could be traced directly to affected verification nodes without maintaining a separate parallel "development tree"
- Defined two-way traceability: `git diff` could automatically derive the impacted acceptance scope, while a failing acceptance node could point engineers back to the most likely source files
- Suggested generating a reverse file-to-node index from the acceptance graph, turning path changes such as `server/services/taskService.js` into immediate validation targets and turning node failures such as `knowledge.db isolation` into targeted file inspection
- Positioned the design as a way to accelerate both regression planning and bug localization, reducing the cost of broad manual investigation

Capability signals:
- Bidirectional traceability design
- Change-impact analysis architecture
- File-to-test mapping strategy
- Faster bug localization through structured metadata
- Verification graph operationalization

Resume-ready phrasing:
- Designed bidirectional file-to-acceptance-node traceability so code diffs could automatically derive validation scope and failing verification nodes could immediately map back to likely source files.

### 46. Gatekeeper Role Design for Phase-Gated Workflow Validation

Evidence:
- Evaluated adding a dedicated Gatekeeper role that validates workflow progress before each phase transition, instead of relying on a long-lived Coordinator whose judgment drifts after accumulating too much debugging context
- Defined the Gatekeeper's narrow responsibility as checking only current task state and the acceptance graph, explicitly avoiding inheritance of other agents' long-term memory so phase validation stays unbiased
- Compared lifecycle strategies and concluded the Gatekeeper must be spawned as a fresh agent per validation session to preserve memory isolation, rejecting reuse patterns that would reintroduce coordinator-style context contamination
- Formalized the role as a PASS/FAIL gate that inspects acceptance-graph state, unresolved child tasks, recent task logs, and instruction consistency before allowing the next workflow phase to proceed
- Required lifecycle and invocation responsibilities to be documented separately in both the Gatekeeper spec and Coordinator spec, clarifying ownership of spawning, scope, and teardown

Capability signals:
- Role-based workflow validation design
- Memory-isolation architecture for agents
- Phase-gated orchestration and approval control
- Context-contamination risk analysis
- Lifecycle ownership modeling across agents

Resume-ready phrasing:
- Designed a dedicated Gatekeeper validation role for phase-gated workflows, using per-session agent spawning and memory isolation to keep acceptance checks unbiased before each orchestration step.

### 47. E2E Timing Optimization and Layered Validation Strategy

Evidence:
- Analyzed a v1.4.4 acceptance cycle and found that roughly 35 minutes of E2E time were consumed across 7 reruns, while 6 of the 7 rounds were caused by test infrastructure or environment issues rather than actual product defects
- Identified the core inefficiency that the workflow was running full E2E validation twice (`Dev -> Tester E2E -> merge -> QA E2E`), and even trivial configuration changes triggered complete end-to-end reruns
- Framed the problem as a validation-timing issue: E2E was being used too early and too often, spending most of its time debugging the test harness instead of verifying product behavior
- Pushed toward a layered validation strategy in which lower-cost checks catch infrastructure and configuration issues earlier, reserving full E2E runs for accumulated acceptance points and higher-confidence release checkpoints
- Repositioned E2E as a late-stage product-behavior gate rather than the default debugging tool for every small iteration

Capability signals:
- Test timing and cost analysis
- Layered validation strategy design
- Shift-left verification thinking
- E2E scope optimization
- Distinguishing test-infrastructure failures from product defects

Resume-ready phrasing:
- Analyzed repeated E2E rerun cost and redesigned validation timing around a layered strategy, shifting infrastructure and configuration checks earlier so full end-to-end testing could focus on product behavior at higher-confidence checkpoints.

## Suggested Top 6 for Resume

If space is limited, prioritize:

1. Agent Workflow Design
2. Agent Verification Workflow
3. Tool Platform Architecture
4. Browser Execution Runtime Design
5. Memory and Retrieval Architecture
6. Runtime State and Context Propagation

## Entry Template

Use this template when adding new evidence:

### N. Ability Name

Evidence:
- What concrete design decision, debugging action, or architecture discussion happened?
- What exact workflow, service boundary, fallback, or state transition was involved?

Capability signals:
- Signal 1
- Signal 2
- Signal 3

Resume-ready phrasing:
- One concise bullet that sounds credible on a resume

## v1.4.6 Workflow Iteration Evidence

### Gatekeeper 角色设计
- **问题**: Coordinator 在长时间执行后认知偏移，跳过验收直接发布
- **方案**: 独立审计角色，每次新 Agent 实例，只读验收图，不累积上下文
- **关键洞察**: 记忆隔离是核心价值 — 审计者不应知道调试过程，只看结果
- **生命周期分析**: 对比 3 种方案（新 Agent / resume / 主对话），选择新 Agent

### 分层测试策略
- **问题**: 每次任务都跑完整 E2E（5-15min），12+ 轮迭代浪费 ~35min
- **方案**: T1-T4 分层，每任务 T1+T2（<3min），release 前才跑 T3 E2E
- **效果**: 单任务验证从 5-15min 降到 1-3min

### E2E 跳步 GATE 机制
- **问题**: Phase 1-6 重复验证无新增价值
- **方案**: 条件式跳步 — 验收图 verify:pass + 改动范围 + 时间窗口三重约束
- **关键设计**: Gatekeeper 审批跳步，Coordinator 不能自行决定

### Self-heal Location Context
- **问题**: AI self-heal 截图但不知道用户目标位置，无法识别 "Sudbury ≠ Ontario"
- **方案**: prompt 加入 `User search target: "..." in "..."` 对比信息
- **洞察**: AI 需要"期望值"才能判断"实际值"是否正确

### 进程生命周期管理
- **问题**: Electron 孤儿进程反复出现（3 次）
- **根因**: npm→cross-env→electron 三层嵌套，bash $! 拿不到实际 PID
- **方案**: hook 化管理而非自律，启动前 kill + 结束后扫描

### Workflow 迭代闭环
- **模式**: 执行 → 发现问题 → 分析根因 → 写入规范 → 下轮验证
- **证据**: v1.4.4 角色坍塌 → v1.4.5 加 Gatekeeper → v1.4.6 角色 0 次越权

---

## v1.5.0 stateService 重构 + 治理服务设计 Evidence

### stateService 架构重构（HTTP CRUD + SSE 广播）
- **问题**: session 状态住在 agent 子进程内存里，stateService 被绕过。savePath 切换需要双路径（WS + HTTP），3 轮 Dev 才修好
- **根因分析**: Phase 2 标记 COMPLETED 但 AgentBridge 是 stub，后续所有 Phase 绕过 stateService
- **方案**: stateService 加 HTTP CRUD `/api/state/*` + SSE `/api/state/subscribe` 广播，agent 通过 HTTP 读写 + SSE 订阅
- **设计决策**: 用户提出 SSE 替代 WS 广播方案 — stateService 不关心订阅者身份，纯 pub/sub 模式，比原方案（AgentBridge + StateClient）耦合度低、扩展性强
- **实施**: 5 个 Phase（A: HTTP CRUD → B: SSE → C: Agent 迁移 → D: Frontend 迁移 → E: 清理），162/162 测试通过

### Bug 深层分析方法论
- **savePath bug 链**: isTaskRunning guard → agent 无 handler → session 不刷新
- **分析深度**: 表层（guard 条件）→ 中层（为什么 session 依赖 agent）→ 深层（stateService 被绕过）→ 根因（Phase 2 假完成）
- **方法**: 不止修 bug，追溯到架构决策失误，从而发现系统性问题并驱动重构
- **证据**: 一个 savePath bug → 暴露 stateService 架构缺陷 → 驱动完整 HTTP+SSE 重构

### AI Agent 可靠性工程
- **Dev Agent 文件写入失败**: 5 次尝试修改 agent.js 均未生效（报告"已修改"但磁盘无变化）
- **应对**: 建立 grep 验证 checklist，Dev 交付必须包含机器可验证的证据
- **跨边界 Bug 验证协议**: 涉及 WS/IPC/EventEmitter 的修复，单元测试 mock 了边界 → 无法发现真实问题 → 必须 integration/E2E + 后端日志交叉验证
- **洞察**: 单元测试 pass ≠ 功能正常（mock 掩盖了边界交互 bug）

### Worktree Sync 可靠性问题
- **问题**: `cp` 命令在 Git worktree 路径下静默失败（文件大小不变），导致 3 次"修了但没生效"
- **解决**: 改用 `cat source > target` 管道 + `grep -c` 验证关键方法存在
- **工程教训**: 基础工具链的假设不可靠时，必须加验证步骤

### 治理服务架构设计（Workflow Governance Service）
- **核心洞察**: "规则写在文档里靠 AI 自律" 反复失败 → 必须 "规则写在代码里由 API 强制执行"
- **状态与文档分离**: acceptance-state.json 是唯一真相，acceptance-graph.md 是自动生成的只读视图。AI 直接编辑 md 文件 = 无效操作
- **角色鉴权系统**: Agent 注册获取 token → API 校验角色 + scope → 越权请求被拒绝。解决"任何 Agent 都能改任何文件"的问题
- **证据驱动状态转换**: pending → T2-pass 需要 test output；T2-pass → pass 需要 E2E report。禁止跳步（pending → pass 被拒绝）
- **技术选型**: NetworkX + JSON（89 节点规模无需 Neo4j）、stdlib http.server（零新框架依赖）、乐观锁 + 文件锁（并发保护）

### 决策升级倒置分析
- **发现**: Coordinator 把"验证 savePath"反复让用户手动操作（低价值），却把"stateService 架构缺陷"自行处理不上报（高价值）
- **根因**: 没有定义"什么事该升级给人、什么事该自动化"
- **方案**: 架构决策/Phase 完成必须升级给用户审批；功能验证交 QA Agent 自动化

### Dev Agent 结构性缺陷分析
- **不读同级代码**: Dev 改 agent.js 时不看同级的 stateService.js、taskService.js → 不知道 stateService 存在
- **模仿现有错误模式**: 看到其他代码用 WebSocket → 照抄 → 错误模式被复制传播
- **优化"通过测试"而非"设计正确"**: mock 掩盖问题，Dev 目标是让测试 pass 而非架构合理
- **方案**: Dev 接任务后必读同级模块 + CLAUDE.md；发现架构 gap 上报不造轮子

### 开发记忆库设计
- **问题**: 每个 Dev Agent 是新实例，不知道前任踩过什么坑、模块用什么模式
- **方案**: 独立 Memory Service（SQLite），Dev 完成后写入模块记忆（pattern/pitfall/decision），下个 Dev 通过验收图关联查询
- **与验收图联动**: `GET /api/mem/related?node=L5.3` → 返回 stateService 的所有记忆
- **独立服务**: 不放在业务项目仓库里，AI Agent 无法篡改

### 多项目治理隔离
- **设计**: 每个项目独立目录（acceptance-state.json + memories.json + audit log）
- **会话绑定项目**: Agent 注册时指定 project_id，后续请求自动路由
- **自治理**: governance 服务自身也注册为一个项目，走验收流程（避免"鞋匠没鞋穿"）

### 离线降级策略
- **分级设计**: 状态变更（verify-update/release-gate）严格模式阻塞等待；记忆写入宽松模式本地缓存 + 恢复后补推
- **GovernanceClient**: 内置离线队列 + flush 机制，服务恢复后自动补推

### 最小验证路径算法
- **输入**: git diff → changed_files
- **输出**: 按拓扑排序的分层验证计划（T1/T2/T3/T4 + 测试文件 + 预估时间）
- **裁剪规则**: 已 pass 且非直接命中 → 跳过；gate 未满足 → SKIP；propagation:smoke_ui → 仅 UI smoke
- **价值**: 从"每次跑全量"优化为"只跑受影响的最小集"
