const { ipcMain, dialog, app } = require('electron');
const fs      = require('fs');
const path    = require('path');
const ExcelJS = require('exceljs');
const db      = require('./db');
const { parseFile, peekMetadata } = require('./parser');
const { matchRules }             = require('./matcher');
const { EXPIRY_WARNING_DAYS }    = require('../shared/constants');

// ── XLSX export helpers ───────────────────────────────────────────────────────

const XLSX_COLUMNS = [
  { key: 'vuln_id',       header: 'Vul ID',         width: 12 },
  { key: 'stig_id',       header: 'Rule ID',         width: 28 },
  { key: 'rule_title',    header: 'Rule Title',      width: 44 },
  { key: 'severity',      header: 'Severity',        width: 12 },
  { key: 'description',   header: 'Discussion',      width: 56 },
  { key: 'check_content', header: 'Check Content',   width: 56 },
  { key: 'fix_text',      header: 'Fix Text',        width: 56 },
  { key: 'status',        header: 'Status',          width: 16 },
  { key: 'notes',         header: 'Notes',           width: 56 },
  { key: 'annotated_by',  header: 'Reviewer',        width: 18 },
  { key: 'expires_at',    header: 'Expires At',      width: 14 },
  { key: 'valid_years',   header: 'Valid (years)',   width: 12 },
];

const STATUS_STYLE = {
  comply:  { fill: 'C6EFCE', font: '375623', label: 'Compliant' },
  explain: { fill: 'BDD7EE', font: '1F4E79', label: 'Explanation Required' },
  na:      { fill: 'EDEDED', font: '595959', label: 'N/A' },
  open:    { fill: 'FFEB9C', font: '7F6000', label: 'Open' },
  flagged: { fill: 'FFC7CE', font: '9C0006', label: '⚑ Flagged' },
};

const SEVERITY_STYLE = {
  high:   { fill: 'FFC7CE', font: '9C0006' },
  medium: { fill: 'FFEB9C', font: '7F6000' },
  low:    { fill: 'DDEBF7', font: '1F4E79' },
};

function addCoverSheet(workbook, meta, rows) {
  const cover = workbook.addWorksheet('Cover');
  cover.showGridLines = false;
  cover.views = [{ showGridLines: false }];
  cover.columns = [
    { width: 3 },
    { width: 22 },
    { width: 36 },
    { width: 16 },
  ];

  const NAV  = 'FF1E3A5F';
  const WHITE = 'FFFFFFFF';
  const LIGHT = 'FFF0F4FA';
  const GRAY  = 'FF6B7280';

  function blank(n = 1) { for (let i = 0; i < n; i++) cover.addRow([]); }

  function navCell(row, col, value, opts = {}) {
    const cell = row.getCell(col);
    cell.value = value;
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAV } };
    cell.font  = { name: 'Calibri', color: { argb: WHITE }, bold: opts.bold ?? false, size: opts.size ?? 11 };
    cell.alignment = { vertical: 'middle', horizontal: opts.align ?? 'left', indent: opts.indent ?? 0 };
  }

  // ── Header block ──────────────────────────────────────────────────────────
  const h1 = cover.addRow([]); h1.height = 14;
  [1, 2, 3, 4].forEach(c => navCell(h1, c, ''));

  const h2 = cover.addRow([]); h2.height = 44;
  navCell(h2, 1, '');
  navCell(h2, 2, 'STIG Compliance Review', { bold: true, size: 22, align: 'left', indent: 1 });
  cover.mergeCells(h2.number, 2, h2.number, 4);

  const h3 = cover.addRow([]); h3.height = 26;
  navCell(h3, 1, '');
  navCell(h3, 2, meta.useCaseName ?? '—', { size: 13, align: 'left', indent: 1 });
  cover.mergeCells(h3.number, 2, h3.number, 4);

  const h4 = cover.addRow([]); h4.height = 14;
  [1, 2, 3, 4].forEach(c => navCell(h4, c, ''));

  blank(2);

  // ── Detail rows ───────────────────────────────────────────────────────────
  function detailRow(label, value) {
    const row = cover.addRow([]); row.height = 22;
    const lc = row.getCell(2);
    lc.value = label;
    lc.font  = { name: 'Calibri', color: { argb: GRAY }, size: 10, bold: true };
    lc.alignment = { vertical: 'middle' };
    const vc = row.getCell(3);
    vc.value = value;
    vc.font  = { name: 'Calibri', size: 11 };
    vc.alignment = { vertical: 'middle' };
  }

  detailRow('Platform',     meta.platform ?? '—');
  detailRow('Version',      meta.version  ?? '—');
  detailRow('Release date', meta.releaseDate ? meta.releaseDate.split('T')[0] : '—');
  detailRow('Export date',  meta.exportDate);
  if (meta.reviewer) detailRow('Reviewer', meta.reviewer);

  blank(2);

  // ── Summary table (static counts at export time) ──────────────────────────
  const counts = { comply: 0, explain: 0, flagged: 0, open: 0, na: 0, none: 0 };
  rows.forEach(r => {
    const s = r.status ?? 'none';
    if (s in counts) counts[s]++; else counts.none++;
  });

  const SUMMARY_ITEMS = [
    { label: 'Total rules',          value: rows.length,    bg: NAV,        fg: WHITE,      bold: true  },
    { label: 'Compliant',            value: counts.comply,  bg: 'FF375623', fg: WHITE,      bold: false },
    { label: 'Explanation required', value: counts.explain, bg: 'FF1F4E79', fg: WHITE,      bold: false },
    { label: '⚑ Flagged',           value: counts.flagged, bg: 'FF9C0006', fg: WHITE,      bold: false },
    { label: 'Open',                 value: counts.open,    bg: 'FF7F6000', fg: WHITE,      bold: false },
    { label: 'N/A',                  value: counts.na,      bg: 'FF595959', fg: WHITE,      bold: false },
    { label: 'No status',            value: counts.none,    bg: 'FFD1D5DB', fg: 'FF111827', bold: false },
  ];

  const shdr = cover.addRow([]);
  shdr.height = 20;
  const shdrLabel = shdr.getCell(2);
  shdrLabel.value = 'Summary';
  shdrLabel.font  = { name: 'Calibri', bold: true, size: 11, color: { argb: NAV } };
  shdrLabel.alignment = { vertical: 'middle' };

  blank(1);

  SUMMARY_ITEMS.forEach(item => {
    const row = cover.addRow([]);
    row.height = 22;

    const lc = row.getCell(2);
    lc.value = item.label;
    lc.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.bg } };
    lc.font  = { name: 'Calibri', bold: item.bold, size: 10, color: { argb: item.fg } };
    lc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    lc.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };

    const vc = row.getCell(3);
    vc.value = item.value;
    vc.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    vc.font  = { name: 'Calibri', bold: item.bold, size: 10 };
    vc.alignment = { vertical: 'middle', horizontal: 'center' };
    vc.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
  });

  // Fill all cells in the header columns with the nav colour so the sheet looks clean
  cover.eachRow(row => {
    [1, 4].forEach(c => {
      const cell = row.getCell(c);
      if (!cell.fill?.fgColor) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      }
    });
  });
}

function buildXlsx(rows, selectedKeys, meta) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'STIG Manager';

  const cols = XLSX_COLUMNS.filter(c => selectedKeys.includes(c.key));
  addCoverSheet(workbook, meta, rows);

  const sheet = workbook.addWorksheet('STIG Review', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  sheet.columns = cols.map(c => ({ key: c.key, width: c.width }));

  // Header row
  const headerRow = sheet.addRow(cols.map(c => c.header));
  headerRow.height = 26;
  headerRow.eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border = {
      top:    { style: 'thin', color: { argb: 'FF1E3A5F' } },
      left:   { style: 'thin', color: { argb: 'FF1E3A5F' } },
      bottom: { style: 'thin', color: { argb: 'FF1E3A5F' } },
      right:  { style: 'thin', color: { argb: 'FF1E3A5F' } },
    };
  });

  // Data rows
  rows.forEach((r, i) => {
    const isEven    = i % 2 === 0;
    const isFlagged = r.status === 'flagged';
    const rowBg     = isFlagged ? 'FFFFF0F0' : (isEven ? 'FFFFFFFF' : 'FFF5F7FA');
    const values = cols.map(c => {
      if (c.key === 'expires_at') return r.expires_at ? r.expires_at.split('T')[0] : '';
      if (c.key === 'status')     return STATUS_STYLE[r.status]?.label ?? r.status ?? '';
      return r[c.key] ?? '';
    });

    const dataRow = sheet.addRow(values);

    dataRow.eachCell({ includeEmpty: true }, (cell, colIdx) => {
      const colKey = cols[colIdx - 1]?.key;
      let bg        = rowBg;
      let fontColor = 'FF000000';

      if (colKey === 'status' && r.status && STATUS_STYLE[r.status]) {
        bg        = 'FF' + STATUS_STYLE[r.status].fill;
        fontColor = 'FF' + STATUS_STYLE[r.status].font;
      } else if (colKey === 'severity' && r.severity && SEVERITY_STYLE[r.severity]) {
        bg        = 'FF' + SEVERITY_STYLE[r.severity].fill;
        fontColor = 'FF' + SEVERITY_STYLE[r.severity].font;
      }

      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font      = { size: 10, name: 'Calibri', color: { argb: fontColor } };
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border    = {
        top:    { style: 'hair', color: { argb: 'FFD0D5DD' } },
        left:   { style: 'hair', color: { argb: 'FFD0D5DD' } },
        bottom: { style: 'hair', color: { argb: 'FFD0D5DD' } },
        right:  { style: 'hair', color: { argb: 'FFD0D5DD' } },
      };
    });
  });

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return workbook;
}

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

ipcMain.handle('stig:update-reviewer', (_, id, reviewer) => {
  db.updateUseCaseReviewer(id, reviewer);
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

ipcMain.handle('stig:export-xlsx', async (_, versionId, selectedColumnKeys) => {
  const version = db.getAllVersions().find(v => v.id === versionId);
  if (!version) return false;

  const result = await dialog.showSaveDialog({
    title:       'Export XLSX',
    defaultPath: `STIG_${version.platform.replace(/[^a-z0-9]/gi, '_')}_${version.version}.xlsx`,
    filters:     [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  });
  if (result.canceled) return false;

  const rows = db.getRulesWithAnnotationsByVersion(versionId);
  const meta = {
    useCaseName: version.use_case_name ?? null,
    platform:    version.platform,
    version:     version.version,
    releaseDate: version.release_date,
    exportDate:  new Date().toISOString().split('T')[0],
    reviewer:    version.use_case_reviewer ?? null,
  };
  const workbook = buildXlsx(rows, selectedColumnKeys, meta);
  await workbook.xlsx.writeFile(result.filePath);
  return true;
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
