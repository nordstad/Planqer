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
