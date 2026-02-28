import { useMemo } from 'react';
import { X, Crosshair, Star } from 'lucide-react';
import clsx from 'clsx';
import { useDraftStore } from '@/store/draftStore';

export default function PlayerQueue() {
  const { players, watchlist, toggleWatchlist, setSelectedPlayer } = useDraftStore();

  const watchlistPlayers = useMemo(() => {
    return players
      .filter((p) => watchlist.includes(p.id) && !p.is_drafted)
      .sort((a, b) => b.inflated_value - a.inflated_value);
  }, [players, watchlist]);

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

      {watchlistPlayers.length === 0 ? (
        <div className="p-4 text-sm text-text-muted text-center">
          Star players to add them to your queue.
        </div>
      ) : (
        <div className="p-3 space-y-1.5">
          {watchlistPlayers.map((player) => (
            <div
              key={player.id}
              className="rounded-sm border border-border bg-dugout px-3 py-2 flex items-center justify-between hover:bg-elevated transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm text-text-primary truncate">{player.name}</div>
                <div className="text-xs text-text-muted font-mono">
                  {player.positions.join(', ')} &mdash; ${player.inflated_value.toFixed(0)}
                  {player.pre_bid_range && (
                    <span className="ml-1 text-text-muted">
                      (${player.pre_bid_range.steal_below.toFixed(0)}-${player.pre_bid_range.overpay_above.toFixed(0)})
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => setSelectedPlayer(player)}
                  className={clsx('rounded p-1.5 text-gold hover:bg-gold/10 transition-colors')}
                  title="Target"
                >
                  <Crosshair className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => toggleWatchlist(player.id)}
                  className="rounded p-1.5 text-text-muted hover:bg-big-overpay/10 hover:text-big-overpay transition-colors"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
