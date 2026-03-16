import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import clsx from 'clsx';
import { keepersApi, draftApi } from '@/api/client';
import { useDraftStore } from '@/store/draftStore';

interface KeeperInfo {
  player_name: string;
  salary: number;
  positions: string[];
  player_id: string;
}

interface TeamInfo {
  id: string;
  name: string;
  is_user: boolean;
  keepers: KeeperInfo[];
}

interface RosterSlot {
  slot: string;
  player_name: string | null;
  price: number | null;
}

interface RosterData {
  team_id: string;
  team_name: string;
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
  if (p === 'SP') return 'pos-sp';
  if (p === 'RP') return 'pos-rp';
  return 'pos-sp';
}

export default function TeamRosters() {
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [rosterData, setRosterData] = useState<RosterData | null>(null);
  const draftActive = useDraftStore((s) => s.draftActive);

  // Load teams
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const res = await keepersApi.getTeams();
        setTeams(res.data.teams ?? []);
      } catch { /* ignore */ }
    };
    fetchTeams();
  }, []);

  const selectedTeam = teams[selectedIdx] ?? null;

  // Load roster data when team changes (for draft-time slot view)
  useEffect(() => {
    if (!selectedTeam) return;
    const fetchRoster = async () => {
      try {
        const res = await draftApi.getTeamRoster(selectedTeam.id);
        setRosterData(res.data);
      } catch { setRosterData(null); }
    };
    fetchRoster();
  }, [selectedTeam]);

  const cycleTeam = (dir: 1 | -1) => {
    if (teams.length === 0) return;
    setSelectedIdx((i) => (i + dir + teams.length) % teams.length);
  };

  if (teams.length === 0) {
    return (
      <div className="wr-card p-8 text-center text-text-muted">
        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
        Set up teams in the Pre-Draft tab to see league overview.
      </div>
    );
  }

  const keepers = selectedTeam?.keepers ?? [];
  const keeperSalary = keepers.reduce((sum, k) => sum + k.salary, 0);
  const budgetTotal = rosterData?.budget_total ?? 270;
  const budgetRemaining = rosterData?.budget_remaining ?? (budgetTotal - keeperSalary);
  const budgetSpent = rosterData?.budget_spent ?? keeperSalary;
  const budgetPct = budgetRemaining / budgetTotal;

  // During draft, use slot data; pre-draft just show keepers
  const slots = rosterData?.slots ?? [];
  const filledSlots = slots.filter((s) => s.player_name);
  const hasDraftData = filledSlots.length > 0;

  return (
    <div className="space-y-5">
      {/* League overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {teams.map((t, idx) => {
          const tSalary = t.keepers.reduce((s, k) => s + k.salary, 0);
          const tRemaining = 270 - tSalary;
          const pct = tRemaining / 270;
          return (
            <div
              key={t.id}
              onClick={() => setSelectedIdx(idx)}
              className={clsx(
                'cursor-pointer rounded-sm border p-3 transition-all',
                selectedIdx === idx
                  ? 'border-gold/50 bg-elevated'
                  : 'border-border bg-dugout hover:border-border-bright',
              )}
            >
              <div className="font-medium text-xs text-text-primary truncate">{t.name}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-text-muted">{t.keepers.length} keepers</span>
                <span className={clsx(
                  'font-mono text-xs font-bold',
                  pct > 0.5 ? 'text-steal' : pct > 0.2 ? 'text-gold' : 'text-big-overpay',
                )}>
                  ${tRemaining}
                </span>
              </div>
              <div className="h-1 rounded-full bg-border overflow-hidden mt-1">
                <div
                  className={clsx('h-full rounded-full', pct > 0.5 ? 'bg-steal' : pct > 0.2 ? 'bg-gold' : 'bg-big-overpay')}
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected team detail */}
      {selectedTeam && (
        <div className="wr-card">
          <div className="wr-card-header">
            <div className="flex items-center gap-2">
              <button onClick={() => cycleTeam(-1)} className="text-text-muted hover:text-text-primary p-1">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="wr-title">{selectedTeam.name}</span>
              {selectedTeam.is_user && <span className="text-[10px] text-gold font-semibold">(You)</span>}
              <button onClick={() => cycleTeam(1)} className="text-text-muted hover:text-text-primary p-1">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Budget bar */}
          <div className="border-b border-border px-4 py-3">
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
                className={clsx('h-full rounded-full transition-all', budgetPct > 0.5 ? 'bg-steal' : budgetPct > 0.2 ? 'bg-gold' : 'bg-big-overpay')}
                style={{ width: `${budgetPct * 100}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-text-muted mt-1">
              Spent ${budgetSpent} &mdash; {keepers.length} keepers
              {draftActive && rosterData && ` + ${filledSlots.length - keepers.length} drafted`}
            </div>
          </div>

          {/* Roster grid (draft mode) */}
          {hasDraftData && (
            <div className="border-b border-border p-4">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted mb-2">Roster Slots</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
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
          )}

          {/* Keepers list */}
          {keepers.length > 0 && (
            <div className="p-4">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted mb-2">Keepers</div>
              <div className="overflow-x-auto">
                <table className="wr-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th className="text-right">Salary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keepers.map((k, i) => (
                      <tr key={`${k.player_name}-${i}`}>
                        <td className="font-medium text-text-primary">{k.player_name}</td>
                        <td className="text-right font-mono font-bold text-gold">${k.salary}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border-bright">
                      <td className="font-semibold text-text-secondary text-xs uppercase tracking-wider">Total</td>
                      <td className="text-right font-mono font-bold text-text-primary">${keeperSalary}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {keepers.length === 0 && !hasDraftData && (
            <div className="p-6 text-sm text-text-muted text-center">
              No keepers set for this team yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
