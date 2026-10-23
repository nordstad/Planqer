from dataclasses import dataclass

from planqer.schemas.wallpaper import Cutout, Wall


@dataclass(frozen=True)
class WallOutline:
    width: float
    height_left: float
    height_right: float

    @property
    def vertices(self) -> tuple[tuple[float, float], ...]:
        return (
            (0, 0),
            (self.width, 0),
            (self.width, self.height_right),
            (0, self.height_left),
        )

    def top_height_at(self, x: float) -> float:
        if not 0 <= x <= self.width:
            raise ValueError("x must be within the wall outline")
        return self.height_left + (self.height_right - self.height_left) * x / self.width

    def strip_top_height(self, x_start: float, x_end: float) -> float:
        if not 0 <= x_start < x_end <= self.width:
            raise ValueError("Strip must be within the wall outline")
        return max(self.top_height_at(x_start), self.top_height_at(x_end))


@dataclass(frozen=True)
class StripCutoutIntersection:
    x_start: float
    x_end: float
    y_start: float
    y_end: float


def wall_outline(wall: Wall) -> WallOutline:
    """Return a conservative elevation outline from the wall measurements."""
    return WallOutline(
        width=max(wall.width_top, wall.width_middle, wall.width_bottom),
        height_left=wall.height_left,
        height_right=wall.height_right,
    )


def cutout_bounds(cutout: Cutout) -> tuple[float, float, float, float]:
    """Return a cutout rectangle as left, bottom, right, top bounds."""
    return (
        cutout.x,
        cutout.y,
        cutout.x + cutout.width,
        cutout.y + cutout.height,
    )


def strip_cutout_intersection(
    cutout: Cutout, strip_x_start: float, strip_x_end: float
) -> StripCutoutIntersection | None:
    """Return the positive-area intersection of a vertical strip and cutout."""
    cutout_x_start, cutout_y_start, cutout_x_end, cutout_y_end = cutout_bounds(cutout)
    x_start = max(strip_x_start, cutout_x_start)
    x_end = min(strip_x_end, cutout_x_end)
    if x_start >= x_end:
        return None
    return StripCutoutIntersection(x_start, x_end, cutout_y_start, cutout_y_end)
