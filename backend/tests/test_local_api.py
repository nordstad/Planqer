"""The browser entry point must answer exactly as the HTTP API does.

`local_api.handle` runs in the browser with no server. Every operation is
checked against the real endpoint it stands in for: same status, same body.
"""

import json

import pytest
from fastapi.testclient import TestClient

from planqer.api import app
from planqer.local_api import handle

client = TestClient(app)
client.headers["X-Planqer-Setup-Secret"] = "test-setup-secret"


def call(op, payload):
    reply = json.loads(handle(op, json.dumps(payload)))
    return reply["status"], reply["body"]


def without_timing(body):
    return {k: v for k, v in body.items() if k != "computation_time"}


@pytest.mark.api
def test_cutting_plan_matches_the_http_endpoint():
    payload = {
        "parts": {"100": 2, "50": 2},
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
        "algorithm": "first_fit_decreasing",
    }

    http = client.post("/api/cutting-plans", json=payload)
    status, body = call("cutting_plan", payload)

    assert status == http.status_code == 200
    assert without_timing(body) == without_timing(http.json())


@pytest.mark.api
@pytest.mark.parametrize(
    "extra",
    [
        {"available_board_lengths": [300], "parts": {"500": 1}},
        {
            "cost_analysis": {
                "enabled": True,
                "optimizeFor": "cost",
                "boardCosts": {},
            }
        },
    ],
)
def test_cutting_plan_errors_match_the_http_endpoint(extra):
    payload = {
        "parts": {"100": 1},
        "available_board_lengths": [200],
        "saw_blade_width": 3.0,
        **extra,
    }

    http = client.post("/api/cutting-plans", json=payload)
    status, body = call("cutting_plan", payload)

    assert status == http.status_code == 400
    assert body == http.json()


@pytest.mark.api
def test_cutting_plan_with_prices_matches_the_http_endpoint():
    payload = {
        "parts": {"100": 3, "50": 2},
        "available_board_lengths": [200, 300],
        "saw_blade_width": 3.0,
        "algorithm": "first_fit_decreasing",
        "currency": "NOK",
        "enable_cost_analysis": True,
        "board_costs": {
            "200": {"price_per_board": 40.0},
            "300": {"price_per_board": 55.0, "bulk_discount": 0.1},
        },
    }

    http = client.post("/api/cutting-plans", json=payload)
    status, body = call("cutting_plan", payload)

    assert status == http.status_code == 200
    assert body["cost_analysis"]["currency"] == "NOK"
    assert without_timing(body) == without_timing(http.json())


@pytest.mark.api
def test_invalid_requests_are_rejected_like_the_http_endpoint():
    payload = {
        "parts": {"1000": 1},
        "available_board_lengths": [15001],
        "saw_blade_width": 3.0,
    }

    http = client.post("/api/cutting-plans", json=payload)
    status, body = call("cutting_plan", payload)

    assert status == http.status_code == 422
    fields = ("type", "loc", "msg")
    assert [{k: e[k] for k in fields} for e in body["detail"]] == [
        {k: e[k] for k in fields} for e in http.json()["detail"]
    ]


def test_an_unknown_operation_is_reported_not_raised():
    status, body = call("make_coffee", {})

    assert status == 404
    assert "make_coffee" in body["detail"]


SHEET_REQUEST = {
    "parts": {
        "side": {"width": 600, "height": 400, "quantity": 4},
        "shelf": {"width": 800, "height": 300, "quantity": 3},
        "back": {"width": 500, "height": 500, "quantity": 2},
    },
    "sheet_width": 2440,
    "sheet_height": 1220,
    "kerf_width": 3.0,
    "material_type": "plywood",
    "project_name": "Cabinet",
}


@pytest.mark.api
@pytest.mark.parametrize("algorithm", ["bottom_left_fill", "guillotine_cut"])
def test_sheet_optimization_matches_the_http_endpoint(algorithm):
    payload = {**SHEET_REQUEST, "algorithm": algorithm}

    http = client.post("/api/sheet-optimization", json=payload)
    status, body = call("sheet_optimization", payload)

    assert status == http.status_code == 200
    assert body["sheet_visualizations"]
    assert without_timing(body) == without_timing(http.json())


@pytest.mark.api
def test_sheet_optimization_errors_match_the_http_endpoint():
    payload = {
        **SHEET_REQUEST,
        "parts": {"huge": {"width": 4000, "height": 4000, "quantity": 1}},
        "algorithm": "bottom_left_fill",
    }

    http = client.post("/api/sheet-optimization", json=payload)
    status, body = call("sheet_optimization", payload)

    assert status == http.status_code == 400
    assert body == http.json()


TILE_REQUEST = {
    "surface_width": 1500,
    "surface_height": 1200,
    "tile": {"width": 600, "height": 300, "allow_rotation": True},
    "joint": {"joint_width": 3, "perimeter_gap": 5},
    "bond": {"pattern": "running", "offset_fraction": 0.5},
    "candidate_count": 3,
    "project_name": "Bathroom",
}


@pytest.mark.api
@pytest.mark.parametrize("pattern", ["stack", "running", "herringbone"])
def test_tile_layout_matches_the_http_endpoint(pattern):
    payload = {**TILE_REQUEST, "bond": {"pattern": pattern, "offset_fraction": 0.5}}

    http = client.post("/api/tile-layout", json=payload)
    status, body = call("tile_layout", payload)

    assert status == http.status_code == 200
    assert body["candidates"]
    assert without_timing(body) == without_timing(http.json())


@pytest.mark.api
def test_tile_layout_errors_match_the_http_endpoint():
    payload = {
        **TILE_REQUEST,
        "cutouts": [{"x": 0, "y": 0, "width": 1500, "height": 1200}],
    }

    http = client.post("/api/tile-layout", json=payload)
    status, body = call("tile_layout", payload)

    assert status == http.status_code == 400
    assert body == http.json()
