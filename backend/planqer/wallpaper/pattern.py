from typing import Literal

from planqer.schemas.wallpaper import PatternAnchor, Wall
from planqer.wallpaper.strips import ConnectedStrip


def pattern_datum(walls: list[Wall], anchor: PatternAnchor | None = None) -> float:
    """Return the shared pattern datum for a room."""
    if anchor is not None:
        return anchor.motif_height_from_floor
    return max(
        max(wall.height_left, wall.height_middle, wall.height_right) for wall in walls
    )


def strip_phase(
    strip: ConnectedStrip,
    *,
    repeat: float,
    match: Literal["straight", "half_drop"] | None,
    datum: float,
) -> float:
    """Return the motif phase required at a strip's top edge."""
    if repeat == 0:
        return 0
    phase = (datum - strip.top_height) % repeat
    if match == "half_drop" and strip.number % 2 == 1:
        phase = (phase + repeat / 2) % repeat
    return phase
