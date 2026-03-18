import { create } from 'zustand';
import { scoutingApi } from '../api/client';

export interface PriceRange {
  steal_below: number;
  value_below: number;
  fair_low: number;
  fair_high: number;
  overpay_above: number;
  big_overpay_above: number;
}

export interface Breakout {
  score: number;
  label: string;
  factors: string[];
}

export interface HittingStats {
  PA: number; HR: number; R: number; RBI: number; SB: number;
  BA: number; OBP: number; H: number; BB: number;
}

export interface PitchingStats {
  IP: number; W: number; SV: number; K: number;
  ERA: number; WHIP: number;
}

export interface Player {
  id: string;
  name: string;
  team: string;
  positions: string[];
  is_hitter: boolean;
  hitting: HittingStats | null;
  pitching: PitchingStats | null;
  dollar_value: number;
  inflated_value: number;
  keeper_premium: number;
  pre_bid_range: PriceRange | null;
  breakout: Breakout | null;
  is_drafted: boolean;
  is_keeper: boolean;
  keeper_salary: number | null;
  keeper_team_id: string | null;
  draft_price: number | null;
  draft_team_id: string | null;
}

export type SignalType = 'breakout' | 'bounce_back' | 'value_trap' | 'overpay_risk';

export interface ScoutingEntry {
  player_id: string;
  signal: SignalType;
  target_bid_low: number;
  target_bid_high: number;
  narrative: string;
  player: Player;
}

export interface DraftPick {
  id: string;
  player_id: string;
  player_name: string;
  team_id: string;
  price: number;
  classification: string;
}

export interface TeamInfo {
  id: string;
  name: string;
}

interface DraftStore {
  players: Player[];
  setPlayers: (players: Player[]) => void;
  markPlayerDrafted: (playerId: string, teamId: string, price: number) => void;
  markPlayerUndrafted: (playerId: string) => void;
  myTeamId: string;
  setMyTeamId: (id: string) => void;
  teamNames: TeamInfo[];
  setTeamNames: (teams: TeamInfo[]) => void;
  getTeamName: (teamId: string) => string;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  positionFilter: string | null;
  setPositionFilter: (pos: string | null) => void;
  showHitters: boolean | null;
  setShowHitters: (v: boolean | null) => void;
  watchlist: string[];
  toggleWatchlist: (playerId: string) => void;
  reorderWatchlist: (fromIndex: number, toIndex: number) => void;
  selectedPlayer: Player | null;
  setSelectedPlayer: (p: Player | null) => void;
  lastPicks: DraftPick[];
  setLastPicks: (picks: DraftPick[]) => void;
  draftActive: boolean;
  setDraftActive: (v: boolean) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  scoutingBoard: ScoutingEntry[];
  scoutingLoading: boolean;
  fetchScoutingBoard: () => Promise<void>;
  addScoutingCandidate: (data: {
    player_id: string; signal: string;
    target_bid_low: number; target_bid_high: number; narrative: string;
  }) => Promise<void>;
  updateScoutingCandidate: (playerId: string, data: Record<string, unknown>) => Promise<void>;
  removeScoutingCandidate: (playerId: string) => Promise<void>;
}

export const useDraftStore = create<DraftStore>((set, get) => ({
  players: [],
  setPlayers: (players) => {
    // Deduplicate by id (two-way players may appear in both hitter/pitcher data)
    const seen = new Set<string>();
    const unique = players.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    set({ players: unique });
  },
  markPlayerDrafted: (playerId, teamId, price) =>
    set((state) => ({
      players: state.players.map((p) =>
        p.id === playerId
          ? { ...p, is_drafted: true, draft_team_id: teamId, draft_price: price }
          : p
      ),
      // Clear selectedPlayer if it's the one being drafted (prevents stale target)
      selectedPlayer: state.selectedPlayer?.id === playerId ? null : state.selectedPlayer,
      // Sync scouting board
      scoutingBoard: state.scoutingBoard.map((e) =>
        e.player_id === playerId
          ? { ...e, player: { ...e.player, is_drafted: true, draft_team_id: teamId, draft_price: price } }
          : e
      ),
    })),
  markPlayerUndrafted: (playerId) =>
    set((state) => ({
      players: state.players.map((p) =>
        p.id === playerId
          ? { ...p, is_drafted: false, draft_team_id: null, draft_price: null }
          : p
      ),
    })),
  myTeamId: 'team_1',
  setMyTeamId: (id) => set({ myTeamId: id }),
  teamNames: Array.from({ length: 11 }, (_, i) => ({ id: `team_${i + 1}`, name: `Team ${i + 1}` })),
  setTeamNames: (teams) => set({ teamNames: teams }),
  getTeamName: (teamId) => {
    const state = useDraftStore.getState();
    return state.teamNames.find((t) => t.id === teamId)?.name ?? teamId;
  },
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  positionFilter: null,
  setPositionFilter: (pos) => set({ positionFilter: pos }),
  showHitters: null,
  setShowHitters: (v) => set({ showHitters: v }),
  watchlist: (() => {
    try {
      const saved = localStorage.getItem('watchlist');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  })(),
  toggleWatchlist: (playerId) =>
    set((state) => {
      const updated = state.watchlist.includes(playerId)
        ? state.watchlist.filter((id) => id !== playerId)
        : [...state.watchlist, playerId];
      localStorage.setItem('watchlist', JSON.stringify(updated));
      return { watchlist: updated };
    }),
  reorderWatchlist: (fromIndex, toIndex) =>
    set((state) => {
      const updated = [...state.watchlist];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      localStorage.setItem('watchlist', JSON.stringify(updated));
      return { watchlist: updated };
    }),
  selectedPlayer: null,
  setSelectedPlayer: (p) => set({ selectedPlayer: p }),
  lastPicks: [],
  setLastPicks: (picks) => set({ lastPicks: picks }),
  draftActive: false,
  setDraftActive: (v) => set({ draftActive: v }),
  darkMode: false,
  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
  scoutingBoard: [] as ScoutingEntry[],
  scoutingLoading: false,
  fetchScoutingBoard: async () => {
    set({ scoutingLoading: true });
    try {
      const { data } = await scoutingApi.getBoard();
      set({ scoutingBoard: data, scoutingLoading: false });
    } catch {
      set({ scoutingLoading: false });
    }
  },
  addScoutingCandidate: async (candidateData: {
    player_id: string; signal: string;
    target_bid_low: number; target_bid_high: number; narrative: string;
  }) => {
    await scoutingApi.addCandidate(candidateData);
    get().fetchScoutingBoard();
  },
  updateScoutingCandidate: async (playerId: string, data: Record<string, unknown>) => {
    await scoutingApi.updateCandidate(playerId, data);
    set((s) => ({
      scoutingBoard: s.scoutingBoard.map((e) =>
        e.player_id === playerId ? { ...e, ...data } : e
      ),
    }));
  },
  removeScoutingCandidate: async (playerId: string) => {
    await scoutingApi.removeCandidate(playerId);
    set((s) => ({
      scoutingBoard: s.scoutingBoard.filter((e) => e.player_id !== playerId),
    }));
  },
}));
