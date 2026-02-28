import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface LeagueConfig {
  league_name: string;
  num_teams: number;
  budget: number;
  roster_slots: Record<string, number>;
  sgp_denominators?: Record<string, number>;
}

const DEFAULT_CONFIG: LeagueConfig = {
  league_name: 'Potomac Valley Rotisserie League',
  num_teams: 11,
  budget: 270,
  roster_slots: {
    C: 2, '1B': 1, '2B': 1, '3B': 1, SS: 1, MI: 1, CI: 1, OF: 5, U: 1, P: 10,
  },
};

function posClass(pos: string) {
  const p = pos.toUpperCase();
  if (p === 'C') return 'pos-c';
  if (['1B', '2B', '3B', 'SS', 'MI', 'CI'].includes(p)) return 'pos-1b';
  if (p === 'OF') return 'pos-of';
  if (p === 'U') return 'pos-u';
  if (p === 'P' || p === 'SP') return 'pos-sp';
  return 'pos-rp';
}

export default function LeagueSettings({ config }: { config?: LeagueConfig }) {
  const [showSGP, setShowSGP] = useState(false);
  const cfg = config ?? DEFAULT_CONFIG;

  return (
    <div className="wr-card">
      <div className="wr-card-header">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-gold/10">
            <span className="font-display text-sm text-gold">AL</span>
          </div>
          <span className="wr-title">League Config</span>
        </div>
      </div>

      <div className="wr-card-body">
        <div className="space-y-3">
          {/* Key stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded bg-dugout border border-border p-3 text-center">
              <div className="font-display text-2xl text-gold">{cfg.num_teams}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Teams</div>
            </div>
            <div className="rounded bg-dugout border border-border p-3 text-center">
              <div className="font-display text-2xl text-text-primary">${cfg.budget}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Budget</div>
            </div>
            <div className="rounded bg-dugout border border-border p-3 text-center">
              <div className="font-display text-2xl text-text-primary">{Object.values(cfg.roster_slots).reduce((a, b) => a + b, 0)}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Roster</div>
            </div>
          </div>

          {/* Roster slots */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">Roster Slots</div>
            <div className="grid grid-cols-5 gap-1.5">
              {Object.entries(cfg.roster_slots).map(([pos, count]) => (
                <div key={pos} className="flex items-center justify-between rounded bg-dugout border border-border px-2.5 py-2">
                  <span className={`pos-badge ${posClass(pos)}`}>{pos}</span>
                  <span className="font-mono text-sm font-bold text-text-primary">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SGP Denominators */}
          {cfg.sgp_denominators && (
            <div>
              <button
                onClick={() => setShowSGP(!showSGP)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted hover:text-text-secondary transition-colors"
              >
                {showSGP ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span className="uppercase tracking-wider">SGP Denominators</span>
              </button>
              {showSGP && (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {Object.entries(cfg.sgp_denominators).map(([stat, val]) => (
                    <div key={stat} className="flex items-center justify-between rounded bg-dugout border border-border px-2.5 py-1.5">
                      <span className="text-xs font-medium text-text-secondary">{stat}</span>
                      <span className="font-mono text-xs text-text-muted">{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
