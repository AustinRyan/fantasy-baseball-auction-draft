"""Unit tests for scouting board service."""

from __future__ import annotations

import json
import pytest
from pathlib import Path
from unittest.mock import patch

from app.models.scouting import ScoutingCandidate
from app.services import scouting_service


@pytest.fixture(autouse=True)
def reset_board(tmp_path):
    """Reset board state and redirect save path for each test."""
    scouting_service._board = []
    scouting_service._SAVE_PATH = tmp_path / "scouting_board.json"
    yield


def test_add_candidate():
    c = scouting_service.add_candidate("p1", "breakout", 3, 5, "test note")
    assert c.player_id == "p1"
    assert c.signal == "breakout"
    assert len(scouting_service.get_scouting_board()) == 1


def test_add_duplicate_raises():
    scouting_service.add_candidate("p1", "breakout", 3, 5, "note")
    with pytest.raises(ValueError, match="already on"):
        scouting_service.add_candidate("p1", "value_trap", 0, 10, "other")


def test_update_candidate():
    scouting_service.add_candidate("p1", "breakout", 3, 5, "old note")
    updated = scouting_service.update_candidate("p1", narrative="new note", signal="bounce_back")
    assert updated.narrative == "new note"
    assert updated.signal == "bounce_back"
    assert updated.target_bid_low == 3  # unchanged


def test_update_missing_raises():
    with pytest.raises(ValueError, match="not on"):
        scouting_service.update_candidate("missing", narrative="x")


def test_remove_candidate():
    scouting_service.add_candidate("p1", "breakout", 3, 5, "note")
    assert scouting_service.remove_candidate("p1") is True
    assert len(scouting_service.get_scouting_board()) == 0


def test_remove_missing_returns_false():
    assert scouting_service.remove_candidate("missing") is False


def test_save_and_load():
    scouting_service.add_candidate("p1", "breakout", 3, 5, "note")
    scouting_service.add_candidate("p2", "value_trap", 0, 20, "avoid")
    scouting_service.save_board()

    scouting_service._board = []
    loaded = scouting_service.load_board()
    assert len(loaded) == 2
    assert loaded[0].player_id == "p1"
    assert loaded[1].signal == "value_trap"


def test_load_creates_default_when_no_file():
    board = scouting_service.load_board()
    assert len(board) == 26  # 10 breakout + 6 bounce-back + 5 value trap + 5 overpay risk


def test_default_board_has_all_signals():
    defaults = scouting_service.get_default_board()
    signals = {c.signal for c in defaults}
    assert signals == {"breakout", "bounce_back", "value_trap", "overpay_risk"}


def test_default_board_avoid_signals_have_zero_low():
    defaults = scouting_service.get_default_board()
    for c in defaults:
        if c.signal in ("value_trap", "overpay_risk"):
            assert c.target_bid_low == 0, f"{c.player_id} should have target_bid_low=0"
