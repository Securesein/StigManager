const Database = require('better-sqlite3');
const path     = require('path');
const { app }  = require('electron');

let db;

function getDb() {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'stig-manager.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function ensureUseCaseColumn(database) {
  const cols = database.prepare('PRAGMA table_info(stig_versions)').all();
  if (!cols.some(c => c.name === 'use_case_id')) {
    database.exec('ALTER TABLE stig_versions ADD COLUMN use_case_id INTEGER');
    console.log('[db] use_case_id column added to stig_versions');
  }
}

function stripXmlTags(str) {
  if (!str) return str;
  const match = str.match(/<VulnDiscussion>([\s\S]*?)<\/VulnDiscussion>/i);
  if (match) return match[1].replace(/\s+/g, ' ').trim();
  return str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS use_cases (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      created_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stig_versions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      use_case_id   INTEGER REFERENCES use_cases(id),
      platform      TEXT    NOT NULL,
      version       TEXT    NOT NULL,
      release_date  TEXT,
      imported_at   TEXT    NOT NULL,
      source_format TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stig_rules (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id    INTEGER NOT NULL REFERENCES stig_versions(id),
      vuln_id       TEXT,
      stig_id       TEXT,
      rule_title    TEXT    NOT NULL,
      severity      TEXT,
      description   TEXT,
      check_content TEXT,
      fix_text      TEXT
    );

    CREATE TABLE IF NOT EXISTS rule_annotations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id       INTEGER NOT NULL REFERENCES stig_rules(id),
      status        TEXT    NOT NULL,
      notes         TEXT,
      valid_years   INTEGER DEFAULT 2,
      annotated_at  TEXT    NOT NULL,
      expires_at    TEXT    NOT NULL,
      annotated_by  TEXT
    );

    CREATE TABLE IF NOT EXISTS version_mappings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      old_rule_id   INTEGER REFERENCES stig_rules(id),
      new_rule_id   INTEGER REFERENCES stig_rules(id),
      confidence    REAL    NOT NULL,
      match_method  TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rules_version ON stig_rules(version_id);
    CREATE INDEX IF NOT EXISTS idx_rules_vuln_id ON stig_rules(vuln_id);
    CREATE INDEX IF NOT EXISTS idx_rules_stig_id ON stig_rules(stig_id);
    CREATE INDEX IF NOT EXISTS idx_annot_rule    ON rule_annotations(rule_id);
    CREATE INDEX IF NOT EXISTS idx_mappings_new  ON version_mappings(new_rule_id);
    CREATE INDEX IF NOT EXISTS idx_mappings_old  ON version_mappings(old_rule_id);
    CREATE INDEX IF NOT EXISTS idx_versions_uc   ON stig_versions(use_case_id);
  `);

  ensureUseCaseColumn(db);

  // Migratie: enforce_expiry kolom toevoegen aan use_cases
  const ucCols = db.prepare('PRAGMA table_info(use_cases)').all();
  if (!ucCols.some(c => c.name === 'enforce_expiry')) {
    db.exec('ALTER TABLE use_cases ADD COLUMN enforce_expiry INTEGER DEFAULT 1');
  }
  if (!ucCols.some(c => c.name === 'reviewer')) {
    db.exec('ALTER TABLE use_cases ADD COLUMN reviewer TEXT');
  }

  // Migratie: applicable kolom toevoegen aan stig_rules (1 = in scope, 0 = out of scope)
  const ruleCols = db.prepare('PRAGMA table_info(stig_rules)').all();
  if (!ruleCols.some(c => c.name === 'applicable')) {
    db.exec('ALTER TABLE stig_rules ADD COLUMN applicable INTEGER NOT NULL DEFAULT 1');
  }

  // Migratie: expires_at nullable maken — annotaties van na/open krijgen geen timer meer
  // (bestaande data laten we staan, alleen nieuwe annotaties worden correct opgeslagen)

  // Migratie: bestaande versies zonder use case → "Default" use case
  const orphans = db.prepare('SELECT id FROM stig_versions WHERE use_case_id IS NULL').all();
  if (orphans.length > 0) {
    let defaultId = db.prepare("SELECT id FROM use_cases WHERE name = 'Default'").get()?.id;
    if (!defaultId) {
      defaultId = db.prepare("INSERT INTO use_cases (name, created_at) VALUES ('Default', ?)")
        .run(new Date().toISOString()).lastInsertRowid;
    }
    db.prepare('UPDATE stig_versions SET use_case_id = ? WHERE use_case_id IS NULL').run(defaultId);
  }

  // Eenmalige cleanup: strip XML-tags uit bestaande regelinhoud
  const dirty = db.prepare("SELECT id, description, check_content, fix_text FROM stig_rules WHERE description LIKE '%<%'").all();
  if (dirty.length > 0) {
    const update   = db.prepare('UPDATE stig_rules SET description=?, check_content=?, fix_text=? WHERE id=?');
    const cleanAll = db.transaction(() => {
      for (const r of dirty) {
        update.run(stripXmlTags(r.description), stripXmlTags(r.check_content), stripXmlTags(r.fix_text), r.id);
      }
    });
    cleanAll();
  }
}

// ── Use Cases ─────────────────────────────────────────────────────────────────

function getUseCases() {
  return getDb().prepare('SELECT * FROM use_cases ORDER BY name').all();
}

function createUseCase(name) {
  return getDb()
    .prepare('INSERT INTO use_cases (name, created_at, enforce_expiry) VALUES (?, ?, 1)')
    .run(name.trim(), new Date().toISOString()).lastInsertRowid;
}

function renameUseCase(id, name) {
  getDb().prepare('UPDATE use_cases SET name = ? WHERE id = ?').run(name.trim(), id);
}

function updateUseCaseSettings(id, { enforceExpiry, reviewer }) {
  getDb().prepare('UPDATE use_cases SET enforce_expiry = ?, reviewer = ? WHERE id = ?')
    .run(enforceExpiry ? 1 : 0, reviewer?.trim() || null, id);
}

function updateUseCaseReviewer(id, reviewer) {
  getDb().prepare('UPDATE use_cases SET reviewer = ? WHERE id = ?')
    .run(reviewer?.trim() || null, id);
}

function deleteUseCase(id) {
  const db = getDb();
  db.transaction(() => {
    try {
      const versions = db.prepare('SELECT id FROM stig_versions WHERE use_case_id = ?').all(id);
      for (const v of versions) deleteVersion(v.id);
    } catch (_) {
      // use_case_id kolom bestaat nog niet — geen versies te verwijderen
    }
    db.prepare('DELETE FROM use_cases WHERE id = ?').run(id);
  })();
}

// ── Versions ──────────────────────────────────────────────────────────────────

function insertVersion(platform, version, releaseDate, sourceFormat, useCaseId = null) {
  const db  = getDb();
  const now = new Date().toISOString();

  // Zorg dat de kolom bestaat voordat we erin schrijven
  ensureUseCaseColumn(db);

  // Valideer useCaseId — kan verwijzen naar een inmiddels verwijderde use case
  if (useCaseId) {
    const exists = db.prepare('SELECT id FROM use_cases WHERE id = ?').get(useCaseId);
    if (!exists) useCaseId = null;
  }

  try {
    return db.prepare('INSERT INTO stig_versions (use_case_id, platform, version, release_date, imported_at, source_format) VALUES (?, ?, ?, ?, ?, ?)')
      .run(useCaseId, platform, version, releaseDate || null, now, sourceFormat)
      .lastInsertRowid;
  } catch (e) {
    if (!String(e).includes('use_case_id')) throw e;
    // Kolom bestaat nog steeds niet — insert zonder en koppel daarna
    const id = db.prepare('INSERT INTO stig_versions (platform, version, release_date, imported_at, source_format) VALUES (?, ?, ?, ?, ?)')
      .run(platform, version, releaseDate || null, now, sourceFormat)
      .lastInsertRowid;
    try {
      db.exec('ALTER TABLE stig_versions ADD COLUMN use_case_id INTEGER');
      if (useCaseId) db.prepare('UPDATE stig_versions SET use_case_id = ? WHERE id = ?').run(useCaseId, id);
    } catch (_) {}
    return id;
  }
}

function getAllVersions() {
  try {
    return getDb().prepare(`
      SELECT sv.*, uc.name AS use_case_name, uc.reviewer AS use_case_reviewer
      FROM stig_versions sv
      LEFT JOIN use_cases uc ON sv.use_case_id = uc.id
      ORDER BY uc.name, sv.platform, sv.imported_at DESC
    `).all();
  } catch (_) {
    // Fallback als use_case_id kolom nog niet bestaat (eerste keer opstarten na migratie)
    return getDb().prepare('SELECT * FROM stig_versions ORDER BY platform, imported_at DESC').all();
  }
}

function getVersionsByUseCase(useCaseId) {
  ensureUseCaseColumn(getDb());
  return getDb().prepare(`
    SELECT sv.*, uc.name AS use_case_name
    FROM stig_versions sv
    LEFT JOIN use_cases uc ON sv.use_case_id = uc.id
    WHERE sv.use_case_id = ?
    ORDER BY sv.platform, sv.imported_at DESC
  `).all(useCaseId);
}

function getVersionsByPlatform(platform) {
  return getDb().prepare('SELECT * FROM stig_versions WHERE platform = ? ORDER BY imported_at DESC').all(platform);
}

function getLatestVersionForPlatform(platform) {
  return getDb().prepare('SELECT * FROM stig_versions WHERE platform = ? ORDER BY imported_at DESC LIMIT 1').get(platform);
}

function deleteVersion(versionId) {
  const db = getDb();
  db.transaction(() => {
    const rules    = db.prepare('SELECT id FROM stig_rules WHERE version_id = ?').all(versionId);
    const ruleIds  = rules.map(r => r.id);
    if (ruleIds.length > 0) {
      const ph = ruleIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM rule_annotations WHERE rule_id IN (${ph})`).run(...ruleIds);
      db.prepare(`DELETE FROM version_mappings WHERE old_rule_id IN (${ph}) OR new_rule_id IN (${ph})`).run(...ruleIds, ...ruleIds);
      db.prepare('DELETE FROM stig_rules WHERE version_id = ?').run(versionId);
    }
    db.prepare('DELETE FROM stig_versions WHERE id = ?').run(versionId);
  })();
}

// ── Rules ─────────────────────────────────────────────────────────────────────

function insertRules(versionId, rules) {
  const stmt = getDb().prepare(`
    INSERT INTO stig_rules (version_id, vuln_id, stig_id, rule_title, severity, description, check_content, fix_text)
    VALUES (@versionId, @vuln_id, @stig_id, @rule_title, @severity, @description, @check_content, @fix_text)
  `);
  getDb().transaction(rules => { for (const r of rules) stmt.run({ ...r, versionId }); })(rules);
}

function getRulesByVersion(versionId) {
  return getDb().prepare('SELECT * FROM stig_rules WHERE version_id = ?').all(versionId);
}

function getRuleById(id) {
  return getDb().prepare('SELECT * FROM stig_rules WHERE id = ?').get(id);
}

function setRuleApplicability(ruleId, applicable) {
  getDb().prepare('UPDATE stig_rules SET applicable = ? WHERE id = ?')
    .run(applicable ? 1 : 0, ruleId);
}

// ── Annotations ───────────────────────────────────────────────────────────────

const EXPIRY_STATUSES = new Set(['comply', 'explain']);

function upsertAnnotation({ ruleId, status, notes, validYears = null, annotatedBy = null, enforceExpiry = true }) {
  const db          = getDb();
  const annotatedAt = new Date().toISOString();

  // Expiry alleen voor comply/explain én alleen als de use case het afdwingt
  const useExpiry = enforceExpiry && EXPIRY_STATUSES.has(status) && validYears;
  const expiresAt = useExpiry
    ? new Date(Date.now() + validYears * 365.25 * 24 * 60 * 60 * 1000).toISOString()
    : '';  // empty string — expires_at column is NOT NULL in schema

  const existing = db.prepare('SELECT id FROM rule_annotations WHERE rule_id = ?').get(ruleId);
  if (existing) {
    db.prepare('UPDATE rule_annotations SET status=?, notes=?, valid_years=?, annotated_at=?, expires_at=?, annotated_by=? WHERE rule_id=?')
      .run(status, notes, validYears, annotatedAt, expiresAt, annotatedBy, ruleId);
  } else {
    db.prepare('INSERT INTO rule_annotations (rule_id, status, notes, valid_years, annotated_at, expires_at, annotated_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(ruleId, status, notes, validYears, annotatedAt, expiresAt, annotatedBy);
  }
}

function getAnnotationByRule(ruleId) {
  return getDb().prepare('SELECT * FROM rule_annotations WHERE rule_id = ?').get(ruleId);
}

function deleteAnnotation(ruleId) {
  getDb().prepare('DELETE FROM rule_annotations WHERE rule_id = ?').run(ruleId);
}

function getAnnotationsByVersion(versionId) {
  return getDb().prepare(`
    SELECT ra.* FROM rule_annotations ra
    JOIN stig_rules sr ON ra.rule_id = sr.id
    WHERE sr.version_id = ?
  `).all(versionId);
}

function getExpiringAnnotations(withinDays = 30) {
  const threshold = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString();
  try {
    return getDb().prepare(`
      SELECT ra.*, sr.rule_title, sr.severity, sv.platform, sv.version, uc.name AS use_case_name
      FROM rule_annotations ra
      JOIN stig_rules    sr ON ra.rule_id    = sr.id
      JOIN stig_versions sv ON sr.version_id = sv.id
      LEFT JOIN use_cases uc ON sv.use_case_id = uc.id
      WHERE ra.expires_at != '' AND ra.expires_at <= ?
      ORDER BY ra.expires_at ASC
    `).all(threshold);
  } catch (_) {
    return getDb().prepare(`
      SELECT ra.*, sr.rule_title, sr.severity, sv.platform, sv.version
      FROM rule_annotations ra
      JOIN stig_rules    sr ON ra.rule_id    = sr.id
      JOIN stig_versions sv ON sr.version_id = sv.id
      WHERE ra.expires_at != '' AND ra.expires_at <= ?
      ORDER BY ra.expires_at ASC
    `).all(threshold);
  }
}

// ── Version mappings ──────────────────────────────────────────────────────────

function insertMappings(mappings) {
  const stmt = getDb().prepare('INSERT INTO version_mappings (old_rule_id, new_rule_id, confidence, match_method) VALUES (@old_rule_id, @new_rule_id, @confidence, @match_method)');
  getDb().transaction(m => { for (const r of m) stmt.run(r); })(mappings);
}

function getMappingsByNewVersion(newVersionId) {
  return getDb().prepare(`
    SELECT vm.*,
           old_r.rule_title AS old_title, old_r.vuln_id AS old_vuln_id,
           new_r.rule_title AS new_title, new_r.vuln_id AS new_vuln_id,
           ann.status AS carried_status, ann.notes AS carried_notes
    FROM version_mappings vm
    LEFT JOIN stig_rules old_r ON vm.old_rule_id = old_r.id
    LEFT JOIN stig_rules new_r ON vm.new_rule_id = new_r.id
    LEFT JOIN rule_annotations ann ON ann.rule_id = vm.new_rule_id
    WHERE new_r.version_id = ?
  `).all(newVersionId);
}

// ── Export helpers ────────────────────────────────────────────────────────────

function getRulesWithAnnotationsByVersion(versionId, onlyApplicable = true) {
  const scopeFilter = onlyApplicable ? ' AND (sr.applicable IS NULL OR sr.applicable = 1)' : '';
  return getDb().prepare(`
    SELECT sr.*, ra.status, ra.notes, ra.valid_years, ra.annotated_at, ra.expires_at, ra.annotated_by
    FROM stig_rules sr
    LEFT JOIN rule_annotations ra ON ra.rule_id = sr.id
    WHERE sr.version_id = ?${scopeFilter}
    ORDER BY sr.severity DESC, sr.vuln_id
  `).all(versionId);
}

function getVersionStats(useCaseId) {
  return getDb().prepare(`
    SELECT
      sv.id,
      sv.version,
      sv.platform,
      sv.release_date,
      sv.source_format,
      COUNT(sr.id)                                          AS rule_count,
      COUNT(ra.id)                                          AS annotated_count,
      SUM(CASE WHEN ra.status = 'comply'  THEN 1 ELSE 0 END) AS comply_count,
      SUM(CASE WHEN ra.expires_at != '' AND ra.expires_at <= datetime('now') AND ra.id IS NOT NULL THEN 1 ELSE 0 END) AS expired_count,
      SUM(CASE WHEN ra.expires_at != '' AND ra.expires_at > datetime('now') AND ra.expires_at <= datetime('now', '+30 days') AND ra.id IS NOT NULL THEN 1 ELSE 0 END) AS expiring_count,
      EXISTS (SELECT 1 FROM version_mappings vm2
              JOIN stig_rules nr ON vm2.new_rule_id = nr.id
              WHERE nr.version_id = sv.id) AS has_mappings
    FROM stig_versions sv
    LEFT JOIN stig_rules      sr ON sr.version_id = sv.id
    LEFT JOIN rule_annotations ra ON ra.rule_id   = sr.id
    WHERE sv.use_case_id = ?
    GROUP BY sv.id
    ORDER BY sv.platform, sv.imported_at DESC
  `).all(useCaseId);
}

function getDistinctPlatforms() {
  return getDb().prepare('SELECT DISTINCT platform FROM stig_versions ORDER BY platform').all().map(r => r.platform);
}

module.exports = {
  getDb,
  getUseCases, createUseCase, renameUseCase, deleteUseCase, updateUseCaseReviewer,
  insertVersion, getAllVersions, getVersionsByUseCase, getVersionsByPlatform, getLatestVersionForPlatform, deleteVersion,
  insertRules, getRulesByVersion, getRuleById, setRuleApplicability,
  upsertAnnotation, getAnnotationByRule, deleteAnnotation, getAnnotationsByVersion, getExpiringAnnotations,
  insertMappings, getMappingsByNewVersion,
  getRulesWithAnnotationsByVersion, getDistinctPlatforms, getVersionStats,
  updateUseCaseSettings,
};
