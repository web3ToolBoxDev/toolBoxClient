'use strict';

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { validateDoc, getConflictPolicy, resolveConflict } = require('./memorySchema');

let db = null;
let dbPath = '';
let sqlReady = null;

// ==================== Scope Hierarchy ====================

/**
 * Default scope resolution order (most specific → least specific).
 * Callers can customize the scopes array for findResolved().
 */
const SCOPE_HIERARCHY = ['session', 'task', 'agent', 'user', 'global'];

// ==================== Init ====================

/**
 * Initialize the SQLite database.
 * @param {string} savePath - Directory to store the .db file
 */
async function init(savePath) {
    if (db) return;
    if (sqlReady) return sqlReady;

    sqlReady = (async () => {
        const SQL = await initSqlJs();
        dbPath = path.join(savePath, 'knowledge.db');

        if (fs.existsSync(dbPath)) {
            const buffer = fs.readFileSync(dbPath);
            db = new SQL.Database(buffer);
        } else {
            db = new SQL.Database();
        }

        db.run(`
            CREATE TABLE IF NOT EXISTS documents (
                refId       TEXT PRIMARY KEY,
                type        TEXT NOT NULL,
                subType     TEXT DEFAULT '',
                scope       TEXT DEFAULT 'global',
                tags        TEXT DEFAULT '[]',
                content     TEXT NOT NULL,
                summary     TEXT DEFAULT '',
                source      TEXT DEFAULT '',
                confidence  REAL DEFAULT 1.0,
                version     INTEGER DEFAULT 1,
                current     INTEGER DEFAULT 1,
                supersedes  TEXT DEFAULT '',
                relations   TEXT DEFAULT '[]',
                ttl         INTEGER DEFAULT 0,
                createdAt   INTEGER NOT NULL,
                updatedAt   INTEGER NOT NULL
            )
        `);

        // FTS4 virtual table for full-text search
        db.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts4(
                refId, type, subType, tags, content, summary,
                tokenize=unicode61
            )
        `);

        // Schema migration: add new columns if they don't exist
        _migrateColumns();

        // Audit trail table
        db.run(`
            CREATE TABLE IF NOT EXISTS memory_audit (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                refId       TEXT NOT NULL,
                action      TEXT NOT NULL,
                oldVersion  INTEGER DEFAULT 0,
                newVersion  INTEGER DEFAULT 0,
                source      TEXT DEFAULT '',
                detail      TEXT DEFAULT '',
                createdAt   INTEGER NOT NULL
            )
        `);

        console.log(`[knowledgeStore] Initialized at ${dbPath}`);
        persist();
    })();

    return sqlReady;
}

/** Add columns that may not exist in older databases */
function _migrateColumns() {
    const migrations = [
        { col: 'validFrom',       sql: 'ALTER TABLE documents ADD COLUMN validFrom INTEGER DEFAULT 0' },
        { col: 'validUntil',      sql: 'ALTER TABLE documents ADD COLUMN validUntil INTEGER DEFAULT 0' },
        { col: 'lastConfirmedAt', sql: 'ALTER TABLE documents ADD COLUMN lastConfirmedAt INTEGER DEFAULT 0' },
        { col: 'writeClass',      sql: "ALTER TABLE documents ADD COLUMN writeClass TEXT DEFAULT 'explicit'" }
    ];
    for (const m of migrations) {
        try {
            db.run(m.sql);
        } catch (err) {
            // Column already exists — ignore
            if (!err.message.includes('duplicate column')) {
                console.error(`[knowledgeStore] migration warning (${m.col}):`, err.message);
            }
        }
    }
}

/** Save database to disk */
function persist() {
    if (!db || !dbPath) return;
    try {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const data = db.export();
        fs.writeFileSync(dbPath, Buffer.from(data));
    } catch (err) {
        console.error('[knowledgeStore] persist error:', err.message);
    }
}

/** Generate a unique refId */
function genRefId(prefix = 'doc') {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

// ==================== Audit ====================

function _audit(refId, action, oldVersion, newVersion, source, detail) {
    if (!db) return;
    try {
        db.run(
            'INSERT INTO memory_audit (refId, action, oldVersion, newVersion, source, detail, createdAt) VALUES (?,?,?,?,?,?,?)',
            [refId, action, oldVersion || 0, newVersion || 0, source || '', detail || '', Date.now()]
        );
    } catch (err) {
        console.error('[knowledgeStore] audit write error:', err.message);
    }
}

/**
 * Get audit log for a document.
 * @param {string} refId
 * @param {number} [limit=50]
 * @returns {object[]}
 */
function getAuditLog(refId, limit = 50) {
    if (!db) return [];
    const stmt = db.prepare('SELECT * FROM memory_audit WHERE refId = ? ORDER BY createdAt DESC LIMIT ?');
    stmt.bind([refId, limit]);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

// ==================== CRUD ====================

/**
 * Insert or update a document with validation, conflict resolution, and audit.
 * @param {object} doc
 * @param {object} [opts] - { skipValidation?: boolean }
 * @returns {string} refId
 */
function upsert(doc, opts = {}) {
    if (!db) throw new Error('KnowledgeStore not initialized');

    // Validation
    if (!opts.skipValidation) {
        const validation = validateDoc(doc);
        if (!validation.valid) {
            const errMsg = `Validation failed: ${validation.errors.join('; ')}`;
            console.warn(`[knowledgeStore] ${errMsg}`, doc.refId || '(new)');
            throw new Error(errMsg);
        }
    }

    const now = Date.now();
    const refId = doc.refId || genRefId(doc.type || 'doc');
    const tags = Array.isArray(doc.tags) ? JSON.stringify(doc.tags) : (doc.tags || '[]');
    const relations = Array.isArray(doc.relations) ? JSON.stringify(doc.relations) : (doc.relations || '[]');

    const existing = findByRef(refId);
    const finalType = doc.type || (existing ? existing.type : 'unknown');
    const finalSubType = doc.subType ?? (existing ? existing.subType : '');
    const finalSummary = doc.summary ?? (existing ? existing.summary : '');
    const writeClass = doc.writeClass || (existing ? existing.writeClass : 'explicit');

    // Candidate writes default to current=0
    const isCurrent = writeClass === 'candidate' ? 0 : (doc.current ?? 1);

    // Resolve content via conflict policy
    let finalContent;
    if (existing && doc.content !== undefined) {
        const policy = getConflictPolicy(finalType);
        finalContent = resolveConflict(policy, existing.content, doc.content, existing, { ...doc, updatedAt: now });
    } else {
        finalContent = doc.content ?? (existing ? existing.content : '');
    }

    // Dedup check: skip if identical content exists for same type+subType+scope
    if (!existing && finalContent) {
        const scope = doc.scope || 'global';
        const dupes = _queryAll(
            'SELECT refId FROM documents WHERE type = ? AND subType = ? AND scope = ? AND content = ? AND current = 1 LIMIT 1',
            [finalType, finalSubType, scope, finalContent]
        );
        if (dupes.length > 0) {
            return dupes[0].refId;
        }
    }

    if (existing) {
        const oldVersion = existing.version || 1;
        const newVersion = oldVersion + 1;
        db.run('DELETE FROM documents_fts WHERE refId = ?', [refId]);
        db.run(`
            UPDATE documents SET
                type=?, subType=?, scope=?, tags=?, content=?, summary=?,
                source=?, confidence=?, version=?, current=?, supersedes=?,
                relations=?, ttl=?, writeClass=?,
                validFrom=?, validUntil=?, lastConfirmedAt=?,
                updatedAt=?
            WHERE refId=?
        `, [
            finalType,
            finalSubType,
            doc.scope ?? existing.scope,
            tags,
            finalContent,
            finalSummary,
            doc.source ?? existing.source,
            doc.confidence ?? existing.confidence,
            newVersion,
            isCurrent,
            doc.supersedes ?? existing.supersedes,
            relations,
            doc.ttl ?? existing.ttl,
            writeClass,
            doc.validFrom ?? existing.validFrom ?? 0,
            doc.validUntil ?? existing.validUntil ?? 0,
            doc.lastConfirmedAt ?? now,
            now,
            refId
        ]);
        _audit(refId, 'update', oldVersion, newVersion, doc.source || '', finalSummary);
    } else {
        db.run(`
            INSERT INTO documents
                (refId, type, subType, scope, tags, content, summary,
                 source, confidence, version, current, supersedes,
                 relations, ttl, writeClass,
                 validFrom, validUntil, lastConfirmedAt,
                 createdAt, updatedAt)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `, [
            refId,
            finalType,
            finalSubType,
            doc.scope || 'global',
            tags,
            finalContent,
            finalSummary,
            doc.source || '',
            doc.confidence ?? 1.0,
            doc.version || 1,
            isCurrent,
            doc.supersedes || '',
            relations,
            doc.ttl || 0,
            writeClass,
            doc.validFrom || 0,
            doc.validUntil || 0,
            doc.lastConfirmedAt || 0,
            now,
            now
        ]);
        _audit(refId, 'create', 0, doc.version || 1, doc.source || '', finalSummary);
    }

    // Sync FTS
    db.run(
        'INSERT INTO documents_fts(refId, type, subType, tags, content, summary) VALUES (?,?,?,?,?,?)',
        [refId, finalType, finalSubType, tags, finalContent, finalSummary]
    );

    persist();
    return refId;
}

/**
 * Promote a candidate document to current.
 * @param {string} refId
 * @returns {boolean}
 */
function promote(refId) {
    if (!db) return false;
    const doc = findByRef(refId);
    if (!doc) return false;
    if (doc.current === 1) return true;
    db.run('UPDATE documents SET current = 1, updatedAt = ? WHERE refId = ?', [Date.now(), refId]);
    _audit(refId, 'promote', doc.version, doc.version, '', 'candidate promoted to current');
    persist();
    return true;
}

// ==================== Row Mapping ====================

function _rowToDoc(row) {
    if (!row) return null;
    return {
        refId: row.refId,
        type: row.type,
        subType: row.subType,
        scope: row.scope,
        tags: (() => { try { return JSON.parse(row.tags); } catch { return []; } })(),
        content: row.content,
        summary: row.summary,
        source: row.source,
        confidence: row.confidence,
        version: row.version,
        current: row.current,
        supersedes: row.supersedes,
        relations: (() => { try { return JSON.parse(row.relations); } catch { return []; } })(),
        ttl: row.ttl,
        writeClass: row.writeClass || 'explicit',
        validFrom: row.validFrom || 0,
        validUntil: row.validUntil || 0,
        lastConfirmedAt: row.lastConfirmedAt || 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}

function _queryAll(sql, params = []) {
    if (!db) return [];
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(_rowToDoc(stmt.getAsObject()));
    }
    stmt.free();
    return results;
}

// ==================== Query ====================

/** Find a single document by refId */
function findByRef(refId) {
    if (!db) return null;
    const rows = _queryAll('SELECT * FROM documents WHERE refId = ?', [refId]);
    return rows[0] || null;
}

/** Find all current documents of a given type (optionally filtered by subType) */
function findByType(type, subType) {
    if (!db) return [];
    if (subType) {
        return _queryAll(
            'SELECT * FROM documents WHERE type = ? AND subType = ? AND current = 1 ORDER BY updatedAt DESC',
            [type, subType]
        );
    }
    return _queryAll(
        'SELECT * FROM documents WHERE type = ? AND current = 1 ORDER BY updatedAt DESC',
        [type]
    );
}

/** Find documents matching any of the given tags */
function findByTags(tags) {
    if (!db || !Array.isArray(tags) || !tags.length) return [];
    const conditions = tags.map(() => "tags LIKE ?");
    const params = tags.map(t => `%"${t}"%`);
    return _queryAll(
        `SELECT * FROM documents WHERE (${conditions.join(' OR ')}) AND current = 1 ORDER BY updatedAt DESC`,
        params
    );
}

/** Find all current documents matching a scope */
function findByScope(scope) {
    if (!db) return [];
    return _queryAll(
        'SELECT * FROM documents WHERE scope = ? AND current = 1 ORDER BY updatedAt DESC',
        [scope]
    );
}

/**
 * Walk scope hierarchy, return first matching document.
 * @param {string} type
 * @param {string} subType
 * @param {string[]} scopes - Ordered from most specific to least, e.g. ['session:abc', 'agent:job-seek', 'user:default', 'global']
 * @returns {object|null}
 */
function findResolved(type, subType, scopes) {
    if (!db || !Array.isArray(scopes)) return null;
    for (const scope of scopes) {
        const sql = subType
            ? 'SELECT * FROM documents WHERE type = ? AND subType = ? AND scope = ? AND current = 1 ORDER BY updatedAt DESC LIMIT 1'
            : 'SELECT * FROM documents WHERE type = ? AND scope = ? AND current = 1 ORDER BY updatedAt DESC LIMIT 1';
        const params = subType ? [type, subType, scope] : [type, scope];
        const rows = _queryAll(sql, params);
        if (rows.length > 0) return rows[0];
    }
    return null;
}

/**
 * Find current documents that are not stale.
 * @param {string} type
 * @param {string} [scope] - Optional scope filter
 * @param {number} [maxAgeDays=30] - Max age in days from updatedAt
 * @returns {object[]}
 */
function findFresh(type, scope, maxAgeDays = 30) {
    if (!db) return [];
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    if (scope) {
        return _queryAll(
            `SELECT * FROM documents WHERE type = ? AND scope = ? AND current = 1
             AND updatedAt >= ?
             AND (validUntil = 0 OR validUntil > ?)
             ORDER BY updatedAt DESC`,
            [type, scope, cutoff, Date.now()]
        );
    }
    return _queryAll(
        `SELECT * FROM documents WHERE type = ? AND current = 1
         AND updatedAt >= ?
         AND (validUntil = 0 OR validUntil > ?)
         ORDER BY updatedAt DESC`,
        [type, cutoff, Date.now()]
    );
}

/**
 * Full-text search using FTS4.
 * @param {string} query - Search query
 * @param {string[]} [types] - Optional type filter
 * @param {number} [limit=10] - Max results
 * @param {string} [scope] - Optional scope filter
 * @returns {Array<{doc: object, rank: number}>}
 */
function search(query, types, limit = 10, scope) {
    if (!db || !query) return [];

    const tokens = query.split(/\s+/).filter(t => t.length >= 2);
    if (!tokens.length) return [];
    const ftsQuery = tokens.map(t => `${t.replace(/"/g, '')}`).join(' OR ');

    const conditions = ['documents_fts MATCH ?', 'd.current = 1'];
    const params = [ftsQuery];

    if (types && types.length > 0) {
        const placeholders = types.map(() => '?').join(',');
        conditions.push(`d.type IN (${placeholders})`);
        params.push(...types);
    }

    if (scope) {
        conditions.push('d.scope = ?');
        params.push(scope);
    }

    params.push(limit);

    const sql = `
        SELECT d.*
        FROM documents_fts f
        JOIN documents d ON d.refId = f.refId
        WHERE ${conditions.join(' AND ')}
        LIMIT ?
    `;

    try {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            const obj = stmt.getAsObject();
            results.push({ doc: _rowToDoc(obj), rank: 0 });
        }
        stmt.free();
        return results;
    } catch (err) {
        console.error('[knowledgeStore] FTS search error:', err.message);
        return [];
    }
}

// ==================== Delete ====================

/** Delete a document by refId */
function remove(refId) {
    if (!db) return false;
    const doc = findByRef(refId);
    const version = doc ? doc.version : 0;
    db.run('DELETE FROM documents_fts WHERE refId = ?', [refId]);
    db.run('DELETE FROM documents WHERE refId = ?', [refId]);
    _audit(refId, 'delete', version, 0, '', '');
    persist();
    return true;
}

/** Delete all documents matching a type (and optional scope) */
function removeByType(type, scope) {
    if (!db) return 0;
    let before;
    if (scope) {
        before = _queryAll('SELECT refId FROM documents WHERE type = ? AND scope = ?', [type, scope]);
    } else {
        before = _queryAll('SELECT refId FROM documents WHERE type = ?', [type]);
    }
    for (const row of before) {
        db.run('DELETE FROM documents_fts WHERE refId = ?', [row.refId]);
        _audit(row.refId, 'delete', 0, 0, '', `removeByType(${type})`);
    }
    if (scope) {
        db.run('DELETE FROM documents WHERE type = ? AND scope = ?', [type, scope]);
    } else {
        db.run('DELETE FROM documents WHERE type = ?', [type]);
    }
    persist();
    return before.length;
}

/** Clean up expired documents based on TTL and validUntil */
function expireTTL() {
    if (!db) return 0;
    const now = Date.now();
    const expired = _queryAll(
        `SELECT refId FROM documents WHERE
            (ttl > 0 AND (createdAt + ttl) < ?)
            OR (validUntil > 0 AND validUntil < ?)`,
        [now, now]
    );
    for (const row of expired) {
        db.run('DELETE FROM documents_fts WHERE refId = ?', [row.refId]);
        _audit(row.refId, 'expire', 0, 0, '', 'TTL/validUntil expired');
    }
    if (expired.length > 0) {
        db.run(
            `DELETE FROM documents WHERE
                (ttl > 0 AND (createdAt + ttl) < ?)
                OR (validUntil > 0 AND validUntil < ?)`,
            [now, now]
        );
        persist();
    }
    return expired.length;
}

// ==================== Stats ====================

function stats() {
    if (!db) return { total: 0, byType: {} };
    const stmt1 = db.prepare('SELECT COUNT(*) as cnt FROM documents');
    let total = 0;
    if (stmt1.step()) total = stmt1.getAsObject().cnt || 0;
    stmt1.free();

    const byType = {};
    const stmt2 = db.prepare('SELECT type, COUNT(*) as cnt FROM documents WHERE current = 1 GROUP BY type');
    while (stmt2.step()) {
        const row = stmt2.getAsObject();
        byType[row.type] = row.cnt;
    }
    stmt2.free();
    return { total, byType };
}

/** Close database */
function close() {
    if (db) {
        persist();
        db.close();
        db = null;
        sqlReady = null;
    }
}

// ==================== Expand Rules ====================

const EXPAND_RULES = {
    profile:     ['profile'],
    direction:   ['profile', 'direction'],
    job_listing: ['profile'],
    preference:  ['preference', 'direction'],
    match_result: ['profile', 'job_listing'],
};

function expandByTypes(matchedTypes) {
    const typesToFetch = new Set();
    for (const t of matchedTypes) {
        const expand = EXPAND_RULES[t] || [t];
        expand.forEach(e => typesToFetch.add(e));
    }
    const results = [];
    const seen = new Set();
    for (const type of typesToFetch) {
        for (const doc of findByType(type)) {
            if (!seen.has(doc.refId)) {
                seen.add(doc.refId);
                results.push(doc);
            }
        }
    }
    return results;
}

module.exports = {
    init,
    persist,
    genRefId,
    upsert,
    promote,
    findByRef,
    findByType,
    findByTags,
    findByScope,
    findResolved,
    findFresh,
    search,
    remove,
    removeByType,
    expireTTL,
    getAuditLog,
    stats,
    close,
    expandByTypes,
    EXPAND_RULES,
    SCOPE_HIERARCHY,
    _getDb: () => db,
    _reset: () => { db = null; sqlReady = null; dbPath = ''; }
};
