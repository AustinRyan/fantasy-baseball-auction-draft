"""Valuation calculation endpoints."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from ..config import league_config
from ..services.breakout_predictor import calculate_all_breakouts
from ..services.keeper_manager import calculate_inflation, link_keepers_to_players
from ..services.projection_loader import get_players
from ..services.sgp_calculator import calculate_all_sgp
from ..services.valuation_engine import calculate_dollar_values

router = APIRouter()


@router.post("/calculate")
async def calculate_valuations(inflation_rate: Optional[float] = None):
    """Run full SGP + dollar value calculation pipeline.

    If inflation_rate is not provided, it is auto-computed from keeper data.
    """
    players = get_players()
    if not players:
        return {"error": "No players loaded. Upload projections first."}

    # Step 1: Link keepers to players (fuzzy match names)
    link_keepers_to_players()

    # Step 2: Calculate base SGP values
    calculate_all_sgp(players, league_config)

    # Step 3: Calculate base dollar values (no inflation yet)
    calculate_dollar_values(players, league_config, inflation_rate=1.0)

    # Step 4: Compute inflation from keeper salaries vs projected values
    if inflation_rate is None:
        inflation_data = calculate_inflation()
        inflation_rate = inflation_data["inflation_rate"]

    # Step 5: Recalculate with inflation applied
    if inflation_rate != 1.0:
        calculate_dollar_values(players, league_config, inflation_rate=inflation_rate)

    # Step 6: Breakout predictions
    calculate_all_breakouts(players)

    hitters = [p for p in players.values() if p.is_hitter]
    pitchers = [p for p in players.values() if not p.is_hitter]

    return {
        "message": "Valuations calculated",
        "hitter_count": len(hitters),
        "pitcher_count": len(pitchers),
        "inflation_rate": inflation_rate,
        "top_hitters": [
            {"name": p.name, "value": p.dollar_value, "inflated": p.inflated_value}
            for p in sorted(hitters, key=lambda x: x.dollar_value, reverse=True)[:10]
        ],
        "top_pitchers": [
            {"name": p.name, "value": p.dollar_value, "inflated": p.inflated_value}
            for p in sorted(pitchers, key=lambda x: x.dollar_value, reverse=True)[:10]
        ],
    }


@router.get("/results")
async def get_valuation_results(
    sort_by: str = Query("inflated_value", description="Sort field"),
    descending: bool = True,
    position: Optional[str] = None,
    is_hitter: Optional[bool] = None,
    min_value: Optional[float] = None,
    search: Optional[str] = None,
):
    """Get all player values with pre-bid ranges."""
    players = list(get_players().values())

    if position:
        players = [p for p in players if position in p.positions]
    if is_hitter is not None:
        players = [p for p in players if p.is_hitter == is_hitter]
    if min_value is not None:
        players = [p for p in players if p.inflated_value >= min_value]
    if search:
        search_lower = search.lower()
        players = [p for p in players if search_lower in p.name.lower()]

    # Sort
    sort_key = lambda p: getattr(p, sort_by, 0) or 0
    players.sort(key=sort_key, reverse=descending)

    return {
        "players": [p.model_dump() for p in players],
        "count": len(players),
    }
