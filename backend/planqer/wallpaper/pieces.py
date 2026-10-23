from dataclasses import dataclass

from planqer.schemas.wallpaper import Allowances, Cutout
from planqer.wallpaper.geometry import cutout_bounds, strip_cutout_intersection
from planqer.wallpaper.strips import Strip

_FIXED_OBSTACLE_KINDS = {"heat_pump", "radiator", "pipe"}


@dataclass(frozen=True)
class Notch:
    x_start: float
    y_start: float
    x_end: float
    y_end: float
    mode: str


@dataclass(frozen=True)
class WallpaperPiece:
    strip_number: int
    wall_index: int
    y_start: float
    y_end: float
    phase: float
    notches: tuple[Notch, ...] = ()

    @property
    def length(self) -> float:
        return self.y_end - self.y_start


@dataclass(frozen=True)
class WallpaperOffcut:
    strip_number: int
    y_start: float
    y_end: float
    phase: float

    @property
    def length(self) -> float:
        return self.y_end - self.y_start


@dataclass(frozen=True)
class PieceSplitResult:
    pieces: list[WallpaperPiece]
    offcuts: list[WallpaperOffcut]


def split_strip_into_pieces(
    strip: Strip, cutouts: list[Cutout], phase: float, allowances: Allowances
) -> PieceSplitResult:
    """Split a strip around full-width obstacles and notch partial cutouts."""
    merged_cutouts = _merge_grouped_cutouts(cutouts)
    full_width_bounds = []
    notches = []
    for cutout in merged_cutouts:
        bounds = _allowance_adjusted_bounds(cutout, allowances)
        intersection = strip_cutout_intersection(
            _cutout_from_bounds(cutout, bounds), strip.x_start, strip.x_end
        )
        if intersection is None:
            continue
        x_start, y_start, x_end, y_end = _clamp_to_strip(strip, bounds)
        if y_start >= y_end:
            continue
        if x_start == strip.x_start and x_end == strip.x_end:
            full_width_bounds.append((y_start, y_end))
        else:
            notches.append(Notch(x_start, y_start, x_end, y_end, cutout.mode))

    piece_ranges, offcut_ranges = _split_ranges(strip.top_height, full_width_bounds)
    pieces = [
        WallpaperPiece(
            strip_number=strip.number,
            wall_index=strip.wall_index,
            y_start=y_start,
            y_end=y_end,
            phase=phase,
            notches=tuple(notches),
        )
        for y_start, y_end in piece_ranges
    ]
    offcuts = [
        WallpaperOffcut(strip.number, y_start, y_end, phase)
        for y_start, y_end in offcut_ranges
    ]
    return PieceSplitResult(pieces=pieces, offcuts=offcuts)


def _allowance_adjusted_bounds(
    cutout: Cutout, allowances: Allowances
) -> tuple[float, float, float, float]:
    left, bottom, right, top = cutout_bounds(cutout)
    if cutout.kind in _FIXED_OBSTACLE_KINDS:
        edges = set(cutout.tuck_edges)
        allowance = allowances.tuck
    else:
        edges = {"top", "right", "bottom", "left"}
        allowance = allowances.opening
    return (
        left - allowance if "left" in edges else left,
        bottom - allowance if "bottom" in edges else bottom,
        right + allowance if "right" in edges else right,
        top + allowance if "top" in edges else top,
    )


def _clamp_to_strip(
    strip: Strip, bounds: tuple[float, float, float, float]
) -> tuple[float, float, float, float]:
    left, bottom, right, top = bounds
    return (
        max(strip.x_start, left),
        max(0, bottom),
        min(strip.x_end, right),
        min(strip.top_height, top),
    )


def _split_ranges(
    top_height: float, full_width_bounds: list[tuple[float, float]]
) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    pieces = []
    offcuts = []
    y_start = 0.0
    for cutout_start, cutout_end in _merge_ranges(full_width_bounds, top_height):
        if cutout_start > y_start:
            pieces.append((y_start, cutout_start))
        if cutout_end > cutout_start:
            offcuts.append((cutout_start, cutout_end))
        y_start = max(y_start, cutout_end)
    if y_start < top_height:
        pieces.append((y_start, top_height))
    return pieces, offcuts


def _merge_ranges(
    ranges: list[tuple[float, float]], maximum: float
) -> list[tuple[float, float]]:
    merged = []
    for start, end in sorted(ranges):
        start = max(0, start)
        end = min(maximum, end)
        if start >= end:
            continue
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def _merge_grouped_cutouts(cutouts: list[Cutout]) -> list[Cutout]:
    merged = []
    groups: dict[str, list[Cutout]] = {}
    for cutout in cutouts:
        if cutout.group is None:
            merged.append(cutout)
        else:
            groups.setdefault(cutout.group, []).append(cutout)
    for group in groups.values():
        left = min(cutout.x for cutout in group)
        bottom = min(cutout.y for cutout in group)
        right = max(cutout.x + cutout.width for cutout in group)
        top = max(cutout.y + cutout.height for cutout in group)
        merged.append(
            Cutout(
                kind=group[0].kind,
                x=left,
                y=bottom,
                width=right - left,
                height=top - bottom,
                mode="mark" if all(cutout.mode == "mark" for cutout in group) else "precut",
            )
        )
    return merged


def _cutout_from_bounds(
    cutout: Cutout, bounds: tuple[float, float, float, float]
) -> Cutout:
    left, bottom, right, top = bounds
    return cutout.model_copy(
        update={"x": left, "y": bottom, "width": right - left, "height": top - bottom}
    )
