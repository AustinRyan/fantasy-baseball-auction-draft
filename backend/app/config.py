"""League configuration for Potomac Valley Rotisserie League."""

from __future__ import annotations

from pydantic import BaseModel, Field


class RosterSlots(BaseModel):
    C: int = 2
    first_base: int = Field(1, alias="1B")
    second_base: int = Field(1, alias="2B")
    third_base: int = Field(1, alias="3B")
    SS: int = 1
    MI: int = 1  # 2B/SS
    CI: int = 1  # 1B/3B
    OF: int = 5
    U: int = 1   # 1 at draft; extra U or P slot added in September
    P: int = 10  # 10 at draft; extra U or P slot added in September

    model_config = {"populate_by_name": True}

    @property
    def total_hitters(self) -> int:
        return self.C + self.first_base + self.second_base + self.third_base + self.SS + self.MI + self.CI + self.OF + self.U

    @property
    def total_pitchers(self) -> int:
        return self.P

    @property
    def total_roster(self) -> int:
        return self.total_hitters + self.total_pitchers


class SGPDenominators(BaseModel):
    """SGP denominators calibrated for 11-team AL-only league."""
    # Hitting counting stats
    R: float = 22.0
    HR: float = 8.0
    RBI: float = 22.0
    SB: float = 8.0
    # Hitting ratio
    BA: float = 0.0035

    # Pitching counting stats
    W: float = 3.0
    SV: float = 7.0
    K: float = 30.0
    # Pitching ratios
    ERA: float = 0.18
    WHIP: float = 0.017


class LeagueConfig(BaseModel):
    num_teams: int = 11
    budget_per_team: int = 270
    league_name: str = "Potomac Valley Rotisserie League"
    league_type: str = "AL-only"

    roster: RosterSlots = RosterSlots()
    sgp_denominators: SGPDenominators = SGPDenominators()

    hitting_categories: list = ["R", "HR", "RBI", "SB", "BA"]
    pitching_categories: list = ["W", "SV", "K", "ERA", "WHIP"]

    hitter_pitcher_split: float = 0.65  # 65% of dollars to hitters
    min_ip: int = 900  # Minimum IP for ratio categories
    min_keeper_count: int = 4
    max_keeper_count: int = 10

    # Pre-bid range thresholds (multipliers on inflated value)
    steal_threshold: float = 0.70
    value_threshold: float = 0.90
    fair_low: float = 0.90
    fair_high: float = 1.10
    overpay_threshold: float = 1.20
    big_overpay_threshold: float = 1.40

    @property
    def total_budget(self) -> int:
        return self.num_teams * self.budget_per_team

    @property
    def total_hitters_drafted(self) -> int:
        return self.num_teams * self.roster.total_hitters

    @property
    def total_pitchers_drafted(self) -> int:
        return self.num_teams * self.roster.total_pitchers

    @property
    def total_players_drafted(self) -> int:
        return self.total_hitters_drafted + self.total_pitchers_drafted


# Default league config singleton
league_config = LeagueConfig()
