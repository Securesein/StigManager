import { useMemo, useState, useEffect, useRef } from 'react';

// ── Context menu ──────────────────────────────────────────────────────────────

function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-40"
      style={{ top: y, left: x }}
    >
      {items.map((item, i) =>
        item === 'divider'
          ? <div key={i} className="my-1 border-t border-gray-100" />
          : (
            <button
              key={i}
              onClick={() => { item.action(); onClose(); }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-gray-50 ${item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700'}`}
            >
              {item.label}
            </button>
          )
      )}
    </div>
  );
}

// ── Backup menu ───────────────────────────────────────────────────────────────

function BackupMenu({ onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-10 left-2 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-44"
    >
      <p className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Database</p>
      <button
        onClick={async () => { onClose(); await window.stig.backupDatabase(); }}
        className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
      >
        💾 Backup database
      </button>
      <button
        onClick={async () => {
          onClose();
          if (!window.confirm('Restore will replace ALL current data and restart the app. Continue?')) return;
          await window.stig.restoreDatabase();
        }}
        className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors"
      >
        ↩ Restore database...
      </button>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function UseCaseSettingsModal({ uc, onClose, onSaved }) {
  const [enforceExpiry, setEnforceExpiry] = useState(uc.enforce_expiry !== 0);
  const [reviewer, setReviewer]           = useState(uc.reviewer ?? '');
  const [saving, setSaving]               = useState(false);

  async function save() {
    setSaving(true);
    await window.stig.updateUseCaseSettings(uc.id, { enforceExpiry, reviewer });
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-base font-bold text-gray-800 mb-1">{uc.name}</h3>
        <p className="text-xs text-gray-400 mb-5">Use case settings</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reviewer</label>
            <input
              value={reviewer}
              onChange={e => setReviewer(e.target.value)}
              placeholder="Name or team (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Shown on the cover sheet of XLSX exports.</p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enforceExpiry}
              onChange={e => setEnforceExpiry(e.target.checked)}
              className="mt-0.5 rounded"
            />
            <div>
              <p className="text-sm font-medium text-gray-800">Enforce expiry timer</p>
              <p className="text-xs text-gray-400 mt-0.5">
                When enabled, Compliant and Explanation required annotations must have a validity period.
                Not applicable and Open never get a timer regardless of this setting.
              </p>
            </div>
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({
  useCases, versions,
  selectedVersionId, selectedUseCaseId,
  onSelectVersion, onSelectUseCase, onNavigateDashboard,
  expiringCount, onDeleteVersion, onUseCasesChanged,
}) {
  const [expandedUC, setExpandedUC]     = useState({});
  const [contextMenu, setContextMenu]   = useState(null);
  const [showBackup, setShowBackup]     = useState(false);
  const [renaming, setRenaming]         = useState(null);   // { id, name }
  const [settingsUC, setSettingsUC]     = useState(null);   // use case object voor settings modal
  const [addingUseCase, setAddingUseCase] = useState(false);
  const [newUCName, setNewUCName]         = useState('');
  const [ucError, setUcError]             = useState('');
  const savingRef                         = useRef(false);

  // Auto-expand use case that contains selected version
  useEffect(() => {
    if (selectedVersionId) {
      const v = versions.find(v => v.id === selectedVersionId);
      if (v?.use_case_id) setExpandedUC(e => ({ ...e, [v.use_case_id]: true }));
    }
  }, [selectedVersionId, versions]);

  const versionsByUseCase = useMemo(() => {
    const map = {};
    for (const uc of useCases) {
      map[uc.id] = versions.filter(v => v.use_case_id === uc.id);
    }
    return map;
  }, [useCases, versions]);

  function toggleUC(id) {
    setExpandedUC(e => ({ ...e, [id]: !e[id] }));
  }

  function rightClickUC(e, uc) {
    e.preventDefault();
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Rename', action: () => setRenaming({ id: uc.id, name: uc.name }) },
        { label: 'Settings', action: () => setSettingsUC(uc) },
        'divider',
        { label: 'Delete use case', danger: true, action: async () => {
          const vCount = versionsByUseCase[uc.id]?.length ?? 0;
          const msg = vCount > 0
            ? `Delete "${uc.name}"? This will also delete ${vCount} version(s) and all their annotations.`
            : `Delete "${uc.name}"?`;
          if (!window.confirm(msg)) return;
          await window.stig.deleteUseCase(uc.id);
          onUseCasesChanged();
        }},
      ],
    });
  }

  function rightClickVersion(e, v) {
    e.preventDefault();
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Remove version', danger: true, action: async () => {
          if (!window.confirm(`Delete ${v.platform} ${v.version}? This removes all rules and annotations.`)) return;
          await window.stig.deleteVersion(v.id);
          onDeleteVersion();
        }},
      ],
    });
  }

  async function saveNewUseCase() {
    if (savingRef.current) return;
    const name = newUCName.trim();
    if (!name) { setAddingUseCase(false); setNewUCName(''); return; }

    const duplicate = useCases.some(uc => uc.name.toLowerCase() === name.toLowerCase());
    if (duplicate) { setUcError('Name already exists'); return; }

    savingRef.current = true;
    setUcError('');
    try {
      await window.stig.createUseCase(name);
      setAddingUseCase(false);
      setNewUCName('');
      onUseCasesChanged();
    } catch (err) {
      setUcError('Failed to save');
    } finally {
      savingRef.current = false;
    }
  }

  function newUseCaseKeyDown(e) {
    if (e.key === 'Enter')  saveNewUseCase();
    if (e.key === 'Escape') { setAddingUseCase(false); setNewUCName(''); setUcError(''); }
  }

  async function finishRename(e) {
    if (e.key === 'Escape') { setRenaming(null); return; }
    if (e.key !== 'Enter' && e.type !== 'blur') return;
    const name = renaming.name.trim();
    if (!name) { setRenaming(null); return; }

    const duplicate = useCases.some(uc => uc.id !== renaming.id && uc.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      // Naam bestaat al — toon kort een rode rand en reset
      setRenaming(r => ({ ...r, name: r.name })); // force re-render
      return;
    }

    await window.stig.renameUseCase(renaming.id, name);
    setRenaming(null);
    onUseCasesChanged();
  }

  // Group versions by platform within a use case
  function platformsInUC(ucId) {
    const vs       = versionsByUseCase[ucId] ?? [];
    const platforms = [...new Set(vs.map(v => v.platform))].sort();
    return platforms.map(p => ({ platform: p, versions: vs.filter(v => v.platform === p) }));
  }

  return (
    <aside className="w-56 bg-gray-900 text-gray-300 flex flex-col shrink-0 overflow-y-auto">
      <div className="px-4 py-4 border-b border-gray-700">
        <h1 className="text-sm font-bold text-white tracking-wide">STIG Manager</h1>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {/* Dashboard */}
        <button
          onClick={onNavigateDashboard}
          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center justify-between"
        >
          <span>Dashboard</span>
          {expiringCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold leading-none">
              {expiringCount}
            </span>
          )}
        </button>

        {/* Use cases */}
        {useCases.length === 0 ? (
          <p className="px-4 pt-4 text-xs text-gray-600 italic">No use cases yet</p>
        ) : (
          useCases.map(uc => {
            const isExpanded = !!expandedUC[uc.id];
            const ucVersions = versionsByUseCase[uc.id] ?? [];

            return (
              <div key={uc.id} className="mt-2">
                {/* Use case header */}
                <div
                  className={`flex items-center group px-2 py-1 rounded mx-1 cursor-pointer transition-colors ${
                    selectedUseCaseId === uc.id ? 'bg-gray-700' : 'hover:bg-gray-800'
                  }`}
                  onClick={() => { toggleUC(uc.id); onSelectUseCase(uc); }}
                  onContextMenu={e => rightClickUC(e, uc)}
                >
                  <span className="text-gray-500 text-xs mr-1.5">{isExpanded ? '▾' : '▸'}</span>

                  {renaming?.id === uc.id ? (
                    <input
                      autoFocus
                      value={renaming.name}
                      onChange={e => setRenaming(r => ({ ...r, name: e.target.value }))}
                      onKeyDown={finishRename}
                      onBlur={finishRename}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 bg-gray-700 text-white text-xs px-1 rounded outline-none min-w-0"
                    />
                  ) : (
                    <span className="flex-1 text-xs font-semibold text-gray-300 uppercase tracking-wide truncate">
                      {uc.name}
                    </span>
                  )}

                  <span className="text-xs text-gray-600 ml-1 shrink-0">{ucVersions.length}</span>
                </div>

                {/* Versions under use case, grouped by platform */}
                {isExpanded && platformsInUC(uc.id).map(({ platform, versions: pvs }) => (
                  <div key={platform} className="ml-4 mt-1">
                    <p className="px-2 py-0.5 text-xs text-gray-600 truncate">{platform}</p>
                    {pvs.map(v => (
                      <div
                        key={v.id}
                        className={`flex items-center group rounded ml-1 mr-1 transition-colors ${
                          selectedVersionId === v.id ? 'bg-indigo-600' : 'hover:bg-gray-700'
                        }`}
                        onContextMenu={e => rightClickVersion(e, v)}
                      >
                        <button
                          onClick={() => onSelectVersion(v)}
                          className={`flex-1 text-left px-3 py-1.5 text-sm truncate ${
                            selectedVersionId === v.id ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          {v.version}
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Delete ${v.platform} ${v.version}?`)) return;
                            await window.stig.deleteVersion(v.id);
                            onDeleteVersion();
                          }}
                          className="opacity-0 group-hover:opacity-100 pr-2 text-gray-500 hover:text-red-400 text-xs transition-opacity"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })
        )}

        {/* Add use case */}
        {addingUseCase ? (
          <div className="px-3 mt-2">
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={newUCName}
                onChange={e => { setNewUCName(e.target.value); setUcError(''); }}
                onKeyDown={newUseCaseKeyDown}
                placeholder="Name…"
                className="flex-1 min-w-0 bg-gray-700 text-white text-xs px-2 py-1.5 rounded outline-none border border-indigo-500"
              />
              <button onClick={saveNewUseCase} className="text-xs text-indigo-400 hover:text-indigo-200 px-1 py-1" title="Save">✓</button>
              <button onClick={() => { setAddingUseCase(false); setNewUCName(''); setUcError(''); }} className="text-xs text-gray-500 hover:text-gray-300 px-1 py-1" title="Cancel">✕</button>
            </div>
            {ucError && <p className="text-xs text-red-400 mt-1">{ucError}</p>}
          </div>
        ) : (
          <button
            onClick={() => setAddingUseCase(true)}
            className="w-full text-left px-4 py-2 mt-2 text-xs text-gray-600 hover:text-gray-400 hover:bg-gray-800 transition-colors"
          >
            + New use case
          </button>
        )}
      </nav>

      {/* Settings / backup */}
      <div className="relative shrink-0 border-t border-gray-700 p-2">
        <button
          onClick={() => setShowBackup(s => !s)}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded transition-colors"
        >
          ⚙️ <span>Settings</span>
        </button>
        {showBackup && <BackupMenu onClose={() => setShowBackup(false)} />}
      </div>

      {settingsUC && (
        <UseCaseSettingsModal
          uc={settingsUC}
          onClose={() => setSettingsUC(null)}
          onSaved={onUseCasesChanged}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </aside>
  );
}
