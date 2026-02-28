"""Keeper management endpoints."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..services.keeper_manager import (
    add_keeper,
    calculate_inflation,
    get_league,
    get_team,
    import_keepers_csv,
    initialize_league,
    link_keepers_to_players,
    set_keepers,
    update_team,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class KeeperIn(BaseModel):
    player_name: str
    salary: int
    positions: List[str] = []


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    is_user: Optional[bool] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/teams")
async def list_teams():
    """Get all teams with their keepers."""
    league = get_league()
    return {
        "teams": [t.model_dump() for t in league.teams],
        "count": len(league.teams),
    }


@router.post("/teams/{team_id}")
async def set_team_keepers(team_id: str, keepers: List[KeeperIn]):
    """Set keepers for a specific team (replaces existing keepers)."""
    team = get_team(team_id)
    if team is None:
        raise HTTPException(status_code=404, detail=f"Team '{team_id}' not found")

    keepers_data = [k.model_dump() for k in keepers]
    result = set_keepers(team_id, keepers_data)
    return {
        "team_id": team_id,
        "keepers": [k.model_dump() for k in result],
        "count": len(result),
    }


@router.put("/teams/{team_id}")
async def update_team_info(team_id: str, body: TeamUpdate):
    """Update team name or is_user flag."""
    try:
        team = update_team(team_id, name=body.name, is_user=body.is_user)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return team.model_dump()


@router.get("/inflation")
async def get_inflation():
    """Get inflation rate and detailed breakdown."""
    return calculate_inflation()


@router.post("/import")
async def bulk_import_keepers(file: UploadFile = File(...)):
    """Bulk import keepers from a CSV file.

    Expected columns: team_name, player_name, salary
    """
    content = await file.read()
    result = import_keepers_csv(content)
    return result


@router.post("/link")
async def link_keepers():
    """Link all keepers to loaded player pool using fuzzy matching."""
    result = link_keepers_to_players()
    return result
