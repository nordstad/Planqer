from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from planqer.validation import validate_numeric_input

_MAX_DIMENSION_MM = 100_000.0
_MAX_WALLS = 50
_MAX_CUTOUTS_PER_WALL = 50


class WallpaperSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WallpaperSpec(WallpaperSchema):
    name: str = Field(min_length=1, max_length=100)
    manufacturer: str = Field(min_length=1, max_length=100)
    product_code: str | None = Field(default=None, max_length=100)
    roll_width: float
    roll_length: float
    repeat: float = 0
    match: Literal["straight", "half_drop"] | None = None
    roll_offset: float = 0
    price_per_roll: float | None = None
    paste_method: str | None = Field(default=None, max_length=100)
    batch_reference: str | None = Field(default=None, max_length=100)
    official_guide_url: str | None = Field(default=None, max_length=2_000)
    uploaded_guide_reference: str | None = Field(default=None, max_length=255)

    @field_validator("roll_width", "roll_length")
    @classmethod
    def validate_roll_dimensions(cls, value: float) -> float:
        return validate_numeric_input(value, 1.0, _MAX_DIMENSION_MM)

    @field_validator("repeat", "roll_offset")
    @classmethod
    def validate_pattern_dimensions(cls, value: float) -> float:
        return validate_numeric_input(value, 0.0, _MAX_DIMENSION_MM)

    @field_validator("price_per_roll")
    @classmethod
    def validate_price(cls, value: float | None) -> float | None:
        return (
            None if value is None else validate_numeric_input(value, 0.0, 1_000_000.0)
        )

    @model_validator(mode="after")
    def validate_pattern_match(self):
        if self.repeat == 0 and self.match is not None:
            raise ValueError("match must be omitted when repeat is 0")
        if self.repeat > 0 and self.match is None:
            raise ValueError("match is required when repeat is greater than 0")
        return self


class Allowances(WallpaperSchema):
    top: float = 50
    bottom: float = 50
    corner: float = 20
    opening: float = 30
    tuck: float = 10

    @field_validator("top", "bottom", "corner", "opening", "tuck")
    @classmethod
    def validate_allowance(cls, value: float) -> float:
        return validate_numeric_input(value, 0.0, 1_000.0)


class Cutout(WallpaperSchema):
    kind: Literal[
        "door",
        "window",
        "opening",
        "outlet",
        "switch",
        "heat_pump",
        "radiator",
        "pipe",
        "custom",
    ]
    x: float
    y: float
    width: float
    height: float
    label: str | None = Field(default=None, max_length=100)
    mode: Literal["precut", "mark"] | None = None
    group: str | None = Field(default=None, max_length=100)
    tuck_edges: list[Literal["top", "right", "bottom", "left"]] = Field(
        default_factory=list, max_length=4
    )

    @field_validator("x", "y", "width", "height")
    @classmethod
    def validate_dimensions(cls, value: float) -> float:
        return validate_numeric_input(value, 0.0, _MAX_DIMENSION_MM)

    @model_validator(mode="after")
    def set_default_mode(self):
        if self.mode is None:
            self.mode = (
                "mark" if self.kind in {"outlet", "switch"} else "precut"
            )
        return self


class Wall(WallpaperSchema):
    name: str = Field(min_length=1, max_length=100)
    profile: Literal[
        "rectangle", "sloped_ceiling", "under_stairs", "over_stairs", "advanced"
    ] = "rectangle"
    stair_direction: Literal["rising_left", "rising_right"] | None = None
    width_top: float
    width_middle: float
    width_bottom: float
    height_left: float
    height_middle: float
    height_right: float
    allowances: Allowances | None = None
    minimum_strip_width: float | None = None
    cutouts: list[Cutout] = Field(default_factory=list, max_length=_MAX_CUTOUTS_PER_WALL)
    skip: bool = False
    confirmed: bool = False

    @field_validator(
        "width_top",
        "width_middle",
        "width_bottom",
        "height_left",
        "height_middle",
        "height_right",
    )
    @classmethod
    def validate_dimensions(cls, value: float) -> float:
        return validate_numeric_input(value, 1.0, _MAX_DIMENSION_MM)

    @field_validator("minimum_strip_width")
    @classmethod
    def validate_minimum_strip_width(cls, value: float | None) -> float | None:
        return (
            None
            if value is None
            else validate_numeric_input(value, 1.0, _MAX_DIMENSION_MM)
        )

    @model_validator(mode="after")
    def validate_profile(self):
        stair_profiles = {"under_stairs", "over_stairs"}
        if self.profile in stair_profiles and self.stair_direction is None:
            raise ValueError("stair_direction is required for a stairs wall")
        if self.profile not in stair_profiles and self.stair_direction is not None:
            raise ValueError("stair_direction is only valid for a stairs wall")
        if self.profile == "under_stairs":
            rises_left = self.height_left >= self.height_right
            if (self.stair_direction == "rising_left") != rises_left:
                raise ValueError("under-stairs heights do not match the stair direction")
        if self.profile == "over_stairs":
            rises_left = self.height_left <= self.height_right
            if (self.stair_direction == "rising_left") != rises_left:
                raise ValueError("over-stairs heights do not match the stair direction")
        return self


class CornerWidths(WallpaperSchema):
    top: float
    middle: float
    bottom: float

    @field_validator("top", "middle", "bottom")
    @classmethod
    def validate_width(cls, value: float) -> float:
        return validate_numeric_input(value, 0.0, _MAX_DIMENSION_MM)


class Corner(WallpaperSchema):
    kind: Literal["inside", "outside"]
    widths: CornerWidths | None = None
    recommended_continuation: Literal["continue", "start_new"] | None = None
    confirmed_continuation: Literal["continue", "start_new"] | None = None


class Room(WallpaperSchema):
    walls: list[Wall] = Field(min_length=1, max_length=_MAX_WALLS)
    corners: list[Corner] = Field(default_factory=list, max_length=_MAX_WALLS)
    closed: bool = False

    @model_validator(mode="after")
    def validate_corner_count(self):
        expected = len(self.walls) if self.closed else max(0, len(self.walls) - 1)
        if len(self.corners) != expected:
            raise ValueError("Room must have one corner between each pair of walls")
        return self


class PatternAnchor(WallpaperSchema):
    motif_height_from_floor: float

    @field_validator("motif_height_from_floor")
    @classmethod
    def validate_height(cls, value: float) -> float:
        return validate_numeric_input(value, 0.0, _MAX_DIMENSION_MM)


class StartPosition(WallpaperSchema):
    wall_index: int = Field(ge=0)
    offset: float = 0
    direction: Literal["clockwise", "counterclockwise"] = "clockwise"

    @field_validator("offset")
    @classmethod
    def validate_offset(cls, value: float) -> float:
        return validate_numeric_input(value, 0.0, _MAX_DIMENSION_MM)


class WallpaperPlanRequest(WallpaperSchema):
    wallpaper: WallpaperSpec
    room: Room
    allowances: Allowances = Field(default_factory=Allowances)
    safety_margin_percent: float = 10
    minimum_strip_width: float = 50
    start: StartPosition | None = None
    anchor: PatternAnchor | None = None

    @field_validator("safety_margin_percent")
    @classmethod
    def validate_safety_margin(cls, value: float) -> float:
        return validate_numeric_input(value, 0.0, 100.0)

    @field_validator("minimum_strip_width")
    @classmethod
    def validate_minimum_strip_width(cls, value: float) -> float:
        return validate_numeric_input(value, 1.0, _MAX_DIMENSION_MM)
