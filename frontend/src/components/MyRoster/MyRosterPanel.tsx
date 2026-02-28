import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { draftApi } from '@/api/client';
import { useDraftStore } from '@/store/draftStore';

interface RosterSlot {
  slot: string;
  player_name: string | null;
  price: number | null;
}

interface RosterData {
  team_id: string;
  budget_total: number;
  budget_spent: number;
  budget_remaining: number;
  max_bid: number;
  slots: RosterSlot[];
}

function posClass(pos: string) {
  const p = pos.toUpperCase();
  if (p === 'C') return 'pos-c';
  if (['1B', '2B', '3B', 'SS', 'MI', 'CI'].includes(p)) return 'pos-1b';
  if (p === 'OF') return 'pos-of';
  if (p === 'U' || p === 'DH') return 'pos-u';
  return 'pos-sp';
}

const SLOT_ORDER = ['C', 'C', '1B', '2B', '3B', 'SS', 'MI', 'CI', 'OF', 'OF', 'OF', 'OF', 'OF', 'U', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'];

export default function MyRosterPanel() {
  const [roster, setRoster] = useState<RosterData | null>(null);
  const draftActive = useDraftStore((s) => s.draftActive);
  // Track drafted player count so we re-fetch immediately when a pick is recorded/undone
  const draftedCount = useDraftStore((s) => s.players.filter((p) => p.is_drafted).length);

  useEffect(() => {
    const fetchRoster = async () => {
      try {
        const res = await draftApi.getMyRoster();
        setRoster(res.data);
      } catch { /* not available */ }
    };
    fetchRoster();
    if (draftActive) {
      const interval = setInterval(fetchRoster, 5000);
      return () => clearInterval(interval);
    }
  }, [draftActive, draftedCount]);

  const slots: RosterSlot[] = roster?.slots ?? SLOT_ORDER.map((s) => ({ slot: s, player_name: null, price: null }));
  const budgetTotal = roster?.budget_total ?? 270;
  const budgetSpent = roster?.budget_spent ?? 0;
  const budgetRemaining = roster?.budget_remaining ?? 270;
  const emptySlots = slots.filter((s) => !s.player_name).length;
  const maxBid = roster?.max_bid ?? Math.max(1, budgetRemaining - emptySlots + 1);
  const budgetPct = budgetRemaining / budgetTotal;

  const pitcherStats = useMemo(() => {
    const pitcherSlots = slots.filter((s) => s.slot === 'P');
    const filledPitchers = pitcherSlots.filter((s) => s.player_name !== null).length;
    return { filled: filledPitchers, total: pitcherSlots.length };
  }, [slots]);

  return (
    <div className="wr-card">
      <div className="wr-card-header">
        <span className="wr-title">My Roster</span>
        <span className="font-mono text-xs text-text-muted">{slots.length - emptySlots}/{slots.length}</span>
      </div>

      <div className="wr-card-body space-y-4">
        {/* Budget display */}
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-text-muted text-xs font-semibold uppercase tracking-wider">Budget</span>
            <div className="flex items-baseline gap-1">
              <span className={clsx('font-mono text-xl font-bold', budgetPct > 0.5 ? 'text-steal' : budgetPct > 0.2 ? 'text-gold' : 'text-big-overpay')}>
                ${budgetRemaining}
              </span>
              <span className="text-text-muted text-xs font-mono">/ ${budgetTotal}</span>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-border overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-500', budgetPct > 0.5 ? 'bg-steal' : budgetPct > 0.2 ? 'bg-gold' : 'bg-big-overpay')}
              style={{ width: `${budgetPct * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] font-mono text-text-muted">
            <span>Spent ${budgetSpent}</span>
            <span>Max Bid <span className="text-gold font-bold">${maxBid}</span></span>
          </div>
        </div>

        {/* 900 IP warning */}
        {pitcherStats.filled < pitcherStats.total && (
          <div className="flex items-center gap-2 rounded-sm border border-overpay/30 bg-overpay/5 px-3 py-2 text-[11px] font-semibold text-overpay">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {pitcherStats.filled}/{pitcherStats.total} pitchers — ensure 900 IP min
          </div>
        )}

        {/* Roster grid */}
        <div className="grid grid-cols-2 gap-1">
          {slots.map((slot, idx) => (
            <div
              key={`${slot.slot}-${idx}`}
              className={clsx(
                'rounded-sm border px-2 py-1.5 text-xs',
                slot.player_name
                  ? 'border-border-bright bg-elevated'
                  : 'border-dashed border-border bg-dugout',
              )}
            >
              <div className="flex items-center justify-between">
                <span className={`pos-badge ${posClass(slot.slot)} !text-[9px] !min-w-[22px]`}>{slot.slot}</span>
                {slot.player_name ? (
                  <>
                    <span className="flex-1 font-medium text-text-primary truncate ml-1.5 text-[11px]">{slot.player_name}</span>
                    <span className="font-mono text-gold font-bold ml-1 text-[11px]">${slot.price}</span>
                  </>
                ) : (
                  <span className="flex-1 text-text-muted ml-1.5 text-[10px] uppercase tracking-wider">---</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
