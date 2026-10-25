"""The browser validates a save exactly as the endpoint does.

The browser stores projects, groups and settings itself, but the rules for what
a request may contain live in the same pydantic models the endpoints use.
`saved_request` runs them, so an invalid body fails with the same errors and a
valid one comes back with the same defaults filled in.
"""

import json
import uuid

import pytest
from fastapi.testclient import TestClient

from planqer.local_api import handle

pytestmark = pytest.mark.api


@pytest.fixture(scope="module")
def client():
    from planqer.api import app

    with TestClient(app) as test_client:
        test_client.headers["X-Planqer-Setup-Secret"] = "test-setup-secret"
        yield test_client


@pytest.fixture
def headers(client):
    user = {
        "email": f"test-{uuid.uuid4()}@example.com",
        "password": "Testpassword" + "123!",
    }
    client.post("/api/auth/register", json=user)
    token = client.post("/api/auth/login", json=user).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def call(kind, mode, body):
    reply = json.loads(
        handle("saved_request", json.dumps({"kind": kind, "mode": mode, "body": body}))
    )
    return reply["status"], reply["body"]


def errors(detail):
    return [(e["type"], e["loc"], e["msg"]) for e in detail]


BOARD = {
    "name": "Shelves",
    "parts_data": {"100": 2},
    "board_lengths": [200.0],
    "saw_blade_width": 3.0,
    "optimization_result": {},
    "product": {"type": "board", "name": "Spruce 45x95"},
}
SHEET = {
    "name": "Cabinet",
    "parts_data": [],
    "sheet_width": 2440.0,
    "sheet_height": 1220.0,
    "kerf_width": 3.0,
}
TILE = {
    "name": "Wall",
    "surface_data": {"width": 900, "height": 600},
    "tile_data": {"width": 300, "height": 300},
    "bond_data": {"pattern": "stack"},
}
WALLPAPER = {
    "name": "Hall",
    "wallpaper_data": {"name": "Willow", "roll_width": 530, "roll_length": 10050},
    "room_data": {"walls": []},
}
ENDPOINTS = {
    "board": "/api/projects/",
    "sheet": "/api/sheet-projects/",
    "tile": "/api/tile-projects/",
    "wallpaper": "/api/wallpaper-projects/",
}
VALID = {"board": BOARD, "sheet": SHEET, "tile": TILE, "wallpaper": WALLPAPER}


@pytest.mark.parametrize("kind", ["board", "sheet", "tile", "wallpaper"])
def test_a_valid_save_comes_back_as_the_endpoint_stores_it(client, headers, kind):
    saved = client.post(ENDPOINTS[kind], json=VALID[kind], headers=headers).json()

    status, body = call(kind, "create", VALID[kind])

    assert status == 200
    for field, value in body["values"].items():
        if field == "material_type" and kind == "board":
            continue  # the endpoint fills it from the product name
        assert saved[field] == value, field


def test_board_parts_can_keep_names_without_breaking_legacy_saves(client, headers):
    named = {
        **BOARD,
        "parts_data": [
            {"name": "Front rail", "length": 100, "quantity": 2},
            {"name": "Back rail", "length": 100, "quantity": 1},
        ],
    }

    saved = client.post(ENDPOINTS["board"], json=named, headers=headers).json()
    status, body = call("board", "create", named)

    assert saved["parts_data"] == named["parts_data"]
    assert status == 200
    assert body["values"]["parts_data"] == named["parts_data"]


def test_a_partial_update_returns_only_what_was_sent():
    status, body = call(
        "board", "update", {"name": "Renamed", "project_group_id": None}
    )

    assert status == 200
    assert body == {"values": {"name": "Renamed", "project_group_id": None}}


@pytest.mark.parametrize("kind", ["board", "sheet", "tile", "wallpaper"])
@pytest.mark.parametrize(
    "change",
    [{"name": ""}, {"name": "x" * 201}, {"project_group_id": "not-a-uuid"}],
)
def test_an_invalid_save_fails_with_the_endpoints_errors(client, headers, kind, change):
    body = {**VALID[kind], **change}
    http = client.post(ENDPOINTS[kind], json=body, headers=headers)

    status, local = call(kind, "create", body)

    assert status == http.status_code == 422
    assert errors(local["detail"]) == errors(http.json()["detail"])


@pytest.mark.parametrize("kind", ["board", "sheet", "tile", "wallpaper"])
def test_a_missing_required_field_fails_like_the_endpoint(client, headers, kind):
    body = {"name": "Only a name"}
    http = client.post(ENDPOINTS[kind], json=body, headers=headers)

    status, local = call(kind, "create", body)

    assert status == http.status_code == 422
    assert errors(local["detail"]) == errors(http.json()["detail"])


def test_a_group_rejects_a_margin_out_of_range_like_the_endpoint(client, headers):
    body = {"name": "Chair", "spare_margin_percent": 120}
    http = client.post("/api/project-groups/", json=body, headers=headers)

    status, local = call("group", "create", body)

    assert status == http.status_code == 422
    assert errors(local["detail"]) == errors(http.json()["detail"])


def test_a_group_update_keeps_an_explicit_null_margin():
    status, body = call(
        "group", "update", {"name": "Chair", "spare_margin_percent": None}
    )

    assert status == 200
    assert body == {"values": {"name": "Chair", "spare_margin_percent": None}}


def test_settings_reject_an_unknown_catalogue_like_the_endpoint(client, headers):
    body = {"catalogue_country": "FR"}
    http = client.put("/api/settings/", json=body, headers=headers)

    status, local = call("settings", "update", body)

    assert status == http.status_code == 422
    assert errors(local["detail"]) == errors(http.json()["detail"])


def test_settings_return_only_what_was_sent():
    status, body = call("settings", "update", {"default_currency": "NOK"})

    assert (status, body) == (200, {"values": {"default_currency": "NOK"}})


def test_an_unknown_kind_is_a_validation_error():
    status, body = call("wall", "create", {})

    assert status == 422
    assert body["detail"]
