"""Next-pick recommendation engine."""

from __future__ import annotations

from typing import Optional

from ..config import league_config
from ..models.draft import DraftRecommendation, RosterNeed
from ..models.league import Keeper, Team
from ..models.player import Player
from ..services.keeper_manager import get_league
from ..services.projection_loader import get_players, get_player
from ..utils.position_eligibility import SLOT_ELIGIBLE_POSITIONS, POSITION_SLOT_MAP


def _get_roster_slot_counts() -> dict:
    """Return a dict of slot_name -> count from the league config."""
    roster = league_config.roster
    return {
        "C": roster.C,
        "1B": roster.first_base,
        "2B": roster.second_base,
        "3B": roster.third_base,
        "SS": roster.SS,
        "MI": roster.MI,
        "CI": roster.CI,
        "OF": roster.OF,
        "U": roster.U,
        "P": roster.P,
    }


def _get_team_roster(team: Team) -> list:
    """Get all players on a team's roster (keepers + draft picks)."""
    players = get_players()
    roster_players = []

    # Add keepers
    for keeper in team.keepers:
        keeper_obj = keeper if isinstance(keeper, Keeper) else Keeper(**keeper)
        player = get_player(keeper_obj.player_id)
        if player is not None:
            roster_players.append(player)

    # Add drafted players
    for pid in team.draft_picks:
        player = get_player(pid)
        if player is not None:
            roster_players.append(player)

    return roster_players


def _assign_players_to_slots(roster_players: list) -> dict:
    """Greedily assign roster players to their best slots.

    Returns dict of slot_name -> list of assigned player names.
    Uses a greedy approach: assign players to their most specific
    (fewest alternatives) slot first.
    """
    slot_counts = _get_roster_slot_counts()
    slot_filled: dict[str, list[str]] = {slot: [] for slot in slot_counts}

    # Build player -> eligible slots mapping
    player_slots = []
    for player in roster_players:
        eligible_slots = set()
        for pos in player.positions:
            for slot in POSITION_SLOT_MAP.get(pos, []):
                if slot in slot_counts:
                    eligible_slots.add(slot)
        player_slots.append((player, sorted(eligible_slots)))

    # Sort by number of eligible slots (most constrained first)
    player_slots.sort(key=lambda x: len(x[1]))

    for player, eligible in player_slots:
        assigned = False
        for slot in eligible:
            if len(slot_filled[slot]) < slot_counts[slot]:
                slot_filled[slot].append(player.name)
                assigned = True
                break
        # If not assigned to a specific slot, player doesn't fit

    return slot_filled


def _is_player_eligible_for_slot(player: Player, slot: str) -> bool:
    """Check if a player is eligible for a given roster slot."""
    eligible_positions = SLOT_ELIGIBLE_POSITIONS.get(slot, [])
    return any(pos in eligible_positions for pos in player.positions)


def get_recommendations(team_id: str) -> list:
    """Generate draft recommendations for a team.

    1. Get the team's current roster (keepers + draft picks)
    2. Identify unfilled roster slots
    3. For each unfilled slot, find top available players
    4. Score recommendations by urgency and value
    5. Return top 10
    """
    league = get_league()
    team = league.get_team(team_id)
    if team is None:
        raise ValueError(f"Team '{team_id}' not found")

    players = get_players()
    roster_players = _get_team_roster(team)
    slot_filled = _assign_players_to_slots(roster_players)
    slot_counts = _get_roster_slot_counts()

    # Calculate remaining roster spots
    total_filled = sum(len(v) for v in slot_filled.values())
    total_slots = sum(slot_counts.values())
    remaining_slots = total_slots - total_filled

    # Available players (not drafted, not keeper)
    available = [
        p for p in players.values()
        if not p.is_drafted and not p.is_keeper
    ]

    recommendations = []

    for slot, count in slot_counts.items():
        unfilled_count = count - len(slot_filled[slot])
        if unfilled_count <= 0:
            continue

        # Find top available players eligible for this slot
        eligible = [
            p for p in available
            if _is_player_eligible_for_slot(p, slot)
        ]
        eligible.sort(key=lambda p: p.inflated_value, reverse=True)
        top_3 = eligible[:3]

        if not top_3:
            continue

        # Value over next best (urgency signal)
        if len(top_3) >= 2:
            value_over_next = top_3[0].inflated_value - top_3[1].inflated_value
        else:
            value_over_next = top_3[0].inflated_value

        for i, player in enumerate(top_3):
            # Budget feasibility: can afford player + fill remaining slots at $1
            remaining_budget = team.remaining_budget
            slots_after_this = remaining_slots - 1  # after filling this slot
            budget_feasible = (
                remaining_budget >= player.inflated_value + slots_after_this
            )

            # Urgency score: how much better #1 is vs #2 (only high for top pick)
            urgency = value_over_next if i == 0 else 0.0

            # Combined score
            combined_score = urgency * 0.4 + player.inflated_value * 0.6

            fair_price = player.inflated_value
            steal_under = player.pre_bid_range.steal_below if player.pre_bid_range else fair_price * 0.7

            rec = DraftRecommendation(
                player_id=player.id,
                player_name=player.name,
                position="/".join(player.positions),
                slot=slot,
                inflated_value=round(player.inflated_value, 1),
                fair_price=round(fair_price, 1),
                steal_under=round(steal_under, 1),
                urgency_score=round(urgency, 2),
                value_over_next=round(value_over_next, 2),
                budget_feasible=budget_feasible,
                reason=f"Top {'pick' if i == 0 else 'alternative'} for {slot} slot",
            )
            recommendations.append((combined_score, rec))

    # Sort by combined score descending
    recommendations.sort(key=lambda x: x[0], reverse=True)

    return [rec for _, rec in recommendations[:10]]


def get_roster_needs(team_id: str) -> list:
    """Get current roster fill status for a team.

    For each roster slot, show:
    - Whether it's filled
    - By whom
    - Top 3 available players if unfilled
    """
    league = get_league()
    team = league.get_team(team_id)
    if team is None:
        raise ValueError(f"Team '{team_id}' not found")

    players = get_players()
    roster_players = _get_team_roster(team)
    slot_filled = _assign_players_to_slots(roster_players)
    slot_counts = _get_roster_slot_counts()

    # Available players
    available = [
        p for p in players.values()
        if not p.is_drafted and not p.is_keeper
    ]

    needs = []

    for slot, count in slot_counts.items():
        filled_names = slot_filled.get(slot, [])

        # Create one RosterNeed per slot instance
        for i in range(count):
            is_filled = i < len(filled_names)
            player_name = filled_names[i] if is_filled else None

            top_available = []
            if not is_filled:
                eligible = [
                    p for p in available
                    if _is_player_eligible_for_slot(p, slot)
                ]
                eligible.sort(key=lambda p: p.inflated_value, reverse=True)
                top_available = [
                    {
                        "player_id": p.id,
                        "name": p.name,
                        "value": round(p.inflated_value, 1),
                        "urgency": round(
                            (eligible[0].inflated_value - eligible[1].inflated_value)
                            if len(eligible) >= 2 else eligible[0].inflated_value,
                            1,
                        ),
                    }
                    for p in eligible[:3]
                ]

            slot_label = f"{slot}" if count == 1 else f"{slot} ({i + 1})"

            needs.append(RosterNeed(
                slot=slot_label,
                filled=is_filled,
                player_name=player_name,
                top_available=top_available,
            ))

    return needs
