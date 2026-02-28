"""Keeper management service with fuzzy matching and inflation calculation."""

from __future__ import annotations

import csv
import io
from typing import Optional

from thefuzz import fuzz, process

from ..config import league_config
from ..models.league import League, Team, Keeper
from ..services.projection_loader import get_players

# ---------------------------------------------------------------------------
# Singleton league instance
# ---------------------------------------------------------------------------
_league: Optional[League] = None

DEFAULT_TEAM_NAMES = [
    "Team 1",
    "Team 2",
    "Team 3",
    "Team 4",
    "Team 5",
    "Team 6",
    "Team 7",
    "Team 8",
    "Team 9",
    "Team 10",
    "Team 11",
]


def get_league() -> League:
    """Return the current league, initializing if necessary."""
    global _league
    if _league is None:
        initialize_league()
    return _league


def initialize_league(team_names: Optional[list[str]] = None) -> League:
    """Create the league with *num_teams* default teams."""
    global _league
    names = team_names or DEFAULT_TEAM_NAMES
    teams = [
        Team(id=f"team_{i + 1}", name=name)
        for i, name in enumerate(names)
    ]
    _league = League(teams=teams)
    return _league


def reset_league() -> None:
    """Tear down the singleton (useful in tests)."""
    global _league
    _league = None


# ---------------------------------------------------------------------------
# Team helpers
# ---------------------------------------------------------------------------

def get_team(team_id: str) -> Optional[Team]:
    league = get_league()
    return league.get_team(team_id)


def update_team(team_id: str, *, name: Optional[str] = None, is_user: Optional[bool] = None) -> Team:
    team = get_team(team_id)
    if team is None:
        raise ValueError(f"Team '{team_id}' not found")
    if name is not None:
        team.name = name
    if is_user is not None:
        team.is_user = is_user
    return team


# ---------------------------------------------------------------------------
# Keeper CRUD
# ---------------------------------------------------------------------------

def add_keeper(
    team_id: str,
    player_name: str,
    salary: int,
    positions: Optional[list[str]] = None,
    player_id: Optional[str] = None,
) -> Keeper:
    """Add a keeper to a team. ``player_id`` is resolved later during linking."""
    team = get_team(team_id)
    if team is None:
        raise ValueError(f"Team '{team_id}' not found")
    keeper = Keeper(
        player_id=player_id or "",
        player_name=player_name,
        salary=salary,
        positions=positions or [],
    )
    team.keepers.append(keeper)
    return keeper


def set_keepers(team_id: str, keepers_data: list[dict]) -> list[Keeper]:
    """Replace a team's keeper list with the supplied data.

    Each entry: ``{"player_name": str, "salary": int, "positions": list[str]}``
    """
    team = get_team(team_id)
    if team is None:
        raise ValueError(f"Team '{team_id}' not found")
    team.keepers = []
    result: list[Keeper] = []
    for kd in keepers_data:
        k = add_keeper(
            team_id,
            player_name=kd["player_name"],
            salary=kd["salary"],
            positions=kd.get("positions", []),
        )
        result.append(k)
    return result


def remove_keeper(team_id: str, player_name: str) -> bool:
    """Remove a keeper by name. Returns True if found and removed."""
    team = get_team(team_id)
    if team is None:
        raise ValueError(f"Team '{team_id}' not found")
    before = len(team.keepers)
    team.keepers = [
        k for k in team.keepers
        if (k.player_name if isinstance(k, Keeper) else k["player_name"]).lower() != player_name.lower()
    ]
    return len(team.keepers) < before


# ---------------------------------------------------------------------------
# Fuzzy name matching & linking
# ---------------------------------------------------------------------------

def _fuzzy_match(name: str, choices: dict[str, str], threshold: int = 80) -> Optional[str]:
    """Return the best matching player_id for *name*, or None.

    ``choices`` maps player_id -> player_name.
    """
    if not choices:
        return None
    result = process.extractOne(name, choices, scorer=fuzz.token_sort_ratio, score_cutoff=threshold)
    if result is None:
        return None
    # result is (matched_name, score, key)
    _matched_name, _score, player_id = result
    return player_id


def link_keepers_to_players() -> dict:
    """Fuzzy-match all keepers to the loaded player pool.

    Side-effects on matched Player objects:
      - ``is_keeper = True``
      - ``keeper_team_id`` = owning team id
      - ``keeper_salary`` = keeper salary
    """
    players = get_players()
    if not players:
        return {"linked": 0, "unlinked": 0, "details": []}

    # Build lookup: player_id -> name
    choices = {pid: p.name for pid, p in players.items()}

    league = get_league()
    linked = 0
    unlinked = 0
    details: list[dict] = []

    for team in league.teams:
        for keeper in team.keepers:
            keeper_name = keeper.player_name if isinstance(keeper, Keeper) else keeper["player_name"]
            matched_id = _fuzzy_match(keeper_name, choices)
            if matched_id:
                keeper.player_id = matched_id
                player = players[matched_id]
                player.is_keeper = True
                player.keeper_team_id = team.id
                player.keeper_salary = keeper.salary if isinstance(keeper, Keeper) else keeper["salary"]
                linked += 1
                details.append({"keeper_name": keeper_name, "matched_player": player.name, "player_id": matched_id, "status": "linked"})
            else:
                unlinked += 1
                details.append({"keeper_name": keeper_name, "matched_player": None, "player_id": None, "status": "unlinked"})

    return {"linked": linked, "unlinked": unlinked, "details": details}


# ---------------------------------------------------------------------------
# Inflation
# ---------------------------------------------------------------------------

def calculate_inflation() -> dict:
    """Compute keeper-adjusted inflation rate.

    ``inflation_rate = remaining_budget / remaining_value``

    Where:
      remaining_budget = total_budget - sum(keeper_salaries)
      remaining_value  = total_budget - sum(keeper_projected_values)
      keeper_projected_values = sum of dollar_value for all keeper players
    """
    players = get_players()
    league = get_league()

    total_budget = league_config.total_budget  # num_teams * budget_per_team

    # Sum of all keeper salaries
    total_keeper_salary = league.total_keeper_salary

    # Sum of dollar_value for players that are keepers
    keeper_projected_value = sum(
        p.dollar_value
        for p in players.values()
        if p.is_keeper
    )

    remaining_budget = total_budget - total_keeper_salary
    remaining_value = total_budget - keeper_projected_value

    if remaining_value <= 0:
        inflation_rate = 1.0
    else:
        inflation_rate = remaining_budget / remaining_value

    return {
        "inflation_rate": round(inflation_rate, 4),
        "total_budget": total_budget,
        "total_keeper_salary": total_keeper_salary,
        "keeper_projected_value": round(keeper_projected_value, 1),
        "remaining_budget": remaining_budget,
        "remaining_value": round(remaining_value, 1),
        "keeper_count": league.total_keeper_count,
    }


# ---------------------------------------------------------------------------
# Bulk CSV import
# ---------------------------------------------------------------------------

def import_keepers_csv(csv_content: bytes) -> dict:
    """Import keepers from a CSV with columns: team_name, player_name, salary.

    Teams are matched by name (case-insensitive). Creates teams if not found.
    """
    league = get_league()
    reader = csv.DictReader(io.StringIO(csv_content.decode("utf-8")))

    imported = 0
    errors: list[str] = []

    # Build team lookup by lower-cased name
    team_lookup = {t.name.lower(): t for t in league.teams}

    for row in reader:
        team_name = row.get("team_name", "").strip()
        player_name = row.get("player_name", "").strip()
        salary_raw = row.get("salary", "").strip()

        if not team_name or not player_name or not salary_raw:
            errors.append(f"Skipping incomplete row: {row}")
            continue

        try:
            salary = int(salary_raw)
        except ValueError:
            errors.append(f"Invalid salary '{salary_raw}' for {player_name}")
            continue

        team = team_lookup.get(team_name.lower())
        if team is None:
            errors.append(f"Team '{team_name}' not found, skipping {player_name}")
            continue

        add_keeper(team.id, player_name, salary)
        imported += 1

    return {"imported": imported, "errors": errors}
