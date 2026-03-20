#!/usr/bin/env node

/**
 * Verification Tree Generator
 *
 * Scans a project directory for test files, extracts test names,
 * and generates a skeleton verification-tree.yaml.
 *
 * Usage:
 *   node scripts/generate-tree.js [project-dir] [--output file.yaml]
 *
 * If project-dir is omitted, uses the current working directory.
 * If --output is omitted, prints to stdout.
 */

const fs = require('fs');
const path = require('path');

// ─── File discovery ───

/**
 * Recursively find test files matching patterns.
 */
function findTestFiles(dir, patterns = ['.spec.js', '.test.js', '.spec.ts', '.test.ts']) {
  const results = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Skip common non-test directories
        if (['node_modules', '.git', 'dist', 'build', 'coverage', '.cache'].includes(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (patterns.some(p => entry.name.endsWith(p))) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results.sort();
}

// ─── Test name extraction ───

/**
 * Extract test names and describe blocks from a test file.
 * Supports: test('...'), it('...'), test.describe('...'), describe('...')
 */
function extractTests(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const tests = [];
  const describes = [];

  // Match test/it calls: test('name'  or  it('name'  or  test("name"  etc.
  const testRegex = /(?:test|it)\s*\(\s*(['"`])(.+?)\1/g;
  let match;
  while ((match = testRegex.exec(content)) !== null) {
    tests.push(match[2]);
  }

  // Match describe blocks: describe('name'  or  test.describe('name'
  const describeRegex = /(?:test\.)?describe\s*\(\s*(['"`])(.+?)\1/g;
  while ((match = describeRegex.exec(content)) !== null) {
    describes.push(match[2]);
  }

  return { tests, describes };
}

// ─── YAML generation ───

/**
 * Escape a YAML string value.
 */
function yamlStr(val) {
  if (val === null || val === undefined) return 'null';
  const s = String(val);
  // Quote if it contains special chars
  if (/[:#\[\]{},&*?|>!%@`'"]/.test(s) || s.includes('\n') || s.trim() !== s) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * Generate YAML for a single node.
 */
function nodeToYaml(node, indent = 4) {
  const pad = ' '.repeat(indent);
  const lines = [];
  lines.push(`${pad}- id: ${yamlStr(node.id)}`);
  lines.push(`${pad}  name: ${yamlStr(node.name)}`);
  lines.push(`${pad}  gate: observation`);
  lines.push(`${pad}  evidence: [api_response]`);
  lines.push(`${pad}  failure_category: verification`);
  lines.push(`${pad}  pass_criteria: ""`);
  lines.push(`${pad}  test_mapping:`);
  lines.push(`${pad}    file: ${yamlStr(node.testFile)}`);
  lines.push(`${pad}    test_name: ${yamlStr(node.testName)}`);
  lines.push(`${pad}  retry:`);
  lines.push(`${pad}    re_entry: ${yamlStr(node.id)}`);
  lines.push(`${pad}    auto: true`);
  lines.push(`${pad}    manual_step: null`);

  if (node.children && node.children.length > 0) {
    lines.push(`${pad}  children:`);
    for (const child of node.children) {
      lines.push(nodeToYaml(child, indent + 4));
    }
  }

  return lines.join('\n');
}

/**
 * Build tree structure from discovered tests.
 * Groups tests by file, with describe blocks as intermediate nodes.
 */
function buildTree(projectDir, testFiles) {
  const nodes = [];
  let idCounter = 1;

  for (const filePath of testFiles) {
    const relPath = path.relative(projectDir, filePath).replace(/\\/g, '/');
    const { tests, describes } = extractTests(filePath);

    if (tests.length === 0 && describes.length === 0) continue;

    const fileNode = {
      id: String(idCounter++),
      name: path.basename(filePath, path.extname(filePath)).replace(/\.(spec|test)$/, ''),
      testFile: relPath,
      testName: null,
      children: [],
    };

    // If there are describe blocks, group tests under them
    if (describes.length > 0) {
      for (const desc of describes) {
        const descNode = {
          id: `${fileNode.id}.${fileNode.children.length + 1}`,
          name: desc,
          testFile: relPath,
          testName: desc,
          children: [],
        };

        // Find tests that likely belong to this describe
        // (simple heuristic: tests listed after the describe in the file)
        for (const test of tests) {
          descNode.children.push({
            id: `${descNode.id}.${descNode.children.length + 1}`,
            name: test,
            testFile: relPath,
            testName: test,
            children: [],
          });
        }

        fileNode.children.push(descNode);
      }

      // If we grouped all tests under describes, clear tests from file level
      // But if there are tests not in any describe, add them at file level
      if (fileNode.children.length === 0) {
        for (const test of tests) {
          fileNode.children.push({
            id: `${fileNode.id}.${fileNode.children.length + 1}`,
            name: test,
            testFile: relPath,
            testName: test,
            children: [],
          });
        }
      }
    } else {
      // No describes — all tests are direct children
      for (const test of tests) {
        fileNode.children.push({
          id: `${fileNode.id}.${fileNode.children.length + 1}`,
          name: test,
          testFile: relPath,
          testName: test,
          children: [],
        });
      }
    }

    nodes.push(fileNode);
  }

  return nodes;
}

/**
 * Generate the full YAML document.
 */
function generateYaml(projectDir, nodes) {
  const projectName = path.basename(projectDir);

  const lines = [];
  lines.push('# Auto-generated Verification Tree');
  lines.push(`# Generated from: ${projectDir}`);
  lines.push(`# Date: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('# Fill in pass_criteria, adjust gates, and set failure categories manually.');
  lines.push('');
  lines.push('meta:');
  lines.push(`  project: ${yamlStr(projectName)}`);
  lines.push('  version: v0.0.0');
  lines.push('  failure_categories:');
  lines.push('    environment: "Service not running, port conflict, dependency missing"');
  lines.push('    build: "Build error, compilation failure"');
  lines.push('    data_propagation: "State not synced between layers"');
  lines.push('    extraction: "Parsing failure, scraper error"');
  lines.push('    verification: "Assertion wrong, test logic error"');
  lines.push('    ux_state_sync: "UI shows stale data"');
  lines.push('  tiers:');

  // Smoke: first few top-level nodes
  const smokeIds = nodes.slice(0, Math.min(3, nodes.length)).map(n => `"${n.id}"`);
  lines.push(`    smoke: [${smokeIds.join(', ')}]`);

  // Critical path: all top-level nodes
  const criticalIds = nodes.map(n => `"${n.id}"`);
  lines.push(`    critical_path: [${criticalIds.join(', ')}]`);

  lines.push('    full_acceptance: all');
  lines.push('');
  lines.push('nodes:');

  for (const node of nodes) {
    lines.push(nodeToYaml(node, 2));
  }

  return lines.join('\n') + '\n';
}

// ─── Main ───

function main() {
  const args = process.argv.slice(2);
  let projectDir = process.cwd();
  let outputFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputFile = args[i + 1];
      i++;
    } else if (!args[i].startsWith('-')) {
      projectDir = path.resolve(args[i]);
    }
  }

  if (!fs.existsSync(projectDir)) {
    console.error(`Directory not found: ${projectDir}`);
    process.exit(1);
  }

  console.error(`Scanning for test files in: ${projectDir}`);

  const testFiles = findTestFiles(projectDir);
  console.error(`Found ${testFiles.length} test file(s):`);
  for (const f of testFiles) {
    console.error(`  - ${path.relative(projectDir, f)}`);
  }

  if (testFiles.length === 0) {
    console.error('No test files found. Nothing to generate.');
    process.exit(0);
  }

  const nodes = buildTree(projectDir, testFiles);
  const yaml = generateYaml(projectDir, nodes);

  if (outputFile) {
    const outPath = path.resolve(outputFile);
    fs.writeFileSync(outPath, yaml, 'utf-8');
    console.error(`\nWritten to: ${outPath}`);
  } else {
    process.stdout.write(yaml);
  }
}

main();
