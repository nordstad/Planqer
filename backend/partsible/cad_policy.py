"""Format-independent policy for classifying measured CAD components."""

SHEET_THICKNESS_RATIO = 0.18


def is_sheet(length: float, width: float, thickness: float) -> bool:
    """Return whether dimensions describe sheet stock rather than a board."""
    return (
        thickness / max(1e-6, min(length, width)) <= SHEET_THICKNESS_RATIO
        and width / length >= 0.1
    )
