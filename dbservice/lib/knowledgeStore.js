'use strict';

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { validateDoc, getConflictPolicy, resolveConflict } = require('./memorySchema');
const memoryRelations = require('./memoryRelations');

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
                status      TEXT DEFAULT 'active',
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

        // Create indexes
        _createIndexes();

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

        // Initialize relations & events tables
        memoryRelations.init(db);

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
        { col: 'writeClass',      sql: "ALTER TABLE documents ADD COLUMN writeClass TEXT DEFAULT 'explicit'" },
        { col: 'lastUsedAt',      sql: 'ALTER TABLE documents ADD COLUMN lastUsedAt INTEGER DEFAULT 0' },
        { col: 'accessCount',     sql: 'ALTER TABLE documents ADD COLUMN accessCount INTEGER DEFAULT 0' },
        { col: 'status',          sql: "ALTER TABLE documents ADD COLUMN status TEXT DEFAULT 'active'" },
        // Story 8.4: Advanced schema features
        { col: 'memoryKey',       sql: "ALTER TABLE documents ADD COLUMN memoryKey TEXT DEFAULT ''" },
        { col: 'payload',         sql: "ALTER TABLE documents ADD COLUMN payload TEXT DEFAULT '{}'" },
        { col: 'sourceType',      sql: "ALTER TABLE documents ADD COLUMN sourceType TEXT DEFAULT 'user_explicit'" },
        // Story 8.3: Cross-agent tracking
        { col: 'actorId',         sql: "ALTER TABLE documents ADD COLUMN actorId TEXT DEFAULT ''" }
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

    // Migrate legacy `current` column to `status` for old databases
    _migrateLegacyCurrent();
}

/** Migrate old `current` INTEGER column values to `status` TEXT */
function _migrateLegacyCurrent() {
    try {
        // Check if `current` column exists
        const info = db.exec("PRAGMA table_info(documents)");
        if (!info.length) return;
        const cols = info[0].values.map(row => row[1]);
        if (!cols.includes('current')) return;

        // Migrate: current=0 → status='candidate', current=1 → status='active' (if status is still default)
        db.run("UPDATE documents SET status = 'candidate' WHERE current = 0 AND status = 'active'");
        // current=1 docs stay as status='active' (already default)
    } catch {
        // Table may not have `current` column in fresh databases — ignore
    }
}

/** Create indexes for common query patterns */
function _createIndexes() {
    const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_docs_type_subtype ON documents(type, subType)',
        'CREATE INDEX IF NOT EXISTS idx_docs_scope ON documents(scope)',
        'CREATE INDEX IF NOT EXISTS idx_docs_status ON documents(status)',
        'CREATE INDEX IF NOT EXISTS idx_docs_updated ON documents(updatedAt)',
        'CREATE INDEX IF NOT EXISTS idx_docs_valid_until ON documents(validUntil)',
        'CREATE INDEX IF NOT EXISTS idx_docs_type_status ON documents(type, status)',
        'CREATE INDEX IF NOT EXISTS idx_docs_scope_status ON documents(scope, status)',
        'CREATE INDEX IF NOT EXISTS idx_audit_refid ON memory_audit(refId)',
        'CREATE INDEX IF NOT EXISTS idx_docs_memorykey ON documents(memoryKey)',
        'CREATE INDEX IF NOT EXISTS idx_docs_actorid ON documents(actorId)'
    ];
    for (const sql of indexes) {
        try { db.run(sql); } catch { /* index may already exist */ }
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

// ==================== Usage Tracking ====================

/** Update lastUsedAt and accessCount for a list of refIds (fire-and-forget) */
function _touchUsage(refIds) {
    if (!db || !refIds.length) return;
    const now = Date.now();
    for (const refId of refIds) {
        try {
            db.run(
                'UPDATE documents SET lastUsedAt = ?, accessCount = accessCount + 1 WHERE refId = ?',
                [now, refId]
            );
        } catch { /* non-critical */ }
    }
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

    // Determine status
    // If doc provides explicit status, use it. Otherwise default to 'active' for new docs
    // or keep existing status — but never inherit 'deleted' (soft-deleted docs being re-upserted should revive).
    let status;
    if (writeClass === 'candidate') {
        status = 'candidate';
    } else if (doc.status) {
        status = doc.status;
    } else if (existing && existing.status !== 'deleted') {
        status = existing.status;
    } else {
        status = 'active';
    }

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
            "SELECT refId FROM documents WHERE type = ? AND subType = ? AND scope = ? AND content = ? AND status = 'active' LIMIT 1",
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
                source=?, confidence=?, version=?, status=?, supersedes=?,
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
            status,
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
        const payload = doc.payload ? (typeof doc.payload === 'string' ? doc.payload : JSON.stringify(doc.payload)) : '{}';
        db.run(`
            INSERT INTO documents
                (refId, type, subType, scope, tags, content, summary,
                 source, confidence, version, status, supersedes,
                 relations, ttl, writeClass,
                 validFrom, validUntil, lastConfirmedAt,
                 lastUsedAt, accessCount,
                 memoryKey, payload, sourceType, actorId,
                 createdAt, updatedAt)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
            status,
            doc.supersedes || '',
            relations,
            doc.ttl || 0,
            writeClass,
            doc.validFrom || 0,
            doc.validUntil || 0,
            doc.lastConfirmedAt || 0,
            0, // lastUsedAt
            0, // accessCount
            doc.memoryKey || '',
            payload,
            doc.sourceType || 'user_explicit',
            doc.actorId || '',
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
 * Promote a candidate document to active.
 * @param {string} refId
 * @returns {boolean}
 */
function promote(refId) {
    if (!db) return false;
    const doc = findByRef(refId);
    if (!doc) return false;
    if (doc.status === 'active') return true;
    db.run("UPDATE documents SET status = 'active', updatedAt = ? WHERE refId = ?", [Date.now(), refId]);
    _audit(refId, 'promote', doc.version, doc.version, '', 'candidate promoted to active');
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
        status: row.status || 'active',
        supersedes: row.supersedes,
        relations: (() => { try { return JSON.parse(row.relations); } catch { return []; } })(),
        ttl: row.ttl,
        writeClass: row.writeClass || 'explicit',
        validFrom: row.validFrom || 0,
        validUntil: row.validUntil || 0,
        lastConfirmedAt: row.lastConfirmedAt || 0,
        lastUsedAt: row.lastUsedAt || 0,
        accessCount: row.accessCount || 0,
        memoryKey: row.memoryKey || '',
        payload: (() => { try { return JSON.parse(row.payload || '{}'); } catch { return {}; } })(),
        sourceType: row.sourceType || 'user_explicit',
        actorId: row.actorId || '',
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

/** Find a single document by refId (does NOT filter by status — returns any state) */
function findByRef(refId) {
    if (!db) return null;
    const rows = _queryAll('SELECT * FROM documents WHERE refId = ?', [refId]);
    if (rows.length > 0) {
        _touchUsage([rows[0].refId]);
    }
    return rows[0] || null;
}

/** Find all active documents of a given type (optionally filtered by subType) */
function findByType(type, subType) {
    if (!db) return [];
    let docs;
    if (subType) {
        docs = _queryAll(
            "SELECT * FROM documents WHERE type = ? AND subType = ? AND status = 'active' ORDER BY updatedAt DESC",
            [type, subType]
        );
    } else {
        docs = _queryAll(
            "SELECT * FROM documents WHERE type = ? AND status = 'active' ORDER BY updatedAt DESC",
            [type]
        );
    }
    if (docs.length) _touchUsage(docs.map(d => d.refId));
    return docs;
}

/** Find documents matching any of the given tags */
function findByTags(tags) {
    if (!db || !Array.isArray(tags) || !tags.length) return [];
    const conditions = tags.map(() => "tags LIKE ?");
    const params = tags.map(t => `%"${t}"%`);
    const docs = _queryAll(
        `SELECT * FROM documents WHERE (${conditions.join(' OR ')}) AND status = 'active' ORDER BY updatedAt DESC`,
        params
    );
    if (docs.length) _touchUsage(docs.map(d => d.refId));
    return docs;
}

/** Find all active documents matching a scope */
function findByScope(scope) {
    if (!db) return [];
    const docs = _queryAll(
        "SELECT * FROM documents WHERE scope = ? AND status = 'active' ORDER BY updatedAt DESC",
        [scope]
    );
    if (docs.length) _touchUsage(docs.map(d => d.refId));
    return docs;
}

/**
 * Walk scope hierarchy, return first matching document.
 * @param {string} type
 * @param {string} subType
 * @param {string[]} scopes - Ordered from most specific to least
 * @returns {object|null}
 */
function findResolved(type, subType, scopes) {
    if (!db || !Array.isArray(scopes)) return null;
    for (const scope of scopes) {
        const sql = subType
            ? "SELECT * FROM documents WHERE type = ? AND subType = ? AND scope = ? AND status = 'active' ORDER BY updatedAt DESC LIMIT 1"
            : "SELECT * FROM documents WHERE type = ? AND scope = ? AND status = 'active' ORDER BY updatedAt DESC LIMIT 1";
        const params = subType ? [type, subType, scope] : [type, scope];
        const rows = _queryAll(sql, params);
        if (rows.length > 0) {
            _touchUsage([rows[0].refId]);
            return rows[0];
        }
    }
    return null;
}

/**
 * Find active documents that are not stale.
 * @param {string} type
 * @param {string} [scope] - Optional scope filter
 * @param {number} [maxAgeDays=30] - Max age in days from updatedAt
 * @returns {object[]}
 */
function findFresh(type, scope, maxAgeDays = 30) {
    if (!db) return [];
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    let docs;
    if (scope) {
        docs = _queryAll(
            `SELECT * FROM documents WHERE type = ? AND scope = ? AND status = 'active'
             AND updatedAt >= ?
             AND (validUntil = 0 OR validUntil > ?)
             ORDER BY updatedAt DESC`,
            [type, scope, cutoff, Date.now()]
        );
    } else {
        docs = _queryAll(
            `SELECT * FROM documents WHERE type = ? AND status = 'active'
             AND updatedAt >= ?
             AND (validUntil = 0 OR validUntil > ?)
             ORDER BY updatedAt DESC`,
            [type, cutoff, Date.now()]
        );
    }
    if (docs.length) _touchUsage(docs.map(d => d.refId));
    return docs;
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

    const conditions = ['documents_fts MATCH ?', "d.status = 'active'"];
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
        if (results.length) _touchUsage(results.map(r => r.doc.refId));
        return results;
    } catch (err) {
        console.error('[knowledgeStore] FTS search error:', err.message);
        return [];
    }
}

// ==================== Delete ====================

/** Soft-delete a document by refId (sets status='deleted') */
function remove(refId) {
    if (!db) return false;
    const doc = findByRef(refId);
    if (!doc) return false;
    const version = doc.version || 0;
    db.run('DELETE FROM documents_fts WHERE refId = ?', [refId]);
    db.run("UPDATE documents SET status = 'deleted', updatedAt = ? WHERE refId = ?", [Date.now(), refId]);
    _audit(refId, 'delete', version, version, '', 'soft delete');
    persist();
    return true;
}

/** Hard-delete a document by refId (physical removal) */
function hardRemove(refId) {
    if (!db) return false;
    const doc = findByRef(refId);
    const version = doc ? doc.version : 0;
    db.run('DELETE FROM documents_fts WHERE refId = ?', [refId]);
    db.run('DELETE FROM documents WHERE refId = ?', [refId]);
    _audit(refId, 'hard_delete', version, 0, '', '');
    persist();
    return true;
}

/** Soft-delete all documents matching a type (and optional scope) */
function removeByType(type, scope) {
    if (!db) return 0;
    let before;
    if (scope) {
        before = _queryAll("SELECT refId FROM documents WHERE type = ? AND scope = ? AND status != 'deleted'", [type, scope]);
    } else {
        before = _queryAll("SELECT refId FROM documents WHERE type = ? AND status != 'deleted'", [type]);
    }
    const now = Date.now();
    for (const row of before) {
        db.run('DELETE FROM documents_fts WHERE refId = ?', [row.refId]);
        db.run("UPDATE documents SET status = 'deleted', updatedAt = ? WHERE refId = ?", [now, row.refId]);
        _audit(row.refId, 'delete', 0, 0, '', `removeByType(${type})`);
    }
    persist();
    return before.length;
}

/** Mark expired documents (TTL or validUntil) as status='expired' */
function expireTTL() {
    if (!db) return 0;
    const now = Date.now();
    const expired = _queryAll(
        `SELECT refId FROM documents WHERE status = 'active' AND (
            (ttl > 0 AND (createdAt + ttl) < ?)
            OR (validUntil > 0 AND validUntil < ?)
        )`,
        [now, now]
    );
    for (const row of expired) {
        db.run('DELETE FROM documents_fts WHERE refId = ?', [row.refId]);
        db.run("UPDATE documents SET status = 'expired', updatedAt = ? WHERE refId = ?", [now, row.refId]);
        _audit(row.refId, 'expire', 0, 0, '', 'TTL/validUntil expired');
    }
    if (expired.length > 0) {
        persist();
    }
    return expired.length;
}

/**
 * Purge documents that have been soft-deleted or expired.
 * @param {number} [olderThanDays=30] - Only purge docs deleted/expired more than N days ago
 * @returns {number} Number of records purged
 */
function purge(olderThanDays = 30) {
    if (!db) return 0;
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    const targets = _queryAll(
        "SELECT refId FROM documents WHERE status IN ('deleted', 'expired') AND updatedAt < ?",
        [cutoff]
    );
    for (const row of targets) {
        db.run('DELETE FROM documents WHERE refId = ?', [row.refId]);
    }
    if (targets.length) persist();
    return targets.length;
}

// ==================== Stats ====================

function stats() {
    if (!db) return { total: 0, byType: {} };
    const stmt1 = db.prepare('SELECT COUNT(*) as cnt FROM documents');
    let total = 0;
    if (stmt1.step()) total = stmt1.getAsObject().cnt || 0;
    stmt1.free();

    const byType = {};
    const stmt2 = db.prepare("SELECT type, COUNT(*) as cnt FROM documents WHERE status = 'active' GROUP BY type");
    while (stmt2.step()) {
        const row = stmt2.getAsObject();
        byType[row.type] = row.cnt;
    }
    stmt2.free();
    return { total, byType };
}

// ==================== Story 8.4: Find by memoryKey ====================

/**
 * Find a document by its memoryKey (logical slot key).
 * @param {string} memoryKey
 * @returns {object|null}
 */
function findByMemoryKey(memoryKey) {
    if (!db || !memoryKey) return null;
    const docs = _queryAll(
        "SELECT * FROM documents WHERE memoryKey = ? AND status = 'active' ORDER BY updatedAt DESC LIMIT 1",
        [memoryKey]
    );
    if (docs.length > 0) _touchUsage([docs[0].refId]);
    return docs[0] || null;
}

/**
 * Find documents by actorId (Story 8.3).
 * @param {string} actorId
 * @returns {object[]}
 */
function findByActor(actorId) {
    if (!db || !actorId) return [];
    const docs = _queryAll(
        "SELECT * FROM documents WHERE actorId = ? AND status = 'active' ORDER BY updatedAt DESC",
        [actorId]
    );
    if (docs.length) _touchUsage(docs.map(d => d.refId));
    return docs;
}

// ==================== Story 8.5: Hot Memory Cleanup ====================

/**
 * Find cold (unused/stale) documents that are candidates for cleanup.
 * Cold = low accessCount + old lastUsedAt + not permanent durability
 * @param {object} [options]
 * @param {number} [options.lastUsedDays=60] - Days since last use
 * @param {number} [options.maxAccessCount=2] - Max access count threshold
 * @param {string[]} [options.excludeTypes] - Types to exclude from cleanup
 * @returns {object[]}
 */
function findColdMemories(options = {}) {
    if (!db) return [];
    const {
        lastUsedDays = 60,
        maxAccessCount = 2,
        excludeTypes = ['identity', 'decision']
    } = options;

    const cutoff = Date.now() - (lastUsedDays * 24 * 60 * 60 * 1000);
    const excludePlaceholders = excludeTypes.map(() => '?').join(',');

    let sql, params;
    if (excludeTypes.length > 0) {
        sql = `SELECT * FROM documents
               WHERE status = 'active'
               AND (lastUsedAt = 0 OR lastUsedAt < ?)
               AND accessCount <= ?
               AND type NOT IN (${excludePlaceholders})
               ORDER BY lastUsedAt ASC, accessCount ASC`;
        params = [cutoff, maxAccessCount, ...excludeTypes];
    } else {
        sql = `SELECT * FROM documents
               WHERE status = 'active'
               AND (lastUsedAt = 0 OR lastUsedAt < ?)
               AND accessCount <= ?
               ORDER BY lastUsedAt ASC, accessCount ASC`;
        params = [cutoff, maxAccessCount];
    }

    return _queryAll(sql, params);
}

/**
 * Clean up cold memories by archiving (soft-delete).
 * @param {object} [options] - Same as findColdMemories
 * @returns {{ archived: number, refIds: string[] }}
 */
function cleanupColdMemories(options = {}) {
    if (!db) return { archived: 0, refIds: [] };

    const cold = findColdMemories(options);
    const now = Date.now();
    const refIds = [];

    for (const doc of cold) {
        db.run('DELETE FROM documents_fts WHERE refId = ?', [doc.refId]);
        db.run("UPDATE documents SET status = 'deleted', updatedAt = ? WHERE refId = ?", [now, doc.refId]);
        _audit(doc.refId, 'cold_cleanup', doc.version, doc.version, '', 'cold memory archived');
        refIds.push(doc.refId);
    }

    if (refIds.length > 0) persist();
    return { archived: refIds.length, refIds };
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
    findByMemoryKey,
    findByActor,
    search,
    remove,
    hardRemove,
    removeByType,
    expireTTL,
    purge,
    findColdMemories,
    cleanupColdMemories,
    getAuditLog,
    stats,
    close,
    expandByTypes,
    EXPAND_RULES,
    SCOPE_HIERARCHY,
    _getDb: () => db,
    _reset: () => { db = null; sqlReady = null; dbPath = ''; }
};
