import TimerBadge from './TimerBadge';

const SEVERITY_STYLES = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-blue-100 text-blue-700',
};

const STATUS_STYLES = {
  comply:   'bg-green-100 text-green-700',
  explain:  'bg-indigo-100 text-indigo-700',
  na:       'bg-gray-100 text-gray-500',
  open:     'bg-orange-100 text-orange-700',
  flagged:  'bg-rose-100 text-rose-700 ring-1 ring-rose-400',
};

const STATUS_LABELS = {
  comply:   'Compliant',
  explain:  'Explain',
  na:       'N/A',
  open:     'Open',
  flagged:  '⚑ Flagged',
};

function IconMinusCircle() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.5"/>
      <path d="M5 8h6"/>
    </svg>
  );
}

function IconPlusCircle() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.5"/>
      <path d="M8 5v6M5 8h6"/>
    </svg>
  );
}

export default function RuleRow({ rule, annotation, onToggleApplicable, onClick }) {
  const excluded = rule.applicable === 0;

  return (
    <div className={`group flex items-stretch border-b border-gray-100 ${excluded ? 'bg-gray-50' : ''}`}>

      {/* Scope toggle */}
      {onToggleApplicable && (
        <button
          onClick={() => onToggleApplicable(rule.id, rule.applicable)}
          className={`w-9 shrink-0 flex items-center justify-center transition-all duration-150 border-r ${
            excluded
              ? 'bg-rose-50 border-rose-100 text-rose-400 hover:bg-rose-100 hover:text-rose-600'
              : 'border-transparent text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-500'
          }`}
          title={excluded ? 'Include in scope' : 'Exclude from scope'}
        >
          {excluded ? <IconPlusCircle /> : <IconMinusCircle />}
        </button>
      )}

      {/* Main row */}
      <button
        onClick={onClick}
        className={`flex-1 min-w-0 text-left px-4 py-3 transition-colors flex items-start gap-3 hover:bg-gray-50 ${excluded ? 'opacity-50' : ''}`}
      >
        <span className={`shrink-0 mt-0.5 w-16 text-center py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${excluded ? 'bg-gray-100 text-gray-400' : (SEVERITY_STYLES[rule.severity] ?? 'bg-gray-100 text-gray-500')}`}>
          {rule.severity ?? '?'}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-xs text-gray-400 font-mono shrink-0">
              {rule.vuln_id ?? rule.stig_id ?? '—'}
            </span>
            {!excluded && annotation && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[annotation.status] ?? ''}`}>
                {STATUS_LABELS[annotation.status] ?? annotation.status}
              </span>
            )}
            {!excluded && annotation?.expires_at && <TimerBadge expiresAt={annotation.expires_at} />}
            {excluded && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">
                Out of scope
              </span>
            )}
          </div>
          <p className={`text-sm truncate ${excluded ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
            {rule.rule_title}
          </p>
        </div>

        <span className="shrink-0 text-gray-300 group-hover:text-gray-400 mt-0.5 transition-colors">›</span>
      </button>
    </div>
  );
}
