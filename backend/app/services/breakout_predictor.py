"""Breakout/decline risk scoring based on advanced metrics."""

from __future__ import annotations

from ..models.player import BreakoutProfile, Player


def score_breakout(player: Player) -> BreakoutProfile:
    """Calculate breakout/decline risk profile.

    Composite score based on:
    Hitters: Age, xBA-BA gap, xSLG, Barrel%, HardHit%, Spd
    Pitchers: Age, Stuff+, K%, CSW%

    Returns score from -1 (decline risk) to +1 (high upside).
    """
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
        barrel = extra.get("barrel_pct")
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
        hard_hit = extra.get("hard_hit_pct")
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
        k_pct = extra.get("k_pct")
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
        csw = extra.get("csw_pct")
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
        swstr = extra.get("swstr_pct")
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
    if score >= 0.4:
        label = "High Upside"
    elif score >= 0.15:
        label = "Moderate Upside"
    elif score <= -0.3:
        label = "Decline Risk"
    else:
        label = "Stable"

    return BreakoutProfile(score=round(score, 2), label=label, factors=factors)


def calculate_all_breakouts(players: dict[str, Player]) -> dict[str, Player]:
    """Calculate breakout profiles for all players."""
    for player in players.values():
        player.breakout = score_breakout(player)
    return players
