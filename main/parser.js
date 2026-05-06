const xml2js = require('xml2js');
const Papa   = require('papaparse');
const fs     = require('fs');
const path   = require('path');

// ── Normalisatie ──────────────────────────────────────────────────────────────

function normalizeSeverity(sev) {
  if (!sev) return null;
  const s = sev.toLowerCase().trim();
  if (s === 'high'   || s === 'i'   || s === 'cat i')   return 'high';
  if (s === 'medium' || s === 'ii'  || s === 'cat ii')  return 'medium';
  if (s === 'low'    || s === 'iii' || s === 'cat iii') return 'low';
  return s;
}

function stripXmlTags(str) {
  return (str || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function extractText(val) {
  if (!val) return '';
  if (typeof val === 'string') return stripXmlTags(val);
  if (typeof val === 'object') {
    const raw = (val._ || Object.values(val)[0] || '').toString();
    return stripXmlTags(raw);
  }
  return String(val).trim();
}

function extractDescription(val) {
  if (!val) return '';
  const raw = typeof val === 'string' ? val
    : typeof val === 'object' ? (val._ || val.VulnDiscussion || Object.values(val)[0] || '').toString()
    : String(val);

  // Probeer alleen de VulnDiscussion sectie te extraheren
  const match = raw.match(/<VulnDiscussion>([\s\S]*?)<\/VulnDiscussion>/i);
  if (match) return match[1].replace(/\s+/g, ' ').trim();

  // Fallback: strip alle tags
  return stripXmlTags(raw);
}

function normalizeRule(raw) {
  return {
    vuln_id:       raw.vuln_id       ? raw.vuln_id.trim()       : null,
    stig_id:       raw.stig_id       ? raw.stig_id.trim()       : null,
    rule_title:    (raw.rule_title   || '').trim(),
    severity:      normalizeSeverity(raw.severity),
    description:   (raw.description  || '').trim(),
    check_content: (raw.check_content || '').trim(),
    fix_text:      (raw.fix_text     || '').trim(),
  };
}

// ── XML / XCCDF parser ────────────────────────────────────────────────────────

async function parseXml(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed  = await xml2js.parseStringPromise(content, { explicitArray: false, mergeAttrs: false });

  // XCCDF kan als 'Benchmark' of 'cdf:Benchmark' staan
  const benchmark = parsed.Benchmark || parsed['cdf:Benchmark'];
  if (!benchmark) throw new Error('Ongeldig XCCDF-bestand: geen Benchmark element gevonden.');

  const rawGroups = benchmark.Group || benchmark['cdf:Group'];
  if (!rawGroups) throw new Error('Geen Group-elementen gevonden in XCCDF-bestand.');

  const groups = Array.isArray(rawGroups) ? rawGroups : [rawGroups];
  const rules  = [];

  for (const group of groups) {
    if (!group) continue;

    const rule = group.Rule || group['cdf:Rule'];
    if (!rule) continue;

    // Vuln-ID zit op de Group, STIG Rule-ID op de Rule
    const vulnId = (group.$ && group.$.id) || null;
    const stigId = (rule.$  && rule.$.id)  || null;
    const sev    = (rule.$  && rule.$.severity) || null;

    const title        = extractText(rule.title || rule['cdf:title']);
    const description  = extractDescription(rule.description || rule['cdf:description']);

    // Check content
    let checkContent = '';
    const check = rule.check || rule['cdf:check'];
    if (check) {
      const cc = check['check-content'] || check['cdf:check-content'];
      checkContent = extractText(cc);
    }

    // Fix text
    const fixRaw = rule.fixtext || rule['cdf:fixtext'];
    const fixText = extractText(fixRaw);

    rules.push(normalizeRule({
      vuln_id:       vulnId,
      stig_id:       stigId,
      rule_title:    title,
      severity:      sev,
      description,
      check_content: checkContent,
      fix_text:      fixText,
    }));
  }

  if (rules.length === 0) throw new Error('Geen regels gevonden in het XCCDF-bestand.');
  return rules;
}

// ── CSV parser ────────────────────────────────────────────────────────────────

// Aliassen dekken DISA-standaard en kleine variaties
const CSV_COLUMNS = {
  vuln_id:       ['Vul ID', 'Vuln ID', 'VulnID', 'V-ID', 'Vulnerability ID'],
  stig_id:       ['Rule ID', 'STIG ID', 'StigID', 'Rule-ID'],
  rule_title:    ['Rule Title', 'Title', 'Vulnerability Title'],
  severity:      ['Severity', 'Cat', 'Category'],
  description:   ['Discussion', 'Vuln Discussion', 'Vulnerability Discussion', 'Description'],
  check_content: ['Check Content', 'Check Text', 'Check'],
  fix_text:      ['Fix Text', 'Fix', 'Remediation'],
};

function findColumn(row, aliases) {
  for (const alias of aliases) {
    if (row[alias] !== undefined) return row[alias] || '';
  }
  return null;
}

function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const result  = Papa.parse(content, { header: true, skipEmptyLines: true });

  if (result.errors.length > 0) {
    const fatal = result.errors.filter(e => e.type === 'FieldMismatch' || e.type === 'MissingQuotes');
    if (fatal.length > 0) throw new Error(`CSV parse fout: ${fatal[0].message}`);
  }

  return result.data
    .filter(row => {
      const title = findColumn(row, CSV_COLUMNS.rule_title);
      return title !== null && title.trim() !== '';
    })
    .map(row => normalizeRule({
      vuln_id:       findColumn(row, CSV_COLUMNS.vuln_id),
      stig_id:       findColumn(row, CSV_COLUMNS.stig_id),
      rule_title:    findColumn(row, CSV_COLUMNS.rule_title) || '',
      severity:      findColumn(row, CSV_COLUMNS.severity),
      description:   findColumn(row, CSV_COLUMNS.description),
      check_content: findColumn(row, CSV_COLUMNS.check_content),
      fix_text:      findColumn(row, CSV_COLUMNS.fix_text),
    }));
}

// ── Metadata peek (zonder volledige parse) ────────────────────────────────────

function peekFromFilename(filePath, format) {
  const name = path.basename(filePath, path.extname(filePath));

  // Versie: match V2R2 patroon
  const vMatch = name.match(/V(\d+)R(\d+)/i);
  const version = vMatch ? `V${vMatch[1]}R${vMatch[2]}` : null;

  // Platform: verwijder U_ prefix en _STIG_... suffix, vervang _ door spatie
  let platform = name
    .replace(/^U_/i, '')
    .replace(/_STIG_.*/i, '')
    .replace(/_/g, ' ')
    .trim();

  return { platform: platform || null, version, releaseDate: null, format };
}

async function peekMetadata(filePath) {
  const format = detectFormat(filePath);

  if (format === 'xml') {
    try {
      const content   = fs.readFileSync(filePath, 'utf-8');
      const parsed    = await xml2js.parseStringPromise(content, { explicitArray: false });
      const benchmark = parsed.Benchmark || parsed['cdf:Benchmark'];

      if (benchmark) {
        // Titel → platform (verwijder "Security Technical Implementation Guide")
        const rawTitle = extractText(benchmark.title || benchmark['cdf:title']);
        const platform = rawTitle
          .replace(/\s*security\s+technical\s+implementation\s+guide/i, '')
          .replace(/\s*\bSTIG\b/i, '')
          .trim() || null;

        // Versie + release nummer
        const verNum = extractText(benchmark.version || benchmark['cdf:version'] || '');
        const plainTexts = benchmark['plain-text'] || benchmark['cdf:plain-text'];
        const plainArr   = plainTexts
          ? (Array.isArray(plainTexts) ? plainTexts : [plainTexts])
          : [];
        const releaseText = plainArr.find(t => t?.$ ?.id === 'release-info') ?? plainArr[0];
        const releaseStr  = extractText(releaseText);
        const relMatch    = releaseStr.match(/Release:\s*(\d+)/i);
        const relNum      = relMatch ? relMatch[1] : null;
        const version     = verNum && relNum ? `V${verNum}R${relNum}` : verNum ? `V${verNum}` : null;

        // Releasedatum
        const dateMatch   = releaseStr.match(/Benchmark\s+Date:\s*(.+)/i);
        let releaseDate   = null;
        if (dateMatch) {
          const d = new Date(dateMatch[1].trim());
          if (!isNaN(d)) releaseDate = d.toISOString().split('T')[0];
        }

        return { platform, version, releaseDate, format };
      }
    } catch (_) { /* val terug op bestandsnaam */ }
  }

  return peekFromFilename(filePath, format);
}

// ── Formaat detectie + hoofdexport ───────────────────────────────────────────

function detectFormat(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  if (ext === 'xml' || ext === 'xccdf') return 'xml';
  if (ext === 'csv') return 'csv';
  throw new Error(`Onbekend bestandsformaat: .${ext} — verwacht .xml, .xccdf of .csv`);
}

async function parseFile(filePath) {
  const format = detectFormat(filePath);
  const rules  = format === 'xml' ? await parseXml(filePath) : parseCsv(filePath);
  return { rules, format };
}

module.exports = { parseFile, parseXml, parseCsv, detectFormat, peekMetadata };
