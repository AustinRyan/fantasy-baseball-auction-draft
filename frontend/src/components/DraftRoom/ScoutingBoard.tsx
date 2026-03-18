import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Plus, X } from 'lucide-react';
import clsx from 'clsx';
import { useDraftStore } from '@/store/draftStore';
import type { SignalType, ScoutingEntry } from '@/store/draftStore';
import ScoutingCard from './ScoutingCard';

const SIGNAL_ORDER: SignalType[] = ['breakout', 'bounce_back', 'value_trap', 'overpay_risk'];

const SIGNAL_LABELS: Record<SignalType, string> = {
  breakout: 'Breakout',
  bounce_back: 'Bounce-Back',
  value_trap: 'Value Trap',
  overpay_risk: 'Overpay Risk',
};

const SIGNAL_SECTION_LABELS: Record<SignalType, string> = {
  breakout: 'BREAKOUT',
  bounce_back: 'BOUNCE-BACK',
  value_trap: 'VALUE TRAP',
  overpay_risk: 'OVERPAY RISK',
};

type SortMode = 'signal' | 'projected' | 'target';

export default function ScoutingBoard() {
  const {
    scoutingBoard, scoutingLoading,
    players, addScoutingCandidate,
  } = useDraftStore();

  const [signalFilter, setSignalFilter] = useState<SignalType | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('signal');
  const [showModal, setShowModal] = useState(false);

  // Filter
  const filtered = useMemo(() => {
    return signalFilter
      ? scoutingBoard.filter((e: ScoutingEntry) => e.signal === signalFilter)
      : scoutingBoard;
  }, [scoutingBoard, signalFilter]);

  // Sort
  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sortMode === 'projected') {
      list.sort((a, b) => b.player.inflated_value - a.player.inflated_value);
    } else if (sortMode === 'target') {
      list.sort((a, b) => b.target_bid_high - a.target_bid_high);
    } else {
      // Signal Type sort: group by signal order, then by target_bid_high desc within group
      list.sort((a, b) => {
        const aIdx = SIGNAL_ORDER.indexOf(a.signal);
        const bIdx = SIGNAL_ORDER.indexOf(b.signal);
        if (aIdx !== bIdx) return aIdx - bIdx;
        return b.target_bid_high - a.target_bid_high;
      });
    }
    return list;
  }, [filtered, sortMode]);

  // Group by signal for section headers
  const grouped = useMemo(() => {
    if (sortMode !== 'signal') return null;
    const groups: { signal: SignalType; entries: ScoutingEntry[] }[] = [];
    let currentSignal: SignalType | null = null;
    for (const entry of sorted) {
      if (entry.signal !== currentSignal) {
        currentSignal = entry.signal;
        groups.push({ signal: entry.signal, entries: [] });
      }
      groups[groups.length - 1].entries.push(entry);
    }
    return groups;
  }, [sorted, sortMode]);

  // Loading state
  if (scoutingLoading && scoutingBoard.length === 0) {
    return (
      <div className="animate-enter">
        <div className="wr-card">
          <div className="p-8 flex items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gold border-t-transparent" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-enter">
      {/* Header */}
      <div className="wr-card">
        <div className="wr-card-header">
          <div className="flex items-center gap-3">
            <span className="wr-title">Scout Board</span>
            <span className="font-mono text-xs text-text-muted">{scoutingBoard.length} players</span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="wr-btn wr-btn-gold glow-gold text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Player
          </button>
        </div>

        {/* Filter chips */}
        <div className="border-b p-3 space-y-2" style={{ borderColor: 'var(--border-card)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mr-1">Filter:</span>
            <button
              onClick={() => setSignalFilter(null)}
              className={clsx('wr-chip', signalFilter === null && 'wr-chip-active')}
            >All</button>
            {SIGNAL_ORDER.map((sig) => (
              <button
                key={sig}
                onClick={() => setSignalFilter(signalFilter === sig ? null : sig)}
                className={clsx('wr-chip', signalFilter === sig && 'wr-chip-active')}
              >{SIGNAL_LABELS[sig]}</button>
            ))}
          </div>

          {/* Sort chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mr-1">Sort:</span>
            {([
              { id: 'signal' as SortMode, label: 'Signal Type' },
              { id: 'projected' as SortMode, label: 'Projected $' },
              { id: 'target' as SortMode, label: 'Target Bid' },
            ]).map((s) => (
              <button
                key={s.id}
                onClick={() => setSortMode(s.id)}
                className={clsx('wr-chip', sortMode === s.id && 'wr-chip-active')}
              >{s.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {sorted.length === 0 && (
        <div className="wr-card">
          <div className="p-8 text-center text-text-muted text-sm">
            No scouting candidates{signalFilter ? ' for this filter' : ''}. Click &quot;+ Add Player&quot; to start building your board.
          </div>
        </div>
      )}

      {/* Grouped by signal */}
      {grouped ? (
        grouped.map((group) => (
          <div key={group.signal}>
            <div className="flex items-center gap-3 mb-3">
              <div className="wr-accent-line h-5" />
              <h3 className="font-display text-sm tracking-wider uppercase" style={{ color: 'var(--text-secondary)' }}>
                {SIGNAL_SECTION_LABELS[group.signal]}
              </h3>
              <span className="font-mono text-[10px] text-text-muted">{group.entries.length}</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border-card)' }} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {group.entries.map((entry) => (
                <ScoutingCard key={entry.player_id} entry={entry} />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sorted.map((entry) => (
            <ScoutingCard key={entry.player_id} entry={entry} />
          ))}
        </div>
      )}

      {/* Add Player Modal */}
      {showModal && (
        <AddPlayerModal
          players={players}
          scoutingBoard={scoutingBoard}
          onAdd={addScoutingCandidate}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

/* ─── Add Player Modal ─── */
function AddPlayerModal({
  players,
  scoutingBoard,
  onAdd,
  onClose,
}: {
  players: { id: string; name: string; team: string; positions: string[]; is_drafted: boolean }[];
  scoutingBoard: ScoutingEntry[];
  onAdd: (data: { player_id: string; signal: string; target_bid_low: number; target_bid_high: number; narrative: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signal, setSignal] = useState<SignalType>('breakout');
  const [bidLow, setBidLow] = useState(1);
  const [bidHigh, setBidHigh] = useState(5);
  const [narrative, setNarrative] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const boardIds = useMemo(() => new Set(scoutingBoard.map((e) => e.player_id)), [scoutingBoard]);

  const available = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return players
      .filter((p) => !p.is_drafted && !boardIds.has(p.id) && (p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)))
      .slice(0, 15);
  }, [players, boardIds, search]);

  const selectedPlayer = useMemo(() => players.find((p) => p.id === selectedId), [players, selectedId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSubmit = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await onAdd({
        player_id: selectedId,
        signal,
        target_bid_low: bidLow,
        target_bid_high: bidHigh,
        narrative,
      });
      onClose();
    } catch {
      // error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal content */}
      <div className="relative w-full max-w-lg rounded-md border shadow-2xl animate-enter" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-bright)' }}>
        {/* Top accent */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-gold to-transparent" />

        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border-card)' }}>
          <span className="wr-title">Add to Scout Board</span>
          <button onClick={onClose} className="wr-btn wr-btn-ghost p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Player search */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Player</label>
            {selectedPlayer ? (
              <div className="wr-input flex items-center justify-between">
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {selectedPlayer.name}
                  <span className="text-text-muted font-mono text-xs ml-2">{selectedPlayer.team} — {selectedPlayer.positions.join(', ')}</span>
                </span>
                <button onClick={() => { setSelectedId(null); setSearch(''); }} className="text-text-muted hover:text-text-secondary">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    placeholder="Search by name or team..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)}
                    className="wr-input pl-10"
                    autoFocus
                  />
                </div>
                {showDropdown && available.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 rounded-md border max-h-48 overflow-y-auto" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-bright)' }}>
                    {available.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedId(p.id); setSearch(p.name); setShowDropdown(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-elevated transition-colors flex items-center justify-between"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <span className="font-medium">{p.name}</span>
                        <span className="text-[10px] font-mono text-text-muted">{p.team} — {p.positions.join(', ')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Signal type */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Signal Type</label>
            <select
              value={signal}
              onChange={(e) => setSignal(e.target.value as SignalType)}
              className="wr-select w-full"
            >
              {SIGNAL_ORDER.map((sig) => (
                <option key={sig} value={sig}>{SIGNAL_LABELS[sig]}</option>
              ))}
            </select>
          </div>

          {/* Bid range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Bid Low ($)</label>
              <input
                type="number"
                min={0}
                value={bidLow}
                onChange={(e) => setBidLow(Number(e.target.value))}
                className="wr-input"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Bid High ($)</label>
              <input
                type="number"
                min={0}
                value={bidHigh}
                onChange={(e) => setBidHigh(Number(e.target.value))}
                className="wr-input"
              />
            </div>
          </div>

          {/* Narrative */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Scouting Narrative</label>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Your scouting notes on this player..."
              rows={3}
              className="wr-input"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!selectedId || submitting}
            className="wr-btn wr-btn-gold glow-gold w-full"
          >
            {submitting ? 'Adding...' : 'Add to Board'}
          </button>
        </div>
      </div>
    </div>
  );
}
