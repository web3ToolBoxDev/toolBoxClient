'use strict';

/**
 * Dev log interceptor — patches console.log/error/warn in the current process
 * to also append to a timestamped log file in tmp/.
 *
 * Usage: require at the very top of a process entry point, or set
 *        env var DEV_LOG=1 and require from electron.js / server.js.
 */
const fs = require('fs');
const path = require('path');
const util = require('util');

const rootDir = path.join(__dirname, '..');
const logDir = path.join(rootDir, 'tmp');
fs.mkdirSync(logDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logFile = path.join(logDir, `dev_${ts}.log`);
const stream = fs.createWriteStream(logFile, { flags: 'a' });

stream.write(`=== Dev session started at ${new Date().toISOString()} ===\n`);

const _origLog = console.log;
const _origError = console.error;
const _origWarn = console.warn;

function write(prefix, args) {
    const line = `${new Date().toISOString()} ${prefix} ${util.format(...args)}\n`;
    stream.write(line);
}

console.log = function (...args) {
    write('[LOG]', args);
    _origLog.apply(console, args);
};

console.error = function (...args) {
    write('[ERR]', args);
    _origError.apply(console, args);
};

console.warn = function (...args) {
    write('[WRN]', args);
    _origWarn.apply(console, args);
};

_origLog(`[dev-log] writing to ${logFile}`);

module.exports = { logFile, stream };
