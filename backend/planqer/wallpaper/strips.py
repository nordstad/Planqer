from dataclasses import dataclass

from planqer.schemas.wallpaper import Allowances, Wall
from planqer.wallpaper.geometry import wall_outline


@dataclass(frozen=True)
class Strip:
    number: int
    wall_index: int
    x_start: float
    x_end: float
    top_height: float
    bottom_height: float
    precut_length: float

    @property
    def width(self) -> float:
        return self.x_end - self.x_start


def lay_wall_strips(
    wall: Wall,
    roll_width: float,
    allowances: Allowances,
    *,
    wall_index: int = 0,
    first_strip_width: float | None = None,
    start_number: int = 1,
) -> list[Strip]:
    """Lay consecutive vertical strips across one wall without dropping coverage."""
    if roll_width <= 0:
        raise ValueError("roll_width must be greater than 0")
    if first_strip_width is not None and not 0 < first_strip_width <= roll_width:
        raise ValueError("first_strip_width must be greater than 0 and at most roll_width")

    outline = wall_outline(wall)
    widths = [first_strip_width] if first_strip_width is not None else []
    covered_width = first_strip_width or 0
    while covered_width < outline.width:
        width = min(roll_width, outline.width - covered_width)
        widths.append(width)
        covered_width += width

    strips = []
    x_start = 0.0
    for number, width in enumerate(widths, start=start_number):
        x_end = min(outline.width, x_start + width)
        top_height = outline.strip_top_height(x_start, x_end)
        strips.append(
            Strip(
                number=number,
                wall_index=wall_index,
                x_start=x_start,
                x_end=x_end,
                top_height=top_height,
                bottom_height=0,
                precut_length=top_height + allowances.top + allowances.bottom,
            )
        )
        x_start = x_end
    return strips
