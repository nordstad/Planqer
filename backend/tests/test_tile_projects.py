import uuid

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def app():
    from planqer.api import app

    return app


@pytest.fixture
def client(app):
    """Create a test client, entering the app's lifespan so migrations run"""
    with TestClient(app) as test_client:
        yield test_client


def _register_and_login(client) -> dict:
    user = {"email": f"test-{uuid.uuid4()}@example.com", "password": "testpassword123"}
    client.post("/api/auth/register", json=user)
    login = client.post("/api/auth/login", json=user)
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


TILE_PAYLOAD = {
    "surface_width": 909,
    "surface_height": 1206,
    "tile": {"width": 300, "height": 600, "allow_rotation": False},
    "joint": {"joint_width": 3, "perimeter_gap": 0},
    "bond": {"pattern": "stack", "offset_fraction": 0.5},
    "candidate_count": 3,
    "project_name": "Test Wall",
}


# Solved once for the whole module and reused by every save test below. The
# endpoint needs no auth and returns the same candidates for the same
# request, so there is no reason to burn one of its 10-requests-per-minute
# rate limit budget per test — only the tests that are actually about
# *solving* (as opposed to saving) call it again.
@pytest.fixture(scope="module")
def solved_result():
    from planqer.api import app

    with TestClient(app) as one_off_client:
        response = one_off_client.post("/api/tile-layout", json=TILE_PAYLOAD)
        assert response.status_code == 200
        return response.json()


def _save_payload(
    result: dict, name: str = "Kitchen splashback", group_id: str | None = None
) -> dict:
    """Shapes a save request the way TileOptimizer's real save call does:
    surface/tile/bond as the sub-request dicts already defined by
    TileLayoutRequest, plus the one candidate the user picked."""
    candidate = result["candidates"][result["recommended_index"]]
    return {
        "name": name,
        "project_group_id": group_id,
        "surface_data": {
            "width": TILE_PAYLOAD["surface_width"],
            "height": TILE_PAYLOAD["surface_height"],
            "cutouts": TILE_PAYLOAD.get("cutouts", []),
        },
        "tile_data": TILE_PAYLOAD["tile"],
        "bond_data": {**TILE_PAYLOAD["bond"], **TILE_PAYLOAD["joint"]},
        "options_data": {"candidate_count": TILE_PAYLOAD["candidate_count"]},
        "layout_result": candidate,
    }


# ── happy path ──────────────────────────────────────────────────────────


def test_running_a_layout_saves_nothing(client):
    """Solving is not keeping. A run the user never named leaves no record."""
    headers = _register_and_login(client)

    response = client.post("/api/tile-layout", json=TILE_PAYLOAD)
    assert response.status_code == 200

    assert client.get("/api/tile-projects/", headers=headers).json() == []


def test_save_and_list_tile_project(client, solved_result):
    headers = _register_and_login(client)
    result = solved_result

    response = client.post(
        "/api/tile-projects/", json=_save_payload(result), headers=headers
    )
    assert response.status_code == 200
    saved = response.json()
    assert saved["name"] == "Kitchen splashback"
    assert saved["surface_data"]["width"] == TILE_PAYLOAD["surface_width"]
    assert saved["cutlist_image"].startswith("data:image/")
    assert saved["has_svg_image"] is True

    listed = client.get("/api/tile-projects/", headers=headers).json()
    assert len(listed) == 1
    assert listed[0]["id"] == saved["id"]


def test_saved_tile_project_keeps_the_candidate_it_was_given(client, solved_result):
    """The saved layout is the one candidate the user picked from the ranked
    list, not a fresh solve — the solver's offset sampling could otherwise
    hand back a different candidate order."""
    headers = _register_and_login(client)
    result = solved_result
    candidate = result["candidates"][result["recommended_index"]]

    saved = client.post(
        "/api/tile-projects/", json=_save_payload(result), headers=headers
    ).json()

    assert saved["layout_result"]["label"] == candidate["label"]
    assert saved["layout_result"]["tiles_to_purchase"] == candidate["tiles_to_purchase"]


def test_get_single_tile_project(client, solved_result):
    headers = _register_and_login(client)
    result = solved_result
    saved = client.post(
        "/api/tile-projects/", json=_save_payload(result), headers=headers
    ).json()

    response = client.get(f"/api/tile-projects/{saved['id']}", headers=headers)
    assert response.status_code == 200
    assert response.json()["name"] == "Kitchen splashback"


def test_rename_tile_project(client, solved_result):
    headers = _register_and_login(client)
    result = solved_result
    saved = client.post(
        "/api/tile-projects/", json=_save_payload(result), headers=headers
    ).json()

    response = client.put(
        f"/api/tile-projects/{saved['id']}",
        json={"name": "Bathroom floor"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Bathroom floor"


def test_delete_tile_project(client, solved_result):
    headers = _register_and_login(client)
    result = solved_result
    saved = client.post(
        "/api/tile-projects/", json=_save_payload(result), headers=headers
    ).json()

    response = client.delete(f"/api/tile-projects/{saved['id']}", headers=headers)
    assert response.status_code == 200
    assert client.get("/api/tile-projects/", headers=headers).json() == []


def test_save_tile_project_into_project_group(client, solved_result):
    headers = _register_and_login(client)
    group = client.post(
        "/api/project-groups/", json={"name": "Kitchen"}, headers=headers
    ).json()
    result = solved_result

    response = client.post(
        "/api/tile-projects/",
        json=_save_payload(result, group_id=group["id"]),
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["project_group_id"] == group["id"]


def test_delete_project_group_cascades_its_tile_projects(client, solved_result):
    headers = _register_and_login(client)
    group = client.post(
        "/api/project-groups/", json={"name": "Kitchen"}, headers=headers
    ).json()
    result = solved_result
    client.post(
        "/api/tile-projects/",
        json=_save_payload(result, group_id=group["id"]),
        headers=headers,
    )

    delete_response = client.delete(
        f"/api/project-groups/{group['id']}", headers=headers
    )
    assert delete_response.status_code == 200
    assert client.get("/api/tile-projects/", headers=headers).json() == []


def test_saved_tile_project_serves_its_diagram_as_svg(client, solved_result):
    headers = _register_and_login(client)
    result = solved_result
    saved = client.post(
        "/api/tile-projects/", json=_save_payload(result), headers=headers
    ).json()

    response = client.get(f"/api/tile-projects/{saved['id']}/image", headers=headers)

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/svg+xml"
    assert response.content.lstrip().startswith(b"<?xml")


def test_updating_layout_result_redraws_the_saved_diagram(client, solved_result):
    """A rename or a new candidate both change what the diagram should show —
    the stored image must not drift from the stored data."""
    headers = _register_and_login(client)
    result = solved_result
    saved = client.post(
        "/api/tile-projects/", json=_save_payload(result), headers=headers
    ).json()
    first_image = client.get(
        f"/api/tile-projects/{saved['id']}/image", headers=headers
    ).content

    other_candidate = (
        result["candidates"][-1]
        if len(result["candidates"]) > 1
        else result["candidates"][0]
    )
    response = client.put(
        f"/api/tile-projects/{saved['id']}",
        json={"layout_result": other_candidate},
        headers=headers,
    )
    assert response.status_code == 200

    second_image = client.get(
        f"/api/tile-projects/{saved['id']}/image", headers=headers
    ).content
    if (
        other_candidate["label"]
        != result["candidates"][result["recommended_index"]]["label"]
    ):
        assert first_image != second_image


def test_saved_diagonal_project_redraws_the_true_polygon_shape(client):
    """The re-render adapter (_render_saved_layout) rebuilds PlacedTile
    from the stored JSON — it must carry `vertices` through, or a saved
    diagonal project would silently redraw as rectangles (its stored
    x/y/width/height are only the bounding box for a rotated piece)."""
    headers = _register_and_login(client)
    diagonal_payload = {
        **TILE_PAYLOAD,
        "surface_width": 2000,
        "surface_height": 1500,
        "tile": {"width": 300, "height": 150, "allow_rotation": False},
        "bond": {"pattern": "diagonal", "offset_fraction": 0.5},
    }
    result = client.post("/api/tile-layout", json=diagonal_payload).json()
    candidate = result["candidates"][result["recommended_index"]]
    assert any(t["vertices"] is not None for t in candidate["tiles"])  # sanity

    save_payload = {
        "name": "Diagonal splashback",
        "project_group_id": None,
        "surface_data": {
            "width": diagonal_payload["surface_width"],
            "height": diagonal_payload["surface_height"],
            "cutouts": [],
        },
        "tile_data": diagonal_payload["tile"],
        "bond_data": {**diagonal_payload["bond"], **TILE_PAYLOAD["joint"]},
        "options_data": {"candidate_count": diagonal_payload["candidate_count"]},
        "layout_result": candidate,
    }
    saved = client.post(
        "/api/tile-projects/", json=save_payload, headers=headers
    ).json()

    response = client.get(f"/api/tile-projects/{saved['id']}/image", headers=headers)

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/svg+xml"
    assert b"<polygon" in response.content


# ── bad path / ownership ─────────────────────────────────────────────────


def test_tile_project_endpoints_require_auth(client):
    assert client.get("/api/tile-projects/").status_code == 401
    assert client.post("/api/tile-projects/", json={}).status_code == 401


def test_get_nonexistent_tile_project_404s(client):
    headers = _register_and_login(client)
    response = client.get(f"/api/tile-projects/{uuid.uuid4()}", headers=headers)
    assert response.status_code == 404


def test_rename_nonexistent_tile_project_404s(client):
    headers = _register_and_login(client)
    response = client.put(
        f"/api/tile-projects/{uuid.uuid4()}", json={"name": "Anything"}, headers=headers
    )
    assert response.status_code == 404


def test_delete_nonexistent_tile_project_404s(client):
    headers = _register_and_login(client)
    response = client.delete(f"/api/tile-projects/{uuid.uuid4()}", headers=headers)
    assert response.status_code == 404


def test_cannot_read_another_users_tile_project(client, solved_result):
    owner_headers = _register_and_login(client)
    other_headers = _register_and_login(client)
    result = solved_result
    saved = client.post(
        "/api/tile-projects/", json=_save_payload(result), headers=owner_headers
    ).json()

    response = client.get(f"/api/tile-projects/{saved['id']}", headers=other_headers)
    assert response.status_code == 404


def test_cannot_rename_another_users_tile_project(client, solved_result):
    owner_headers = _register_and_login(client)
    other_headers = _register_and_login(client)
    result = solved_result
    saved = client.post(
        "/api/tile-projects/", json=_save_payload(result), headers=owner_headers
    ).json()

    response = client.put(
        f"/api/tile-projects/{saved['id']}",
        json={"name": "Hijacked"},
        headers=other_headers,
    )
    assert response.status_code == 404
    assert (
        client.get(f"/api/tile-projects/{saved['id']}", headers=owner_headers).json()[
            "name"
        ]
        != "Hijacked"
    )


def test_cannot_delete_another_users_tile_project(client, solved_result):
    owner_headers = _register_and_login(client)
    other_headers = _register_and_login(client)
    result = solved_result
    saved = client.post(
        "/api/tile-projects/", json=_save_payload(result), headers=owner_headers
    ).json()

    response = client.delete(f"/api/tile-projects/{saved['id']}", headers=other_headers)
    assert response.status_code == 404
    assert len(client.get("/api/tile-projects/", headers=owner_headers).json()) == 1


def test_cannot_download_another_users_tile_project_image(client, solved_result):
    owner_headers = _register_and_login(client)
    other_headers = _register_and_login(client)
    result = solved_result
    saved = client.post(
        "/api/tile-projects/", json=_save_payload(result), headers=owner_headers
    ).json()

    response = client.get(
        f"/api/tile-projects/{saved['id']}/image", headers=other_headers
    )
    assert response.status_code == 404


def test_save_tile_project_into_nonexistent_group_404s(client, solved_result):
    headers = _register_and_login(client)
    result = solved_result

    response = client.post(
        "/api/tile-projects/",
        json=_save_payload(result, group_id=str(uuid.uuid4())),
        headers=headers,
    )
    assert response.status_code == 404


def test_save_tile_project_into_another_users_group_404s(client, solved_result):
    owner_headers = _register_and_login(client)
    other_headers = _register_and_login(client)
    group = client.post(
        "/api/project-groups/", json={"name": "Kitchen"}, headers=owner_headers
    ).json()
    result = solved_result

    response = client.post(
        "/api/tile-projects/",
        json=_save_payload(result, group_id=group["id"]),
        headers=other_headers,
    )
    assert response.status_code == 404
    assert client.get("/api/tile-projects/", headers=owner_headers).json() == []


def test_save_rejects_an_empty_name(client, solved_result):
    headers = _register_and_login(client)
    result = solved_result

    response = client.post(
        "/api/tile-projects/", json=_save_payload(result, name=""), headers=headers
    )
    assert response.status_code == 422
