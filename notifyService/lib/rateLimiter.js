'use strict';

/**
 * Token bucket rate limiter — per channel instance.
 * Default: 20 messages per 60 seconds.
 */

const _buckets = new Map(); // channelId → { tokens, lastRefill }

const DEFAULT_MAX_TOKENS = 20;
const DEFAULT_REFILL_MS = 60_000; // 1 minute

let _maxTokens = DEFAULT_MAX_TOKENS;
let _refillMs = DEFAULT_REFILL_MS;

function configure({ maxTokens, refillMs } = {}) {
    if (maxTokens) _maxTokens = maxTokens;
    if (refillMs) _refillMs = refillMs;
}

function _getBucket(channelId) {
    if (!_buckets.has(channelId)) {
        _buckets.set(channelId, { tokens: _maxTokens, lastRefill: Date.now() });
    }
    const bucket = _buckets.get(channelId);

    // Refill tokens
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= _refillMs) {
        const refills = Math.floor(elapsed / _refillMs);
        bucket.tokens = Math.min(_maxTokens, bucket.tokens + refills * _maxTokens);
        bucket.lastRefill += refills * _refillMs;
    }
    return bucket;
}

/**
 * Check if a message can be sent (and consume a token if yes).
 */
function allow(channelId) {
    const bucket = _getBucket(channelId);
    if (bucket.tokens > 0) {
        bucket.tokens--;
        return true;
    }
    return false;
}

/**
 * Get remaining tokens for a channel.
 */
function remaining(channelId) {
    return _getBucket(channelId).tokens;
}

/**
 * Reset all buckets (for testing).
 */
function reset() {
    _buckets.clear();
    _maxTokens = DEFAULT_MAX_TOKENS;
    _refillMs = DEFAULT_REFILL_MS;
}

module.exports = { configure, allow, remaining, reset };
