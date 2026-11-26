"""Validate Lite records without normalizing or replacing their stored payloads.

Saved-request models own the top-level contract. Existing solver response models
own result fields; only present fields are checked, because saved plans also
support sparse results (including an empty board result). Nested result entries
must still satisfy their existing contracts. No solver or renderer is run.
"""

import json
import math
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, TypeAdapter

from partsible.catalogue.schema import Product
from partsible.errors import PartsibleError
from partsible.schemas.cutting import PartsibleResponse
from partsible.schemas.saved import (
    CreateSheetProjectRequest,
    CreateTileProjectRequest,
    ProjectCreateRequest,
    ProjectGroupRequest,
    UserSettingsUpdate,
    WallpaperProjectRequest,
)
from partsible.schemas.sheet import (
    SheetLayoutInfo,
    SheetOptimizationResponse,
    SheetPartSpec,
)
from partsible.schemas.tile import TileLayoutCandidateResponse, TileLayoutRequest
from partsible.schemas.wallpaper import Corner, Room, StartPosition, WallpaperSpec
from partsible.wallpaper.pieces import WallpaperPiece
from partsible.wallpaper.rolls import RollCut
from partsible.wallpaper.strips import StripSegment


class Metadata(BaseModel):
    id: str = Field(min_length=1)
    created_at: datetime
    updated_at: datetime
    cutlist_image: str | None = None
    has_svg_image: bool = False


class BoardPart(BaseModel):
    name: str = ""
    length: float = Field(gt=0)
    quantity: int = Field(ge=1, le=10000)


class Pricing(BaseModel):
    price_per_unit: float
    currency: str
    vat_rate: float = 25
    prices_include_vat: bool = True


class BoardPrice(BaseModel):
    price_per_meter: float = 0
    price_per_board: float = 0


class BoardPricing(BaseModel):
    same_price_for_all: bool = True
    uniform_price: float | None = None
    currency: str = "SEK"
    vat_rate: float = 25
    prices_include_vat: bool = True
    optimize_for: str = "waste"
    board_costs: dict[str, BoardPrice] = {}


class SheetPlacement(BaseModel):
    part_id: str
    width: float
    height: float
    x: float
    y: float
    rotated: bool = False


class SavedSheetLayout(SheetLayoutInfo):
    parts: list[SheetPlacement]


class SavedSheetResult(SheetOptimizationResponse):
    sheets: list[SavedSheetLayout]


class StoredWallpaper(WallpaperSpec):
    currency: str = ""
    vat_rate: float = 25
    prices_include_vat: bool = True


class StoredStrip(BaseModel):
    """Serialized strip properties, including the supported pre-segments form."""

    number: int
    wall_index: int
    x_start: float
    x_end: float
    top_height: float
    bottom_height: float = 0
    width: float | None = None
    return_overlap: float = 0
    return_wall_index: int | None = None
    segments: list[StripSegment] = []


class StartCandidate(BaseModel):
    first_strip_widths: list[float] = Field(min_length=1)
    tags: list[str] = []


class StartSummary(BaseModel):
    fallback: list[dict[str, str | int | float]] = []


class CornerQuality(BaseModel):
    smallest: float | None = None
    short_corners: list[dict[str, str | int | float]] = []


class Closure(BaseModel):
    valid: bool
    message: str | None = None


class WallpaperResult(BaseModel):
    rolls_needed: int
    rolls_to_buy: int
    strips: list[StoredStrip]
    pieces: list[WallpaperPiece]
    rolls: list["SavedRoll"]
    warnings: list[str] = []
    corners: list[Corner] = []
    start_candidates: list[StartCandidate] = []
    start: StartSummary | None = None
    corner_quality: CornerQuality | None = None
    closure: Closure | None = None
    material: dict[str, float | dict[str, float] | None] | None = None
    waste: dict[str, float] | None = None


class SavedRoll(BaseModel):
    number: int
    cuts: list[RollCut]
    offcut_length: float


MODELS = {
    "projects": ProjectCreateRequest,
    "sheet_projects": CreateSheetProjectRequest,
    "tile_projects": CreateTileProjectRequest,
    "wallpaper_projects": WallpaperProjectRequest,
    "groups": ProjectGroupRequest,
    "settings": UserSettingsUpdate,
}


def checked(model, value):
    # Strict JSON validation accepts serialized UUIDs/dates/tuples but does not
    # coerce strings to numbers. The original JSON, not these values, is stored.
    return TypeAdapter(model).validate_json(
        json.dumps(value), strict=True, context={"stored_record": True}
    )


def result_fields(model, value):
    for name, field in model.model_fields.items():
        if name in value:
            checked(field.rebuild_annotation(), value[name])


def unique(values):
    if len(set(values)) != len(values):
        raise ValueError("Duplicate plan identifiers")


def wallpaper_record(record):
    checked(StoredWallpaper, record["wallpaper_data"])
    room = checked(Room, record["room_data"])
    options = record.get("options_data", {})
    if options.get("start") is not None:
        start = checked(StartPosition, options["start"])
        if start.wall_index >= len(room.walls):
            raise ValueError("Start refers to a missing wall")
    plan = record.get("plan_result")
    if plan is None:
        return
    result = checked(WallpaperResult, plan)
    if not any(not wall.skip for wall in room.walls):
        raise ValueError("A saved plan needs an active wall")
    if result.material is not None and (
        result.waste is None
        or not {"pattern", "offcut", "allowance", "trim"} <= result.waste.keys()
    ):
        raise ValueError("Material summary has no waste breakdown")
    strips = {strip.number for strip in result.strips}
    unique([strip.number for strip in result.strips])
    for piece in plan["pieces"]:
        checked(str, piece["id"])
        for field in (
            "length",
            "cut_length",
            "cut_phase",
            "allowance_top",
            "allowance_bottom",
        ):
            if field in piece:
                checked(float, piece[field])
    unique([piece["id"] for piece in plan["pieces"]])
    pieces = {piece["id"] for piece in plan["pieces"]}
    for strip in result.strips:
        indices = [
            strip.wall_index,
            *(segment.wall_index for segment in strip.segments),
        ]
        if strip.return_wall_index is not None:
            indices.append(strip.return_wall_index)
        for index in indices:
            if not 0 <= index < len(room.walls):
                raise ValueError("A strip refers to a missing wall")
    for piece in result.pieces:
        if piece.strip_number not in strips:
            raise ValueError("A piece refers to a missing strip")
        for index in [
            piece.wall_index,
            *(segment.wall_index for segment in piece.segments),
        ]:
            if not 0 <= index < len(room.walls):
                raise ValueError("A piece refers to a missing wall")
    cuts = [cut.piece_id for roll in result.rolls for cut in roll.cuts]
    unique([roll.number for roll in result.rolls])
    unique(cuts)
    if set(cuts) != pieces:
        raise ValueError("Roll cuts do not match the saved pieces")


def validate_records(payload: dict) -> dict:
    try:
        stores = payload["stores"]
        checked(dict[str, list[dict]], stores)
        for store, records in stores.items():
            if store not in (*MODELS, "catalogue_entries"):
                raise ValueError("Unknown store")
            for record in records:
                if store == "catalogue_entries":
                    product_id = checked(str, record["product_id"])
                    checked(bool, record["hidden"])
                    data = record.get("data")
                    if data is not None:
                        product = Product.model_validate_json(
                            checked(str, data), strict=True
                        )
                        if product.id != product_id:
                            raise ValueError(
                                "Catalogue product id does not match its entry"
                            )
                    if product_id != record["id"]:
                        raise ValueError("Catalogue entry id does not match its key")
                    continue
                checked(MODELS[store], record)
                if store == "settings":
                    if record["id"] != "00000000-0000-4000-8000-000000000002":
                        raise ValueError("Unsupported settings key")
                    for name in UserSettingsUpdate.model_fields:
                        if (
                            name in record
                            and record[name] is None
                            and name != "preferred_language"
                        ):
                            raise ValueError("A stored preference cannot be null")
                    continue
                checked(Metadata, record)
                if store == "projects":
                    parts = record["parts_data"]
                    if isinstance(parts, list):
                        checked(list[BoardPart], parts)
                    else:
                        checked(dict[str, Annotated[int, Field(ge=1, le=10000)]], parts)
                        for length in parts:
                            if not math.isfinite(float(length)) or float(length) <= 0:
                                raise ValueError("Invalid board part length")
                    result_fields(PartsibleResponse, record["optimization_result"])
                    if record.get("board_costs") is not None:
                        checked(BoardPricing, record["board_costs"])
                elif store == "sheet_projects":
                    checked(list[SheetPartSpec], record["parts_data"])
                    if record.get("optimization_result") is not None:
                        result_fields(SavedSheetResult, record["optimization_result"])
                elif store == "tile_projects":
                    surface = record["surface_data"]
                    checked(
                        TileLayoutRequest,
                        {
                            **record.get("options_data", {}),
                            "surface_width": surface["width"],
                            "surface_height": surface["height"],
                            "cutouts": surface.get("cutouts", []),
                            "tile": record["tile_data"],
                            "joint": record["bond_data"],
                            "bond": record["bond_data"],
                        },
                    )
                    if "material_type" in record["tile_data"]:
                        checked(str, record["tile_data"]["material_type"])
                    if record.get("layout_result") is not None:
                        result_fields(
                            TileLayoutCandidateResponse, record["layout_result"]
                        )
                elif store == "wallpaper_projects":
                    wallpaper_record(record)
                if (
                    store in ("sheet_projects", "tile_projects")
                    and record.get("pricing") is not None
                ):
                    checked(Pricing, record["pricing"])
    except (ValueError, TypeError, KeyError) as exc:
        raise PartsibleError(
            422, "The backup contains unsupported saved records"
        ) from exc
    return {}
