import pytest
from fastapi.testclient import TestClient
from planqer.api import app

client = TestClient(app)


def test_root():
    response = client.get("/api/")
    assert response.status_code == 404 or response.status_code == 200


def test_planqer_success():
    payload = {
        "parts": {"100": 2, "50": 2},
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "optimal_board_length" in data
    assert "cut_list" in data
    assert "visualization" in data


def test_planqer_invalid_board():
    payload = {
        "parts": {"300": 1},
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 400
