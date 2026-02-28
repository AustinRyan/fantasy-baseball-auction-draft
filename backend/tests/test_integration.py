"""Integration tests: full workflow from upload through draft."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.projection_loader import clear_players
from app.services.keeper_manager import reset_league
from app.services.draft_tracker import reset_draft


@pytest.fixture(autouse=True)
def clean_state():
    """Reset all state between tests."""
    clear_players()
    reset_league()
    reset_draft()
    yield
    clear_players()
    reset_league()
    reset_draft()


client = TestClient(app)


class TestFullWorkflow:
    def _upload_test_data(self):
        """Upload realistic test CSV data."""
        # Create hitters CSV with ~200 AL players
        hitter_rows = ["Name,Team,Pos,PA,AB,H,HR,R,RBI,SB,BB,SO,AVG"]
        teams = [
            "NYY", "BOS", "BAL", "TOR", "TBR",
            "CHW", "CLE", "DET", "MIN", "KCR",
            "HOU", "LAA", "OAK", "SEA", "TEX",
        ]
        for i in range(200):
            t = teams[i % 15]
            positions = ["OF", "1B", "2B", "3B", "SS", "C", "DH"][i % 7]
            hr = max(1, 35 - i // 4)
            r = max(15, 85 - i // 3)
            rbi = max(15, 85 - i // 3)
            sb = max(0, 15 - i // 8)
            ba = f".{max(200, 310 - i)}"
            pa = max(200, 600 - i * 2)
            ab = int(pa * 0.88)
            h = int(ab * int(ba.replace(".", "")) / 1000)
            hitter_rows.append(
                f"Hitter {i},{t},{positions},{pa},{ab},{h},{hr},{r},{rbi},{sb},50,100,{ba}"
            )

        hitter_csv = "\n".join(hitter_rows)
        resp = client.post(
            "/api/projections/upload",
            files={"file": ("hitters.csv", hitter_csv.encode(), "text/csv")},
            params={"file_type": "hitting"},
        )
        assert resp.status_code == 200

        # Create pitchers CSV
        pitcher_rows = ["Name,Team,Pos,IP,W,L,SV,SO,BB,H,ER,HR,ERA,WHIP"]
        for i in range(130):
            t = teams[i % 15]
            pos = "RP" if i >= 80 else "SP"
            ip = max(30, 190 - i) if pos == "SP" else max(40, 70 - (i - 80))
            w = max(1, 15 - i // 8)
            sv = max(0, 40 - (i - 80) * 2) if pos == "RP" else 0
            k = max(20, 200 - i)
            era = min(6.0, 3.20 + i * 0.02)
            whip = min(1.8, 1.05 + i * 0.005)
            er = int(ip * era / 9)
            h_allowed = int(ip * (whip - 0.3))
            pitcher_rows.append(
                f"Pitcher {i},{t},{pos},{ip},{w},8,{sv},{k},50,{h_allowed},{er},18,{era:.2f},{whip:.3f}"
            )

        pitcher_csv = "\n".join(pitcher_rows)
        resp = client.post(
            "/api/projections/upload",
            files={"file": ("pitchers.csv", pitcher_csv.encode(), "text/csv")},
            params={"file_type": "pitching"},
        )
        assert resp.status_code == 200

    def test_health(self):
        resp = client.get("/api/health")
        assert resp.json() == {"status": "ok"}

    def test_full_predraft_workflow(self):
        """Upload -> Calculate -> Export."""
        self._upload_test_data()

        # Calculate valuations
        resp = client.post("/api/valuations/calculate")
        assert resp.status_code == 200
        data = resp.json()
        assert data["hitter_count"] > 100
        assert data["pitcher_count"] > 80
        assert data["top_hitters"][0]["value"] > 20

        # Get results
        resp = client.get("/api/valuations/results", params={"is_hitter": True})
        assert resp.status_code == 200
        assert resp.json()["count"] > 0

        # Export CSV
        resp = client.get("/api/export/pre-draft", params={"format": "csv"})
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    def test_keeper_workflow(self):
        """Setup keepers -> check inflation."""
        self._upload_test_data()
        client.post("/api/valuations/calculate")

        # Get teams
        resp = client.get("/api/keepers/teams")
        assert resp.status_code == 200
        assert resp.json()["count"] == 11

        # Set keepers
        keepers = [
            {"player_name": "Hitter 0", "salary": 35, "positions": ["OF"]},
            {"player_name": "Hitter 5", "salary": 20, "positions": ["1B"]},
        ]
        resp = client.post("/api/keepers/teams/team_1", json=keepers)
        assert resp.status_code == 200
        assert resp.json()["count"] == 2

        # Link keepers to players
        resp = client.post("/api/keepers/link")
        assert resp.status_code == 200

        # Check inflation
        resp = client.get("/api/keepers/inflation")
        assert resp.status_code == 200
        inflation_data = resp.json()
        assert "inflation_rate" in inflation_data

    def test_draft_workflow(self):
        """Start draft -> pick -> alerts -> recommendations -> undo."""
        self._upload_test_data()
        client.post("/api/valuations/calculate")

        # Start draft
        resp = client.post("/api/draft/start")
        assert resp.status_code == 200
        assert resp.json()["is_active"] is True

        # Get players to pick
        resp = client.get("/api/valuations/results", params={"is_hitter": True})
        players = resp.json()["players"]
        top_player = players[0]

        # Record a pick
        resp = client.post(
            "/api/draft/pick",
            json={
                "player_id": top_player["id"],
                "team_id": "team_1",
                "price": 30,
            },
        )
        assert resp.status_code == 200
        pick_data = resp.json()
        assert pick_data["classification"] != ""
        pick_id = pick_data["id"]

        # Check state
        resp = client.get("/api/draft/state")
        assert resp.json()["is_active"] is True
        assert len(resp.json()["picks"]) == 1

        # Check alerts
        resp = client.get("/api/draft/alerts")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

        # Check recommendations
        resp = client.get("/api/draft/recommendations")
        assert resp.status_code == 200

        # Check my roster
        resp = client.get("/api/draft/my-roster")
        assert resp.status_code == 200

        # Check team roster
        resp = client.get("/api/draft/team/team_1/roster")
        assert resp.status_code == 200

        # Undo
        resp = client.delete(f"/api/draft/pick/{pick_id}")
        assert resp.status_code == 200

        # Verify undo worked
        resp = client.get("/api/draft/state")
        assert len(resp.json()["picks"]) == 0

    def test_draft_validation(self):
        """Test error cases."""
        self._upload_test_data()
        client.post("/api/valuations/calculate")
        client.post("/api/draft/start")

        # Invalid player
        resp = client.post(
            "/api/draft/pick",
            json={
                "player_id": "nonexistent",
                "team_id": "team_1",
                "price": 10,
            },
        )
        assert resp.status_code == 400

    def test_save_and_load(self):
        """Test draft state persistence."""
        self._upload_test_data()
        client.post("/api/valuations/calculate")
        client.post("/api/draft/start")

        # Make a pick
        resp = client.get("/api/valuations/results", params={"is_hitter": True})
        top = resp.json()["players"][0]
        client.post(
            "/api/draft/pick",
            json={
                "player_id": top["id"],
                "team_id": "team_2",
                "price": 25,
            },
        )

        # Save
        resp = client.post("/api/draft/save")
        assert resp.status_code == 200

        # Load
        resp = client.post("/api/draft/load")
        assert resp.status_code == 200
