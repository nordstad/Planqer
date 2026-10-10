"""Validated shape of the product catalogue.

Data files describe *groups* of products compactly (one type, many sizes).
`loader` expands them into one `Product` per type and cross-section, which is
what the API serves and what a saved plan snapshots.
"""

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

LOCALES = ("en", "sv", "nb")
MAX_BOARD_LENGTH_MM = 15000
MAX_SHEET_SIDE_MM = 10000
DETAIL_KEYS = ("species", "treatment", "grade", "profile")

Kind = Literal["board", "sheet"]
_SIZE = re.compile(r"^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$")
_KEY = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_COUNTRY = re.compile(r"^[A-Z]{2}$")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _check_labels(labels: dict[str, str]) -> dict[str, str]:
    if "en" not in labels:
        raise ValueError("labels need an English ('en') entry")
    unknown = set(labels) - set(LOCALES)
    if unknown:
        raise ValueError(f"unsupported label locales: {sorted(unknown)}")
    return labels


def _check_key(value: str) -> str:
    if not _KEY.match(value):
        raise ValueError(f"'{value}' is not a lowercase-hyphen key")
    return value


def parse_size(text: str) -> tuple[float, float]:
    match = _SIZE.match(text.replace(",", "."))
    if not match:
        raise ValueError(f"'{text}' is not a size like 45x95")
    return float(match.group(1)), float(match.group(2))


class ProductType(Strict):
    key: str
    kind: Kind
    rank: int = Field(ge=1, description="Lower is more common; breaks match ties")
    labels: dict[str, str]
    aliases: list[str] = []
    details: list[Literal["species", "treatment", "grade", "profile"]] = []

    _labels = field_validator("labels")(_check_labels)
    _key = field_validator("key")(_check_key)


class DetailOption(Strict):
    key: str
    labels: dict[str, str]

    _labels = field_validator("labels")(_check_labels)
    _key = field_validator("key")(_check_key)


class DetailVocabulary(Strict):
    species: list[DetailOption] = []
    treatment: list[DetailOption] = []
    profile: list[DetailOption] = []


class LengthRange(Strict):
    from_: int = Field(alias="from", gt=0)
    to: int = Field(gt=0)
    step: int = Field(gt=0)

    @model_validator(mode="after")
    def _ordered(self):
        if self.to < self.from_:
            raise ValueError("length range ends before it starts")
        return self


class ProductGroup(Strict):
    """One line of a country file: a type and every size it comes in."""

    type: str
    sources: list[str] = Field(min_length=1)
    # boards: "thickness x width"; sheets: just thicknesses plus formats
    sizes: list[str] = []
    thicknesses: list[float] = []
    formats: list[str] = []
    lengths: list[int] = []
    length_range: LengthRange | None = None
    max_length: int | None = None
    species: list[str] = []
    treatments: list[str] = []
    grades: list[str] = []
    profiles: list[str] = []
    note: str | None = None

    @field_validator("sources")
    @classmethod
    def _https(cls, urls: list[str]) -> list[str]:
        for url in urls:
            if not url.startswith("https://"):
                raise ValueError(f"source '{url}' must be an https URL")
        return urls


class CountryFile(Strict):
    country: str
    name: str
    products: list[ProductGroup]

    @field_validator("country")
    @classmethod
    def _country(cls, value: str) -> str:
        if not _COUNTRY.match(value):
            raise ValueError("country must be an upper-case ISO 3166-1 alpha-2 code")
        return value


class SheetFormat(Strict):
    width: float
    height: float


class Product(Strict):
    """A single catalogue entry, as served by the API and snapshotted on plans."""

    id: str
    type: str
    kind: Kind
    country: str
    thickness: float
    width: float | None = None
    lengths: list[float] = []
    max_length: float | None = None
    formats: list[SheetFormat] = []
    species: list[str] = []
    treatments: list[str] = []
    grades: list[str] = []
    profiles: list[str] = []
    sources: list[str]
    note: str | None = None


class Catalogue(Strict):
    country: str | None
    country_name: str | None
    types: list[ProductType]
    details: DetailVocabulary
    products: list[Product]
