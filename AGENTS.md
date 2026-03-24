# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
# Development
npm start              # React dev server (port 3000)
npm run dev            # Electron + backend (dev mode, IS_BUILD=false)

# Build
npm run build          # React production build (react-app-rewired)
npm run dist           # Electron distributable (electron-builder)

# Tests
npm run test           # Client tests (Jest + React Testing Library)
npm run test:server    # Server tests (Jest, Node environment)
npm run test:all       # Both client and server
npm run test:e2e       # Playwright end-to-end tests

# Run a single test file
npx jest path/to/file.test.js                    # server tests
npx react-app-rewired test --watchAll=false -- path/to/file.test.js  # client tests
```

## Architecture

Electron desktop app with three layers communicating via HTTP + WebSocket:

```
Electron Main (electron.js + preload.js)
  ├─ React Frontend (client/src/, port 3000)
  │   Uses: React 18, React Bootstrap, Zustand, i18next
  └─ Express Backend (server/, port 30001)
      Uses: Express, express-ws, NeDB (embedded DB)
```

- **Electron main process** (`electron.js`): Window management, IPC for native dialogs, spawns backend
- **React client** (`client/src/`): UI layer, communicates with backend via `utils/api.js` (Axios, base `/api`) and `utils/webSocket.js` (real-time task updates)
- **Express server** (`server/`): REST API + WebSocket server, spawns Node child processes for task execution

### Key data flow
Tasks are defined as configs, executed by `server/services/taskService.js` which spawns child processes using bundled Node.js (`assets/node_for_win/` or `assets/node_for_mac/`). Real-time execution logs flow back via WebSocket to the React UI.

## State Management

Three Zustand stores in `client/src/store/`:
- `walletStore.js` — wallet list
- `fingerPrintStore.js` — browser fingerprint profiles (object keyed by ID)
- `pathStore.js` — file paths (chromePath, savePath, scriptDirectory)

Cross-component events use `client/src/utils/eventEmitter.js` (Node EventEmitter). Key events: `taskExecuted`, `taskStart`, `clientTaskMessage`, `tasksRefreshed`.

## Routing

Hash router (`client/src/router.js`):
- `/` — Introduction
- `/chromeManager` — Browser profile manager
- `/walletManage` — Wallet manager
- `/syncFunction` — Code sync
- `/taskManage` — Task execution
- `/agentWorkspace/:taskName` — AI workspace

All routes wrapped in `Layout/` which provides sidebar navigation.

## i18n

Two languages: `zh-CN` (default), `en`. Translation files in `client/src/utils/languages/`. Uses `react-i18next`. Dynamic task names resolved via `client/src/utils/taskI18n.js`.

## Database

NeDB embedded databases managed by `config.js` singleton:
- `walletData.db` — wallet credentials (mnemonic, keys, addresses)
- `fingerPrint.db` — browser profiles
- `task.db` — task configurations

## Styling

SCSS with design tokens defined in `client/src/index.scss`. Key variables:
- `$page-card-max-width: 1400px` — unified card width across all pages
- `$clr-*` color tokens for consistent theming
- Each page has its own `index.scss` importing the global tokens
- Responsive breakpoint at 900px for mobile layout

## Important Patterns

- **APIManager** (`client/src/utils/api.js`): Singleton Axios wrapper, auto-detects language for i18n headers
- **WebSocket client** (`client/src/utils/webSocket.js`): Auto-reconnect with exponential backoff, heartbeat every 5s, message queuing during disconnects
- **Config** (`config.js`): Singleton managing DB connections, platform detection, script/save path resolution
- **Task execution** (`server/services/taskService.js`): Core engine that spawns child processes, manages task lifecycle, bridges WebSocket for real-time updates
- Webpack polyfills for Node.js modules configured in `config-overrides.js` (needed for Web3 libraries)
