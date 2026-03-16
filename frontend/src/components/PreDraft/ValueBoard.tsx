import { useMemo, useState, useRef, useEffect } from 'react';
import { Search, Star, ChevronDown, ChevronUp, Newspaper, AlertTriangle, Info, X } from 'lucide-react';
import clsx from 'clsx';
import { useDraftStore } from '@/store/draftStore';
import { projectionsApi } from '@/api/client';
import type { Player } from '@/store/draftStore';

interface NewsArticle {
  title: string;
  link: string;
  source: string;
  published: string;
}

interface PlayerNews {
  player_id: number | null;
  status: string;
  transactions: { date: string; type: string; description: string }[];
  articles?: NewsArticle[];
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
  const [news, setNews] = useState<PlayerNews | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [showNews, setShowNews] = useState(false);
  const [showPricingInfo, setShowPricingInfo] = useState(false);

  const fetchNews = async (playerName: string) => {
    if (showNews) { setShowNews(false); return; }
    setShowNews(true);
    if (news) return;
    setNewsLoading(true);
    try {
      const res = await projectionsApi.getPlayerNews(playerName);
      setNews(res.data);
    } catch { setNews(null); }
    setNewsLoading(false);
  };

  const detailRef = useRef<HTMLDivElement>(null);

  const handleSelectPlayer = (player: Player) => {
    if (selectedPlayer?.id === player.id) {
      setSelectedPlayer(null);
    } else {
      setSelectedPlayer(player);
      setNews(null);
      setShowNews(false);
    }
  };

  useEffect(() => {
    if (selectedPlayer && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedPlayer]);

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
        <button
          onClick={() => setShowPricingInfo((v) => !v)}
          className={clsx('wr-chip flex items-center gap-1 ml-auto', showPricingInfo && 'wr-chip-active')}
          title="How pricing works"
        >
          <Info className="h-3 w-3" />
          How Pricing Works
        </button>
      </div>

      {showPricingInfo && (
        <div className="border-b border-border bg-dugout px-4 py-3 relative">
          <button onClick={() => setShowPricingInfo(false)} className="absolute top-2 right-2 text-text-muted hover:text-text-primary">
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="space-y-3 text-[12px] text-text-secondary leading-relaxed max-w-2xl">
            <div>
              <span className="text-text-primary font-semibold">Base Value</span> &mdash; Calculated from projected stats using Standings Gain Points (SGP). Each stat category (HR, R, RBI, SB, AVG for hitters; W, SV, K, ERA, WHIP for pitchers) is converted into how many points it would gain in the standings, then translated to auction dollars based on a 70/30 hitter/pitcher budget split.
            </div>
            <div>
              <span className="text-gold font-semibold">Keeper Adjusted</span> &mdash; Two adjustments applied on top of the base value:
            </div>
            <div className="pl-3 space-y-1.5">
              <div>
                <span className="text-text-primary font-medium">1. Keeper Inflation</span> &mdash; When teams keep players below market value, the remaining budget chasing fewer available players creates inflation. Formula: <span className="font-mono text-text-muted">remaining_budget / remaining_value</span>. More keepers kept cheaply = higher inflation for everyone.
              </div>
              <div>
                <span className="text-text-primary font-medium">2. Keeper League Premium</span> &mdash; In keeper leagues, young breakout candidates are worth more than one season of stats because you can keep them at their draft price in future years. Based on each player&apos;s breakout profile (age + Statcast metrics):
              </div>
              <div className="flex flex-wrap gap-3 pl-3 font-mono text-[11px]">
                <span className="text-steal">High Upside: +18%</span>
                <span className="text-value">Mod Upside: +10%</span>
                <span className="text-text-muted">Stable: +0%</span>
                <span className="text-big-overpay">Decline Risk: -8%</span>
              </div>
            </div>
            <div className="text-text-muted text-[11px]">
              Example: A player with $30 base value, 4% inflation, and High Upside breakout = $30 &times; 1.04 = $31.2, then +18% keeper premium = <span className="text-gold font-mono">$36.8</span>
            </div>

            <div className="border-t border-border pt-3 mt-1">
              <span className="text-text-primary font-semibold">Breakout Classification</span> &mdash; Each player is scored from -1.0 (decline) to +1.0 (high upside) based on age and Statcast metrics. Players below minimum playing time (200 PA hitters, 30 IP pitchers) are automatically &ldquo;Stable.&rdquo;
            </div>

            <div className="pl-3 space-y-2">
              <div>
                <span className="text-text-primary font-medium">Hitter Factors</span>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1 text-[11px] text-text-muted font-mono">
                  <span>Age 22-26: <span className="text-steal">+0.20</span></span>
                  <span>Age &ge;33: <span className="text-big-overpay">-0.20</span></span>
                  <span>xBA-BA gap &gt;.020: <span className="text-steal">+0.20</span></span>
                  <span>xBA-BA gap &lt;-.020: <span className="text-big-overpay">-0.15</span></span>
                  <span>xSLG &gt;.500: <span className="text-steal">+0.15</span></span>
                  <span>xwOBA &gt;.370: <span className="text-steal">+0.15</span></span>
                  <span>Barrel% &gt;12%: <span className="text-steal">+0.15</span></span>
                  <span>Hard Hit% &gt;45%: <span className="text-steal">+0.12</span></span>
                  <span>Spd &gt;6.0: <span className="text-steal">+0.12</span></span>
                </div>
              </div>

              <div>
                <span className="text-text-primary font-medium">Pitcher Factors</span>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1 text-[11px] text-text-muted font-mono">
                  <span>Age 23-27: <span className="text-steal">+0.20</span></span>
                  <span>Age &ge;34: <span className="text-big-overpay">-0.25</span></span>
                  <span>Stuff+ &gt;120: <span className="text-steal">+0.25</span></span>
                  <span>K% &gt;28%: <span className="text-steal">+0.15</span></span>
                  <span>xERA &lt;3.20: <span className="text-steal">+0.15</span></span>
                  <span>CSW% &gt;32%: <span className="text-steal">+0.12</span></span>
                  <span>SwStr% &gt;13%: <span className="text-steal">+0.10</span></span>
                  <span>Location+ &gt;110: <span className="text-steal">+0.10</span></span>
                </div>
              </div>

              <div>
                <span className="text-text-primary font-medium">Score Thresholds</span>
                <div className="flex flex-wrap gap-3 mt-1 font-mono text-[11px]">
                  <span className="text-steal">&ge;0.40 = High Upside</span>
                  <span className="text-value">&ge;0.25 = Moderate Upside</span>
                  <span className="text-text-muted">&gt;-0.30 = Stable</span>
                  <span className="text-big-overpay">&le;-0.30 = Decline Risk</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <th className="sortable text-right" onClick={() => toggleSort('inflated_value')} title="Keeper-adjusted value: base value + inflation + keeper league premium (click 'How Pricing Works' for details)">
                Keeper Adj. $ <SortIcon col="inflated_value" />
              </th>
              <th title="Bid range: Steal price (green) to Overpay threshold (red). Buy below the low end, avoid above the high end.">Bid Range</th>
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
                onClick={() => handleSelectPlayer(player)}
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
                  {player.keeper_premium !== 0 && (
                    <span className={clsx('text-[9px] ml-0.5', player.keeper_premium > 0 ? 'text-steal' : 'text-big-overpay')}>
                      {player.keeper_premium > 0 ? '+' : ''}{player.keeper_premium.toFixed(1)}
                    </span>
                  )}
                </td>
                <td>
                  {player.pre_bid_range ? (
                    <span className="font-mono text-[11px] whitespace-nowrap">
                      <span className="text-steal">${player.pre_bid_range.steal_below.toFixed(0)}</span>
                      <span className="text-text-muted mx-0.5">&ndash;</span>
                      <span className="text-big-overpay">${player.pre_bid_range.overpay_above.toFixed(0)}</span>
                    </span>
                  ) : (
                    <span className="text-text-muted text-xs">--</span>
                  )}
                </td>
                <td><BreakoutBadge breakout={player.breakout} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selectedPlayer && (
        <div ref={detailRef} className="border-t border-border bg-dugout p-4">
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
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Keeper Adj.</div>
              <div className="font-mono text-lg font-bold text-gold">
                ${selectedPlayer.inflated_value.toFixed(1)}
                {selectedPlayer.keeper_premium !== 0 && (
                  <span className={clsx('text-xs ml-1', selectedPlayer.keeper_premium > 0 ? 'text-steal' : 'text-big-overpay')}>
                    {selectedPlayer.keeper_premium > 0 ? '+' : ''}{selectedPlayer.keeper_premium.toFixed(1)}
                  </span>
                )}
              </div>
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

          {/* News toggle */}
          <div className="mt-3">
            <button
              onClick={() => fetchNews(selectedPlayer.name)}
              className="wr-btn wr-btn-surface w-full text-xs"
            >
              <Newspaper className="h-3.5 w-3.5" />
              {newsLoading ? 'Loading...' : showNews ? 'Hide News' : 'Recent News & Status'}
            </button>
          </div>

          {/* News panel */}
          {showNews && (
            <div className="mt-3 rounded border border-border bg-surface p-3 max-h-[300px] overflow-y-auto">
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

                  {/* News Articles */}
                  {news.articles && news.articles.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">Latest News</span>
                      {news.articles.map((article, i) => (
                        <a
                          key={i}
                          href={article.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded bg-dugout border border-border px-2 py-1.5 hover:border-gold/40 transition-colors group"
                        >
                          <p className="text-[11px] text-text-primary leading-snug group-hover:text-gold transition-colors">{article.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {article.source && <span className="text-[10px] font-semibold text-text-muted">{article.source}</span>}
                            {article.published && <span className="text-[10px] font-mono text-text-muted">{article.published}</span>}
                          </div>
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Transactions */}
                  {news.transactions.length > 0 && (
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
                  )}

                  {!news.articles?.length && !news.transactions.length && (
                    <p className="text-[11px] text-text-muted py-2">No recent news or transactions found.</p>
                  )}

                  {news.error && (
                    <p className="text-[11px] text-big-overpay">{news.error}</p>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
