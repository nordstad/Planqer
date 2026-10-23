from planqer.schemas.wallpaper import Cutout, WallpaperPlanRequest
from planqer.wallpaper.geometry import cutout_bounds, wall_outline


def validate_wallpaper_request(request: WallpaperPlanRequest) -> list[str]:
    """Return measurement warnings or raise when a plan cannot be safely made."""
    _validate_roll(request)
    warnings = []
    for wall in request.room.walls:
        outline = wall_outline(wall)
        allowances = wall.allowances or request.allowances
        tallest_piece = max(wall.height_left, wall.height_middle, wall.height_right)
        tallest_piece += allowances.top + allowances.bottom
        if request.wallpaper.roll_length < tallest_piece:
            raise ValueError(
                f"Wallpaper roll is shorter than the tallest piece on wall '{wall.name}'"
            )
        for cutout in wall.cutouts:
            _validate_cutout_inside_wall(cutout, wall.name, outline)
            if _is_near_wall_edge(cutout, outline.width, max(outline.height_left, outline.height_right)):
                warnings.append(
                    f"Cutout on wall '{wall.name}' is within 10 mm of a wall edge"
                )
        warnings.extend(_overlap_warnings(wall.name, wall.cutouts))
    return warnings


def _validate_roll(request: WallpaperPlanRequest) -> None:
    if request.wallpaper.repeat > request.wallpaper.roll_length:
        raise ValueError("Wallpaper repeat cannot be longer than the roll")


def _validate_cutout_inside_wall(cutout: Cutout, wall_name: str, outline) -> None:
    left, bottom, right, top = cutout_bounds(cutout)
    if left < 0 or bottom < 0 or right > outline.width:
        raise ValueError(f"Cutout is outside wall '{wall_name}'")
    if top > min(outline.top_height_at(left), outline.top_height_at(right)):
        raise ValueError(f"Cutout is outside wall '{wall_name}'")


def _is_near_wall_edge(cutout: Cutout, width: float, height: float) -> bool:
    left, bottom, right, top = cutout_bounds(cutout)
    return min(left, bottom, width - right, height - top) < 10


def _overlap_warnings(wall_name: str, cutouts: list[Cutout]) -> list[str]:
    warnings = []
    for index, cutout in enumerate(cutouts):
        for other in cutouts[index + 1 :]:
            if cutout.group is not None and cutout.group == other.group:
                continue
            if _rectangles_overlap(cutout_bounds(cutout), cutout_bounds(other)):
                warnings.append(f"Ungrouped cutouts overlap on wall '{wall_name}'")
    return warnings


def _rectangles_overlap(
    first: tuple[float, float, float, float], second: tuple[float, float, float, float]
) -> bool:
    first_left, first_bottom, first_right, first_top = first
    second_left, second_bottom, second_right, second_top = second
    return (
        first_left < second_right
        and first_right > second_left
        and first_bottom < second_top
        and first_top > second_bottom
    )
