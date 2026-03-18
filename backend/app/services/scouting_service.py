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
        ScoutingCandidate(player_id="h_32127", signal="breakout", target_bid_low=3, target_bid_high=5,
            narrative="Spring training: .538 AVG, 95.4 mph avg exit velo, 64% hard-hit rate, 7% K rate. Missed most of 2025 with injuries (fractured foot, hamate, core surgery). The Statcast profile is elite -- hard contact + low whiff. If he gets 550 PA he's a $15-20 player. Risk: injury history is real."),
        ScoutingCandidate(player_id="h_23772", signal="breakout", target_bid_low=10, target_bid_high=12,
            narrative="Reworked swing -- shorter, quicker -- showed in WBC where he crushed a huge homer. Went from 15 HR (2024) to 22 HR (2025) in fewer games. Red Sox committed to playing him against both sides (no more platoon). If he hits .260+ instead of .245 with same power, that's a $22-25 player."),
        ScoutingCandidate(player_id="h_21837", signal="breakout", target_bid_low=8, target_bid_high=12,
            narrative="Hit .316/.833 OPS in 106 games in 2025. Statcast: 91st percentile exit velo, .362 xwOBA, .518 xSLG. Yandy Diaz moving to full-time DH opens the 1B job entirely. The underlying metrics say .316 wasn't a fluke -- barrel rate and hard-hit rate support real 20+ HR power with high AVG."),
        ScoutingCandidate(player_id="h_35110", signal="breakout", target_bid_low=22, target_bid_high=25,
            narrative="38 HR projection, top prospect with elite raw power. A's building the lineup around him, Soderstrom, and Butler. K rate concern (31%) but has handled every challenge thrown at him as a professional. If contact improves even marginally, 40+ HR is in play."),
        ScoutingCandidate(player_id="h_27467", signal="breakout", target_bid_low=12, target_bid_high=15,
            narrative="25 HR breakout in 2025, signed 7-year $86M extension. Only 23, the power could keep climbing. The extension signals the A's see a cornerstone. If he goes from 25 HR to 30+ with improved OBP, he's a $25+ player."),
        ScoutingCandidate(player_id="h_22542", signal="breakout", target_bid_low=12, target_bid_high=15,
            narrative="21 HR / 18 SB combo, age 25. A's building around him. Speed + power trending up at this age usually continues. Locked-in everyday role in a lineup that's getting better."),
        ScoutingCandidate(player_id="h_33321", signal="breakout", target_bid_low=5, target_bid_high=8,
            narrative="11 HR / 24 SB / .347 OBP. Rare speed + patience combo. Locked into MIN's 2B job. Projections are conservative on a guy who hasn't had full MLB reps yet. Speed is real and the plate discipline is elite for a young player."),
        ScoutingCandidate(player_id="h_29646", signal="breakout", target_bid_low=3, target_bid_high=5,
            narrative="10 HR / 21 SB / .325 OBP in the Boston lineup. Sneaky speed, could get 600 PA. Playing in a great lineup means more RBI/R opportunities than the raw stats suggest."),
        ScoutingCandidate(player_id="h_31912", signal="breakout", target_bid_low=1, target_bid_high=2,
            narrative="42 projected SB. Elite speed, nothing else -- .324 OBP, near-zero power. If you need SB in your league, this is the cheapest source available. Pure one-category filler for $1."),
        ScoutingCandidate(player_id="h_sa3063134", signal="breakout", target_bid_low=8, target_bid_high=10,
            narrative="248 NPB career HR with Yomiuri Giants, 6x NPB All-Star. Led NPB in HR 3 times. Spring training: .400 AVG, 1.289 OPS, 431-ft homer off Clay Holmes. 'One of the smoothest right-handed swings you'll ever see.' Risk: straight from NPB with no MiLB seasoning. If he adjusts well, 30 HR is easily in play."),
        # === BOUNCE-BACK ===
        ScoutingCandidate(player_id="h_29591", signal="bounce_back", target_bid_low=5, target_bid_high=8,
            narrative="Hit .196 in 2025 but still had 16 HR, 14 SB in only 92 games. His 2024 rookie year: 120 OPS+, 3.1 bWAR -- that's who he actually is. Job security locked (no CF competition). A .196 AVG with that power/speed profile screams BABIP bad luck + injury. Risk: K rate (35.6%) is a real problem."),
        ScoutingCandidate(player_id="h_31781", signal="bounce_back", target_bid_low=8, target_bid_high=12,
            narrative="Improved significantly in 2025: .242/.314/.375, 17 HR, 17 SB in 649 PA. Broken hamate surgery (Feb 12) -- expected back early April. Still only 22, #1 overall pick pedigree. Post-hamate players often unlock more power (Kris Bryant, Buster Posey). 20/20 is the real ceiling."),
        ScoutingCandidate(player_id="h_20220", signal="bounce_back", target_bid_low=8, target_bid_high=12,
            narrative="30 HR projection with legit raw power tools. Batting 5th for LAA, guaranteed everyday ABs. Only 27. If the contact issues (.296 OBP projected) improve even marginally, the 30 HR power makes him elite. Classic 'one adjustment away' player. Risk: has teased breakout for years."),
        ScoutingCandidate(player_id="h_20437", signal="bounce_back", target_bid_low=3, target_bid_high=5,
            narrative="18 HR / 10 SB when healthy. Has never stayed healthy for a full season -- could go for $3-5 as an injury discount. Enormous upside if he finally gets 500 PA. A $20 player priced at $3-5."),
        ScoutingCandidate(player_id="h_12564", signal="bounce_back", target_bid_low=5, target_bid_high=8,
            narrative="20 HR / 23 SB projection, middle of BOS lineup. When healthy, the speed + power combo in that lineup is extremely valuable. Health is the only question -- if he plays 130+ games, easily a $20+ player."),
        ScoutingCandidate(player_id="h_33333", signal="bounce_back", target_bid_low=22, target_bid_high=25,
            narrative="24 HR / 23 SB -- rare 5-category contributor. Only 24, hitting 2nd in a revamped Texas lineup. Speed + power combo at this age usually trends up, not down. 30/30 is in play. Texas invested in the lineup around him."),
        # === VALUE TRAP ===
        ScoutingCandidate(player_id="h_18839", signal="value_trap", target_bid_low=0, target_bid_high=20,
            narrative="Had 30 SB in 2025 after NEVER topping 10 before in his career. 2nd percentile sprint speed -- the SB output was an insane outlier. BABIP spiked to .315 (career avg ~.285), barrel/hard-hit rates below average. Regression is virtually guaranteed. Even the 17 SB projection might be generous."),
        ScoutingCandidate(player_id="h_19251", signal="value_trap", target_bid_low=0, target_bid_high=25,
            narrative="Two lowest HR rates of his career in the last two seasons. Turning 32, the power decline is trend-based, not noise. Moving to BAL helps lineup context but the bat is slowing. Someone will pay $30+ for the name -- let them."),
        ScoutingCandidate(player_id="h_16578", signal="value_trap", target_bid_low=0, target_bid_high=15,
            narrative="One-dimensional OBP player (.358). Only 19 HR and 2 SB. Moving to full-time DH means less positional flexibility. His value is heavily OBP-dependent -- if that drops to .340 he's a $10 player. Zero speed and modest power make him less valuable than the raw OBP suggests in 5x5."),
        ScoutingCandidate(player_id="h_4949", signal="value_trap", target_bid_low=0, target_bid_high=3,
            narrative="Only 397 PA projected, and even that might be generous. 23 HR is nice but .224 AVG / .301 OBP kills your ratios. DH-only, injury-prone, ratio killer. Someone will bid $8 on the name -- let them."),
        ScoutingCandidate(player_id="h_24610", signal="value_trap", target_bid_low=0, target_bid_high=15,
            narrative="Only 9 HR projected. Value is OBP (.340) and SB (18). Low ceiling -- he is what he is: a high-floor, low-upside contact hitter. FanGraphs had him at $21.8. Someone will pay $20 for a guy whose ceiling is $18. Let them overpay for the batting average."),
        # === OVERPAY RISK ===
        ScoutingCandidate(player_id="h_5417", signal="overpay_risk", target_bid_low=0, target_bid_high=18,
            narrative="Age 36 (turning 36 in May). Speed fading: only 10 SB in 2025. Power metrics in decline, propped up by Minute Maid Park. In a keeper league, someone overpays for the name. Real value is probably $12-15 for an aging 2B with diminishing speed/power."),
        ScoutingCandidate(player_id="h_12856", signal="overpay_risk", target_bid_low=0, target_bid_high=20,
            narrative="Age 37 entering 2026. Has been remarkably durable recently but age catches everyone. Toronto's lineup is weaker around him. If he loses 50 PA to rest days/nagging injuries, the counting stats crater. Real value $16-18."),
        ScoutingCandidate(player_id="h_10155", signal="overpay_risk", target_bid_low=0, target_bid_high=10,
            narrative="The name will get bid up to $15+ by someone nostalgic. Only 502 PA projected and hasn't been healthy in years. You're paying for 2019 Trout -- you're getting 2024-25 Trout: 300 PA and an IL stint."),
        ScoutingCandidate(player_id="h_12927", signal="overpay_risk", target_bid_low=0, target_bid_high=15,
            narrative="Solid but unspectacular. 21 HR / 9 SB / .329 OBP. No upside beyond projection -- he is what he is. Someone will overpay for the consistency. Not worth more than $15 in AL-only."),
        ScoutingCandidate(player_id="h_16997", signal="overpay_risk", target_bid_low=0, target_bid_high=12,
            narrative=".343 OBP looks good but 17 HR / 5 SB is underwhelming. New ballpark (DET) may suppress power. Name recognition from NYY years will inflate his price beyond real value."),
    ]
