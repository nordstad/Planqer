from pydantic import BaseModel, field_validator

from planqer.validation import sanitize_project_name, validate_numeric_input

_VALID_BOND_PATTERNS = (
    "stack",
    "running",
    "herringbone",
    "diagonal",
    "diagonal_herringbone",
    "double_herringbone",
    "diagonal_double_herringbone",
)


class TileCutoutSpec(BaseModel):
    x: float
    y: float
    width: float
    height: float
    label: str | None = None

    @field_validator("x", "y", "width", "height")
    @classmethod
    def validate_dimensions(cls, v):
        return validate_numeric_input(v, 0.0, 20000.0)

    @field_validator("label")
    @classmethod
    def validate_label(cls, v):
        return sanitize_project_name(v)


class TileSpec(BaseModel):
    width: float
    height: float
    allow_rotation: bool = False

    @field_validator("width", "height")
    @classmethod
    def validate_dimensions(cls, v):
        return validate_numeric_input(v, 10.0, 3000.0)


class TileJointSpec(BaseModel):
    joint_width: float = 3.0
    perimeter_gap: float = 0.0

    @field_validator("joint_width")
    @classmethod
    def validate_joint_width(cls, v):
        return validate_numeric_input(v, 0.0, 50.0)

    @field_validator("perimeter_gap")
    @classmethod
    def validate_perimeter_gap(cls, v):
        return validate_numeric_input(v, 0.0, 200.0)


class TileBondSpec(BaseModel):
    pattern: str = "stack"
    offset_fraction: float = 0.5

    @field_validator("pattern")
    @classmethod
    def validate_pattern(cls, v):
        if v not in _VALID_BOND_PATTERNS:
            raise ValueError(
                f"Invalid bond pattern '{v}'. Valid options: {', '.join(_VALID_BOND_PATTERNS)}"
            )
        return v

    @field_validator("offset_fraction")
    @classmethod
    def validate_offset_fraction(cls, v):
        if not 0.0 < v < 1.0:
            raise ValueError("offset_fraction must be between 0 and 1 (exclusive)")
        return v


class TileLayoutRequest(BaseModel):
    surface_width: float
    surface_height: float
    cutouts: list[TileCutoutSpec] = []
    tile: TileSpec
    joint: TileJointSpec = TileJointSpec()
    bond: TileBondSpec = TileBondSpec()
    min_edge_cut: float | None = None
    reuse_offcuts: bool = True
    waste_percent: float = 10.0
    candidate_count: int = 5
    project_name: str | None = None

    @field_validator("surface_width", "surface_height")
    @classmethod
    def validate_surface_dimensions(cls, v):
        return validate_numeric_input(v, 100.0, 20000.0)

    @field_validator("min_edge_cut")
    @classmethod
    def validate_min_edge_cut(cls, v):
        return None if v is None else validate_numeric_input(v, 0.0, 3000.0)

    @field_validator("waste_percent")
    @classmethod
    def validate_waste_percent(cls, v):
        return validate_numeric_input(v, 0.0, 100.0)

    @field_validator("candidate_count")
    @classmethod
    def validate_candidate_count(cls, v):
        if not isinstance(v, int) or not 1 <= v <= 20:
            raise ValueError("candidate_count must be an integer between 1 and 20")
        return v

    @field_validator("cutouts")
    @classmethod
    def validate_cutouts(cls, v):
        if len(v) > 20:
            raise ValueError("Maximum 20 cutouts allowed")
        return v

    @field_validator("project_name")
    @classmethod
    def validate_project_name(cls, v):
        return sanitize_project_name(v)


class PlacedTileInfo(BaseModel):
    x: float
    y: float
    width: float
    height: float
    nominal_width: float
    nominal_height: float
    rotated: bool
    kind: str
    is_sliver: bool
    is_reused_offcut: bool
    fill_color: str
    size_label: str | None = None
    edge_lengths: list[float] | None = None
    vertices: list[tuple[float, float]] | None = None


class TileLayoutCandidateResponse(BaseModel):
    label: str
    offset_x: float
    offset_y: float
    rotated: bool
    tiles: list[PlacedTileInfo]
    full_tile_count: int
    cut_tile_count: int
    notched_count: int
    tiles_to_purchase: int
    tiles_to_purchase_with_waste: int
    reused_offcut_count: int
    min_edge_cut_width: float | None
    min_edge_cut_height: float | None
    min_diagonal_cut_span: float | None
    sliver_count: int
    symmetry_delta_x: float
    symmetry_delta_y: float
    distinct_cut_sizes: int
    coverage_area: float
    waste_area: float
    efficiency: float
    is_pareto_optimal: bool
    warnings: list[str]
    visualization: str
    piece_diagrams: dict[str, str] = {}


class TileLayoutResponse(BaseModel):
    candidates: list[TileLayoutCandidateResponse]
    recommended_index: int
    surface_area: float
    net_area: float
    computation_time: float | None = None
