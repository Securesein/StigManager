const { ipcMain, dialog, BrowserWindow, app } = require('electron');
const fs   = require('fs');
const path = require('path');
const db   = require('./db');
const { parseFile, peekMetadata } = require('./parser');
const { matchRules }             = require('./matcher');
const { downloadStig, cleanupTempFiles } = require('./downloader');
const { EXPIRY_WARNING_DAYS }    = require('../shared/constants');

// ── Gedeelde import logica ────────────────────────────────────────────────────

function runImport(rules, format, platform, version, releaseDate, compareWithVersionId = null, useCaseId = null) {
  const previousVersion = compareWithVersionId
    ? db.getAllVersions().find(v => v.id === compareWithVersionId)
    : null;

  const versionId = db.insertVersion(platform, version, releaseDate || null, format, useCaseId);

  db.insertRules(versionId, rules);
  const newRules = db.getRulesByVersion(versionId);

  let mappingCount = 0;

  if (previousVersion) {
    const oldRules = db.getRulesByVersion(previousVersion.id);
    const mappings = matchRules(oldRules, newRules);

    for (const mapping of mappings) {
      if (!mapping.old_rule_id || !mapping.new_rule_id) continue;

      // Alleen automatisch overnemen bij hoge confidence (≥ 0.85)
      // Medium confidence (0.75–0.85) wacht op gebruikersbevestiging in VersionCompare
      if (mapping.confidence < 0.85) continue;

      const oldAnnotation = db.getAnnotationByRule(mapping.old_rule_id);
      if (!oldAnnotation || !['comply', 'explain'].includes(oldAnnotation.status)) continue;

      db.upsertAnnotation({
        ruleId:      mapping.new_rule_id,
        status:      oldAnnotation.status,
        notes:       oldAnnotation.notes,
        validYears:  oldAnnotation.valid_years,
        annotatedBy: oldAnnotation.annotated_by,
      });
    }

    const storableMappings = mappings.filter(m => m.match_method !== 'new');
    db.insertMappings(storableMappings);
    mappingCount = mappings.length;
  }

  return { versionId, ruleCount: newRules.length, mappingCount };
}

// ── Bestand selecteren ────────────────────────────────────────────────────────

ipcMain.handle('stig:select-file', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open STIG file',
    filters: [{ name: 'STIG files', extensions: ['xml', 'xccdf', 'csv'] }],
    properties: ['openFile'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// ── Importeren ────────────────────────────────────────────────────────────────

ipcMain.handle('stig:peek-file', async (_, filePath) => {
  return peekMetadata(filePath);
});

ipcMain.handle('stig:import-file', async (_, filePath, platform, version, releaseDate, compareWithVersionId, useCaseId) => {
  const { rules, format } = await parseFile(filePath);
  return runImport(rules, format, platform, version, releaseDate, compareWithVersionId, useCaseId);
});

ipcMain.handle('stig:download-and-import', async (event, url, platform, version, releaseDate, compareWithVersionId, useCaseId) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { xmlPath, tempFiles, format } = await downloadStig(url, pct => {
    win?.webContents.send('stig:download-progress', pct);
  });
  try {
    const { rules } = await parseFile(xmlPath);
    return runImport(rules, format, platform, version, releaseDate, compareWithVersionId, useCaseId);
  } finally {
    cleanupTempFiles(tempFiles);
  }
});

// ── Lezen ─────────────────────────────────────────────────────────────────────

ipcMain.handle('stig:get-all-versions',      ()           => db.getAllVersions());
ipcMain.handle('stig:get-use-cases',         ()           => db.getUseCases());
ipcMain.handle('stig:create-use-case',       (_, name)    => db.createUseCase(name));
ipcMain.handle('stig:rename-use-case',       (_, id, name) => { db.renameUseCase(id, name); return true; });
ipcMain.handle('stig:delete-use-case',       (_, id)      => { db.deleteUseCase(id); return true; });
ipcMain.handle('stig:get-versions-by-use-case', (_, id)   => db.getVersionsByUseCase(id));
ipcMain.handle('stig:get-version-stats',        (_, id)   => db.getVersionStats(id));

ipcMain.handle('stig:get-rules', (_, versionId) => db.getRulesByVersion(versionId));

ipcMain.handle('stig:get-rule', (_, ruleId) => db.getRuleById(ruleId));

ipcMain.handle('stig:get-annotation', (_, ruleId) => db.getAnnotationByRule(ruleId));

ipcMain.handle('stig:get-expiring', (_, days = EXPIRY_WARNING_DAYS) => db.getExpiringAnnotations(days));

ipcMain.handle('stig:get-mappings', (_, versionId) => db.getMappingsByNewVersion(versionId));

ipcMain.handle('stig:get-annotations-by-version', (_, versionId) => db.getAnnotationsByVersion(versionId));

ipcMain.handle('stig:get-platforms', () => db.getDistinctPlatforms());

ipcMain.handle('stig:delete-version', (_, versionId) => {
  db.deleteVersion(versionId);
  return true;
});

// ── Mapping review (Accept / Reject) ─────────────────────────────────────────

// Accept: annotatie van oude regel overnemen naar nieuwe regel
ipcMain.handle('stig:accept-mapping', (_, oldRuleId, newRuleId) => {
  const oldAnnotation = db.getAnnotationByRule(oldRuleId);
  if (!oldAnnotation) return false;

  db.upsertAnnotation({
    ruleId:      newRuleId,
    status:      oldAnnotation.status,
    notes:       oldAnnotation.notes,
    validYears:  oldAnnotation.valid_years,
    annotatedBy: oldAnnotation.annotated_by,
  });
  return true;
});

// Reject: geen annotatie overnemen — nieuwe regel blijft zonder annotatie
ipcMain.handle('stig:reject-mapping', (_, newRuleId) => {
  db.deleteAnnotation(newRuleId);
  return true;
});

// ── Schrijven ─────────────────────────────────────────────────────────────────

ipcMain.handle('stig:save-annotation', (_, data) => {
  db.upsertAnnotation(data);
  return true;
});

ipcMain.handle('stig:update-use-case-settings', (_, id, settings) => {
  db.updateUseCaseSettings(id, settings);
  return true;
});

// ── Export ────────────────────────────────────────────────────────────────────

ipcMain.handle('stig:export-csv', (_, versionId) => {
  const rows   = db.getRulesWithAnnotationsByVersion(versionId);
  const header = 'Vul ID,Rule ID,Rule Title,Severity,Discussion,Check Content,Fix Text,Status,Notes,Valid Years,Expires At,Reviewer\n';
  const body   = rows.map(r => {
    const expiresAt = r.expires_at ? r.expires_at.split('T')[0] : '';
    return [
      r.vuln_id, r.stig_id, r.rule_title, r.severity,
      r.description, r.check_content, r.fix_text,
      r.status || '', r.notes || '',
      r.valid_years !== null && r.valid_years !== undefined ? r.valid_years : '',
      expiresAt,
      r.annotated_by || '',
    ].map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`).join(',');
  }).join('\n');
  return header + body;
});

// JSON export van één versie
ipcMain.handle('stig:export-version-json', (_, versionId) => {
  const version = db.getAllVersions().find(v => v.id === versionId);
  if (!version) throw new Error('Version not found');
  const data = { ...version, rules: db.getRulesWithAnnotationsByVersion(versionId) };
  return JSON.stringify(data, null, 2);
});

// JSON import van één versie (inclusief annotaties)
ipcMain.handle('stig:import-version-json', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Import version from JSON',
    filters: [{ name: 'JSON backup', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled) return null;

  const raw  = fs.readFileSync(result.filePaths[0], 'utf-8');
  const data = JSON.parse(raw);

  // Herstel of maak de use case aan
  let useCaseId = null;
  if (data.use_case_name) {
    const existing = db.getUseCases().find(uc => uc.name === data.use_case_name);
    useCaseId = existing ? existing.id : db.createUseCase(data.use_case_name);
  }

  const versionId = db.insertVersion(data.platform, data.version, data.release_date, data.source_format, useCaseId);

  const rules = data.rules ?? [];
  db.insertRules(versionId, rules);
  const inserted = db.getRulesByVersion(versionId);

  // Koppel annotaties aan de nieuwe rule IDs op basis van volgorde
  for (let i = 0; i < inserted.length; i++) {
    const r = rules[i];
    if (!r || !r.status) continue;
    db.upsertAnnotation({
      ruleId:      inserted[i].id,
      status:      r.status,
      notes:       r.notes,
      validYears:  r.valid_years ?? 2,
      annotatedBy: r.annotated_by ?? null,
    });
  }

  return { versionId, ruleCount: inserted.length };
});

// ── Database backup / restore ─────────────────────────────────────────────────

ipcMain.handle('stig:backup-database', async () => {
  const dbPath = path.join(app.getPath('userData'), 'stig-manager.db');
  const result = await dialog.showSaveDialog({
    title:       'Save database backup',
    defaultPath: `stig-manager-backup-${new Date().toISOString().split('T')[0]}.db`,
    filters:     [{ name: 'Database', extensions: ['db'] }],
  });
  if (result.canceled) return false;
  fs.copyFileSync(dbPath, result.filePath);
  return true;
});

ipcMain.handle('stig:restore-database', async () => {
  const result = await dialog.showOpenDialog({
    title:   'Restore database from backup',
    filters: [{ name: 'Database', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (result.canceled) return false;

  const dbPath = path.join(app.getPath('userData'), 'stig-manager.db');
  db.getDb().close();
  fs.copyFileSync(result.filePaths[0], dbPath);
  app.relaunch();
  app.exit(0);
  return true;
});

ipcMain.handle('stig:save-file', async (_, defaultName, content) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: defaultName.endsWith('.csv')
      ? [{ name: 'CSV', extensions: ['csv'] }]
      : [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled) return false;
  fs.writeFileSync(result.filePath, content, 'utf-8');
  return true;
});
