'use strict';

/**
 * Story 8.1: Context Assembly Strategy
 *
 * Per-task-type policy that determines which memory classes go into AI prompts.
 * Token budget allocation with priority ordering.
 * Staleness weighting for relevance ranking.
 */

const knowledgeStore = require('./knowledgeStore');

// ─── Priority Classes ───
// Higher priority = included first when token budget is limited
const PRIORITY_CLASSES = {
    identity:    { priority: 100, tokenBudgetPct: 0.15, description: 'Core user identity' },
    goal:        { priority: 90,  tokenBudgetPct: 0.10, description: 'Current active goals' },
    direction:   { priority: 85,  tokenBudgetPct: 0.10, description: 'Job/project direction' },
    profile:     { priority: 80,  tokenBudgetPct: 0.20, description: 'User profile data' },
    preference:  { priority: 70,  tokenBudgetPct: 0.05, description: 'User preferences' },
    constraint:  { priority: 65,  tokenBudgetPct: 0.05, description: 'Rules and limits' },
    knowledge:   { priority: 60,  tokenBudgetPct: 0.15, description: 'Learned facts' },
    job_listing: { priority: 50,  tokenBudgetPct: 0.10, description: 'Job listings' },
    match_result:{ priority: 45,  tokenBudgetPct: 0.05, description: 'Match results' },
    task_state:  { priority: 40,  tokenBudgetPct: 0.03, description: 'Task state' },
    decision:    { priority: 30,  tokenBudgetPct: 0.02, description: 'Past decisions' },
    ephemeral:   { priority: 10,  tokenBudgetPct: 0.00, description: 'Temporary context' }
};

// ─── Task-Type Policies ───
// Define which memory types to include for each task type
const TASK_POLICIES = {
    'job-search': {
        include: ['identity', 'profile', 'direction', 'preference', 'job_listing', 'match_result'],
        maxDocs: 20,
        maxTokens: 4000
    },
    'resume-gen': {
        include: ['identity', 'profile', 'direction', 'job_listing', 'match_result'],
        maxDocs: 15,
        maxTokens: 3000
    },
    'interview-prep': {
        include: ['identity', 'profile', 'job_listing', 'match_result', 'knowledge'],
        maxDocs: 15,
        maxTokens: 3000
    },
    'general': {
        include: ['identity', 'profile', 'direction', 'preference', 'goal', 'constraint', 'knowledge'],
        maxDocs: 25,
        maxTokens: 5000
    },
    'onboarding': {
        include: ['identity', 'profile', 'preference'],
        maxDocs: 10,
        maxTokens: 2000
    }
};

/**
 * Estimate token count for a document (rough: ~4 chars per token).
 * @param {object} doc
 * @returns {number}
 */
function estimateTokens(doc) {
    const text = typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content || '');
    const summary = doc.summary || '';
    return Math.ceil((text.length + summary.length) / 4);
}

/**
 * Calculate staleness weight (0-1, 1 = fresh, 0 = very stale).
 * @param {object} doc
 * @param {number} [now]
 * @returns {number}
 */
function stalenessWeight(doc, now) {
    const n = now || Date.now();
    const age = n - (doc.updatedAt || doc.createdAt || n);
    const ageDays = age / (24 * 60 * 60 * 1000);

    // Exponential decay: fresh docs score 1.0, 30-day old docs score ~0.5, 90-day old docs score ~0.1
    return Math.max(0.05, Math.exp(-ageDays / 45));
}

/**
 * Calculate write-class weight.
 * explicit > inferred > candidate > transient
 */
function writeClassWeight(doc) {
    const weights = { explicit: 1.0, inferred: 0.7, candidate: 0.4, transient: 0.1 };
    return weights[doc.writeClass] || 0.5;
}

/**
 * Score a document for context relevance.
 * @param {object} doc
 * @param {number} [now]
 * @returns {number}
 */
function scoreDoc(doc, now) {
    const typeConfig = PRIORITY_CLASSES[doc.type] || { priority: 20 };
    const priority = typeConfig.priority / 100;
    const freshness = stalenessWeight(doc, now);
    const wcWeight = writeClassWeight(doc);
    const confidence = doc.confidence ?? 1.0;

    // Weighted score: priority 40% + freshness 30% + writeClass 15% + confidence 15%
    return priority * 0.4 + freshness * 0.3 + wcWeight * 0.15 + confidence * 0.15;
}

/**
 * Assemble context documents for a given task type.
 * @param {string} taskType - Task type key (e.g., 'job-search', 'general')
 * @param {object} [options]
 * @param {string} [options.scope] - Scope filter
 * @param {number} [options.maxTokens] - Override max tokens
 * @param {number} [options.maxDocs] - Override max docs
 * @returns {Array<{doc: object, score: number, tokens: number}>}
 */
function assembleContext(taskType, options = {}) {
    const policy = TASK_POLICIES[taskType] || TASK_POLICIES['general'];
    const maxTokens = options.maxTokens || policy.maxTokens;
    const maxDocs = options.maxDocs || policy.maxDocs;
    const now = Date.now();

    // Fetch all relevant docs by type
    const candidates = [];
    for (const type of policy.include) {
        const docs = knowledgeStore.findByType(type);
        for (const doc of docs) {
            if (options.scope && doc.scope !== options.scope && doc.scope !== 'user:global' && doc.scope !== 'global') {
                continue;
            }
            const score = scoreDoc(doc, now);
            const tokens = estimateTokens(doc);
            candidates.push({ doc, score, tokens });
        }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Apply token budget
    const selected = [];
    let usedTokens = 0;

    for (const candidate of candidates) {
        if (selected.length >= maxDocs) break;
        if (usedTokens + candidate.tokens > maxTokens) continue;
        selected.push(candidate);
        usedTokens += candidate.tokens;
    }

    return selected;
}

/**
 * Get policy for a task type.
 */
function getPolicy(taskType) {
    return TASK_POLICIES[taskType] || TASK_POLICIES['general'];
}

/**
 * Register a custom task policy.
 */
function registerPolicy(taskType, policy) {
    TASK_POLICIES[taskType] = policy;
}

/**
 * Get priority config for a type.
 */
function getPriorityClass(type) {
    return PRIORITY_CLASSES[type] || null;
}

module.exports = {
    assembleContext,
    scoreDoc,
    estimateTokens,
    stalenessWeight,
    writeClassWeight,
    getPolicy,
    registerPolicy,
    getPriorityClass,
    PRIORITY_CLASSES,
    TASK_POLICIES
};
