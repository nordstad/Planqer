import uuid

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.api


@pytest.fixture
def client():
    from planqer.api import app

    with TestClient(app) as test_client:
        test_client.headers["X-Planqer-Setup-Secret"] = "test-setup-secret"
        yield test_client


def _register_and_login(client) -> dict:
    user = {
        "email": f"test-{uuid.uuid4()}@example.com",
        "password": "Testpassword" + "123!",
    }
    client.post("/api/auth/register", json=user)
    token = client.post("/api/auth/login", json=user).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


SOLVED_PLAN = {
    "optimal_board_length": 2500,
    "cost": 88.0,
    "total_waste": 888.0,
    "board_lengths_used": [2500.0],
    "cut_list": [[400.0, 400.0, 400.0, 400.0]],
    "visualization": "data:image/svg+xml;base64,",
    "algorithm_used": "first_fit_decreasing",
}


def _save_payload(plan: dict) -> dict:
    return {
        "name": "Chair rails",
        "parts_data": {"400": 4},
        "board_lengths": [2500],
        "saw_blade_width": 3,
        "material_type": "oak",
        "board_thickness": 45,
        "board_width": 45,
        "optimization_result": plan,
    }


def _layout(client, headers) -> dict:
    sheet = {
        "parts": {"shelf": {"width": 400, "height": 300, "quantity": 2}},
        "sheet_width": 1220,
        "sheet_height": 2440,
        "kerf_width": 3,
    }
    response = client.post("/sheet-optimization", json=sheet, headers=headers)
    assert response.status_code == 200
    return response.json()


def _save_sheet_payload(layout: dict) -> dict:
    return {
        "name": "Shelf panels",
        "parts_data": [{"name": "shelf", "width": 400, "height": 300, "quantity": 2}],
        "sheet_width": 1220,
        "sheet_height": 2440,
        "kerf_width": 3,
        "material_type": "plywood",
        "sheet_thickness": 12,
        "optimization_result": layout,
    }


BOARD_PRODUCT = {
    "type": "regel",
    "name": "Framing timber 45 × 95 mm",
    "catalogue_id": "se:regel:45x95",
    "country": "SE",
    "labels": {"en": "Framing timber / studs", "sv": "Träreglar"},
    "thickness": 45,
    "width": 95,
    "lengths": [2400, 2700, 3000],
    "sources": ["https://www.traguiden.se/produkter/konstruktionsvirke/"],
    "details": {"species": "spruce", "grade": "C24", "text": "Dry"},
    "suggested": True,
}
SHEET_PRODUCT = {
    "type": "plywood",
    "name": "Plywood 15 mm",
    "catalogue_id": "se:plywood:15",
    "country": "SE",
    "thickness": 15,
    "formats": [{"width": 1200, "height": 2400}],
}


def test_board_plan_keeps_its_product_snapshot(client):
    headers = _register_and_login(client)
    payload = {**_save_payload(SOLVED_PLAN), "product": BOARD_PRODUCT}

    saved = client.post("/api/projects/", json=payload, headers=headers).json()

    assert saved["product"]["catalogue_id"] == "se:regel:45x95"
    assert saved["product"]["details"] == {
        "species": "spruce",
        "treatment": None,
        "grade": "C24",
        "profile": None,
        "text": "Dry",
    }
    assert saved["product"]["suggested"] is True
    listed = client.get("/api/projects/", headers=headers).json()[0]
    assert listed["product"] == saved["product"]
    assert listed["material_type"] == "oak"


def test_snapshot_is_unaffected_by_later_catalogue_changes(client, monkeypatch):
    headers = _register_and_login(client)
    monkeypatch.setenv("PLANQER_CATALOGUE_COUNTRY", "SE")
    payload = {**_save_payload(SOLVED_PLAN), "product": BOARD_PRODUCT}
    saved = client.post("/api/projects/", json=payload, headers=headers).json()

    monkeypatch.delenv("PLANQER_CATALOGUE_COUNTRY")
    again = client.get(f"/api/projects/{saved['id']}", headers=headers).json()

    assert again["product"]["lengths"] == [2400, 2700, 3000]
    assert again["product"]["catalogue_id"] == "se:regel:45x95"


def test_old_board_plans_without_a_product_stay_readable(client):
    headers = _register_and_login(client)
    saved = client.post(
        "/api/projects/", json=_save_payload(SOLVED_PLAN), headers=headers
    ).json()

    assert saved["product"] is None
    assert saved["material_type"] == "oak"


def test_board_material_label_falls_back_to_the_product_name(client):
    headers = _register_and_login(client)
    payload = {
        **_save_payload(SOLVED_PLAN),
        "material_type": "",
        "product": BOARD_PRODUCT,
    }

    saved = client.post("/api/projects/", json=payload, headers=headers).json()

    assert saved["material_type"] == "Framing timber 45 × 95 mm"


def test_board_product_can_be_changed_and_cleared(client):
    headers = _register_and_login(client)
    saved = client.post(
        "/api/projects/", json=_save_payload(SOLVED_PLAN), headers=headers
    ).json()
    url = f"/api/projects/{saved['id']}"

    with_product = client.put(
        url, json={"product": BOARD_PRODUCT}, headers=headers
    ).json()
    assert with_product["product"]["type"] == "regel"
    untouched = client.put(url, json={"name": "Renamed"}, headers=headers).json()
    assert untouched["product"]["type"] == "regel"
    cleared = client.put(url, json={"product": None}, headers=headers).json()
    assert cleared["product"] is None


def test_sheet_plan_keeps_its_product_snapshot(client):
    headers = _register_and_login(client)
    payload = {
        **_save_sheet_payload(_layout(client, headers)),
        "product": SHEET_PRODUCT,
    }

    saved = client.post("/api/sheet-projects/", json=payload, headers=headers).json()

    assert saved["product"]["formats"] == [{"width": 1200, "height": 2400}]
    listed = client.get("/api/sheet-projects/", headers=headers).json()[0]
    assert listed["product"]["catalogue_id"] == "se:plywood:15"
    assert listed["material_type"] == "plywood"


def test_sheet_product_can_be_changed_and_cleared(client):
    headers = _register_and_login(client)
    saved = client.post(
        "/api/sheet-projects/",
        json=_save_sheet_payload(_layout(client, headers)),
        headers=headers,
    ).json()
    assert saved["product"] is None
    url = f"/api/sheet-projects/{saved['id']}"

    assert (
        client.put(url, json={"product": SHEET_PRODUCT}, headers=headers).json()[
            "product"
        ]["type"]
        == "plywood"
    )
    assert (
        client.put(url, json={"name": "New"}, headers=headers).json()["product"]["type"]
        == "plywood"
    )
    assert (
        client.put(url, json={"product": None}, headers=headers).json()["product"]
        is None
    )


@pytest.mark.parametrize(
    "bad",
    [
        {**BOARD_PRODUCT, "type": "Bad Type"},
        {**BOARD_PRODUCT, "name": ""},
        {**BOARD_PRODUCT, "country": "swe"},
        {**BOARD_PRODUCT, "unexpected": 1},
        {**BOARD_PRODUCT, "lengths": [1] * 61},
        {**BOARD_PRODUCT, "details": {"species": "x" * 101}},
    ],
)
def test_malformed_snapshots_are_rejected(client, bad):
    headers = _register_and_login(client)
    payload = {**_save_payload(SOLVED_PLAN), "product": bad}

    assert (
        client.post("/api/projects/", json=payload, headers=headers).status_code == 422
    )
