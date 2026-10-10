from urllib.parse import urlparse

import pytest
import yaml
from fastapi.testclient import TestClient
from pydantic import ValidationError

from planqer.catalogue import (
    available_countries,
    configured_country,
    get_catalogue,
    loader,
)
from planqer.catalogue.schema import ProductGroup, ProductType

REQUIRED_BOARD_TYPES = {
    "regel",
    "trall",
    "lakt",
    "ytterpanel",
    "innerpanel",
    "limtra",
    "rundstav",
    "planhyvlat",
    "list",
    "raspont",
    "vangstycke",
    "sagat",
    "custom",
}
REQUIRED_SHEET_TYPES = {"plywood", "osb", "spanskiva", "gipsskiva", "mdf", "board"}
# Manufacturer, standards and industry sources only — never retailers.
ALLOWED_SOURCE_HOSTS = {
    "www.traguiden.se",
    "www.svenskttra.se",
    "www.traprodukter.se",
    "www.metsagroup.com",
    "www.egger.com",
    "kronospan.com",
    "media-prod.beijerflow.com",
    "byggkatalogen.byggtjanst.se",
    "www.norgips.se",
    "www.moelven.com",
    "www.skogmobruk.no",
    "norgips.no",
}


def test_every_country_file_loads_and_validates():
    assert available_countries() == ["NO", "SE"]
    for country in available_countries():
        assert get_catalogue(country).products


def test_types_cover_the_initial_swedish_categories_and_sheets():
    keys = {t.key for t in get_catalogue(None).types}
    assert REQUIRED_BOARD_TYPES <= keys
    assert REQUIRED_SHEET_TYPES <= keys
    assert "tryckimpregnerat" in keys
    assert "sheet-custom" in keys


def test_generic_catalogue_has_types_and_details_but_no_country_entries():
    generic = get_catalogue(None)
    assert generic.country is None
    assert generic.products == []
    assert {o.key for o in generic.details.treatment} >= {"ntr-a-green", "ntr-ab-brown"}


def test_every_label_has_all_three_locales():
    catalogue = get_catalogue("SE")
    for item in [
        *catalogue.types,
        *catalogue.details.species,
        *catalogue.details.treatment,
        *catalogue.details.profile,
    ]:
        assert set(item.labels) == {"en", "sv", "nb"}, item


@pytest.mark.parametrize("country", ["SE", "NO"])
def test_every_entry_cites_an_allowed_source(country):
    for product in get_catalogue(country).products:
        assert product.sources, product.id
        for url in product.sources:
            parsed = urlparse(url)
            assert parsed.scheme == "https"
            assert parsed.hostname in ALLOWED_SOURCE_HOSTS, (product.id, url)


def test_standard_swedish_lengths_are_offered_for_framing_timber():
    regel = next(p for p in get_catalogue("SE").products if p.id == "se:regel:45x95")
    assert regel.lengths == [
        1800,
        2100,
        2400,
        2700,
        3000,
        3300,
        3600,
        3900,
        4200,
        4500,
        4800,
        5100,
        5400,
    ]


def test_glulam_is_stocked_to_12m_and_within_the_15m_limit():
    glulam = [p for p in get_catalogue("SE").products if p.type == "limtra"]
    assert glulam
    assert all(p.max_length == 12000 for p in glulam)


@pytest.mark.parametrize("country", ["SE", "NO"])
def test_board_lengths_never_exceed_15000_and_sheets_never_exceed_10000(country):
    for product in get_catalogue(country).products:
        assert all(length <= 15000 for length in product.lengths)
        assert all(max(f.width, f.height) <= 10000 for f in product.formats)


def test_norwegian_catalogue_uses_norwegian_dimensions_and_cited_lengths():
    catalogue = get_catalogue("NO")
    assert catalogue.country_name == "Norway"
    by_id = {p.id: p for p in catalogue.products}
    regel = by_id["no:regel:48x98"]
    assert regel.lengths == [2400, 3000, 3300, 3600, 3900, 4200, 4500, 4800, 5100, 5400]
    assert "no:regel:45x95" not in by_id
    assert {"cu-a", "cu-ab"} <= set(by_id["no:tryckimpregnerat:48x98"].treatments)


def test_norwegian_glulam_is_gl30c_to_15m():
    glulam = [p for p in get_catalogue("NO").products if p.type == "limtra"]
    assert glulam
    assert all(p.max_length == 15000 and p.grades == ["GL30c"] for p in glulam)
    assert {p.thickness for p in glulam} == {90, 115, 140}


def test_norwegian_sheets_have_their_published_formats():
    sheets = {p.id: p for p in get_catalogue("NO").products if p.kind == "sheet"}
    assert {"no:plywood:12", "no:osb:9", "no:gipsskiva:12.5", "no:mdf:16"} <= set(
        sheets
    )
    gips = {(f.width, f.height) for f in sheets["no:gipsskiva:12.5"].formats}
    assert (1200, 2400) in gips and (900, 3200) in gips


def test_bench_cross_sections_exist_in_the_swedish_catalogue():
    ids = {p.id for p in get_catalogue("SE").products}
    assert "se:regel:45x95" in ids
    assert "se:planhyvlat:95x95" in ids


@pytest.mark.parametrize("country", ["SE", "NO"])
def test_sheet_entries_carry_formats_and_board_entries_carry_width(country):
    for product in get_catalogue(country).products:
        if product.kind == "sheet":
            assert product.formats and product.width is None
        else:
            assert product.width and not product.formats


def test_group_requires_https_sources():
    with pytest.raises(ValidationError):
        ProductGroup(type="regel", sources=["http://example.com"], sizes=["45x95"])


def test_type_labels_need_english():
    with pytest.raises(ValidationError):
        ProductType(key="x", kind="board", rank=1, labels={"sv": "x"})


def test_type_keys_must_be_lowercase_hyphenated():
    with pytest.raises(ValidationError):
        ProductType(key="Bad Key", kind="board", rank=1, labels={"en": "x"})


def _write_country(tmp_path, monkeypatch, body: str):
    (tmp_path / "xx.yaml").write_text(body)
    for name in ("types.yaml", "details.yaml"):
        (tmp_path / name).write_text((loader.DATA_DIR / name).read_text())
    monkeypatch.setattr(loader, "DATA_DIR", tmp_path)
    loader.load_types.cache_clear()
    loader.load_details.cache_clear()
    get_catalogue.cache_clear()


@pytest.fixture
def restore_catalogue():
    yield
    loader.load_types.cache_clear()
    loader.load_details.cache_clear()
    get_catalogue.cache_clear()


def _country(products: str, code: str = "XX") -> str:
    return f"country: {code}\nname: Test\nproducts:\n{products}"


@pytest.mark.parametrize(
    ("products", "message"),
    [
        (
            "  - {type: nope, sources: ['https://a.se'], sizes: [45x95]}",
            "unknown product type",
        ),
        (
            "  - {type: regel, sources: ['https://a.se'], sizes: [45x95, 45x95]}",
            "duplicate product ids",
        ),
        (
            "  - {type: regel, sources: ['https://a.se'], sizes: [45x95], lengths: [15001]}",
            "above 15000",
        ),
        (
            "  - {type: regel, sources: ['https://a.se'], sizes: [45x95], species: [mahogany]}",
            "unknown species",
        ),
        (
            "  - {type: regel, sources: ['https://a.se'], thicknesses: [45]}",
            "use 'sizes'",
        ),
        (
            "  - {type: plywood, sources: ['https://a.se'], thicknesses: [12], formats: [1200x10001]}",
            "above 10000",
        ),
        (
            "  - {type: plywood, sources: ['https://a.se'], sizes: [12x12]}",
            "use thicknesses",
        ),
        (
            "  - {type: regel, sources: ['https://a.se'], sizes: ['45*95']}",
            "not a size",
        ),
    ],
)
def test_invalid_country_data_is_rejected(
    tmp_path, monkeypatch, restore_catalogue, products, message
):
    _write_country(tmp_path, monkeypatch, _country(products))
    with pytest.raises((ValueError, ValidationError), match=message):
        get_catalogue("XX")


def test_country_file_must_match_its_filename(tmp_path, monkeypatch, restore_catalogue):
    _write_country(
        tmp_path,
        monkeypatch,
        _country("  - {type: regel, sources: ['https://a.se'], sizes: [45x95]}", "YY"),
    )
    with pytest.raises(ValueError, match="declares country YY"):
        get_catalogue("XX")


def test_country_codes_must_be_two_letter_upper_case(
    tmp_path, monkeypatch, restore_catalogue
):
    _write_country(
        tmp_path,
        monkeypatch,
        _country("  - {type: regel, sources: ['https://a.se'], sizes: [45x95]}", "swe"),
    )
    with pytest.raises(ValidationError):
        get_catalogue("XX")


def test_duplicate_type_keys_are_rejected(tmp_path, monkeypatch, restore_catalogue):
    _write_country(
        tmp_path,
        monkeypatch,
        _country("  - {type: regel, sources: ['https://a.se'], sizes: [45x95]}"),
    )
    types = yaml.safe_load((tmp_path / "types.yaml").read_text())
    types["types"].append(types["types"][0])
    (tmp_path / "types.yaml").write_text(yaml.safe_dump(types))
    loader.load_types.cache_clear()
    with pytest.raises(ValueError, match="duplicate product type keys"):
        loader.load_types()


def test_duplicate_detail_keys_are_rejected(tmp_path, monkeypatch, restore_catalogue):
    _write_country(
        tmp_path,
        monkeypatch,
        _country("  - {type: regel, sources: ['https://a.se'], sizes: [45x95]}"),
    )
    details = yaml.safe_load((tmp_path / "details.yaml").read_text())
    details["species"].append(details["species"][0])
    (tmp_path / "details.yaml").write_text(yaml.safe_dump(details))
    loader.load_details.cache_clear()
    with pytest.raises(ValueError, match="duplicate detail option keys"):
        loader.load_details()


def test_length_range_must_not_end_before_it_starts():
    with pytest.raises(ValidationError):
        ProductGroup(
            type="regel",
            sources=["https://a.se"],
            sizes=["45x95"],
            length_range={"from": 3000, "to": 2400, "step": 300},
        )


def test_unset_or_unknown_country_falls_back_to_generic(monkeypatch):
    monkeypatch.delenv("PLANQER_CATALOGUE_COUNTRY", raising=False)
    assert configured_country() is None
    monkeypatch.setenv("PLANQER_CATALOGUE_COUNTRY", "zz")
    assert configured_country() is None
    monkeypatch.setenv("PLANQER_CATALOGUE_COUNTRY", " se ")
    assert configured_country() == "SE"


# ── API ──────────────────────────────────────────────────────────────────


@pytest.fixture
def client():
    from planqer.api import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.mark.api
def test_catalogue_endpoint_is_public_and_generic_by_default(client, monkeypatch):
    monkeypatch.delenv("PLANQER_CATALOGUE_COUNTRY", raising=False)
    response = client.get("/api/catalogue/")
    assert response.status_code == 200
    body = response.json()
    assert body["country"] is None
    assert body["products"] == []
    assert any(t["key"] == "regel" for t in body["types"])


@pytest.mark.api
def test_catalogue_endpoint_serves_norway_too(client, monkeypatch):
    monkeypatch.setenv("PLANQER_CATALOGUE_COUNTRY", "no")
    body = client.get("/api/catalogue/").json()
    assert body["country"] == "NO"
    assert any(p["id"] == "no:regel:48x98" for p in body["products"])
    assert not any(p["id"].startswith("se:") for p in body["products"])


@pytest.mark.api
def test_catalogue_endpoint_serves_the_configured_country(client, monkeypatch):
    monkeypatch.setenv("PLANQER_CATALOGUE_COUNTRY", "SE")
    body = client.get("/api/catalogue/").json()
    assert body["country"] == "SE"
    assert body["country_name"] == "Sweden"
    assert any(p["id"] == "se:regel:45x95" for p in body["products"])


@pytest.mark.api
def test_catalogue_endpoint_supports_etag_revalidation(client, monkeypatch):
    monkeypatch.setenv("PLANQER_CATALOGUE_COUNTRY", "SE")
    first = client.get("/api/catalogue/")
    etag = first.headers["etag"]
    assert first.headers["cache-control"] == "no-cache"
    again = client.get("/api/catalogue/", headers={"If-None-Match": etag})
    assert again.status_code == 304
    assert again.content == b""
    monkeypatch.delenv("PLANQER_CATALOGUE_COUNTRY")
    other = client.get("/api/catalogue/", headers={"If-None-Match": etag})
    assert other.status_code == 200
    assert other.headers["etag"] != etag
