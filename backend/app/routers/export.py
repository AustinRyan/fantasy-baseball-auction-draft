"""Export endpoints for pre-draft spreadsheets."""

from __future__ import annotations

import io
from typing import Optional

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

import pandas as pd

from ..services.projection_loader import get_players

router = APIRouter()


@router.get("/pre-draft")
async def export_pre_draft(
    format: str = Query("csv", description="Export format: 'csv' or 'xlsx'"),
):
    """Export pre-draft spreadsheet sorted by inflated value descending.

    Columns: Name, Team, Positions, Dollar Value, Inflated Value,
    Steal Below, Fair Low, Fair High, Overpay Above,
    Breakout Label, Breakout Score
    """
    players = get_players()
    if not players:
        return {"error": "No players loaded. Upload projections and run valuations first."}

    # Build rows sorted by inflated value descending
    sorted_players = sorted(players.values(), key=lambda p: p.inflated_value, reverse=True)

    rows = []
    for p in sorted_players:
        pbr = p.pre_bid_range
        bo = p.breakout
        rows.append({
            "Name": p.name,
            "Team": p.team,
            "Positions": ", ".join(p.positions) if p.positions else "",
            "Dollar Value": p.dollar_value,
            "Inflated Value": p.inflated_value,
            "Steal Below": pbr.steal_below if pbr else None,
            "Fair Low": pbr.fair_low if pbr else None,
            "Fair High": pbr.fair_high if pbr else None,
            "Overpay Above": pbr.overpay_above if pbr else None,
            "Breakout Label": bo.label if bo else None,
            "Breakout Score": bo.score if bo else None,
        })

    df = pd.DataFrame(rows)

    if format.lower() == "xlsx":
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Pre-Draft")
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=pre_draft.xlsx"},
        )
    else:
        buf = io.StringIO()
        df.to_csv(buf, index=False)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=pre_draft.csv"},
        )
