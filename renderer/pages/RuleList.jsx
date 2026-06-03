import { useState, useEffect, useMemo } from 'react';
import RuleRow from '../components/RuleRow';

const SEVERITY_OPTIONS = ['All', 'high', 'medium', 'low'];
const STATUS_OPTIONS   = ['All', 'flagged', 'comply', 'explain', 'open', 'na', 'none'];
const STATUS_LABELS    = { comply: 'Compliant', explain: 'Explain', open: 'Open', na: 'N/A', none: 'No status', flagged: '⚑ Flagged' };
const SEV_LABELS       = { high: 'High', medium: 'Medium', low: 'Low' };

export default function RuleList({ version, onSelectRule, onBack }) {
  const [rules, setRules]             = useState([]);
  const [annotMap, setAnnotMap]       = useState({});
  const [filterSeverity, setSeverity] = useState('All');
  const [filterStatus, setStatus]     = useState('All');
  const [filterExpiring, setExpiring] = useState(false);
  const [search, setSearch]           = useState('');
  const [exporting, setExporting]     = useState(false);

  useEffect(() => {
    if (!version) return;
    load();
  }, [version]);

  async function load() {
    const [rules, annotations] = await Promise.all([
      window.stig.getRules(version.id),
      window.stig.getAnnotationsByVersion(version.id),
    ]);
    setRules(rules);
    setAnnotMap(Object.fromEntries(annotations.map(a => [a.rule_id, a])));
  }

  async function handleExportCsv() {
    setExporting(true);
    const csv      = await window.stig.exportCsv(version.id);
    const filename = `STIG_${version.platform.replace(' ', '_')}_${version.version}.csv`;
    await window.stig.saveFile(filename, csv);
    setExporting(false);
  }

  const filtered = useMemo(() => {
    return rules.filter(r => {
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
  }, [rules, annotMap, filterSeverity, filterStatus, filterExpiring, search]);

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
          <p className="text-xs text-gray-400">{filtered.length} of {rules.length} rules</p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={exporting}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
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

      <div className="flex-1 overflow-y-auto bg-white">
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
              onClick={() => onSelectRule(rule)}
            />
          ))
        )}
      </div>
    </div>
  );
}
