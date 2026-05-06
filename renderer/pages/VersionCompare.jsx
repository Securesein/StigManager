import { useState, useEffect } from 'react';

const STATUS_LABELS = {
  comply:  'Compliant',
  explain: 'Explanation required',
  na:      'N/A',
  open:    'Open',
};

const STATUS_COLORS = {
  comply:  'bg-green-100 text-green-700',
  explain: 'bg-indigo-100 text-indigo-700',
  na:      'bg-gray-100 text-gray-500',
  open:    'bg-orange-100 text-orange-700',
};

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({ title, count, colorClass, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`mb-4 border rounded-xl overflow-hidden ${colorClass}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <span className="text-xs text-gray-500">{count} rule{count !== 1 ? 's' : ''} {open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="bg-white border-t border-gray-100">
          {count === 0
            ? <p className="px-4 py-3 text-sm text-gray-400 italic">No rules</p>
            : <div className="divide-y divide-gray-50">{children}</div>}
        </div>
      )}
    </div>
  );
}

// ── Simple read-only row (auto-carried / new-unmatched) ───────────────────────

function SimpleRow({ mapping }) {
  const title  = mapping.new_title  ?? mapping.old_title  ?? '—';
  const vulnId = mapping.new_vuln_id ?? mapping.old_vuln_id ?? '—';
  const isNew       = mapping.match_method === 'new';
  const isUnmatched = mapping.match_method === 'unmatched';

  return (
    <div className="px-4 py-2.5 flex items-start gap-3">
      <span className="text-xs font-mono text-gray-400 mt-0.5 w-24 shrink-0 truncate">{vulnId}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 truncate">{title}</p>
        <div className="flex gap-2 mt-0.5 flex-wrap">
          {mapping.carried_status && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[mapping.carried_status] ?? ''}`}>
              {STATUS_LABELS[mapping.carried_status] ?? mapping.carried_status}
            </span>
          )}
          {isNew       && <span className="text-xs text-blue-500 font-medium">New rule</span>}
          {isUnmatched && <span className="text-xs text-gray-400 font-medium">No match found in new version</span>}
        </div>
      </div>
    </div>
  );
}

// ── Review row met side-by-side vergelijking + Accept/Reject ──────────────────

function ReviewRow({ mapping, onAccept, onReject, decision }) {
  const [expanded, setExpanded] = useState(false);
  const [oldRule, setOldRule]   = useState(null);
  const [newRule, setNewRule]   = useState(null);
  const [oldAnn, setOldAnn]     = useState(null);
  const [loading, setLoading]   = useState(false);

  async function loadDetails() {
    if (oldRule) { setExpanded(true); return; }
    setLoading(true);
    const [or, nr, ann] = await Promise.all([
      window.stig.getRule(mapping.old_rule_id),
      window.stig.getRule(mapping.new_rule_id),
      window.stig.getAnnotation(mapping.old_rule_id),
    ]);
    setOldRule(or);
    setNewRule(nr);
    setOldAnn(ann);
    setLoading(false);
    setExpanded(true);
  }

  const vulnId = mapping.new_vuln_id ?? mapping.old_vuln_id ?? '—';
  const pct    = Math.round(mapping.confidence * 100);

  return (
    <div className={`transition-colors ${decision === 'accepted' ? 'bg-green-50' : decision === 'rejected' ? 'bg-red-50' : ''}`}>
      {/* Compact header row */}
      <div className="px-4 py-2.5 flex items-center gap-3">
        <span className="text-xs font-mono text-gray-400 w-24 shrink-0 truncate">{vulnId}</span>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-700 truncate">{mapping.new_title ?? '—'}</p>
          <p className="text-xs text-amber-600">
            {pct}% match via {mapping.match_method}
            {mapping.old_title !== mapping.new_title && (
              <span className="ml-2 text-gray-400">· title changed</span>
            )}
          </p>
        </div>

        {/* Status / decision */}
        {!decision && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={loadDetails}
              className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              {loading ? '...' : expanded ? 'Hide' : 'Compare'}
            </button>
            <button
              onClick={onAccept}
              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium"
            >
              ✓ Accept
            </button>
            <button
              onClick={onReject}
              className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors font-medium"
            >
              ✗ Reject
            </button>
          </div>
        )}

        {decision === 'accepted' && (
          <span className="shrink-0 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
            ✓ Accepted
          </span>
        )}
        {decision === 'rejected' && (
          <span className="shrink-0 text-xs font-medium text-red-600 bg-red-100 px-2 py-1 rounded-full">
            ✗ Rejected
          </span>
        )}
      </div>

      {/* Side-by-side detail panel */}
      {expanded && oldRule && newRule && (
        <div className="mx-4 mb-3 grid grid-cols-2 gap-3 text-xs border border-gray-200 rounded-lg overflow-hidden">
          {/* Old rule */}
          <div className="bg-red-50 p-3 space-y-2">
            <p className="font-semibold text-gray-600 uppercase tracking-wide text-xs">Previous version</p>
            <p className="font-medium text-gray-800">{oldRule.rule_title}</p>
            {oldAnn && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[oldAnn.status] ?? ''}`}>
                  {STATUS_LABELS[oldAnn.status] ?? oldAnn.status}
                </span>
                {oldAnn.notes && (
                  <span className="text-gray-500 italic truncate max-w-xs">"{oldAnn.notes}"</span>
                )}
              </div>
            )}
            {!oldAnn && <p className="text-gray-400 italic">No annotation</p>}
            {oldRule.description && (
              <p className="text-gray-600 line-clamp-3">{oldRule.description}</p>
            )}
          </div>

          {/* New rule */}
          <div className="bg-green-50 p-3 space-y-2">
            <p className="font-semibold text-gray-600 uppercase tracking-wide text-xs">New version</p>
            <p className="font-medium text-gray-800">{newRule.rule_title}</p>
            <p className="text-gray-400 italic">No annotation yet</p>
            {newRule.description && (
              <p className="text-gray-600 line-clamp-3">{newRule.description}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VersionCompare({ versionId, onDone }) {
  const [mappings, setMappings]   = useState([]);
  const [version, setVersion]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [decisions, setDecisions] = useState({}); // { [new_rule_id]: 'accepted' | 'rejected' }

  useEffect(() => { load(); }, [versionId]);

  async function load() {
    const [allVersions, mappings] = await Promise.all([
      window.stig.getAllVersions(),
      window.stig.getMappings(versionId),
    ]);
    setVersion(allVersions.find(v => v.id === versionId));
    setMappings(mappings);
    setLoading(false);
  }

  async function handleAccept(mapping) {
    await window.stig.acceptMapping(mapping.old_rule_id, mapping.new_rule_id);
    setDecisions(d => ({ ...d, [mapping.new_rule_id]: 'accepted' }));
  }

  async function handleReject(mapping) {
    await window.stig.rejectMapping(mapping.new_rule_id);
    setDecisions(d => ({ ...d, [mapping.new_rule_id]: 'rejected' }));
  }

  const autoCarried    = mappings.filter(m => m.confidence >= 0.85 && m.match_method !== 'new' && m.match_method !== 'unmatched');
  const needsReview    = mappings.filter(m => m.confidence >= 0.75 && m.confidence < 0.85);
  const newOrUnmatched = mappings.filter(m => m.match_method === 'new' || m.match_method === 'unmatched');

  const pendingCount = needsReview.filter(m => !decisions[m.new_rule_id]).length;
  const allReviewed  = pendingCount === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading comparison...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Version Comparison</h2>
          {version && (
            <p className="text-sm text-gray-500 mt-0.5">{version.platform} — {version.version}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <button
            onClick={onDone}
            disabled={!allReviewed && needsReview.length > 0}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Continue to rules →
          </button>
          {!allReviewed && needsReview.length > 0 && (
            <p className="text-xs text-amber-600">
              {pendingCount} rule{pendingCount !== 1 ? 's' : ''} still need{pendingCount === 1 ? 's' : ''} review
            </p>
          )}
        </div>
      </div>

      {/* ✅ Auto carried */}
      <Section
        title="✅ Automatically carried over"
        count={autoCarried.length}
        colorClass="border-green-200 bg-green-50"
      >
        {autoCarried.map(m => <SimpleRow key={m.id} mapping={m} />)}
      </Section>

      {/* ⚠️ Needs review */}
      <Section
        title="⚠️ Review these rules"
        count={needsReview.length}
        colorClass="border-amber-200 bg-amber-50"
      >
        {needsReview.map(m => (
          <ReviewRow
            key={m.id}
            mapping={m}
            decision={decisions[m.new_rule_id]}
            onAccept={() => handleAccept(m)}
            onReject={() => handleReject(m)}
          />
        ))}
      </Section>

      {/* 🆕 New / unmatched */}
      <Section
        title="🆕 New / removed"
        count={newOrUnmatched.length}
        colorClass="border-blue-200 bg-blue-50"
        defaultOpen={false}
      >
        {newOrUnmatched.map(m => <SimpleRow key={m.id} mapping={m} />)}
      </Section>
    </div>
  );
}
