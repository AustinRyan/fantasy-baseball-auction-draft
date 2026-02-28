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
    from .services.keeper_manager import initialize_league
    from .services.projection_loader import load_persisted_projections
    initialize_league()
    loaded = load_persisted_projections()
    if loaded:
        logger.info(f"Auto-loaded {loaded} players from saved projections")
    yield


app = FastAPI(
    title="Fantasy Baseball Auction Draft Tool",
    description="Potomac Valley Rotisserie League - AL-only 11-team keeper auction",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
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
