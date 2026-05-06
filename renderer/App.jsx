import { useState, useEffect, useCallback } from 'react';
import Sidebar        from './components/Sidebar';
import Dashboard      from './pages/Dashboard';
import RuleList       from './pages/RuleList';
import RuleDetail     from './pages/RuleDetail';
import VersionCompare from './pages/VersionCompare';

export default function App() {
  const [useCases, setUseCases]               = useState([]);
  const [versions, setVersions]               = useState([]);
  const [currentPage, setCurrentPage]         = useState('dashboard');
  const [selectedUseCase, setSelectedUseCase] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [selectedRule, setSelectedRule]       = useState(null);
  const [compareVersionId, setCompareVersionId] = useState(null);
  const [expiringCount, setExpiringCount]     = useState(0);

  const loadAll = useCallback(async () => {
    const [uc, v, exp] = await Promise.all([
      window.stig.getUseCases(),
      window.stig.getAllVersions(),
      window.stig.getExpiringItems(30),
    ]);
    setUseCases(uc);
    setVersions(v);
    setExpiringCount(exp.length);
  }, []);

  useEffect(() => { loadAll(); }, []);

  function selectVersion(version) {
    setSelectedVersion(version);
    setCurrentPage('ruleList');
  }

  function selectRule(rule) {
    setSelectedRule(rule);
    setCurrentPage('ruleDetail');
  }

  function handleImportDone(newVersionId, hasMappings) {
    loadAll();
    if (!newVersionId) { setCurrentPage('dashboard'); return; }
    if (hasMappings) {
      setCompareVersionId(newVersionId);
      setCurrentPage('versionCompare');
    } else {
      window.stig.getAllVersions().then(vs => {
        const v = vs.find(v => v.id === newVersionId);
        if (v) selectVersion(v);
      });
    }
  }

  function renderPage() {
    switch (currentPage) {
      case 'dashboard':
        return (
          <Dashboard
            useCases={useCases}
            versions={versions}
            selectedUseCase={selectedUseCase}
            onSelectVersion={selectVersion}
            onSelectUseCase={uc => { setSelectedUseCase(uc); setCurrentPage('dashboard'); }}
            onImportDone={handleImportDone}
            onUseCasesChanged={loadAll}
            onViewComparison={versionId => { setCompareVersionId(versionId); setCurrentPage('versionCompare'); }}
          />
        );
      case 'ruleList':
        return (
          <RuleList
            version={selectedVersion}
            onSelectRule={selectRule}
            onBack={() => setCurrentPage('dashboard')}
          />
        );
      case 'ruleDetail':
        return (
          <RuleDetail
            rule={selectedRule}
            enforceExpiry={selectedUseCase?.enforce_expiry !== 0}
            onBack={() => setCurrentPage('ruleList')}
            onSaved={loadAll}
          />
        );
      case 'versionCompare':
        return (
          <VersionCompare
            versionId={compareVersionId}
            onDone={() => {
              window.stig.getAllVersions().then(vs => {
                const v = vs.find(v => v.id === compareVersionId);
                if (v) selectVersion(v);
              });
            }}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar
        useCases={useCases}
        versions={versions}
        selectedVersionId={selectedVersion?.id}
        selectedUseCaseId={selectedUseCase?.id}
        onSelectVersion={selectVersion}
        onSelectUseCase={uc => { setSelectedUseCase(uc); setCurrentPage('dashboard'); }}
        onNavigateDashboard={() => { setSelectedUseCase(null); setCurrentPage('dashboard'); }}
        expiringCount={expiringCount}
        onDeleteVersion={() => loadAll()}
        onUseCasesChanged={loadAll}
      />
      <main className="flex-1 overflow-hidden flex flex-col">
        {renderPage()}
      </main>
    </div>
  );
}
