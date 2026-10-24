from dataclasses import dataclass
from typing import Literal

from planqer.schemas.wallpaper import Allowances, Corner, Room, Wall
from planqer.wallpaper.geometry import wall_outline

_EPSILON = 1e-6


@dataclass(frozen=True)
class CornerGeometry:
    kind: Literal["inside_wrap", "outside_wrap"]
    # Finished and precut wrap widths at the top, middle and bottom of an
    # inside corner. Outside wraps follow the straight roll edge.
    widths: tuple[float, float, float] | None = None
    precut_widths: tuple[float, float, float] | None = None


@dataclass(frozen=True)
class StripSegment:
    """The part of one physical strip that is hung on a single wall face."""

    wall_index: int
    x_start: float
    x_end: float
    top_height: float
    bottom_height: float = 0
    lower_left: float = 0
    lower_right: float = 0
    local_stair_edge: bool = False
    corner_geometry: CornerGeometry | None = None

    @property
    def width(self) -> float:
        return self.x_end - self.x_start


@dataclass(frozen=True)
class ConnectedStrip:
    """One physical strip from the roll, hung across one or more wall faces."""

    number: int
    segments: tuple[StripSegment, ...]
    phase: float
    precut_length: float
    precut_width: float

    @property
    def wall_index(self) -> int:
        return self.segments[0].wall_index

    @property
    def x_start(self) -> float:
        return self.segments[0].x_start

    @property
    def x_end(self) -> float:
        return self.segments[0].x_end

    @property
    def top_height(self) -> float:
        return max(segment.top_height for segment in self.segments)

    @property
    def bottom_height(self) -> float:
        return min(segment.bottom_height for segment in self.segments)

    @property
    def width(self) -> float:
        return sum(segment.width for segment in self.segments)


@dataclass(frozen=True)
class RunLayout:
    strips: list[ConnectedStrip]
    notes: list[str]
    narrowest: float


@dataclass(frozen=True)
class ConnectedRun:
    wall_indices: list[int]
    corners: list[Corner]


def corner_connects(corner: Corner) -> bool:
    """Outside corners always wrap; inside corners only when confirmed."""
    return corner.kind == "outside" or corner.confirmed_continuation == "continue"


def connected_runs(room: Room, start_wall: int = 0) -> tuple[list[ConnectedRun], list[str]]:
    """Group consecutive walls joined by wrapping corners into hanging runs."""
    count = len(room.walls)
    start = start_wall % count if room.closed else 0
    order = [(start + offset) % count for offset in range(count)]
    runs: list[ConnectedRun] = []
    notes = []
    current: ConnectedRun | None = None
    for position, wall_index in enumerate(order):
        if room.walls[wall_index].skip:
            current = None
            continue
        if current is None:
            current = ConnectedRun([wall_index], [])
            runs.append(current)
        is_last = position == count - 1
        if is_last:
            break
        corner = room.corners[wall_index]
        next_index = order[position + 1]
        if room.walls[next_index].skip or not corner_connects(corner):
            current = None
            continue
        current.wall_indices.append(next_index)
        current.corners.append(corner)
    if room.closed and room.corners:
        closing = room.corners[(start - 1) % count]
        if closing.kind == "outside":
            notes.append(
                f"A seam falls on the outside corner before wall '{room.walls[start].name}'"
            )
    return runs, notes


def lay_run_strips(
    walls: list[Wall],
    run: list[int],
    corners: list[Corner],
    roll_width: float,
    allowances: list[Allowances],
    minimum_widths: list[float],
    *,
    first_strip_width: float | None = None,
    start_number: int = 1,
) -> RunLayout:
    """Lay physical strips across a run of walls joined by wrapping corners.

    ``corners[k]`` joins ``run[k]`` and ``run[k + 1]``. An inside corner wraps
    the terminal strip by the measured corner widths, and the next wall starts
    after the narrowest wrapped amount so an out-of-plumb corner overlaps
    rather than leaves a gap. An outside corner carries the rest of the roll
    width onto the next wall.
    """
    if roll_width <= 0:
        raise ValueError("roll_width must be greater than 0")
    if first_strip_width is not None and not 0 < first_strip_width <= roll_width:
        raise ValueError("first_strip_width must be greater than 0 and at most roll_width")

    strips: list[ConnectedStrip] = []
    notes: list[str] = []
    segments: list[StripSegment] = []
    remaining = 0.0
    corner_extra = 0.0
    next_width = first_strip_width or roll_width
    x = 0.0

    def finish() -> None:
        nonlocal segments, corner_extra
        wall_allowances = [allowances[segment.wall_index] for segment in segments]
        top = max(segment.top_height for segment in segments)
        strips.append(ConnectedStrip(
            number=start_number + len(strips),
            segments=tuple(segments),
            phase=0,
            precut_length=top + max(item.top + item.bottom for item in wall_allowances),
            precut_width=sum(segment.width for segment in segments) + corner_extra,
        ))
        segments = []
        corner_extra = 0.0

    for position, wall_index in enumerate(run):
        outline = wall_outline(walls[wall_index])
        corner = corners[position] if position < len(corners) else None
        while x < outline.width - _EPSILON:
            if not segments:
                remaining = next_width
                next_width = roll_width
            x_end = min(outline.width, x + remaining)
            segments.append(StripSegment(
                wall_index=wall_index,
                x_start=x,
                x_end=x_end,
                top_height=outline.strip_top_height(x, x_end),
                bottom_height=outline.strip_bottom_height(x, x_end),
                lower_left=outline.bottom_height_at(x),
                lower_right=outline.bottom_height_at(x_end),
                local_stair_edge=walls[wall_index].profile == "over_stairs",
                corner_geometry=(
                    CornerGeometry("outside_wrap")
                    if x == 0 and len(segments) > 0 else None
                ),
            ))
            remaining -= x_end - x
            x = x_end
            if x < outline.width - _EPSILON:
                finish()
        x = 0.0
        if corner is None:
            if segments:
                finish()
            continue
        next_wall = walls[run[position + 1]]
        if corner.kind == "outside":
            if remaining <= _EPSILON:
                notes.append(
                    f"A seam falls on the outside corner after wall '{walls[wall_index].name}'"
                )
                if segments:
                    finish()
            continue
        x, corner_extra = _wrap_inside_corner(
            corner, next_wall, run[position + 1], walls[wall_index].name,
            segments, remaining, allowances[wall_index].corner, notes,
        )
        if segments:
            finish()

    narrowest = min((strip.width for strip in strips), default=0)
    for strip in strips:
        for segment in strip.segments:
            minimum = minimum_widths[segment.wall_index]
            wall_width = wall_outline(walls[segment.wall_index]).width
            is_inside_wrap = (
                segment.corner_geometry is not None
                and segment.corner_geometry.kind == "inside_wrap"
            )
            if is_inside_wrap or segment.width >= wall_width - _EPSILON:
                continue
            narrowest = min(narrowest, segment.width)
            if segment.width < minimum - _EPSILON:
                notes.append(
                    f"Strip {strip.number} is {segment.width:g} mm on wall "
                    f"'{walls[segment.wall_index].name}', below the {minimum:g} mm minimum"
                )
    return RunLayout(strips=strips, notes=notes, narrowest=narrowest)


def _wrap_inside_corner(
    corner: Corner,
    next_wall: Wall,
    next_index: int,
    wall_name: str,
    segments: list[StripSegment],
    remaining: float,
    allowance: float,
    notes: list[str],
) -> tuple[float, float]:
    """Append the wrapped segment; return where the next wall starts and the
    extra precut width added for the corner allowance."""
    if corner.widths is None:
        raise ValueError(f"Corner after wall '{wall_name}' needs wrap widths to continue")
    widths = (corner.widths.top, corner.widths.middle, corner.widths.bottom)
    outline = wall_outline(next_wall)
    wrap = min(max(widths), outline.width)
    if not segments or wrap > remaining + _EPSILON:
        notes.append(
            f"Strip at the corner after wall '{wall_name}' cannot wrap {max(widths):g} mm; "
            f"the next wall starts afresh"
        )
        return 0.0, 0.0
    if wrap <= _EPSILON:
        return 0.0, 0.0
    extra = min(allowance, remaining - wrap)
    segments.append(StripSegment(
        wall_index=next_index,
        x_start=0,
        x_end=wrap,
        top_height=outline.strip_top_height(0, wrap),
        bottom_height=outline.strip_bottom_height(0, wrap),
        lower_left=outline.bottom_height_at(0),
        lower_right=outline.bottom_height_at(wrap),
        local_stair_edge=next_wall.profile == "over_stairs",
        corner_geometry=CornerGeometry(
            "inside_wrap",
            widths=widths,
            precut_widths=tuple(width + extra for width in widths),
        ),
    ))
    return min(widths), extra


def lay_wall_strips(
    wall: Wall,
    roll_width: float,
    allowances: Allowances,
    *,
    wall_index: int = 0,
    first_strip_width: float | None = None,
    start_number: int = 1,
) -> list[ConnectedStrip]:
    """Lay consecutive vertical strips across one wall without dropping coverage."""
    walls = [wall] * (wall_index + 1)
    return lay_run_strips(
        walls, [wall_index], [], roll_width,
        [allowances] * (wall_index + 1), [0] * (wall_index + 1),
        first_strip_width=first_strip_width, start_number=start_number,
    ).strips
