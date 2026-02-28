"""Draft state models."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DraftPick(BaseModel):
    id: str = ""
    player_id: str
    player_name: str
    team_id: str
    price: int
    positions: list = []
    dollar_value: float = 0.0
    inflated_value: float = 0.0
    value_diff: float = 0.0  # inflated_value - price (positive = steal)
    classification: str = ""  # Steal / Value / Fair / Overpay / Big Overpay
    timestamp: datetime = Field(default_factory=datetime.now)


class DraftState(BaseModel):
    picks: list[DraftPick] = []
    is_active: bool = False
    current_inflation_rate: float = 1.0

    @property
    def pick_count(self) -> int:
        return len(self.picks)

    def get_team_picks(self, team_id: str) -> list:
        return [p for p in self.picks if p.team_id == team_id]

    def get_team_spent(self, team_id: str) -> int:
        return sum(p.price for p in self.get_team_picks(team_id))


class RosterNeed(BaseModel):
    slot: str
    filled: bool = False
    player_name: Optional[str] = None
    top_available: list = []  # [{player_id, name, value, urgency}]


class DraftRecommendation(BaseModel):
    player_id: str
    player_name: str
    position: str
    slot: str
    inflated_value: float
    fair_price: float
    steal_under: float
    urgency_score: float
    value_over_next: float
    budget_feasible: bool = True
    reason: str = ""
