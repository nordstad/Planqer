from pydantic import BaseModel, ConfigDict, Field

from planqer.catalogue.schema import SheetFormat

_TEXT = 100


class ProductDetails(BaseModel):
    model_config = ConfigDict(extra="forbid")

    species: str | None = Field(default=None, max_length=_TEXT)
    treatment: str | None = Field(default=None, max_length=_TEXT)
    grade: str | None = Field(default=None, max_length=_TEXT)
    profile: str | None = Field(default=None, max_length=_TEXT)
    text: str | None = Field(default=None, max_length=_TEXT * 2)


class ProductSnapshot(BaseModel):
    """What a plan was made for, copied at save time.

    Stored whole instead of referencing the catalogue, so later catalogue
    changes (or a different instance country) never rewrite an old plan.
    `catalogue_id` is None for free-text products.
    """

    model_config = ConfigDict(extra="forbid")

    type: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=1, max_length=200)
    catalogue_id: str | None = Field(default=None, max_length=80)
    country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    labels: dict[str, str] = Field(default_factory=dict, max_length=8)
    thickness: float | None = Field(default=None, ge=0, le=10000)
    width: float | None = Field(default=None, ge=0, le=10000)
    lengths: list[float] = Field(default_factory=list, max_length=60)
    formats: list[SheetFormat] = Field(default_factory=list, max_length=30)
    sources: list[str] = Field(default_factory=list, max_length=10)
    details: ProductDetails = Field(default_factory=ProductDetails)
    suggested: bool = False
    from_model: bool = False
