# Fantasy Baseball Auction Draft Tool

A full-stack auction draft assistant built for the **Potomac Valley Rotisserie League** — an AL-only, 11-team, keeper auction league with 5x5 roto scoring and $270 budgets.

Calculates accurate player valuations using Standings Gain Points (SGP), adjusts for keeper inflation, detects breakout candidates using Statcast data, and provides a live draft-day web app with real-time value updates, steal/overpay alerts, roster tracking, and draft recommendations.

## Tech Stack

- **Backend**: Python 3.11+ / FastAPI / Pandas (in-memory, ~400 AL players)
- **Frontend**: React 19 / TypeScript / Vite / Tailwind CSS v4 / Zustand
- **Data**: FanGraphs projection CSVs (Steamer/ZiPS/ATC) + Statcast advanced metrics

---

## Quick Start

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API runs at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`. The Vite dev server proxies `/api` and `/ws` requests to the backend on port 8000.

### 3. Production Build

```bash
cd frontend
npm run build
```

Output goes to `frontend/dist/`. Serve with any static file server, pointing API routes to the backend.

---

## Project Structure

```
fantasy_baseball_algo/
├── backend/
│   ├── app/
│   │   ├── main.py                      # FastAPI entry point, CORS, router mounts
│   │   ├── config.py                    # League settings (teams, budget, roster, SGP denominators)
│   │   ├── models/
│   │   │   ├── player.py                # Player, HittingProjection, PitchingProjection, BreakoutProfile
│   │   │   ├── league.py                # League, Team, Keeper
│   │   │   └── draft.py                 # DraftPick, DraftState
│   │   ├── services/
│   │   │   ├── projection_loader.py     # CSV import, column normalization, AL filter, Statcast merge
│   │   │   ├── sgp_calculator.py        # SGP denominators + per-player SGP across all categories
│   │   │   ├── valuation_engine.py      # SGP → dollar values, replacement level, inflation
│   │   │   ├── keeper_manager.py        # Keeper CRUD, fuzzy name matching, inflation calc
│   │   │   ├── draft_tracker.py         # Live draft state, pick recording, undo, save/load
│   │   │   ├── alert_engine.py          # Steal/overpay classification on each pick
│   │   │   ├── breakout_predictor.py    # Upside/decline scoring from Statcast data
│   │   │   └── recommendation_engine.py # Next-pick suggestions based on roster needs + value
│   │   ├── routers/
│   │   │   ├── projections.py           # /api/projections/* (upload, statcast merge, list, clear)
│   │   │   ├── valuations.py            # /api/valuations/* (calculate, results)
│   │   │   ├── keepers.py               # /api/keepers/* (teams, import, link, inflation)
│   │   │   ├── draft.py                 # /api/draft/* (pick, undo, state, roster, recommendations)
│   │   │   └── export.py                # /api/export/* (pre-draft CSV/XLSX)
│   │   └── utils/
│   │       ├── al_teams.py              # AL team list + abbreviation aliases (ATH→OAK, etc.)
│   │       └── position_eligibility.py  # Position string parsing and mapping
│   ├── data/
│   │   ├── projections/                 # Persisted CSV uploads (survive restarts)
│   │   └── draft_state/                 # JSON backup of draft state
│   ├── tests/
│   │   ├── test_sgp_and_valuations.py
│   │   └── test_integration.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx                      # Main app with tab navigation, dark/light mode
│   │   ├── api/client.ts               # Axios API client for all endpoints
│   │   ├── store/draftStore.ts          # Zustand global state (players, filters, watchlist)
│   │   ├── components/
│   │   │   ├── PreDraft/                # ProjectionUploader, KeeperEditor, ValueBoard, LeagueSettings
│   │   │   ├── DraftRoom/              # DraftBoard, BidInput, AlertBanner, PlayerQueue
│   │   │   ├── MyRoster/               # MyRosterPanel, DraftRecommendations
│   │   │   └── Analysis/               # TeamRosters
│   │   └── hooks/                       # useKeyboardShortcuts
│   └── vite.config.ts                   # Proxy config for dev server
└── README.md
```

---

## League Configuration

Defined in `backend/app/config.py`. Defaults are pre-set for PVRL:

| Setting | Value |
|---------|-------|
| Teams | 11 |
| Budget | $270 per team ($2,970 total) |
| League | AL-only, 5x5 roto |
| Keepers | 4-10 per team |
| Hitting cats | R, HR, RBI, SB, BA |
| Pitching cats | W, SV, K, ERA, WHIP |
| Hitter/Pitcher $ split | 65% / 35% |
| Min IP | 900 (for ratio categories) |

**Roster (24 slots):** 2C, 1B, 2B, 3B, SS, MI, CI, 5OF, U, 10P

---

## How It Works

### Step 1: Upload Projections

Go to the **Pre-Draft** tab and upload FanGraphs CSV projections. Upload hitting and pitching files separately (or let the system auto-detect). The system:

1. Parses column names (handles FanGraphs format variations)
2. Filters to AL-only players using team abbreviations
3. Fetches positions from the MLB API if not in the CSV
4. Persists CSVs to `backend/data/projections/` so they survive restarts

### Step 2: Set Up Keepers

In the **Keeper Editor**, configure each team's keepers with player name and salary. You can:

- Add keepers manually per team (fuzzy name matching to player pool)
- Import a bulk CSV with columns: `team_name, player_name, salary`
- Click "Link Keepers" to match names to loaded players

### Step 3: Calculate Values

Click **Calculate Values** to run the full valuation pipeline:

1. **SGP Calculation** — Convert raw stats to Standings Gain Points per category
2. **Replacement Level** — Find the last draftable player at each position
3. **Dollar Values** — Convert SGP above replacement to auction dollars
4. **Inflation Adjustment** — Adjust for keeper surplus value
5. **Pre-Bid Ranges** — Generate steal/fair/overpay thresholds per player
6. **Breakout Scoring** — Flag upside and decline risk from Statcast data

### Step 4: Upload Breakout Data (Optional)

In the **Breakout Data** section of the Projections panel, upload Statcast CSVs to enhance breakout detection. These are separate from projection CSVs — they add advanced metrics that flag which players might outperform or underperform their projections.

### Step 5: Draft Day

Switch to the **Draft Room** tab. As each player is auctioned:

1. Search for the player in the bid input
2. Select the winning team and final price
3. Click "Record Pick"

The system instantly:
- Classifies the pick (Steal / Value / Fair / Overpay / Big Overpay)
- Updates remaining player values based on new inflation
- Refreshes your roster panel and budget
- Generates updated recommendations for your next pick

---

## Valuation Engine — How Dollar Values Are Calculated

### SGP (Standings Gain Points)

SGP measures how many standings points a player's projected stats contribute. Each stat category has a **denominator** — the number of raw stat units needed to gain one standing point in an 11-team league.

**SGP Denominators (calibrated for 11-team AL-only):**

| Category | Denominator | Meaning |
|----------|-------------|---------|
| R | 22.0 | 22 runs = 1 standings point |
| HR | 8.0 | 8 home runs = 1 standings point |
| RBI | 22.0 | 22 RBI = 1 standings point |
| SB | 8.0 | 8 stolen bases = 1 standings point |
| BA | 0.0035 | .0035 batting average = 1 standings point |
| W | 3.0 | 3 wins = 1 standings point |
| SV | 7.0 | 7 saves = 1 standings point |
| K | 30.0 | 30 strikeouts = 1 standings point |
| ERA | 0.18 | 0.18 ERA improvement = 1 standings point |
| WHIP | 0.017 | 0.017 WHIP improvement = 1 standings point |

**Counting stats** (R, HR, RBI, SB, W, SV, K): `SGP = projected_stat / denominator`

**Ratio stats** (BA, ERA, WHIP): Volume-weighted marginal contribution — a player's impact on the team average, weighted by their playing time (AB for BA, IP for ERA/WHIP), then divided by the denominator.

### Dollar Value Conversion

1. **Replacement level**: The SGP of the last draftable player per type (154th hitter, 110th pitcher across 11 teams)
2. **SGP above replacement**: `max(0, player_sgp - replacement_sgp)`
3. **Dollar allocation**: Total budget minus $1 per player, split 65/35 hitter/pitcher
4. **Dollars per SGP**: `allocated_dollars / total_sgp_above_replacement`
5. **Player value**: `(sgp_above_replacement × dollars_per_sgp) + $1`

### Keeper Inflation

When keepers are set below their projected value, the remaining dollar pool inflates:

```
remaining_budget = total_budget - sum(keeper_salaries)
remaining_value  = total_budget - sum(keeper_projected_values)
inflation_rate   = remaining_budget / remaining_value
inflated_value   = base_value × inflation_rate
```

Example: If keepers are collectively worth $800 but kept at $500, there's $300 extra in the pool — non-keeper values inflate by ~1.15x.

### Pre-Bid Value Ranges

For each player, the system generates price thresholds based on their inflated value:

| Classification | Range |
|---------------|-------|
| Big Steal | Below 70% of inflated value |
| Steal | 70–90% of inflated value |
| Fair | 90–110% of inflated value |
| Overpay | 110–120% of inflated value |
| Big Overpay | Above 140% of inflated value |

These appear as color-coded signals on every player row before and during the draft.

---

## Breakout Detection Algorithm

The breakout predictor is a **separate layer** on top of dollar values. It does NOT affect prices or fair bid ranges — it flags which players might outperform or underperform their projections based on Statcast and advanced metrics from the previous season.

Each player gets a composite score from -1.0 (decline risk) to +1.0 (high upside), which maps to a label: **High Upside**, **Moderate Upside**, **Stable**, or **Decline Risk**.

### Data Sources

**Hitter Statcast CSV** (from FanGraphs custom report, AL-only, min 150 PA):

| Stat | What It Measures | Why It Helps |
|------|-----------------|-------------|
| **Age** | Player age | 22-26 is the prime breakout window for hitters; 33+ signals decline risk |
| **xBA** | Expected batting average based on exit velocity and launch angle | Compares to projected BA — a positive gap (xBA > BA) means the hitter was unlucky and is due for improvement |
| **xSLG** | Expected slugging from Statcast | Catches hidden power upside that traditional stats miss |
| **xwOBA** | Expected weighted on-base average | The single best Statcast "true talent" metric — combines contact quality, exit velo, and launch angle into one number |
| **Barrel%** | Percentage of batted balls with optimal exit velo + launch angle | Elite barrel rate (>12%) strongly predicts power breakouts |
| **HardHit%** | Percentage of batted balls with 95+ mph exit velocity | Validates quality of contact — high hard hit rate supports xBA/xSLG |
| **Spd** | FanGraphs speed score (SB rate, triples, runs) | Identifies stolen base upside the projections may undervalue |

**Pitcher Statcast CSV** (from FanGraphs custom report, AL-only, min 50 IP):

| Stat | What It Measures | Why It Helps |
|------|-----------------|-------------|
| **Age** | Player age | 23-27 is the prime breakout window for pitchers; 34+ signals decline risk |
| **Stuff+** | Pitch quality model (velocity, movement, spin) indexed to 100 | The best single metric for raw stuff — elite >120 predicts K rate improvement |
| **K%** | Strikeout rate | Core performance indicator; elite >28% drives fantasy value in the K category |
| **CSW%** | Called Strike + Whip percentage | Best single pitch-level command metric — measures ability to get called strikes and whiffs |
| **xERA** | Expected ERA from Statcast | Reveals if a pitcher's ERA was lucky (xERA > ERA) or unlucky (xERA < ERA) |
| **Location+** | Command model indexed to 100 (complement to Stuff+) | Stuff+ measures raw stuff, Location+ measures where they put it — together they're the full picture |
| **SwStr%** | Swinging strike rate | Validates K% — high SwStr% confirms the strikeouts are skill, not luck |

### Scoring Thresholds

**Hitters:**

| Metric | Elite (positive score) | Above Avg | Poor (negative score) |
|--------|----------------------|-----------|----------------------|
| Age | 22-26: +0.20 | ≤21: +0.15 | ≥33: -0.20 |
| xBA gap | >+.020: +0.20 | — | <-.020: -0.15 |
| xSLG | >.500: +0.15 | >.430: +0.05 | <.340: -0.10 |
| xwOBA | >.370: +0.15 | >.330: +0.05 | <.280: -0.10 |
| Barrel% | >12%: +0.15 | >8%: +0.08 | <4%: -0.10 |
| HardHit% | >45%: +0.12 | >40%: +0.05 | <30%: -0.10 |
| Spd | >6.0: +0.12 | >4.5: +0.05 | <2.5: -0.05 |

**Pitchers:**

| Metric | Elite (positive score) | Above Avg | Poor (negative score) |
|--------|----------------------|-----------|----------------------|
| Age | 23-27: +0.20 | — | ≥34: -0.25 |
| Stuff+ | >120: +0.25 | >110: +0.12 | <90: -0.15 |
| K% | >28%: +0.15 | >23%: +0.05 | <16%: -0.10 |
| CSW% | >32%: +0.12 | >29%: +0.05 | <25%: -0.10 |
| xERA | <3.20: +0.15 | <3.80: +0.05 | >5.00: -0.10 |
| Location+ | >110: +0.10 | >100: +0.03 | <85: -0.08 |
| SwStr% | >13%: +0.10 | >11%: +0.03 | <8%: -0.08 |

### Label Mapping

| Score Range | Label |
|------------|-------|
| ≥ 0.40 | High Upside |
| 0.15 – 0.39 | Moderate Upside |
| -0.29 – 0.14 | Stable |
| ≤ -0.30 | Decline Risk |

### How to Use Breakout Data in the Draft

- **High Upside** player at fair price → be aggressive, bid up to the top of fair range
- **Moderate Upside** at a steal price → strong target, the projections may be conservative
- **Decline Risk** at fair price → let someone else overpay, or only buy at a steal
- **Stable** → trust the projections as-is, bid within the fair range

---

## Draft Recommendations

The recommendation engine analyzes your roster needs and suggests your next target:

1. Identifies unfilled roster slots on your team
2. For each slot, finds the top available players by inflated value
3. Calculates **urgency** — how much more the best option is worth vs. the next-best (positional scarcity signal)
4. Filters by budget constraints (can you afford this player and still fill remaining slots at $1 each?)
5. Ranks by: `urgency × 0.4 + player_value × 0.6`

Each recommendation shows: player name, position, fair price, steal price, and why it's recommended.

---

## Pick Classification & Alerts

Every recorded pick is instantly classified:

| Classification | Criteria |
|---------------|----------|
| Big Steal | Price below 70% of inflated value |
| Steal | Price at 70–90% of inflated value |
| Fair | Price at 90–110% of inflated value |
| Overpay | Price at 110–120% of inflated value |
| Big Overpay | Price above 140% of inflated value |

Recent picks appear in a color-coded ticker at the top of the draft room.

---

## API Reference

### Projections
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projections/upload` | Upload FanGraphs CSV (hitting or pitching) |
| POST | `/api/projections/statcast` | Upload Statcast CSV for breakout data |
| GET | `/api/projections/players` | List all loaded players |
| GET | `/api/projections/files` | List persisted CSV files |
| DELETE | `/api/projections/files/{filename}` | Delete a saved file |
| DELETE | `/api/projections/clear` | Clear all projections |

### Valuations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/valuations/calculate` | Run SGP + dollar value calculation |
| GET | `/api/valuations/results` | Get all player values with filters |

### Keepers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/keepers/teams` | List all teams and their keepers |
| POST | `/api/keepers/teams/{team_id}` | Set keepers for a team |
| PUT | `/api/keepers/teams/{team_id}` | Update team name/settings |
| GET | `/api/keepers/inflation` | Get current inflation rate |
| POST | `/api/keepers/import` | Bulk import keepers from CSV |
| POST | `/api/keepers/link` | Fuzzy-match keeper names to player pool |

### Draft
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/draft/start` | Start the draft |
| POST | `/api/draft/reset` | Reset draft state |
| POST | `/api/draft/pick` | Record a pick `{player_id, team_id, price}` |
| DELETE | `/api/draft/pick/{pick_id}` | Undo a pick |
| GET | `/api/draft/state` | Get full draft state |
| GET | `/api/draft/my-roster` | Get user's roster, budget, max bid |
| GET | `/api/draft/recommendations` | Get next-pick suggestions |
| GET | `/api/draft/alerts` | Get recent pick classifications |
| GET | `/api/draft/team/{team_id}/roster` | Get any team's roster |
| POST | `/api/draft/save` | Save draft state to JSON |
| POST | `/api/draft/load` | Load draft state from JSON |

### Export
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/export/pre-draft` | Download pre-draft values as CSV or XLSX |

### WebSocket
| Endpoint | Description |
|----------|-------------|
| `WS /ws/draft` | Real-time draft updates (pick broadcasts) |

---

## FanGraphs Data Setup

### Projection CSVs (Required)

Go to FanGraphs → Projections → select a system (Steamer, ZiPS, or ATC):

1. **Hitters**: Export with columns including Name, Team, PA, AB, H, HR, R, RBI, SB, BA (at minimum)
2. **Pitchers**: Export with columns including Name, Team, IP, W, SV, K, ERA, WHIP (at minimum)

The system auto-detects hitting vs. pitching and handles FanGraphs column name variations.

### Statcast / Breakout CSVs (Optional)

Go to FanGraphs → Leaders → create custom reports:

**Hitters** (min 150 PA, AL only):
Select: Name, Team, Age, Barrel%, HardHit%, xBA, xSLG, xwOBA, Spd

**Pitchers** (min 50 IP, AL only):
Select: Name, Team, Age, K%, CSW%, Stuff+, Location+, xERA, SwStr%

Upload these through the "Breakout Data" section in the Projections panel. Column order doesn't matter — the system matches by header name.

---

## Features

- Dark/light mode toggle
- Keyboard shortcuts for fast pick entry
- Instant local state updates (no page refresh needed after drafting)
- Draft state save/load for crash recovery
- Watchlist / starred players
- Sortable, filterable player tables with position badges
- Color-coded steal/overpay signals on every player
- Breakout/decline risk badges with detailed factor breakdowns
- Per-team roster viewer with budget tracking
- 900 IP minimum warning for pitcher slots
- Pre-draft export to CSV/XLSX for offline reference
