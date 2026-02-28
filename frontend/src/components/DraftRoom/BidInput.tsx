import { useState, useEffect, useMemo } from 'react';
import { Undo2, CheckCircle, Search } from 'lucide-react';
import clsx from 'clsx';
import { useDraftStore } from '@/store/draftStore';
import { draftApi } from '@/api/client';
import type { Player, DraftPick } from '@/store/draftStore';

const TEAMS = Array.from({ length: 11 }, (_, i) => ({
  id: `team_${i + 1}`,
  label: `Team ${i + 1}`,
}));

function classificationSignal(classification: string) {
  const c = classification.toLowerCase();
  if (c.includes('big steal') || c === 'steal') return 'signal-steal';
  if (c === 'value') return 'signal-value';
  if (c === 'fair') return 'signal-fair';
  if (c.includes('big overpay')) return 'signal-big-overpay';
  if (c === 'overpay') return 'signal-overpay';
  return 'signal-fair';
}

export default function BidInput({ id, onPickRecorded }: { id?: string; onPickRecorded?: () => void }) {
  const { players, selectedPlayer, setSelectedPlayer, lastPicks, setLastPicks, markPlayerDrafted, markPlayerUndrafted } = useDraftStore();
  const [teamId, setTeamId] = useState('team_1');
  const [price, setPrice] = useState<number | ''>('');
  const [recording, setRecording] = useState(false);
  const [lastClassification, setLastClassification] = useState<string | null>(null);
  const [playerSearch, setPlayerSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (selectedPlayer) {
      setPlayerSearch(selectedPlayer.name);
      setShowDropdown(false);
      // Pre-fill with the midpoint of the fair range, or inflated value
      if (selectedPlayer.pre_bid_range) {
        const fairMid = Math.round((selectedPlayer.pre_bid_range.fair_low + selectedPlayer.pre_bid_range.fair_high) / 2);
        setPrice(fairMid);
      } else {
        setPrice(Math.round(selectedPlayer.inflated_value));
      }
    }
  }, [selectedPlayer]);

  const searchResults = useMemo(() => {
    if (!playerSearch.trim() || selectedPlayer?.name === playerSearch) return [];
    const q = playerSearch.toLowerCase();
    return players.filter((p) => !p.is_drafted && p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [playerSearch, players, selectedPlayer]);

  const handleSelectPlayer = (player: Player) => {
    setSelectedPlayer(player);
    setPlayerSearch(player.name);
    setShowDropdown(false);
  };

  const handleRecord = async () => {
    if (!selectedPlayer || price === '') return;
    setRecording(true);
    setLastClassification(null);
    try {
      const res = await draftApi.recordPick({
        player_id: selectedPlayer.id,
        team_id: teamId,
        price: Number(price),
      });
      const pick = res.data as DraftPick;
      setLastClassification(pick.classification ?? 'Recorded');
      setLastPicks([pick, ...lastPicks].slice(0, 5));
      // Immediately update local store so drafted toggle works instantly
      markPlayerDrafted(selectedPlayer.id, teamId, Number(price));
      setSelectedPlayer(null);
      setPlayerSearch('');
      setPrice('');
      onPickRecorded?.();
    } catch { /* error */ } finally { setRecording(false); }
  };

  const handleUndo = async () => {
    if (lastPicks.length === 0) return;
    try {
      const undone = lastPicks[0];
      await draftApi.undoPick(undone.id);
      markPlayerUndrafted(undone.player_id);
      setLastPicks(lastPicks.slice(1));
      setLastClassification(null);
      onPickRecorded?.();
    } catch { /* error */ }
  };

  return (
    <div id={id} className="wr-card">
      <div className="wr-card-header">
        <span className="wr-title">Record Pick</span>
      </div>

      <div className="wr-card-body space-y-3">
        {/* Player search */}
        <div className="relative">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Player</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search player..."
              value={playerSearch}
              onChange={(e) => {
                setPlayerSearch(e.target.value);
                setShowDropdown(true);
                if (selectedPlayer && e.target.value !== selectedPlayer.name) setSelectedPlayer(null);
              }}
              onFocus={() => setShowDropdown(true)}
              className="wr-input pl-10"
            />
          </div>
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded border border-border-bright bg-panel shadow-2xl max-h-48 overflow-y-auto">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPlayer(p)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-elevated flex items-center justify-between transition-colors"
                >
                  <span className="font-medium text-text-primary">{p.name}</span>
                  <span className="text-text-muted text-xs font-mono">{p.positions.join(',')} ${p.inflated_value.toFixed(0)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Team + Price */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Team</label>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="wr-select w-full">
              {TEAMS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Price</label>
            <input
              type="number"
              min={1}
              max={270}
              value={price}
              onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="$"
              className="wr-input font-mono"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleRecord}
            disabled={!selectedPlayer || price === '' || recording}
            className="wr-btn wr-btn-gold flex-1 glow-gold"
          >
            <CheckCircle className="h-4 w-4" />
            {recording ? 'Recording...' : 'Record Pick'}
          </button>
          <button
            onClick={handleUndo}
            disabled={lastPicks.length === 0}
            className="wr-btn wr-btn-surface"
          >
            <Undo2 className="h-4 w-4" />
            Undo
          </button>
        </div>

        {/* Classification result */}
        {lastClassification && (
          <div className={clsx('rounded-sm px-3 py-2.5 text-sm font-bold text-center uppercase tracking-wider', classificationSignal(lastClassification))}>
            {lastClassification}
          </div>
        )}
      </div>

      {/* Recent picks */}
      {lastPicks.length > 0 && (
        <div className="border-t border-border p-4">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">Recent</h4>
          <div className="space-y-1">
            {lastPicks.map((pick) => (
              <div
                key={pick.id}
                className={clsx('flex items-center justify-between rounded-sm px-3 py-1.5 text-xs', classificationSignal(pick.classification))}
              >
                <span className="font-medium">{pick.player_name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-inherit/60">{pick.team_id.replace('team_', 'T')}</span>
                  <span className="font-mono font-bold">${pick.price}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
