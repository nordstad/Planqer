"""The bodies the saved-project, group and settings endpoints accept.

Shared by those endpoints and by the browser runtime (`local_api`), so a request
is validated the same way wherever it is stored.

Nothing here may import the server stack; `tests/test_core_isolation.py` runs
this module with it blocked.
"""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from planqer.schemas.product import ProductSnapshot

# `auto` follows the language (decided by the client); the rest pick a catalogue.
CatalogueChoice = Literal["auto", "SE", "NO", "generic"]


class ProjectCreateRequest(BaseModel):
    """A plan the user has chosen to keep. Carries the plan itself, not a
    request to compute one: /cutting-plans solves and returns, this stores."""

    name: str = Field(min_length=1, max_length=200)
    project_group_id: UUID | None = None
    parts_data: dict | list[dict]
    board_lengths: list[float]
    saw_blade_width: float
    material_type: str = ""
    board_thickness: float = 0
    board_width: float = 0
    # The prices behind this plan's cost analysis, if it was priced. Stored so
    # loading the plan restores the pricing panel — supplier prices and stocked
    # lengths differ per job, so they belong to the plan, not to the app.
    board_costs: dict | None = None
    # The catalogue product (or free text) the plan is for, snapshotted so later
    # catalogue changes never alter it. material_type stays the readable label.
    product: ProductSnapshot | None = None
    optimization_result: dict


class ProjectUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    project_group_id: UUID | None = None
    parts_data: dict | list[dict] | None = None
    board_lengths: list[float] | None = None
    saw_blade_width: float | None = None
    material_type: str | None = None
    board_thickness: float | None = None
    board_width: float | None = None
    board_costs: dict | None = None
    product: ProductSnapshot | None = None
    optimization_result: dict | None = None


class CreateSheetProjectRequest(BaseModel):
    """A layout the user has chosen to keep. The diagram is redrawn server-side
    from optimization_result, so no image comes over the wire."""

    name: str = Field(min_length=1, max_length=200)
    project_group_id: UUID | None = None
    parts_data: list
    sheet_width: float
    sheet_height: float
    kerf_width: float
    material_type: str = "plywood"
    sheet_thickness: float = 0
    algorithm: str | None = None
    allow_rotation: bool = True
    optimization_result: dict | None = None
    pricing: dict | None = None
    product: ProductSnapshot | None = None


class UpdateSheetProjectRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    project_group_id: UUID | None = None
    parts_data: list | None = None
    sheet_width: float | None = None
    sheet_height: float | None = None
    kerf_width: float | None = None
    material_type: str | None = None
    sheet_thickness: float | None = None
    algorithm: str | None = None
    allow_rotation: bool | None = None
    optimization_result: dict | None = None
    pricing: dict | None = None
    product: ProductSnapshot | None = None


class CreateTileProjectRequest(BaseModel):
    """A layout the user has chosen to keep. The diagram is redrawn
    server-side from surface_data + layout_result, so no image comes over
    the wire — same reasoning as CreateSheetProjectRequest."""

    name: str = Field(min_length=1, max_length=200)
    project_group_id: UUID | None = None
    surface_data: dict
    tile_data: dict
    bond_data: dict
    options_data: dict = {}
    layout_result: dict | None = None
    pricing: dict | None = None


class UpdateTileProjectRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    project_group_id: UUID | None = None
    surface_data: dict | None = None
    tile_data: dict | None = None
    bond_data: dict | None = None
    options_data: dict | None = None
    layout_result: dict | None = None
    pricing: dict | None = None


class WallpaperRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    data: dict


class WallpaperProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    project_group_id: UUID | None = None
    wallpaper_data: dict
    room_data: dict
    options_data: dict = {}
    plan_result: dict | None = None
    ordered_rolls: int | None = Field(default=None, ge=0)
    progress_data: dict = {}


class UpdateWallpaperProjectRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    project_group_id: UUID | None = None
    wallpaper_data: dict | None = None
    room_data: dict | None = None
    options_data: dict | None = None
    plan_result: dict | None = None
    ordered_rolls: int | None = Field(default=None, ge=0)
    progress_data: dict | None = None


class ProjectGroupRequest(BaseModel):
    name: str
    spare_margin_percent: float | None = Field(default=None, ge=0, le=100)


class UserSettingsUpdate(BaseModel):
    default_board_lengths: list[int] | None = None
    default_saw_blade_width: float | None = None
    default_currency: str | None = None
    default_vat_rate: float | None = None
    default_prices_include_vat: bool | None = None
    preferred_algorithm: str | None = None
    preferred_units: str | None = None
    preferred_language: Literal["en-GB", "sv-SE", "nb-NO"] | None = None
    spare_margin_percent: float | None = Field(default=None, ge=0, le=100)
    catalogue_country: CatalogueChoice | None = None
