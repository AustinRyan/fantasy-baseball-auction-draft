# Scouting Board - Design Spec

## Overview

A dedicated "Scouting" tab in the draft room with full scouting report cards for pre-researched players. Each player is categorized by signal type (Breakout, Bounce-Back, Value Trap, Overpay Risk) and includes an editable narrative explaining the bull/bear case. Players are pre-populated from research and can be manually added/removed.

## Signal Taxonomy

| Signal | Key | Color | CSS Class | Meaning |
|--------|-----|-------|-----------|---------|
| Breakout | `breakout` | Green (`--steal`) | `signal-breakout` | Spring/Statcast upside, prospect call-up, step-forward |
| Bounce-Back | `bounce_back` | Blue (`#3b82f6`) | `signal-bounce-back` | Bad 2025 but talent/metrics say rebound |
| Value Trap | `value_trap` | Orange (`#f59e0b`) | `signal-value-trap` | Looks good on paper, underlying decline |
| Overpay Risk | `overpay_risk` | Red (`--big-overpay`) | `signal-overpay-risk` | Name/reputation gets bid up past real value |

## Backend

### Data Model

New file: `backend/app/models/scouting.py`

```python
class ScoutingCandidate(BaseModel):
    player_id: str
    signal: Literal["breakout", "bounce_back", "value_trap", "overpay_risk"]
    target_bid_low: float
    target_bid_high: float
    narrative: str
```

### Persistence

File: `backend/data/draft_state/scouting_board.json`

```json
[
  {
    "player_id": "fg_12345",
    "signal": "breakout",
    "target_bid_low": 3.0,
    "target_bid_high": 5.0,
    "narrative": "Spring training: .538 AVG, 95 mph avg EV..."
  }
]
```

Loaded on startup alongside draft state. Saved on every mutation.

### New Service

New file: `backend/app/services/scouting_service.py`

Functions:
- `get_scouting_board() -> list[ScoutingCandidate]` - Return all candidates
- `add_candidate(player_id, signal, target_bid_low, target_bid_high, narrative) -> ScoutingCandidate` - Add player to board
- `update_candidate(player_id, signal?, target_bid_low?, target_bid_high?, narrative?) -> ScoutingCandidate` - Update fields
- `remove_candidate(player_id) -> bool` - Remove from board
- `save_board()` / `load_board()` - JSON persistence
- `get_default_board() -> list[ScoutingCandidate]` - Return pre-populated research candidates (called if no saved board exists)

### API Endpoints

Added to draft router (`backend/app/routers/draft.py`):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/draft/scouting-board` | GET | Get all scouting candidates (merged with player data from store) |
| `/draft/scouting-board` | POST | Add player to board `{player_id, signal, target_bid_low, target_bid_high, narrative}` |
| `/draft/scouting-board/{player_id}` | PUT | Update signal, narrative, or target bid |
| `/draft/scouting-board/{player_id}` | DELETE | Remove player from board |

GET response merges scouting data with full player data:
```json
[
  {
    "player_id": "fg_12345",
    "signal": "breakout",
    "target_bid_low": 3.0,
    "target_bid_high": 5.0,
    "narrative": "Spring training...",
    "player": {
      "id": "fg_12345",
      "name": "Chase DeLauter",
      "team": "CLE",
      "positions": ["OF"],
      "hitting": { "PA": 462, "HR": 12, "R": 50, ... },
      "dollar_value": 7.3,
      "inflated_value": 8.1,
      "pre_bid_range": { ... },
      "breakout": { "score": 0.35, "label": "Moderate Upside", ... },
      "is_drafted": false,
      ...
    }
  }
]
```

## Frontend

### New Tab

Add "Scouting" tab to App.tsx tab navigation, between "Draft Room" and "Analysis":

```
[Pre-Draft] [Draft Room] [Scouting] [Analysis]
```

Keyboard shortcut: `Mod+3` for Scouting, shift existing Analysis to `Mod+4`.

### New Component

New file: `frontend/src/components/DraftRoom/ScoutingBoard.tsx`

### Tab Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Scout Board (26 players)              [+ Add Player]         │
│ [All] [Breakout] [Bounce-Back] [Value Trap] [Overpay Risk]  │
│ Sort: [Signal Type ▼] [Projected $] [Target Bid]            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────┐  ┌─────────────────────────┐   │
│  │  Card 1                 │  │  Card 2                 │   │
│  └─────────────────────────┘  └─────────────────────────┘   │
│  ┌─────────────────────────┐  ┌─────────────────────────┐   │
│  │  Card 3                 │  │  Card 4                 │   │
│  └─────────────────────────┘  └─────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Two-column grid on desktop (`grid-cols-2`), single column on mobile
- Filter chips use same `wr-chip` / `wr-chip-active` pattern as DraftBoard
- Cards grouped by signal type when sorted by signal (section headers)
- Drafted players get `opacity-40` + strikethrough on name

### Scouting Card Component

New file: `frontend/src/components/DraftRoom/ScoutingCard.tsx`

```
┌─────────────────────────────────────────────────────────────┐
│ [BREAKOUT]  Chase DeLauter    CLE  OF        [$3-5 Target] │
│─────────────────────────────────────────────────────────────│
│ R: 50  HR: 12  RBI: 55  SB: 3  OBP: .313    Proj: $7.3    │
│ Inflated: $8.1   |  ████████░░░░ Steal < $5.7              │
│ Breakout: Moderate Upside (0.35)                            │
│─────────────────────────────────────────────────────────────│
│ Spring training: .538 AVG, 95.4 mph avg exit velo, 64%     │
│ hard-hit rate, 7% K rate. Missed most of 2025 with         │
│ injuries. The Statcast profile is elite -- if he gets       │
│ 550 PA he's a $15-20 player. Risk: injury history.          │
│─────────────────────────────────────────────────────────────│
│ [⊕ Queue]  [◎ Target]  [✕ Remove]                          │
└─────────────────────────────────────────────────────────────┘
```

Card sections:
1. **Header row**: Signal badge (colored pill), player name, team, position badges, target bid range
2. **Stats row**: Projected stat line (R/HR/RBI/SB/OBP or W/SV/K/ERA/WHIP), projected dollar value, inflated value, price range bar (reuse existing DraftBoard visualization), breakout label + score
3. **Narrative**: Multi-line text block with the scouting report. Clicking shows an edit textarea; blur/enter saves via PUT endpoint.
4. **Action row**: Queue button (star toggle via `toggleWatchlist`), Target button (sets `selectedPlayer`), Remove button (DELETE endpoint + confirmation)

### Add Player Modal

Triggered by "+ Add Player" button in header. Simple modal:
- Player search input (same autocomplete as BidInput, filtered to non-scouted available players)
- Signal type dropdown (4 options)
- Target bid low/high inputs
- Narrative textarea
- "Add" button → POST endpoint

### Zustand Store Additions

Add to `draftStore.ts`:

```typescript
// New state
scoutingBoard: ScoutingEntry[];

// New actions
fetchScoutingBoard: () => Promise<void>;
addScoutingCandidate: (data: NewScoutingCandidate) => Promise<void>;
updateScoutingCandidate: (playerId: string, data: Partial<ScoutingCandidate>) => Promise<void>;
removeScoutingCandidate: (playerId: string) => Promise<void>;
```

```typescript
interface ScoutingEntry {
  player_id: string;
  signal: "breakout" | "bounce_back" | "value_trap" | "overpay_risk";
  target_bid_low: number;
  target_bid_high: number;
  narrative: string;
  player: Player;  // merged from player store
}
```

### API Client Additions

Add to `client.ts`:

```typescript
scoutingApi: {
  getBoard: () => axios.get('/draft/scouting-board'),
  addCandidate: (data) => axios.post('/draft/scouting-board', data),
  updateCandidate: (playerId, data) => axios.put(`/draft/scouting-board/${playerId}`, data),
  removeCandidate: (playerId) => axios.delete(`/draft/scouting-board/${playerId}`),
}
```

## Pre-Populated Players

### Breakout (10 players)

| Player | Team | Target Bid | Narrative Summary |
|--------|------|-----------|-------------------|
| Chase DeLauter | CLE | $3-5 | Spring .538 AVG, 95 mph EV, 64% hard-hit, 7% K rate. Healthy bounce-back from injury year. |
| Wilyer Abreu | BOS | $10-12 | Reworked swing (shorter, quicker), WBC performance, 22 HR in fewer games. No more platoon. |
| Jonathan Aranda | TBR | $8-12 | Hit .316 in 2025, 91st percentile EV, .362 xwOBA. Yandy to DH opens 1B job. |
| Nick Kurtz | ATH | $22-25 | 38 HR projection, top prospect with elite raw power. K rate concern (31%) but handles every level. |
| Tyler Soderstrom | ATH | $12-15 | 25 HR breakout in 2025, signed $86M extension. Only 23, power still climbing. |
| Lawrence Butler | ATH | $12-15 | 21 HR / 18 SB combo, age 25. A's building around him. Speed + power trending up. |
| Luke Keaschall | MIN | $5-8 | 11 HR / 24 SB / .347 OBP. Rare speed + patience combo. Locked into MIN 2B job. |
| Caleb Durbin | BOS | $3-5 | 10 HR / 21 SB / .325 OBP in Boston lineup. Sneaky speed, could get 600 PA. |
| Chandler Simpson | TBR | $1-2 | 42 projected SB. Elite speed, nothing else. Cheapest SB source available. |
| Kazuma Okamoto | TOR | $8-10 | 248 NPB HR, 6x All-Star. Spring .400/1.289 OPS, 431-ft homer. Risk: no MiLB seasoning. |

### Bounce-Back (6 players)

| Player | Team | Target Bid | Narrative Summary |
|--------|------|-----------|-------------------|
| Colton Cowser | BAL | $5-8 | Hit .196 in 2025 but 16 HR/14 SB in 92 games. 2024 rookie: 120 OPS+, 3.1 bWAR. No CF competition. |
| Jackson Holliday | BAL | $8-12 | Improved in 2025 (17/17 HR/SB). Hamate surgery Feb -- post-hamate power unlock? Only 22. |
| Jo Adell | LAA | $8-12 | 30 HR projection with elite raw power. Batting 5th, everyday ABs. One adjustment away. |
| Royce Lewis | MIN | $3-5 | 18 HR/10 SB when healthy. Never played full season. Injury discount = value if he gets 500 PA. |
| Trevor Story | BOS | $5-8 | 20 HR/23 SB projection, middle of BOS lineup. Health is the only question. |
| Wyatt Langford | TEX | $22-25 | 24 HR/23 SB, 5-cat contributor. Only 24, hitting 2nd in TEX. 30/30 ceiling. |

### Value Trap (5 players)

| Player | Team | Target Bid | Narrative Summary |
|--------|------|-----------|-------------------|
| Josh Naylor | SEA | Let go >$20 | 30 SB in 2025 was insane outlier (2nd percentile speed, never >10 before). BABIP .315 spike. Regression guaranteed. |
| Pete Alonso | BAL | Let go >$25 | Two lowest HR rates of career in last two seasons. Age 32, bat slowing. Name will get overpaid. |
| Yandy Diaz | TBR | Let go >$15 | One-dimensional OBP player (.358). Only 19 HR/2 SB. Moving to full-time DH. |
| Giancarlo Stanton | NYY | Don't bid >$3 | 397 PA projected, .224/.301. DH-only, injury-prone, ratio killer. |
| Steven Kwan | CLE | Let go >$15 | Only 9 HR, value is OBP + 18 SB. Low ceiling, he is what he is. FG has him at $21.8 -- overpay. |

### Overpay Risk (5 players)

| Player | Team | Target Bid | Narrative Summary |
|--------|------|-----------|-------------------|
| Jose Altuve | HOU | Let go >$18 | Age 36, speed fading (10 SB in 2025), power metrics declining. Name gets bid up. |
| George Springer | TOR | Let go >$20 | Age 37. Durable recently but age catches everyone. Weaker TOR lineup around him. |
| Mike Trout | LAA | Let go >$10 | 502 PA projection generous. Hasn't been healthy in years. You're paying for 2019 Trout. |
| Brandon Nimmo | TEX | Let go >$15 | Solid but unspectacular. 21 HR/9 SB/.329 OBP. No upside beyond projection. Someone will overpay. |
| Gleyber Torres | DET | Let go >$12 | .343 OBP looks good but 17 HR/5 SB is underwhelming. New ballpark (DET) may suppress power. |

## Styling

Cards use existing design system:
- `wr-card` base with `wr-card-body`
- Signal badges: colored pills using new CSS classes (`signal-breakout`, `signal-bounce-back`, `signal-value-trap`, `signal-overpay-risk`)
- Position badges: existing `pos-badge` + position classes
- Price range bar: reuse DraftBoard's bar component
- Breakout labels: existing `breakout-positive` / `breakout-negative`
- Narrative text: `text-sm text-secondary`, editable on click with `wr-input` textarea
- Action buttons: `wr-btn-ghost` with icons
- Drafted overlay: `opacity-40` with strikethrough

## Files Changed

### New Files
- `backend/app/models/scouting.py` - ScoutingCandidate model
- `backend/app/services/scouting_service.py` - CRUD + persistence + defaults
- `frontend/src/components/DraftRoom/ScoutingBoard.tsx` - Tab content with grid layout
- `frontend/src/components/DraftRoom/ScoutingCard.tsx` - Individual card component

### Modified Files
- `backend/app/routers/draft.py` - Add 4 scouting board endpoints
- `backend/app/main.py` - Load scouting board on startup
- `frontend/src/api/client.ts` - Add scoutingApi methods
- `frontend/src/store/draftStore.ts` - Add scouting state + actions
- `frontend/src/App.tsx` - Add Scouting tab + keyboard shortcut

## Not In Scope
- Auto-suggestion of candidates based on signals
- Spring training stat integration (narratives are manually written)
- Pitcher scouting candidates (hitters only for now, can add later)
- Sharing scouting board across users
