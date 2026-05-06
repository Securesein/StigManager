import { useState, useEffect, useMemo, useRef } from 'react';

// ── Use case overview card ────────────────────────────────────────────────────

function UseCaseCard({ uc, versions, expiring, onClick }) {
  const ucVersions  = versions.filter(v => v.use_case_id === uc.id);
  const platforms   = [...new Set(ucVersions.map(v => v.platform))];
  const ucExpiring  = expiring.filter(i => ucVersions.some(v => v.platform === i.platform && v.version === i.version));
  const expired     = ucExpiring.filter(i => new Date(i.expires_at) < new Date());
  const soonExpire  = ucExpiring.filter(i => new Date(i.expires_at) >= new Date());

  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-800 group-hover:text-indigo-600 transition-colors">
          {uc.name}
        </h3>
        {ucExpiring.length > 0 && (
          <span className="text-xs font-medium bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
            {ucExpiring.length} expiring
          </span>
        )}
      </div>

      <div className="space-y-1.5 text-sm text-gray-500">
        <div className="flex justify-between">
          <span>Versions</span>
          <span className="font-medium text-gray-700">{ucVersions.length}</span>
        </div>
        <div className="flex justify-between">
          <span>Platforms</span>
          <span className="font-medium text-gray-700">{platforms.length > 0 ? platforms.join(', ') : '—'}</span>
        </div>
        {ucExpiring.length > 0 && (
          <div className="flex justify-between text-red-500">
            <span>{expired.length > 0 ? 'Expired' : 'Expiring soon'}</span>
            <span className="font-medium">
              {expired.length > 0 ? expired.length : soonExpire.length}
            </span>
          </div>
        )}
      </div>

      {ucVersions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-1">
          {ucVersions.slice(0, 4).map(v => (
            <span key={v.id} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono">
              {v.version}
            </span>
          ))}
          {ucVersions.length > 4 && (
            <span className="text-xs text-gray-400">+{ucVersions.length - 4} more</span>
          )}
        </div>
      )}

      {ucVersions.length === 0 && (
        <p className="mt-3 text-xs text-gray-400 italic">No versions imported yet</p>
      )}
    </button>
  );
}

// ── Use case detail ───────────────────────────────────────────────────────────


function VersionRowMenu({ stat, onExport, onDelete, onCompare }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!pos) return;
    function handleClick() { setPos(null); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [pos]);

  function openMenu(e) {
    e.stopPropagation();
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={openMenu}
        className="px-2 py-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors text-sm leading-none shrink-0"
        title="Actions"
      >
        ···
      </button>

      {pos && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-36"
          style={{ top: pos.top, right: pos.right }}
          onMouseDown={e => e.stopPropagation()}
        >
          {stat.has_mappings && (
            <button
              onClick={e => { e.stopPropagation(); setPos(null); onCompare(); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Compare ⟷
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); setPos(null); onExport(); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Export JSON ↓
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button
            onClick={e => { e.stopPropagation(); setPos(null); onDelete(); }}
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
}

function VersionRow({ stat, onOpen, onExport, onDelete, onCompare }) {
  const pct = stat.rule_count > 0 ? Math.round((stat.annotated_count / stat.rule_count) * 100) : 0;

  return (
    <div className="relative flex items-center hover:bg-gray-50 transition-colors group">
      {/* Klikbare zone — volledige breedte min de menu knop */}
      <button
        onClick={onOpen}
        className="flex items-center gap-3 px-3 py-2.5 flex-1 min-w-0 text-left"
      >
        <span className="text-sm font-semibold text-gray-800 w-14 shrink-0">{stat.version}</span>

        <span className="text-xs text-gray-400 w-20 shrink-0">
          {stat.release_date
            ? new Date(stat.release_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
            : '—'}
        </span>

        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-24">
            <div className="bg-indigo-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-gray-400 shrink-0">{stat.annotated_count}/{stat.rule_count}</span>
        </div>

        {stat.expired_count  > 0 && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium shrink-0">🔴 {stat.expired_count}</span>}
        {stat.expiring_count > 0 && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-medium shrink-0">🟡 {stat.expiring_count}</span>}
      </button>

      {/* Menu knop buiten de button zodat clicks niet botsen */}
      <div className="pr-2 shrink-0">
        <VersionRowMenu
          stat={stat}
          onExport={onExport}
          onDelete={onDelete}
          onCompare={onCompare}
        />
      </div>
    </div>
  );
}

function UseCaseDetail({ selectedUseCase, versions, onSelectVersion, onImportDone, onViewComparison }) {
  const [stats, setStats]               = useState([]);
  const [showImport, setShowImport]     = useState(false);
  const [importMode, setImportMode]     = useState('file');
  const [form, setForm]                 = useState({ filePath: null, url: '', platform: '', version: '', releaseDate: '', compareWithVersionId: '' });
  const [downloadProgress, setProgress] = useState(null);
  const [importing, setImporting]       = useState(false);
  const [importError, setImportError]   = useState(null);

  const ucVersions = versions.filter(v => v.use_case_id === selectedUseCase.id);

  useEffect(() => {
    window.stig.getVersionStats(selectedUseCase.id).then(setStats);
  }, [selectedUseCase, versions]);

  useEffect(() => {
    if (!showImport) return;
    window.stig.onDownloadProgress(pct => setProgress(pct));
    return () => window.stig.offDownloadProgress();
  }, [showImport]);

  function updateForm(patch) { setForm(f => ({ ...f, ...patch })); }

  async function selectFile() {
    const filePath = await window.stig.selectFile();
    if (!filePath) return;
    updateForm({ filePath });
    try {
      const meta = await window.stig.peekFile(filePath);
      updateForm({ platform: meta.platform || form.platform, version: meta.version || form.version, releaseDate: meta.releaseDate || form.releaseDate });
    } catch (_) {}
  }

  async function doImport() {
    const platform = form.platform.trim();
    const version  = form.version.trim();
    if (importMode !== 'json') {
      if (!platform || !version) { setImportError('Please enter a platform and version number.'); return; }
      if (importMode === 'file' && !form.filePath) { setImportError('Please select a file.'); return; }
      if (importMode === 'url'  && !form.url.trim()) { setImportError('Please enter a URL.'); return; }
    }
    setImporting(true);
    setImportError(null);
    if (importMode === 'url') setProgress(0);
    try {
      let result;
      const compareId = form.compareWithVersionId ? Number(form.compareWithVersionId) : null;
      if (importMode === 'json') {
        result = await window.stig.importVersionJson();
        if (!result) { setImporting(false); return; }
      } else if (importMode === 'file') {
        result = await window.stig.importFile(form.filePath, platform, version, form.releaseDate || null, compareId, selectedUseCase.id);
      } else {
        result = await window.stig.downloadAndImport(form.url.trim(), platform, version, form.releaseDate || null, compareId, selectedUseCase.id);
      }
      closeImport();
      onImportDone(result.versionId, result.mappingCount > 0);
    } catch (e) {
      setImportError(e.message ?? 'Import failed.');
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  function closeImport() {
    setShowImport(false);
    setImportError(null);
    setProgress(null);
    setForm({ filePath: null, url: '', platform: '', version: '', releaseDate: '', compareWithVersionId: '' });
  }

  const platforms  = [...new Set(stats.map(s => s.platform))].sort();
  const byPlatform = Object.fromEntries(platforms.map(p => [p, stats.filter(s => s.platform === p)]));

  const totalExpired   = stats.reduce((s, v) => s + v.expired_count,  0);
  const totalExpiring  = stats.reduce((s, v) => s + v.expiring_count, 0);

  async function handleDelete(stat) {
    if (!window.confirm(`Delete ${stat.platform} ${stat.version}?`)) return;
    await window.stig.deleteVersion(stat.id);
    onImportDone(null, false);
  }

  async function handleExport(stat) {
    const json = await window.stig.exportVersionJson(stat.id);
    const filename = `STIG_${stat.platform.replace(/[^a-z0-9]/gi, '_')}_${stat.version}.json`;
    await window.stig.saveFile(filename, json);
  }

  function openVersion(stat) {
    const v = ucVersions.find(v => v.id === stat.id);
    if (v) onSelectVersion(v);
  }

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">{selectedUseCase.name}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {stats.length} version{stats.length !== 1 ? 's' : ''} · {platforms.length} platform{platforms.length !== 1 ? 's' : ''}
            {totalExpired > 0  && ` · 🔴 ${totalExpired} expired`}
            {totalExpiring > 0 && ` · 🟡 ${totalExpiring} expiring`}
          </p>
        </div>
        <button onClick={() => setShowImport(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
          + Import STIG
        </button>
      </div>

      {/* Platform groups */}
      {stats.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
          No STIG versions imported yet.<br />Click <strong>+ Import STIG</strong> to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {platforms.map(platform => (
            <div key={platform} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Platform header */}
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{platform}</span>
                <span className="text-xs text-gray-400">{byPlatform[platform].length} version{byPlatform[platform].length !== 1 ? 's' : ''}</span>
              </div>
              {/* Column headers */}
              <div className="flex items-center gap-3 px-3 py-1 border-b border-gray-50">
                <span className="text-xs text-gray-400 w-14">Version</span>
                <span className="text-xs text-gray-400 w-20">Release</span>
                <span className="text-xs text-gray-400 flex-1">Annotated</span>
              </div>
              {/* Version rows */}
              <div className="divide-y divide-gray-50">
                {byPlatform[platform].map(stat => (
                  <VersionRow
                    key={stat.id}
                    stat={stat}
                    onOpen={() => openVersion(stat)}
                    onExport={() => handleExport(stat)}
                    onDelete={() => handleDelete(stat)}
                    onCompare={() => onViewComparison(stat.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="mb-5">
              <h3 className="text-lg font-bold text-gray-800">Import STIG</h3>
              <p className="text-xs text-indigo-600 mt-0.5">→ {selectedUseCase.name}</p>
            </div>
            <div className="flex border-b border-gray-200 mb-5">
              {[{ id: 'file', label: 'File' }, { id: 'url', label: 'Download via URL' }, { id: 'json', label: 'JSON backup' }].map(({ id, label }) => (
                <button key={id} onClick={() => { setImportMode(id); setImportError(null); }}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${importMode === id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="space-y-4">
              {importMode === 'json' ? (
                <div className="py-6 text-center space-y-3">
                  <p className="text-2xl">📦</p>
                  <p className="text-sm text-gray-700 font-medium">Restore a version from a JSON backup</p>
                  <p className="text-xs text-gray-400">A file picker will open when you click Import.</p>
                </div>
              ) : importMode === 'file' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">File (.xml, .xccdf, .csv)</label>
                  <div className="flex gap-2">
                    <input readOnly value={form.filePath ? form.filePath.split('/').pop() : ''} placeholder="No file selected" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-500 bg-gray-50 cursor-default" />
                    <button onClick={selectFile} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Browse</button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                  <input value={form.url} onChange={e => updateForm({ url: e.target.value })} placeholder="https://dl.dod.cyber.mil/..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
                </div>
              )}
              {importMode !== 'json' && <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                  <input list="plat-list" value={form.platform} onChange={e => updateForm({ platform: e.target.value })} placeholder="e.g. iOS, Android Enterprise..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <datalist id="plat-list">
                    {[...new Set(versions.map(v => v.platform))].map(p => <option key={p} value={p} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                  <input value={form.version} onChange={e => updateForm({ version: e.target.value })} placeholder="V2R1" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Release date (optional)</label>
                  <input type="date" value={form.releaseDate} onChange={e => updateForm({ releaseDate: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                {ucVersions.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Compare against <span className="text-gray-400 font-normal">(optional)</span></label>
                    <select value={form.compareWithVersionId} onChange={e => updateForm({ compareWithVersionId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                      <option value="">— No comparison —</option>
                      {ucVersions.map(v => <option key={v.id} value={v.id}>{v.platform} {v.version}</option>)}
                    </select>
                  </div>
                )}
              </>}
              {importMode === 'url' && downloadProgress !== null && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Downloading...</span><span>{downloadProgress}%</span></div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5"><div className="bg-indigo-600 h-1.5 rounded-full transition-all" style={{ width: `${downloadProgress}%` }} /></div>
                </div>
              )}
              {importError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{importError}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={closeImport} disabled={importing} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={doImport} disabled={importing} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {importing ? 'Importing...' : importMode === 'json' ? '📦 Select file' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard({ useCases, versions, selectedUseCase, onSelectVersion, onSelectUseCase, onImportDone, onUseCasesChanged, onViewComparison }) {
  const [expiring, setExpiring] = useState([]);

  useEffect(() => {
    window.stig.getExpiringItems(30).then(setExpiring);
  }, [versions]);

  if (selectedUseCase) {
    return (
      <UseCaseDetail
        selectedUseCase={selectedUseCase}
        versions={versions}
        onSelectVersion={onSelectVersion}
        onImportDone={onImportDone}
        onViewComparison={onViewComparison}
      />
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">Dashboard</h2>
      </div>

      {useCases.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
          <p className="text-3xl mb-3">📁</p>
          <p className="font-medium text-gray-600 mb-1">No use cases yet</p>
          <p>Create a use case in the sidebar to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {useCases.map(uc => (
            <UseCaseCard
              key={uc.id}
              uc={uc}
              versions={versions}
              expiring={expiring}
              onClick={() => onSelectUseCase(uc)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
