#!/usr/bin/env bash
# Wrapper for `yarn dev` that tees all output to a timestamped log file in tmp/
# Usage: bash scripts/dev-log.sh   (or via `yarn dev:log`)

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$SCRIPT_DIR/tmp"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/dev_${TIMESTAMP}.log"

echo "=== Dev session started at $(date) ===" > "$LOG_FILE"
echo "Log file: $LOG_FILE"

# Run electron with IS_BUILD=false, tee stdout+stderr to log file
IS_BUILD=false npx electron . 2>&1 | tee -a "$LOG_FILE"

echo "=== Dev session ended at $(date) ===" >> "$LOG_FILE"
