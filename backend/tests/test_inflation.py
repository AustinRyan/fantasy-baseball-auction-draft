"""Tests for draft inflation calculation stability."""

from __future__ import annotations

import pytest

from app.config import league_config
from app.models.player import Player, HittingProjection, PreBidRange
from app.models.league import League, Team, Keeper
from app.services.draft_tracker import (
    _recalculate_values,
    get_draft_state,
    _draft_state,
)
from app.models.draft import DraftPick, DraftState


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hitter(pid: str, name: str, dollar_value: float, is_keeper: bool = False) -> Player:
    return Player(
        id=pid,
        name=name,
        team="NYY",
        positions=["OF"],
        is_hitter=True,
        hitting=HittingProjection(PA=500, HR=20, R=80, RBI=80, SB=5, BA=0.270, OBP=0.340),
        dollar_value=dollar_value,
        inflated_value=dollar_value,
        is_keeper=is_keeper,
    )


def _filler(pid: str) -> Player:
    """$1 minimum player below replacement level."""
    return Player(
        id=pid,
        name=f"Filler {pid}",
        team="NYY",
        positions=["OF"],
        is_hitter=True,
        hitting=HittingProjection(PA=50),
        dollar_value=1.0,
        inflated_value=1.0,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestInflationCalculation:
    """Verify inflation math is stable and correct."""

    def setup_method(self):
        """Reset draft state before each test."""
        import app.services.draft_tracker as dt
        dt._draft_state = DraftState()

    def test_no_keepers_no_fillers_inflation_is_one(self, monkeypatch):
        """With no keepers and all meaningful players, inflation ≈ 1.0."""
        # Create exactly enough meaningful players to fill all roster spots
        total_roster = league_config.total_players_drafted  # 264
        per_player_value = league_config.total_budget / total_roster  # ~$11.25 each

        players = {}
        for i in range(total_roster):
            p = _hitter(f"p{i}", f"Player {i}", per_player_value)
            players[p.id] = p

        league = League(teams=[Team(id=f"team_{i+1}", name=f"T{i+1}") for i in range(11)])

        monkeypatch.setattr("app.services.draft_tracker.get_players", lambda: players)
        monkeypatch.setattr("app.services.draft_tracker.get_league", lambda: league)

        _recalculate_values()

        state = get_draft_state()
        assert abs(state.current_inflation_rate - 1.0) < 0.01, (
            f"Expected inflation ≈ 1.0, got {state.current_inflation_rate}"
        )

    def test_filler_players_dont_cause_deflation(self, monkeypatch):
        """Adding many $1 filler players should NOT cause deflation."""
        total_roster = league_config.total_players_drafted  # 264
        budget = league_config.total_budget  # $2970

        # 200 meaningful + 300 fillers
        players = {}
        per_value = budget / 200  # $14.85 each
        for i in range(200):
            p = _hitter(f"m{i}", f"Meaningful {i}", per_value)
            players[p.id] = p
        for i in range(300):
            f = _filler(f"f{i}")
            players[f.id] = f

        league = League(teams=[Team(id=f"team_{i+1}", name=f"T{i+1}") for i in range(11)])

        monkeypatch.setattr("app.services.draft_tracker.get_players", lambda: players)
        monkeypatch.setattr("app.services.draft_tracker.get_league", lambda: league)

        _recalculate_values()

        state = get_draft_state()
        # With 264 spots and 200 meaningful players, top 200 fill 200 spots
        # plus 64 fillers.  Budget covers 200 meaningful + 64*$1.
        # inflation = (2970 - 64) / (200 * 14.85) = 2906 / 2970 ≈ 0.978
        # This is acceptable: slight deflation because filler spots cost $1 each.
        # But critically: inflation should NOT be far below 1.0.
        assert state.current_inflation_rate >= 0.95, (
            f"Inflation {state.current_inflation_rate} is too low — filler dilution bug"
        )
        assert state.current_inflation_rate <= 1.1, (
            f"Inflation {state.current_inflation_rate} is unexpectedly high"
        )

    def test_keepers_cause_inflation(self, monkeypatch):
        """Keepers at below-market salaries should cause inflation > 1.0."""
        budget = league_config.total_budget  # $2970
        total_roster = league_config.total_players_drafted  # 264

        players = {}
        # 10 keepers: $30 value, $10 salary each → big surplus
        keepers = []
        for i in range(10):
            p = _hitter(f"k{i}", f"Keeper {i}", 30.0, is_keeper=True)
            p.keeper_salary = 10
            players[p.id] = p
            keepers.append(Keeper(player_id=p.id, player_name=p.name, salary=10))

        # 254 regular players to fill remaining spots
        remaining_value = budget - 10 * 30.0  # $2670
        per_value = remaining_value / 254  # ~$10.51 each
        for i in range(254):
            p = _hitter(f"r{i}", f"Regular {i}", per_value)
            players[p.id] = p

        team1 = Team(id="team_1", name="T1", keepers=keepers)
        teams = [team1] + [Team(id=f"team_{i+2}", name=f"T{i+2}") for i in range(10)]
        league = League(teams=teams)

        monkeypatch.setattr("app.services.draft_tracker.get_players", lambda: players)
        monkeypatch.setattr("app.services.draft_tracker.get_league", lambda: league)

        _recalculate_values()

        state = get_draft_state()
        # remaining_budget = 2970 - 100 (keeper salary) = 2870
        # remaining_spots = 264 - 10 = 254
        # pool_value = sum of top 254 non-keeper players = 254 * 10.51 = 2670
        # inflation = 2870 / 2670 = 1.075
        assert state.current_inflation_rate > 1.0, (
            f"Expected inflation > 1.0 with below-market keepers, got {state.current_inflation_rate}"
        )

    def test_single_pick_barely_changes_inflation(self, monkeypatch):
        """Drafting one player at inflated value should barely change inflation."""
        import app.services.draft_tracker as dt

        budget = league_config.total_budget  # $2970
        total_roster = league_config.total_players_drafted  # 264

        players = {}
        per_value = budget / total_roster  # ~$11.25
        for i in range(total_roster):
            p = _hitter(f"p{i}", f"Player {i}", per_value)
            players[p.id] = p

        league = League(teams=[Team(id=f"team_{i+1}", name=f"T{i+1}") for i in range(11)])

        monkeypatch.setattr("app.services.draft_tracker.get_players", lambda: players)
        monkeypatch.setattr("app.services.draft_tracker.get_league", lambda: league)

        # Get initial inflation
        _recalculate_values()
        initial_inflation = dt._draft_state.current_inflation_rate

        # Simulate one pick at inflated value
        picked = players["p0"]
        picked.is_drafted = True
        picked.draft_team_id = "team_1"
        picked.draft_price = round(picked.inflated_value)
        dt._draft_state.picks.append(DraftPick(
            id="pick1",
            player_id="p0",
            player_name="Player 0",
            team_id="team_1",
            price=round(picked.inflated_value),
        ))
        league.teams[0].budget_spent = round(picked.inflated_value)

        _recalculate_values()
        new_inflation = dt._draft_state.current_inflation_rate

        change = abs(new_inflation - initial_inflation)
        assert change < 0.02, (
            f"Inflation changed by {change:.4f} after one pick "
            f"({initial_inflation:.4f} → {new_inflation:.4f}). "
            "Expected < 0.02."
        )

    def test_overpay_decreases_inflation_slightly(self, monkeypatch):
        """Overpaying should decrease inflation, but only slightly."""
        import app.services.draft_tracker as dt

        budget = league_config.total_budget
        total_roster = league_config.total_players_drafted

        players = {}
        per_value = budget / total_roster
        for i in range(total_roster):
            p = _hitter(f"p{i}", f"Player {i}", per_value)
            players[p.id] = p

        league = League(teams=[Team(id=f"team_{i+1}", name=f"T{i+1}") for i in range(11)])

        monkeypatch.setattr("app.services.draft_tracker.get_players", lambda: players)
        monkeypatch.setattr("app.services.draft_tracker.get_league", lambda: league)

        _recalculate_values()
        initial_inflation = dt._draft_state.current_inflation_rate

        # Overpay by 50%
        picked = players["p0"]
        overpay_price = round(picked.inflated_value * 1.5)
        picked.is_drafted = True
        picked.draft_team_id = "team_1"
        picked.draft_price = overpay_price
        dt._draft_state.picks.append(DraftPick(
            id="pick1",
            player_id="p0",
            player_name="Player 0",
            team_id="team_1",
            price=overpay_price,
        ))
        league.teams[0].budget_spent = overpay_price

        _recalculate_values()
        new_inflation = dt._draft_state.current_inflation_rate

        # Inflation should decrease (less money for remaining players)
        assert new_inflation < initial_inflation, (
            f"Overpay should decrease inflation: {initial_inflation:.4f} → {new_inflation:.4f}"
        )
        # But not by a lot (single pick out of 264)
        drop = initial_inflation - new_inflation
        assert drop < 0.05, (
            f"Inflation dropped by {drop:.4f} — too much for one pick"
        )
