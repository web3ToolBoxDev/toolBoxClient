#!/usr/bin/env node
/**
 * Pre-dist check — runs before `npm run dist` to catch common packaging issues.
 * Exit 0 = all clear, Exit 1 = blocking issues found.
 *
 * Usage:
 *   node scripts/pre-dist.js          # check only
 *   node scripts/pre-dist.js --fix    # auto-clean data files (won't touch code)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const autoFix = process.argv.includes('--fix');

let passed = 0;
let failed = 0;
let warned = 0;

function pass(n, msg) { console.log(`  \x1b[32m✅ ${n}. ${msg}\x1b[0m`); passed++; }
function fail(n, msg) { console.log(`  \x1b[31m❌ ${n}. ${msg}\x1b[0m`); failed++; }
function warn(n, msg) { console.log(`  \x1b[33m⚠️  ${n}. ${msg}\x1b[0m`); warned++; }
function fix(action) { if (autoFix) { action(); return true; } return false; }

console.log('\n\x1b[1m🔍 Pre-dist Check\x1b[0m\n');

// ─── 1. Agent data: no user data files ───
const USER_DATA_FILES = ['sessions.json', 'users.json', 'state.json'];
const agentDataDirs = [];
try {
  const agentsDir = path.join(ASSETS, 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const agent of fs.readdirSync(agentsDir)) {
      const dataDir = path.join(agentsDir, agent, 'data');
      if (fs.existsSync(dataDir)) agentDataDirs.push(dataDir);
    }
  }
} catch {}

const foundUserData = [];
for (const dir of agentDataDirs) {
  for (const f of USER_DATA_FILES) {
    const fp = path.join(dir, f);
    if (fs.existsSync(fp)) foundUserData.push(fp);
  }
}

if (foundUserData.length === 0) {
  pass(1, 'Agent data dirs clean (no user data files)');
} else {
  const fixed = fix(() => {
    foundUserData.forEach(f => { try { fs.unlinkSync(f); } catch {} });
  });
  if (fixed) pass(1, `Agent data cleaned (--fix removed ${foundUserData.length} files)`);
  else fail(1, `User data in agent dirs: ${foundUserData.map(f => path.relative(ROOT, f)).join(', ')}`);
}

// ─── 2. No knowledge.db in packaging dirs ───
const knowledgeLocations = [
  path.join(ROOT, 'dbservice', 'data', 'knowledge.db'),
  path.join(ROOT, 'dbservice', 'data', 'vector_store.db'),
];
const foundKnowledge = knowledgeLocations.filter(p => fs.existsSync(p));

if (foundKnowledge.length === 0) {
  pass(2, 'No knowledge.db / vector_store.db in packaging dirs');
} else {
  const fixed = fix(() => {
    foundKnowledge.forEach(f => { try { fs.unlinkSync(f); } catch {} });
  });
  if (fixed) pass(2, `Cleaned knowledge DBs (--fix removed ${foundKnowledge.length} files)`);
  else fail(2, `Knowledge DB found: ${foundKnowledge.map(f => path.relative(ROOT, f)).join(', ')}`);
}

// ─── 3. No savePath.json in assets ───
const savePathInAssets = path.join(ASSETS, 'savePath.json');
if (!fs.existsSync(savePathInAssets)) {
  pass(3, 'No savePath.json in assets/');
} else {
  const fixed = fix(() => { try { fs.unlinkSync(savePathInAssets); } catch {} });
  if (fixed) pass(3, 'Removed savePath.json from assets/ (--fix)');
  else fail(3, 'savePath.json exists in assets/ — contains user path config');
}

// ─── 4. Critical dependencies exist ───
const criticalDeps = ['nedb', 'ws', 'express', 'i18next'];
const missingDeps = criticalDeps.filter(dep => {
  try { require.resolve(dep, { paths: [ROOT] }); return false; } catch { return true; }
});

if (missingDeps.length === 0) {
  pass(4, 'Critical dependencies present (nedb, ws, express, i18next)');
} else {
  fail(4, `Missing dependencies: ${missingDeps.join(', ')} — run npm install`);
}

// ─── 5. Port 30001 not occupied (WARN only) ───
let portOccupied = false;
try {
  const out = execSync('netstat -ano | findstr "30001" | findstr "LISTENING"', { encoding: 'utf8', timeout: 5000 });
  if (out.trim()) portOccupied = true;
} catch { /* no match = good */ }

if (!portOccupied) {
  pass(5, 'Port 30001 not occupied');
} else {
  warn(5, 'Port 30001 is occupied — may interfere with testing. Kill stale processes first');
}

// ─── 6. Critical fixes present in code ───
const criticalChecks = [
  { file: 'electron.js', pattern: /env:\s*serverEnv/, desc: 'electron.js: env passed to utilityProcess.fork' },
  { file: 'server/services/taskService.js', pattern: /ComSpec/, desc: 'taskService.js: ComSpec in spawn env' },
  { file: 'server/router.js', pattern: /restartDbService/, desc: 'router.js: dbservice restart on savePath change' },
];
const missingFixes = [];
for (const { file, pattern, desc } of criticalChecks) {
  const fp = path.join(ROOT, file);
  try {
    const content = fs.readFileSync(fp, 'utf8');
    if (!pattern.test(content)) missingFixes.push(desc);
  } catch { missingFixes.push(`${desc} (file not found)`); }
}

if (missingFixes.length === 0) {
  pass(6, 'Critical fixes present (ComSpec env chain)');
} else {
  fail(6, `Missing critical fixes: ${missingFixes.join('; ')}`);
}

// ─── 7. Build directory exists ───
const buildIndex = path.join(ROOT, 'client', 'build', 'index.html');
if (fs.existsSync(buildIndex)) {
  pass(7, 'React build/ exists with index.html');
} else {
  fail(7, 'build/index.html missing — run npm run build first');
}

// ─── 8. client/build not blocked by gitignore + electron-builder ───
{
  const pkgBuild = require(path.join(ROOT, 'package.json')).build || {};
  const files = pkgBuild.files || [];
  const buildEntryStr = JSON.stringify(files);
  // Must use object form { from, to, filter } to override gitignore for client/build
  const hasObjectForm = files.some(f => typeof f === 'object' && f.from && f.from.includes('client/build'));
  if (hasObjectForm) {
    pass(8, 'client/build uses object-form in build.files (bypasses .gitignore)');
  } else if (buildEntryStr.includes('client/build')) {
    fail(8, 'client/build uses glob string — electron-builder skips gitignored dirs. Use { from, to, filter } form');
  } else {
    fail(8, 'client/build not listed in build.files at all');
  }
}

// ─── 9. Workspace dirs clean (renumbered) ───
const workspaceDirs = [];
try {
  const agentsDir = path.join(ASSETS, 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const agent of fs.readdirSync(agentsDir)) {
      const ws = path.join(agentsDir, agent, 'workspace');
      if (fs.existsSync(ws)) workspaceDirs.push(ws);
    }
  }
} catch {}

let workspaceClean = true;
for (const ws of workspaceDirs) {
  const files = fs.readdirSync(ws).filter(f => f !== '.git' && f !== '.gitkeep');
  if (files.length > 0) { workspaceClean = false; break; }
}

if (workspaceClean) {
  pass(8, 'Agent workspace dirs clean');
} else {
  warn(8, 'Agent workspace contains files — may inflate package size');
}

// ─── Summary ───
console.log(`\n\x1b[1m  RESULT: ${passed} passed, ${failed} failed, ${warned} warned\x1b[0m`);

if (failed > 0) {
  console.log(`\x1b[31m\n  ❌ ${failed} check(s) FAILED — fix before packaging\x1b[0m`);
  if (!autoFix) console.log('  Tip: run with --fix to auto-clean data files\n');
  process.exit(1);
} else {
  console.log('\x1b[32m\n  ✅ All checks passed — safe to package\x1b[0m\n');
  process.exit(0);
}
