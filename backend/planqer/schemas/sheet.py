from pydantic import BaseModel, field_validator

from planqer.sheet_optimization import SheetOptimizationAlgorithm
from planqer.validation import sanitize_project_name, validate_numeric_input


class SheetPartSpec(BaseModel):
    width: float
    height: float
    quantity: int

    @field_validator("width", "height")
    @classmethod
    def validate_dimensions(cls, v):
        return validate_numeric_input(v, 1.0, 5000.0)

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, v):
        if not isinstance(v, int) or v < 1 or v > 1000:
            raise ValueError("Quantity must be an integer between 1 and 1000")
        return v


class SheetOptimizationRequest(BaseModel):
    parts: dict[str, SheetPartSpec]
    sheet_width: float
    sheet_height: float
    kerf_width: float = 3.0
    material_type: str = "plywood"
    project_name: str | None = None
    algorithm: str | None = None
    allow_rotation: bool = True

    @field_validator("sheet_width", "sheet_height")
    @classmethod
    def validate_sheet_dimensions(cls, v):
        return validate_numeric_input(v, 100.0, 10000.0)

    @field_validator("kerf_width")
    @classmethod
    def validate_kerf_width(cls, v):
        return validate_numeric_input(v, 0.1, 50.0)

    @field_validator("project_name")
    @classmethod
    def validate_project_name(cls, v):
        return sanitize_project_name(v)

    @field_validator("algorithm")
    @classmethod
    def validate_algorithm(cls, v):
        if v is not None and v not in {a.value for a in SheetOptimizationAlgorithm}:
            raise ValueError(f"Invalid algorithm '{v}'")
        return v

    @field_validator("parts")
    @classmethod
    def validate_parts_dict(cls, v):
        if not v:
            raise ValueError("At least one part must be provided")
        if len(v) > 100:
            raise ValueError("Maximum 100 different part types allowed")
        return v


class SheetLayoutInfo(BaseModel):
    sheet_width: float
    sheet_height: float
    used_area: float
    waste_area: float
    efficiency: float
    parts_count: int
    parts: list[dict]


class SheetOptimizationResponse(BaseModel):
    total_sheets: int
    total_waste_area: float
    overall_efficiency: float
    sheets: list[SheetLayoutInfo]
    algorithm_used: str
    computation_time: float | None = None
    material_type: str
    visualization: str
