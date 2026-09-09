"""
Scoring a placed-tile layout: derives the metrics used to rank candidates
(min edge cut, symmetry, tile counts, waste/efficiency) and flags slivers.

No decision-making happens here — this module only measures a layout that
bonds.py + geometry.py already produced.
"""

import dataclasses
import math
from dataclasses import dataclass

from .geometry import PlacedTile, Surface, TileKind

_EPS = 1e-6


def _min_caliper_width(vertices: tuple[tuple[float, float], ...]) -> float:
    """Minimum width of a convex polygon: the narrowest the piece measures
    across, in any direction — the honest generalization of "how thin is
    the thinnest sliver" for a shape that isn't a plain rectangle. Uses
    rotating calipers restricted to directions perpendicular to each edge,
    which is provably where the true minimum occurs for a convex polygon
    (the width in the direction perpendicular to the polygon's own
    supporting edges bounds it from every other edge too). Reduces to
    min(width, height) for an axis-aligned rectangle, but is only ever
    called for diagonal (polygon) pieces here — see min_diagonal_cut_span.
    """
    n = len(vertices)
    min_width = None
    for i in range(n):
        x1, y1 = vertices[i]
        x2, y2 = vertices[(i + 1) % n]
        edge_len = math.hypot(x2 - x1, y2 - y1)
        if edge_len < 1e-9:
            continue
        # Outward normal of this edge, as a unit vector.
        nx, ny = (y2 - y1) / edge_len, (x1 - x2) / edge_len
        projections = [nx * vx + ny * vy for vx, vy in vertices]
        width = max(projections) - min(projections)
        if min_width is None or width < min_width:
            min_width = width
    return min_width if min_width is not None else 0.0


@dataclass(frozen=True)
class LayoutMetrics:
    placed_tile_count: int
    full_tile_count: int
    cut_tile_count: int
    notched_count: int

    coverage_area: float
    waste_area: float
    efficiency: float  # coverage_area / surface.net_area

    min_edge_cut_width: float | None   # None if no axis-aligned tile was cut in x
    min_edge_cut_height: float | None  # None if no axis-aligned tile was cut in y
    # The diagonal-bond counterpart to the two fields above: a rotated
    # piece's "cut width" isn't an x-axis or y-axis fact anymore, so this
    # is one value (see _min_caliper_width) instead of two. None if this
    # layout has no diagonal (polygon) CUT/NOTCHED pieces — including
    # every axis-aligned bond, where it's always None.
    min_diagonal_cut_span: float | None
    sliver_count: int

    symmetry_delta_x: float
    symmetry_delta_y: float

    # How many different rectangles a cutter actually has to measure and set
    # the saw to — every full tile is one measurement (the tile's own size),
    # so this counts unique (width, height) pairs among CUT/NOTCHED pieces
    # only. Lower is better: fewer distinct sizes means fewer saw setups,
    # independent of how many total pieces need cutting.
    distinct_cut_sizes: int


def score_layout(
    placed_tiles: list[PlacedTile],
    surface: Surface,
    min_edge_cut: float | None = None,
) -> tuple[list[PlacedTile], LayoutMetrics]:
    """Scores a candidate layout and returns (tiles_with_sliver_flags, metrics).

    `placed_tiles` must be non-empty and already clipped (see
    geometry.place_and_clip) — this function does no clipping of its own.
    """
    if not placed_tiles:
        raise ValueError("Cannot score an empty layout — no tiles placed")

    full = [t for t in placed_tiles if t.kind == TileKind.FULL]
    cut = [t for t in placed_tiles if t.kind == TileKind.CUT]
    notched = [t for t in placed_tiles if t.kind == TileKind.NOTCHED]

    footprint_area = sum(t.area for t in placed_tiles)
    notch_removed = sum(t.notch_area for t in placed_tiles)
    coverage_area = footprint_area - notch_removed
    waste_area = surface.net_area - coverage_area
    efficiency = coverage_area / surface.net_area if surface.net_area > 0 else 0.0

    # A single candidate is produced by exactly one bond, so placed_tiles is
    # either all-axis-aligned or all-diagonal, never a mix — this detects
    # which, without needing the bond type threaded through this function.
    is_diagonal_layout = all(t.vertices is not None for t in placed_tiles)

    # width/nominal_width comparisons only mean "was this cut" for an
    # axis-aligned piece — a diagonal piece's bounding-box width isn't
    # comparable to its nominal (pre-rotation) width the same way, so
    # diagonal tiles are explicitly excluded here rather than silently
    # producing a number that looks like a real cut width but isn't one.
    cut_widths = [
        t.width for t in placed_tiles if t.vertices is None and t.width < t.nominal_width - _EPS
    ]
    cut_heights = [
        t.height for t in placed_tiles if t.vertices is None and t.height < t.nominal_height - _EPS
    ]
    min_edge_cut_width = min(cut_widths) if cut_widths else None
    min_edge_cut_height = min(cut_heights) if cut_heights else None

    diagonal_spans = [
        _min_caliper_width(t.vertices)
        for t in placed_tiles
        if t.vertices is not None and t.kind != TileKind.FULL
    ]
    min_diagonal_cut_span = min(diagonal_spans) if diagonal_spans else None

    if is_diagonal_layout:
        # symmetry_delta_x/y compares a repeated cut width at opposite AABB
        # edges (see the axis-aligned branch below) — not a meaningful
        # concept once tiles are at 45 degrees, since the AABB's "left
        # edge" isn't a straight run of one repeated cut piece the way it
        # is for running bond. Reported as a real 0.0 (not a null-hack) so
        # it neither penalizes nor rewards diagonal candidates in Pareto
        # ranking — see .plans/tile-layout.md Phase 4b for the reasoning.
        symmetry_delta_x = 0.0
        symmetry_delta_y = 0.0
    else:
        left_x = min(t.x for t in placed_tiles)
        right_x = max(t.x + t.width for t in placed_tiles)
        bottom_y = min(t.y for t in placed_tiles)
        top_y = max(t.y + t.height for t in placed_tiles)

        left_widths = [t.width for t in placed_tiles if abs(t.x - left_x) < _EPS]
        right_widths = [t.width for t in placed_tiles if abs((t.x + t.width) - right_x) < _EPS]
        bottom_heights = [t.height for t in placed_tiles if abs(t.y - bottom_y) < _EPS]
        top_heights = [t.height for t in placed_tiles if abs((t.y + t.height) - top_y) < _EPS]

        symmetry_delta_x = abs(min(left_widths) - min(right_widths))
        symmetry_delta_y = abs(min(bottom_heights) - min(top_heights))

    def _size_key(t: PlacedTile) -> tuple:
        if t.vertices is not None:
            # A bounding-box match alone doesn't guarantee two polygons are
            # the same shape (a triangle and a pentagon can share an
            # AABB) — vertex count and true area disambiguate them.
            return (round(t.width), round(t.height), len(t.vertices), round(t.area))
        return (round(t.width), round(t.height))

    distinct_cut_sizes = len({_size_key(t) for t in placed_tiles if t.kind != TileKind.FULL})

    sliver_count = 0
    scored_tiles: list[PlacedTile] = []
    for t in placed_tiles:
        is_sliver = False
        if min_edge_cut is not None and t.kind in (TileKind.CUT, TileKind.NOTCHED):
            if t.vertices is not None:
                if _min_caliper_width(t.vertices) < min_edge_cut:
                    is_sliver = True
            else:
                cut_in_x = t.width < t.nominal_width - _EPS
                cut_in_y = t.height < t.nominal_height - _EPS
                if (cut_in_x and t.width < min_edge_cut) or (cut_in_y and t.height < min_edge_cut):
                    is_sliver = True
        if is_sliver:
            sliver_count += 1
        scored_tiles.append(dataclasses.replace(t, is_sliver=is_sliver))

    metrics = LayoutMetrics(
        placed_tile_count=len(placed_tiles),
        full_tile_count=len(full),
        cut_tile_count=len(cut),
        notched_count=len(notched),
        coverage_area=coverage_area,
        waste_area=waste_area,
        efficiency=efficiency,
        min_edge_cut_width=min_edge_cut_width,
        min_edge_cut_height=min_edge_cut_height,
        min_diagonal_cut_span=min_diagonal_cut_span,
        sliver_count=sliver_count,
        symmetry_delta_x=symmetry_delta_x,
        symmetry_delta_y=symmetry_delta_y,
        distinct_cut_sizes=distinct_cut_sizes,
    )
    return scored_tiles, metrics
