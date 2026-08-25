import pytest
from fastapi.testclient import TestClient
from planqer.api import app

client = TestClient(app)


def test_planqer_integration_multiple_boards():
    # Test successful optimization with multiple boards
    payload = {
        "parts": {"100": 2, "80": 1, "50": 2},
        "available_board_lengths": [200, 250],
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["optimal_board_length"] in [200, 250]
    assert isinstance(data["cut_list"], list)
    assert isinstance(data["visualization"], str)
    # Accept both PNG and SVG formats (PNG when Cairo is available, SVG fallback otherwise)
    assert (data["visualization"].startswith("data:image/png;base64,") or 
            data["visualization"].startswith("data:image/svg+xml;base64,"))
    assert data["total_waste"] >= 0


def test_planqer_integration_invalid_parts():
    # Test that an invalid part length (too long) is rejected
    payload = {
        "parts": {"9999": 1},  # Exceeds max part length from config
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 422 or response.status_code == 400


def test_planqer_integration_no_boards():
    # Test that missing board lengths returns a validation error
    payload = {
        "parts": {"100": 1},
        "available_board_lengths": [],
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 422  # Validation error is more appropriate than 400


def test_planqer_integration_part_too_large_for_boards():
    # Test that a part cannot fit on any available board (should return 400)
    payload = {
        "parts": {"300": 1},  # Part is longer than any board
        "available_board_lengths": [200, 250],
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 400


def test_planqer_integration_custom_saw_blade_width():
    # Test that a valid request with a non-default saw blade width works
    payload = {
        "parts": {"100": 2, "50": 1},
        "available_board_lengths": [200],
        "saw_blade_width": 5.0,  # Custom kerf
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["optimal_board_length"] == 200
    assert isinstance(data["cut_list"], list)
    assert data["total_waste"] >= 0


def test_planqer_integration_empty_parts():
    # Test that a request with empty parts returns an error
    payload = {
        "parts": {},
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 400 or response.status_code == 422


def test_planqer_integration_swedish_lumber_sizes():
    # Test with realistic Swedish lumber sizes (Byggmax standard sizes)
    payload = {
        "parts": {"1200": 4, "800": 8, "500": 16, "300": 4},
        "available_board_lengths": [2500, 3000, 3300, 3600, 4200, 5100],
        "saw_blade_width": 3.0,
        "project_name": "Swedish Lumber Test",
        "cost_analysis": {
            "enabled": True,
            "currency": "SEK",
            "boardCosts": {
                "2500": {"price_per_meter": 30.0, "price_per_board": 75.0},
                "3000": {"price_per_meter": 30.0, "price_per_board": 90.0},
                "3300": {"price_per_meter": 30.0, "price_per_board": 99.0},
                "3600": {"price_per_meter": 30.0, "price_per_board": 108.0},
                "4200": {"price_per_meter": 30.0, "price_per_board": 126.0},
                "5100": {"price_per_meter": 30.0, "price_per_board": 153.0}
            }
        }
    }
    response = client.post("/api/cutting-plans", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["optimal_board_length"] in [2500, 3000, 3300, 3600, 4200, 5100]
    assert isinstance(data["cut_list"], list)
    assert len(data["cut_list"]) > 0
    assert isinstance(data["visualization"], str)
    assert data["total_waste"] >= 0
    # Should include cost analysis
    assert "cost_analysis" in data
    assert data["cost_analysis"] is not None
    assert data["cost_analysis"]["currency"] == "SEK"
    assert data["cost_analysis"]["total_cost"] > 0
