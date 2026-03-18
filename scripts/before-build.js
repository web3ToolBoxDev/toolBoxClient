/**
 * electron-builder beforeBuild hook
 * Prunes devDependencies from dbservice/node_modules before packaging.
 * This reduces the dbservice directory from ~758MB to ~50MB in the installer.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async function (context) {
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
