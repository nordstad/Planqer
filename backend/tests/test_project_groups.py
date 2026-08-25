import uuid

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def app():
    """Get the FastAPI app for testing"""
    from planqer.api import app

    return app


@pytest.fixture
def client(app):
    """Create a test client, entering the app's lifespan so migrations run"""
    with TestClient(app) as test_client:
        yield test_client


def _register_and_login(client) -> dict:
    """Register a fresh user and return auth headers for them."""
    user = {"email": f"test-{uuid.uuid4()}@example.com", "password": "testpassword123"}
    client.post("/api/auth/register", json=user)
    login = client.post("/api/auth/login", json=user)
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


CUTTING_PAYLOAD = {
    "parts": {"400": 4},
    "available_board_lengths": [2500],
    "saw_blade_width": 3,
}

SHEET_PAYLOAD = {
    "parts": {"shelf": {"width": 400, "height": 300, "quantity": 2}},
    "sheet_width": 1220,
    "sheet_height": 2440,
    "kerf_width": 3,
}


# A plan the way /cutting-plans returns one. Used by the save-path tests so they
# don't each burn one of the solver's 10 requests per minute — only the tests
# that are actually about running a plan call the endpoint.
SOLVED_PLAN = {
    "optimal_board_length": 2500,
    "cost": 88.0,
    "total_waste": 888.0,
    "material_bought": 2500.0,
    "kerf_loss": 9.0,
    "board_lengths_used": [2500.0],
    "cut_list": [[400.0, 400.0, 400.0, 400.0]],
    "visualization": "data:image/svg+xml;base64,",
    "algorithm_used": "first_fit_decreasing",
    "computation_time": 0.001,
    "cost_analysis": None,
}


def _run_plan(client, headers) -> dict:
    """Actually run a board plan. Computing does not save — the plan is returned."""
    response = client.post("/cutting-plans", json=CUTTING_PAYLOAD, headers=headers)
    assert response.status_code == 200
    return response.json()


def _save_payload(
    plan: dict, name: str = "Chair rails", group_id: str | None = None
) -> dict:
    return {
        "name": name,
        "project_group_id": group_id,
        "parts_data": CUTTING_PAYLOAD["parts"],
        "board_lengths": CUTTING_PAYLOAD["available_board_lengths"],
        "saw_blade_width": CUTTING_PAYLOAD["saw_blade_width"],
        "optimization_result": SOLVED_PLAN,
    }


def _layout(client, headers) -> dict:
    response = client.post("/sheet-optimization", json=SHEET_PAYLOAD, headers=headers)
    assert response.status_code == 200
    return response.json()


def _save_sheet_payload(
    layout: dict, name: str = "Shelf panels", group_id: str | None = None
) -> dict:
    return {
        "name": name,
        "project_group_id": group_id,
        "parts_data": [{"name": "shelf", "width": 400, "height": 300, "quantity": 2}],
        "sheet_width": SHEET_PAYLOAD["sheet_width"],
        "sheet_height": SHEET_PAYLOAD["sheet_height"],
        "kerf_width": SHEET_PAYLOAD["kerf_width"],
        "optimization_result": layout,
    }


# ── happy path ──────────────────────────────────────────────────────────


def test_create_and_list_project_group(client):
    headers = _register_and_login(client)

    response = client.post(
        "/api/project-groups/", json={"name": "Chair"}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Chair"

    listed = client.get("/api/project-groups/", headers=headers)
    assert listed.status_code == 200
    names = [g["name"] for g in listed.json()]
    assert "Chair" in names


def test_rename_project_group(client):
    headers = _register_and_login(client)
    group = client.post(
        "/api/project-groups/", json={"name": "Chair"}, headers=headers
    ).json()

    response = client.put(
        f"/api/project-groups/{group['id']}",
        json={"name": "Dining Chair"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Dining Chair"


def test_save_board_cutlist_into_project_group(client):
    headers = _register_and_login(client)
    group = client.post(
        "/api/project-groups/", json={"name": "Chair"}, headers=headers
    ).json()

    response = client.post(
        "/api/projects/",
        json=_save_payload(SOLVED_PLAN, group_id=group["id"]),
        headers=headers,
    )
    assert response.status_code == 200

    cutlists = client.get("/api/projects/", headers=headers).json()
    assert len(cutlists) == 1
    assert cutlists[0]["project_group_id"] == group["id"]
    assert cutlists[0]["name"] == "Chair rails"


def test_save_sheet_cutlist_into_project_group(client):
    headers = _register_and_login(client)
    group = client.post(
        "/api/project-groups/", json={"name": "Chair"}, headers=headers
    ).json()
    layout = _layout(client, headers)

    response = client.post(
        "/api/sheet-projects/",
        json=_save_sheet_payload(layout, group_id=group["id"]),
        headers=headers,
    )
    assert response.status_code == 200

    cutlists = client.get("/api/sheet-projects/", headers=headers).json()
    assert len(cutlists) == 1
    assert cutlists[0]["project_group_id"] == group["id"]


def test_cutlist_without_group_stays_ungrouped(client):
    headers = _register_and_login(client)

    response = client.post(
        "/api/projects/", json=_save_payload(SOLVED_PLAN), headers=headers
    )
    assert response.status_code == 200

    cutlists = client.get("/api/projects/", headers=headers).json()
    assert cutlists[0]["project_group_id"] is None


def test_delete_project_group_cascades_its_cutlists(client):
    headers = _register_and_login(client)
    group = client.post(
        "/api/project-groups/", json={"name": "Chair"}, headers=headers
    ).json()

    client.post(
        "/api/projects/",
        json=_save_payload(SOLVED_PLAN, group_id=group["id"]),
        headers=headers,
    )
    client.post(
        "/api/sheet-projects/",
        json=_save_sheet_payload(_layout(client, headers), group_id=group["id"]),
        headers=headers,
    )

    delete_response = client.delete(
        f"/api/project-groups/{group['id']}", headers=headers
    )
    assert delete_response.status_code == 200

    assert client.get("/api/projects/", headers=headers).json() == []
    assert client.get("/api/sheet-projects/", headers=headers).json() == []
    assert client.get("/api/project-groups/", headers=headers).json() == []


# ── running a plan is not saving one ────────────────────────────────────


def test_running_a_board_plan_saves_nothing(client):
    """Computing is not keeping. A run the user never named leaves no record —
    this is what stops every re-run from littering the dashboard."""
    headers = _register_and_login(client)

    _run_plan(client, headers)
    _run_plan(client, headers)

    assert client.get("/api/projects/", headers=headers).json() == []


def test_running_a_sheet_layout_saves_nothing(client):
    headers = _register_and_login(client)

    _layout(client, headers)

    assert client.get("/api/sheet-projects/", headers=headers).json() == []


def test_saved_board_plan_keeps_the_prices_it_was_costed_with(client):
    """Stocked lengths and supplier prices differ per job, so both belong to the
    plan — loading one back must not ask for every price again."""
    headers = _register_and_login(client)
    prices = {
        "same_price_for_all": False,
        "uniform_price": None,
        "optimize_for": "cost",
        "board_costs": {"2500": {"price_per_meter": 42.0, "price_per_board": 105.0}},
    }

    saved = client.post(
        "/api/projects/",
        json={**_save_payload(SOLVED_PLAN), "board_costs": prices},
        headers=headers,
    ).json()

    assert saved["board_costs"] == prices
    assert saved["board_lengths"] == CUTTING_PAYLOAD["available_board_lengths"]
    # And it survives the round trip through the list endpoint the page loads from.
    assert (
        client.get("/api/projects/", headers=headers).json()[0]["board_costs"] == prices
    )


def test_unpriced_board_plan_stores_no_prices(client):
    """An empty pricing panel is not a deliberate zero — it is absent."""
    headers = _register_and_login(client)

    saved = client.post(
        "/api/projects/", json=_save_payload(SOLVED_PLAN), headers=headers
    ).json()

    assert saved["board_costs"] is None


def test_saved_board_plan_keeps_the_plan_it_was_given(client):
    """The saved plan is the one the user approved on screen, not a fresh solve
    (the genetic strategy is not deterministic), and its diagram is redrawn
    server-side rather than accepted from the browser."""
    headers = _register_and_login(client)
    plan = _run_plan(client, headers)

    saved = client.post(
        "/api/projects/", json=_save_payload(plan), headers=headers
    ).json()

    assert saved["optimization_result"]["cut_list"] == plan["cut_list"]
    assert saved["cutlist_image"].startswith("data:image/")
    assert saved["has_svg_image"] is True


# ── bad path ────────────────────────────────────────────────────────────


def test_project_group_endpoints_require_auth(client):
    # No Authorization header at all: FastAPI's OAuth2 dependency itself
    # rejects the request (401), before get_current_user ever runs and could
    # raise its own 401 "Could not validate credentials" for a bad token.
    assert client.get("/api/project-groups/").status_code == 401
    assert (
        client.post("/api/project-groups/", json={"name": "Chair"}).status_code == 401
    )


def test_saving_a_plan_requires_auth(client):
    assert (
        client.post(
            "/api/projects/", json=_save_payload({"cut_list": [[400]]})
        ).status_code
        == 401
    )


def test_project_group_endpoints_reject_invalid_token(client):
    headers = {"Authorization": "Bearer invalid_token"}
    assert client.get("/api/project-groups/", headers=headers).status_code == 401


def test_rename_nonexistent_project_group_404s(client):
    headers = _register_and_login(client)
    response = client.put(
        f"/api/project-groups/{uuid.uuid4()}",
        json={"name": "Anything"},
        headers=headers,
    )
    assert response.status_code == 404


def test_delete_nonexistent_project_group_404s(client):
    headers = _register_and_login(client)
    response = client.delete(f"/api/project-groups/{uuid.uuid4()}", headers=headers)
    assert response.status_code == 404


def test_cannot_rename_another_users_project_group(client):
    owner_headers = _register_and_login(client)
    other_headers = _register_and_login(client)
    group = client.post(
        "/api/project-groups/", json={"name": "Chair"}, headers=owner_headers
    ).json()

    response = client.put(
        f"/api/project-groups/{group['id']}",
        json={"name": "Hijacked"},
        headers=other_headers,
    )
    assert response.status_code == 404


def test_save_board_cutlist_into_nonexistent_group_404s(client):
    headers = _register_and_login(client)

    response = client.post(
        "/api/projects/",
        json=_save_payload(SOLVED_PLAN, group_id=str(uuid.uuid4())),
        headers=headers,
    )
    assert response.status_code == 404


def test_save_board_cutlist_into_another_users_group_404s(client):
    owner_headers = _register_and_login(client)
    other_headers = _register_and_login(client)
    group = client.post(
        "/api/project-groups/", json={"name": "Chair"}, headers=owner_headers
    ).json()

    response = client.post(
        "/api/projects/",
        json=_save_payload(SOLVED_PLAN, group_id=group["id"]),
        headers=other_headers,
    )
    assert response.status_code == 404
    # And nothing got saved into the other user's project as a side effect.
    assert client.get("/api/projects/", headers=owner_headers).json() == []


def test_save_sheet_cutlist_into_nonexistent_group_404s(client):
    headers = _register_and_login(client)
    layout = _layout(client, headers)

    response = client.post(
        "/api/sheet-projects/",
        json=_save_sheet_payload(layout, group_id=str(uuid.uuid4())),
        headers=headers,
    )
    assert response.status_code == 404


def test_save_rejects_an_empty_name(client):
    """A nameless plan is unfindable later, so the boundary refuses it rather
    than inventing a timestamp name the user never chose."""
    headers = _register_and_login(client)

    response = client.post(
        "/api/projects/", json=_save_payload(SOLVED_PLAN, name=""), headers=headers
    )
    assert response.status_code == 422


def test_saved_plan_serves_its_diagram_as_svg(client):
    """The download endpoint takes no `format` and always serves the stored SVG.

    It used to offer `format=png`, served from a column CairoSVG filled in only
    where the native libcairo happened to be installed — everywhere else it
    404'd with "PNG format not available" and the dashboard's PNG button was
    dead. The PNG is rasterized in the browser now, so this endpoint has one
    format and no host dependency.
    """
    headers = _register_and_login(client)
    plan = client.post(
        "/api/projects/", json=_save_payload(SOLVED_PLAN), headers=headers
    ).json()

    response = client.get(f"/api/projects/{plan['id']}/image", headers=headers)

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/svg+xml"
    assert response.content.lstrip().startswith(b"<?xml")
    # A `format` query param is no longer part of the contract; sending one
    # must not change what comes back.
    assert (
        client.get(
            f"/api/projects/{plan['id']}/image?format=png", headers=headers
        ).content
        == response.content
    )
