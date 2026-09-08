"""
Scoring a placed-tile layout: derives the metrics used to rank candidates
(min edge cut, symmetry, tile counts, waste/efficiency) and flags slivers.

No decision-making happens here — this module only measures a layout that
bonds.py + geometry.py already produced.
"""

import dataclasses
from dataclasses import dataclass

from .geometry import PlacedTile, Surface, TileKind

_EPS = 1e-6


@dataclass(frozen=True)
class LayoutMetrics:
    placed_tile_count: int
    full_tile_count: int
    cut_tile_count: int
    notched_count: int

    coverage_area: float
    waste_area: float
    efficiency: float  # coverage_area / surface.net_area

    min_edge_cut_width: float | None   # None if no tile was cut in x
    min_edge_cut_height: float | None  # None if no tile was cut in y
    sliver_count: int

    symmetry_delta_x: float
    symmetry_delta_y: float


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

    cut_widths = [t.width for t in placed_tiles if t.width < t.nominal_width - _EPS]
    cut_heights = [t.height for t in placed_tiles if t.height < t.nominal_height - _EPS]
    min_edge_cut_width = min(cut_widths) if cut_widths else None
    min_edge_cut_height = min(cut_heights) if cut_heights else None

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

    sliver_count = 0
    scored_tiles: list[PlacedTile] = []
    for t in placed_tiles:
        is_sliver = False
        if min_edge_cut is not None and t.kind in (TileKind.CUT, TileKind.NOTCHED):
            cut_in_x = t.width < t.nominal_width - _EPS
            cut_in_y = t.height < t.nominal_height - _EPS
            if (cut_in_x and t.width < min_edge_cut) or (cut_in_y and t.height < min_edge_cut):
                is_sliver = True
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
        sliver_count=sliver_count,
        symmetry_delta_x=symmetry_delta_x,
        symmetry_delta_y=symmetry_delta_y,
    )
    return scored_tiles, metrics
