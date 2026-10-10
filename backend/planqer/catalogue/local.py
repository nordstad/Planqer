"""An instance's own changes to the built-in catalogue.

Additions, overrides and hidden entries live in the database (`CatalogueEntry`)
and are layered over the built-in catalogue when it is served; the data files
are never edited. Everything an admin submits goes through the same checks as
the built-in data (`check_group`), so a local entry can't be anything a
built-in couldn't.
"""

import logging
import re
from collections.abc import Iterable
from typing import Literal
from urllib.parse import quote, urlencode

import yaml
from pydantic import Field, ValidationError, field_validator

from planqer.catalogue.loader import (
    check_group,
    configured_country,
    expand_group,
    load_details,
    load_types,
)
from planqer.catalogue.schema import (
    Catalogue,
    Product,
    ProductGroup,
    SheetFormat,
    Strict,
)
from planqer.database import CatalogueEntry

logger = logging.getLogger(__name__)

LOCAL_PREFIX = "local"
ISSUES_URL = "https://github.com/nordstad/Planqer/issues/new"
ISSUE_TEMPLATE = "catalogue-product.yml"
FREE_TEXT_TYPES = ("custom", "sheet-custom")
_COUNTRY = re.compile(r"^[A-Z]{2}$")
# `ProductGroup` insists on a source; a local entry may have none yet.
_PLACEHOLDER_SOURCE = "https://example.invalid/local"

Origin = Literal["builtin", "modified", "local"]


class ProductDetails(Strict):
    """What an admin may change on any entry. Type and size make up its id."""

    lengths: list[int] = Field(default=[], max_length=100)
    max_length: int | None = Field(default=None, gt=0)
    formats: list[SheetFormat] = Field(default=[], max_length=20)
    species: list[str] = Field(default=[])
    treatments: list[str] = Field(default=[])
    grades: list[str] = Field(default=[], max_length=30)
    profiles: list[str] = Field(default=[])
    sources: list[str] = Field(default=[], max_length=10)
    note: str | None = Field(default=None, max_length=200)

    @field_validator("sources")
    @classmethod
    def _https(cls, urls: list[str]) -> list[str]:
        for url in urls:
            if not url.startswith("https://"):
                raise ValueError(f"source '{url}' must be an https URL")
        return urls


class NewProduct(ProductDetails):
    type: str
    thickness: float = Field(gt=0)
    width: float | None = Field(default=None, gt=0)


class AdminItem(Strict):
    product: Product
    origin: Origin
    hidden: bool


class Suggestion(Strict):
    title: str
    country: str
    source: str
    snippet: str
    url: str


def _number(value: float) -> str:
    return f"{value:g}"


def _kind_of(type_key: str) -> str:
    found = {t.key: t for t in load_types()}.get(type_key)
    if found is None:
        raise ValueError(f"unknown product type '{type_key}'")
    if type_key in FREE_TEXT_TYPES:
        raise ValueError("free-text types can't be saved; pick the closest real type")
    return found.kind


def _group(
    type_key: str, thickness: float, width: float | None, details: ProductDetails
) -> tuple[ProductGroup, str]:
    kind = _kind_of(type_key)
    common = {
        "type": type_key,
        "sources": details.sources or [_PLACEHOLDER_SOURCE],
        "species": details.species,
        "treatments": details.treatments,
        "grades": details.grades,
        "profiles": details.profiles,
        "note": details.note,
    }
    if kind == "board":
        if width is None:
            raise ValueError("a board needs a width")
        if details.formats:
            raise ValueError("boards have lengths, not sheet formats")
        group = ProductGroup(
            sizes=[f"{_number(thickness)}x{_number(width)}"],
            lengths=details.lengths,
            max_length=details.max_length,
            **common,
        )
    else:
        if width is not None or details.lengths or details.max_length:
            raise ValueError(
                "sheets have thicknesses and formats, not width or lengths"
            )
        group = ProductGroup(
            thicknesses=[thickness],
            formats=[
                f"{_number(f.width)}x{_number(f.height)}" for f in details.formats
            ],
            **common,
        )
    check_group(group, kind, load_details())
    return group, kind


def build_product(
    type_key: str,
    thickness: float,
    width: float | None,
    details: ProductDetails,
    *,
    product_id: str | None = None,
    country: str | None = None,
) -> Product:
    """A validated product. New entries get a `local:` id; an override keeps
    the id (and country) of the built-in it replaces."""
    group, kind = _group(type_key, thickness, width, details)
    (product,) = expand_group(group, kind, country or configured_country() or "local")
    return product.model_copy(
        update={
            "id": product_id or f"{LOCAL_PREFIX}:{product.id.split(':', 1)[1]}",
            "sources": details.sources,
        }
    )


def details_of(product: Product) -> ProductDetails:
    return ProductDetails(
        lengths=[int(v) for v in product.lengths],
        max_length=int(product.max_length) if product.max_length else None,
        formats=product.formats,
        species=product.species,
        treatments=product.treatments,
        grades=product.grades,
        profiles=product.profiles,
        sources=product.sources,
        note=product.note,
    )


def _stored(
    entries: Iterable[CatalogueEntry],
) -> dict[str, tuple[bool, Product | None]]:
    result: dict[str, tuple[bool, Product | None]] = {}
    for entry in entries:
        product = None
        if entry.data:
            try:
                product = Product.model_validate_json(entry.data)
            except ValidationError:
                logger.warning(
                    "Ignoring unreadable catalogue entry %s", entry.product_id
                )
        result[entry.product_id] = (entry.hidden, product)
    return result


def admin_items(base: Catalogue, entries: Iterable[CatalogueEntry]) -> list[AdminItem]:
    """Every built-in and local product with its state, hidden ones included."""
    stored = _stored(entries)
    items: list[AdminItem] = []
    for product in base.products:
        hidden, override = stored.get(product.id, (False, None))
        items.append(
            AdminItem(
                product=override or product,
                origin="modified" if override else "builtin",
                hidden=hidden,
            )
        )
    built_in = {p.id for p in base.products}
    for product_id, (hidden, product) in stored.items():
        if product is not None and product_id not in built_in:
            items.append(AdminItem(product=product, origin="local", hidden=hidden))
    return items


def merge_local(base: Catalogue, entries: Iterable[CatalogueEntry]) -> Catalogue:
    """The catalogue clients see: built-ins with this instance's changes."""
    products = [item.product for item in admin_items(base, entries) if not item.hidden]
    return base.model_copy(update={"products": products})


def build_suggestion(
    product: Product, *, source: str | None, country: str | None
) -> Suggestion:
    """A pre-filled GitHub issue for contributing one product upstream.

    Nothing is sent: this only builds the link the admin chooses to open.
    """
    country = (country or product.country or configured_country() or "").upper()
    if not _COUNTRY.match(country):
        raise ValueError("a two-letter country code is needed to suggest a product")
    if source and not source.startswith("https://"):
        raise ValueError("the source must be an https URL")
    sources = list(dict.fromkeys([*([source] if source else []), *product.sources]))
    if not sources:
        raise ValueError("a source URL is needed to suggest a product")
    details = details_of(product).model_copy(update={"sources": sources})
    group, _ = _group(product.type, product.thickness, product.width, details)
    snippet = yaml.safe_dump(
        {
            "country": country,
            "products": [
                group.model_dump(by_alias=True, exclude_defaults=True, mode="json")
            ],
        },
        sort_keys=False,
        allow_unicode=True,
    )
    size = (
        f"{_number(product.thickness)}x{_number(product.width)}"
        if product.width is not None
        else _number(product.thickness)
    )
    title = f"Catalogue: {product.type} {size} ({country})"
    query = urlencode(
        {
            "template": ISSUE_TEMPLATE,
            "title": title,
            "country": country,
            "product": f"{product.type} {size}",
            "source": sources[0],
            "snippet": snippet,
        },
        quote_via=quote,
    )
    return Suggestion(
        title=title,
        country=country,
        source=sources[0],
        snippet=snippet,
        url=f"{ISSUES_URL}?{query}",
    )
