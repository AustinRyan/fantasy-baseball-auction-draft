"""Tests for roster slot assignment (bipartite matching) and inflation calculation."""

from __future__ import annotations

import pytest

from app.models.player import Player, HittingProjection, PitchingProjection, PreBidRange
from app.services.recommendation_engine import (
    _assign_players_to_slots,
    check_roster_fit,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_hitter(name: str, positions: list[str], dollar_value: float = 10.0) -> Player:
    return Player(
        id=f"test_{name.lower().replace(' ', '_')}",
        name=name,
        team="NYY",
        positions=positions,
        is_hitter=True,
        hitting=HittingProjection(PA=500, HR=20, R=80, RBI=80, SB=5, BA=0.270, OBP=0.340),
        dollar_value=dollar_value,
        inflated_value=dollar_value,
    )


def _make_pitcher(name: str, dollar_value: float = 10.0) -> Player:
    return Player(
        id=f"test_{name.lower().replace(' ', '_')}",
        name=name,
        team="NYY",
        positions=["SP"],
        is_hitter=False,
        pitching=PitchingProjection(IP=180, W=12, SV=0, K=200, ERA=3.50, WHIP=1.15),
        dollar_value=dollar_value,
        inflated_value=dollar_value,
    )


# ---------------------------------------------------------------------------
# Slot Assignment Tests
# ---------------------------------------------------------------------------


class TestSlotAssignment:
    """Test the bipartite matching slot assignment algorithm."""

    def test_single_ss_goes_to_ss_slot(self):
        roster = [_make_hitter("Player A", ["SS"])]
        result = _assign_players_to_slots(roster)
        assert "Player A" in result["SS"]

    def test_two_ss_fill_ss_and_mi(self):
        roster = [
            _make_hitter("Henderson", ["SS"]),
            _make_hitter("Witt", ["SS"]),
        ]
        result = _assign_players_to_slots(roster)
        ss_and_mi = result["SS"] + result["MI"]
        assert "Henderson" in ss_and_mi
        assert "Witt" in ss_and_mi

    def test_three_ss_with_of_player_triggers_swap(self):
        """Key scenario: 3 SS + 1 OF player.  Algorithm must assign
        the OF player to OF (not U) so that the 3rd SS can use U."""
        roster = [
            _make_hitter("Henderson", ["SS"]),
            _make_hitter("Witt", ["SS"]),
            _make_hitter("Stanton", ["OF"]),  # OF can fill OF or U
            _make_hitter("Seager", ["SS"]),
        ]
        result = _assign_players_to_slots(roster)

        # All 4 players should be assigned
        total = sum(len(v) for v in result.values())
        assert total == 4, f"Expected 4 assigned, got {total}: {result}"

        ss_mi_u = result["SS"] + result["MI"] + result["U"]
        assert "Henderson" in ss_mi_u
        assert "Witt" in ss_mi_u
        assert "Seager" in ss_mi_u
        assert "Stanton" in result["OF"]

    def test_dh_only_player_locked_to_utility(self):
        """A DH-only player can only fill the U slot."""
        roster = [
            _make_hitter("Henderson", ["SS"]),
            _make_hitter("Witt", ["SS"]),
            _make_hitter("Stanton DH", ["DH"]),  # DH → only U
            _make_hitter("Seager", ["SS"]),
        ]
        result = _assign_players_to_slots(roster)

        # Stanton (DH) locks U, so only SS and MI remain for the three SS.
        # 3 SS players + 1 DH = 4 players but only SS, MI, U, (and U is
        # taken by DH).  3 SS need 3 of {SS, MI, U} but U is locked.
        # → only 2 SS fit (SS + MI) plus Stanton in U = 3 assigned.
        total = sum(len(v) for v in result.values())
        assert total == 3, f"Expected 3 assigned (4th SS overflows), got {total}"
        assert "Stanton DH" in result["U"]

    def test_four_ss_exceeds_capacity(self):
        """4 SS players can only fill SS, MI, U = 3 slots max."""
        roster = [
            _make_hitter("SS1", ["SS"]),
            _make_hitter("SS2", ["SS"]),
            _make_hitter("SS3", ["SS"]),
            _make_hitter("SS4", ["SS"]),
        ]
        result = _assign_players_to_slots(roster)
        total = sum(len(v) for v in result.values())
        assert total == 3, f"Expected 3 (SS, MI, U), got {total}"

    def test_corner_infielders_fill_ci(self):
        """1B and 3B can each fill CI."""
        roster = [
            _make_hitter("First Baseman", ["1B"]),
            _make_hitter("Third Baseman", ["3B"]),
            _make_hitter("Extra 1B", ["1B"]),
        ]
        result = _assign_players_to_slots(roster)
        total = sum(len(v) for v in result.values())
        assert total == 3  # 1B, 3B, CI (or 1B, CI, U etc.)
        all_names = [n for names in result.values() for n in names]
        assert "First Baseman" in all_names
        assert "Third Baseman" in all_names
        assert "Extra 1B" in all_names

    def test_pitcher_fills_p_slot(self):
        roster = [_make_pitcher("Ace")]
        result = _assign_players_to_slots(roster)
        assert "Ace" in result["P"]

    def test_mixed_roster_all_fit(self):
        """A realistic mini-roster: C, SS, OF, SP should all fit."""
        roster = [
            _make_hitter("Catcher", ["C"]),
            _make_hitter("Shortstop", ["SS"]),
            _make_hitter("Outfielder", ["OF"]),
            _make_pitcher("Starter"),
        ]
        result = _assign_players_to_slots(roster)
        total = sum(len(v) for v in result.values())
        assert total == 4

    def test_of_prefers_of_slot_over_utility(self):
        """OF player should be assigned to OF slot, not U, when OF is open."""
        roster = [_make_hitter("Judge", ["OF"])]
        result = _assign_players_to_slots(roster)
        assert "Judge" in result["OF"]
        assert "Judge" not in result["U"]

    def test_complex_swap_chain(self):
        """2B in MI, SS tries to take MI → 2B should move to 2B slot."""
        roster = [
            _make_hitter("2B Player", ["2B"]),
            _make_hitter("SS Player1", ["SS"]),
            _make_hitter("SS Player2", ["SS"]),
        ]
        result = _assign_players_to_slots(roster)
        total = sum(len(v) for v in result.values())
        assert total == 3
        # 2B should be in 2B, SS in SS, SS in MI (or equivalent valid assignment)
        all_assigned = [n for names in result.values() for n in names]
        assert "2B Player" in all_assigned
        assert "SS Player1" in all_assigned
        assert "SS Player2" in all_assigned


# ---------------------------------------------------------------------------
# check_roster_fit Tests (require the full app context with player store)
# ---------------------------------------------------------------------------


class TestCheckRosterFit:
    """Test the roster-fit check used for the position-limit warning.

    These tests mock the player store / league so we can test in isolation.
    """

    def test_fit_check_uses_matching(self, monkeypatch):
        """Verify check_roster_fit uses the optimal matching algorithm."""
        from app.services import recommendation_engine as mod

        henderson = _make_hitter("Henderson", ["SS"])
        witt = _make_hitter("Witt", ["SS"])
        stanton_of = _make_hitter("Stanton", ["OF"])
        seager = _make_hitter("Seager", ["SS"])

        class FakeTeam:
            id = "team_1"
            keepers = []
            draft_picks = ["test_henderson", "test_witt", "test_stanton"]

        class FakeLeague:
            teams = [FakeTeam()]
            def get_team(self, tid):
                return FakeTeam() if tid == "team_1" else None

        player_store = {
            henderson.id: henderson,
            witt.id: witt,
            stanton_of.id: stanton_of,
            seager.id: seager,
        }

        monkeypatch.setattr(mod, "get_league", lambda: FakeLeague())
        monkeypatch.setattr(mod, "get_players", lambda: player_store)
        monkeypatch.setattr(mod, "get_player", lambda pid: player_store.get(pid))

        result = mod.check_roster_fit("team_1", seager.id)
        # Stanton is OF → can move to OF, freeing U for Seager
        assert result["fits"] is True, f"Expected fits=True but got: {result}"

    def test_fit_fails_with_dh_only_stanton(self, monkeypatch):
        """DH-only Stanton locks U; 3rd SS can't fit."""
        from app.services import recommendation_engine as mod

        henderson = _make_hitter("Henderson", ["SS"])
        witt = _make_hitter("Witt", ["SS"])
        stanton_dh = _make_hitter("Stanton", ["DH"])  # DH only!
        seager = _make_hitter("Seager", ["SS"])

        class FakeTeam:
            id = "team_1"
            keepers = []
            draft_picks = ["test_henderson", "test_witt", "test_stanton"]

        class FakeLeague:
            teams = [FakeTeam()]
            def get_team(self, tid):
                return FakeTeam() if tid == "team_1" else None

        player_store = {
            henderson.id: henderson,
            witt.id: witt,
            stanton_dh.id: stanton_dh,
            seager.id: seager,
        }

        monkeypatch.setattr(mod, "get_league", lambda: FakeLeague())
        monkeypatch.setattr(mod, "get_players", lambda: player_store)
        monkeypatch.setattr(mod, "get_player", lambda pid: player_store.get(pid))

        result = mod.check_roster_fit("team_1", seager.id)
        assert result["fits"] is False, f"Expected fits=False but got: {result}"
        assert "warning" in result
