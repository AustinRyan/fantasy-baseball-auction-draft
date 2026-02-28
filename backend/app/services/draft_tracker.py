"""Draft state management service."""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Optional

from ..config import league_config
from ..models.draft import DraftPick, DraftState
from ..models.player import Player
from ..services.keeper_manager import get_league
from ..services.projection_loader import get_players, get_player
from ..services.valuation_engine import calculate_dollar_values
from ..services.alert_engine import classify_pick

# ---------------------------------------------------------------------------
# Singleton DraftState
# ---------------------------------------------------------------------------
_draft_state = DraftState()

SAVE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "draft_state"


def get_draft_state() -> DraftState:
    """Return the current draft state."""
    return _draft_state


def start_draft() -> DraftState:
    """Start the draft: set is_active=True, initialize from keepers."""
    global _draft_state
    _draft_state = DraftState(is_active=True, picks=[], current_inflation_rate=1.0)

    # Initialize team budget_spent from keeper salaries (keepers are already
    # accounted for separately via team.keeper_salary so budget_spent starts at 0)
    league = get_league()
    for team in league.teams:
        team.budget_spent = 0
        team.draft_picks = []

    # Run initial inflation calculation
    _recalculate_values()
    return _draft_state


def reset_draft() -> DraftState:
    """Reset the draft state completely."""
    global _draft_state

    # Un-draft all drafted players
    players = get_players()
    for player in players.values():
        if player.is_drafted:
            player.is_drafted = False
            player.draft_team_id = None
            player.draft_price = None

    # Reset team draft state
    league = get_league()
    for team in league.teams:
        team.budget_spent = 0
        team.draft_picks = []

    _draft_state = DraftState()

    # Recalculate values at base inflation
    _recalculate_values()
    return _draft_state


def record_pick(player_id: str, team_id: str, price: int) -> DraftPick:
    """Record a draft pick.

    - Validate player exists and isn't already drafted
    - Validate team exists
    - Create DraftPick with unique ID
    - Mark player as drafted
    - Add to draft state picks list
    - Update team budget_spent
    - Recalculate inflation and re-value remaining players
    - Classify the pick
    - Return the DraftPick
    """
    player = get_player(player_id)
    if player is None:
        raise ValueError(f"Player '{player_id}' not found")
    if player.is_drafted:
        raise ValueError(f"Player '{player.name}' is already drafted")
    if player.is_keeper:
        raise ValueError(f"Player '{player.name}' is a keeper and cannot be drafted")

    league = get_league()
    team = league.get_team(team_id)
    if team is None:
        raise ValueError(f"Team '{team_id}' not found")

    # Create the pick
    pick = DraftPick(
        id=str(uuid.uuid4())[:8],
        player_id=player_id,
        player_name=player.name,
        team_id=team_id,
        price=price,
        positions=player.positions,
        dollar_value=player.dollar_value,
        inflated_value=player.inflated_value,
        value_diff=round(player.inflated_value - price, 1),
    )

    # Mark player as drafted
    player.is_drafted = True
    player.draft_team_id = team_id
    player.draft_price = price

    # Update team
    team.budget_spent += price
    team.draft_picks.append(player_id)

    # Add to draft state
    _draft_state.picks.append(pick)

    # Recalculate inflation and values
    _recalculate_values()

    # Classify the pick (after recalculation so we use updated values)
    pick.classification = classify_pick(player, price)

    return pick


def undo_pick(pick_id: str) -> DraftPick:
    """Undo a specific pick by ID.

    - Remove from picks list
    - Un-mark player
    - Subtract from team budget_spent
    - Recalculate inflation
    - Return the undone pick
    """
    pick: Optional[DraftPick] = None
    pick_index: Optional[int] = None

    for i, p in enumerate(_draft_state.picks):
        if p.id == pick_id:
            pick = p
            pick_index = i
            break

    if pick is None:
        raise ValueError(f"Pick '{pick_id}' not found")

    # Remove from picks list
    _draft_state.picks.pop(pick_index)

    # Un-mark player
    player = get_player(pick.player_id)
    if player is not None:
        player.is_drafted = False
        player.draft_team_id = None
        player.draft_price = None

    # Update team
    league = get_league()
    team = league.get_team(pick.team_id)
    if team is not None:
        team.budget_spent -= pick.price
        if pick.player_id in team.draft_picks:
            team.draft_picks.remove(pick.player_id)

    # Recalculate inflation
    _recalculate_values()

    return pick


def _recalculate_values() -> None:
    """Recalculate inflation rate and all player values based on current draft state."""
    players = get_players()
    if not players:
        return

    league = get_league()
    total_budget = league_config.total_budget

    # Total salary spent: keepers + draft picks
    total_salary_spent = league.total_keeper_salary + sum(
        p.price for p in _draft_state.picks
    )

    # Total value consumed: keeper dollar_values + drafted player dollar_values
    keeper_value = sum(
        p.dollar_value for p in players.values() if p.is_keeper
    )
    drafted_value = sum(
        p.dollar_value for p in players.values()
        if p.is_drafted and not p.is_keeper
    )
    total_value_consumed = keeper_value + drafted_value

    remaining_budget = total_budget - total_salary_spent
    remaining_value = total_budget - total_value_consumed

    # Guard against division by zero
    if remaining_value <= 0:
        inflation_rate = 1.0
    else:
        inflation_rate = remaining_budget / remaining_value

    _draft_state.current_inflation_rate = round(inflation_rate, 4)

    # Re-run dollar value calculation with new inflation
    calculate_dollar_values(players, league_config, inflation_rate)


def save_draft_state() -> str:
    """Save draft state to JSON file at backend/data/draft_state/current.json."""
    SAVE_DIR.mkdir(parents=True, exist_ok=True)
    filepath = SAVE_DIR / "current.json"

    state_data = _draft_state.model_dump(mode="json")
    with open(filepath, "w") as f:
        json.dump(state_data, f, indent=2, default=str)

    return str(filepath)


def load_draft_state() -> DraftState:
    """Load draft state from JSON backup file."""
    global _draft_state

    filepath = SAVE_DIR / "current.json"
    if not filepath.exists():
        raise FileNotFoundError(f"No saved draft state found at {filepath}")

    with open(filepath, "r") as f:
        state_data = json.load(f)

    _draft_state = DraftState(**state_data)

    # Re-mark players as drafted based on loaded picks
    players = get_players()
    league = get_league()

    # Reset all draft marks first
    for player in players.values():
        if player.is_drafted and not player.is_keeper:
            player.is_drafted = False
            player.draft_team_id = None
            player.draft_price = None

    for team in league.teams:
        team.budget_spent = 0
        team.draft_picks = []

    # Re-apply picks
    for pick in _draft_state.picks:
        player = get_player(pick.player_id)
        if player is not None:
            player.is_drafted = True
            player.draft_team_id = pick.team_id
            player.draft_price = pick.price

        team = league.get_team(pick.team_id)
        if team is not None:
            team.budget_spent += pick.price
            team.draft_picks.append(pick.player_id)

    _recalculate_values()
    return _draft_state
