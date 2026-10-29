"""The browser draws a saved project's diagram exactly as the server does.

Saving a project stores an SVG redrawn from the plan the user approved. The
browser has no server, so `local_api` offers the same drawing as an operation.
Each kind is saved through the real endpoint and the stored image must equal
what the operation returns.
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


def call(op, payload):
    reply = json.loads(handle(op, json.dumps(payload)))
    return reply["status"], reply["body"]


BOARD_PLAN = {
    "parts": {"100": 2, "50": 2},
    "available_board_lengths": [200],
    "saw_blade_width": 3.0,
    "algorithm": "first_fit_decreasing",
}
SHEET_PLAN = {
    "parts": {"side": {"width": 600, "height": 400, "quantity": 2}},
    "sheet_width": 2440,
    "sheet_height": 1220,
    "algorithm": "guillotine_cut",
}
TILE_PLAN = {
    "surface_width": 909,
    "surface_height": 1206,
    "tile": {"width": 300, "height": 600},
    "candidate_count": 2,
}


def test_a_saved_board_plan_has_the_diagram_the_server_stores(client, headers):
    _, plan = call("cutting_plan", BOARD_PLAN)

    saved = client.post(
        "/api/projects/",
        headers=headers,
        json={
            "name": "Shelves",
            "parts_data": BOARD_PLAN["parts"],
            "board_lengths": BOARD_PLAN["available_board_lengths"],
            "saw_blade_width": 3.0,
            "optimization_result": plan,
        },
    ).json()
    status, body = call(
        "saved_diagram",
        {
            "kind": "board",
            "name": "Shelves",
            "saw_blade_width": 3.0,
            "optimization_result": plan,
        },
    )

    assert status == 200
    assert saved["cutlist_image"]
    assert body == {"image": saved["cutlist_image"]}


def test_a_saved_sheet_layout_has_the_diagram_the_server_stores(client, headers):
    _, plan = call("sheet_optimization", SHEET_PLAN)

    saved = client.post(
        "/api/sheet-projects/",
        headers=headers,
        json={
            "name": "Cabinet",
            "parts_data": [],
            "sheet_width": 2440,
            "sheet_height": 1220,
            "kerf_width": 3,
            "optimization_result": plan,
        },
    ).json()
    status, body = call(
        "saved_diagram",
        {"kind": "sheet", "name": "Cabinet", "optimization_result": plan},
    )

    assert status == 200
    assert saved["cutlist_image"]
    assert body == {"image": saved["cutlist_image"]}


def test_a_saved_tile_layout_has_the_diagram_the_server_stores(client, headers):
    _, result = call("tile_layout", TILE_PLAN)
    candidate = result["candidates"][result["recommended_index"]]
    surface = {"width": 909, "height": 1206, "cutouts": []}

    saved = client.post(
        "/api/tile-projects/",
        headers=headers,
        json={
            "name": "Splashback",
            "surface_data": surface,
            "tile_data": TILE_PLAN["tile"],
            "bond_data": {"pattern": "stack", "joint_width": 3},
            "options_data": {},
            "layout_result": candidate,
        },
    ).json()
    status, body = call(
        "saved_diagram",
        {
            "kind": "tile",
            "name": "Splashback",
            "surface_data": surface,
            "layout_result": candidate,
        },
    )

    assert status == 200
    assert saved["cutlist_image"]
    assert body == {"image": saved["cutlist_image"]}


def test_a_saved_wallpaper_plan_has_the_diagram_the_server_stores(client, headers):
    from test_local_api_wallpaper import PAYLOAD

    _, plan = call("wallpaper_plan", PAYLOAD)

    saved = client.post(
        "/api/wallpaper-projects/",
        headers=headers,
        json={
            "name": "Hall",
            "wallpaper_data": PAYLOAD["wallpaper"],
            "room_data": PAYLOAD["room"],
            "plan_result": plan,
        },
    ).json()
    status, body = call(
        "saved_diagram",
        {
            "kind": "wallpaper",
            "name": "Hall",
            "room_data": PAYLOAD["room"],
            "plan_result": plan,
        },
    )

    assert status == 200
    assert saved["cutlist_image"]
    assert body == {"image": saved["cutlist_image"]}


@pytest.mark.parametrize(
    "request_body",
    [
        {"kind": "board", "name": "x", "saw_blade_width": 3, "optimization_result": {}},
        {"kind": "sheet", "name": "x", "optimization_result": {"sheets": []}},
        {"kind": "tile", "name": "x", "surface_data": {}, "layout_result": {}},
        {"kind": "wallpaper", "name": "x", "room_data": {}, "plan_result": {}},
    ],
)
def test_a_plan_with_nothing_to_draw_has_no_image(request_body):
    status, body = call("saved_diagram", request_body)

    assert (status, body) == (200, {"image": None})


def test_an_unknown_kind_is_a_validation_error():
    status, body = call("saved_diagram", {"kind": "wall", "name": "x"})

    assert status == 422
    assert body["detail"]
