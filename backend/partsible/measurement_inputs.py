"""Whole-mm input policy; calculation results and historical records stay exact."""

import math

from pydantic import BaseModel, ValidationInfo, model_validator

_MEASUREMENTS = {
    "length",
    "width",
    "height",
    "thickness",
    "saw_blade_width",
    "sheet_width",
    "sheet_height",
    "kerf_width",
    "surface_width",
    "surface_height",
    "joint_width",
    "perimeter_gap",
    "min_edge_cut",
    "x",
    "y",
    "roll_width",
    "roll_length",
    "repeat",
    "roll_offset",
    "width_top",
    "width_middle",
    "width_bottom",
    "height_left",
    "height_middle",
    "height_right",
    "lower_left",
    "lower_right",
    "minimum_strip_width",
    "minimum_corner_piece",
    "motif_height_from_floor",
    "offset",
    "first_strip_width",
}


def whole_mm(value):
    if value is not None and (not math.isfinite(value) or value != round(value)):
        raise ValueError(
            "Measurements must use whole millimetres; decimals are not supported"
        )


def check_inputs(value):
    if isinstance(value, list):
        for item in value:
            check_inputs(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            if key in _MEASUREMENTS:
                whole_mm(item)
            elif key == "available_board_lengths":
                for length in item:
                    whole_mm(length)
            elif key == "allowances" and item is not None:
                for allowance in item.values():
                    whole_mm(allowance)
            elif (
                key == "parts"
                and item
                and all(isinstance(count, int) for count in item.values())
            ):
                for length in item:
                    whole_mm(float(length))
            else:
                check_inputs(item)


class MeasurementRequest(BaseModel):
    @model_validator(mode="after")
    def whole_measurements(self, info: ValidationInfo):
        if not (info.context or {}).get("stored_record"):
            check_inputs(self.model_dump())
        return self
