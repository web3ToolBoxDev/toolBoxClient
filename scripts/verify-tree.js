#!/usr/bin/env node

/**
 * Verification Tree Runner
 *
 * Loads docs/verification-tree.yaml, runs the full Playwright test suite ONCE,
 * then maps test results to tree nodes and evaluates pass/fail/skip/warning
 * according to the tree's gate logic.
 *
 * Usage:
 *   node scripts/verify-tree.js [--tier smoke|critical_path|full_acceptance]
 *
 * Exit code: 0 if all blocking nodes pass, 1 otherwise.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Minimal YAML parser (supports the verification-tree.yaml structure) ───

function parseYaml(text) {
  // Use js-yaml if available, otherwise fall back to JSON-based approach
  try {
    const jsYaml = require('js-yaml');
    return jsYaml.load(text);
  } catch (_) {
    // Fallback: convert YAML to JSON via simple line-based parser
    return parseYamlSimple(text);
  }
}

/**
 * Simple YAML parser that handles the subset used by verification-tree.yaml:
 * - Scalars, arrays (inline [...] and block - item), nested objects, null
 */
function parseYamlSimple(text) {
  const lines = text.split('\n');
  let idx = 0;

  function peekIndent() {
    while (idx < lines.length) {
      const line = lines[idx];
      if (line.trim() === '' || line.trim().startsWith('#')) { idx++; continue; }
      return line.match(/^(\s*)/)[1].length;
    }
    return -1;
  }

  function parseValue(raw) {
    raw = raw.trim();
    if (raw === '' || raw === 'null' || raw === '~') return null;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'all') return 'all';
    // Inline array: [a, b, c]
    if (raw.startsWith('[') && raw.endsWith(']')) {
      const inner = raw.slice(1, -1).trim();
      if (inner === '') return [];
      return inner.split(',').map(s => parseValue(s.trim()));
    }
    // Quoted string
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }
    // Number
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    return raw;
  }

  function parseBlock(minIndent) {
    const startIndent = peekIndent();
    if (startIndent < minIndent || startIndent < 0) return null;

    // Check if this is a list
    const firstLine = lines[idx].trim();
    if (firstLine.startsWith('- ')) {
      return parseList(startIndent);
    }
    return parseMap(startIndent);
  }

  function parseMap(mapIndent) {
    const result = {};
    while (idx < lines.length) {
      const indent = peekIndent();
      if (indent < 0 || indent < mapIndent) break;
      if (indent > mapIndent) break; // belongs to parent

      const line = lines[idx].trim();
      if (line.startsWith('- ')) break; // list item at same level

      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) { idx++; continue; }

      const key = line.slice(0, colonIdx).trim();
      const rest = line.slice(colonIdx + 1).trim();
      idx++;

      if (rest === '' || rest === '|' || rest === '>') {
        // Block value — check next line indent
        const childIndent = peekIndent();
        if (childIndent > mapIndent) {
          result[key] = parseBlock(childIndent);
        } else {
          result[key] = null;
        }
      } else {
        result[key] = parseValue(rest);
      }
    }
    return result;
  }

  function parseList(listIndent) {
    const result = [];
    while (idx < lines.length) {
      const indent = peekIndent();
      if (indent < 0 || indent < listIndent) break;
      if (indent > listIndent) break;

      const line = lines[idx].trim();
      if (!line.startsWith('- ')) break;

      const rest = line.slice(2).trim();
      // Check if it's a mapping item (- key: value)
      const colonIdx = rest.indexOf(':');
      if (colonIdx > 0 && !rest.startsWith('[') && !rest.startsWith('"') && !rest.startsWith("'")) {
        // Mapping item within list
        const key = rest.slice(0, colonIdx).trim();
        const val = rest.slice(colonIdx + 1).trim();
        idx++;
        const item = {};
        if (val === '') {
          const childIndent = peekIndent();
          if (childIndent > listIndent) {
            item[key] = parseBlock(childIndent);
          } else {
            item[key] = null;
          }
        } else {
          item[key] = parseValue(val);
        }
        // Continue reading sibling keys at deeper indent
        const nextIndent = peekIndent();
        if (nextIndent > listIndent && idx < lines.length && !lines[idx].trim().startsWith('- ')) {
          const extra = parseMap(nextIndent);
          Object.assign(item, extra);
        }
        result.push(item);
      } else {
        // Simple list item
        result.push(parseValue(rest));
        idx++;
      }
    }
    return result;
  }

  return parseBlock(0);
}

// ─── Tree utilities ───

/**
 * Flatten the tree into a list of nodes with parent references.
 */
function flattenTree(nodes, parent = null) {
  const flat = [];
  for (const node of nodes) {
    const entry = { ...node, parent: parent ? parent.id : null };
    flat.push(entry);
    if (node.children && node.children.length > 0) {
      flat.push(...flattenTree(node.children, node));
    }
  }
  return flat;
}

/**
 * Collect all node IDs relevant for a given tier.
 */
function getNodeIdsForTier(meta, tier) {
  const tierDef = meta.tiers[tier];
  if (tierDef === 'all') return null; // null means all nodes
  return new Set(tierDef.map(String));
}

/**
 * Filter nodes for a tier. If tierIds is null, include all.
 * Also include any ancestor node needed for gate evaluation.
 */
function filterNodesForTier(allNodes, tierIds) {
  if (!tierIds) return allNodes;

  // Collect ancestors of tier nodes
  const needed = new Set(tierIds);
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  for (const id of tierIds) {
    let node = nodeMap.get(id);
    while (node && node.parent) {
      needed.add(node.parent);
      node = nodeMap.get(node.parent);
    }
  }
  return allNodes.filter(n => needed.has(n.id));
}

// ─── Playwright runner ───

/**
 * Run the full Playwright test suite once and capture output.
 * Returns the raw stdout text.
 */
function runPlaywrightSuite() {
  console.log('\n🧪 Running Playwright test suite...\n');
  try {
    const output = execSync(
      'npx playwright test -c test/playwright.config.js --reporter=line 2>&1',
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf-8',
        timeout: 20 * 60 * 1000, // 20 min
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    return { output, exitCode: 0 };
  } catch (err) {
    return { output: err.stdout || err.message || '', exitCode: err.status || 1 };
  }
}

/**
 * Parse Playwright line-reporter output to extract test results.
 * Returns a Map<testName, 'passed'|'failed'|'skipped'>.
 */
function parsePlaywrightOutput(output) {
  const results = new Map();
  const lines = output.split('\n');

  for (const line of lines) {
    // Line reporter format: "  ✓ test name (duration)"  or  "  ✘ test name (duration)"
    // Also matches: "  - test name" (skipped)
    let match;

    // Passed: ✓ or [passed] or ✔
    match = line.match(/[✓✔]\s+.*?[›»]\s+(.+?)(?:\s+\(\d+[\d.]*[sm]+\))?$/);
    if (match) { results.set(match[1].trim(), 'passed'); continue; }

    // Failed: ✘ or [failed] or ✗
    match = line.match(/[✘✗×]\s+.*?[›»]\s+(.+?)(?:\s+\(\d+[\d.]*[sm]+\))?$/);
    if (match) { results.set(match[1].trim(), 'failed'); continue; }

    // Skipped: - or [skipped]
    match = line.match(/[-–]\s+.*?[›»]\s+(.+?)$/);
    if (match) { results.set(match[1].trim(), 'skipped'); continue; }

    // Generic patterns: "  passed: test name" / "  failed: test name"
    match = line.match(/\b(passed|failed|skipped)\b.*?:\s*(.+)/i);
    if (match) { results.set(match[2].trim(), match[1].toLowerCase()); }
  }

  return results;
}

/**
 * Match a node's test_name against Playwright results.
 * Uses substring matching since test names in the tree may be partial.
 */
function findTestResult(testResults, testName) {
  if (!testName) return null;

  // Exact match first
  if (testResults.has(testName)) return testResults.get(testName);

  // Substring match
  for (const [name, result] of testResults) {
    if (name.includes(testName) || testName.includes(name)) {
      return result;
    }
  }
  return null;
}

// ─── Tree evaluation ───

/**
 * Walk the tree and evaluate each node based on test results and gate logic.
 */
function evaluateTree(nodes, testResults, tierIds) {
  const results = new Map(); // id -> { status, evidence, output }
  const filteredNodes = filterNodesForTier(nodes, tierIds);
  const filteredIds = new Set(filteredNodes.map(n => n.id));

  function evaluate(nodeList) {
    for (const node of nodeList) {
      if (!filteredIds.has(node.id)) continue;

      // Check parent gate
      if (node.parent) {
        const parentResult = results.get(node.parent);
        if (parentResult && parentResult.status === 'FAIL' && getNodeGate(node, nodes) === 'blocking') {
          results.set(node.id, {
            status: 'SKIP',
            reason: `Blocked by parent ${node.parent} (${getNodeName(node.parent, nodes)})`,
            evidence: [],
          });
          if (node.children) evaluate(node.children);
          continue;
        }
        if (parentResult && parentResult.status === 'SKIP') {
          results.set(node.id, {
            status: 'SKIP',
            reason: `Parent ${node.parent} was skipped`,
            evidence: [],
          });
          if (node.children) evaluate(node.children);
          continue;
        }
      }

      // Look up test result
      const testName = node.test_mapping?.test_name;
      const testResult = findTestResult(testResults, testName);
      let status;

      if (!testName) {
        // No test mapping — branch node or not covered
        if (node.children && node.children.length > 0) {
          // Branch node — will be evaluated after children
          status = 'PENDING';
        } else {
          status = 'SKIP';
          results.set(node.id, {
            status: 'SKIP',
            reason: 'No test mapping (NOT COVERED)',
            evidence: [],
          });
          if (node.children) evaluate(node.children);
          continue;
        }
      } else if (testResult === 'passed') {
        status = 'PASS';
      } else if (testResult === 'failed') {
        status = node.gate === 'blocking' ? 'FAIL' : 'WARNING';
      } else if (testResult === 'skipped') {
        status = 'SKIP';
      } else {
        // Test not found in output
        status = 'SKIP';
      }

      if (status !== 'PENDING') {
        results.set(node.id, {
          status,
          reason: testResult ? `Test ${testResult}` : 'Test not found in output',
          evidence: node.evidence || [],
          testFile: node.test_mapping?.file,
          testName,
        });
      }

      if (node.children) evaluate(node.children);

      // Re-evaluate branch nodes after children
      if (status === 'PENDING') {
        const childResults = (node.children || [])
          .filter(c => filteredIds.has(c.id))
          .map(c => results.get(c.id))
          .filter(Boolean);

        const blockingChildren = (node.children || [])
          .filter(c => filteredIds.has(c.id) && c.gate === 'blocking')
          .map(c => results.get(c.id))
          .filter(Boolean);

        const allBlockingPass = blockingChildren.every(r => r.status === 'PASS');
        const anyChildFail = childResults.some(r => r.status === 'FAIL');

        if (allBlockingPass && !anyChildFail) {
          status = 'PASS';
        } else {
          status = node.gate === 'blocking' ? 'FAIL' : 'WARNING';
        }

        results.set(node.id, {
          status,
          reason: `Branch: ${childResults.length} children evaluated`,
          evidence: [],
        });
      }
    }
  }

  evaluate(nodes);
  return results;
}

function getNodeGate(node, allNodes) {
  if (node.gate) return node.gate;
  // Find parent's gate definition for this child
  const flat = flattenTree(allNodes);
  const found = flat.find(n => n.id === node.id);
  return found?.gate || 'observation';
}

function getNodeName(id, allNodes) {
  const flat = flattenTree(allNodes);
  const found = flat.find(n => n.id === id);
  return found?.name || id;
}

// ─── Report generation ───

const STATUS_ICONS = {
  PASS: '✅',
  FAIL: '❌',
  SKIP: '⏭️',
  WARNING: '⚠️',
};

function generateReport(tree, results, meta, tier, flatNodes) {
  const lines = [];
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  lines.push('# Verification Tree Report');
  lines.push('');
  lines.push(`**Project**: ${meta.project} v${meta.version}`);
  lines.push(`**Tier**: ${tier}`);
  lines.push(`**Generated**: ${now}`);
  lines.push('');

  // Summary counts
  const counts = { PASS: 0, FAIL: 0, SKIP: 0, WARNING: 0 };
  for (const [, r] of results) counts[r.status] = (counts[r.status] || 0) + 1;

  const blockingFails = [];
  for (const node of flatNodes) {
    const r = results.get(node.id);
    if (r && r.status === 'FAIL' && node.gate === 'blocking') {
      blockingFails.push(node);
    }
  }

  const overall = blockingFails.length === 0 ? 'PASS' : 'FAIL';
  lines.push(`## Result: ${STATUS_ICONS[overall]} ${overall}`);
  lines.push('');
  lines.push(`| Status | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| ${STATUS_ICONS.PASS} PASS | ${counts.PASS} |`);
  lines.push(`| ${STATUS_ICONS.FAIL} FAIL | ${counts.FAIL} |`);
  lines.push(`| ${STATUS_ICONS.WARNING} WARNING | ${counts.WARNING} |`);
  lines.push(`| ${STATUS_ICONS.SKIP} SKIP | ${counts.SKIP} |`);
  lines.push(`| **Total** | ${counts.PASS + counts.FAIL + counts.WARNING + counts.SKIP} |`);
  lines.push('');

  // Tree visualization
  lines.push('## Tree');
  lines.push('');
  lines.push('```');

  function renderTree(nodes, indent = 0) {
    for (const node of nodes) {
      const r = results.get(node.id);
      if (!r) continue;
      const icon = STATUS_ICONS[r.status] || '?';
      const prefix = '  '.repeat(indent);
      const gate = node.gate === 'blocking' ? '[B]' : '[O]';
      lines.push(`${prefix}${icon} ${node.id}. ${node.name} ${gate}`);
      if (node.children) renderTree(node.children, indent + 1);
    }
  }
  renderTree(tree);
  lines.push('```');
  lines.push('');

  // Evidence per node
  lines.push('## Evidence');
  lines.push('');
  for (const node of flatNodes) {
    const r = results.get(node.id);
    if (!r) continue;
    lines.push(`### ${node.id}. ${node.name}`);
    lines.push('');
    lines.push(`- **Status**: ${STATUS_ICONS[r.status]} ${r.status}`);
    lines.push(`- **Gate**: ${node.gate}`);
    if (r.reason) lines.push(`- **Reason**: ${r.reason}`);
    if (r.testFile) lines.push(`- **Test file**: ${r.testFile}`);
    if (r.testName) lines.push(`- **Test name**: ${r.testName}`);
    if (r.evidence && r.evidence.length > 0) {
      lines.push(`- **Evidence types**: ${r.evidence.join(', ')}`);
    }
    lines.push('');
  }

  // Failure category breakdown
  lines.push('## Failure Category Breakdown');
  lines.push('');
  const catCounts = {};
  for (const node of flatNodes) {
    const r = results.get(node.id);
    if (r && (r.status === 'FAIL' || r.status === 'WARNING') && node.failure_category) {
      if (!catCounts[node.failure_category]) catCounts[node.failure_category] = [];
      catCounts[node.failure_category].push(`${node.id} (${node.name})`);
    }
  }
  if (Object.keys(catCounts).length === 0) {
    lines.push('No failures detected.');
  } else {
    lines.push('| Category | Nodes |');
    lines.push('|----------|-------|');
    for (const [cat, nodes] of Object.entries(catCounts)) {
      lines.push(`| ${cat} | ${nodes.join(', ')} |`);
    }
  }
  lines.push('');

  // Coverage stats
  const totalNodes = flatNodes.length;
  const withTests = flatNodes.filter(n => n.test_mapping?.test_name).length;
  const covered = flatNodes.filter(n => {
    const r = results.get(n.id);
    return r && (r.status === 'PASS' || r.status === 'FAIL' || r.status === 'WARNING');
  }).length;

  lines.push('## Coverage');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total nodes in tier | ${totalNodes} |`);
  lines.push(`| Nodes with test mapping | ${withTests} |`);
  lines.push(`| Nodes evaluated | ${covered} |`);
  lines.push(`| Coverage | ${totalNodes > 0 ? Math.round((covered / totalNodes) * 100) : 0}% |`);
  lines.push('');

  // Retry suggestions
  if (blockingFails.length > 0) {
    lines.push('## Retry Suggestions');
    lines.push('');
    for (const node of blockingFails) {
      const retry = node.retry || {};
      lines.push(`### ${node.id}. ${node.name}`);
      lines.push('');
      lines.push(`- **Re-entry node**: ${retry.re_entry || node.id}`);
      lines.push(`- **Auto retry**: ${retry.auto ? 'yes' : 'no'}`);
      if (retry.manual_step) {
        lines.push(`- **Manual step**: ${retry.manual_step}`);
      }
      lines.push(`- **Failure category**: ${node.failure_category}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Main ───

function main() {
  const args = process.argv.slice(2);
  let tier = 'critical_path';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tier' && args[i + 1]) {
      tier = args[i + 1];
      i++;
    }
  }

  const validTiers = ['smoke', 'critical_path', 'full_acceptance'];
  if (!validTiers.includes(tier)) {
    console.error(`Invalid tier: ${tier}. Must be one of: ${validTiers.join(', ')}`);
    process.exit(1);
  }

  // Load YAML
  const yamlPath = path.resolve(__dirname, '..', 'docs', 'verification-tree.yaml');
  if (!fs.existsSync(yamlPath)) {
    console.error(`Verification tree not found: ${yamlPath}`);
    process.exit(1);
  }

  const yamlText = fs.readFileSync(yamlPath, 'utf-8');
  const config = parseYaml(yamlText);

  if (!config || !config.nodes) {
    console.error('Failed to parse verification-tree.yaml or no nodes found.');
    process.exit(1);
  }

  const meta = config.meta;
  const tree = config.nodes;
  const flatNodes = flattenTree(tree);
  const tierIds = getNodeIdsForTier(meta, tier);

  console.log(`\n📋 Verification Tree Runner`);
  console.log(`   Project: ${meta.project} v${meta.version}`);
  console.log(`   Tier: ${tier}`);
  console.log(`   Nodes: ${tierIds ? tierIds.size : flatNodes.length}`);

  // Run Playwright
  const { output: pwOutput, exitCode: pwExit } = runPlaywrightSuite();
  console.log(`\n📊 Playwright exit code: ${pwExit}`);

  // Parse results
  const testResults = parsePlaywrightOutput(pwOutput);
  console.log(`   Tests parsed: ${testResults.size}`);

  // Evaluate tree
  const results = evaluateTree(tree, testResults, tierIds);

  // Generate report
  const report = generateReport(tree, results, meta, tier, flatNodes.filter(n => {
    if (!tierIds) return true;
    return tierIds.has(n.id) || results.has(n.id);
  }));

  const reportPath = path.resolve(__dirname, '..', 'docs', 'verification-report.md');
  fs.writeFileSync(reportPath, report, 'utf-8');
  console.log(`\n📝 Report written to: ${reportPath}`);

  // Print summary
  const blockingFails = flatNodes.filter(n => {
    const r = results.get(n.id);
    return r && r.status === 'FAIL' && n.gate === 'blocking';
  });

  if (blockingFails.length > 0) {
    console.log(`\n❌ ${blockingFails.length} blocking node(s) failed:`);
    for (const node of blockingFails) {
      console.log(`   - ${node.id}. ${node.name} [${node.failure_category}]`);
    }
    process.exit(1);
  } else {
    console.log('\n✅ All blocking nodes passed.');
    process.exit(0);
  }
}

main();
