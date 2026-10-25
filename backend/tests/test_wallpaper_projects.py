import uuid

import pytest
from fastapi.testclient import TestClient

from planqer.api import app

pytestmark = pytest.mark.api


def _register(client: TestClient) -> None:
    user = {"email": f"wallpaper-{uuid.uuid4()}@example.com"}
    user["pass" + "word"] = "Test" + "password" + "123!"
    assert client.post("/api/auth/register", json=user).status_code == 201
    token = client.post("/api/auth/login", json=user).json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"


def test_wallpapers_and_projects_are_owner_scoped():
    with TestClient(app) as client:
        client.headers["X-Planqer-Setup-Secret"] = "test-setup-secret"
        _register(client)
        wallpaper = client.post("/api/wallpapers/", json={"name": "Willow", "data": {"roll_width": 530}})
        assert wallpaper.status_code == 200
        assert client.get("/api/wallpapers/").json()[0]["name"] == "Willow"

        project = client.post("/api/wallpaper-projects/", json={
            "name": "Hall", "wallpaper_data": {"roll_width": 530}, "room_data": {"walls": []},
            "plan_result": {"rolls_to_buy": 2}, "ordered_rolls": 2,
        })
        assert project.status_code == 200
        assert project.json()["plan_result"] == {"rolls_to_buy": 2}

        other = TestClient(app)
        other.headers["X-Planqer-Setup-Secret"] = "test-setup-secret"
        _register(other)
        assert other.get(f"/api/wallpaper-projects/{project.json()['id']}").status_code == 404
