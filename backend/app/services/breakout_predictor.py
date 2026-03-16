"""Breakout/decline risk scoring based on advanced metrics."""

from __future__ import annotations

from ..models.player import BreakoutProfile, Player


def _as_pct(val: float | None) -> float | None:
    """Normalize a percentage field — if stored as decimal (0.247), convert to 24.7."""
    if val is None:
        return None
    if val < 1.0:
        return val * 100
    return val


def score_breakout(player: Player, min_pa: int = 200, min_ip: int = 30) -> BreakoutProfile:
    """Calculate breakout/decline risk profile.

    Composite score based on:
    Hitters: Age, xBA-BA gap, xSLG, Barrel%, HardHit%, Spd
    Pitchers: Age, Stuff+, K%, CSW%

    Returns score from -1 (decline risk) to +1 (high upside).
    Players below minimum PA/IP are automatically "Stable" — not enough
    playing time to make a meaningful breakout prediction.
    """
    # Gate: players without enough playing time get "Stable"
    if player.is_hitter:
        pa = player.hitting.PA if player.hitting else 0
        if pa < min_pa:
            return BreakoutProfile(score=0.0, label="Stable", factors=["Insufficient PA for breakout analysis"])
    else:
        ip = player.pitching.IP if player.pitching else 0
        if ip < min_ip:
            return BreakoutProfile(score=0.0, label="Stable", factors=["Insufficient IP for breakout analysis"])

    extra = player.__dict__.get("_extra", {})
    score = 0.0
    factors = []

    age = extra.get("age", 28)

    if player.is_hitter:
        # Age curve: 22-26 is prime breakout window
        if 22 <= age <= 26:
            score += 0.20
            factors.append(f"Age {int(age)} (prime breakout window)")
        elif age <= 21:
            score += 0.15
            factors.append(f"Age {int(age)} (young upside)")
        elif age >= 33:
            score -= 0.20
            factors.append(f"Age {int(age)} (decline risk)")
        elif age >= 30:
            score -= 0.10
            factors.append(f"Age {int(age)} (aging)")

        # xBA-BA gap: positive gap means unlucky, due for improvement
        xba = extra.get("xBA")
        if xba is not None and player.hitting and player.hitting.BA > 0:
            gap = xba - player.hitting.BA
            if gap > 0.020:
                score += 0.20
                factors.append(f"xBA gap +{gap:.3f} (unlucky)")
            elif gap < -0.020:
                score -= 0.15
                factors.append(f"xBA gap {gap:.3f} (overperforming)")

        # xSLG: expected slugging — catches hidden power upside
        xslg = extra.get("xSLG")
        if xslg is not None:
            if xslg > 0.500:
                score += 0.15
                factors.append(f"xSLG {xslg:.3f} (elite power)")
            elif xslg > 0.430:
                score += 0.05
                factors.append(f"xSLG {xslg:.3f} (above avg power)")
            elif xslg < 0.340:
                score -= 0.10
                factors.append(f"xSLG {xslg:.3f} (weak power)")

        # xwOBA: best single "true talent" Statcast metric
        xwoba = extra.get("xwOBA")
        if xwoba is not None:
            if xwoba > 0.370:
                score += 0.15
                factors.append(f"xwOBA {xwoba:.3f} (elite)")
            elif xwoba > 0.330:
                score += 0.05
                factors.append(f"xwOBA {xwoba:.3f} (above avg)")
            elif xwoba < 0.280:
                score -= 0.10
                factors.append(f"xwOBA {xwoba:.3f} (poor)")

        # Barrel rate: >10% is elite
        barrel = _as_pct(extra.get("barrel_pct"))
        if barrel is not None:
            if barrel > 12:
                score += 0.15
                factors.append(f"Barrel {barrel:.1f}% (elite)")
            elif barrel > 8:
                score += 0.08
                factors.append(f"Barrel {barrel:.1f}% (above avg)")
            elif barrel < 4:
                score -= 0.10
                factors.append(f"Barrel {barrel:.1f}% (poor)")

        # Hard hit rate: >42% is good
        hard_hit = _as_pct(extra.get("hard_hit_pct"))
        if hard_hit is not None:
            if hard_hit > 45:
                score += 0.12
                factors.append(f"Hard hit {hard_hit:.1f}% (elite)")
            elif hard_hit > 40:
                score += 0.05
                factors.append(f"Hard hit {hard_hit:.1f}% (above avg)")
            elif hard_hit < 30:
                score -= 0.10
                factors.append(f"Hard hit {hard_hit:.1f}% (poor)")

        # Spd score: speed upside for SB value
        spd = extra.get("spd")
        if spd is not None:
            if spd > 6.0:
                score += 0.12
                factors.append(f"Spd {spd:.1f} (elite speed)")
            elif spd > 4.5:
                score += 0.05
                factors.append(f"Spd {spd:.1f} (above avg speed)")
            elif spd < 2.5:
                score -= 0.05
                factors.append(f"Spd {spd:.1f} (slow)")

    else:
        # Pitcher breakout
        if 23 <= age <= 27:
            score += 0.20
            factors.append(f"Age {int(age)} (prime breakout window)")
        elif age >= 34:
            score -= 0.25
            factors.append(f"Age {int(age)} (decline risk)")
        elif age >= 31:
            score -= 0.10
            factors.append(f"Age {int(age)} (aging)")

        # Stuff+: >110 is very good
        stuff = extra.get("stuff_plus")
        if stuff is not None:
            if stuff > 120:
                score += 0.25
                factors.append(f"Stuff+ {stuff:.0f} (elite)")
            elif stuff > 110:
                score += 0.12
                factors.append(f"Stuff+ {stuff:.0f} (above avg)")
            elif stuff < 90:
                score -= 0.15
                factors.append(f"Stuff+ {stuff:.0f} (below avg)")

        # K rate
        k_pct = _as_pct(extra.get("k_pct"))
        if k_pct is not None:
            if k_pct > 28:
                score += 0.15
                factors.append(f"K% {k_pct:.1f}% (elite)")
            elif k_pct > 23:
                score += 0.05
                factors.append(f"K% {k_pct:.1f}% (above avg)")
            elif k_pct < 16:
                score -= 0.10
                factors.append(f"K% {k_pct:.1f}% (low)")

        # CSW%: Called Strike + Whip rate — best single command metric
        csw = _as_pct(extra.get("csw_pct"))
        if csw is not None:
            if csw > 32:
                score += 0.12
                factors.append(f"CSW% {csw:.1f}% (elite command)")
            elif csw > 29:
                score += 0.05
                factors.append(f"CSW% {csw:.1f}% (above avg command)")
            elif csw < 25:
                score -= 0.10
                factors.append(f"CSW% {csw:.1f}% (poor command)")

        # xERA: expected ERA — shows luck vs skill gap
        xera = extra.get("xERA")
        if xera is not None:
            # Compare to league avg (~4.20)
            if xera < 3.20:
                score += 0.15
                factors.append(f"xERA {xera:.2f} (elite)")
            elif xera < 3.80:
                score += 0.05
                factors.append(f"xERA {xera:.2f} (above avg)")
            elif xera > 5.00:
                score -= 0.10
                factors.append(f"xERA {xera:.2f} (poor)")

        # Location+: command complement to Stuff+
        loc = extra.get("location_plus")
        if loc is not None:
            if loc > 110:
                score += 0.10
                factors.append(f"Location+ {loc:.0f} (elite command)")
            elif loc > 100:
                score += 0.03
                factors.append(f"Location+ {loc:.0f} (above avg)")
            elif loc < 85:
                score -= 0.08
                factors.append(f"Location+ {loc:.0f} (poor command)")

        # SwStr%: swinging strike rate — validates K upside
        swstr = _as_pct(extra.get("swstr_pct"))
        if swstr is not None:
            if swstr > 13:
                score += 0.10
                factors.append(f"SwStr% {swstr:.1f}% (elite)")
            elif swstr > 11:
                score += 0.03
                factors.append(f"SwStr% {swstr:.1f}% (above avg)")
            elif swstr < 8:
                score -= 0.08
                factors.append(f"SwStr% {swstr:.1f}% (low)")

    # Clamp to [-1, 1]
    score = max(-1.0, min(1.0, score))

    # Map score to label
    # Moderate requires score >= 0.25 so age alone (0.20) can't trigger it
    if score >= 0.4:
        label = "High Upside"
    elif score >= 0.25:
        label = "Moderate Upside"
    elif score <= -0.3:
        label = "Decline Risk"
    else:
        label = "Stable"

    return BreakoutProfile(score=round(score, 2), label=label, factors=factors)


def calculate_all_breakouts(
    players: dict[str, Player],
    min_pa: int = 200,
    min_ip: int = 30,
) -> dict[str, Player]:
    """Calculate breakout profiles for all players."""
    for player in players.values():
        player.breakout = score_breakout(player, min_pa=min_pa, min_ip=min_ip)
    return players


def apply_keeper_premiums(players: dict[str, Player]) -> dict[str, Player]:
    """Apply keeper league premium/discount to inflated values.

    In keeper leagues, young breakout candidates are worth more than their
    single-season projections because owners can keep them at the draft price
    in future years.  Decline-risk veterans are worth less for the same reason.

    Premium is a percentage of inflated_value based on breakout label:
        High Upside:     +18%
        Moderate Upside: +10%
        Stable:            0%
        Decline Risk:     -8%

    Only applies to players valued above $1 (don't inflate fringe players).
    """
    PREMIUM_MAP = {
        "High Upside": 0.18,
        "Moderate Upside": 0.10,
        "Stable": 0.0,
        "Decline Risk": -0.08,
    }

    for player in players.values():
        if player.breakout is None or player.inflated_value <= 1.0:
            player.keeper_premium = 0.0
            continue

        pct = PREMIUM_MAP.get(player.breakout.label, 0.0)
        premium = round(player.dollar_value * pct, 1)
        player.keeper_premium = premium
        player.inflated_value = round(player.inflated_value + premium, 1)

        # Recalculate pre-bid ranges off the new inflated value
        if player.pre_bid_range is not None:
            from ..config import league_config
            iv = player.inflated_value
            player.pre_bid_range.steal_below = round(iv * league_config.steal_threshold, 1)
            player.pre_bid_range.value_below = round(iv * league_config.value_threshold, 1)
            player.pre_bid_range.fair_low = round(iv * league_config.fair_low, 1)
            player.pre_bid_range.fair_high = round(iv * league_config.fair_high, 1)
            player.pre_bid_range.overpay_above = round(iv * league_config.overpay_threshold, 1)
            player.pre_bid_range.big_overpay_above = round(iv * league_config.big_overpay_threshold, 1)

    return players
