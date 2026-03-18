import { useState } from 'react';
import { Star, Crosshair, X } from 'lucide-react';
import clsx from 'clsx';
import { useDraftStore } from '@/store/draftStore';
import type { ScoutingEntry, SignalType } from '@/store/draftStore';

const SIGNAL_LABELS: Record<SignalType, string> = {
  breakout: 'BREAKOUT',
  bounce_back: 'BOUNCE-BACK',
  value_trap: 'VALUE TRAP',
  overpay_risk: 'OVERPAY RISK',
};

const SIGNAL_CLASSES: Record<SignalType, string> = {
  breakout: 'signal-breakout',
  bounce_back: 'signal-bounce-back',
  value_trap: 'signal-value-trap',
  overpay_risk: 'signal-overpay-risk',
};

function posClass(pos: string) {
  const p = pos.toUpperCase();
  if (p === 'C') return 'pos-c';
  if (['1B', '2B', '3B', 'SS', 'MI', 'CI'].includes(p)) return 'pos-1b';
  if (p === 'OF') return 'pos-of';
  if (p === 'U' || p === 'DH') return 'pos-u';
  if (p === 'SP') return 'pos-sp';
  if (p === 'RP') return 'pos-rp';
  return 'pos-sp';
}

function isBuySignal(signal: SignalType) {
  return signal === 'breakout' || signal === 'bounce_back';
}

export default function ScoutingCard({ entry }: { entry: ScoutingEntry }) {
  const { watchlist, toggleWatchlist, setSelectedPlayer, updateScoutingCandidate, removeScoutingCandidate } = useDraftStore();
  const [editing, setEditing] = useState(false);
  const [narrativeText, setNarrativeText] = useState(entry.narrative);

  const player = entry.player;
  const isDrafted = player.is_drafted;
  const isOnWatchlist = watchlist.includes(player.id);

  const handleBlur = () => {
    setEditing(false);
    if (narrativeText !== entry.narrative) {
      updateScoutingCandidate(entry.player_id, { narrative: narrativeText });
    }
  };

  const handleRemove = () => {
    if (window.confirm(`Remove ${player.name} from scouting board?`)) {
      removeScoutingCandidate(entry.player_id);
    }
  };

  const handleTarget = () => {
    setSelectedPlayer(player);
    setTimeout(() => {
      document.getElementById('bid-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const bidDisplay = isBuySignal(entry.signal)
    ? `$${entry.target_bid_low}-${entry.target_bid_high}`
    : `Max $${entry.target_bid_high}`;

  return (
    <div className={clsx('wr-card', isDrafted && 'opacity-40')}>
      {/* Header */}
      <div className="wr-card-header flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={clsx('pos-badge text-[10px] font-bold uppercase tracking-wider shrink-0', SIGNAL_CLASSES[entry.signal])}>
            {SIGNAL_LABELS[entry.signal]}
          </span>
          <span className={clsx('font-display text-base tracking-wider truncate', isDrafted && 'line-through')} style={{ color: 'var(--text-primary)' }}>
            {player.name}
          </span>
          <span className="text-[11px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>{player.team}</span>
          <div className="flex gap-1 shrink-0">
            {player.positions.map((p) => (
              <span key={p} className={`pos-badge ${posClass(p)}`}>{p}</span>
            ))}
          </div>
        </div>
        <span className="font-mono text-sm font-bold shrink-0" style={{ color: 'var(--accent)' }}>
          {bidDisplay}
        </span>
      </div>

      <div className="wr-card-body space-y-3">
        {/* Stats row */}
        <div className="flex items-center justify-between font-mono text-[11px]">
          <div className="flex gap-2">
            {player.is_hitter && player.hitting ? (
              <>
                <span className="text-text-secondary">{player.hitting.R}<span className="text-text-muted text-[9px]"> R</span></span>
                <span className="text-text-secondary">{player.hitting.HR}<span className="text-text-muted text-[9px]"> HR</span></span>
                <span className="text-text-secondary">{player.hitting.RBI}<span className="text-text-muted text-[9px]"> RBI</span></span>
                <span className="text-text-secondary">{player.hitting.SB}<span className="text-text-muted text-[9px]"> SB</span></span>
                <span className="text-text-secondary">{player.hitting.OBP.toFixed(3)}<span className="text-text-muted text-[9px]"> OBP</span></span>
              </>
            ) : !player.is_hitter && player.pitching ? (
              <>
                <span className="text-text-secondary">{player.pitching.W}<span className="text-text-muted text-[9px]"> W</span></span>
                <span className="text-text-secondary">{player.pitching.SV}<span className="text-text-muted text-[9px]"> SV</span></span>
                <span className="text-text-secondary">{player.pitching.K}<span className="text-text-muted text-[9px]"> K</span></span>
                <span className="text-text-secondary">{player.pitching.ERA.toFixed(2)}<span className="text-text-muted text-[9px]"> ERA</span></span>
                <span className="text-text-secondary">{player.pitching.WHIP.toFixed(2)}<span className="text-text-muted text-[9px]"> WHIP</span></span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-[9px]">Proj</span>
            <span className="font-bold text-text-primary">${player.dollar_value.toFixed(1)}</span>
            <span className="text-text-muted text-[9px]">Infl</span>
            <span className="font-bold" style={{ color: 'var(--accent)' }}>${player.inflated_value.toFixed(1)}</span>
          </div>
        </div>

        {/* Breakout label */}
        {player.breakout && (
          <div className="flex items-center gap-2">
            <span className={clsx(
              'rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
              (player.breakout.label.toLowerCase().includes('upside') || player.breakout.score > 0) ? 'breakout-positive' : 'breakout-negative'
            )}>
              {player.breakout.label}
            </span>
            <span className="font-mono text-[10px] text-text-muted">({player.breakout.score.toFixed(2)})</span>
          </div>
        )}

        {/* Narrative */}
        {editing ? (
          <textarea
            className="wr-input text-sm leading-relaxed"
            rows={4}
            value={narrativeText}
            onChange={(e) => setNarrativeText(e.target.value)}
            onBlur={handleBlur}
            autoFocus
          />
        ) : (
          <p
            className="text-sm leading-relaxed cursor-pointer rounded px-1 -mx-1 hover:bg-elevated/50 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => setEditing(true)}
            title="Click to edit"
          >
            {entry.narrative}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 pt-1 border-t" style={{ borderColor: 'var(--border-card)' }}>
          <button
            onClick={() => toggleWatchlist(player.id)}
            className="wr-btn wr-btn-ghost text-xs flex items-center gap-1"
            title={isOnWatchlist ? 'Remove from queue' : 'Add to queue'}
          >
            <Star className={clsx('h-3.5 w-3.5', isOnWatchlist && 'fill-gold text-gold')} />
            Queue
          </button>
          <button
            onClick={handleTarget}
            className="wr-btn wr-btn-ghost text-xs flex items-center gap-1"
            title="Target — fill bid input"
          >
            <Crosshair className="h-3.5 w-3.5" />
            Target
          </button>
          <button
            onClick={handleRemove}
            className="wr-btn wr-btn-ghost text-xs flex items-center gap-1 ml-auto hover:!text-big-overpay"
            title="Remove from scouting board"
          >
            <X className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
