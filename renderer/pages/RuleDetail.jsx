import { useState, useEffect } from 'react';
import TimerBadge from '../components/TimerBadge';

const STATUS_OPTIONS = [
  { value: 'open',    label: 'Open' },
  { value: 'comply',  label: 'Compliant' },
  { value: 'explain', label: 'Explanation required' },
  { value: 'na',      label: 'Not applicable' },
  { value: 'flagged', label: '⚑ Flagged — non-compliant, needs follow-up' },
];

const SEVERITY_STYLES = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-blue-100 text-blue-700',
};

function ContentBlock({ title, text, mono = false }) {
  if (!text) return null;
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{title}</h3>
      <p className={`text-sm text-gray-700 whitespace-pre-wrap leading-relaxed ${mono ? 'font-mono bg-gray-50 p-3 rounded-lg text-xs' : ''}`}>
        {text}
      </p>
    </section>
  );
}

const EXPIRY_STATUSES = ['comply', 'explain'];

export default function RuleDetail({ rule, onBack, onSaved, enforceExpiry = true }) {
  const [annotation, setAnnotation] = useState(null);
  const [form, setForm]             = useState({ status: 'open', notes: '', valid_years: 2, annotated_by: '', no_expiry: false });
  const [saving, setSaving]         = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!rule) return;
    window.stig.getAnnotation(rule.id).then(ann => {
      setAnnotation(ann);
      if (ann) {
        setForm({
          status:       ann.status,
          notes:        ann.notes ?? '',
          valid_years:  ann.valid_years ?? 2,
          annotated_by: ann.annotated_by ?? '',
          no_expiry:    !ann.expires_at,
        });
      } else {
        setForm({ status: 'open', notes: '', valid_years: 2, annotated_by: '', no_expiry: false });
      }
    });
  }, [rule]);

  function updateForm(patch) {
    setForm(f => ({ ...f, ...patch }));
  }

  async function save() {
    setSaving(true);
    try {
      const showExpiry = enforceExpiry && EXPIRY_STATUSES.includes(form.status) && !form.no_expiry;
      await window.stig.saveAnnotation({
        ruleId:        rule.id,
        status:        form.status,
        notes:         form.notes,
        validYears:    showExpiry ? form.valid_years : null,
        annotatedBy:   form.annotated_by || null,
        enforceExpiry: showExpiry,
      });
      const ann = await window.stig.getAnnotation(rule.id);
      setAnnotation(ann);
      setSavedFlash(true);
      onSaved?.();
      setTimeout(() => setSavedFlash(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (!rule) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-start gap-4 shrink-0">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm transition-colors mt-0.5 shrink-0">
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {rule.severity && (
              <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${SEVERITY_STYLES[rule.severity] ?? 'bg-gray-100 text-gray-500'}`}>
                {rule.severity}
              </span>
            )}
            {rule.vuln_id && <span className="text-xs font-mono text-gray-400">{rule.vuln_id}</span>}
            {rule.stig_id && <span className="text-xs font-mono text-gray-400">{rule.stig_id}</span>}
            {annotation?.expires_at && <TimerBadge expiresAt={annotation.expires_at} />}
          </div>
          <h2 className="text-base font-bold text-gray-800 leading-snug">{rule.rule_title}</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 grid grid-cols-1 lg:grid-cols-5 gap-6 max-w-6xl">
          <div className="lg:col-span-3 space-y-5">
            <ContentBlock title="Description" text={rule.description} />
            <ContentBlock title="Check" text={rule.check_content} mono />
            <ContentBlock title="Fix" text={rule.fix_text} mono />
          </div>

          <div className="lg:col-span-2">
            <div className={`bg-white border rounded-xl p-4 space-y-4 sticky top-6 ${form.status === 'flagged' ? 'border-rose-300' : 'border-gray-200'}`}>
              <h3 className="text-sm font-semibold text-gray-800">Annotation</h3>

              {form.status === 'flagged' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                  <span>⚑</span>
                  <span>Non-compliant — explanation still required</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => updateForm({ status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => updateForm({ notes: e.target.value })}
                  rows={6}
                  placeholder="Add a note..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                />
              </div>

              {(() => {
                const expiryApplies = enforceExpiry && EXPIRY_STATUSES.includes(form.status);
                return (
                  <div className="space-y-3">
                    {expiryApplies && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-gray-600">Valid (years)</label>
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={form.no_expiry}
                              onChange={e => updateForm({ no_expiry: e.target.checked })}
                              className="rounded"
                            />
                            <span className="text-xs text-gray-500">No expiry</span>
                          </label>
                        </div>
                        {!form.no_expiry && (
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={form.valid_years ?? 2}
                            onChange={e => updateForm({ valid_years: Number(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        )}
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Reviewer</label>
                      <input
                        value={form.annotated_by}
                        onChange={e => updateForm({ annotated_by: e.target.value })}
                        placeholder="Name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                );
              })()}

              {annotation?.annotated_at && (
                <p className="text-xs text-gray-400">
                  Updated: {new Date(annotation.annotated_at).toLocaleDateString('en-US')}
                  {annotation.expires_at && (
                    <> · Expires: {new Date(annotation.expires_at).toLocaleDateString('en-US')}</>
                  )}
                </p>
              )}

              <button
                onClick={save}
                disabled={saving}
                className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {savedFlash ? '✓ Saved' : saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
