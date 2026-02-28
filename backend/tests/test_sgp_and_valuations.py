"""Unit tests for SGP calculation and dollar value conversion."""

import csv
import io
import pytest

from app.config import LeagueConfig
from app.models.player import Player, HittingProjection, PitchingProjection
from app.services.sgp_calculator import (
    calculate_sgp_hitting,
    calculate_sgp_pitching,
    calculate_player_sgp,
    calculate_all_sgp,
)
from app.services.valuation_engine import calculate_dollar_values
from app.services.breakout_predictor import score_breakout
from app.services.projection_loader import load_projections_csv, clear_players


@pytest.fixture
def config():
    return LeagueConfig()


@pytest.fixture
def elite_hitter():
    return Player(
        id="1", name="Aaron Judge", team="NYY",
        positions=["OF"], is_hitter=True,
        hitting=HittingProjection(
            PA=600, AB=530, H=155, HR=45, R=105, RBI=110,
            SB=5, CS=2, BB=65, SO=170, BA=0.292,
        ),
    )


@pytest.fixture
def avg_hitter():
    return Player(
        id="2", name="Average Hitter", team="BAL",
        positions=["1B"], is_hitter=True,
        hitting=HittingProjection(
            PA=550, AB=490, H=127, HR=18, R=65, RBI=68,
            SB=3, CS=2, BB=50, SO=120, BA=0.259,
        ),
    )


@pytest.fixture
def elite_pitcher():
    return Player(
        id="3", name="Gerrit Cole", team="NYY",
        positions=["SP"], is_hitter=False,
        pitching=PitchingProjection(
            IP=195, W=14, L=5, SV=0, K=230, BB=40,
            H=150, ER=55, HR=20, ERA=2.54, WHIP=0.97,
        ),
    )


@pytest.fixture
def avg_pitcher():
    return Player(
        id="4", name="Average Pitcher", team="BOS",
        positions=["SP"], is_hitter=False,
        pitching=PitchingProjection(
            IP=160, W=9, L=8, SV=0, K=140, BB=50,
            H=155, ER=72, HR=18, ERA=4.05, WHIP=1.28,
        ),
    )


@pytest.fixture
def closer():
    return Player(
        id="5", name="Good Closer", team="CLE",
        positions=["RP"], is_hitter=False,
        pitching=PitchingProjection(
            IP=65, W=4, L=3, SV=35, K=75, BB=18,
            H=50, ER=20, HR=7, ERA=2.77, WHIP=1.05,
        ),
    )


class TestSGPHitting:
    def test_elite_hitter_sgp(self, elite_hitter, config):
        sgp = calculate_sgp_hitting(elite_hitter, config)
        assert sgp["HR"] == pytest.approx(45 / 8.0)
        assert sgp["R"] == pytest.approx(105 / 22.0)
        assert sgp["RBI"] == pytest.approx(110 / 22.0)
        assert sgp["SB"] == pytest.approx(5 / 8.0)
        # BA SGP should be positive for above-average hitter
        assert sgp["BA"] > 0

    def test_avg_hitter_sgp(self, avg_hitter, config):
        sgp = calculate_sgp_hitting(avg_hitter, config)
        # Below .260 BA should give slightly negative BA SGP
        assert sgp["BA"] < 0

    def test_total_sgp(self, elite_hitter, config):
        calculate_player_sgp(elite_hitter, config)
        # Elite hitter should have significant positive SGP
        assert elite_hitter.sgp > 5

    def test_no_hitting_projection(self, config):
        player = Player(id="x", name="Nobody", team="NYY", is_hitter=True)
        sgp = calculate_sgp_hitting(player, config)
        assert sgp == {}


class TestSGPPitching:
    def test_elite_pitcher_sgp(self, elite_pitcher, config):
        sgp = calculate_sgp_pitching(elite_pitcher, config)
        assert sgp["W"] == pytest.approx(14 / 3.0)
        assert sgp["K"] == pytest.approx(230 / 30.0)
        # ERA well below baseline (4.00) should give positive SGP
        assert sgp["ERA"] > 0
        # WHIP well below baseline (1.30) should give positive SGP
        assert sgp["WHIP"] > 0

    def test_avg_pitcher_era(self, avg_pitcher, config):
        sgp = calculate_sgp_pitching(avg_pitcher, config)
        # ERA right at baseline (4.05 vs 4.00) should be near zero but slightly negative
        assert abs(sgp["ERA"]) < 1

    def test_closer_saves_sgp(self, closer, config):
        sgp = calculate_sgp_pitching(closer, config)
        assert sgp["SV"] == pytest.approx(35 / 7.0)


class TestDollarValues:
    def _make_player_pool(self, elite_hitter, avg_hitter, elite_pitcher, avg_pitcher, closer):
        """Create a realistic-ish player pool for valuation testing."""
        players = {}
        # Add elite players
        for p in [elite_hitter, avg_hitter, elite_pitcher, avg_pitcher, closer]:
            calculate_player_sgp(p)
            players[p.id] = p

        # Generate filler hitters (enough for 11 teams * 14 hitters = 154)
        for i in range(160):
            filler = Player(
                id=f"h{i}", name=f"Hitter {i}", team="BAL",
                positions=["OF"], is_hitter=True,
                hitting=HittingProjection(
                    PA=400 - i, AB=360 - i, H=90 - i // 3,
                    HR=max(1, 12 - i // 10), R=max(10, 50 - i // 3),
                    RBI=max(10, 50 - i // 3), SB=max(0, 5 - i // 20),
                    BA=max(0.200, 0.260 - i * 0.0005),
                ),
            )
            calculate_player_sgp(filler)
            players[filler.id] = filler

        # Generate filler pitchers (enough for 11 teams * 10 pitchers = 110)
        for i in range(115):
            filler = Player(
                id=f"p{i}", name=f"Pitcher {i}", team="BOS",
                positions=["SP"], is_hitter=False,
                pitching=PitchingProjection(
                    IP=max(30, 150 - i), W=max(1, 8 - i // 15),
                    K=max(20, 120 - i), ERA=min(6.0, 3.80 + i * 0.015),
                    WHIP=min(1.8, 1.20 + i * 0.004),
                    H=max(30, 140 + i // 2), ER=max(10, 60 + i // 2),
                ),
            )
            calculate_player_sgp(filler)
            players[filler.id] = filler

        return players

    def test_elite_hitter_value_range(self, elite_hitter, avg_hitter, elite_pitcher, avg_pitcher, closer):
        players = self._make_player_pool(elite_hitter, avg_hitter, elite_pitcher, avg_pitcher, closer)
        calculate_dollar_values(players)

        # Elite hitter should be the most valuable hitter (synthetic pool has steep drop-off)
        assert elite_hitter.dollar_value > 30, f"Elite hitter value {elite_hitter.dollar_value} too low"

    def test_elite_pitcher_value_range(self, elite_hitter, avg_hitter, elite_pitcher, avg_pitcher, closer):
        players = self._make_player_pool(elite_hitter, avg_hitter, elite_pitcher, avg_pitcher, closer)
        calculate_dollar_values(players)

        # Elite pitcher should have significant value
        assert elite_pitcher.dollar_value > 15, f"Elite pitcher value {elite_pitcher.dollar_value} too low"

    def test_minimum_value_is_one(self, elite_hitter, avg_hitter, elite_pitcher, avg_pitcher, closer):
        players = self._make_player_pool(elite_hitter, avg_hitter, elite_pitcher, avg_pitcher, closer)
        calculate_dollar_values(players)

        for p in players.values():
            assert p.dollar_value >= 1.0, f"{p.name} has value below $1"

    def test_pre_bid_ranges(self, elite_hitter, avg_hitter, elite_pitcher, avg_pitcher, closer):
        players = self._make_player_pool(elite_hitter, avg_hitter, elite_pitcher, avg_pitcher, closer)
        calculate_dollar_values(players)

        r = elite_hitter.pre_bid_range
        assert r is not None
        assert r.steal_below < r.value_below <= r.fair_low
        assert r.fair_low < r.fair_high < r.overpay_above

    def test_inflation_multiplier(self, elite_hitter, avg_hitter, elite_pitcher, avg_pitcher, closer):
        players = self._make_player_pool(elite_hitter, avg_hitter, elite_pitcher, avg_pitcher, closer)
        calculate_dollar_values(players, inflation_rate=1.2)

        assert elite_hitter.inflated_value == pytest.approx(elite_hitter.dollar_value * 1.2, abs=0.2)


class TestBreakout:
    def test_young_hitter_upside(self):
        player = Player(
            id="young", name="Young Hitter", team="NYY",
            positions=["OF"], is_hitter=True,
            hitting=HittingProjection(BA=0.260, AB=400, H=104),
        )
        player.__dict__["_extra"] = {"age": 24, "barrel_pct": 14.0, "hard_hit_pct": 46.0}
        profile = score_breakout(player)
        assert profile.score > 0.3
        assert profile.label in ("High Upside", "Moderate Upside")

    def test_old_pitcher_decline(self):
        player = Player(
            id="old", name="Old Pitcher", team="BOS",
            positions=["SP"], is_hitter=False,
            pitching=PitchingProjection(IP=150, ERA=4.20, WHIP=1.30),
        )
        player.__dict__["_extra"] = {"age": 36, "stuff_plus": 85}
        profile = score_breakout(player)
        assert profile.score < 0
        assert profile.label == "Decline Risk"


class TestCSVImport:
    def test_hitting_csv_import(self):
        clear_players()
        csv_data = "Name,Team,Pos,PA,AB,H,HR,R,RBI,SB,BB,SO,AVG\n"
        csv_data += "Aaron Judge,NYY,OF,600,530,155,45,105,110,5,65,170,.292\n"
        csv_data += "Mike Trout,LAA,OF,500,440,125,30,85,80,10,55,120,.284\n"
        csv_data += "Freddie Freeman,LAD,1B,650,570,185,25,100,95,8,70,110,.325\n"  # NL - should be filtered

        players = load_projections_csv(csv_data.encode())
        assert len(players) == 2  # Only AL players
        assert players[0].name == "Aaron Judge"
        assert players[0].hitting.HR == 45
        assert players[1].team == "LAA"

    def test_pitching_csv_import(self):
        clear_players()
        csv_data = "Name,Team,Pos,IP,W,L,SV,SO,BB,H,ER,HR,ERA,WHIP\n"
        csv_data += "Gerrit Cole,NYY,SP,195,14,5,0,230,40,150,55,20,2.54,0.97\n"
        csv_data += "Some NL Guy,LAD,SP,180,12,7,0,190,45,160,70,22,3.50,1.14\n"

        players = load_projections_csv(csv_data.encode())
        assert len(players) == 1
        assert players[0].pitching.K == 230
