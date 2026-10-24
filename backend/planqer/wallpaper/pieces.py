from collections.abc import Mapping
from dataclasses import dataclass

from planqer.schemas.wallpaper import Allowances, Cutout
from planqer.wallpaper.geometry import cutout_bounds, strip_cutout_intersection
from planqer.wallpaper.strips import ConnectedStrip, StripSegment

_FIXED_OBSTACLE_KINDS = {"heat_pump", "radiator", "pipe"}


@dataclass(frozen=True)
class Notch:
    x_start: float
    y_start: float
    x_end: float
    y_end: float
    mode: str


@dataclass(frozen=True)
class PieceSegment:
    """Face-local hanging geometry of a piece, in its wall's coordinates."""

    wall_index: int
    x_start: float
    x_end: float
    notches: tuple[Notch, ...] = ()


@dataclass(frozen=True)
class WallpaperPiece:
    strip_number: int
    wall_index: int
    y_start: float
    y_end: float
    phase: float
    notches: tuple[Notch, ...] = ()
    segments: tuple[PieceSegment, ...] = ()

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
    strip: ConnectedStrip,
    cutouts: Mapping[int, list[Cutout]],
    phase: float,
    allowances: Mapping[int, Allowances],
) -> PieceSplitResult:
    """Split one physical strip once, keeping every face's cutouts.

    A range becomes a hidden-seam split only when it blocks the full width of
    every face. A range that blocks one face only stays a notch on that face.
    """
    face_blocks = []
    face_notches = []
    for segment in strip.segments:
        blocks, notches = _segment_cutouts(
            segment, cutouts.get(segment.wall_index, []), allowances[segment.wall_index]
        )
        if segment.top_height < strip.top_height:
            blocks.append((segment.top_height, strip.top_height, None))
        face_blocks.append(blocks)
        face_notches.append(notches)

    split_ranges = _intersect_faces(
        [[(start, end) for start, end, _ in blocks] for blocks in face_blocks],
        strip.top_height,
    )
    for blocks, notches, segment in zip(face_blocks, face_notches, strip.segments):
        for start, end, mode in blocks:
            if mode is None:
                continue
            for part_start, part_end in _subtract(start, end, split_ranges):
                notches.append(Notch(segment.x_start, part_start, segment.x_end, part_end, mode))

    piece_ranges, offcut_ranges = _split_ranges(strip.bottom_height, strip.top_height, split_ranges)
    pieces = []
    for y_start, y_end in piece_ranges:
        segments = tuple(
            PieceSegment(
                segment.wall_index, segment.x_start, segment.x_end,
                _clip_notches(notches, y_start, y_end),
            )
            for segment, notches in zip(strip.segments, face_notches)
        )
        pieces.append(WallpaperPiece(
            strip_number=strip.number,
            wall_index=strip.wall_index,
            y_start=y_start,
            y_end=y_end,
            phase=phase,
            notches=segments[0].notches,
            segments=segments,
        ))
    offcuts = [
        WallpaperOffcut(strip.number, y_start, y_end, phase)
        for y_start, y_end in offcut_ranges
    ]
    return PieceSplitResult(pieces=pieces, offcuts=offcuts)


def _segment_cutouts(
    segment: StripSegment, cutouts: list[Cutout], allowances: Allowances
) -> tuple[list[tuple[float, float, str | None]], list[Notch]]:
    blocks = []
    notches = []
    for cutout in _merge_grouped_cutouts(cutouts):
        cutout = _cutout_from_local_lower_edge(cutout, segment)
        bounds = _allowance_adjusted_bounds(cutout, allowances)
        intersection = strip_cutout_intersection(
            _cutout_from_bounds(cutout, bounds), segment.x_start, segment.x_end
        )
        if intersection is None:
            continue
        x_start, y_start, x_end, y_end = _clamp_to_segment(segment, bounds)
        if y_start >= y_end:
            continue
        if x_start == segment.x_start and x_end == segment.x_end:
            blocks.append((y_start, y_end, cutout.mode))
        else:
            notches.append(Notch(x_start, y_start, x_end, y_end, cutout.mode))
    return blocks, notches


def _cutout_from_local_lower_edge(cutout: Cutout, segment: StripSegment) -> Cutout:
    """Map an opening from its local lower edge datum to wall datum.

    The lower edge is linear.  The left origin keeps a rectangular cutout's
    table-cut coordinates stable; validation separately checks both vertical
    sides against the actual usable profile.
    """
    if segment.x_end == segment.x_start:
        lower = segment.lower_left
    else:
        fraction = (cutout.x - segment.x_start) / (segment.x_end - segment.x_start)
        lower = segment.lower_left + (segment.lower_right - segment.lower_left) * fraction
    return cutout.model_copy(update={"y": cutout.y + lower})


def _intersect_faces(
    faces: list[list[tuple[float, float]]], maximum: float
) -> list[tuple[float, float]]:
    result = _merge_ranges(faces[0], maximum)
    for ranges in faces[1:]:
        other = _merge_ranges(ranges, maximum)
        result = [
            (max(start, other_start), min(end, other_end))
            for start, end in result
            for other_start, other_end in other
            if max(start, other_start) < min(end, other_end)
        ]
    return result


def _subtract(
    start: float, end: float, ranges: list[tuple[float, float]]
) -> list[tuple[float, float]]:
    parts = []
    cursor = start
    for range_start, range_end in ranges:
        if range_end <= cursor or range_start >= end:
            continue
        if range_start > cursor:
            parts.append((cursor, range_start))
        cursor = max(cursor, range_end)
    if cursor < end:
        parts.append((cursor, end))
    return parts


def _clip_notches(notches: list[Notch], y_start: float, y_end: float) -> tuple[Notch, ...]:
    return tuple(
        Notch(notch.x_start, max(notch.y_start, y_start), notch.x_end, min(notch.y_end, y_end), notch.mode)
        for notch in notches
        if notch.y_start < y_end and notch.y_end > y_start
    )


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


def _clamp_to_segment(
    segment: StripSegment, bounds: tuple[float, float, float, float]
) -> tuple[float, float, float, float]:
    left, bottom, right, top = bounds
    return (
        max(segment.x_start, left),
        max(0, bottom),
        min(segment.x_end, right),
        min(segment.top_height, top),
    )


def _split_ranges(
    bottom_height: float, top_height: float, full_width_bounds: list[tuple[float, float]]
) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    pieces = []
    offcuts = []
    y_start = bottom_height
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
