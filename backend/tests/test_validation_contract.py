import pytest
from pydantic import ValidationError

from planqer.schemas.cutting import PlanqerRequest
from planqer.schemas.sheet import SheetOptimizationRequest
from planqer.schemas.tile import TileLayoutRequest


def test_board_schema_accepts_decimal_and_boundary_values():
    request = PlanqerRequest(
        parts={0.1: 1, 15000: 1},
        available_board_lengths=[1, 15000],
        saw_blade_width=0.1,
    )
    assert request.parts[0.1] == 1


@pytest.mark.parametrize(
    ("field", "value"),
    [("sheet_width", 100), ("sheet_height", 100), ("kerf_width", 0.1)],
)
def test_sheet_schema_accepts_minimum_boundaries(field, value):
    payload = {
        "parts": {"part": {"width": 1, "height": 1, "quantity": 1}},
        "sheet_width": 100,
        "sheet_height": 100,
        "kerf_width": 0.1,
    }
    payload[field] = value
    assert SheetOptimizationRequest(**payload)


def test_tile_schema_accepts_zero_joint_and_decimal_values():
    request = TileLayoutRequest(
        surface_width=100,
        surface_height=100,
        tile={"width": 10, "height": 10},
        joint={"joint_width": 0, "perimeter_gap": 0},
        waste_percent=0,
        candidate_count=1,
    )
    assert request.tile.width == 10


def test_board_schema_rejects_values_outside_the_shared_contract():
    with pytest.raises(ValidationError):
        PlanqerRequest(parts={15000.1: 1}, available_board_lengths=[1000])
    with pytest.raises(ValidationError):
        PlanqerRequest(parts={1000: 1}, available_board_lengths=[15000.1])


def test_sheet_side_limit_stays_at_10000():
    payload = {
        "parts": {"part": {"width": 1, "height": 1, "quantity": 1}},
        "sheet_width": 10000,
        "sheet_height": 10000,
        "kerf_width": 3,
    }
    assert SheetOptimizationRequest(**payload)
    with pytest.raises(ValidationError):
        SheetOptimizationRequest(**{**payload, "sheet_width": 10000.1})
