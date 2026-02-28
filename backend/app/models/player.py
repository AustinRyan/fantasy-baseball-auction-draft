"""Player, Projection, and AuctionValue models."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class HittingProjection(BaseModel):
    PA: int = 0
    AB: int = 0
    H: int = 0
    doubles: int = Field(0, alias="2B")
    triples: int = Field(0, alias="3B")
    HR: int = 0
    R: int = 0
    RBI: int = 0
    SB: int = 0
    CS: int = 0
    BB: int = 0
    SO: int = 0
    BA: float = 0.0

    model_config = {"populate_by_name": True}


class PitchingProjection(BaseModel):
    IP: float = 0.0
    W: int = 0
    L: int = 0
    SV: int = 0
    HLD: int = 0
    K: int = 0
    BB: int = 0
    H: int = 0
    ER: int = 0
    HR: int = 0
    ERA: float = 0.0
    WHIP: float = 0.0

    model_config = {"populate_by_name": True}


class BreakoutProfile(BaseModel):
    score: float = 0.0  # -1 to 1 scale
    label: str = "Stable"  # High Upside / Moderate Upside / Stable / Decline Risk
    factors: list = []  # Contributing factors


class PreBidRange(BaseModel):
    steal_below: float = 0.0
    value_below: float = 0.0
    fair_low: float = 0.0
    fair_high: float = 0.0
    overpay_above: float = 0.0
    big_overpay_above: float = 0.0


class Player(BaseModel):
    id: str  # FanGraphs ID or generated
    name: str
    team: str
    positions: list = []
    is_hitter: bool = True

    hitting: Optional[HittingProjection] = None
    pitching: Optional[PitchingProjection] = None

    # Calculated fields
    sgp: float = 0.0
    sgp_per_category: dict = {}
    dollar_value: float = 0.0
    inflated_value: float = 0.0
    pre_bid_range: Optional[PreBidRange] = None
    breakout: Optional[BreakoutProfile] = None

    # Draft state
    is_keeper: bool = False
    keeper_team_id: Optional[str] = None
    keeper_salary: Optional[int] = None
    is_drafted: bool = False
    draft_team_id: Optional[str] = None
    draft_price: Optional[int] = None

    model_config = {"populate_by_name": True}
