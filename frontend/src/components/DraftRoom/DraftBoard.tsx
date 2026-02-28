import { useMemo, useState, useRef, useEffect } from 'react';
import { Search, Star, ChevronDown, ChevronUp, X, Crosshair, Eye, EyeOff, Newspaper, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { useDraftStore } from '@/store/draftStore';
import { projectionsApi } from '@/api/client';
import type { Player } from '@/store/draftStore';

interface PlayerNews {
  player_id: number | null;
  status: string;
  transactions: { date: string; type: string; description: string }[];
  age?: number;
  debut?: string;
  bat_side?: string;
  throw_hand?: string;
  height?: string;
  weight?: number;
  current_team?: string;
  error?: string;
}

const POSITIONS_HITTERS = ['C', '1B', '2B', '3B', 'SS', 'OF'];
const POSITIONS_PITCHERS = ['SP', 'RP'];
const ALL_POSITIONS = [...POSITIONS_HITTERS, ...POSITIONS_PITCHERS];

type SortKey = 'inflated_value' | 'name' | 'breakout';
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

function PriceRangeBar({ range }: { range: Player['pre_bid_range'] }) {
  if (!range) return <span className="text-text-muted text-xs">--</span>;

  const min = Math.floor(range.steal_below * 0.5);
  const max = Math.ceil(range.big_overpay_above * 1.2) || 1;
  const total = max - min || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / total) * 100));

  return (
    <div className="relative h-[6px] w-24 rounded-full bg-border overflow-hidden" title={`Steal <$${range.steal_below} | Fair $${range.fair_low}-$${range.fair_high}`}>
      <div className="absolute inset-y-0 bg-steal/70" style={{ left: '0%', width: `${pct(range.value_below)}%` }} />
      <div className="absolute inset-y-0 bg-value/70" style={{ left: `${pct(range.value_below)}%`, width: `${pct(range.fair_low) - pct(range.value_below)}%` }} />
      <div className="absolute inset-y-0 bg-text-muted/40" style={{ left: `${pct(range.fair_low)}%`, width: `${pct(range.fair_high) - pct(range.fair_low)}%` }} />
      <div className="absolute inset-y-0 bg-overpay/70" style={{ left: `${pct(range.fair_high)}%`, width: `${pct(range.overpay_above) - pct(range.fair_high)}%` }} />
      <div className="absolute inset-y-0 bg-big-overpay/70" style={{ left: `${pct(range.overpay_above)}%`, width: `${100 - pct(range.overpay_above)}%` }} />
    </div>
  );
}

/* ─── Floating Player Card ─── */
function PlayerCard({
  player,
  position,
  onClose,
  onTarget,
}: {
  player: Player;
  position: { top: number; left: number };
  onClose: () => void;
  onTarget: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [news, setNews] = useState<PlayerNews | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [showNews, setShowNews] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const fetchNews = async () => {
    if (news) { setShowNews(!showNews); return; }
    setNewsLoading(true);
    setShowNews(true);
    try {
      const res = await projectionsApi.getPlayerNews(player.name);
      setNews(res.data);
    } catch {
      setNews({ player_id: null, status: 'Unknown', transactions: [], error: 'Failed to fetch news' });
    } finally {
      setNewsLoading(false);
    }
  };

  // Center the card vertically in the viewport, positioned to the right of the table
  const cardHeight = 300;
  const cardWidth = 320;
  const viewH = window.innerHeight;
  const viewW = window.innerWidth;

  // Vertically: center in viewport
  const top = Math.max(16, Math.min((viewH - cardHeight) / 2, viewH - cardHeight - 16));
  // Horizontally: try right of click, fall back to left if no room
  let left = position.left;
  if (left + cardWidth > viewW - 16) left = Math.max(16, position.left - cardWidth - 16);

  const style: React.CSSProperties = {
    position: 'fixed',
    top,
    left: Math.min(left, viewW - cardWidth - 16),
    zIndex: 50,
  };

  return (
    <div ref={cardRef} style={style} className="w-[320px] rounded-md border border-border-bright bg-panel shadow-2xl animate-enter">
      {/* Top accent */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-gold to-transparent" />

      {/* Header */}
      <div className="flex items-start justify-between p-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="wr-accent-line h-8" />
          <div>
            <div className="font-display text-base tracking-wider text-text-primary leading-tight">{player.name}</div>
            <div className="text-[11px] text-text-muted font-mono">
              {player.team} &mdash; {player.positions.join(', ')}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-secondary p-0.5">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Value grid */}
      <div className="grid grid-cols-2 gap-2 px-3 pb-2">
        <div className="rounded bg-dugout border border-border p-2">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">Base Value</div>
          <div className="font-mono text-base font-bold text-text-primary">${player.dollar_value.toFixed(1)}</div>
        </div>
        <div className="rounded bg-dugout border border-border p-2">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">Inflated</div>
          <div className="font-mono text-base font-bold text-gold">${player.inflated_value.toFixed(1)}</div>
        </div>
      </div>

      {/* Price ranges */}
      {player.pre_bid_range && (
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-steal">Steal &lt;${player.pre_bid_range.steal_below.toFixed(0)}</span>
            <span className="text-text-muted">Fair ${player.pre_bid_range.fair_low.toFixed(0)}-${player.pre_bid_range.fair_high.toFixed(0)}</span>
            <span className="text-big-overpay">OP &gt;${player.pre_bid_range.overpay_above.toFixed(0)}</span>
          </div>
          <div className="mt-1 relative h-2 rounded-full bg-border overflow-hidden">
            {(() => {
              const r = player.pre_bid_range;
              const min = Math.floor(r.steal_below * 0.5);
              const max = Math.ceil(r.big_overpay_above * 1.3) || 1;
              const total = max - min || 1;
              const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / total) * 100));
              return (
                <>
                  <div className="absolute inset-y-0 bg-steal/60" style={{ left: '0%', width: `${pct(r.value_below)}%` }} />
                  <div className="absolute inset-y-0 bg-value/60" style={{ left: `${pct(r.value_below)}%`, width: `${pct(r.fair_low) - pct(r.value_below)}%` }} />
                  <div className="absolute inset-y-0 bg-text-muted/30" style={{ left: `${pct(r.fair_low)}%`, width: `${pct(r.fair_high) - pct(r.fair_low)}%` }} />
                  <div className="absolute inset-y-0 bg-overpay/60" style={{ left: `${pct(r.fair_high)}%`, width: `${pct(r.overpay_above) - pct(r.fair_high)}%` }} />
                  <div className="absolute inset-y-0 bg-big-overpay/60" style={{ left: `${pct(r.overpay_above)}%`, width: `${100 - pct(r.overpay_above)}%` }} />
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Signal + Breakout */}
      <div className="flex items-center gap-2 px-3 pb-2">
        <span className={clsx('rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', signalClass(player.pre_bid_range, player.inflated_value))}>
          {signalLabel(player.pre_bid_range, player.inflated_value)}
        </span>
        {player.breakout && (
          <span className={clsx('rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            (player.breakout.label.toLowerCase().includes('upside') || player.breakout.score > 0) ? 'breakout-positive' : 'breakout-negative'
          )}>
            {player.breakout.label}
          </span>
        )}
      </div>

      {/* News toggle */}
      <div className="px-3 pb-2">
        <button
          onClick={fetchNews}
          className={clsx('wr-btn w-full text-xs', showNews ? 'wr-btn-surface' : 'wr-btn-surface')}
        >
          <Newspaper className="h-3.5 w-3.5" />
          {newsLoading ? 'Loading...' : showNews ? 'Hide News' : 'Recent News & Status'}
        </button>
      </div>

      {/* News panel */}
      {showNews && (
        <div className="border-t border-border px-3 py-2 max-h-[200px] overflow-y-auto">
          {newsLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" />
            </div>
          ) : news ? (
            <div className="space-y-2">
              {/* Player bio + status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {news.age && <span className="text-[11px] text-text-secondary">Age {news.age}</span>}
                  {news.bat_side && <span className="text-[11px] text-text-muted">B: {news.bat_side}</span>}
                  {news.throw_hand && <span className="text-[11px] text-text-muted">T: {news.throw_hand}</span>}
                </div>
                <span className={clsx(
                  'rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                  news.status === 'Active' ? 'bg-steal/15 text-steal' :
                  news.status.startsWith('IL') ? 'bg-big-overpay/15 text-big-overpay' :
                  news.status === 'Minors' ? 'bg-overpay/15 text-overpay' :
                  'bg-text-muted/15 text-text-muted'
                )}>
                  {news.status}
                </span>
              </div>

              {/* IL warning */}
              {news.status.startsWith('IL') && (
                <div className="flex items-center gap-1.5 rounded bg-big-overpay/10 border border-big-overpay/20 px-2 py-1.5 text-[11px] text-big-overpay font-medium">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Currently on the {news.status.replace('IL-', '')}-day injured list
                </div>
              )}

              {/* Transactions */}
              {news.transactions.length > 0 ? (
                <div className="space-y-1.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">Recent Transactions</span>
                  {news.transactions.map((tx, i) => (
                    <div key={i} className="rounded bg-dugout border border-border px-2 py-1.5">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-mono text-text-muted">{tx.date}</span>
                        <span className="text-[10px] font-semibold text-text-secondary">{tx.type}</span>
                      </div>
                      <p className="text-[11px] text-text-secondary leading-snug">{tx.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-text-muted py-2">No recent transactions found.</p>
              )}

              {news.error && (
                <p className="text-[11px] text-big-overpay">{news.error}</p>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Target button */}
      <div className="border-t border-border p-2.5">
        <button
          onClick={onTarget}
          className="wr-btn wr-btn-gold w-full glow-gold text-xs"
        >
          <Crosshair className="h-3.5 w-3.5" />
          Target — Fill Bid Input
        </button>
      </div>
    </div>
  );
}

/* ─── Main DraftBoard ─── */
export default function DraftBoard() {
  const {
    players, searchQuery, setSearchQuery,
    positionFilter, setPositionFilter,
    showHitters, setShowHitters,
    watchlist, toggleWatchlist, setSelectedPlayer,
  } = useDraftStore();

  const [sortKey, setSortKey] = useState<SortKey>('inflated_value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [watchlistFirst, setWatchlistFirst] = useState(false);
  const [popover, setPopover] = useState<{ player: Player; top: number; left: number } | null>(null);
  const [showDrafted, setShowDrafted] = useState(false);
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
    // Toggle: ON = only drafted, OFF = only available
    let list = showDrafted
      ? players.filter((p) => p.is_drafted)
      : players.filter((p) => !p.is_drafted);
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
      if (watchlistFirst) {
        const aW = watchlist.includes(a.id) ? 0 : 1;
        const bW = watchlist.includes(b.id) ? 0 : 1;
        if (aW !== bW) return aW - bW;
      }
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
  }, [players, showHitters, positionFilter, searchQuery, sortKey, sortDir, watchlistFirst, watchlist, showDrafted, breakoutFilter]);

  const draftedCount = useMemo(() => players.filter((p) => p.is_drafted).length, [players]);

  const handleRowClick = (player: Player, e: React.MouseEvent) => {
    // Show floating card near click position
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopover({
      player,
      top: rect.top,
      left: rect.right + 8,
    });
  };

  const handleTarget = () => {
    if (popover) {
      setSelectedPlayer(popover.player);
      setPopover(null);
      // Auto-scroll to bid input
      setTimeout(() => {
        document.getElementById('bid-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  };

  return (
    <div className="wr-card relative">
      <div className="wr-card-header flex-wrap gap-3">
        <span className="wr-title">{showDrafted ? 'Drafted Players' : 'Available Players'}</span>
        <span className="font-mono text-xs text-text-muted">{showDrafted ? `${filtered.length} drafted` : `${filtered.length} available`}</span>
      </div>

      <div className="border-b border-border p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search players..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="wr-input pl-10"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {([{ label: 'All', value: null }, { label: 'Hitters', value: true }, { label: 'Pitchers', value: false }] as const).map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => setShowHitters(opt.value)}
                className={clsx('wr-chip', showHitters === opt.value && 'wr-chip-active')}
              >{opt.label}</button>
            ))}
          </div>

          <button
            onClick={() => setShowDrafted((v) => !v)}
            className={clsx('wr-chip ml-auto flex items-center gap-1', showDrafted && 'wr-chip-active')}
          >
            {showDrafted ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            Drafted{draftedCount > 0 ? ` (${draftedCount})` : ''}
          </button>
          <button
            onClick={() => setWatchlistFirst((v) => !v)}
            className={clsx('wr-chip flex items-center gap-1', watchlistFirst && 'wr-chip-active')}
          >
            <Star className={clsx('h-3 w-3', watchlistFirst && 'fill-current')} />
            Queue
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          <button onClick={() => setPositionFilter(null)} className={clsx('wr-chip', positionFilter === null && 'wr-chip-active')}>All</button>
          {ALL_POSITIONS.map((pos) => (
            <button
              key={pos}
              onClick={() => setPositionFilter(positionFilter === pos ? null : pos)}
              className={clsx('wr-chip', positionFilter === pos && 'wr-chip-active')}
            >{pos}</button>
          ))}
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

      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="wr-table">
          <thead>
            <tr>
              <th className="w-8"></th>
              <th className="sortable" onClick={() => toggleSort('name')}>Name <SortIcon col="name" /></th>
              <th>Team</th>
              <th>Pos</th>
              <th className="sortable text-right" onClick={() => toggleSort('inflated_value')} title="Inflation-adjusted auction dollar value — what you should bid">Value <SortIcon col="inflated_value" /></th>
              <th title="Price range bar: green = steal, blue = value, gray = fair, orange = overpay, red = big overpay">Range</th>
              <th className="sortable" onClick={() => toggleSort('breakout')} title="Breakout prediction from Statcast data — flags players likely to outperform (upside) or underperform (decline) their projections">Breakout <SortIcon col="breakout" /></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">{showDrafted ? 'No players drafted yet.' : 'No available players.'}</td></tr>
            )}
            {filtered.map((player, idx) => (
              <tr
                key={`${player.id}-${idx}`}
                onClick={(e) => !player.is_drafted && handleRowClick(player, e)}
                className={clsx(
                  !player.is_drafted && 'cursor-pointer',
                  player.is_drafted && 'drafted-row',
                  watchlist.includes(player.id) && !player.is_drafted && '!bg-gold/5',
                  popover?.player.id === player.id && 'active',
                )}
              >
                <td>
                  {!player.is_drafted && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleWatchlist(player.id); }}
                      className="text-text-muted hover:text-gold transition-colors"
                    >
                      <Star className={clsx('h-3.5 w-3.5', watchlist.includes(player.id) && 'fill-gold text-gold')} />
                    </button>
                  )}
                </td>
                <td className="font-medium">
                  <span style={{ color: 'var(--text-primary)' }}>{player.name}</span>
                  {player.is_drafted && (
                    <span className="drafted-tag">
                      {player.draft_team_id?.replace('team_', 'T') ?? ''} &middot; ${player.draft_price ?? '?'}
                    </span>
                  )}
                </td>
                <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{player.team}</td>
                <td>
                  <div className="flex gap-1">
                    {player.positions.map((p) => (
                      <span key={p} className={`pos-badge ${posClass(p)}`}>{p}</span>
                    ))}
                  </div>
                </td>
                <td className="text-right font-mono font-bold" style={{ color: player.is_drafted ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                  ${player.inflated_value.toFixed(1)}
                </td>
                <td>
                  {player.is_drafted
                    ? <span className={clsx('rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', signalClass(player.pre_bid_range, player.draft_price ?? 0))}>
                        {signalLabel(player.pre_bid_range, player.draft_price ?? 0)}
                      </span>
                    : <PriceRangeBar range={player.pre_bid_range} />
                  }
                </td>
                <td>
                  {player.breakout ? (
                    <span className={clsx(
                      'inline-block rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                      player.breakout.label === 'High Upside' ? 'breakout-positive' :
                      player.breakout.label === 'Moderate Upside' ? 'breakout-positive' :
                      player.breakout.label === 'Decline Risk' ? 'breakout-negative' :
                      'bg-text-muted/10 text-text-muted'
                    )}>
                      {player.breakout.label === 'Moderate Upside' ? 'Mod Upside' : player.breakout.label}
                    </span>
                  ) : (
                    <span className="text-text-muted text-xs">--</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Floating player card */}
      {popover && (
        <PlayerCard
          player={popover.player}
          position={{ top: popover.top, left: popover.left }}
          onClose={() => setPopover(null)}
          onTarget={handleTarget}
        />
      )}
    </div>
  );
}
