'use strict';

/**
 * Story 8.2: Relationship Table + Event Modeling
 *
 * Separate memory_relations table for structured relationships between documents.
 * Event log for append-only state transitions and decisions.
 */

let _db = null;

/**
 * Initialize with a database reference.
 * @param {object} db - sql.js Database instance
 */
function init(db) {
    _db = db;

    _db.run(`
        CREATE TABLE IF NOT EXISTS memory_relations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            fromRefId   TEXT NOT NULL,
            relation    TEXT NOT NULL,
            toRefId     TEXT NOT NULL,
            metadata    TEXT DEFAULT '{}',
            createdAt   INTEGER NOT NULL
        )
    `);

    _db.run(`
        CREATE TABLE IF NOT EXISTS memory_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            refId       TEXT DEFAULT '',
            eventType   TEXT NOT NULL,
            actorId     TEXT DEFAULT '',
            detail      TEXT DEFAULT '',
            metadata    TEXT DEFAULT '{}',
            createdAt   INTEGER NOT NULL
        )
    `);

    // Indexes
    try {
        _db.run('CREATE INDEX IF NOT EXISTS idx_rel_from ON memory_relations(fromRefId)');
        _db.run('CREATE INDEX IF NOT EXISTS idx_rel_to ON memory_relations(toRefId)');
        _db.run('CREATE INDEX IF NOT EXISTS idx_rel_relation ON memory_relations(relation)');
        _db.run('CREATE INDEX IF NOT EXISTS idx_events_refid ON memory_events(refId)');
        _db.run('CREATE INDEX IF NOT EXISTS idx_events_type ON memory_events(eventType)');
        _db.run('CREATE INDEX IF NOT EXISTS idx_events_actor ON memory_events(actorId)');
    } catch { /* indexes may already exist */ }
}

// ─── Relations ───

/**
 * Add a relationship between two documents.
 * @param {string} fromRefId
 * @param {string} relation - e.g., 'HAS_SKILL', 'REQUIRES_SKILL', 'APPLIED_TO'
 * @param {string} toRefId
 * @param {object} [metadata] - Optional metadata
 * @returns {number} Relation ID
 */
function addRelation(fromRefId, relation, toRefId, metadata = {}) {
    if (!_db) throw new Error('memoryRelations not initialized');
    if (!fromRefId || !relation || !toRefId) throw new Error('fromRefId, relation, and toRefId are required');

    // Dedup: don't add identical relation
    const existing = _queryAll(
        'SELECT id FROM memory_relations WHERE fromRefId = ? AND relation = ? AND toRefId = ?',
        [fromRefId, relation, toRefId]
    );
    if (existing.length > 0) return existing[0].id;

    const now = Date.now();
    _db.run(
        'INSERT INTO memory_relations (fromRefId, relation, toRefId, metadata, createdAt) VALUES (?,?,?,?,?)',
        [fromRefId, relation, toRefId, JSON.stringify(metadata), now]
    );
    return _db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
}

/**
 * Find relations from a document.
 * @param {string} fromRefId
 * @param {string} [relation] - Optional filter by relation type
 * @returns {Array<{id, fromRefId, relation, toRefId, metadata, createdAt}>}
 */
function findRelationsFrom(fromRefId, relation) {
    if (!_db) return [];
    if (relation) {
        return _queryAll(
            'SELECT * FROM memory_relations WHERE fromRefId = ? AND relation = ? ORDER BY createdAt DESC',
            [fromRefId, relation]
        );
    }
    return _queryAll(
        'SELECT * FROM memory_relations WHERE fromRefId = ? ORDER BY createdAt DESC',
        [fromRefId]
    );
}

/**
 * Find relations to a document.
 * @param {string} toRefId
 * @param {string} [relation] - Optional filter by relation type
 * @returns {Array}
 */
function findRelationsTo(toRefId, relation) {
    if (!_db) return [];
    if (relation) {
        return _queryAll(
            'SELECT * FROM memory_relations WHERE toRefId = ? AND relation = ? ORDER BY createdAt DESC',
            [toRefId, relation]
        );
    }
    return _queryAll(
        'SELECT * FROM memory_relations WHERE toRefId = ? ORDER BY createdAt DESC',
        [toRefId]
    );
}

/**
 * Find all relations of a given type.
 * @param {string} relation
 * @returns {Array}
 */
function findByRelation(relation) {
    if (!_db) return [];
    return _queryAll(
        'SELECT * FROM memory_relations WHERE relation = ? ORDER BY createdAt DESC',
        [relation]
    );
}

/**
 * Remove a relation by ID.
 */
function removeRelation(id) {
    if (!_db) return false;
    _db.run('DELETE FROM memory_relations WHERE id = ?', [id]);
    return true;
}

/**
 * Remove all relations involving a refId (from or to).
 */
function removeRelationsFor(refId) {
    if (!_db) return 0;
    const before = _queryAll(
        'SELECT id FROM memory_relations WHERE fromRefId = ? OR toRefId = ?',
        [refId, refId]
    );
    _db.run('DELETE FROM memory_relations WHERE fromRefId = ? OR toRefId = ?', [refId, refId]);
    return before.length;
}

// ─── Events ───

/**
 * Log an event.
 * @param {string} eventType - e.g., 'profile_updated', 'job_applied', 'status_changed'
 * @param {object} [options]
 * @param {string} [options.refId] - Related document
 * @param {string} [options.actorId] - Who/what performed the action
 * @param {string} [options.detail] - Human-readable detail
 * @param {object} [options.metadata] - Structured metadata
 * @returns {number} Event ID
 */
function logEvent(eventType, options = {}) {
    if (!_db) throw new Error('memoryRelations not initialized');
    if (!eventType) throw new Error('eventType is required');

    const now = Date.now();
    _db.run(
        'INSERT INTO memory_events (refId, eventType, actorId, detail, metadata, createdAt) VALUES (?,?,?,?,?,?)',
        [
            options.refId || '',
            eventType,
            options.actorId || '',
            options.detail || '',
            JSON.stringify(options.metadata || {}),
            now
        ]
    );
    return _db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
}

/**
 * Get events for a document.
 */
function getEvents(refId, limit = 50) {
    if (!_db) return [];
    return _queryAll(
        'SELECT * FROM memory_events WHERE refId = ? ORDER BY createdAt DESC LIMIT ?',
        [refId, limit]
    );
}

/**
 * Get events by type.
 */
function getEventsByType(eventType, limit = 50) {
    if (!_db) return [];
    return _queryAll(
        'SELECT * FROM memory_events WHERE eventType = ? ORDER BY createdAt DESC LIMIT ?',
        [eventType, limit]
    );
}

/**
 * Get events by actor.
 */
function getEventsByActor(actorId, limit = 50) {
    if (!_db) return [];
    return _queryAll(
        'SELECT * FROM memory_events WHERE actorId = ? ORDER BY createdAt DESC LIMIT ?',
        [actorId, limit]
    );
}

// ─── Helpers ───

function _queryAll(sql, params = []) {
    if (!_db) return [];
    const stmt = _db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        if (row.metadata) {
            try { row.metadata = JSON.parse(row.metadata); } catch { row.metadata = {}; }
        }
        results.push(row);
    }
    stmt.free();
    return results;
}

module.exports = {
    init,
    addRelation,
    findRelationsFrom,
    findRelationsTo,
    findByRelation,
    removeRelation,
    removeRelationsFor,
    logEvent,
    getEvents,
    getEventsByType,
    getEventsByActor
};
