'use strict';

/**
 * Memory Schema Registry — Generic type taxonomy, conflict policies, validation.
 * Core types are agent-agnostic. Domain packs register additional types.
 */

// ==================== Conflict Policy Implementations ====================

function _dedupMerge(oldContent, newContent) {
    const oldItems = oldContent.split(',').map(s => s.trim()).filter(Boolean);
    const newItems = newContent.split(',').map(s => s.trim()).filter(Boolean);
    return [...new Set([...oldItems, ...newItems])].join(', ');
}

const CONFLICT_POLICIES = {
    replace: (_old, new_) => new_,
    append: (old, new_) => old ? `${old}\n${new_}` : new_,
    append_set: (old, new_) => _dedupMerge(old, new_),
    temporal_replace: (old, new_, oldDoc, newDoc) =>
        (newDoc.updatedAt || 0) >= (oldDoc.updatedAt || 0) ? new_ : old,
    merge_object: (old, new_) => {
        try {
            const a = typeof old === 'string' ? JSON.parse(old) : old;
            const b = typeof new_ === 'string' ? JSON.parse(new_) : new_;
            return JSON.stringify({ ...a, ...b });
        } catch {
            return new_;
        }
    }
};

// ==================== Type Registry ====================

const _typeRegistry = {};

/**
 * Register memory types (called by core + domain packs).
 * @param {Object<string, {durability: string, conflictPolicy: string, description: string, subTypes?: string[]}>} types
 */
function registerTypes(types) {
    for (const [key, def] of Object.entries(types)) {
        _typeRegistry[key] = { ...def };
    }
}

// Core generic types — available to all agents
registerTypes({
    identity:    { durability: 'permanent', conflictPolicy: 'replace',      description: 'User identity facts', subTypes: ['name', 'email', 'phone', 'location'] },
    preference:  { durability: 'permanent', conflictPolicy: 'merge_object', description: 'User preferences', subTypes: [] },
    goal:        { durability: 'durable',   conflictPolicy: 'replace',      description: 'Current objectives', subTypes: [] },
    constraint:  { durability: 'durable',   conflictPolicy: 'append_set',   description: 'Rules and limitations', subTypes: [] },
    knowledge:   { durability: 'durable',   conflictPolicy: 'replace',      description: 'Learned facts', subTypes: [] },
    task_state:  { durability: 'session',   conflictPolicy: 'replace',      description: 'Running task state', subTypes: [] },
    decision:    { durability: 'permanent', conflictPolicy: 'append',       description: 'Decisions made', subTypes: [] },
    ephemeral:   { durability: 'session',   conflictPolicy: 'replace',      description: 'Temporary working context', subTypes: [] }
});

/**
 * Register a domain pack (e.g., job-seek, code-review).
 * @param {string} domain - Domain name
 * @param {Object} pack - { types: {...} }
 */
function registerDomainPack(domain, pack) {
    if (pack.types) {
        registerTypes(pack.types);
    }
}

// ==================== Validation ====================

const VALID_WRITE_CLASSES = new Set(['explicit', 'inferred', 'candidate', 'transient']);
const VALID_DURABILITIES = new Set(['permanent', 'durable', 'session', 'transient']);
const VALID_STATUSES = new Set(['active', 'candidate', 'superseded', 'deleted', 'expired']);

/**
 * Validate a document before write.
 * @param {object} doc
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateDoc(doc) {
    const errors = [];

    if (!doc.type) {
        errors.push('type is required');
    } else if (!_typeRegistry[doc.type]) {
        errors.push(`unknown type: ${doc.type}`);
    }

    if (!doc.content && doc.content !== '') {
        errors.push('content is required');
    }

    if (doc.type && _typeRegistry[doc.type] && doc.subType) {
        const typeDef = _typeRegistry[doc.type];
        if (typeDef.subTypes && typeDef.subTypes.length > 0 && !typeDef.subTypes.includes(doc.subType)) {
            errors.push(`invalid subType "${doc.subType}" for type "${doc.type}". Valid: ${typeDef.subTypes.join(', ')}`);
        }
    }

    if (doc.writeClass && !VALID_WRITE_CLASSES.has(doc.writeClass)) {
        errors.push(`invalid writeClass: ${doc.writeClass}. Valid: ${[...VALID_WRITE_CLASSES].join(', ')}`);
    }

    if (doc.confidence !== undefined && doc.confidence !== null) {
        if (typeof doc.confidence !== 'number' || doc.confidence < 0 || doc.confidence > 1) {
            errors.push('confidence must be a number between 0 and 1');
        }
    }

    return { valid: errors.length === 0, errors };
}

// ==================== Accessors ====================

function getTypeDef(type) {
    return _typeRegistry[type] || null;
}

function getConflictPolicy(type) {
    const def = _typeRegistry[type];
    if (!def) return 'replace';
    return def.conflictPolicy || 'replace';
}

function resolveConflict(policyName, oldContent, newContent, oldDoc, newDoc) {
    const fn = CONFLICT_POLICIES[policyName];
    if (!fn) return newContent;
    return fn(oldContent, newContent, oldDoc, newDoc);
}

function getAllTypes() {
    return { ..._typeRegistry };
}

module.exports = {
    registerTypes,
    registerDomainPack,
    validateDoc,
    getTypeDef,
    getConflictPolicy,
    resolveConflict,
    getAllTypes,
    CONFLICT_POLICIES,
    VALID_WRITE_CLASSES,
    VALID_DURABILITIES,
    VALID_STATUSES,
    // For testing: reset registry to core types only
    _resetRegistry: () => {
        for (const key of Object.keys(_typeRegistry)) delete _typeRegistry[key];
    }
};
