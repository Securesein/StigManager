import { useState, useEffect, useRef, useMemo } from 'react';
import RuleRow from '../components/RuleRow';

const savedScrollPos = {};

const SEVERITY_OPTIONS = ['All', 'high', 'medium', 'low'];
const STATUS_OPTIONS   = ['All', 'flagged', 'comply', 'explain', 'open', 'na', 'none'];
const STATUS_LABELS    = { comply: 'Compliant', explain: 'Explain', open: 'Open', na: 'N/A', none: 'No status', flagged: '⚑ Flagged' };
const SEV_LABELS       = { high: 'High', medium: 'Medium', low: 'Low' };
const SCOPE_OPTIONS    = [
  { value: 'all',      label: 'All rules' },
  { value: 'inscope',  label: 'In scope' },
  { value: 'outscope', label: 'Out of scope' },
];

const ALL_XLSX_COLUMNS = [
  { key: 'vuln_id',       label: 'Vul ID' },
  { key: 'stig_id',       label: 'Rule ID' },
  { key: 'rule_title',    label: 'Rule Title' },
  { key: 'fix_text',      label: 'Fix Text' },
  { key: 'severity',      label: 'Severity' },
  { key: 'status',        label: 'Status' },
  { key: 'notes',         label: 'Notes' },
  { key: 'description',   label: 'Discussion' },
  { key: 'check_content', label: 'Check Content' },
  { key: 'annotated_by',  label: 'Reviewer' },
  { key: 'expires_at',    label: 'Expires At' },
  { key: 'valid_years',   label: 'Valid (years)' },
];

const DEFAULT_XLSX_COLUMNS = ['vuln_id', 'stig_id', 'rule_title', 'fix_text', 'severity', 'status', 'notes'];
const LS_KEY = 'stig-xlsx-columns';

function loadXlsxColumns() {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) return JSON.parse(stored);
  } catch (_) {}
  return DEFAULT_XLSX_COLUMNS;
}

function XlsxColumnModal({ selected, onSave, onClose }) {
  const [cols, setCols] = useState(selected);

  function toggle(key) {
    setCols(c => c.includes(key) ? c.filter(k => k !== key) : [...c, key]);
  }

  function reset() { setCols(DEFAULT_XLSX_COLUMNS); }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-800">XLSX Columns</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <p className="text-xs text-gray-500 mb-3">Select which columns to include in the export.</p>

        <div className="space-y-1.5 mb-5">
          {ALL_XLSX_COLUMNS.map(c => (
            <label key={c.key} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={cols.includes(c.key)}
                onChange={() => toggle(c.key)}
                className="rounded border-gray-300 text-indigo-600"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{c.label}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Reset to default
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => { onSave(cols); onClose(); }}
            disabled={cols.length === 0}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RuleList({ version, onSelectRule, onBack }) {
  const [rules, setRules]             = useState([]);
  const [annotMap, setAnnotMap]       = useState({});
  const [filterSeverity, setSeverity] = useState('All');
  const [filterStatus, setStatus]     = useState('All');
  const [filterExpiring, setExpiring] = useState(false);
  const [search, setSearch]           = useState('');
  const [filterScope, setScope]        = useState('all');
  const [exporting, setExporting]     = useState(false);
  const [xlsxColumns, setXlsxColumns]   = useState(loadXlsxColumns);
  const [showColConfig, setColConfig]   = useState(false);
  const [reviewer, setReviewer]         = useState(version?.use_case_reviewer ?? '');
  const [editingReviewer, setEditing]   = useState(false);
  const listRef                         = useRef(null);

  useEffect(() => {
    if (!version) return;
    load();
    setReviewer(version.use_case_reviewer ?? '');
  }, [version]);

  // Restore scroll position after rules render
  useEffect(() => {
    if (rules.length > 0 && listRef.current && version?.id) {
      const pos = savedScrollPos[version.id];
      if (pos) listRef.current.scrollTop = pos;
    }
  }, [rules]);

  async function load() {
    const [rules, annotations] = await Promise.all([
      window.stig.getRules(version.id),
      window.stig.getAnnotationsByVersion(version.id),
    ]);
    setRules(rules);
    setAnnotMap(Object.fromEntries(annotations.map(a => [a.rule_id, a])));
  }

  async function handleExportCsv() {
    setExporting('csv');
    const csv      = await window.stig.exportCsv(version.id);
    const filename = `STIG_${version.platform.replace(' ', '_')}_${version.version}.csv`;
    await window.stig.saveFile(filename, csv);
    setExporting(false);
  }

  async function handleExportXlsx() {
    setExporting('xlsx');
    await window.stig.exportXlsx(version.id, xlsxColumns);
    setExporting(false);
  }

  async function saveReviewer() {
    setEditing(false);
    await window.stig.updateReviewer(version.use_case_id, reviewer);
  }

  function saveXlsxColumns(cols) {
    localStorage.setItem(LS_KEY, JSON.stringify(cols));
    setXlsxColumns(cols);
  }

  async function handleToggleApplicable(ruleId, currentApplicable) {
    const newVal = currentApplicable === 0 ? 1 : 0;
    await window.stig.setRuleApplicable(ruleId, newVal);
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, applicable: newVal } : r));
  }

  const filtered = useMemo(() => {
    return rules.filter(r => {
      const excluded = r.applicable === 0;

      if (filterScope === 'inscope'  &&  excluded) return false;
      if (filterScope === 'outscope' && !excluded) return false;

      if (filterSeverity !== 'All' && r.severity !== filterSeverity) return false;

      if (filterStatus !== 'All') {
        const status = annotMap[r.id]?.status ?? 'none';
        if (status !== filterStatus) return false;
      }

      if (filterExpiring) {
        const exp = annotMap[r.id]?.expires_at;
        if (!exp) return false;
        if ((new Date(exp) - Date.now()) / 86400000 > 30) return false;
      }

      if (search) {
        const q = search.toLowerCase();
        return (r.rule_title ?? '').toLowerCase().includes(q)
            || (r.vuln_id  ?? '').toLowerCase().includes(q)
            || (r.stig_id  ?? '').toLowerCase().includes(q);
      }

      return true;
    });
  }, [rules, annotMap, filterSeverity, filterStatus, filterExpiring, filterScope, search]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center gap-4 shrink-0">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm transition-colors">
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-800">
            {version?.platform} — {version?.version}
          </h2>
          <div className="flex items-center gap-1 mt-0.5">
            <p className="text-xs text-gray-400">{filtered.length} of {rules.length} rules</p>
            <span className="text-xs text-gray-300">·</span>
            {editingReviewer ? (
              <input
                autoFocus
                value={reviewer}
                onChange={e => setReviewer(e.target.value)}
                onBlur={saveReviewer}
                onKeyDown={e => { if (e.key === 'Enter') saveReviewer(); if (e.key === 'Escape') { setReviewer(version?.use_case_reviewer ?? ''); setEditing(false); } }}
                placeholder="Reviewer name…"
                className="text-xs px-1.5 py-0.5 border border-indigo-300 rounded outline-none text-gray-700 w-40"
              />
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                title="Set reviewer"
              >
                {reviewer ? `Reviewer: ${reviewer}` : '+ Add reviewer'}
              </button>
            )}
          </div>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCsv}
            disabled={!!exporting}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </button>

          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={handleExportXlsx}
              disabled={!!exporting}
              className="px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors border-r border-gray-300"
              title="Export to Excel"
            >
              {exporting === 'xlsx' ? 'Exporting…' : 'Export XLSX'}
            </button>
            <button
              onClick={() => setColConfig(true)}
              className="px-2 py-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors text-sm"
              title="Configure columns"
            >
              ⚙
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-3 items-center shrink-0">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title, ID..."
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-52"
        />

        <select
          value={filterSeverity}
          onChange={e => setSeverity(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        >
          {SEVERITY_OPTIONS.map(o => (
            <option key={o} value={o}>{o === 'All' ? 'All severities' : SEV_LABELS[o]}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={e => setStatus(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o} value={o}>{o === 'All' ? 'All statuses' : STATUS_LABELS[o]}</option>
          ))}
        </select>

        <select
          value={filterScope}
          onChange={e => setScope(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        >
          {SCOPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterExpiring}
            onChange={e => setExpiring(e.target.checked)}
            className="rounded"
          />
          Expiring soon
        </label>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto bg-white">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            No rules found
          </div>
        ) : (
          filtered.map(rule => (
            <RuleRow
              key={rule.id}
              rule={rule}
              annotation={annotMap[rule.id]}
              onToggleApplicable={handleToggleApplicable}
              onClick={() => {
                if (listRef.current && version?.id) {
                  savedScrollPos[version.id] = listRef.current.scrollTop;
                }
                onSelectRule(rule);
              }}
            />
          ))
        )}
      </div>

      {showColConfig && (
        <XlsxColumnModal
          selected={xlsxColumns}
          onSave={saveXlsxColumns}
          onClose={() => setColConfig(false)}
        />
      )}
    </div>
  );
}
