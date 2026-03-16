import { create } from 'zustand';

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

export interface Player {
  id: string;
  name: string;
  team: string;
  positions: string[];
  is_hitter: boolean;
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
  selectedPlayer: Player | null;
  setSelectedPlayer: (p: Player | null) => void;
  lastPicks: DraftPick[];
  setLastPicks: (picks: DraftPick[]) => void;
  draftActive: boolean;
  setDraftActive: (v: boolean) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
}

export const useDraftStore = create<DraftStore>((set) => ({
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
  watchlist: [],
  toggleWatchlist: (playerId) =>
    set((state) => ({
      watchlist: state.watchlist.includes(playerId)
        ? state.watchlist.filter((id) => id !== playerId)
        : [...state.watchlist, playerId],
    })),
  selectedPlayer: null,
  setSelectedPlayer: (p) => set({ selectedPlayer: p }),
  lastPicks: [],
  setLastPicks: (picks) => set({ lastPicks: picks }),
  draftActive: false,
  setDraftActive: (v) => set({ draftActive: v }),
  darkMode: false,
  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
}));
