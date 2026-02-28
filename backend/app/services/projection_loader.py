"""CSV import, column normalization, and AL-only filtering."""

from __future__ import annotations

import io
import logging
import uuid
from typing import Optional

import pandas as pd

try:
    import urllib.request
    import json as _json
except ImportError:
    pass

from ..config import league_config
from ..models.player import (
    HittingProjection,
    PitchingProjection,
    Player,
)
from ..utils.al_teams import is_al_team, normalize_team
from ..utils.position_eligibility import is_hitter, is_pitcher, parse_positions

logger = logging.getLogger(__name__)

# Column name mappings for common FanGraphs CSV formats
HITTING_COLUMN_MAP = {
    "Name": "name",
    "\ufeffName": "name",  # BOM-prefixed
    "playerid": "id",
    "PlayerId": "id",
    "MLBAMID": "mlbam_id",
    "Team": "team",
    "Pos": "positions",
    "POS": "positions",
    "PA": "PA",
    "AB": "AB",
    "H": "H",
    "2B": "2B",
    "3B": "3B",
    "HR": "HR",
    "R": "R",
    "RBI": "RBI",
    "SB": "SB",
    "CS": "CS",
    "BB": "BB",
    "SO": "SO",
    "AVG": "BA",
    "BA": "BA",
    "OBP": "OBP",
    "SLG": "SLG",
    "OPS": "OPS",
    "G": "G",
    "GS": "GS",
    # Advanced metrics for breakout
    "Age": "age",
    "xBA": "xBA",
    "xSLG": "xSLG",
    "Barrel%": "barrel_pct",
    "HardHit%": "hard_hit_pct",
    "Hard%": "hard_hit_pct",
    "Spd": "spd",
    "SPD": "spd",
    "xwOBA": "xwOBA",
    "xwoba": "xwOBA",
}

PITCHING_COLUMN_MAP = {
    "Name": "name",
    "\ufeffName": "name",  # BOM-prefixed
    "playerid": "id",
    "PlayerId": "id",
    "MLBAMID": "mlbam_id",
    "Team": "team",
    "Pos": "positions",
    "POS": "positions",
    "IP": "IP",
    "W": "W",
    "L": "L",
    "SV": "SV",
    "HLD": "HLD",
    "K": "K",
    "SO": "K",
    "BB": "BB",
    "H": "H",
    "ER": "ER",
    "HR": "HR",
    "ERA": "ERA",
    "WHIP": "WHIP",
    "G": "G",
    "GS": "GS",
    # Advanced metrics for breakout
    "Age": "age",
    "Stuff+": "stuff_plus",
    "K%": "k_pct",
    "BB%": "bb_pct",
    "CSW%": "csw_pct",
    "xERA": "xERA",
    "Location+": "location_plus",
    "SwStr%": "swstr_pct",
}

# In-memory player store
_players: dict[str, Player] = {}

# Position cache so we don't re-fetch for same MLBAM IDs
_position_cache: dict[str, list[str]] = {}

# Directory for persisted CSV files
import pathlib
_DATA_DIR = pathlib.Path(__file__).resolve().parent.parent.parent / "data" / "projections"


STATCAST_HITTER_MAP = {
    "Name": "name",
    "\ufeffName": "name",
    "last_name, first_name": "name",
    "player_name": "name",
    "Team": "team",
    "Tm": "team",
    "Age": "age",
    "xBA": "xBA",
    "xba": "xBA",
    "Barrel%": "barrel_pct",
    "barrel_batted_rate": "barrel_pct",
    "Barrel": "barrel_pct",
    "HardHit%": "hard_hit_pct",
    "Hard%": "hard_hit_pct",
    "hard_hit_percent": "hard_hit_pct",
    "xSLG": "xSLG",
    "xslg": "xSLG",
    "Spd": "spd",
    "SPD": "spd",
    "Spd Score": "spd",
    "xwOBA": "xwOBA",
    "xwoba": "xwOBA",
}

STATCAST_PITCHER_MAP = {
    "Name": "name",
    "\ufeffName": "name",
    "last_name, first_name": "name",
    "player_name": "name",
    "Team": "team",
    "Tm": "team",
    "Age": "age",
    "Stuff+": "stuff_plus",
    "stuff_plus": "stuff_plus",
    "K%": "k_pct",
    "k_percent": "k_pct",
    "CSW%": "csw_pct",
    "csw_pct": "csw_pct",
    "xERA": "xERA",
    "xera": "xERA",
    "Location+": "location_plus",
    "SwStr%": "swstr_pct",
    "BB%": "bb_pct",
}


def get_players() -> dict[str, Player]:
    return _players


def get_player(player_id: str) -> Optional[Player]:
    return _players.get(player_id)


def clear_players(delete_files: bool = False):
    _players.clear()
    if delete_files:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        for f in _DATA_DIR.glob("*.csv"):
            f.unlink()


def list_saved_files() -> list[dict]:
    """List all saved projection CSV files."""
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    files = []
    for f in sorted(_DATA_DIR.glob("*.csv")):
        # Filename format: hitting_filename.csv or pitching_filename.csv
        parts = f.stem.split("_", 1)
        file_type = parts[0] if parts[0] in ("hitting", "pitching") else "unknown"
        files.append({
            "filename": f.name,
            "file_type": file_type,
            "original_name": parts[1] if len(parts) > 1 else f.stem,
            "size_kb": round(f.stat().st_size / 1024, 1),
        })
    return files


def delete_saved_file(filename: str) -> bool:
    """Delete a specific saved projection file."""
    filepath = _DATA_DIR / filename
    if filepath.exists() and filepath.suffix == ".csv":
        filepath.unlink()
        return True
    return False


def _save_csv_to_disk(csv_content: bytes, file_type: str, original_filename: str):
    """Persist raw CSV to data/projections/ for reload on restart."""
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    # Clean the original filename
    safe_name = "".join(c for c in original_filename if c.isalnum() or c in ".-_ ").strip()
    if not safe_name:
        safe_name = "upload"
    save_name = f"{file_type}_{safe_name}"
    if not save_name.endswith(".csv"):
        save_name += ".csv"
    (_DATA_DIR / save_name).write_bytes(csv_content)
    return save_name


def load_persisted_projections():
    """Load all saved CSV files from disk. Called on startup."""
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    loaded = 0
    for f in sorted(_DATA_DIR.glob("*.csv")):
        parts = f.stem.split("_", 1)
        file_type = parts[0] if parts[0] in ("hitting", "pitching") else None
        try:
            content = f.read_bytes()
            players = load_projections_csv(content, file_type=file_type, _persist=False)
            loaded += len(players)
            logger.info(f"Loaded {len(players)} players from {f.name}")
        except Exception as e:
            logger.warning(f"Failed to load {f.name}: {e}")
    if loaded:
        logger.info(f"Total: {loaded} players loaded from disk")
        # Auto-calculate valuations so they're ready
        from .sgp_calculator import calculate_all_sgp
        from .valuation_engine import calculate_dollar_values
        from ..config import league_config
        calculate_all_sgp(_players, league_config)
        calculate_dollar_values(_players, league_config)
        from .breakout_predictor import calculate_all_breakouts
        calculate_all_breakouts(_players)
    return loaded


def _detect_file_type(df: pd.DataFrame) -> str:
    """Detect if CSV is hitters or pitchers based on columns."""
    hitting_cols = {"AB", "H", "HR", "RBI", "SB", "AVG", "BA", "R"}
    pitching_cols = {"IP", "ERA", "WHIP", "SV", "ER"}

    cols = set(df.columns)
    hit_overlap = len(cols & hitting_cols)
    pitch_overlap = len(cols & pitching_cols)

    if pitch_overlap > hit_overlap:
        return "pitching"
    return "hitting"


def _normalize_columns(df: pd.DataFrame, col_map: dict) -> pd.DataFrame:
    """Rename columns using the mapping, keeping only mapped ones."""
    rename = {}
    for orig, target in col_map.items():
        if orig in df.columns:
            rename[orig] = target
    df = df.rename(columns=rename)
    return df


def _fetch_positions_mlb_api(mlbam_ids: list[str]) -> dict[str, list[str]]:
    """Fetch primary positions from MLB Stats API for a batch of player IDs.

    Uses the free, unauthenticated MLB Stats API.
    """
    results = {}
    # Process in batches to avoid huge URLs
    batch_size = 50
    for i in range(0, len(mlbam_ids), batch_size):
        batch = mlbam_ids[i:i + batch_size]
        ids_param = ",".join(str(mid) for mid in batch)
        url = f"https://statsapi.mlb.com/api/v1/people?personIds={ids_param}&hydrate=currentTeam"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "FantasyBaseballTool/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = _json.loads(resp.read().decode())
                for person in data.get("people", []):
                    pid = str(person.get("id", ""))
                    pos_info = person.get("primaryPosition", {})
                    pos_abbr = pos_info.get("abbreviation", "")

                    # Map MLB API position codes to our format
                    pos_map = {
                        "C": "C", "1B": "1B", "2B": "2B", "3B": "3B",
                        "SS": "SS", "LF": "OF", "CF": "OF", "RF": "OF",
                        "OF": "OF", "DH": "DH",
                        "P": "P", "SP": "SP", "RP": "RP",
                        "TWP": "SP",  # Two-way player
                    }
                    mapped = pos_map.get(pos_abbr, "")
                    if mapped:
                        results[pid] = [mapped]
                    _position_cache[pid] = results.get(pid, [])
        except Exception as e:
            logger.warning(f"MLB API position fetch failed for batch: {e}")
            continue

    return results


def _infer_pitcher_role(row: pd.Series) -> list[str]:
    """Infer SP vs RP from games started vs total games."""
    gs = int(row.get("GS", 0) or 0)
    g = int(row.get("G", 0) or 0)
    sv = int(row.get("SV", 0) or 0)

    if gs > 0 and gs >= g * 0.5:
        return ["SP"]
    elif sv > 0:
        return ["RP"]
    elif g > 0 and gs == 0:
        return ["RP"]
    return ["P"]


def load_projections_csv(
    csv_content: bytes,
    file_type: Optional[str] = None,
    _persist: bool = True,
    _filename: str = "upload.csv",
) -> list[Player]:
    """Parse a FanGraphs CSV and return Player objects, filtered to AL only."""
    df = pd.read_csv(io.BytesIO(csv_content))

    if file_type is None:
        file_type = _detect_file_type(df)

    # Save raw CSV to disk for persistence across restarts
    if _persist:
        _save_csv_to_disk(csv_content, file_type, _filename)

    col_map = HITTING_COLUMN_MAP if file_type == "hitting" else PITCHING_COLUMN_MAP
    df = _normalize_columns(df, col_map)

    # Ensure required columns
    if "name" not in df.columns or "team" not in df.columns:
        raise ValueError("CSV must contain 'Name' and 'Team' columns")

    # Generate IDs if missing
    if "id" not in df.columns:
        df["id"] = [str(uuid.uuid4())[:8] for _ in range(len(df))]
    df["id"] = df["id"].astype(str)

    # Make IDs unique per file type to avoid collisions for two-way players
    type_prefix = "h_" if file_type == "hitting" else "p_"
    df["id"] = type_prefix + df["id"]

    # Filter to AL teams
    df["team_norm"] = df["team"].apply(lambda t: normalize_team(str(t)) if pd.notna(t) else None)
    df = df[df["team_norm"].notna()].copy()

    # Fetch positions from MLB API if we have MLBAM IDs and no position column
    has_positions_col = "positions" in df.columns
    mlbam_positions = {}
    if not has_positions_col and "mlbam_id" in df.columns:
        # Only fetch IDs we haven't cached
        all_ids = df["mlbam_id"].dropna().astype(int).astype(str).tolist()
        uncached = [mid for mid in all_ids if mid not in _position_cache]
        if uncached:
            fetched = _fetch_positions_mlb_api(uncached)
            mlbam_positions.update(fetched)
        # Merge cached
        for mid in all_ids:
            if mid in _position_cache:
                mlbam_positions[mid] = _position_cache[mid]

    players = []
    for _, row in df.iterrows():
        player_is_hitter = file_type == "hitting"

        # Determine positions
        if has_positions_col:
            positions = parse_positions(str(row.get("positions", "")))
        elif "mlbam_id" in row.index and pd.notna(row.get("mlbam_id")):
            mid = str(int(row["mlbam_id"]))
            positions = mlbam_positions.get(mid, [])
        else:
            positions = []

        # For pitchers: if API returned generic "P", refine to SP/RP using GS data
        if not player_is_hitter and positions == ["P"]:
            positions = _infer_pitcher_role(row)

        # Fallback: infer from file type
        if not positions:
            if player_is_hitter:
                positions = ["DH"]
            else:
                positions = _infer_pitcher_role(row)

        player = Player(
            id=str(row["id"]),
            name=str(row["name"]),
            team=str(row["team_norm"]),
            positions=positions,
            is_hitter=player_is_hitter,
        )

        if player_is_hitter:
            player.hitting = HittingProjection(
                PA=int(row.get("PA", 0) or 0),
                AB=int(row.get("AB", 0) or 0),
                H=int(row.get("H", 0) or 0),
                doubles=int(row.get("2B", 0) or 0),
                triples=int(row.get("3B", 0) or 0),
                HR=int(row.get("HR", 0) or 0),
                R=int(row.get("R", 0) or 0),
                RBI=int(row.get("RBI", 0) or 0),
                SB=int(row.get("SB", 0) or 0),
                CS=int(row.get("CS", 0) or 0),
                BB=int(row.get("BB", 0) or 0),
                SO=int(row.get("SO", 0) or 0),
                BA=float(row.get("BA", 0) or 0),
            )
        else:
            player.pitching = PitchingProjection(
                IP=float(row.get("IP", 0) or 0),
                W=int(row.get("W", 0) or 0),
                L=int(row.get("L", 0) or 0),
                SV=int(row.get("SV", 0) or 0),
                HLD=int(row.get("HLD", 0) or 0),
                K=int(row.get("K", 0) or 0),
                BB=int(row.get("BB", 0) or 0),
                H=int(row.get("H", 0) or 0),
                ER=int(row.get("ER", 0) or 0),
                HR=int(row.get("HR", 0) or 0),
                ERA=float(row.get("ERA", 0) or 0),
                WHIP=float(row.get("WHIP", 0) or 0),
            )

        # Store extra columns for breakout analysis
        for extra in ["age", "xBA", "xSLG", "xwOBA", "barrel_pct", "hard_hit_pct", "spd", "stuff_plus", "k_pct", "bb_pct", "csw_pct", "xERA", "location_plus", "swstr_pct"]:
            if extra in row.index and pd.notna(row[extra]):
                if not hasattr(player, "_extra"):
                    player.__dict__["_extra"] = {}
                player.__dict__["_extra"][extra] = float(row[extra])

        _players[player.id] = player
        players.append(player)

    return players


def _normalize_name(name: str) -> str:
    """Normalize a player name for fuzzy matching."""
    import re
    # Handle "Last, First" format from Baseball Savant
    if "," in name:
        parts = name.split(",", 1)
        name = f"{parts[1].strip()} {parts[0].strip()}"
    # Lowercase, strip accents/periods/Jr/Sr/etc
    name = name.lower().strip()
    name = re.sub(r"\bjr\.?\b", "", name)
    name = re.sub(r"\bsr\.?\b", "", name)
    name = re.sub(r"[.\-']", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def merge_statcast_csv(
    csv_content: bytes,
    player_type: str = "hitter",
) -> dict:
    """Merge Statcast/advanced CSV data into existing players by name matching.

    Returns dict with match stats.
    """
    df = pd.read_csv(io.BytesIO(csv_content))

    col_map = STATCAST_HITTER_MAP if player_type == "hitter" else STATCAST_PITCHER_MAP
    df = _normalize_columns(df, col_map)

    if "name" not in df.columns:
        raise ValueError("CSV must contain a 'Name' column")

    # Build lookup of existing players by normalized name
    target_is_hitter = player_type == "hitter"
    name_to_players: dict[str, list[Player]] = {}
    for p in _players.values():
        if p.is_hitter != target_is_hitter:
            continue
        key = _normalize_name(p.name)
        name_to_players.setdefault(key, []).append(p)

    extra_fields = (
        ["age", "xBA", "xSLG", "xwOBA", "barrel_pct", "hard_hit_pct", "spd"]
        if player_type == "hitter"
        else ["age", "stuff_plus", "k_pct", "bb_pct", "csw_pct", "xERA", "location_plus", "swstr_pct"]
    )

    matched = 0
    unmatched_names = []

    for _, row in df.iterrows():
        csv_name = str(row.get("name", ""))
        if not csv_name or csv_name == "nan":
            continue

        norm = _normalize_name(csv_name)
        candidates = name_to_players.get(norm)

        # If no exact match, try team-based match with partial name
        if not candidates and "team" in row.index and pd.notna(row.get("team")):
            csv_team = normalize_team(str(row["team"]))
            if csv_team:
                # Try matching just last name + team
                last_name = norm.split()[-1] if norm.split() else norm
                for key, plist in name_to_players.items():
                    if last_name in key and any(p.team == csv_team for p in plist):
                        candidates = [p for p in plist if p.team == csv_team]
                        break

        if not candidates:
            unmatched_names.append(csv_name)
            continue

        for player in candidates:
            if "_extra" not in player.__dict__:
                player.__dict__["_extra"] = {}
            for field in extra_fields:
                if field in row.index and pd.notna(row[field]):
                    val = row[field]
                    # Handle percentage strings like "45.2%"
                    if isinstance(val, str) and "%" in val:
                        val = val.replace("%", "").strip()
                    try:
                        player.__dict__["_extra"][field] = float(val)
                    except (ValueError, TypeError):
                        pass
            matched += 1

    # Re-run breakout predictor
    from .breakout_predictor import calculate_all_breakouts
    calculate_all_breakouts(_players)

    return {
        "matched": matched,
        "unmatched": len(unmatched_names),
        "unmatched_names": unmatched_names[:20],  # First 20 for debugging
        "total_in_pool": len(_players),
    }
