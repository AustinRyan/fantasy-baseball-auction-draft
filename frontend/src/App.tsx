import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Calculator,
  Download,
  LayoutDashboard,
  Gavel,
  BarChart3,
  Loader2,
  Play,
  Save,
  Upload,
  RotateCcw,
  Sun,
  Moon,
} from 'lucide-react';
import clsx from 'clsx';
import ProjectionUploader from '@/components/PreDraft/ProjectionUploader';
import ValueBoard from '@/components/PreDraft/ValueBoard';
import KeeperEditor from '@/components/PreDraft/KeeperEditor';
import LeagueSettings from '@/components/PreDraft/LeagueSettings';
import DraftBoard from '@/components/DraftRoom/DraftBoard';
import BidInput from '@/components/DraftRoom/BidInput';
import AlertBanner from '@/components/DraftRoom/AlertBanner';
import PlayerQueue from '@/components/DraftRoom/PlayerQueue';
import MyRosterPanel from '@/components/MyRoster/MyRosterPanel';
import DraftRecommendations from '@/components/MyRoster/DraftRecommendations';
import TeamRosters from '@/components/Analysis/TeamRosters';
import { valuationsApi, draftApi, exportApi } from '@/api/client';
import { useDraftStore } from '@/store/draftStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

type Tab = 'pre-draft' | 'draft' | 'analysis';

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="animate-toast fixed bottom-6 right-6 z-50 rounded-md px-5 py-3 text-sm font-medium shadow-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-bright)', color: 'var(--text-primary)' }}>
      <div className="absolute left-0 top-0 h-full w-[3px] rounded-l" style={{ background: 'var(--accent)' }} />
      {message}
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('pre-draft');
  const [calculating, setCalculating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [startingDraft, setStartingDraft] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const setPlayers = useDraftStore((s) => s.setPlayers);
  const draftActive = useDraftStore((s) => s.draftActive);
  const setDraftActive = useDraftStore((s) => s.setDraftActive);
  const setLastPicks = useDraftStore((s) => s.setLastPicks);
  const setSelectedPlayer = useDraftStore((s) => s.setSelectedPlayer);
  const darkMode = useDraftStore((s) => s.darkMode);
  const toggleDarkMode = useDraftStore((s) => s.toggleDarkMode);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [darkMode]);

  // Load existing data on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await valuationsApi.getResults();
        const players = res.data?.players ?? res.data;
        if (Array.isArray(players) && players.length > 0) {
          setPlayers(players);
        }
      } catch {
        // No data yet
      }
    })();
  }, [setPlayers]);

  const fetchValues = useCallback(async () => {
    try {
      const res = await valuationsApi.getResults();
      const players = res.data?.players ?? res.data;
      if (Array.isArray(players)) {
        setPlayers(players);
      }
    } catch {
      // Values not available yet
    }
  }, [setPlayers]);

  const handleUploaded = useCallback(async () => {
    try {
      await valuationsApi.calculate();
      await fetchValues();
    } catch {
      // First upload may not have enough data yet
    }
  }, [fetchValues]);

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      await valuationsApi.calculate();
      await fetchValues();
    } catch {
      // Handle error
    } finally {
      setCalculating(false);
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setExporting(true);
    try {
      const res = await exportApi.preDraft(format);
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pre_draft_values.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Handle error
    } finally {
      setExporting(false);
    }
  };

  const handleStartDraft = async () => {
    setStartingDraft(true);
    try {
      await draftApi.start();
      setDraftActive(true);
      await fetchValues();
    } catch {
      // Handle error
    } finally {
      setStartingDraft(false);
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await draftApi.save();
      setToast('Draft state saved');
    } catch {
      setToast('Failed to save draft state');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadDraft = async () => {
    setLoading(true);
    try {
      await draftApi.load();
      await fetchValues();
      setToast('Draft state loaded');
    } catch {
      setToast('Failed to load draft state');
    } finally {
      setLoading(false);
    }
  };

  const [resetting, setResetting] = useState(false);
  const handleResetDraft = async () => {
    setResetting(true);
    try {
      await draftApi.reset();
      setDraftActive(false);
      setLastPicks([]);
      setSelectedPlayer(null);
      await fetchValues();
      setToast('Draft reset — all picks cleared');
    } catch {
      setToast('Failed to reset draft');
    } finally {
      setResetting(false);
    }
  };

  const shortcuts = useMemo(
    () => ({
      'mod+1': () => setActiveTab('pre-draft'),
      'mod+2': () => setActiveTab('draft'),
      'mod+3': () => setActiveTab('analysis'),
      'mod+s': () => handleSaveDraft(),
      'escape': () => setSelectedPlayer(null),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useKeyboardShortcuts(shortcuts);

  // WebSocket for live draft
  useEffect(() => {
    if (!draftActive) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/draft/ws`;
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'pick_recorded') {
            fetchValues();
            if (data.recent_picks) setLastPicks(data.recent_picks);
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { wsRef.current = null; };
      return () => { ws.close(); wsRef.current = null; };
    } catch { /* WebSocket not available */ }
  }, [draftActive, fetchValues, setLastPicks]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { id: 'pre-draft', label: 'Pre-Draft', icon: <LayoutDashboard className="h-4 w-4" />, shortcut: '1' },
    { id: 'draft', label: 'Draft Room', icon: <Gavel className="h-4 w-4" />, shortcut: '2' },
    { id: 'analysis', label: 'Analysis', icon: <BarChart3 className="h-4 w-4" />, shortcut: '3' },
  ];

  return (
    <div className="relative min-h-screen" style={{ background: 'var(--bg-body)' }}>
      {/* Subtle background texture */}
      <div className="bg-diamond fixed inset-0 pointer-events-none opacity-30" />

      {/* Header */}
      <header className="relative z-10 border-b backdrop-blur-xl" style={{ borderColor: 'var(--border-card)', background: darkMode ? 'rgba(11,17,32,0.8)' : 'rgba(255,255,255,0.85)' }}>
        <div className="mx-auto max-w-[1600px] px-4 lg:px-6">
          {/* Top bar */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-4">
              {/* Logo mark */}
              <div className="flex h-9 w-9 items-center justify-center rounded" style={{ background: 'var(--accent-glow)', border: '1px solid var(--accent-glow)' }}>
                <span className="font-display text-xl leading-none" style={{ color: 'var(--accent)' }}>P</span>
              </div>
              <div>
                <h1 className="font-display text-xl tracking-wider" style={{ color: 'var(--text-primary)' }}>
                  PVRL DRAFT ROOM
                </h1>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
                  Potomac Valley Rotisserie League
                </p>
              </div>

              {draftActive && (
                <div className="ml-4 flex items-center gap-2 rounded-full border border-steal/30 bg-steal/10 px-3 py-1">
                  <div className="live-dot" />
                  <span className="text-xs font-semibold text-steal uppercase tracking-wider">Live</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {activeTab === 'pre-draft' && (
                <>
                  <button
                    onClick={handleCalculate}
                    disabled={calculating}
                    className="wr-btn wr-btn-gold glow-gold"
                  >
                    {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                    Calculate
                  </button>
                  <button
                    onClick={() => handleExport('csv')}
                    disabled={exporting}
                    className="wr-btn wr-btn-surface"
                  >
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Export
                  </button>
                </>
              )}

              {activeTab === 'draft' && !draftActive && (
                <button
                  onClick={handleStartDraft}
                  disabled={startingDraft}
                  className="wr-btn wr-btn-gold glow-gold"
                >
                  {startingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Start Draft
                </button>
              )}

              {activeTab === 'draft' && draftActive && (
                <>
                  <button onClick={handleSaveDraft} disabled={saving} className="wr-btn wr-btn-surface">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save
                  </button>
                  <button onClick={handleLoadDraft} disabled={loading} className="wr-btn wr-btn-surface">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Load
                  </button>
                  <button onClick={handleResetDraft} disabled={resetting} className="wr-btn wr-btn-surface !border-big-overpay/30 !text-big-overpay hover:!bg-big-overpay/10">
                    {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Reset
                  </button>
                </>
              )}

              {/* Theme toggle */}
              <button
                onClick={toggleDarkMode}
                className="wr-btn wr-btn-ghost ml-1"
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Tab navigation */}
          <nav className="flex gap-0 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'relative flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors',
                  activeTab === tab.id && 'tab-active',
                )}
                style={{ color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {tab.icon}
                <span className="font-display tracking-wider text-[0.9rem]">{tab.label}</span>
                <kbd className="ml-1 hidden rounded px-1.5 py-0.5 text-[9px] font-mono lg:inline-block" style={{ border: '1px solid var(--border-bright)', background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                  {tab.shortcut}
                </kbd>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 mx-auto max-w-[1600px] p-4 lg:p-6">
        {activeTab === 'pre-draft' && (
          <div className="space-y-5 animate-enter">
            <div className="grid gap-5 lg:grid-cols-2">
              <ProjectionUploader onUploaded={handleUploaded} />
              <LeagueSettings />
            </div>
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <KeeperEditor />
              </div>
              <div className="lg:col-span-2">
                <ValueBoard />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'draft' && (
          <div className="space-y-4 animate-enter">
            <AlertBanner />
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="w-full lg:w-3/5 space-y-4">
                <DraftBoard />
                <BidInput id="bid-input" onPickRecorded={fetchValues} />
              </div>
              <div className="w-full lg:w-2/5 space-y-4">
                <MyRosterPanel />
                <DraftRecommendations />
                <PlayerQueue />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="animate-enter">
            <TeamRosters />
          </div>
        )}
      </main>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

export default App;
