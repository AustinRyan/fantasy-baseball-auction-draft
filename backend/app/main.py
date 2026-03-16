"""FastAPI entry point for Fantasy Baseball Auction Draft Tool."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import projections, valuations, keepers, draft, export


@asynccontextmanager
async def lifespan(app: FastAPI):
    import logging
    logger = logging.getLogger(__name__)
    from .services.keeper_manager import initialize_league, load_keepers
    from .services.projection_loader import load_persisted_projections, load_nl_keeper_players
    from .services.draft_tracker import load_draft_state
    initialize_league()
    keepers_loaded = load_keepers()
    if keepers_loaded:
        logger.info(f"Auto-loaded {keepers_loaded} keepers from saved state")
    loaded = load_persisted_projections()
    if loaded:
        logger.info(f"Auto-loaded {loaded} players from saved projections")
    nl_loaded = load_nl_keeper_players()
    if nl_loaded:
        logger.info(f"Auto-loaded {nl_loaded} NL keeper-eligible players")

    # Auto-run full valuation pipeline so values are ready immediately
    if loaded or nl_loaded:
        from .services.projection_loader import get_players
        from .services.keeper_manager import link_keepers_to_players, calculate_inflation
        from .services.sgp_calculator import calculate_all_sgp
        from .services.valuation_engine import calculate_dollar_values
        from .services.breakout_predictor import calculate_all_breakouts, apply_keeper_premiums
        from .config import league_config

        players = get_players()
        link_keepers_to_players()
        calculate_all_sgp(players, league_config)
        calculate_dollar_values(players, league_config, inflation_rate=1.0)
        inflation_data = calculate_inflation()
        inflation_rate = inflation_data["inflation_rate"]
        if inflation_rate != 1.0:
            calculate_dollar_values(players, league_config, inflation_rate=inflation_rate)
        calculate_all_breakouts(players, min_pa=league_config.min_pa, min_ip=league_config.min_ip)
        apply_keeper_premiums(players)
        logger.info(f"Auto-calculated valuations: {len(players)} players, inflation={inflation_rate:.4f}")

    # Auto-load draft state if a saved file exists
    try:
        draft_state = load_draft_state()
        if draft_state.picks:
            logger.info(f"Auto-loaded draft state with {len(draft_state.picks)} picks")
    except FileNotFoundError:
        pass
    yield


app = FastAPI(
    title="Fantasy Baseball Auction Draft Tool",
    description="Potomac Valley Rotisserie League - AL-only 11-team keeper auction",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projections.router, prefix="/api/projections", tags=["projections"])
app.include_router(valuations.router, prefix="/api/valuations", tags=["valuations"])
app.include_router(keepers.router, prefix="/api/keepers", tags=["keepers"])
app.include_router(draft.router, prefix="/api/draft", tags=["draft"])
app.include_router(export.router, prefix="/api/export", tags=["export"])

# WebSocket route for real-time draft updates
from .routers.draft import websocket_endpoint
app.add_api_websocket_route("/ws/draft", websocket_endpoint)


@app.get("/api/health")
def health():
    return {"status": "ok"}
