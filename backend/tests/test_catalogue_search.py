"""Catalogue product search and detail aliases."""

import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.catalogue import get_catalogue
from planqer.catalogue.search import fold, search_products
from planqer.database import CatalogueEntry, engine


def ids(results):
    return [r.product.id for r in results]


def test_fold_ignores_case_and_diacritics():
    assert fold("Kärnfuru Björk") == "karnfuru bjork"


def test_search_by_name_size_and_grade():
    catalogue = get_catalogue("SE")
    assert ids(search_products(catalogue, "regel 45x95"))[0] == "se:regel:45x95"
    assert "se:regel:45x95" in ids(search_products(catalogue, "45 × 95"))
    assert "se:regel:45x95" in ids(search_products(catalogue, "c24 45x95"))
    assert all(
        r.product.kind == "sheet"
        for r in search_products(catalogue, "plywood 15", kind="sheet")
    )
    assert ids(search_products(catalogue, "plywood 15"))[0] == "se:plywood:15"


def test_search_matches_aliases_in_any_language():
    catalogue = get_catalogue("SE")
    assert "se:plywood:15" in ids(search_products(catalogue, "kryssfiner 15"))
    assert "se:osb:12" in ids(search_products(catalogue, "osb/3 12"))
    assert search_products(catalogue, "kärnfuru")


def test_every_word_has_to_match_and_sizes_have_to_fit():
    catalogue = get_catalogue("SE")
    assert search_products(catalogue, "regel zzzz") == []
    assert search_products(catalogue, "regel 1x1") == []


def test_results_are_limited_named_and_localised():
    catalogue = get_catalogue("SE")
    results = search_products(catalogue, "regel", limit=3, lang="sv")
    assert len(results) == 3
    assert results[0].name.startswith("Träreglar ")
    assert search_products(catalogue, "45x95", lang="en")[0].name.endswith("45 × 95 mm")


def test_free_text_types_are_never_results():
    assert not any(
        r.product.type in ("custom", "sheet-custom")
        for r in search_products(get_catalogue("SE"), "annat")
    )


def test_generic_catalogue_has_nothing_to_find():
    assert search_products(get_catalogue(None), "regel") == []


def test_detail_aliases_are_unambiguous():
    details = get_catalogue(None).details
    for options in (details.species, details.treatment, details.profile):
        seen: dict[str, str] = {}
        for option in options:
            names = {
                fold(option.key.replace("-", " ")),
                *map(fold, option.labels.values()),
                *map(fold, option.aliases),
            }
            for name in names:
                assert seen.setdefault(name, option.key) == option.key, (
                    f"'{name}' names two options"
                )


@pytest.fixture
def client(monkeypatch):
    from planqer.api import app

    monkeypatch.setenv("PLANQER_CATALOGUE_COUNTRY", "SE")
    with TestClient(app) as test_client:
        yield test_client


@pytest.mark.api
def test_search_endpoint_is_public_and_validates_input(client):
    response = client.get(
        "/api/catalogue/products", params={"q": "regel 45x95", "lang": "sv"}
    )
    assert response.status_code == 200
    first = response.json()[0]
    assert first["product"]["id"] == "se:regel:45x95"
    assert first["name"] == "Träreglar 45 × 95 mm"
    assert (
        client.get("/api/catalogue/products", params={"kind": "nope"}).status_code
        == 422
    )
    assert (
        client.get("/api/catalogue/products", params={"limit": 500}).status_code == 422
    )


@pytest.mark.api
def test_search_endpoint_sees_local_additions_and_not_hidden_entries(client):
    async def plant():
        async with AsyncSession(engine) as session:
            session.add(CatalogueEntry(product_id="se:regel:45x95", hidden=True))
            await session.commit()

    async def wipe():
        async with AsyncSession(engine) as session:
            for entry in (await session.execute(select(CatalogueEntry))).scalars():
                await session.delete(entry)
            await session.commit()

    asyncio.run(plant())
    try:
        found = [
            r["product"]["id"]
            for r in client.get("/api/catalogue/products", params={"q": "45x95"}).json()
        ]
        assert "se:regel:45x95" not in found
        assert "se:tryckimpregnerat:45x95" in found
    finally:
        asyncio.run(wipe())
