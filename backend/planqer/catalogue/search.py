"""Free-text product search, for clients that can't hold the whole catalogue.

The picker searches in the browser; this is the same idea for the MCP server,
which asks the API. Every word has to match a type name or alias, a grade or a
detail; a size ("45x95", "15") has to match the product's dimensions. Sizes
rank first, then the more common types.
"""

import re
import unicodedata

from planqer.catalogue.schema import (
    Catalogue,
    DetailOption,
    Product,
    ProductType,
    Strict,
)

_DIMENSION = re.compile(r"(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)", re.IGNORECASE)
_NUMBER = re.compile(r"^\d+(?:[.,]\d+)?$")


class ProductResult(Strict):
    product: Product
    name: str


def fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", str(text))
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def _number(value: float) -> str:
    return f"{value:g}"


def _as_float(text: str) -> float:
    return float(text.replace(",", "."))


def _label(labels: dict[str, str], lang: str) -> str:
    return labels.get(lang) or labels.get("en") or next(iter(labels.values()), "")


def product_name(product: Product, type_: ProductType | None, lang: str = "en") -> str:
    label = _label(type_.labels, lang) if type_ else product.type
    size = (
        f"{_number(product.thickness)} × {_number(product.width)} mm"
        if product.width is not None
        else f"{_number(product.thickness)} mm"
    )
    return f"{label} {size}"


def _option_text(options: dict[str, DetailOption], keys: list[str]) -> list[str]:
    words: list[str] = []
    for key in keys:
        option = options.get(key)
        words.append(key)
        if option:
            words.extend(option.labels.values())
            words.extend(option.aliases)
    return words


def search_products(
    catalogue: Catalogue,
    query: str = "",
    *,
    kind: str | None = None,
    limit: int = 20,
    lang: str = "en",
) -> list[ProductResult]:
    dims = _DIMENSION.search(query)
    rest = _DIMENSION.sub(" ", query) if dims else query
    pair = (_as_float(dims.group(1)), _as_float(dims.group(2))) if dims else None
    numbers: list[float] = []
    words: list[str] = []
    for token in fold(rest).split():
        if _NUMBER.match(token):
            numbers.append(_as_float(token))
        else:
            words.append(token)

    types = {t.key: t for t in catalogue.types}
    species = {o.key: o for o in catalogue.details.species}
    treatments = {o.key: o for o in catalogue.details.treatment}
    profiles = {o.key: o for o in catalogue.details.profile}
    sized = pair is not None or bool(numbers)

    scored: list[tuple[float, Product]] = []
    for product in catalogue.products:
        type_ = types.get(product.type)
        if kind and product.kind != kind:
            continue
        if type_ and type_.key in ("custom", "sheet-custom"):
            continue
        if pair and not (
            product.kind == "board"
            and sorted((product.thickness, product.width or 0)) == sorted(pair)
        ):
            continue
        if any(n not in (product.thickness, product.width) for n in numbers):
            continue
        type_text = fold(
            " ".join(
                [
                    product.type,
                    *(type_.labels.values() if type_ else []),
                    *(type_.aliases if type_ else []),
                ]
            )
        )
        detail_text = fold(
            " ".join(
                [
                    *product.grades,
                    *_option_text(species, product.species),
                    *_option_text(treatments, product.treatments),
                    *_option_text(profiles, product.profiles),
                ]
            )
        )
        if not all(w in type_text or w in detail_text for w in words):
            continue
        rank = type_.rank if type_ else 999
        type_hit = bool(words) and all(w in type_text for w in words)
        score = (
            (100 if sized else 20 if words else 0)
            + (20 if type_hit else 0)
            - rank / 100
        )
        scored.append((score, product))

    scored.sort(key=lambda item: -item[0])
    return [
        ProductResult(product=p, name=product_name(p, types.get(p.type), lang))
        for _, p in scored[:limit]
    ]
