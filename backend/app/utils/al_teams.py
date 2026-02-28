"""AL team abbreviations for filtering."""

from __future__ import annotations

AL_TEAMS: set[str] = {
    "BAL",  # Baltimore Orioles
    "BOS",  # Boston Red Sox
    "NYY",  # New York Yankees
    "TBR",  # Tampa Bay Rays (also TB)
    "TOR",  # Toronto Blue Jays
    "CHW",  # Chicago White Sox (also CWS)
    "CLE",  # Cleveland Guardians
    "DET",  # Detroit Tigers
    "KCR",  # Kansas City Royals (also KC)
    "MIN",  # Minnesota Twins
    "HOU",  # Houston Astros
    "LAA",  # Los Angeles Angels
    "OAK",  # Oakland Athletics
    "SEA",  # Seattle Mariners
    "TEX",  # Texas Rangers
}

# Common alternate abbreviations used by different data sources
AL_TEAM_ALIASES: dict[str, str] = {
    "TB": "TBR",
    "CWS": "CHW",
    "KC": "KCR",
    "ATH": "OAK",
    "ANA": "LAA",
    "NYA": "NYY",
    "BOS": "BOS",
    "BAL": "BAL",
    "CLE": "CLE",
    "TOR": "TOR",
    "DET": "DET",
    "MIN": "MIN",
    "HOU": "HOU",
    "OAK": "OAK",
    "SEA": "SEA",
    "TEX": "TEX",
    "LAA": "LAA",
    "TBR": "TBR",
    "CHW": "CHW",
    "KCR": "KCR",
    "NYY": "NYY",
}


def normalize_team(team: str) -> str | None:
    """Normalize a team abbreviation. Returns None if not an AL team."""
    team = team.strip().upper()
    canonical = AL_TEAM_ALIASES.get(team, team)
    return canonical if canonical in AL_TEAMS else None


def is_al_team(team: str) -> bool:
    return normalize_team(team) is not None
