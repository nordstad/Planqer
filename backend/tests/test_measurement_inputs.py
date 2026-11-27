import pytest
from pydantic import ValidationError

from partsible.schemas.cutting import PartsibleRequest
from partsible.schemas.sheet import SheetOptimizationRequest
from partsible.schemas.tile import TileLayoutRequest
from partsible.schemas.wallpaper import WallpaperPlanRequest


def board(**changes):
    return {"parts": {800: 2}, "available_board_lengths": [2400], **changes}


def sheet(**changes):
    return {
        "parts": {"shelf": {"width": 800, "height": 400, "quantity": 2}},
        "sheet_width": 1200,
        "sheet_height": 2500,
        **changes,
    }


def tile(**changes):
    return {
        "surface_width": 2400,
        "surface_height": 1200,
        "tile": {"width": 300, "height": 600},
        **changes,
    }


def wallpaper(**changes):
    wall = {
        "name": "A",
        **dict.fromkeys(
            (
                "width_top",
                "width_middle",
                "width_bottom",
                "height_left",
                "height_middle",
                "height_right",
            ),
            2400,
        ),
    }
    return {
        "wallpaper": {
            "name": "Willow",
            "manufacturer": "Acme",
            "roll_width": 530,
            "roll_length": 10050,
        },
        "room": {"walls": [wall]},
        **changes,
    }


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (PartsibleRequest, board(parts={800.5: 2})),
        (PartsibleRequest, board(available_board_lengths=[2400.5])),
        (PartsibleRequest, board(saw_blade_width=2.5)),
        (SheetOptimizationRequest, sheet(sheet_width=1200.5)),
        (SheetOptimizationRequest, sheet(kerf_width=2.5)),
        (
            SheetOptimizationRequest,
            sheet(parts={"a": {"width": 800.5, "height": 400, "quantity": 1}}),
        ),
        (TileLayoutRequest, tile(surface_width=2400.5)),
        (TileLayoutRequest, tile(tile={"width": 300.5, "height": 600})),
        (TileLayoutRequest, tile(joint={"joint_width": 2.5})),
        (TileLayoutRequest, tile(joint={"perimeter_gap": 2.5})),
        (TileLayoutRequest, tile(min_edge_cut=2.5)),
        (
            TileLayoutRequest,
            tile(cutouts=[{"x": 0.5, "y": 0, "width": 100, "height": 100}]),
        ),
        (WallpaperPlanRequest, wallpaper(allowances={"corner": 2.5})),
        (WallpaperPlanRequest, wallpaper(start={"wall_index": 0, "offset": 2.5})),
        (WallpaperPlanRequest, wallpaper(anchor={"motif_height_from_floor": 2.5})),
        (WallpaperPlanRequest, wallpaper(minimum_strip_width=50.5)),
    ],
)
def test_new_planning_requests_reject_decimal_measurements(model, payload):
    with pytest.raises(ValidationError, match="whole millimetres"):
        model.model_validate(payload)


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (PartsibleRequest, board(saw_blade_width=3)),
        (SheetOptimizationRequest, sheet(kerf_width=3)),
        (
            TileLayoutRequest,
            tile(
                joint={"joint_width": 0, "perimeter_gap": 0},
                bond={"offset_fraction": 0.5},
                waste_percent=12.5,
            ),
        ),
        (WallpaperPlanRequest, wallpaper(safety_margin_percent=12.5)),
    ],
)
def test_whole_mm_policy_does_not_round_or_restrict_percentages(model, payload):
    model.model_validate(payload)


def test_historical_backup_validation_can_retain_fractional_measurements():
    payload = tile(joint={"joint_width": 2.5})
    restored = TileLayoutRequest.model_validate(
        payload, context={"stored_record": True}
    )
    assert restored.joint.joint_width == 2.5
