import { useMemo, useState } from 'react';
import { Search, Star, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { useDraftStore } from '@/store/draftStore';
import type { Player } from '@/store/draftStore';

const POSITIONS_HITTERS = ['C', '1B', '2B', '3B', 'SS', 'OF'];
const POSITIONS_PITCHERS = ['SP', 'RP'];
const ALL_POSITIONS = [...POSITIONS_HITTERS, ...POSITIONS_PITCHERS];

type SortKey = 'dollar_value' | 'inflated_value' | 'name' | 'breakout';
type SortDir = 'asc' | 'desc';
type BreakoutFilter = null | 'High Upside' | 'Moderate Upside' | 'Stable' | 'Decline Risk';

const BREAKOUT_FILTERS: { label: string; value: BreakoutFilter }[] = [
  { label: 'All', value: null },
  { label: 'High Upside', value: 'High Upside' },
  { label: 'Mod Upside', value: 'Moderate Upside' },
  { label: 'Stable', value: 'Stable' },
  { label: 'Decline', value: 'Decline Risk' },
];

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

function signalClass(range: Player['pre_bid_range'], value: number): string {
  if (!range) return '';
  if (value <= range.steal_below) return 'signal-steal';
  if (value <= range.value_below) return 'signal-value';
  if (value >= range.big_overpay_above) return 'signal-big-overpay';
  if (value >= range.overpay_above) return 'signal-overpay';
  return 'signal-fair';
}

function signalLabel(range: Player['pre_bid_range'], value: number): string {
  if (!range) return '--';
  if (value <= range.steal_below) return 'STEAL';
  if (value <= range.value_below) return 'VALUE';
  if (value >= range.big_overpay_above) return 'BIG OP';
  if (value >= range.overpay_above) return 'OVERPAY';
  return 'FAIR';
}

function BreakoutBadge({ breakout }: { breakout: Player['breakout'] }) {
  if (!breakout) return null;
  const isPositive = breakout.label.toLowerCase().includes('upside') || breakout.score > 0;
  return (
    <span className={clsx('inline-block rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', isPositive ? 'breakout-positive' : 'breakout-negative')}>
      {breakout.label}
    </span>
  );
}

export default function ValueBoard() {
  const {
    players, searchQuery, setSearchQuery,
    positionFilter, setPositionFilter,
    showHitters, setShowHitters,
    watchlist, toggleWatchlist,
  } = useDraftStore();

  const [sortKey, setSortKey] = useState<SortKey>('inflated_value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [breakoutFilter, setBreakoutFilter] = useState<BreakoutFilter>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === 'asc' ? <ChevronUp className="inline h-3 w-3 text-gold" /> : <ChevronDown className="inline h-3 w-3 text-gold" />;
  };

  const filtered = useMemo(() => {
    let list = [...players];
    if (showHitters !== null) list = list.filter((p) => p.is_hitter === showHitters);
    if (positionFilter) list = list.filter((p) => p.positions.includes(positionFilter));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
    }
    if (breakoutFilter) {
      list = list.filter((p) => p.breakout?.label === breakoutFilter);
    }
    list.sort((a, b) => {
      if (sortKey === 'breakout') {
        const aScore = a.breakout?.score ?? 0;
        const bScore = b.breakout?.score ?? 0;
        return sortDir === 'asc' ? aScore - bScore : bScore - aScore;
      }
      const aVal = sortKey === 'name' ? a.name : a[sortKey];
      const bVal = sortKey === 'name' ? b.name : b[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string')
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return list;
  }, [players, showHitters, positionFilter, searchQuery, sortKey, sortDir, breakoutFilter]);

  return (
    <div className="wr-card">
      <div className="wr-card-header flex-wrap gap-3">
        <span className="wr-title">Player Values</span>
        <span className="font-mono text-xs text-text-muted">{filtered.length} players</span>
      </div>

      <div className="border-b border-border p-3 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search players or teams..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="wr-input pl-10"
          />
        </div>

        {/* Type + Position filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {[{ label: 'All', value: null }, { label: 'Hitters', value: true }, { label: 'Pitchers', value: false }].map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => setShowHitters(opt.value)}
                className={clsx('wr-chip', showHitters === opt.value && 'wr-chip-active')}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-border mx-1" />
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setPositionFilter(null)}
              className={clsx('wr-chip', positionFilter === null && 'wr-chip-active')}
            >All</button>
            {ALL_POSITIONS.map((pos) => (
              <button
                key={pos}
                onClick={() => setPositionFilter(positionFilter === pos ? null : pos)}
                className={clsx('wr-chip', positionFilter === pos && 'wr-chip-active')}
              >{pos}</button>
            ))}
          </div>
        </div>

        {/* Breakout filter */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mr-1">Breakout:</span>
          {BREAKOUT_FILTERS.map((bf) => (
            <button
              key={String(bf.value)}
              onClick={() => setBreakoutFilter(breakoutFilter === bf.value ? null : bf.value)}
              className={clsx('wr-chip', breakoutFilter === bf.value && 'wr-chip-active')}
            >{bf.label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="wr-table">
          <thead>
            <tr>
              <th className="w-8 text-center">#</th>
              <th className="w-8"></th>
              <th className="sortable" onClick={() => toggleSort('name')}>
                Name <SortIcon col="name" />
              </th>
              <th>Team</th>
              <th>Pos</th>
              <th className="sortable text-right" onClick={() => toggleSort('dollar_value')} title="Raw auction dollar value from SGP calculation before keeper inflation is applied">
                Base $ <SortIcon col="dollar_value" />
              </th>
              <th className="sortable text-right" onClick={() => toggleSort('inflated_value')} title="Dollar value adjusted for keeper inflation — this is what you should actually bid">
                Inflated $ <SortIcon col="inflated_value" />
              </th>
              <th title="Pre-bid signal based on inflated value: Steal (<70%), Value (70-90%), Fair (90-110%), Overpay (>120%), Big OP (>140%)">Signal</th>
              <th className="sortable" onClick={() => toggleSort('breakout')} title="Breakout prediction from Statcast data — flags players likely to outperform (upside) or underperform (decline) their projections">Breakout <SortIcon col="breakout" /></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-text-muted">
                  Upload projections and calculate values to populate this board.
                </td>
              </tr>
            )}
            {filtered.map((player, idx) => (
              <tr
                key={`${player.id}-${idx}`}
                onClick={() => setSelectedPlayer(selectedPlayer?.id === player.id ? null : player)}
                className={clsx(
                  'cursor-pointer',
                  player.is_drafted && 'opacity-30',
                  player.is_keeper && '!bg-gold/5',
                  selectedPlayer?.id === player.id && 'active',
                )}
              >
                <td className="text-center text-text-muted font-mono text-xs">{idx + 1}</td>
                <td>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleWatchlist(player.id); }}
                    className="text-text-muted hover:text-gold transition-colors"
                  >
                    <Star className={clsx('h-3.5 w-3.5', watchlist.includes(player.id) && 'fill-gold text-gold')} />
                  </button>
                </td>
                <td className="font-medium text-text-primary">{player.name}</td>
                <td className="font-mono text-xs text-text-muted">{player.team}</td>
                <td>
                  <div className="flex gap-1">
                    {player.positions.map((p) => (
                      <span key={p} className={`pos-badge ${posClass(p)}`}>{p}</span>
                    ))}
                  </div>
                </td>
                <td className="text-right font-mono text-text-secondary">${player.dollar_value.toFixed(1)}</td>
                <td className="text-right">
                  <span className="font-mono font-bold text-text-primary">${player.inflated_value.toFixed(1)}</span>
                </td>
                <td>
                  <span className={clsx('inline-block rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', signalClass(player.pre_bid_range, player.inflated_value))}>
                    {signalLabel(player.pre_bid_range, player.inflated_value)}
                  </span>
                </td>
                <td><BreakoutBadge breakout={player.breakout} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selectedPlayer && (
        <div className="border-t border-border bg-dugout p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="wr-accent-line h-10" />
            <div>
              <h4 className="font-display text-lg tracking-wider text-text-primary">{selectedPlayer.name}</h4>
              <p className="text-xs text-text-muted">
                {selectedPlayer.team} &mdash; {selectedPlayer.positions.join(', ')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded bg-surface border border-border p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Base</div>
              <div className="font-mono text-lg font-bold text-text-primary">${selectedPlayer.dollar_value.toFixed(1)}</div>
            </div>
            <div className="rounded bg-surface border border-border p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Inflated</div>
              <div className="font-mono text-lg font-bold text-gold">${selectedPlayer.inflated_value.toFixed(1)}</div>
            </div>
            {selectedPlayer.pre_bid_range && (
              <>
                <div className="rounded bg-surface border border-border p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Steal Below</div>
                  <div className="font-mono text-lg font-bold text-steal">${selectedPlayer.pre_bid_range.steal_below.toFixed(1)}</div>
                </div>
                <div className="rounded bg-surface border border-border p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Fair Range</div>
                  <div className="font-mono text-lg font-bold text-text-primary">
                    ${selectedPlayer.pre_bid_range.fair_low.toFixed(0)}-${selectedPlayer.pre_bid_range.fair_high.toFixed(0)}
                  </div>
                </div>
              </>
            )}
          </div>
          {selectedPlayer.breakout && (
            <div className="mt-3 text-xs text-text-secondary">
              <span className="text-text-muted">Breakout Factors:</span>{' '}
              {selectedPlayer.breakout.factors.join(' / ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
