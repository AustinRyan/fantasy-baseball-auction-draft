import { useMemo, useRef, useState } from 'react';
import { X, Crosshair, Star, GripVertical } from 'lucide-react';
import clsx from 'clsx';
import { useDraftStore } from '@/store/draftStore';
import { getEligibleSlots } from '@/utils/positionEligibility';

type QueueFilter = 'all' | 'batters' | 'pitchers';

export default function PlayerQueue() {
  const { players, watchlist, toggleWatchlist, setSelectedPlayer, reorderWatchlist } = useDraftStore();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const [filter, setFilter] = useState<QueueFilter>('all');

  // Preserve watchlist order (user-defined via drag), filter out drafted
  const watchlistPlayers = useMemo(() => {
    const playerMap = new Map(players.map((p) => [p.id, p]));
    return watchlist
      .map((id) => playerMap.get(id))
      .filter((p): p is NonNullable<typeof p> => {
        if (p == null || p.is_drafted) return false;
        if (filter === 'batters') return p.is_hitter;
        if (filter === 'pitchers') return !p.is_hitter;
        return true;
      });
  }, [players, watchlist, filter]);

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    dragRef.current = idx;
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    // Make drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    const fromIdx = dragRef.current;
    if (fromIdx !== null && fromIdx !== toIdx) {
      // Map visual index back to watchlist index
      const fromId = watchlistPlayers[fromIdx]?.id;
      const toId = watchlistPlayers[toIdx]?.id;
      if (fromId && toId) {
        const realFrom = watchlist.indexOf(fromId);
        const realTo = watchlist.indexOf(toId);
        if (realFrom !== -1 && realTo !== -1) {
          reorderWatchlist(realFrom, realTo);
        }
      }
    }
    setDragIdx(null);
    setOverIdx(null);
    dragRef.current = null;
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
    dragRef.current = null;
  };

  return (
    <div className="wr-card">
      <div className="wr-card-header">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 fill-gold text-gold" />
          <span className="wr-title">Queue</span>
        </div>
        {watchlistPlayers.length > 0 && (
          <span className="font-mono text-xs text-text-muted">{watchlistPlayers.length}</span>
        )}
      </div>

      {/* Batter / Pitcher filter */}
      <div className="flex gap-1 px-3 pt-2 pb-1">
        {([
          { label: 'All', value: 'all' as QueueFilter },
          { label: 'Batters', value: 'batters' as QueueFilter },
          { label: 'Pitchers', value: 'pitchers' as QueueFilter },
        ]).map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={clsx('wr-chip text-[10px]', filter === opt.value && 'wr-chip-active')}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {watchlistPlayers.length === 0 ? (
        <div className="p-4 text-sm text-text-muted text-center">
          {filter === 'all'
            ? 'Star players to add them to your queue.'
            : `No ${filter} in your queue.`}
        </div>
      ) : (
        <div className="p-3 space-y-1">
          {watchlistPlayers.map((player, idx) => {
            const slots = getEligibleSlots(player.positions);
            return (
              <div
                key={player.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                className={clsx(
                  'rounded-sm border border-border bg-dugout px-2 py-1.5 flex items-center justify-between transition-all cursor-grab active:cursor-grabbing',
                  dragIdx === idx && 'opacity-30',
                  overIdx === idx && dragIdx !== idx && 'border-gold/50 bg-gold/5',
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <GripVertical className="h-3 w-3 text-text-muted shrink-0" />
                  <span className="font-mono text-[10px] text-text-muted w-4">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-text-primary truncate">{player.name}</div>
                    <div className="text-[10px] text-text-muted font-mono">
                      {player.team} &mdash; {slots.join(', ')} &mdash; ${player.inflated_value.toFixed(0)}
                      {player.pre_bid_range && (
                        <span className="ml-1">
                          (${player.pre_bid_range.steal_below.toFixed(0)}-${player.pre_bid_range.overpay_above.toFixed(0)})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 ml-1.5 shrink-0">
                  <button
                    onClick={() => setSelectedPlayer(player)}
                    className="rounded p-1 text-gold hover:bg-gold/10 transition-colors"
                    title="Target"
                  >
                    <Crosshair className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => toggleWatchlist(player.id)}
                    className="rounded p-1 text-text-muted hover:bg-big-overpay/10 hover:text-big-overpay transition-colors"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
