"""SGP to dollar value conversion with replacement level and position scarcity."""

from __future__ import annotations

from ..config import LeagueConfig, league_config
from ..models.player import Player, PreBidRange


def _get_replacement_level(
    players: dict[str, Player],
    config: LeagueConfig,
) -> tuple[float, float]:
    """Determine replacement-level SGP for hitters and pitchers.

    Replacement level = SGP of the last draftable player at each position type.
    """
    hitters = sorted(
        [p for p in players.values() if p.is_hitter and not p.is_keeper],
        key=lambda p: p.sgp,
        reverse=True,
    )
    pitchers = sorted(
        [p for p in players.values() if not p.is_hitter and not p.is_keeper],
        key=lambda p: p.sgp,
        reverse=True,
    )

    num_hitters = config.total_hitters_drafted
    num_pitchers = config.total_pitchers_drafted

    # Replacement level is the SGP of the marginal draftable player
    hitter_replacement = hitters[num_hitters - 1].sgp if len(hitters) >= num_hitters else 0
    pitcher_replacement = pitchers[num_pitchers - 1].sgp if len(pitchers) >= num_pitchers else 0

    return hitter_replacement, pitcher_replacement


def calculate_dollar_values(
    players: dict[str, Player],
    config: LeagueConfig = league_config,
    inflation_rate: float = 1.0,
) -> dict[str, Player]:
    """Convert SGP to dollar values.

    1. Determine replacement level
    2. Calculate SGP above replacement for each player
    3. Allocate total dollars (minus $1 per player minimum)
    4. Apply 65/35 hitter/pitcher split
    5. dollars_per_sgp = allocated_dollars / total_sgp_above_replacement
    6. player_value = (sgp_above_replacement * dollars_per_sgp) + $1
    """
    hitter_repl, pitcher_repl = _get_replacement_level(players, config)

    # Separate hitters and pitchers, sorted by SGP
    hitters = sorted(
        [p for p in players.values() if p.is_hitter],
        key=lambda p: p.sgp,
        reverse=True,
    )
    pitchers = sorted(
        [p for p in players.values() if not p.is_hitter],
        key=lambda p: p.sgp,
        reverse=True,
    )

    num_hitters = config.total_hitters_drafted
    num_pitchers = config.total_pitchers_drafted
    total_budget = config.total_budget

    # Draftable players only
    draftable_hitters = hitters[:num_hitters]
    draftable_pitchers = pitchers[:num_pitchers]
    total_draftable = num_hitters + num_pitchers

    # Total dollars available after $1 minimum per player
    available_dollars = total_budget - total_draftable

    # Split between hitters and pitchers
    hitter_dollars = available_dollars * config.hitter_pitcher_split
    pitcher_dollars = available_dollars * (1 - config.hitter_pitcher_split)

    # Total SGP above replacement
    hitter_sgp_total = sum(max(0, p.sgp - hitter_repl) for p in draftable_hitters)
    pitcher_sgp_total = sum(max(0, p.sgp - pitcher_repl) for p in draftable_pitchers)

    # Dollars per SGP
    hitter_dps = hitter_dollars / hitter_sgp_total if hitter_sgp_total > 0 else 0
    pitcher_dps = pitcher_dollars / pitcher_sgp_total if pitcher_sgp_total > 0 else 0

    # Calculate dollar values for all players
    for player in players.values():
        if player.is_hitter:
            repl = hitter_repl
            dps = hitter_dps
        else:
            repl = pitcher_repl
            dps = pitcher_dps

        sgp_above = max(0, player.sgp - repl)
        base_value = (sgp_above * dps) + 1  # $1 minimum
        player.dollar_value = round(base_value, 1)

        # Apply inflation
        player.inflated_value = round(player.dollar_value * inflation_rate, 1)

        # Calculate pre-bid ranges
        iv = player.inflated_value
        player.pre_bid_range = PreBidRange(
            steal_below=round(iv * config.steal_threshold, 1),
            value_below=round(iv * config.value_threshold, 1),
            fair_low=round(iv * config.fair_low, 1),
            fair_high=round(iv * config.fair_high, 1),
            overpay_above=round(iv * config.overpay_threshold, 1),
            big_overpay_above=round(iv * config.big_overpay_threshold, 1),
        )

    return players
