# Scouting Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Scouting" tab to the draft room with pre-researched player cards showing signal type, projected stats, bid targets, and editable narratives.

**Architecture:** Backend CRUD service persists scouting candidates to JSON, merges with player projection data on GET. Frontend renders a filterable two-column card grid on a new tab. Pre-populated with ~26 AL hitters from research.

**Tech Stack:** Python 3.9 + FastAPI (backend), React + TypeScript + Tailwind CSS v4 + Zustand (frontend)

**Spec:** `docs/superpowers/specs/2026-03-17-scouting-board-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `backend/app/models/scouting.py` | ScoutingCandidate + ScoutingBoardEntry Pydantic models |
| `backend/app/services/scouting_service.py` | CRUD, JSON persistence, default board generation |
| `backend/tests/test_scouting.py` | Unit tests for scouting service |
| `frontend/src/components/DraftRoom/ScoutingBoard.tsx` | Tab container: filters, sort, grid, add-player modal |
| `frontend/src/components/DraftRoom/ScoutingCard.tsx` | Individual scouting card component |

### Modified Files
| File | Changes |
|------|---------|
| `backend/app/routers/draft.py` | 4 new endpoints (GET/POST/PUT/DELETE scouting-board) |
| `backend/app/main.py:59-66` | Load scouting board on startup |
| `frontend/src/api/client.ts:46-60` | Add scoutingApi object |
| `frontend/src/store/draftStore.ts:28-47,104-113` | Add types, state, actions, draft sync |
| `frontend/src/App.tsx:33,214-225,249-253,373-411` | Add tab, shortcut, fetch, render |
| `frontend/src/index.css:457-461` | Add 4 signal badge classes |

---

### Task 1: Backend Model

**Files:**
- Create: `backend/app/models/scouting.py`

- [ ] **Step 1: Create the scouting model file**

```python
"""Scouting board models."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel

SignalType = Literal["breakout", "bounce_back", "value_trap", "overpay_risk"]


class ScoutingCandidate(BaseModel):
    """Stored in scouting_board.json."""

    player_id: str
    signal: SignalType
    target_bid_low: float
    target_bid_high: float
    narrative: str


class ScoutingCandidateUpdate(BaseModel):
    """PUT request body - all fields optional."""

    signal: Optional[SignalType] = None
    target_bid_low: Optional[float] = None
    target_bid_high: Optional[float] = None
    narrative: Optional[str] = None


class ScoutingBoardEntry(BaseModel):
    """GET response: scouting data merged with player data."""

    player_id: str
    signal: SignalType
    target_bid_low: float
    target_bid_high: float
    narrative: str
    player: dict
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/scouting.py
git commit -m "feat(scouting): add scouting board Pydantic models"
```

---

### Task 2: Scouting Service

**Files:**
- Create: `backend/app/services/scouting_service.py`

- [ ] **Step 1: Create the scouting service with CRUD + persistence + defaults**

The service must:
- Maintain an in-memory `_board: list[ScoutingCandidate]`
- Persist to `backend/data/draft_state/scouting_board.json`
- Merge with player data from `projection_loader.get_player()`
- Provide `get_default_board()` with all 26 pre-researched players
- All functions use the player names from the projection CSV matched to FanGraphs IDs

Use these exact player IDs (from our projection data):

| Player | ID | Signal | Low | High |
|--------|-----|--------|-----|------|
| Chase DeLauter | 32127 | breakout | 3 | 5 |
| Wilyer Abreu | 23772 | breakout | 10 | 12 |
| Jonathan Aranda | 21837 | breakout | 8 | 12 |
| Nick Kurtz | 35110 | breakout | 22 | 25 |
| Tyler Soderstrom | 27467 | breakout | 12 | 15 |
| Lawrence Butler | 22542 | breakout | 12 | 15 |
| Luke Keaschall | 33321 | breakout | 5 | 8 |
| Caleb Durbin | 29646 | breakout | 3 | 5 |
| Chandler Simpson | 31912 | breakout | 1 | 2 |
| Kazuma Okamoto | sa3063134 | breakout | 8 | 10 |
| Colton Cowser | 29591 | bounce_back | 5 | 8 |
| Jackson Holliday | 31781 | bounce_back | 8 | 12 |
| Jo Adell | 20220 | bounce_back | 8 | 12 |
| Royce Lewis | 20437 | bounce_back | 3 | 5 |
| Trevor Story | 12564 | bounce_back | 5 | 8 |
| Wyatt Langford | 33333 | bounce_back | 22 | 25 |
| Josh Naylor | 18839 | value_trap | 0 | 20 |
| Pete Alonso | 19251 | value_trap | 0 | 25 |
| Yandy Díaz | 16578 | value_trap | 0 | 15 |
| Giancarlo Stanton | 4949 | value_trap | 0 | 3 |
| Steven Kwan | 24610 | value_trap | 0 | 15 |
| Jose Altuve | 5417 | overpay_risk | 0 | 18 |
| George Springer | 12856 | overpay_risk | 0 | 20 |
| Mike Trout | 10155 | overpay_risk | 0 | 10 |
| Brandon Nimmo | 12927 | overpay_risk | 0 | 15 |
| Gleyber Torres | 16997 | overpay_risk | 0 | 12 |

Full narratives for each player must be included in `get_default_board()` — copy verbatim from the spec's Pre-Populated Players tables.

```python
"""Scouting board service: CRUD, persistence, and default board."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from ..models.scouting import ScoutingCandidate, ScoutingBoardEntry
from .projection_loader import get_player, get_players

logger = logging.getLogger(__name__)

_board: list[ScoutingCandidate] = []
_SAVE_PATH = Path(__file__).resolve().parents[2] / "data" / "draft_state" / "scouting_board.json"


def get_scouting_board() -> list[ScoutingCandidate]:
    return list(_board)


def get_board_with_players() -> list[ScoutingBoardEntry]:
    entries = []
    for c in _board:
        p = get_player(c.player_id)
        if p is None:
            continue
        entries.append(ScoutingBoardEntry(
            player_id=c.player_id,
            signal=c.signal,
            target_bid_low=c.target_bid_low,
            target_bid_high=c.target_bid_high,
            narrative=c.narrative,
            player=p.model_dump(mode="json"),
        ))
    return entries


def add_candidate(
    player_id: str,
    signal: str,
    target_bid_low: float,
    target_bid_high: float,
    narrative: str,
) -> ScoutingCandidate:
    if any(c.player_id == player_id for c in _board):
        raise ValueError(f"Player {player_id} already on scouting board")
    candidate = ScoutingCandidate(
        player_id=player_id,
        signal=signal,
        target_bid_low=target_bid_low,
        target_bid_high=target_bid_high,
        narrative=narrative,
    )
    _board.append(candidate)
    save_board()
    return candidate


def update_candidate(player_id: str, **kwargs) -> ScoutingCandidate:
    for c in _board:
        if c.player_id == player_id:
            for k, v in kwargs.items():
                if v is not None:
                    setattr(c, k, v)
            save_board()
            return c
    raise ValueError(f"Player {player_id} not on scouting board")


def remove_candidate(player_id: str) -> bool:
    global _board
    before = len(_board)
    _board = [c for c in _board if c.player_id != player_id]
    if len(_board) < before:
        save_board()
        return True
    return False


def save_board() -> None:
    _SAVE_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = [c.model_dump() for c in _board]
    _SAVE_PATH.write_text(json.dumps(data, indent=2))


def load_board() -> list[ScoutingCandidate]:
    global _board
    if _SAVE_PATH.exists():
        data = json.loads(_SAVE_PATH.read_text())
        _board = [ScoutingCandidate(**item) for item in data]
        logger.info(f"Loaded scouting board with {len(_board)} candidates")
    else:
        _board = get_default_board()
        save_board()
        logger.info(f"Created default scouting board with {len(_board)} candidates")
    return _board


def get_default_board() -> list[ScoutingCandidate]:
    """Pre-populated research candidates. Only called on first load."""
    return [
        # === BREAKOUT ===
        ScoutingCandidate(player_id="32127", signal="breakout", target_bid_low=3, target_bid_high=5,
            narrative="Spring training: .538 AVG, 95.4 mph avg exit velo, 64% hard-hit rate, 7% K rate. Missed most of 2025 with injuries (fractured foot, hamate, core surgery). The Statcast profile is elite -- hard contact + low whiff. If he gets 550 PA he's a $15-20 player. Risk: injury history is real."),
        ScoutingCandidate(player_id="23772", signal="breakout", target_bid_low=10, target_bid_high=12,
            narrative="Reworked swing -- shorter, quicker -- showed in WBC where he crushed a huge homer. Went from 15 HR (2024) to 22 HR (2025) in fewer games. Red Sox committed to playing him against both sides (no more platoon). If he hits .260+ instead of .245 with same power, that's a $22-25 player."),
        ScoutingCandidate(player_id="21837", signal="breakout", target_bid_low=8, target_bid_high=12,
            narrative="Hit .316/.833 OPS in 106 games in 2025. Statcast: 91st percentile exit velo, .362 xwOBA, .518 xSLG. Yandy Diaz moving to full-time DH opens the 1B job entirely. The underlying metrics say .316 wasn't a fluke -- barrel rate and hard-hit rate support real 20+ HR power with high AVG."),
        ScoutingCandidate(player_id="35110", signal="breakout", target_bid_low=22, target_bid_high=25,
            narrative="38 HR projection, top prospect with elite raw power. A's building the lineup around him, Soderstrom, and Butler. K rate concern (31%) but has handled every challenge thrown at him as a professional. If contact improves even marginally, 40+ HR is in play."),
        ScoutingCandidate(player_id="27467", signal="breakout", target_bid_low=12, target_bid_high=15,
            narrative="25 HR breakout in 2025, signed 7-year $86M extension. Only 23, the power could keep climbing. The extension signals the A's see a cornerstone. If he goes from 25 HR to 30+ with improved OBP, he's a $25+ player."),
        ScoutingCandidate(player_id="22542", signal="breakout", target_bid_low=12, target_bid_high=15,
            narrative="21 HR / 18 SB combo, age 25. A's building around him. Speed + power trending up at this age usually continues. Locked-in everyday role in a lineup that's getting better."),
        ScoutingCandidate(player_id="33321", signal="breakout", target_bid_low=5, target_bid_high=8,
            narrative="11 HR / 24 SB / .347 OBP. Rare speed + patience combo. Locked into MIN's 2B job. Projections are conservative on a guy who hasn't had full MLB reps yet. Speed is real and the plate discipline is elite for a young player."),
        ScoutingCandidate(player_id="29646", signal="breakout", target_bid_low=3, target_bid_high=5,
            narrative="10 HR / 21 SB / .325 OBP in the Boston lineup. Sneaky speed, could get 600 PA. Playing in a great lineup means more RBI/R opportunities than the raw stats suggest."),
        ScoutingCandidate(player_id="31912", signal="breakout", target_bid_low=1, target_bid_high=2,
            narrative="42 projected SB. Elite speed, nothing else -- .324 OBP, near-zero power. If you need SB in your league, this is the cheapest source available. Pure one-category filler for $1."),
        ScoutingCandidate(player_id="sa3063134", signal="breakout", target_bid_low=8, target_bid_high=10,
            narrative="248 NPB career HR with Yomiuri Giants, 6x NPB All-Star. Led NPB in HR 3 times. Spring training: .400 AVG, 1.289 OPS, 431-ft homer off Clay Holmes. 'One of the smoothest right-handed swings you'll ever see.' Risk: straight from NPB with no MiLB seasoning. If he adjusts well, 30 HR is easily in play."),
        # === BOUNCE-BACK ===
        ScoutingCandidate(player_id="29591", signal="bounce_back", target_bid_low=5, target_bid_high=8,
            narrative="Hit .196 in 2025 but still had 16 HR, 14 SB in only 92 games. His 2024 rookie year: 120 OPS+, 3.1 bWAR -- that's who he actually is. Job security locked (no CF competition). A .196 AVG with that power/speed profile screams BABIP bad luck + injury. Risk: K rate (35.6%) is a real problem."),
        ScoutingCandidate(player_id="31781", signal="bounce_back", target_bid_low=8, target_bid_high=12,
            narrative="Improved significantly in 2025: .242/.314/.375, 17 HR, 17 SB in 649 PA. Broken hamate surgery (Feb 12) -- expected back early April. Still only 22, #1 overall pick pedigree. Post-hamate players often unlock more power (Kris Bryant, Buster Posey). 20/20 is the real ceiling."),
        ScoutingCandidate(player_id="20220", signal="bounce_back", target_bid_low=8, target_bid_high=12,
            narrative="30 HR projection with legit raw power tools. Batting 5th for LAA, guaranteed everyday ABs. Only 27. If the contact issues (.296 OBP projected) improve even marginally, the 30 HR power makes him elite. Classic 'one adjustment away' player. Risk: has teased breakout for years."),
        ScoutingCandidate(player_id="20437", signal="bounce_back", target_bid_low=3, target_bid_high=5,
            narrative="18 HR / 10 SB when healthy. Has never stayed healthy for a full season -- could go for $3-5 as an injury discount. Enormous upside if he finally gets 500 PA. A $20 player priced at $3-5."),
        ScoutingCandidate(player_id="12564", signal="bounce_back", target_bid_low=5, target_bid_high=8,
            narrative="20 HR / 23 SB projection, middle of BOS lineup. When healthy, the speed + power combo in that lineup is extremely valuable. Health is the only question -- if he plays 130+ games, easily a $20+ player."),
        ScoutingCandidate(player_id="33333", signal="bounce_back", target_bid_low=22, target_bid_high=25,
            narrative="24 HR / 23 SB -- rare 5-category contributor. Only 24, hitting 2nd in a revamped Texas lineup. Speed + power combo at this age usually trends up, not down. 30/30 is in play. Texas invested in the lineup around him."),
        # === VALUE TRAP ===
        ScoutingCandidate(player_id="18839", signal="value_trap", target_bid_low=0, target_bid_high=20,
            narrative="Had 30 SB in 2025 after NEVER topping 10 before in his career. 2nd percentile sprint speed -- the SB output was an insane outlier. BABIP spiked to .315 (career avg ~.285), barrel/hard-hit rates below average. Regression is virtually guaranteed. Even the 17 SB projection might be generous."),
        ScoutingCandidate(player_id="19251", signal="value_trap", target_bid_low=0, target_bid_high=25,
            narrative="Two lowest HR rates of his career in the last two seasons. Turning 32, the power decline is trend-based, not noise. Moving to BAL helps lineup context but the bat is slowing. Someone will pay $30+ for the name -- let them."),
        ScoutingCandidate(player_id="16578", signal="value_trap", target_bid_low=0, target_bid_high=15,
            narrative="One-dimensional OBP player (.358). Only 19 HR and 2 SB. Moving to full-time DH means less positional flexibility. His value is heavily OBP-dependent -- if that drops to .340 he's a $10 player. Zero speed and modest power make him less valuable than the raw OBP suggests in 5x5."),
        ScoutingCandidate(player_id="4949", signal="value_trap", target_bid_low=0, target_bid_high=3,
            narrative="Only 397 PA projected, and even that might be generous. 23 HR is nice but .224 AVG / .301 OBP kills your ratios. DH-only, injury-prone, ratio killer. Someone will bid $8 on the name -- let them."),
        ScoutingCandidate(player_id="24610", signal="value_trap", target_bid_low=0, target_bid_high=15,
            narrative="Only 9 HR projected. Value is OBP (.340) and SB (18). Low ceiling -- he is what he is: a high-floor, low-upside contact hitter. FanGraphs had him at $21.8. Someone will pay $20 for a guy whose ceiling is $18. Let them overpay for the batting average."),
        # === OVERPAY RISK ===
        ScoutingCandidate(player_id="5417", signal="overpay_risk", target_bid_low=0, target_bid_high=18,
            narrative="Age 36 (turning 36 in May). Speed fading: only 10 SB in 2025. Power metrics in decline, propped up by Minute Maid Park. In a keeper league, someone overpays for the name. Real value is probably $12-15 for an aging 2B with diminishing speed/power."),
        ScoutingCandidate(player_id="12856", signal="overpay_risk", target_bid_low=0, target_bid_high=20,
            narrative="Age 37 entering 2026. Has been remarkably durable recently but age catches everyone. Toronto's lineup is weaker around him. If he loses 50 PA to rest days/nagging injuries, the counting stats crater. Real value $16-18."),
        ScoutingCandidate(player_id="10155", signal="overpay_risk", target_bid_low=0, target_bid_high=10,
            narrative="The name will get bid up to $15+ by someone nostalgic. Only 502 PA projected and hasn't been healthy in years. You're paying for 2019 Trout -- you're getting 2024-25 Trout: 300 PA and an IL stint."),
        ScoutingCandidate(player_id="12927", signal="overpay_risk", target_bid_low=0, target_bid_high=15,
            narrative="Solid but unspectacular. 21 HR / 9 SB / .329 OBP. No upside beyond projection -- he is what he is. Someone will overpay for the consistency. Not worth more than $15 in AL-only."),
        ScoutingCandidate(player_id="16997", signal="overpay_risk", target_bid_low=0, target_bid_high=12,
            narrative=".343 OBP looks good but 17 HR / 5 SB is underwhelming. New ballpark (DET) may suppress power. Name recognition from NYY years will inflate his price beyond real value."),
    ]
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/scouting_service.py
git commit -m "feat(scouting): add scouting board service with CRUD and default board"
```

---

### Task 3: Backend Tests

**Files:**
- Create: `backend/tests/test_scouting.py`

- [ ] **Step 1: Write tests for the scouting service**

```python
"""Unit tests for scouting board service."""

from __future__ import annotations

import json
import pytest
from pathlib import Path
from unittest.mock import patch

from app.models.scouting import ScoutingCandidate
from app.services import scouting_service


@pytest.fixture(autouse=True)
def reset_board(tmp_path):
    """Reset board state and redirect save path for each test."""
    scouting_service._board = []
    scouting_service._SAVE_PATH = tmp_path / "scouting_board.json"
    yield


def test_add_candidate():
    c = scouting_service.add_candidate("p1", "breakout", 3, 5, "test note")
    assert c.player_id == "p1"
    assert c.signal == "breakout"
    assert len(scouting_service.get_scouting_board()) == 1


def test_add_duplicate_raises():
    scouting_service.add_candidate("p1", "breakout", 3, 5, "note")
    with pytest.raises(ValueError, match="already on"):
        scouting_service.add_candidate("p1", "value_trap", 0, 10, "other")


def test_update_candidate():
    scouting_service.add_candidate("p1", "breakout", 3, 5, "old note")
    updated = scouting_service.update_candidate("p1", narrative="new note", signal="bounce_back")
    assert updated.narrative == "new note"
    assert updated.signal == "bounce_back"
    assert updated.target_bid_low == 3  # unchanged


def test_update_missing_raises():
    with pytest.raises(ValueError, match="not on"):
        scouting_service.update_candidate("missing", narrative="x")


def test_remove_candidate():
    scouting_service.add_candidate("p1", "breakout", 3, 5, "note")
    assert scouting_service.remove_candidate("p1") is True
    assert len(scouting_service.get_scouting_board()) == 0


def test_remove_missing_returns_false():
    assert scouting_service.remove_candidate("missing") is False


def test_save_and_load():
    scouting_service.add_candidate("p1", "breakout", 3, 5, "note")
    scouting_service.add_candidate("p2", "value_trap", 0, 20, "avoid")
    scouting_service.save_board()

    scouting_service._board = []
    loaded = scouting_service.load_board()
    assert len(loaded) == 2
    assert loaded[0].player_id == "p1"
    assert loaded[1].signal == "value_trap"


def test_load_creates_default_when_no_file():
    board = scouting_service.load_board()
    assert len(board) == 26  # 10 breakout + 6 bounce-back + 5 value trap + 5 overpay risk


def test_default_board_has_all_signals():
    defaults = scouting_service.get_default_board()
    signals = {c.signal for c in defaults}
    assert signals == {"breakout", "bounce_back", "value_trap", "overpay_risk"}


def test_default_board_avoid_signals_have_zero_low():
    defaults = scouting_service.get_default_board()
    for c in defaults:
        if c.signal in ("value_trap", "overpay_risk"):
            assert c.target_bid_low == 0, f"{c.player_id} should have target_bid_low=0"
```

- [ ] **Step 2: Run tests**

```bash
cd backend && source venv/bin/activate && python -m pytest tests/test_scouting.py -v
```

Expected: all 9 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_scouting.py
git commit -m "test(scouting): add unit tests for scouting board service"
```

---

### Task 4: API Endpoints

**Files:**
- Modify: `backend/app/routers/draft.py`

- [ ] **Step 1: Add scouting board endpoints to draft router**

At the top of `draft.py`, add imports (after line 28):

```python
from ..services.scouting_service import (
    get_board_with_players as _get_board,
    add_candidate as _add_candidate,
    update_candidate as _update_candidate,
    remove_candidate as _remove_candidate,
)
from ..models.scouting import ScoutingCandidate, ScoutingCandidateUpdate, ScoutingBoardEntry
from ..services.projection_loader import get_player as _get_player
```

Before the WebSocket endpoint (before `@router.websocket`), add:

```python
# ── Scouting Board ───────────────────────────────────────────


@router.get("/scouting-board")
def get_scouting_board():
    return _get_board()


@router.post("/scouting-board", status_code=201)
def add_scouting_candidate(body: ScoutingCandidate):
    if _get_player(body.player_id) is None:
        raise HTTPException(404, f"Player {body.player_id} not found in projections")
    try:
        return _add_candidate(
            body.player_id, body.signal,
            body.target_bid_low, body.target_bid_high, body.narrative,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/scouting-board/{player_id}")
def update_scouting_candidate(player_id: str, body: ScoutingCandidateUpdate):
    try:
        return _update_candidate(player_id, **body.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.delete("/scouting-board/{player_id}")
def remove_scouting_candidate(player_id: str):
    if not _remove_candidate(player_id):
        raise HTTPException(404, f"Player {player_id} not on scouting board")
    return {"removed": True}
```

- [ ] **Step 2: Load scouting board on startup in main.py**

In `backend/app/main.py`, add import at the top:

```python
from .services.scouting_service import load_board as load_scouting_board
```

After the draft state loading block (after line 65, before `yield`), add:

```python
    # Auto-load scouting board
    try:
        load_scouting_board()
    except Exception as e:
        logger.warning(f"Failed to load scouting board: {e}")
```

- [ ] **Step 3: Run full backend tests**

```bash
cd backend && source venv/bin/activate && python -m pytest tests/ -v
```

Expected: all tests pass (existing 22 + 9 new scouting tests).

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/draft.py backend/app/main.py
git commit -m "feat(scouting): add scouting board API endpoints and startup loading"
```

---

### Task 5: Frontend API Client + Store

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/store/draftStore.ts`

- [ ] **Step 1: Add scoutingApi to client.ts**

After the `draftApi` object (around line 60), add:

```typescript
export const scoutingApi = {
  getBoard: () => api.get('/draft/scouting-board'),
  addCandidate: (data: {
    player_id: string; signal: string;
    target_bid_low: number; target_bid_high: number; narrative: string;
  }) => api.post('/draft/scouting-board', data),
  updateCandidate: (playerId: string, data: Record<string, unknown>) =>
    api.put(`/draft/scouting-board/${playerId}`, data),
  removeCandidate: (playerId: string) =>
    api.delete(`/draft/scouting-board/${playerId}`),
};
```

- [ ] **Step 2: Add scouting types and state to draftStore.ts**

Add these types near the other interfaces (after the Player interface around line 47):

```typescript
export type SignalType = 'breakout' | 'bounce_back' | 'value_trap' | 'overpay_risk';

export interface ScoutingEntry {
  player_id: string;
  signal: SignalType;
  target_bid_low: number;
  target_bid_high: number;
  narrative: string;
  player: Player;
}
```

Add to the store state (near the other state fields):

```typescript
scoutingBoard: [] as ScoutingEntry[],
scoutingLoading: false,
```

Add these actions to the store:

```typescript
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
  // Update locally for instant feedback
  set(s => ({
    scoutingBoard: s.scoutingBoard.map(e =>
      e.player_id === playerId ? { ...e, ...data } : e
    ),
  }));
},

removeScoutingCandidate: async (playerId: string) => {
  await scoutingApi.removeCandidate(playerId);
  set(s => ({
    scoutingBoard: s.scoutingBoard.filter(e => e.player_id !== playerId),
  }));
},
```

Add the `scoutingApi` import at the top of the file:

```typescript
import { scoutingApi } from '../api/client';
```

Update `markPlayerDrafted` to sync scouting board (inside the existing function, after updating the player):

```typescript
// Sync scouting board
scoutingBoard: state.scoutingBoard.map(e =>
  e.player_id === id
    ? { ...e, player: { ...e.player, is_drafted: true, draft_team_id: teamId, draft_price: price } }
    : e
),
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/store/draftStore.ts
git commit -m "feat(scouting): add scouting API client and Zustand store actions"
```

---

### Task 6: CSS Signal Classes

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add scouting signal badge classes**

After the existing breakout classes (after line 461), add:

```css
/* Scouting signal badges */
.signal-breakout { background: color-mix(in srgb, var(--color-steal) 12%, transparent); color: var(--color-steal); border: 1px solid color-mix(in srgb, var(--color-steal) 25%, transparent); }
.signal-bounce-back { background: color-mix(in srgb, #3b82f6 12%, transparent); color: #3b82f6; border: 1px solid color-mix(in srgb, #3b82f6 25%, transparent); }
.signal-value-trap { background: color-mix(in srgb, #f59e0b 12%, transparent); color: #f59e0b; border: 1px solid color-mix(in srgb, #f59e0b 25%, transparent); }
.signal-overpay-risk { background: color-mix(in srgb, var(--color-big-overpay) 12%, transparent); color: var(--color-big-overpay); border: 1px solid color-mix(in srgb, var(--color-big-overpay) 25%, transparent); }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(scouting): add CSS signal badge classes for scouting board"
```

---

### Task 7: ScoutingCard Component

**Files:**
- Create: `frontend/src/components/DraftRoom/ScoutingCard.tsx`

- [ ] **Step 1: Create the ScoutingCard component**

This component renders a single scouting card with:
- Header: signal badge, player name, team, position badges, target bid
- Stats: projected stat line, dollar value, inflated value, price range bar, breakout label
- Narrative: editable text block (click to edit, blur to save)
- Actions: Queue (star), Target (crosshair), Remove (X)

Key implementation details:
- Use existing `wr-card` class for card container
- Signal badge: `<span className="pos-badge signal-{signal}">{SIGNAL_LABEL}</span>`
- Position badges: same pattern as DraftBoard (`pos-badge pos-{pos.toLowerCase()}`)
- Price range bar: inline div with percentage width based on where inflated_value falls in pre_bid_range
- Editable narrative: `useState` for `editing` boolean, show `<textarea>` when editing, call `updateScoutingCandidate` on blur
- Target bid display: for buy signals show "$X-Y", for avoid signals show "Max $Y"
- Drafted state: apply `opacity-40` to entire card, strikethrough on name
- Star button checks if player_id is in watchlist store
- Target button calls `setSelectedPlayer` on the store
- Remove button calls `window.confirm()` then `removeScoutingCandidate`

The component receives a `ScoutingEntry` prop and all store actions via Zustand hooks.

Signal label map:
```typescript
const SIGNAL_LABELS: Record<SignalType, string> = {
  breakout: 'BREAKOUT',
  bounce_back: 'BOUNCE-BACK',
  value_trap: 'VALUE TRAP',
  overpay_risk: 'OVERPAY RISK',
};

const SIGNAL_CLASSES: Record<SignalType, string> = {
  breakout: 'signal-breakout',
  bounce_back: 'signal-bounce-back',
  value_trap: 'signal-value-trap',
  overpay_risk: 'signal-overpay-risk',
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DraftRoom/ScoutingCard.tsx
git commit -m "feat(scouting): add ScoutingCard component"
```

---

### Task 8: ScoutingBoard Component + Tab Integration

**Files:**
- Create: `frontend/src/components/DraftRoom/ScoutingBoard.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create ScoutingBoard component**

The board component provides:
- Header with title + player count + "+ Add Player" button
- Filter chips: All / Breakout / Bounce-Back / Value Trap / Overpay Risk
- Sort chips: Signal Type (default) / Projected $ / Target Bid
- Two-column grid of ScoutingCard components
- Section headers when sorted by signal type (in order: Breakout, Bounce-Back, Value Trap, Overpay Risk)
- Loading spinner while `scoutingLoading` is true
- Empty state message when no candidates

Add Player modal (inline in this component):
- Overlay with backdrop (close on click or Escape)
- Player search input: filter `players` from store where `!is_drafted` and not already on scouting board
- Show dropdown of matching players (name, team, positions)
- Signal type select
- Target bid low/high number inputs
- Narrative textarea
- "Add to Board" button calls `addScoutingCandidate`

Sorting logic:
```typescript
const SIGNAL_ORDER: SignalType[] = ['breakout', 'bounce_back', 'value_trap', 'overpay_risk'];

// For "Signal Type" sort: group by signal in SIGNAL_ORDER, within group sort by target_bid_high desc
// For "Projected $": flat sort by player.inflated_value desc
// For "Target Bid": flat sort by target_bid_high desc
```

Filter logic:
```typescript
const filtered = signalFilter
  ? scoutingBoard.filter(e => e.signal === signalFilter)
  : scoutingBoard;
```

- [ ] **Step 2: Integrate into App.tsx**

Update the `Tab` type union (line 33):
```typescript
type Tab = 'pre-draft' | 'draft' | 'scouting' | 'analysis';
```

Update the `tabs` array (lines 249-253) to add scouting between draft and analysis:
```typescript
{ id: 'scouting', label: 'Scouting', shortcut: '⌘3' },
```
Shift analysis shortcut to `⌘4`.

Update keyboard shortcuts (lines 214-225):
- `Mod+3` → `setTab('scouting')`
- `Mod+4` → `setTab('analysis')`

Add `fetchScoutingBoard` to the mount useEffect (lines 79-106):
```typescript
store.fetchScoutingBoard();
```

Add scouting tab content rendering (between draft and analysis tabs, around line 405):
```tsx
{tab === 'scouting' && <ScoutingBoard />}
```

Import ScoutingBoard at the top:
```typescript
import ScoutingBoard from './components/DraftRoom/ScoutingBoard';
```

- [ ] **Step 3: Verify the app builds**

```bash
cd frontend && npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/DraftRoom/ScoutingBoard.tsx frontend/src/App.tsx
git commit -m "feat(scouting): add ScoutingBoard component and Scouting tab"
```

---

### Task 9: Manual Smoke Test

- [ ] **Step 1: Start backend and frontend**

```bash
cd backend && source venv/bin/activate && uvicorn app.main:app --reload &
cd frontend && npm run dev &
```

- [ ] **Step 2: Verify scouting board loads**

Open `http://localhost:5173`, click "Scouting" tab. Verify:
- 26 cards render in 4 groups (Breakout, Bounce-Back, Value Trap, Overpay Risk)
- Each card shows player stats, bid target, narrative, breakout label
- Filter chips work (clicking "Breakout" shows only breakout cards)
- Sort chips work (switching to "Projected $" flattens the grouping)

- [ ] **Step 3: Verify CRUD operations**

- Click "+ Add Player", search for a player, fill in signal/bid/narrative, click Add → card appears
- Click on a narrative text, edit it, click away → saves (refresh page to confirm)
- Click "Remove" on a card, confirm → card disappears
- Click "Target" on a card → bid input on Draft Room tab pre-fills
- Click star on a card → player appears in Queue

- [ ] **Step 4: Verify draft sync**

- Go to Draft Room tab, record a pick for a player who is on the scouting board
- Switch to Scouting tab → that player's card should be dimmed with strikethrough

- [ ] **Step 5: Run all backend tests one final time**

```bash
cd backend && source venv/bin/activate && python -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix(scouting): smoke test fixes"
```
