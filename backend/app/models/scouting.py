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
