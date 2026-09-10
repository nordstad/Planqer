from pydantic import BaseModel, Field, field_validator

from planqer.algorithms import OptimizationAlgorithm
from planqer.validation import (
    sanitize_board_lengths,
    sanitize_parts_dict,
    sanitize_project_name,
    validate_numeric_input,
)


class BoardCost(BaseModel):
    price_per_board: float
    supplier: str = "default"
    bulk_discount: float = 0.0
    minimum_quantity: int = 1

    @field_validator("price_per_board")
    @classmethod
    def validate_price(cls, v):
        return validate_numeric_input(v, 0.01, 100000.0)

    @field_validator("bulk_discount")
    @classmethod
    def validate_bulk_discount(cls, v):
        return validate_numeric_input(v, 0.0, 0.5)

    @field_validator("minimum_quantity")
    @classmethod
    def validate_min_quantity(cls, v):
        if not isinstance(v, int) or v < 1 or v > 1000:
            raise ValueError("Minimum quantity must be an integer between 1 and 1000")
        return v


class CostAnalysis(BaseModel):
    total_cost: float
    currency: str
    cost_per_board_type: dict[float, float]
    boards_needed_by_type: dict[float, int]
    waste_cost: float
    material_efficiency: float
    cost_per_useful_material: float
    cost_breakdown: dict[str, float]


class PlanqerRequest(BaseModel):
    parts: dict[float, int]
    available_board_lengths: list[float]
    saw_blade_width: float = 3.0
    project_name: str | None = None
    algorithm: str | None = None
    board_costs: dict[float, BoardCost] = Field(default_factory=dict)
    currency: str = "SEK"
    enable_cost_analysis: bool = False
    cost_analysis: dict | None = None

    @field_validator("parts")
    @classmethod
    def validate_part_lengths(cls, v):
        return sanitize_parts_dict(v)

    @field_validator("available_board_lengths")
    @classmethod
    def validate_board_lengths(cls, v):
        return sanitize_board_lengths(v)

    @field_validator("project_name")
    @classmethod
    def validate_project_name(cls, v):
        return sanitize_project_name(v)

    @field_validator("saw_blade_width")
    @classmethod
    def validate_saw_blade_width(cls, v):
        return validate_numeric_input(v, 0.1, 100.0)

    @field_validator("algorithm")
    @classmethod
    def validate_algorithm(cls, v):
        if v is not None and v not in {alg.value for alg in OptimizationAlgorithm}:
            raise ValueError(
                f"Invalid algorithm '{v}'. Valid options: {', '.join(a.value for a in OptimizationAlgorithm)}"
            )
        return v

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v):
        if v not in {"SEK", "NOK", "DKK", "USD", "EUR"}:
            raise ValueError(
                f"Invalid currency '{v}'. Valid options: SEK, NOK, DKK, USD, EUR"
            )
        return v


class PlanqerResponse(BaseModel):
    optimal_board_length: float
    cost: float
    total_waste: float
    material_bought: float | None = None
    kerf_loss: float | None = None
    board_lengths_used: list[float] | None = None
    cut_list: list[list[float]]
    visualization: str
    algorithm_used: str
    computation_time: float | None = None
    cost_analysis: CostAnalysis | None = None
