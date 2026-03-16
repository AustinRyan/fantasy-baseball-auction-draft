"""Projection upload and management endpoints."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from pydantic import BaseModel

from ..services.projection_loader import (
    add_nl_keeper_player,
    clear_players,
    delete_saved_file,
    get_nl_keeper_players,
    get_players,
    list_saved_files,
    load_projections_csv,
    merge_statcast_csv,
    remove_nl_keeper_player,
)

router = APIRouter()


@router.post("/upload")
async def upload_projections(
    file: UploadFile = File(...),
    file_type: Optional[str] = Query(None, description="'hitting' or 'pitching'. Auto-detected if omitted."),
):
    """Upload FanGraphs CSV projections file. Saved to disk for persistence."""
    content = await file.read()
    players = load_projections_csv(
        content,
        file_type=file_type,
        _filename=file.filename or "upload.csv",
    )
    return {
        "message": f"Loaded {len(players)} AL players from {file.filename}",
        "player_count": len(players),
        "total_in_pool": len(get_players()),
    }


@router.post("/statcast")
async def upload_statcast(
    file: UploadFile = File(...),
    player_type: str = Query("hitter", description="'hitter' or 'pitcher'"),
):
    """Upload Statcast/advanced metrics CSV to merge into existing players."""
    if not get_players():
        raise HTTPException(status_code=400, detail="Upload projections first before adding Statcast data")
    content = await file.read()
    try:
        result = merge_statcast_csv(content, player_type=player_type, _filename=file.filename or "upload.csv")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "message": f"Matched {result['matched']} {player_type}s, {result['unmatched']} unmatched",
        **result,
    }


@router.get("/files")
async def list_projection_files():
    """List all saved projection CSV files."""
    files = list_saved_files()
    return {"files": files, "count": len(files)}


@router.delete("/files/{filename}")
async def delete_projection_file(filename: str):
    """Delete a saved projection file and reload remaining data."""
    deleted = delete_saved_file(filename)
    if not deleted:
        return {"error": f"File '{filename}' not found"}
    # Reload from remaining files
    clear_players(delete_files=False)
    from ..services.projection_loader import load_persisted_projections
    loaded = load_persisted_projections()
    return {
        "message": f"Deleted {filename}",
        "players_remaining": loaded,
    }


@router.delete("/clear")
async def clear_all_projections(delete_files: bool = Query(True)):
    """Clear all projections and optionally delete saved files."""
    clear_players(delete_files=delete_files)
    return {"message": "All projections cleared", "files_deleted": delete_files}


@router.get("/news/{player_name}")
async def get_player_news(player_name: str):
    """Get recent MLB transactions and IL status for a player."""
    from ..services.mlb_news import get_player_news as _get_news
    return _get_news(player_name)


@router.get("/players")
async def list_players(
    position: Optional[str] = None,
    is_hitter: Optional[bool] = None,
    team: Optional[str] = None,
):
    """Get all loaded players with optional filters."""
    players = list(get_players().values())

    if position:
        players = [p for p in players if position in p.positions]
    if is_hitter is not None:
        players = [p for p in players if p.is_hitter == is_hitter]
    if team:
        players = [p for p in players if p.team == team.upper()]

    return {
        "players": [p.model_dump() for p in players],
        "count": len(players),
    }


# ---------------------------------------------------------------------------
# NL Keeper-Eligible Players
# ---------------------------------------------------------------------------

class NLPlayerIn(BaseModel):
    name: str
    team: str
    positions: list[str]
    stats: dict


@router.post("/nl-keeper")
async def add_nl_player(body: NLPlayerIn):
    """Add an NL-transferred player to the pool (keepable with $2 penalty)."""
    player = add_nl_keeper_player(
        name=body.name,
        team=body.team,
        positions=body.positions,
        stats=body.stats,
    )
    return {
        "message": f"Added {player.name} ({player.team}) as NL keeper-eligible",
        "player": player.model_dump(),
        "total_in_pool": len(get_players()),
    }


@router.get("/nl-keepers")
async def list_nl_players():
    """List all NL keeper-eligible players."""
    players = get_nl_keeper_players()
    return {
        "players": [p.model_dump() for p in players],
        "count": len(players),
    }


@router.delete("/nl-keeper/{player_id}")
async def delete_nl_player(player_id: str):
    """Remove an NL keeper-eligible player from the pool."""
    removed = remove_nl_keeper_player(player_id)
    if not removed:
        raise HTTPException(status_code=404, detail="NL keeper-eligible player not found")
    return {"message": "Player removed", "total_in_pool": len(get_players())}
