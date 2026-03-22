/**
 * electron-builder beforeBuild hook
 * 1. Ensures agent node_modules are installed (e.g. job-seek/node_modules/docx).
 * 2. Prunes devDependencies from dbservice/node_modules before packaging.
 *    This reduces the dbservice directory from ~758MB to ~50MB in the installer.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async function (context) {
  // ─── Step 1: Install agent dependencies ───
  const agentsDir = path.join(context.appDir, 'assets', 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const agentName of fs.readdirSync(agentsDir)) {
      const agentPkg = path.join(agentsDir, agentName, 'package.json');
      if (!fs.existsSync(agentPkg)) continue;
      const agentPath = path.join(agentsDir, agentName);
      console.log(`[before-build] Installing dependencies for agent: ${agentName}`);
      try {
        execSync('npm install --production --legacy-peer-deps', {
          cwd: agentPath,
          stdio: 'inherit',
          env: { ...process.env, NODE_ENV: 'production' }
        });
        console.log(`[before-build] Agent ${agentName} dependencies installed`);
      } catch (err) {
        console.error(`[before-build] Failed to install ${agentName} dependencies:`, err.message);
        // Don't fail the build — agent will warn at runtime
      }
    }
  }

  // ─── Step 2: Prune dbservice devDependencies ───
  const dbservicePath = path.join(context.appDir, 'dbservice');

  if (!fs.existsSync(path.join(dbservicePath, 'node_modules'))) {
    console.log('[before-build] dbservice/node_modules not found, skipping prune');
    return;
  }

  console.log('[before-build] Pruning dbservice devDependencies...');

  try {
    // Use npm prune --production to remove devDependencies
    // This keeps only packages listed in "dependencies" in dbservice/package.json
    execSync('npm prune --omit=dev', {
      cwd: dbservicePath,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    });
    console.log('[before-build] dbservice devDependencies pruned successfully');
  } catch (err) {
    console.error('[before-build] Failed to prune dbservice:', err.message);
    // Don't fail the build — the installer will just be larger
  }
};
