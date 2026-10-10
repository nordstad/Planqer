"""Instance catalogue editing: local additions, overrides and hidden entries."""

import asyncio
import uuid
from urllib.parse import parse_qs, urlparse

import pytest
import yaml
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.catalogue import get_catalogue
from planqer.catalogue.loader import check_group, load_details
from planqer.catalogue.local import ProductDetails, build_product, build_suggestion
from planqer.catalogue.schema import CountryFile, ProductGroup
from planqer.database import CatalogueEntry, User, engine

pytestmark = pytest.mark.api

BUILT_IN = "se:regel:45x95"


@pytest.fixture
def client(monkeypatch):
    from planqer.api import app

    monkeypatch.setenv("PLANQER_CATALOGUE_COUNTRY", "SE")
    with TestClient(app) as test_client:
        test_client.headers["X-Planqer-Setup-Secret"] = "test-setup-secret"
        yield test_client


def _login(client, *, admin):
    password = "Testpassword" + "123!"
    email = f"cat-{uuid.uuid4()}@example.com"
    client.post("/api/auth/register", json={"email": email, "password": password})

    async def _set():
        async with AsyncSession(engine) as session:
            user = (
                await session.execute(select(User).where(User.email == email))
            ).scalar_one()
            user.is_admin = admin
            await session.commit()

    asyncio.run(_set())
    token = client.post(
        "/api/auth/login", json={"email": email, "password": password}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin(client):
    return _login(client, admin=True)


@pytest.fixture(autouse=True)
def clean_entries(client):
    yield

    async def _wipe():
        async with AsyncSession(engine) as session:
            for entry in (await session.execute(select(CatalogueEntry))).scalars():
                await session.delete(entry)
            await session.commit()

    asyncio.run(_wipe())


def _public_ids(client):
    return {p["id"] for p in client.get("/api/catalogue/").json()["products"]}


NEW_BOARD = {
    "type": "regel",
    "thickness": 48,
    "width": 98,
    "lengths": [2400, 3000],
    "grades": ["C24"],
    "species": ["spruce"],
    "sources": ["https://www.traguiden.se/example"],
    "note": "Local stock",
}


def test_admin_catalogue_requires_an_admin(client):
    assert client.get("/api/admin/catalogue").status_code == 401
    member = _login(client, admin=False)
    assert client.get("/api/admin/catalogue", headers=member).status_code == 403
    assert (
        client.post("/api/admin/catalogue", json=NEW_BOARD, headers=member).status_code
        == 403
    )
    assert (
        client.post(f"/api/admin/catalogue/{BUILT_IN}/hide", headers=member).status_code
        == 403
    )
    assert (
        client.delete(f"/api/admin/catalogue/{BUILT_IN}", headers=member).status_code
        == 403
    )


def test_listing_shows_built_ins_untouched(client, admin):
    items = client.get("/api/admin/catalogue", headers=admin).json()
    assert len(items) == len(get_catalogue("SE").products)
    assert {i["origin"] for i in items} == {"builtin"}
    assert not any(i["hidden"] for i in items)


def test_admin_adds_a_missing_product_for_the_local_instance(client, admin):
    assert "local:regel:48x98" not in _public_ids(client)
    created = client.post("/api/admin/catalogue", json=NEW_BOARD, headers=admin)
    assert created.status_code == 201
    assert created.json()["origin"] == "local"

    served = {p["id"]: p for p in client.get("/api/catalogue/").json()["products"]}
    product = served["local:regel:48x98"]
    assert product["country"] == "SE"
    assert product["lengths"] == [2400, 3000]
    assert product["note"] == "Local stock"
    # Built-ins are still all there.
    assert BUILT_IN in served


def test_adding_changes_the_etag_so_cached_clients_refresh(client, admin):
    etag = client.get("/api/catalogue/").headers["etag"]
    client.post("/api/admin/catalogue", json=NEW_BOARD, headers=admin)
    stale = client.get("/api/catalogue/", headers={"If-None-Match": etag})
    assert stale.status_code == 200
    assert stale.headers["etag"] != etag


def test_adding_works_without_any_source(client, admin):
    body = {**NEW_BOARD, "sources": []}
    created = client.post("/api/admin/catalogue", json=body, headers=admin)
    assert created.status_code == 201
    assert created.json()["product"]["sources"] == []


def test_a_local_sheet_can_be_added(client, admin):
    body = {
        "type": "plywood",
        "thickness": 21,
        "formats": [{"width": 1220, "height": 2440}],
    }
    created = client.post("/api/admin/catalogue", json=body, headers=admin)
    assert created.status_code == 201
    product = created.json()["product"]
    assert product["id"] == "local:plywood:21"
    assert product["kind"] == "sheet"


@pytest.mark.parametrize(
    "change, fragment",
    [
        ({"type": "nonsense"}, "unknown product type"),
        ({"type": "custom"}, "free-text"),
        ({"type": "sheet-custom", "width": None}, "free-text"),
        ({"width": None}, "needs a width"),
        ({"lengths": [16000]}, "above 15000"),
        ({"max_length": 20000}, "above 15000"),
        ({"species": ["unobtainium"]}, "unknown species"),
        ({"sources": ["http://insecure.example"]}, "https"),
        ({"formats": [{"width": 1220, "height": 2440}]}, "sheet formats"),
        (
            {
                "type": "plywood",
                "width": None,
                "lengths": [],
                "grades": [],
                "species": [],
                "formats": [{"width": 12000, "height": 2440}],
            },
            "sheet side",
        ),
        ({"type": "plywood", "width": 95}, "not width"),
    ],
)
def test_local_entries_face_the_same_validation_as_built_in_data(
    client, admin, change, fragment
):
    response = client.post(
        "/api/admin/catalogue", json={**NEW_BOARD, **change}, headers=admin
    )
    assert response.status_code == 422
    assert fragment in str(response.json())


def test_non_positive_sizes_and_unknown_fields_are_rejected(client, admin):
    assert (
        client.post(
            "/api/admin/catalogue", json={**NEW_BOARD, "thickness": 0}, headers=admin
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/admin/catalogue", json={**NEW_BOARD, "price": 12}, headers=admin
        ).status_code
        == 422
    )


def test_adding_an_existing_product_is_a_conflict(client, admin):
    assert (
        client.post("/api/admin/catalogue", json=NEW_BOARD, headers=admin).status_code
        == 201
    )
    assert (
        client.post("/api/admin/catalogue", json=NEW_BOARD, headers=admin).status_code
        == 409
    )


def test_a_built_in_can_be_hidden_and_restored(client, admin):
    hidden = client.post(f"/api/admin/catalogue/{BUILT_IN}/hide", headers=admin)
    assert hidden.status_code == 200
    assert hidden.json()["hidden"] is True
    assert BUILT_IN not in _public_ids(client)
    listed = {
        i["product"]["id"]: i
        for i in client.get("/api/admin/catalogue", headers=admin).json()
    }
    assert listed[BUILT_IN]["hidden"] is True

    restored = client.post(f"/api/admin/catalogue/{BUILT_IN}/restore", headers=admin)
    assert restored.json()["hidden"] is False
    assert BUILT_IN in _public_ids(client)


def test_a_built_in_can_be_overridden_and_reverted(client, admin):
    original = next(p for p in get_catalogue("SE").products if p.id == BUILT_IN)
    update = {
        "lengths": [3000],
        "grades": ["C24"],
        "species": ["pine"],
        "note": "Only 3 m here",
    }
    response = client.put(
        f"/api/admin/catalogue/{BUILT_IN}", json=update, headers=admin
    )
    assert response.status_code == 200
    assert response.json()["origin"] == "modified"

    served = next(
        p
        for p in client.get("/api/catalogue/").json()["products"]
        if p["id"] == BUILT_IN
    )
    assert served["lengths"] == [3000]
    assert served["note"] == "Only 3 m here"
    assert served["thickness"] == 45 and served["width"] == 95
    assert served["country"] == "SE"
    # The shipped data is unchanged.
    assert len(original.lengths) > 1

    assert (
        client.delete(f"/api/admin/catalogue/{BUILT_IN}", headers=admin).status_code
        == 204
    )
    reverted = next(
        p
        for p in client.get("/api/catalogue/").json()["products"]
        if p["id"] == BUILT_IN
    )
    assert reverted["lengths"] == [float(v) for v in original.lengths]


def test_an_override_is_validated(client, admin):
    response = client.put(
        f"/api/admin/catalogue/{BUILT_IN}", json={"lengths": [99999]}, headers=admin
    )
    assert response.status_code == 422


def test_a_local_entry_can_be_edited_hidden_and_deleted(client, admin):
    client.post("/api/admin/catalogue", json=NEW_BOARD, headers=admin)
    path = "/api/admin/catalogue/local:regel:48x98"
    edited = client.put(path, json={"lengths": [4800]}, headers=admin)
    assert edited.json()["origin"] == "local"
    assert edited.json()["product"]["lengths"] == [4800]

    client.post(f"{path}/hide", headers=admin)
    assert "local:regel:48x98" not in _public_ids(client)
    client.post(f"{path}/restore", headers=admin)
    assert "local:regel:48x98" in _public_ids(client)

    assert client.delete(path, headers=admin).status_code == 204
    assert "local:regel:48x98" not in _public_ids(client)
    assert client.get("/api/admin/catalogue", headers=admin).status_code == 200


def test_unknown_entries_are_404(client, admin):
    path = "/api/admin/catalogue/se:regel:1x1"
    assert client.put(path, json={}, headers=admin).status_code == 404
    assert client.post(f"{path}/hide", headers=admin).status_code == 404
    assert client.delete(path, headers=admin).status_code == 404
    assert (
        client.get(f"{path}/suggestion?source=https://a.se", headers=admin).status_code
        == 404
    )


def test_old_snapshots_are_not_touched_by_hiding(client, admin):
    """Plans snapshot the product, so hiding only affects what the picker offers."""
    client.post(f"/api/admin/catalogue/{BUILT_IN}/hide", headers=admin)
    assert client.get("/api/catalogue/").status_code == 200


# ── contributing upstream ────────────────────────────────────────────────


def _suggestion(client, admin, product_id, **params):
    return client.get(
        f"/api/admin/catalogue/{product_id}/suggestion", params=params, headers=admin
    )


def test_suggestion_is_a_prefilled_issue_with_a_valid_yaml_snippet(client, admin):
    client.post(
        "/api/admin/catalogue", json={**NEW_BOARD, "sources": []}, headers=admin
    )
    response = _suggestion(
        client, admin, "local:regel:48x98", source="https://www.traguiden.se/abc"
    )
    assert response.status_code == 200
    body = response.json()

    url = urlparse(body["url"])
    assert (url.scheme, url.netloc, url.path) == (
        "https",
        "github.com",
        "/nordstad/Planqer/issues/new",
    )
    query = parse_qs(url.query)
    assert query["template"] == ["catalogue-product.yml"]
    assert query["country"] == ["SE"]
    assert query["product"] == ["regel 48x98"]
    assert query["source"] == ["https://www.traguiden.se/abc"]
    assert query["title"] == [body["title"]]

    snippet = yaml.safe_load(query["snippet"][0])
    assert snippet["country"] == "SE"
    (group,) = snippet["products"]
    parsed = ProductGroup(**group)
    check_group(parsed, "board", load_details())
    assert parsed.sizes == ["48x98"]
    assert parsed.lengths == [2400, 3000]
    assert parsed.sources == ["https://www.traguiden.se/abc"]
    assert parsed.note == "Local stock"
    # Same shape as a built-in country file.
    CountryFile(country="SE", name="Sweden", products=[parsed])


def test_suggestion_for_a_sheet_uses_the_sheet_shape(client, admin):
    body = {
        "type": "plywood",
        "thickness": 21,
        "formats": [{"width": 1220, "height": 2440}],
    }
    client.post("/api/admin/catalogue", json=body, headers=admin)
    response = _suggestion(
        client, admin, "local:plywood:21", source="https://www.metsagroup.com/x"
    )
    group = yaml.safe_load(response.json()["snippet"])["products"][0]
    assert group["thicknesses"] == [21]
    assert group["formats"] == ["1220x2440"]
    assert "sizes" not in group


def test_suggestion_needs_a_source_and_a_country(client, admin, monkeypatch):
    client.post(
        "/api/admin/catalogue", json={**NEW_BOARD, "sources": []}, headers=admin
    )
    missing = _suggestion(client, admin, "local:regel:48x98")
    assert missing.status_code == 422
    assert "source" in missing.json()["detail"]
    assert (
        _suggestion(
            client, admin, "local:regel:48x98", source="http://x.se"
        ).status_code
        == 422
    )


def test_suggestion_needs_a_country_when_the_instance_has_none(
    client, admin, monkeypatch
):
    monkeypatch.delenv("PLANQER_CATALOGUE_COUNTRY")
    client.post("/api/admin/catalogue", json=NEW_BOARD, headers=admin)
    path = "local:regel:48x98"
    missing = _suggestion(client, admin, path)
    assert missing.status_code == 422
    assert "country" in missing.json()["detail"]
    assert _suggestion(client, admin, path, country="no").json()["country"] == "NO"


def test_a_built_in_entry_can_be_suggested_with_its_own_sources(client, admin):
    response = _suggestion(client, admin, BUILT_IN)
    assert response.status_code == 200
    assert response.json()["source"].startswith("https://")


def test_building_a_suggestion_sends_nothing(monkeypatch):
    import socket

    def refuse(*args, **kwargs):
        raise AssertionError("no network access expected")

    monkeypatch.setattr(socket, "create_connection", refuse)
    product = build_product("regel", 48, 98, ProductDetails(), country="SE")
    suggestion = build_suggestion(product, source="https://a.se", country="se")
    assert suggestion.url.startswith("https://github.com/nordstad/Planqer/issues/new?")


def test_bad_stored_data_is_ignored_not_fatal(client, admin):
    async def _plant():
        async with AsyncSession(engine) as session:
            session.add(CatalogueEntry(product_id="local:broken", data="{not json"))
            await session.commit()

    asyncio.run(_plant())
    assert client.get("/api/catalogue/").status_code == 200
    assert "local:broken" not in _public_ids(client)
