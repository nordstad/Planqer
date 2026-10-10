"""Load, validate and expand the built-in product catalogue.

Everything is validated when a country is first loaded, so a bad data file
fails the test suite (and a deploy) rather than a user's request.
"""

import os
from functools import cache, lru_cache
from pathlib import Path

import yaml

from planqer.catalogue.schema import (
    MAX_BOARD_LENGTH_MM,
    MAX_SHEET_SIDE_MM,
    Catalogue,
    CountryFile,
    DetailVocabulary,
    Product,
    ProductGroup,
    ProductType,
    SheetFormat,
    parse_size,
)

DATA_DIR = Path(__file__).parent / "data"
COUNTRY_ENV = "PLANQER_CATALOGUE_COUNTRY"


def _read(name: str) -> dict:
    with (DATA_DIR / name).open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def _number(value: float) -> str:
    return f"{value:g}"


@lru_cache(maxsize=1)
def load_types() -> tuple[ProductType, ...]:
    types = tuple(ProductType(**item) for item in _read("types.yaml")["types"])
    keys = [t.key for t in types]
    duplicates = {k for k in keys if keys.count(k) > 1}
    if duplicates:
        raise ValueError(f"duplicate product type keys: {sorted(duplicates)}")
    return types


@lru_cache(maxsize=1)
def load_details() -> DetailVocabulary:
    vocabulary = DetailVocabulary(**_read("details.yaml"))
    for options in (vocabulary.species, vocabulary.treatment, vocabulary.profile):
        keys = [o.key for o in options]
        if len(keys) != len(set(keys)):
            raise ValueError("duplicate detail option keys")
    return vocabulary


def available_countries() -> list[str]:
    return sorted(p.stem.upper() for p in DATA_DIR.glob("??.yaml"))


def _lengths(group: ProductGroup) -> list[float]:
    values = set(group.lengths)
    if group.length_range:
        r = group.length_range
        values.update(range(r.from_, r.to + 1, r.step))
    return sorted(float(v) for v in values)


def _check_group(group: ProductGroup, kind: str, vocabulary: DetailVocabulary) -> None:
    known = {
        "species": {o.key for o in vocabulary.species},
        "treatments": {o.key for o in vocabulary.treatment},
        "profiles": {o.key for o in vocabulary.profile},
    }
    for field, allowed in known.items():
        unknown = set(getattr(group, field)) - allowed
        if unknown:
            raise ValueError(f"{group.type}: unknown {field} {sorted(unknown)}")
    limit = MAX_BOARD_LENGTH_MM
    if any(v > limit for v in _lengths(group)) or (group.max_length or 0) > limit:
        raise ValueError(f"{group.type}: board length above {limit} mm")
    if kind == "board" and (group.thicknesses or group.formats):
        raise ValueError(f"{group.type}: boards use 'sizes', not thicknesses/formats")
    if kind == "sheet" and (group.sizes or group.lengths or group.length_range):
        raise ValueError(f"{group.type}: sheets use thicknesses and formats")


def _expand(group: ProductGroup, kind: str, country: str) -> list[Product]:
    shared = {
        "type": group.type,
        "kind": kind,
        "country": country,
        "species": group.species,
        "treatments": group.treatments,
        "grades": group.grades,
        "profiles": group.profiles,
        "sources": group.sources,
        "note": group.note,
    }
    if kind == "board":
        lengths = _lengths(group)
        products = []
        for size in group.sizes:
            thickness, width = parse_size(size)
            products.append(
                Product(
                    id=f"{country.lower()}:{group.type}:{_number(thickness)}x{_number(width)}",
                    thickness=thickness,
                    width=width,
                    lengths=lengths,
                    max_length=group.max_length,
                    **shared,
                )
            )
        return products

    formats = []
    for text in group.formats:
        width, height = parse_size(text)
        if max(width, height) > MAX_SHEET_SIDE_MM:
            raise ValueError(f"{group.type}: sheet side above {MAX_SHEET_SIDE_MM} mm")
        formats.append(SheetFormat(width=width, height=height))
    return [
        Product(
            id=f"{country.lower()}:{group.type}:{_number(thickness)}",
            thickness=thickness,
            formats=formats,
            **shared,
        )
        for thickness in group.thicknesses
    ]


def _load_country(code: str) -> tuple[CountryFile, list[Product]]:
    country = CountryFile(**_read(f"{code.lower()}.yaml"))
    if country.country != code:
        raise ValueError(f"{code.lower()}.yaml declares country {country.country}")
    kinds = {t.key: t.kind for t in load_types()}
    vocabulary = load_details()
    products: list[Product] = []
    for group in country.products:
        if group.type not in kinds:
            raise ValueError(f"unknown product type '{group.type}'")
        _check_group(group, kinds[group.type], vocabulary)
        products.extend(_expand(group, kinds[group.type], code))
    ids = [p.id for p in products]
    duplicates = sorted({i for i in ids if ids.count(i) > 1})
    if duplicates:
        raise ValueError(f"duplicate product ids in {code}: {duplicates}")
    return country, products


def configured_country() -> str | None:
    """The instance's catalogue country, or None for the generic catalogue."""
    value = os.environ.get(COUNTRY_ENV, "").strip().upper()
    return value if value in available_countries() else None


@cache
def get_catalogue(country: str | None = None) -> Catalogue:
    name = None
    products: list[Product] = []
    if country:
        file, products = _load_country(country)
        name = file.name
    return Catalogue(
        country=country,
        country_name=name,
        types=list(load_types()),
        details=load_details(),
        products=products,
    )
