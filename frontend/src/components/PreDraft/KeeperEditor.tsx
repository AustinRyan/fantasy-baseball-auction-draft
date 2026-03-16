import { useState, useEffect, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  TrendingUp,
  Upload,
  Globe,
  Pencil,
  Check,
  Search,
} from 'lucide-react';
import clsx from 'clsx';
import { keepersApi, projectionsApi } from '@/api/client';
import { useDraftStore } from '@/store/draftStore';
import type { TeamInfo } from '@/store/draftStore';

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

interface NLPlayer {
  id: string;
  name: string;
  team: string;
  positions: string[];
  dollar_value: number;
}

export default function KeeperEditor() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [inflationRate, setInflationRate] = useState<number | null>(null);
  const [newKeeperName, setNewKeeperName] = useState('');
  const [newKeeperSalary, setNewKeeperSalary] = useState('');
  const [keeperSearchOpen, setKeeperSearchOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { players, myTeamId, setMyTeamId, setTeamNames } = useDraftStore();

  const keeperSearchResults = useMemo(() => {
    if (!newKeeperName.trim()) return [];
    const q = newKeeperName.toLowerCase();
    return players
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [newKeeperName, players]);

  // Team rename state
  const [renamingTeam, setRenamingTeam] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // NL keeper-eligible state
  const [nlPlayers, setNlPlayers] = useState<NLPlayer[]>([]);
  const [showNlForm, setShowNlForm] = useState(false);
  const [nlName, setNlName] = useState('');
  const [nlTeam, setNlTeam] = useState('');
  const [nlPositions, setNlPositions] = useState('');
  const [nlPA, setNlPA] = useState('');
  const [nlHR, setNlHR] = useState('');
  const [nlR, setNlR] = useState('');
  const [nlRBI, setNlRBI] = useState('');
  const [nlSB, setNlSB] = useState('');
  const [nlAVG, setNlAVG] = useState('');
  const [nlOBP, setNlOBP] = useState('');
  const [nlBB, setNlBB] = useState('');
  const [nlH, setNlH] = useState('');

  const fetchTeams = async () => {
    try {
      const res = await keepersApi.getTeams();
      const teamList = res.data.teams ?? [];
      setTeams(teamList);
      setTeamNames(teamList.map((t: Team) => ({ id: t.id, name: t.name } as TeamInfo)));
    } catch { /* not ready */ }
  };

  const fetchInflation = async () => {
    try {
      const res = await keepersApi.getInflation();
      setInflationRate(res.data.inflation_rate ?? res.data);
    } catch { /* not ready */ }
  };

  const fetchNlPlayers = async () => {
    try {
      const res = await projectionsApi.getNlPlayers();
      setNlPlayers(res.data.players ?? []);
    } catch { /* not ready */ }
  };

  const addNlPlayer = async () => {
    if (!nlName.trim() || !nlTeam.trim()) return;
    const pa = Number(nlPA) || 0;
    const bb = Number(nlBB) || 0;
    const h = Number(nlH) || 0;
    const ab = pa - bb; // approximate
    try {
      setLoading(true);
      await projectionsApi.addNlPlayer({
        name: nlName.trim(),
        team: nlTeam.trim().toUpperCase(),
        positions: nlPositions.split(',').map(p => p.trim().toUpperCase()).filter(Boolean),
        stats: {
          PA: pa, AB: ab, H: h, BB: bb,
          HR: Number(nlHR) || 0,
          R: Number(nlR) || 0,
          RBI: Number(nlRBI) || 0,
          SB: Number(nlSB) || 0,
          AVG: Number(nlAVG) || 0,
          OBP: Number(nlOBP) || 0,
        },
      });
      setNlName(''); setNlTeam(''); setNlPositions('');
      setNlPA(''); setNlHR(''); setNlR(''); setNlRBI(''); setNlSB('');
      setNlAVG(''); setNlOBP(''); setNlBB(''); setNlH('');
      setShowNlForm(false);
      await fetchNlPlayers();
    } catch { /* error */ } finally { setLoading(false); }
  };

  const removeNlPlayer = async (playerId: string) => {
    try {
      setLoading(true);
      await projectionsApi.removeNlPlayer(playerId);
      await fetchNlPlayers();
    } catch { /* error */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchTeams(); fetchInflation(); fetchNlPlayers(); }, []);

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

  const handleRename = async (teamId: string) => {
    if (!renameValue.trim()) return;
    try {
      await keepersApi.updateTeam(teamId, { name: renameValue.trim() });
      setRenamingTeam(null);
      setRenameValue('');
      await fetchTeams();
    } catch { /* error */ }
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
                    {renamingTeam === team.id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(team.id); if (e.key === 'Escape') setRenamingTeam(null); }}
                          className="wr-input py-0.5 px-2 text-sm w-32"
                          autoFocus
                        />
                        <button onClick={() => handleRename(team.id)} className="text-gold hover:text-gold/80 p-0.5">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-sm text-text-primary">{team.name}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setRenamingTeam(team.id); setRenameValue(team.name); }}
                          className="text-text-muted hover:text-text-primary p-0.5 transition-colors"
                          title="Rename team"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        {isMyTeam && (
                          <span className="rounded-sm bg-gold/15 border border-gold/25 px-1.5 py-0.5 text-[10px] font-bold text-gold uppercase tracking-wider">
                            You
                          </span>
                        )}
                      </>
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
                  <div className="mt-3 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                      <input
                        type="text"
                        placeholder="Search player name..."
                        value={newKeeperName}
                        onChange={(e) => { setNewKeeperName(e.target.value); setKeeperSearchOpen(true); }}
                        onFocus={() => setKeeperSearchOpen(true)}
                        onBlur={() => setTimeout(() => setKeeperSearchOpen(false), 150)}
                        className="wr-input pl-10 w-full"
                      />
                      {keeperSearchOpen && keeperSearchResults.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full rounded border border-border-bright bg-panel shadow-2xl max-h-48 overflow-y-auto">
                          {keeperSearchResults.map((p) => (
                            <button
                              key={p.id}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setNewKeeperName(p.name); setKeeperSearchOpen(false); }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-elevated flex items-center justify-between transition-colors"
                            >
                              <span className="font-medium text-text-primary">{p.name}</span>
                              <span className="text-text-muted text-xs font-mono">{p.positions.join(',')} ${p.inflated_value.toFixed(0)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Salary $"
                        value={newKeeperSalary}
                        onChange={(e) => setNewKeeperSalary(e.target.value)}
                        className="wr-input w-24"
                      />
                      <button
                        onClick={() => addKeeper(team.id)}
                        disabled={loading || !newKeeperName.trim() || !newKeeperSalary}
                        className={clsx('wr-btn text-xs flex-1', loading || !newKeeperName.trim() || !newKeeperSalary ? 'wr-btn-surface opacity-40' : 'wr-btn-gold')}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Keeper
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* NL Keeper-Eligible Players */}
      <div className="border-t border-border">
        <button
          onClick={() => setShowNlForm(!showNlForm)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevated transition-colors"
        >
          <Globe className="h-4 w-4 text-text-muted" />
          <div className="flex-1">
            <span className="font-medium text-sm text-text-primary">NL Keeper-Eligible</span>
            <span className="text-xs text-text-muted ml-2">
              AL→NL transfers (+$2 penalty) &middot; {nlPlayers.length} players
            </span>
          </div>
          {showNlForm
            ? <ChevronDown className="h-4 w-4 text-text-muted" />
            : <ChevronRight className="h-4 w-4 text-text-muted" />
          }
        </button>

        {showNlForm && (
          <div className="bg-dugout px-4 pb-4 pt-1">
            {/* Existing NL players */}
            {nlPlayers.length > 0 && (
              <div className="space-y-1 mb-3">
                {nlPlayers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded bg-surface border border-border px-3 py-2 text-sm">
                    <div>
                      <span className="text-text-primary">{p.name}</span>
                      <span className="text-text-muted ml-2 text-xs">{p.team}</span>
                      <span className="text-text-muted ml-2 text-xs">{p.positions?.join(', ')}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-text-secondary">${p.dollar_value?.toFixed(1)}</span>
                      <span className="rounded-sm bg-big-overpay/15 border border-big-overpay/25 px-1.5 py-0.5 text-[9px] font-bold text-big-overpay uppercase">
                        +$2
                      </span>
                      <button onClick={() => removeNlPlayer(p.id)} className="text-text-muted hover:text-big-overpay transition-colors" disabled={loading}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add NL player form */}
            <div className="space-y-2 rounded border border-border bg-surface p-3">
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wider">Add NL Transfer</div>
              <div className="flex gap-2">
                <input type="text" placeholder="Player name" value={nlName} onChange={e => setNlName(e.target.value)} className="wr-input flex-1" />
                <input type="text" placeholder="Team (e.g. PIT)" value={nlTeam} onChange={e => setNlTeam(e.target.value)} className="wr-input w-20" />
                <input type="text" placeholder="Pos (2B,1B)" value={nlPositions} onChange={e => setNlPositions(e.target.value)} className="wr-input w-24" />
              </div>
              <div className="grid grid-cols-5 gap-2">
                <input type="number" placeholder="PA" value={nlPA} onChange={e => setNlPA(e.target.value)} className="wr-input" />
                <input type="number" placeholder="H" value={nlH} onChange={e => setNlH(e.target.value)} className="wr-input" />
                <input type="number" placeholder="BB" value={nlBB} onChange={e => setNlBB(e.target.value)} className="wr-input" />
                <input type="number" placeholder="AVG (.242)" value={nlAVG} onChange={e => setNlAVG(e.target.value)} className="wr-input" />
                <input type="number" placeholder="OBP (.308)" value={nlOBP} onChange={e => setNlOBP(e.target.value)} className="wr-input" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <input type="number" placeholder="HR" value={nlHR} onChange={e => setNlHR(e.target.value)} className="wr-input" />
                <input type="number" placeholder="R" value={nlR} onChange={e => setNlR(e.target.value)} className="wr-input" />
                <input type="number" placeholder="RBI" value={nlRBI} onChange={e => setNlRBI(e.target.value)} className="wr-input" />
                <input type="number" placeholder="SB" value={nlSB} onChange={e => setNlSB(e.target.value)} className="wr-input" />
              </div>
              <button
                onClick={addNlPlayer}
                disabled={loading || !nlName.trim() || !nlTeam.trim()}
                className={clsx('wr-btn text-xs w-full', loading || !nlName.trim() || !nlTeam.trim() ? 'wr-btn-surface opacity-40' : 'wr-btn-gold')}
              >
                <Plus className="h-3.5 w-3.5" /> Add NL Player (+$2 keeper penalty)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
