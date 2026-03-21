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

    # Auto-save after every pick
    save_draft_state()

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

    # Auto-save after undo
    save_draft_state()

    return pick


def _recalculate_values() -> None:
    """Recalculate inflation rate and apply to frozen base dollar values.

    IMPORTANT: Base dollar_values (set during pre-draft valuation) are frozen.
    During the draft we only recalculate the inflation multiplier and apply it.
    We do NOT recompute replacement level or dollars-per-SGP, because removing
    drafted players from the pool would shift every remaining player's base
    value and cause cascading price distortions.

    $1 minimum players are excluded from the inflation pool since their value
    is capped at $1 regardless.  Instead we reserve $1 per filler roster spot
    from the remaining budget before computing inflation for meaningful players.
    """
    players = get_players()
    if not players:
        return

    league = get_league()
    total_budget = league_config.total_budget

    # Total salary spent: keepers + draft picks
    total_salary_spent = league.total_keeper_salary + sum(
        p.price for p in _draft_state.picks
    )

    remaining_budget = total_budget - total_salary_spent

    # How many roster spots still need filling?
    total_roster = league_config.total_players_drafted
    remaining_spots = max(0, total_roster - league.total_keeper_count - len(_draft_state.picks))

    # Sort available players by dollar_value descending.  Only the top
    # `remaining_spots` players realistically compete for auction dollars;
    # everyone else is a $1 end-game fill.  Counting excess depth would
    # dilute the inflation denominator and cause phantom deflation.
    available = sorted(
        [p for p in players.values() if not p.is_drafted and not p.is_keeper],
        key=lambda p: p.dollar_value,
        reverse=True,
    )
    draftable_pool = available[:remaining_spots]
    pool_value = sum(p.dollar_value for p in draftable_pool)

    # Guard against division by zero
    if pool_value <= 0:
        inflation_rate = 1.0
    else:
        inflation_rate = remaining_budget / pool_value

    _draft_state.current_inflation_rate = round(inflation_rate, 4)

    # Apply inflation to frozen base values (do NOT recalculate base dollar_values)
    from ..models.player import PreBidRange
    config = league_config
    for player in players.values():
        if player.dollar_value <= 1.0 and not player.is_keeper:
            player.inflated_value = 1.0
            continue

        player.inflated_value = round(player.dollar_value * inflation_rate, 1)

        # Recalculate pre-bid ranges from new inflated value
        iv = player.inflated_value
        player.pre_bid_range = PreBidRange(
            steal_below=round(iv * config.steal_threshold, 1),
            value_below=round(iv * config.value_threshold, 1),
            fair_low=round(iv * config.fair_low, 1),
            fair_high=round(iv * config.fair_high, 1),
            overpay_above=round(iv * config.overpay_threshold, 1),
            big_overpay_above=round(iv * config.big_overpay_threshold, 1),
        )

    # Re-apply keeper premiums on new inflated values
    from .breakout_predictor import apply_keeper_premiums
    apply_keeper_premiums(players)

    # Invalidate optimizer cache
    from .draft_optimizer import invalidate_cache
    invalidate_cache()


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

    # Re-apply picks, skipping any that reference missing players (e.g. test data)
    valid_picks = []
    for pick in _draft_state.picks:
        player = get_player(pick.player_id)
        if player is None:
            continue  # Skip picks for players not in the current pool

        player.is_drafted = True
        player.draft_team_id = pick.team_id
        player.draft_price = pick.price

        team = league.get_team(pick.team_id)
        if team is not None:
            team.budget_spent += pick.price
            team.draft_picks.append(pick.player_id)
        valid_picks.append(pick)

    _draft_state.picks = valid_picks
    _recalculate_values()
    return _draft_state
