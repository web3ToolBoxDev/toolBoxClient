'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const logDir = path.join(rootDir, 'tmp');
fs.mkdirSync(logDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logFile = path.join(logDir, `dev_${ts}.log`);
const stream = fs.createWriteStream(logFile, { flags: 'a' });

stream.write(`=== Dev session started at ${new Date().toISOString()} ===\n`);
console.log(`Log file: ${logFile}`);

const child = spawn('npx', ['electron', '.'], {
    cwd: rootDir,
    env: { ...process.env, IS_BUILD: 'false' },
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true
});

child.stdout.on('data', (data) => {
    process.stdout.write(data);
    stream.write(data);
});

child.stderr.on('data', (data) => {
    process.stderr.write(data);
    stream.write(data);
});

child.on('close', (code) => {
    stream.write(`\n=== Dev session ended at ${new Date().toISOString()} (exit ${code}) ===\n`);
    stream.end();
    process.exit(code || 0);
});
