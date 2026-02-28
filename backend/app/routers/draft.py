"""Draft tracking endpoints with WebSocket support."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, HTTPException
from pydantic import BaseModel

from ..services.draft_tracker import (
    get_draft_state as _get_draft_state,
    start_draft as _start_draft,
    reset_draft as _reset_draft,
    record_pick as _record_pick,
    undo_pick as _undo_pick,
    save_draft_state as _save_draft_state,
    load_draft_state as _load_draft_state,
)
from ..services.alert_engine import get_recent_alerts as _get_recent_alerts
from ..services.recommendation_engine import (
    get_recommendations as _get_recommendations,
    get_roster_needs as _get_roster_needs,
)
from ..services.keeper_manager import get_league

router = APIRouter()

# WebSocket connections list for broadcasting
_ws_connections: list = []


class PickRequest(BaseModel):
    player_id: str
    team_id: str
    price: int


async def _broadcast(message: dict) -> None:
    """Broadcast a message to all connected WebSocket clients."""
    for ws in _ws_connections.copy():
        try:
            await ws.send_json(message)
        except Exception:
            if ws in _ws_connections:
                _ws_connections.remove(ws)


@router.post("/start")
async def start_draft():
    """Start the draft."""
    state = _start_draft()
    return {"status": "started", "is_active": state.is_active}


@router.post("/reset")
async def reset_draft():
    """Reset draft state."""
    state = _reset_draft()
    return {"status": "reset", "is_active": state.is_active}


@router.post("/pick")
async def record_pick_endpoint(req: PickRequest):
    """Record a draft pick and broadcast via WebSocket."""
    try:
        pick = _record_pick(req.player_id, req.team_id, req.price)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    pick_data = pick.model_dump(mode="json")
    await _broadcast({"type": "pick", "data": pick_data})
    return pick_data


@router.delete("/pick/{pick_id}")
async def undo_pick_endpoint(pick_id: str):
    """Undo a draft pick."""
    try:
        pick = _undo_pick(pick_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    pick_data = pick.model_dump(mode="json")
    await _broadcast({"type": "undo", "data": pick_data})
    return pick_data


@router.get("/state")
async def get_draft_state_endpoint():
    """Get full draft state."""
    state = _get_draft_state()
    return state.model_dump(mode="json")


@router.get("/my-roster")
async def get_my_roster():
    """Get user's current roster and needs."""
    from ..config import league_config

    league = get_league()
    user_team = next((t for t in league.teams if t.is_user), None)
    if user_team is None:
        # Default to team_1 if no user team set
        user_team = league.get_team("team_1")
    if user_team is None:
        raise HTTPException(status_code=404, detail="No user team found")

    needs = _get_roster_needs(user_team.id)

    budget_total = league_config.budget_per_team
    budget_spent = user_team.budget_spent + user_team.keeper_salary
    budget_remaining = user_team.remaining_budget
    empty_slots = sum(1 for n in needs if not n.filled)
    max_bid = max(1, budget_remaining - empty_slots + 1)

    # Build slots array matching frontend RosterSlot interface
    slots = []
    for n in needs:
        # Strip slot numbering like "C (1)" -> "C"
        slot_name = n.slot.split(" (")[0]
        player_price = None
        if n.filled and n.player_name:
            # Look up the draft price from the player
            from ..services.projection_loader import get_players
            for p in get_players().values():
                if p.name == n.player_name and (p.is_drafted or p.is_keeper):
                    player_price = p.draft_price or p.keeper_salary
                    break
        slots.append({
            "slot": slot_name,
            "player_name": n.player_name,
            "price": player_price,
        })

    return {
        "team_id": user_team.id,
        "team_name": user_team.name,
        "budget_total": budget_total,
        "budget_spent": budget_spent,
        "budget_remaining": budget_remaining,
        "max_bid": max_bid,
        "slots": slots,
    }


@router.get("/recommendations")
async def get_recommendations_endpoint():
    """Get next-pick suggestions for user's team."""
    league = get_league()
    user_team = next((t for t in league.teams if t.is_user), None)
    if user_team is None:
        user_team = league.get_team("team_1")
    if user_team is None:
        raise HTTPException(status_code=404, detail="No user team found")

    try:
        recs = _get_recommendations(user_team.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return [r.model_dump() for r in recs]


@router.get("/alerts")
async def get_alerts():
    """Get recent pick alerts."""
    alerts = _get_recent_alerts()
    return alerts


@router.get("/team/{team_id}/roster")
async def get_team_roster(team_id: str):
    """Get any team's roster needs."""
    try:
        needs = _get_roster_needs(team_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    league = get_league()
    team = league.get_team(team_id)
    return {
        "team_id": team_id,
        "team_name": team.name if team else team_id,
        "remaining_budget": team.remaining_budget if team else 0,
        "roster_needs": [n.model_dump() for n in needs],
    }


@router.post("/save")
async def save_state():
    """Save draft state to JSON file."""
    try:
        filepath = _save_draft_state()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "saved", "filepath": filepath}


@router.post("/load")
async def load_state():
    """Load draft state from JSON file."""
    try:
        state = _load_draft_state()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return state.model_dump(mode="json")


async def websocket_endpoint(websocket: WebSocket) -> None:
    """WebSocket endpoint for real-time draft updates."""
    await websocket.accept()
    _ws_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()  # Keep alive
    except Exception:
        if websocket in _ws_connections:
            _ws_connections.remove(websocket)
