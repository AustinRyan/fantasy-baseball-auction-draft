import { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  TrendingUp,
  Upload,
} from 'lucide-react';
import clsx from 'clsx';
import { keepersApi } from '@/api/client';
import { useDraftStore } from '@/store/draftStore';

interface Keeper {
  player_name: string;
  salary: number;
  player_id?: string;
}

interface Team {
  id: string;
  name: string;
  keepers: Keeper[];
}

export default function KeeperEditor() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [inflationRate, setInflationRate] = useState<number | null>(null);
  const [newKeeperName, setNewKeeperName] = useState('');
  const [newKeeperSalary, setNewKeeperSalary] = useState('');
  const [loading, setLoading] = useState(false);
  const { myTeamId, setMyTeamId } = useDraftStore();

  const fetchTeams = async () => {
    try {
      const res = await keepersApi.getTeams();
      setTeams(res.data.teams ?? []);
    } catch { /* not ready */ }
  };

  const fetchInflation = async () => {
    try {
      const res = await keepersApi.getInflation();
      setInflationRate(res.data.inflation_rate ?? res.data);
    } catch { /* not ready */ }
  };

  useEffect(() => { fetchTeams(); fetchInflation(); }, []);

  const addKeeper = async (teamId: string) => {
    if (!newKeeperName.trim() || !newKeeperSalary) return;
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    const updatedKeepers = [...team.keepers, { player_name: newKeeperName.trim(), salary: Number(newKeeperSalary) }];
    try {
      setLoading(true);
      await keepersApi.setKeepers(teamId, updatedKeepers);
      setNewKeeperName('');
      setNewKeeperSalary('');
      await fetchTeams();
      await fetchInflation();
    } catch { /* error */ } finally { setLoading(false); }
  };

  const removeKeeper = async (teamId: string, idx: number) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    const updatedKeepers = team.keepers.filter((_, i) => i !== idx);
    try {
      setLoading(true);
      await keepersApi.setKeepers(teamId, updatedKeepers);
      await fetchTeams();
      await fetchInflation();
    } catch { /* error */ } finally { setLoading(false); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      await keepersApi.importKeepers(file);
      await fetchTeams();
      await fetchInflation();
    } catch { /* error */ } finally { setLoading(false); }
  };

  return (
    <div className="wr-card">
      <div className="wr-card-header">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-gold/10">
            <span className="font-display text-sm text-gold">K</span>
          </div>
          <span className="wr-title">Keepers</span>
        </div>
        <label className="wr-btn wr-btn-surface cursor-pointer text-xs">
          <Upload className="h-3.5 w-3.5" />
          Import
          <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
        </label>
      </div>

      {/* Inflation banner */}
      {inflationRate !== null && (
        <div className="flex items-center gap-2 border-b border-border bg-gold/5 px-4 py-2.5">
          <TrendingUp className="h-4 w-4 text-gold" />
          <span className="text-xs text-text-secondary">Inflation Rate</span>
          <span className="font-mono text-sm font-bold text-gold ml-auto">
            {(inflationRate * 100).toFixed(1)}%
          </span>
        </div>
      )}

      {/* Teams list */}
      <div className="divide-y divide-border">
        {teams.length === 0 && (
          <p className="p-4 text-sm text-text-muted text-center">
            No teams loaded yet.
          </p>
        )}
        {teams.map((team) => {
          const isExpanded = expandedTeam === team.id;
          const totalSalary = team.keepers.reduce((sum, k) => sum + k.salary, 0);
          const isMyTeam = myTeamId === team.id;

          return (
            <div key={team.id}>
              <button
                onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevated transition-colors"
              >
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 text-text-muted" />
                  : <ChevronRight className="h-4 w-4 text-text-muted" />
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-text-primary">{team.name}</span>
                    {isMyTeam && (
                      <span className="rounded-sm bg-gold/15 border border-gold/25 px-1.5 py-0.5 text-[10px] font-bold text-gold uppercase tracking-wider">
                        You
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-text-muted">
                    {team.keepers.length} keepers &middot; <span className="font-mono">${totalSalary}</span>
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="bg-dugout px-4 pb-4 pt-1">
                  {!isMyTeam && (
                    <button
                      onClick={() => setMyTeamId(team.id)}
                      className="wr-btn wr-btn-gold mb-3 text-xs py-1.5"
                    >
                      Set as My Team
                    </button>
                  )}

                  {team.keepers.length === 0 && (
                    <p className="text-sm text-text-muted py-2">No keepers set.</p>
                  )}
                  <div className="space-y-1">
                    {team.keepers.map((keeper, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded bg-surface border border-border px-3 py-2 text-sm">
                        <span className="text-text-primary">{keeper.player_name}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-gold">${keeper.salary}</span>
                          <button
                            onClick={() => removeKeeper(team.id, idx)}
                            className="text-text-muted hover:text-big-overpay transition-colors"
                            disabled={loading}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add keeper form */}
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      placeholder="Player name"
                      value={newKeeperName}
                      onChange={(e) => setNewKeeperName(e.target.value)}
                      className="wr-input flex-1"
                    />
                    <input
                      type="number"
                      placeholder="$"
                      value={newKeeperSalary}
                      onChange={(e) => setNewKeeperSalary(e.target.value)}
                      className="wr-input w-20"
                    />
                    <button
                      onClick={() => addKeeper(team.id)}
                      disabled={loading || !newKeeperName.trim() || !newKeeperSalary}
                      className={clsx('wr-btn text-xs', loading || !newKeeperName.trim() || !newKeeperSalary ? 'wr-btn-surface opacity-40' : 'wr-btn-gold')}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
