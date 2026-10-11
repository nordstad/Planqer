"""The catalogue country: asked for per request, chosen per user."""

import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.database import CatalogueEntry, User, engine

pytestmark = pytest.mark.api

PASSWORD = "Testpassword" + "123!"


@pytest.fixture
def client(monkeypatch):
    from planqer.api import app

    monkeypatch.delenv("PLANQER_CATALOGUE_COUNTRY", raising=False)
    with TestClient(app) as test_client:
        test_client.headers["X-Planqer-Setup-Secret"] = "test-setup-secret"
        yield test_client


def _register(client):
    email = f"country-{uuid.uuid4()}@example.com"
    client.post("/api/auth/register", json={"email": email, "password": PASSWORD})
    token = client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    ).json()["access_token"]
    return email, {"Authorization": f"Bearer {token}"}


def _admin(client):
    email, headers = _register(client)

    async def _set():
        async with AsyncSession(engine) as session:
            user = (
                await session.execute(select(User).where(User.email == email))
            ).scalar_one()
            user.is_admin = True
            await session.commit()

    asyncio.run(_set())
    return headers


@pytest.fixture(autouse=True)
def clean_entries(client):
    yield

    async def _wipe():
        async with AsyncSession(engine) as session:
            for entry in (await session.execute(select(CatalogueEntry))).scalars():
                await session.delete(entry)
            await session.commit()

    asyncio.run(_wipe())


def _country(client, query=""):
    return client.get(f"/api/catalogue/{query}").json()["country"]


# ── the public catalogue ─────────────────────────────────────────────────


def test_each_request_can_ask_for_its_own_country(client):
    assert _country(client, "?country=SE") == "SE"
    assert _country(client, "?country=no") == "NO"
    assert _country(client, "?country=generic") is None
    ids = {p["id"] for p in client.get("/api/catalogue/?country=NO").json()["products"]}
    assert "no:regel:48x98" in ids
    assert not any(i.startswith("se:") for i in ids)


def test_without_a_country_the_instance_default_applies(client, monkeypatch):
    assert _country(client) is None
    monkeypatch.setenv("PLANQER_CATALOGUE_COUNTRY", "SE")
    assert _country(client) == "SE"
    assert _country(client, "?country=NO") == "NO"
    assert _country(client, "?country=generic") is None


def test_an_unknown_country_falls_back_to_the_default(client, monkeypatch):
    assert _country(client, "?country=ZZ") is None
    monkeypatch.setenv("PLANQER_CATALOGUE_COUNTRY", "NO")
    assert _country(client, "?country=ZZ") == "NO"


def test_etags_are_per_country(client):
    se = client.get("/api/catalogue/?country=SE")
    no = client.get("/api/catalogue/?country=NO")
    assert se.headers["etag"] != no.headers["etag"]
    again = client.get(
        "/api/catalogue/?country=SE", headers={"If-None-Match": se.headers["etag"]}
    )
    assert again.status_code == 304
    other = client.get(
        "/api/catalogue/?country=NO", headers={"If-None-Match": se.headers["etag"]}
    )
    assert other.status_code == 200


def test_search_follows_the_country(client):
    se = client.get("/api/catalogue/products?q=45x95&country=SE").json()
    assert any(p["product"]["id"] == "se:regel:45x95" for p in se)
    no = client.get("/api/catalogue/products?q=45x95&country=NO").json()
    assert not any(p["product"]["id"].startswith("se:") for p in no)


# ── the admin's catalogue ────────────────────────────────────────────────


def test_admin_edits_the_catalogue_they_are_viewing(client):
    headers = _admin(client)
    no = client.get("/api/admin/catalogue?catalogue=NO", headers=headers).json()
    assert {
        item["product"]["country"] for item in no if item["origin"] == "builtin"
    } == {"NO"}

    hidden = client.post(
        "/api/admin/catalogue/no:regel:48x98/hide?catalogue=NO", headers=headers
    )
    assert hidden.status_code == 200
    assert "no:regel:48x98" not in {
        p["id"] for p in client.get("/api/catalogue/?country=NO").json()["products"]
    }
    # Another country's view doesn't know the entry.
    missing = client.post(
        "/api/admin/catalogue/no:regel:48x98/restore?catalogue=SE", headers=headers
    )
    assert missing.status_code == 404


def test_admin_additions_are_marked_with_the_viewed_country(client):
    headers = _admin(client)
    body = {"type": "regel", "thickness": 48, "width": 99, "lengths": [3000]}
    created = client.post(
        "/api/admin/catalogue?catalogue=NO", json=body, headers=headers
    )
    assert created.status_code == 201
    assert created.json()["product"]["country"] == "NO"
    assert created.json()["product"]["id"] == "local:regel:48x99"


# ── the user's choice ────────────────────────────────────────────────────


def test_catalogue_choice_defaults_to_automatic_and_is_per_user(client):
    _, first = _register(client)
    _, second = _register(client)
    assert (
        client.get("/api/settings/", headers=first).json()["catalogue_country"]
        == "auto"
    )

    response = client.put(
        "/api/settings/", json={"catalogue_country": "NO"}, headers=first
    )
    assert response.json()["catalogue_country"] == "NO"
    assert (
        client.get("/api/settings/", headers=first).json()["catalogue_country"] == "NO"
    )
    assert (
        client.get("/api/settings/", headers=second).json()["catalogue_country"]
        == "auto"
    )

    client.put("/api/settings/", json={"catalogue_country": "auto"}, headers=first)
    assert (
        client.get("/api/settings/", headers=first).json()["catalogue_country"]
        == "auto"
    )


def test_catalogue_choice_rejects_unknown_values(client):
    _, headers = _register(client)
    for value in ("ZZ", "se", ""):
        response = client.put(
            "/api/settings/", json={"catalogue_country": value}, headers=headers
        )
        assert response.status_code == 422


def test_saving_other_settings_keeps_the_catalogue_choice(client):
    _, headers = _register(client)
    client.put("/api/settings/", json={"catalogue_country": "SE"}, headers=headers)
    client.put("/api/settings/", json={"default_currency": "EUR"}, headers=headers)
    assert (
        client.get("/api/settings/", headers=headers).json()["catalogue_country"]
        == "SE"
    )


# ── starting values for new accounts ─────────────────────────────────────


@pytest.mark.parametrize(
    ("country", "currency"), [("SE", "SEK"), ("NO", "NOK"), (None, "SEK")]
)
def test_new_accounts_start_with_the_instance_countrys_currency(
    client, monkeypatch, country, currency
):
    if country:
        monkeypatch.setenv("PLANQER_CATALOGUE_COUNTRY", country)
    _, headers = _register(client)
    settings = client.get("/api/settings/", headers=headers).json()
    assert settings["default_currency"] == currency
    assert settings["default_vat_rate"] == 25.0
