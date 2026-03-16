"""SGP (Standings Gain Points) calculation engine."""

from __future__ import annotations

from ..config import LeagueConfig, league_config
from ..models.player import Player


def calculate_sgp_hitting(player: Player, config: LeagueConfig = league_config) -> dict:
    """Calculate per-category SGP for a hitter.

    Counting stats: player_stat / denominator
    Ratio stats (OBP): volume-weighted marginal contribution
    """
    if not player.hitting:
        return {}

    h = player.hitting
    d = config.sgp_denominators
    sgp = {}

    # Counting stats - straightforward
    sgp["R"] = h.R / d.R if d.R else 0
    sgp["HR"] = h.HR / d.HR if d.HR else 0
    sgp["RBI"] = h.RBI / d.RBI if d.RBI else 0
    sgp["SB"] = h.SB / d.SB if d.SB else 0

    # OBP: volume-weighted marginal contribution
    # Baseline OBP = league average (~.320 for projections)
    # SGP = ((player_OBP - baseline_OBP) * PA / team_PA) / OBP_denominator
    # team_PA ≈ 600 PA per hitter slot
    if h.PA > 0 and d.OBP > 0 and h.OBP > 0:
        baseline_obp = 0.320
        team_pa = 600 * config.roster.total_hitters
        marginal_obp = (h.OBP - baseline_obp) * h.PA / team_pa
        sgp["OBP"] = marginal_obp / d.OBP
    else:
        sgp["OBP"] = 0

    return sgp


def calculate_sgp_pitching(player: Player, config: LeagueConfig = league_config) -> dict:
    """Calculate per-category SGP for a pitcher.

    Counting stats: player_stat / denominator
    Ratio stats (ERA, WHIP): volume-weighted marginal contribution
    """
    if not player.pitching:
        return {}

    p = player.pitching
    d = config.sgp_denominators
    sgp = {}

    # Counting stats
    sgp["W"] = p.W / d.W if d.W else 0
    sgp["SV"] = p.SV / d.SV if d.SV else 0
    sgp["K"] = p.K / d.K if d.K else 0

    # ERA: volume-weighted (lower is better, so invert)
    # team_IP ≈ min_ip or calculated from roster
    if p.IP > 0 and d.ERA > 0:
        baseline_era = 4.00
        team_ip = config.min_team_ip  # 900 IP minimum
        # Marginal ERA contribution (negative is better)
        marginal_era = (p.ERA - baseline_era) * p.IP / team_ip
        sgp["ERA"] = -marginal_era / d.ERA  # Negate: lower ERA = more SGP
    else:
        sgp["ERA"] = 0

    # WHIP: same pattern as ERA (lower is better)
    if p.IP > 0 and d.WHIP > 0:
        baseline_whip = 1.30
        team_ip = config.min_team_ip
        marginal_whip = (p.WHIP - baseline_whip) * p.IP / team_ip
        sgp["WHIP"] = -marginal_whip / d.WHIP  # Negate: lower WHIP = more SGP
    else:
        sgp["WHIP"] = 0

    return sgp


def calculate_total_sgp(sgp_dict: dict) -> float:
    """Sum all category SGPs."""
    return sum(sgp_dict.values())


def calculate_player_sgp(player: Player, config: LeagueConfig = league_config) -> Player:
    """Calculate SGP for a player and update the player object."""
    if player.is_hitter:
        sgp_dict = calculate_sgp_hitting(player, config)
    else:
        sgp_dict = calculate_sgp_pitching(player, config)

    player.sgp_per_category = sgp_dict
    player.sgp = calculate_total_sgp(sgp_dict)
    return player


def calculate_all_sgp(
    players: dict[str, Player],
    config: LeagueConfig = league_config,
) -> dict[str, Player]:
    """Calculate SGP for all players."""
    for player in players.values():
        calculate_player_sgp(player, config)
    return players
