"""Steal/overpay classification for draft picks."""

from __future__ import annotations

from ..models.player import Player


def classify_pick(player: Player, price: int) -> str:
    """Classify a pick based on pre-bid ranges.

    Uses player.pre_bid_range thresholds:
    - price < steal_below -> "Big Steal"
    - price < value_below -> "Steal"
    - price < fair_high -> "Fair"
    - price < overpay_above -> "Overpay"
    - price >= overpay_above -> "Big Overpay"
    """
    pbr = player.pre_bid_range
    if pbr is None:
        return "Fair"

    if price < pbr.steal_below:
        return "Big Steal"
    elif price < pbr.value_below:
        return "Steal"
    elif price <= pbr.fair_high:
        return "Fair"
    elif price < pbr.overpay_above:
        return "Overpay"
    else:
        return "Big Overpay"


def get_recent_alerts(n: int = 10) -> list:
    """Get the N most recent picks with their classifications.

    Returns list of {player_name, team_id, price, inflated_value, classification, value_diff}
    """
    from .draft_tracker import get_draft_state

    state = get_draft_state()
    recent_picks = list(reversed(state.picks))[:n]

    alerts = []
    for pick in recent_picks:
        alerts.append({
            "player_name": pick.player_name,
            "team_id": pick.team_id,
            "price": pick.price,
            "inflated_value": pick.inflated_value,
            "classification": pick.classification,
            "value_diff": pick.value_diff,
        })

    return alerts
