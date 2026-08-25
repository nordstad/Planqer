from pathlib import Path

import yaml



def load_config(config_file: Path) -> dict:
    with config_file.open("r") as f:
        config = yaml.safe_load(f)
    return config


def check_waste_warning(waste: float) -> str | None:
    if 0 <= waste < 40:  # 40mm instead of 4cm
        return f"Error: Waste too low ({waste:.1f}mm)"
    elif waste > 500:  # 500mm instead of 50cm
        return f"Warning: Waste too high ({waste:.1f}mm)"
    return None


def compute_metrics(
    cut_list: list[list[float]], board_length: float, saw_blade_width: float = 0.3
) -> tuple[float, int]:
    """
    Computes total waste and the number of boards with warnings.
    The used length for each board is computed as: first piece + sum(saw_blade_width + subsequent piece lengths).

    Args:
        cut_list: List of boards, each board is a list of part lengths.
        board_length: The board length in mm.
        saw_blade_width: The saw blade width in mm.

    Returns:
        A tuple: (total_waste, warning_count)
    """
    total_waste = 0.0
    warning_count = 0
    for board in cut_list:
        if board:
            used = board[0] + sum(saw_blade_width + p for p in board[1:])
        else:
            used = 0.0
        waste = board_length - used
        total_waste += waste
        # Example: count warning if waste is less than 40mm
        if waste < 40:
            warning_count += 1
    return total_waste, warning_count
