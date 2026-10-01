import math
import re
from collections.abc import Mapping
from html import escape

# Representative runs: 500 FFD parts took 0.022s, 100 genetic parts 6.854s,
# and 1000 bottom-left rectangles 0.7s on the development machine.
MAX_CUTTING_PARTS = 5000
MAX_SHEET_RECTANGLES = 1000
MAX_GENETIC_PARTS = 100
MAX_BRANCH_AND_BOUND_PARTS = 10
MAX_GENETIC_SHEET_RECTANGLES = 50


def sanitize_project_name(name: str | None) -> str | None:
    if name is None:
        return None
    name = name.replace("\x00", "")[:100]
    name = re.sub(r"[^a-zA-Z0-9\s\-_().]", "", name)
    name = re.sub(r"\.{2,}", ".", name)
    name = re.sub(r"\s+", " ", name).strip()
    name = escape(name)
    return name if name else None


def validate_numeric_input(
    value: float, min_val: float = 0.1, max_val: float = 10000.0
) -> float:
    if (
        not isinstance(value, (int, float))
        or math.isnan(value)
        or value in (float("inf"), float("-inf"))
    ):
        raise ValueError(f"Invalid numeric value: {value}")
    if value < min_val or value > max_val:
        raise ValueError(f"Value {value} must be between {min_val} and {max_val}")
    return float(value)


def sanitize_parts_dict(
    parts: dict, max_part_length: float = 10000.0
) -> dict[float, int]:
    if not isinstance(parts, dict):
        raise ValueError("Parts must be a dictionary")  # noqa: TRY004
    if len(parts) > 1000:
        raise ValueError("Maximum 1000 different part lengths allowed")
    result = {}
    for length, quantity in parts.items():
        clean_length = validate_numeric_input(float(length), 0.1, max_part_length)
        if not isinstance(quantity, int) or quantity < 1 or quantity > 10000:
            raise ValueError(
                f"Quantity for length {length} must be an integer between 1 and 10000"
            )
        result[clean_length] = quantity
    return result


def sanitize_board_lengths(
    boards: list, max_board_length: float = 10000.0
) -> list[float]:
    if not isinstance(boards, list):
        raise ValueError("Board lengths must be a list")  # noqa: TRY004
    if len(boards) > 100:
        raise ValueError("Maximum 100 different board lengths allowed")
    if not boards:
        raise ValueError("At least one board length must be provided")
    return [
        validate_numeric_input(float(board), 1.0, max_board_length) for board in boards
    ]


def validate_cutting_workload(
    parts: Mapping[float, int], algorithm: str | None = None
) -> None:
    expanded_count = sum(parts.values())
    if expanded_count > MAX_CUTTING_PARTS:
        raise ValueError(
            f"Optimization contains {expanded_count} parts; maximum is "
            f"{MAX_CUTTING_PARTS}"
        )
    if algorithm == "genetic" and expanded_count > MAX_GENETIC_PARTS:
        raise ValueError(
            f"The genetic algorithm supports at most {MAX_GENETIC_PARTS} parts"
        )
    if algorithm == "branch_bound" and expanded_count > MAX_BRANCH_AND_BOUND_PARTS:
        raise ValueError(
            "The branch-and-bound algorithm supports at most "
            f"{MAX_BRANCH_AND_BOUND_PARTS} parts; choose a heuristic algorithm"
        )


def validate_sheet_workload(
    parts: Mapping[str, Mapping[str, int]], algorithm: str | None = None
) -> None:
    expanded_count = sum(spec["quantity"] for spec in parts.values())
    if expanded_count > MAX_SHEET_RECTANGLES:
        raise ValueError(
            f"Optimization contains {expanded_count} rectangles; maximum is "
            f"{MAX_SHEET_RECTANGLES}"
        )
    if algorithm == "genetic_2d" and expanded_count > MAX_GENETIC_SHEET_RECTANGLES:
        raise ValueError(
            "The genetic 2D algorithm supports at most "
            f"{MAX_GENETIC_SHEET_RECTANGLES} rectangles"
        )
