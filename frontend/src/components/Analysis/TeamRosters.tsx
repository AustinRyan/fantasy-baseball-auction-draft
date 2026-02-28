import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { draftApi } from '@/api/client';

interface RosterSlot {
  slot: string;
  player_name: string | null;
  price: number | null;
}

interface TeamRosterData {
  team_id: string;
  budget_total: number;
  budget_spent: number;
  budget_remaining: number;
  slots: RosterSlot[];
  picks: TeamPick[];
}

interface TeamPick {
  id: string;
  player_name: string;
  price: number;
  classification: string;
}

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

function posClass(pos: string) {
  const p = pos.toUpperCase();
  if (p === 'C') return 'pos-c';
  if (['1B', '2B', '3B', 'SS', 'MI', 'CI'].includes(p)) return 'pos-1b';
  if (p === 'OF') return 'pos-of';
  if (p === 'U' || p === 'DH') return 'pos-u';
  return 'pos-sp';
}

export default function TeamRosters() {
  const [selectedTeam, setSelectedTeam] = useState('team_1');
  const [rosterData, setRosterData] = useState<TeamRosterData | null>(null);

  useEffect(() => {
    const fetchTeamRoster = async () => {
      try {
        const res = await draftApi.getTeamRoster(selectedTeam);
        setRosterData(res.data);
      } catch { setRosterData(null); }
    };
    fetchTeamRoster();
  }, [selectedTeam]);

  const slots = rosterData?.slots ?? [];
  const picks = rosterData?.picks ?? [];
  const budgetPct = rosterData ? rosterData.budget_remaining / rosterData.budget_total : 1;

  return (
    <div className="space-y-5">
      <div className="wr-card">
        <div className="wr-card-header">
          <span className="wr-title">Team Rosters</span>
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="wr-select"
          >
            {TEAMS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>

        {/* Budget */}
        {rosterData && (
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-text-muted text-xs font-semibold uppercase tracking-wider">Budget</span>
              <div className="flex items-baseline gap-1">
                <span className={clsx('font-mono text-xl font-bold', budgetPct > 0.5 ? 'text-steal' : budgetPct > 0.2 ? 'text-gold' : 'text-big-overpay')}>
                  ${rosterData.budget_remaining}
                </span>
                <span className="text-text-muted text-xs font-mono">/ ${rosterData.budget_total}</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className={clsx('h-full rounded-full transition-all', budgetPct > 0.5 ? 'bg-steal' : budgetPct > 0.2 ? 'bg-gold' : 'bg-big-overpay')}
                style={{ width: `${budgetPct * 100}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-text-muted mt-1">Spent ${rosterData.budget_spent}</div>
          </div>
        )}

        {/* Roster grid */}
        {slots.length > 0 ? (
          <div className="p-4">
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
        ) : (
          <div className="p-4 text-sm text-text-muted text-center">
            Start the draft to see team rosters.
          </div>
        )}
      </div>

      {/* Draft history */}
      {picks.length > 0 && (
        <div className="wr-card">
          <div className="wr-card-header">
            <span className="wr-title">Draft History</span>
            <span className="font-mono text-xs text-text-muted">{picks.length} picks</span>
          </div>
          <div className="overflow-x-auto">
            <table className="wr-table">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Player</th>
                  <th className="text-right">Price</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {picks.map((pick, idx) => (
                  <tr key={pick.id}>
                    <td className="font-mono text-text-muted">{idx + 1}</td>
                    <td className="font-medium text-text-primary">{pick.player_name}</td>
                    <td className="text-right font-mono font-bold text-gold">${pick.price}</td>
                    <td>
                      <span className={clsx('inline-block rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', classificationSignal(pick.classification))}>
                        {pick.classification}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
