"""League, Team, and Keeper models."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class Keeper(BaseModel):
    player_id: str
    player_name: str
    salary: int
    positions: list = []


class Team(BaseModel):
    id: str
    name: str
    is_user: bool = False
    keepers: list = []  # list[Keeper]
    draft_picks: list = []  # player_ids of drafted players
    budget_spent: int = 0

    @property
    def keeper_salary(self) -> int:
        return sum(k.salary if isinstance(k, Keeper) else k["salary"] for k in self.keepers)

    @property
    def total_spent(self) -> int:
        return self.keeper_salary + self.budget_spent

    @property
    def remaining_budget(self) -> int:
        from ..config import league_config
        return league_config.budget_per_team - self.total_spent


class League(BaseModel):
    teams: list = []  # list[Team]

    def get_team(self, team_id: str) -> Optional[Team]:
        return next((t for t in self.teams if t.id == team_id), None)

    @property
    def all_keepers(self) -> list:
        return [k for t in self.teams for k in t.keepers]

    @property
    def total_keeper_salary(self) -> int:
        return sum(
            k.salary if isinstance(k, Keeper) else k["salary"]
            for k in self.all_keepers
        )

    @property
    def total_keeper_count(self) -> int:
        return len(self.all_keepers)
