'use strict';

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

let db = null;
let dbPath = '';
let sqlReady = null;

/**
 * Initialize the SQLite database with FTS5 support.
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
                scope       TEXT DEFAULT 'agent:job-seek',
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

        // FTS4 virtual table for full-text search (sql.js supports fts4, not fts5)
        db.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts4(
                refId, type, subType, tags, content, summary,
                tokenize=unicode61
            )
        `);

        console.log(`[knowledgeStore] Initialized at ${dbPath}`);
        persist();
    })();

    return sqlReady;
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

// ==================== CRUD ====================

/**
 * Insert or update a document.
 * If refId exists, updates it and bumps version.
 */
function upsert(doc) {
    if (!db) throw new Error('KnowledgeStore not initialized');
    const now = Date.now();
    const refId = doc.refId || genRefId(doc.type || 'doc');
    const tags = Array.isArray(doc.tags) ? JSON.stringify(doc.tags) : (doc.tags || '[]');
    const relations = Array.isArray(doc.relations) ? JSON.stringify(doc.relations) : (doc.relations || '[]');

    const existing = findByRef(refId);
    const finalType = doc.type || (existing ? existing.type : 'unknown');
    const finalSubType = doc.subType ?? (existing ? existing.subType : '');
    const finalContent = doc.content ?? (existing ? existing.content : '');
    const finalSummary = doc.summary ?? (existing ? existing.summary : '');

    if (existing) {
        // Remove old FTS entry
        db.run('DELETE FROM documents_fts WHERE refId = ?', [refId]);
        db.run(`
            UPDATE documents SET
                type=?, subType=?, scope=?, tags=?, content=?, summary=?,
                source=?, confidence=?, version=?, current=?, supersedes=?,
                relations=?, ttl=?, updatedAt=?
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
            (existing.version || 1) + 1,
            doc.current ?? 1,
            doc.supersedes ?? existing.supersedes,
            relations,
            doc.ttl ?? existing.ttl,
            now,
            refId
        ]);
    } else {
        db.run(`
            INSERT INTO documents
                (refId, type, subType, scope, tags, content, summary,
                 source, confidence, version, current, supersedes,
                 relations, ttl, createdAt, updatedAt)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `, [
            refId,
            finalType,
            finalSubType,
            doc.scope || 'agent:job-seek',
            tags,
            finalContent,
            finalSummary,
            doc.source || '',
            doc.confidence ?? 1.0,
            doc.version || 1,
            doc.current ?? 1,
            doc.supersedes || '',
            relations,
            doc.ttl || 0,
            now,
            now
        ]);
    }

    // Sync FTS
    db.run(`
        INSERT INTO documents_fts(refId, type, subType, tags, content, summary)
        VALUES (?,?,?,?,?,?)
    `, [refId, finalType, finalSubType, tags, finalContent, finalSummary]);

    persist();
    return refId;
}

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

/** Find a single document by refId */
function findByRef(refId) {
    if (!db) return null;
    const rows = _queryAll('SELECT * FROM documents WHERE refId = ?', [refId]);
    return rows[0] || null;
}

/** Find all current documents of a given type */
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
    // Use LIKE for each tag against JSON array
    const conditions = tags.map(() => "tags LIKE ?");
    const params = tags.map(t => `%"${t}"%`);
    return _queryAll(
        `SELECT * FROM documents WHERE (${conditions.join(' OR ')}) AND current = 1 ORDER BY updatedAt DESC`,
        params
    );
}

/** Find all current documents matching a scope prefix */
function findByScope(scope) {
    if (!db) return [];
    return _queryAll(
        'SELECT * FROM documents WHERE scope = ? AND current = 1 ORDER BY updatedAt DESC',
        [scope]
    );
}

/**
 * Full-text search using FTS4.
 * @param {string} query - Search query
 * @param {string[]} [types] - Optional type filter
 * @param {number} [limit=10] - Max results
 * @returns {Array<{doc: object, rank: number}>}
 */
function search(query, types, limit = 10) {
    if (!db || !query) return [];

    // Tokenize query for FTS4 (OR-based matching)
    const tokens = query.split(/\s+/).filter(t => t.length >= 2);
    if (!tokens.length) return [];
    const ftsQuery = tokens.map(t => `${t.replace(/"/g, '')}`).join(' OR ');

    let sql;
    let params;

    if (types && types.length > 0) {
        const placeholders = types.map(() => '?').join(',');
        sql = `
            SELECT d.*
            FROM documents_fts f
            JOIN documents d ON d.refId = f.refId
            WHERE documents_fts MATCH ?
              AND d.type IN (${placeholders})
              AND d.current = 1
            LIMIT ?
        `;
        params = [ftsQuery, ...types, limit];
    } else {
        sql = `
            SELECT d.*
            FROM documents_fts f
            JOIN documents d ON d.refId = f.refId
            WHERE documents_fts MATCH ?
              AND d.current = 1
            LIMIT ?
        `;
        params = [ftsQuery, limit];
    }

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

/** Delete a document by refId */
function remove(refId) {
    if (!db) return false;
    db.run('DELETE FROM documents_fts WHERE refId = ?', [refId]);
    db.run('DELETE FROM documents WHERE refId = ?', [refId]);
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
    }
    if (scope) {
        db.run('DELETE FROM documents WHERE type = ? AND scope = ?', [type, scope]);
    } else {
        db.run('DELETE FROM documents WHERE type = ?', [type]);
    }
    persist();
    return before.length;
}

/** Clean up expired documents based on TTL */
function expireTTL() {
    if (!db) return 0;
    const now = Date.now();
    const expired = _queryAll(
        'SELECT refId FROM documents WHERE ttl > 0 AND (createdAt + ttl) < ?',
        [now]
    );
    for (const row of expired) {
        db.run('DELETE FROM documents_fts WHERE refId = ?', [row.refId]);
    }
    if (expired.length > 0) {
        db.run(
            'DELETE FROM documents WHERE ttl > 0 AND (createdAt + ttl) < ?',
            [now]
        );
        persist();
    }
    return expired.length;
}

/** Get stats */
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

/**
 * Given a list of matched types from search, expand to fetch all related docs.
 * @param {string[]} matchedTypes - Types found in search results
 * @returns {object[]} - All expanded documents
 */
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
    findByRef,
    findByType,
    findByTags,
    findByScope,
    search,
    remove,
    removeByType,
    expireTTL,
    stats,
    close,
    expandByTypes,
    EXPAND_RULES,
    // Expose for testing
    _getDb: () => db,
    _reset: () => { db = null; sqlReady = null; dbPath = ''; }
};
