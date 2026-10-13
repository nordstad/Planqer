"""The browser entry point must answer exactly as the HTTP API does.

`local_api.handle` runs in the browser with no server. Every operation is
checked against the real endpoint it stands in for: same status, same body.
"""

import json
import uuid

import pytest
import trimesh
from fastapi.testclient import TestClient
from step_fixtures import _box_corners, _product, _step_file

from planqer.api import app
from planqer.local_api import handle

client = TestClient(app)
client.headers["X-Planqer-Setup-Secret"] = "test-setup-secret"


def call(op, payload, data=None):
    reply = json.loads(handle(op, json.dumps(payload), data))
    return reply["status"], reply["body"]


def without_timing(body):
    timings = {"computation_time", "processing_time"}
    return {k: v for k, v in body.items() if k not in timings}


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


@pytest.fixture
def signed_in_client():
    with TestClient(app) as authed:
        authed.headers["X-Planqer-Setup-Secret"] = "test-setup-secret"
        user = {
            "email": f"local-api-{uuid.uuid4()}@example.com",
            "password": "Testpassword" + "123!",
        }
        authed.post("/api/auth/register", json=user)
        token = authed.post("/api/auth/login", json=user).json()["access_token"]
        authed.headers["Authorization"] = f"Bearer {token}"
        yield authed


def stl_bytes():
    boards = []
    for i, length in enumerate((1800, 1800, 800)):
        board = trimesh.creation.box(extents=[length, 95, 45])
        board.apply_translation([0, i * 300, 0])
        boards.append(board)
    sheet = trimesh.creation.box(extents=[900, 600, 18])
    sheet.apply_translation([0, 2000, 0])
    return trimesh.util.concatenate([*boards, sheet]).export(file_type="stl")


def step_bytes():
    products = "\n".join(
        [
            _product(0, "Long", [_box_corners(1800.0, 95.0, 45.0)]),
            _product(1, "Short", [_box_corners(520.0, 95.0, 45.0)]),
            _product(2, "Ply", [_box_corners(1800.0, 800.0, 15.0)]),
        ]
    )
    return _step_file(products).encode()


@pytest.mark.api
@pytest.mark.parametrize(
    ("op", "url", "filename", "content"),
    [
        ("cutlist_3d", "/api/3d-cutlist", "cabinet.stl", stl_bytes),
        ("cutlist_step", "/api/step-cutlist", "cabinet.step", step_bytes),
    ],
)
def test_model_cutlists_match_the_http_endpoints(
    signed_in_client, op, url, filename, content
):
    data = content()
    options = {"filename": filename, "units": "mm", "round_precision": 1}

    http = signed_in_client.post(
        url,
        files={"file": (filename, data, "application/octet-stream")},
        data={"units": "mm", "round_precision": "1"},
    )
    status, body = call(op, options, data)

    assert status == http.status_code == 200
    assert body["cutlist_items"]
    assert without_timing(body) == without_timing(http.json())


@pytest.mark.api
@pytest.mark.parametrize(
    ("op", "url", "filename", "extra", "status"),
    [
        ("cutlist_3d", "/api/3d-cutlist", "notes.txt", {}, 400),
        ("cutlist_step", "/api/step-cutlist", "notes.txt", {}, 400),
        ("cutlist_3d", "/api/3d-cutlist", "a.stl", {"units": "furlongs"}, 400),
        ("cutlist_3d", "/api/3d-cutlist", "a.stl", {"round_precision": 5}, 400),
        ("cutlist_3d", "/api/3d-cutlist", "broken.stl", {}, 400),
        ("cutlist_step", "/api/step-cutlist", "broken.step", {}, 400),
    ],
)
def test_rejected_model_files_match_the_http_endpoints(
    signed_in_client, op, url, filename, extra, status
):
    options = {"filename": filename, "units": "mm", "round_precision": 1, **extra}

    http = signed_in_client.post(
        url,
        files={"file": (filename, b"not a model", "application/octet-stream")},
        data={k: str(v) for k, v in options.items() if k != "filename"},
    )
    reply_status, body = call(op, options, b"not a model")

    assert reply_status == http.status_code == status
    assert body == http.json()


def test_a_model_operation_without_a_file_is_reported():
    status, body = call("cutlist_3d", {"filename": "a.stl"})

    assert status == 400
    assert "file" in body["detail"].lower()


@pytest.fixture
def started_client():
    """A client that has run the app's startup, so the database tables exist."""
    with TestClient(app) as started:
        yield started


@pytest.mark.api
@pytest.mark.parametrize("country", ["SE", "NO", "generic", None])
def test_catalogue_matches_the_http_endpoint(started_client, country):
    query = {"country": country} if country else {}

    http = started_client.get("/api/catalogue/", params=query)
    status, body = call("catalogue", query)

    assert status == http.status_code == 200
    assert body["types"]
    assert body == http.json()


@pytest.mark.api
def test_product_search_matches_the_http_endpoint(started_client):
    query = {"q": "regel", "kind": "board", "limit": 5, "lang": "sv", "country": "SE"}

    http = started_client.get("/api/catalogue/products", params=query)
    status, body = call("catalogue_search", query)

    assert status == http.status_code == 200
    assert body
    assert body == http.json()


@pytest.mark.api
def test_stored_catalogue_changes_are_applied_like_the_server_applies_them():
    product_id = "se:regel:45x95"
    hide = {"product_id": product_id, "hidden": True}

    _, shown = call("catalogue", {"country": "SE"})
    _, hidden = call("catalogue", {"country": "SE", "entries": [hide]})

    assert product_id in {p["id"] for p in shown["products"]}
    assert product_id not in {p["id"] for p in hidden["products"]}
    assert len(hidden["products"]) == len(shown["products"]) - 1


@pytest.mark.api
def test_invalid_search_limits_are_rejected_like_the_http_endpoint(started_client):
    http = started_client.get(
        "/api/catalogue/products", params={"q": "regel", "limit": 0}
    )
    status, body = call("catalogue_search", {"q": "regel", "limit": 0})

    assert status == http.status_code == 422
    assert body["detail"][0]["type"] == http.json()["detail"][0]["type"]
    assert body["detail"][0]["msg"] == http.json()["detail"][0]["msg"]
