"""
Phase 1: candidate generation, scoring, and ranking for a tile layout.

The lattice offset (ox, oy) is the only real decision variable (see the
module docstring in tile_layout/__init__.py). Metrics are piecewise-constant
in the offset — most nearby offsets produce identical cut geometry until a
tile crosses a boundary — so an exhaustive continuous optimizer is
unnecessary. Instead this samples the offset space on a grid, explicitly
injects the offsets that are mathematically exact for specific asks (a full
tile flush with a given corner), de-duplicates by resulting geometry, and
returns the Pareto-optimal candidates plus any dominated-but-explicitly-
requested canonical ones (see _CORNER_LABELS) so "full tile at an edge"
remains selectable even when it isn't the most efficient choice on paper.
"""

import math
from dataclasses import dataclass

from .bonds import BondGenerator, RunningBond, StackBond
from .geometry import JointSpec, PlacedTile, Surface, Tile, place_and_clip
from .offcuts import OffcutResult, match_offcuts
from .scoring import LayoutMetrics, score_layout

_INF = float("inf")

_CORNER_LABELS = {
    (True, True): "Full tile at bottom-left corner",
    (False, True): "Full tile at bottom-right corner",
    (True, False): "Full tile at top-left corner",
    (False, False): "Full tile at top-right corner",
}


@dataclass(frozen=True)
class LayoutCandidate:
    label: str
    offset_x: float
    offset_y: float
    rotated: bool
    tiles: tuple[PlacedTile, ...]
    metrics: LayoutMetrics
    offcuts: OffcutResult
    tiles_to_purchase: int              # after offcut reuse (if enabled)
    tiles_to_purchase_with_waste: int   # tiles_to_purchase inflated by waste_percent
    warnings: tuple[str, ...]
    is_pareto_optimal: bool


@dataclass(frozen=True)
class TileLayoutResult:
    candidates: tuple[LayoutCandidate, ...]  # ranked, best first
    recommended_index: int
    surface_area: float
    net_area: float


def build_bond(pattern: str, offset_fraction: float = 0.5) -> BondGenerator:
    if pattern == "stack":
        return StackBond()
    if pattern == "running":
        return RunningBond(offset_fraction=offset_fraction)
    raise ValueError(f"Unknown bond pattern: {pattern!r}")


def _flush_offset(low: bool, span: float, gap: float, tile_dim: float, pitch: float) -> float:
    """The offset (mod pitch) that puts a full tile flush with the surface's
    low edge (x=gap or y=gap) or high edge (x=span-gap or y=span-gap)."""
    target = gap if low else (span - gap - tile_dim)
    return target % pitch


def _generate_layout(
    bond: BondGenerator,
    surface: Surface,
    tile: Tile,
    joint: JointSpec,
    offset_x: float,
    offset_y: float,
) -> list[PlacedTile]:
    placed = []
    for x, y, rotated in bond.raw_positions(surface, tile, joint, offset_x, offset_y):
        p = place_and_clip(x, y, rotated, tile, surface, joint)
        if p is not None:
            placed.append(p)
    return placed


def _signature(metrics: LayoutMetrics) -> tuple:
    return (
        metrics.full_tile_count,
        metrics.cut_tile_count,
        metrics.notched_count,
        round(metrics.min_edge_cut_width, 3) if metrics.min_edge_cut_width is not None else -1,
        round(metrics.min_edge_cut_height, 3) if metrics.min_edge_cut_height is not None else -1,
        round(metrics.symmetry_delta_x, 3),
        round(metrics.symmetry_delta_y, 3),
    )


def _safety_score(metrics: LayoutMetrics) -> float:
    """Higher is better. A tile dimension that was never cut contributes no
    sliver risk on that axis, so it scores as +inf on that axis."""
    w = metrics.min_edge_cut_width if metrics.min_edge_cut_width is not None else _INF
    h = metrics.min_edge_cut_height if metrics.min_edge_cut_height is not None else _INF
    return min(w, h)


def _dominates(a: dict, b: dict) -> bool:
    """True if candidate a is at least as good as b on every objective and
    strictly better on at least one (safety higher-is-better; symmetry and
    tile count lower-is-better)."""
    at_least_as_good = (
        a["safety"] >= b["safety"]
        and a["symmetry"] <= b["symmetry"]
        and a["tiles_count"] <= b["tiles_count"]
    )
    strictly_better = (
        a["safety"] > b["safety"]
        or a["symmetry"] < b["symmetry"]
        or a["tiles_count"] < b["tiles_count"]
    )
    return at_least_as_good and strictly_better


def _pareto_front(entries: list[dict]) -> list[dict]:
    return [e for e in entries if not any(_dominates(o, e) for o in entries if o is not e)]


def _build_candidate(
    *,
    label: str,
    offset_x: float,
    offset_y: float,
    rotated: bool,
    bond: BondGenerator,
    surface: Surface,
    tile: Tile,
    joint: JointSpec,
    min_edge_cut: float | None,
    reuse_offcuts: bool,
    waste_percent: float,
) -> dict | None:
    placed = _generate_layout(bond, surface, tile, joint, offset_x, offset_y)
    if not placed:
        return None

    scored_tiles, metrics = score_layout(placed, surface, min_edge_cut=min_edge_cut)

    if reuse_offcuts:
        offcut_result = match_offcuts(scored_tiles, tile)
        tiles_to_purchase = offcut_result.tiles_to_purchase
    else:
        offcut_result = OffcutResult(
            raw_tile_count=len(scored_tiles), reused_count=0,
            tiles_to_purchase=len(scored_tiles), matches=(),
        )
        tiles_to_purchase = len(scored_tiles)

    tiles_to_purchase_with_waste = math.ceil(tiles_to_purchase * (1 + max(waste_percent, 0) / 100))

    warnings = []
    if metrics.sliver_count > 0:
        threshold_note = f" (below the {min_edge_cut:g}mm threshold)" if min_edge_cut else ""
        warnings.append(f"{metrics.sliver_count} piece(s) are slivers{threshold_note}")
    if metrics.notched_count > 0:
        warnings.append(f"{metrics.notched_count} piece(s) require a notch cut around a cutout")

    return {
        "label": label,
        "offset_x": offset_x,
        "offset_y": offset_y,
        "rotated": rotated,
        "tiles": tuple(scored_tiles),
        "metrics": metrics,
        "offcuts": offcut_result,
        "tiles_to_purchase": tiles_to_purchase,
        "tiles_to_purchase_with_waste": tiles_to_purchase_with_waste,
        "warnings": tuple(warnings),
        "safety": _safety_score(metrics),
        "symmetry": metrics.symmetry_delta_x + metrics.symmetry_delta_y,
        "tiles_count": tiles_to_purchase,
    }


def _orientations(tile: Tile) -> list[tuple[Tile, bool]]:
    """The tile as given, plus — if rotation is allowed — the whole pattern
    laid with the tile turned 90 degrees. This is a *pattern-level* choice
    (lay every tile the other way round) distinct from PlacedTile.rotated,
    which the MVP bonds never set (no bond mixes orientations within one
    lattice)."""
    orientations = [(tile, False)]
    if tile.allow_rotation and tile.width != tile.height:
        swapped = Tile(width=tile.height, height=tile.width, allow_rotation=tile.allow_rotation)
        orientations.append((swapped, True))
    return orientations


def _canonical_candidates(
    working_tile: Tile,
    rotated_flag: bool,
    surface: Surface,
    joint: JointSpec,
) -> list[tuple[str, float, float]]:
    pitch_x = working_tile.width + joint.joint_width
    pitch_y = working_tile.height + joint.joint_width
    suffix = " (rotated)" if rotated_flag else ""

    candidates = []
    for (low_x, low_y), label in _CORNER_LABELS.items():
        ox = _flush_offset(low_x, surface.width, joint.perimeter_gap, working_tile.width, pitch_x)
        oy = _flush_offset(low_y, surface.height, joint.perimeter_gap, working_tile.height, pitch_y)
        candidates.append((label + suffix, ox, oy))
    return candidates


def solve_tile_layout(
    surface: Surface,
    tile: Tile,
    joint: JointSpec,
    bond_pattern: str,
    offset_fraction: float = 0.5,
    min_edge_cut: float | None = None,
    reuse_offcuts: bool = True,
    waste_percent: float = 10.0,
    candidate_count: int = 5,
    sample_steps: int = 24,
) -> TileLayoutResult:
    """Search the offset space, score every candidate, and return the top
    `candidate_count`, ranked with the Pareto-optimal ones first."""
    if candidate_count < 1:
        raise ValueError("candidate_count must be at least 1")

    pool: dict[tuple, dict] = {}  # dedup key -> candidate dict, first-write-wins

    def _consider(entry: dict | None):
        if entry is None:
            return
        key = (entry["rotated"], entry["tiles_count"], _signature(entry["metrics"]))
        if key not in pool:
            pool[key] = entry

    for working_tile, rotated_flag in _orientations(tile):
        bond = build_bond(bond_pattern, offset_fraction)
        pitch_x = working_tile.width + joint.joint_width
        pitch_y = working_tile.height + joint.joint_width

        # Canonical, mathematically-exact candidates first, so they win the
        # dedup slot (and keep their descriptive label) over an equivalent
        # sampled point discovered later.
        for label, ox, oy in _canonical_candidates(working_tile, rotated_flag, surface, joint):
            _consider(_build_candidate(
                label=label, offset_x=ox, offset_y=oy, rotated=rotated_flag,
                bond=bond, surface=surface, tile=working_tile, joint=joint,
                min_edge_cut=min_edge_cut, reuse_offcuts=reuse_offcuts,
                waste_percent=waste_percent,
            ))

        for i in range(sample_steps):
            ox = pitch_x * i / sample_steps
            for j in range(sample_steps):
                oy = pitch_y * j / sample_steps
                _consider(_build_candidate(
                    label="Alternative", offset_x=ox, offset_y=oy, rotated=rotated_flag,
                    bond=bond, surface=surface, tile=working_tile, joint=joint,
                    min_edge_cut=min_edge_cut, reuse_offcuts=reuse_offcuts,
                    waste_percent=waste_percent,
                ))

    if not pool:
        raise ValueError("No tile could be placed on this surface with the given settings")

    entries = list(pool.values())
    pareto = _pareto_front(entries)
    pareto_keys = {id(e) for e in pareto}
    for e in entries:
        e["is_pareto_optimal"] = id(e) in pareto_keys

    def _sort_key(e: dict) -> tuple:
        return (-e["safety"], e["tiles_count"], e["symmetry"])

    pareto.sort(key=_sort_key)
    remainder = sorted((e for e in entries if id(e) not in pareto_keys), key=_sort_key)

    ordered = pareto + remainder
    final = ordered[:candidate_count]

    # Relabel generic "Alternative" entries with the objective(s) they win
    # among the ones actually shown, so every candidate's name explains why
    # it's here.
    best_safety_idx = max(range(len(final)), key=lambda i: final[i]["safety"])
    best_tiles_idx = min(range(len(final)), key=lambda i: final[i]["tiles_count"])
    best_symmetry_idx = min(range(len(final)), key=lambda i: final[i]["symmetry"])

    tags: dict[int, list[str]] = {}
    tags.setdefault(best_safety_idx, []).append("Best sliver avoidance")
    tags.setdefault(best_tiles_idx, []).append("Fewest tiles to buy")
    tags.setdefault(best_symmetry_idx, []).append("Most symmetric")

    alt_counter = 1
    labeled_final = []
    for i, e in enumerate(final):
        e = dict(e)
        if e["label"] == "Alternative":
            if i in tags:
                e["label"] = " & ".join(tags[i])
            else:
                e["label"] = f"Alternative {alt_counter}"
                alt_counter += 1
        labeled_final.append(e)

    recommended_index = min(
        range(len(labeled_final)),
        key=lambda i: (-labeled_final[i]["safety"], labeled_final[i]["tiles_count"]),
    )

    candidates = tuple(
        LayoutCandidate(
            label=e["label"],
            offset_x=e["offset_x"],
            offset_y=e["offset_y"],
            rotated=e["rotated"],
            tiles=e["tiles"],
            metrics=e["metrics"],
            offcuts=e["offcuts"],
            tiles_to_purchase=e["tiles_to_purchase"],
            tiles_to_purchase_with_waste=e["tiles_to_purchase_with_waste"],
            warnings=e["warnings"],
            is_pareto_optimal=e["is_pareto_optimal"],
        )
        for e in labeled_final
    )

    return TileLayoutResult(
        candidates=candidates,
        recommended_index=recommended_index,
        surface_area=surface.gross_area,
        net_area=surface.net_area,
    )
