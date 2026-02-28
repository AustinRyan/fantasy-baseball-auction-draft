"""Position eligibility mapping for roster slots."""

from __future__ import annotations

# Maps specific positions to the roster slots they can fill
POSITION_SLOT_MAP: dict[str, list[str]] = {
    "C": ["C", "U"],
    "1B": ["1B", "CI", "U"],
    "2B": ["2B", "MI", "U"],
    "3B": ["3B", "CI", "U"],
    "SS": ["SS", "MI", "U"],
    "OF": ["OF", "U"],
    "DH": ["U"],
    "SP": ["P"],
    "RP": ["P"],
    "P": ["P"],
}

# Reverse: which positions can fill each roster slot
SLOT_ELIGIBLE_POSITIONS: dict[str, list[str]] = {
    "C": ["C"],
    "1B": ["1B"],
    "2B": ["2B"],
    "3B": ["3B"],
    "SS": ["SS"],
    "MI": ["2B", "SS"],
    "CI": ["1B", "3B"],
    "OF": ["OF"],
    "U": ["C", "1B", "2B", "3B", "SS", "OF", "DH"],
    "P": ["SP", "RP", "P"],
}

HITTING_POSITIONS = {"C", "1B", "2B", "3B", "SS", "OF", "DH"}
PITCHING_POSITIONS = {"SP", "RP", "P"}


def is_hitter(positions: list[str]) -> bool:
    return any(p in HITTING_POSITIONS for p in positions)


def is_pitcher(positions: list[str]) -> bool:
    return any(p in PITCHING_POSITIONS for p in positions)


def parse_positions(pos_str: str) -> list[str]:
    """Parse position string like '1B/OF' or '1B, OF' into list."""
    if not pos_str:
        return []
    separators = ["/", ",", "|"]
    for sep in separators:
        if sep in pos_str:
            return [p.strip() for p in pos_str.split(sep) if p.strip()]
    return [pos_str.strip()]
