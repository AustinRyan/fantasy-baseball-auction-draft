"""Fetch player news and IL status from the free MLB Stats API."""

from __future__ import annotations

import json
import logging
import time
import urllib.request
from typing import Optional

logger = logging.getLogger(__name__)

# Simple in-memory cache: {cache_key: (timestamp, data)}
_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 600  # 10 minutes


def _fetch_json(url: str, timeout: int = 8) -> Optional[dict]:
    """Fetch JSON from MLB Stats API."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "FantasyBaseballTool/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        logger.warning(f"MLB API fetch failed: {url} — {e}")
        return None


def _get_cached(key: str) -> Optional[dict]:
    """Get cached result if still valid."""
    if key in _cache:
        ts, data = _cache[key]
        if time.time() - ts < _CACHE_TTL:
            return data
    return None


def _set_cached(key: str, data: dict) -> None:
    _cache[key] = (time.time(), data)


def search_player_id(name: str) -> Optional[int]:
    """Look up MLB player ID by name."""
    cache_key = f"search:{name.lower()}"
    cached = _get_cached(cache_key)
    if cached:
        return cached.get("id")

    encoded = urllib.request.quote(name)
    data = _fetch_json(f"https://statsapi.mlb.com/api/v1/people/search?names={encoded}")
    if not data or not data.get("people"):
        return None

    # Return first active match, or first match
    for person in data["people"]:
        if person.get("active", False):
            pid = person["id"]
            _set_cached(cache_key, {"id": pid})
            return pid

    pid = data["people"][0]["id"]
    _set_cached(cache_key, {"id": pid})
    return pid


def get_player_news(player_name: str) -> dict:
    """Get recent transactions and IL status for a player.

    Returns dict with:
    - player_id: MLB ID
    - status: current roster status (Active, IL-10, IL-60, etc.)
    - transactions: list of recent transactions with date + description
    - age: current age
    - debut: MLB debut date
    """
    cache_key = f"news:{player_name.lower()}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    # Step 1: Resolve name to MLB ID
    player_id = search_player_id(player_name)
    if not player_id:
        result = {
            "player_id": None,
            "status": "Unknown",
            "transactions": [],
            "error": "Player not found in MLB database",
        }
        _set_cached(cache_key, result)
        return result

    # Step 2: Get player info
    player_data = _fetch_json(f"https://statsapi.mlb.com/api/v1/people/{player_id}?hydrate=currentTeam")
    player_info = {}
    if player_data and player_data.get("people"):
        p = player_data["people"][0]
        player_info = {
            "age": p.get("currentAge"),
            "debut": p.get("mlbDebutDate"),
            "bat_side": p.get("batSide", {}).get("description"),
            "throw_hand": p.get("pitchHand", {}).get("description"),
            "birth_date": p.get("birthDate"),
            "height": p.get("height"),
            "weight": p.get("weight"),
            "current_team": p.get("currentTeam", {}).get("name"),
        }

    # Step 3: Get recent transactions (last ~4 months)
    from datetime import datetime, timedelta
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=120)).strftime("%Y-%m-%d")

    transactions = []
    tx_data = _fetch_json(
        f"https://statsapi.mlb.com/api/v1/transactions?playerId={player_id}"
        f"&startDate={start_date}&endDate={end_date}"
    )
    if tx_data and tx_data.get("transactions"):
        for tx in tx_data["transactions"][:10]:  # Last 10
            transactions.append({
                "date": tx.get("date", ""),
                "type": tx.get("typeDesc", ""),
                "description": tx.get("description", ""),
            })

    # Step 4: Determine current status from most recent status change
    status = "Active"
    for tx in transactions:
        desc = tx.get("description", "").lower()
        if "placed" in desc and "injured list" in desc:
            if "60-day" in desc:
                status = "IL-60"
            elif "15-day" in desc:
                status = "IL-15"
            elif "10-day" in desc:
                status = "IL-10"
            else:
                status = "IL"
            break
        elif "activated" in desc and "injured list" in desc:
            status = "Active"
            break
        elif "designated for assignment" in desc:
            status = "DFA"
            break
        elif "released" in desc:
            status = "Released"
            break
        elif "traded" in desc or "acquired" in desc:
            status = "Active"
            break
        elif "optioned" in desc:
            status = "Minors"
            break
        elif "recalled" in desc or "selected" in desc:
            status = "Active"
            break

    result = {
        "player_id": player_id,
        "status": status,
        "transactions": transactions,
        **player_info,
    }
    _set_cached(cache_key, result)
    return result
