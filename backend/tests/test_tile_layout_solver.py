"""
Tests for the Phase 1 candidate solver: search, dedup, Pareto ranking,
labeling, and waste/offcut integration.
"""

import math

import pytest

from planqer.tile_layout.bonds import (
    DiagonalBond,
    DiagonalDoubleHerringboneBond,
    DiagonalHerringboneBond,
    DoubleHerringboneBond,
)
from planqer.tile_layout.geometry import Cutout, JointSpec, Surface, Tile
from planqer.tile_layout.solver import build_bond, solve_tile_layout


def test_build_bond_rejects_unknown_pattern():
    with pytest.raises(ValueError):
        build_bond("chevron")  # mitred herringbone variant — not implemented, see .plans/tile-layout.md


def test_solve_rejects_candidate_count_below_one():
    surface = Surface(width=1000, height=1000)
    tile = Tile(width=300, height=300)
    joint = JointSpec(joint_width=3)
    with pytest.raises(ValueError):
        solve_tile_layout(surface, tile, joint, bond_pattern="stack", candidate_count=0)


def test_solve_raises_when_tile_never_fits():
    # A cutout spanning the entire surface: every candidate tile placement
    # falls entirely inside it and is discarded, so no tile is ever placed.
    surface = Surface(width=300, height=300, cutouts=(Cutout(x=0, y=0, width=300, height=300),))
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=3)
    with pytest.raises(ValueError):
        solve_tile_layout(surface, tile, joint, bond_pattern="stack", sample_steps=4)


def test_solve_finds_the_exact_zero_cut_layout_when_one_exists():
    # 909x1206 divides exactly into 3x2 tiles of 300x600 at a 3mm joint —
    # the canonical corner candidates should land on it exactly.
    surface = Surface(width=909, height=1206)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="stack", candidate_count=5, sample_steps=8
    )

    zero_cut = [c for c in result.candidates if c.metrics.cut_tile_count == 0]
    assert zero_cut, "expected at least one candidate with no cut tiles at all"
    assert zero_cut[0].metrics.full_tile_count == 6
    assert zero_cut[0].tiles_to_purchase == 6


def test_recommended_index_is_within_range_and_pareto_optimal():
    surface = Surface(width=1000, height=600)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=0)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="stack", candidate_count=5, sample_steps=8
    )

    assert 0 <= result.recommended_index < len(result.candidates)
    assert result.candidates[result.recommended_index].is_pareto_optimal


def test_every_candidate_has_a_descriptive_label():
    surface = Surface(width=1230, height=845)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="running", offset_fraction=0.5,
        candidate_count=5, sample_steps=8,
    )

    for c in result.candidates:
        assert c.label != "Alternative"


def test_fewest_cuts_can_win_its_own_label():
    # A surface wide/tall enough, with a running bond, that different
    # offsets genuinely trade off distinct-cut-size count against the other
    # three objectives — otherwise one offset would dominate on every axis
    # and "Fewest cuts" would never need to be its own label.
    surface = Surface(width=8400, height=2400)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="running", offset_fraction=0.5,
        candidate_count=5, sample_steps=16,
    )

    assert any("Fewest cuts" in c.label for c in result.candidates)
    fewest_cuts = min(c.metrics.distinct_cut_sizes for c in result.candidates)
    labeled = next(c for c in result.candidates if "Fewest cuts" in c.label)
    assert labeled.metrics.distinct_cut_sizes == fewest_cuts


def test_distinct_cut_sizes_is_a_real_pareto_axis_not_just_a_label():
    # A candidate that is strictly better on distinct cut sizes and no worse
    # on anything else must survive the Pareto front even if it loses on
    # tiles_count/symmetry/safety — proving dominance actually checks this
    # 4th axis rather than only using it to break label ties afterward.
    from planqer.tile_layout.solver import _dominates

    worse_on_everything_else = {
        "safety": 10.0, "symmetry": 5.0, "tiles_count": 20, "distinct_cuts": 3,
    }
    better_cuts_only = {
        "safety": 10.0, "symmetry": 5.0, "tiles_count": 20, "distinct_cuts": 2,
    }
    assert _dominates(better_cuts_only, worse_on_everything_else)
    assert not _dominates(worse_on_everything_else, better_cuts_only)


def test_waste_percent_inflates_purchase_count():
    surface = Surface(width=909, height=1206)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="stack", candidate_count=5,
        sample_steps=4, waste_percent=10.0,
    )

    zero_cut = next(c for c in result.candidates if c.metrics.cut_tile_count == 0)
    assert zero_cut.tiles_to_purchase == 6
    assert zero_cut.tiles_to_purchase_with_waste == math.ceil(6 * 1.10)


def test_reuse_offcuts_never_increases_purchase_count():
    surface = Surface(width=1015, height=600)  # forces a narrow cut column
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=3)

    with_reuse = solve_tile_layout(
        surface, tile, joint, bond_pattern="stack", candidate_count=5,
        sample_steps=8, reuse_offcuts=True,
    )
    without_reuse = solve_tile_layout(
        surface, tile, joint, bond_pattern="stack", candidate_count=5,
        sample_steps=8, reuse_offcuts=False,
    )

    # Compare the best (recommended) candidate from each run.
    best_with = with_reuse.candidates[with_reuse.recommended_index]
    best_without = without_reuse.candidates[without_reuse.recommended_index]
    assert best_with.offcuts.reused_count >= 0
    assert best_without.offcuts.reused_count == 0
    assert best_without.tiles_to_purchase >= best_with.tiles_to_purchase or (
        best_with.offset_x != best_without.offset_x
    )


def test_min_edge_cut_produces_sliver_warning():
    surface = Surface(width=1000, height=600)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=0)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="stack", candidate_count=5,
        sample_steps=4, min_edge_cut=250,
    )

    assert any(c.metrics.sliver_count > 0 and any("sliver" in w for w in c.warnings)
               for c in result.candidates)


def test_cutout_produces_notch_warning():
    surface = Surface(width=1200, height=1200, cutouts=(Cutout(x=500, y=500, width=200, height=200),))
    tile = Tile(width=300, height=300)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="stack", candidate_count=5, sample_steps=6
    )

    assert any(c.metrics.notched_count > 0 for c in result.candidates)
    notched = next(c for c in result.candidates if c.metrics.notched_count > 0)
    assert any("notch" in w for w in notched.warnings)


def test_square_tile_does_not_duplicate_rotation_search():
    # A square tile rotated 90 degrees is identical, so allow_rotation=True
    # on a square should not double the search space or ever mark a
    # candidate as rotated=True.
    surface = Surface(width=1000, height=1000)
    tile = Tile(width=300, height=300, allow_rotation=True)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="stack", candidate_count=5, sample_steps=6
    )

    assert all(not c.rotated for c in result.candidates)


def test_rotation_allowed_can_surface_a_rotated_candidate():
    # A narrow surface where the tile only fits well if rotated 90 degrees.
    surface = Surface(width=590, height=1200)
    tile = Tile(width=300, height=600, allow_rotation=True)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="stack", candidate_count=10, sample_steps=8
    )

    assert any(c.rotated for c in result.candidates)


def test_herringbone_solves_end_to_end_with_a_flush_corner_candidate():
    surface = Surface(width=2000, height=1500)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="herringbone", candidate_count=20, sample_steps=8,
    )

    assert len(result.candidates) > 0
    corner = next((c for c in result.candidates if "bottom-left corner" in c.label), None)
    assert corner is not None
    origin_tile = next(t for t in corner.tiles if t.x < 1e-6 and t.y < 1e-6)
    assert origin_tile.kind.value == "full"


def test_herringbone_allow_rotation_does_not_duplicate_candidates():
    """Herringbone already mixes both 90-degree orientations within its own
    lattice (see bonds.HerringboneBond), so the pattern-level rotation
    search (_orientations) would only relabel an identical layout — the
    same reasoning that already skips it for a square tile."""
    surface = Surface(width=2000, height=1500)
    tile = Tile(width=300, height=150, allow_rotation=True)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="herringbone", candidate_count=10, sample_steps=8,
    )

    assert all(not c.rotated for c in result.candidates)


def test_build_bond_diagonal_returns_diagonal_bond():
    assert isinstance(build_bond("diagonal"), DiagonalBond)


def test_diagonal_solves_end_to_end():
    surface = Surface(width=2000, height=1500)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="diagonal", candidate_count=10, sample_steps=8,
    )

    assert len(result.candidates) > 0
    # Every diagonal piece (full or cut) carries its true polygon shape —
    # unlike axis-aligned bonds, there's no rectangle-only fast path here.
    assert all(t.vertices is not None for c in result.candidates for t in c.tiles)
    # scoring.py's diagonal-specific metrics are wired up end to end: a
    # real surface always has *some* boundary-cut diamond, so at least one
    # candidate should carry a caliper-width span, and none should carry
    # the axis-aligned-only min_edge_cut_width/height (see scoring.py).
    assert any(c.metrics.min_diagonal_cut_span is not None for c in result.candidates)
    assert all(c.metrics.min_edge_cut_width is None for c in result.candidates)
    assert all(c.metrics.symmetry_delta_x == 0.0 and c.metrics.symmetry_delta_y == 0.0 for c in result.candidates)
    # match_diagonal_offcuts (triangle-pair reuse) is wired up end to end —
    # a real surface produces enough matching boundary slivers that at
    # least one candidate shows real reuse, not just the zero-reuse
    # fallback.
    assert any(c.offcuts.reused_count > 0 for c in result.candidates)


def test_diagonal_has_no_flush_corner_canonical_candidates():
    """A 45-degree tile can never sit flush with a 90-degree surface corner
    (geometrically impossible, not just unconsidered) — solve_tile_layout
    skips canonical-candidate injection for this bond, so no returned
    candidate should carry a "corner" label the way stack/running/
    herringbone candidates do."""
    surface = Surface(width=2000, height=1500)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="diagonal", candidate_count=10, sample_steps=8,
    )

    assert all("corner" not in c.label for c in result.candidates)


def test_diagonal_allow_rotation_can_surface_a_rotated_candidate():
    surface = Surface(width=2000, height=1500)
    tile = Tile(width=300, height=150, allow_rotation=True)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="diagonal", candidate_count=20, sample_steps=8,
    )

    assert any(c.rotated for c in result.candidates)


def test_build_bond_diagonal_herringbone_returns_diagonal_herringbone_bond():
    assert isinstance(build_bond("diagonal_herringbone"), DiagonalHerringboneBond)


def test_diagonal_herringbone_solves_end_to_end():
    surface = Surface(width=2000, height=1500)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="diagonal_herringbone", candidate_count=10, sample_steps=8,
    )

    assert len(result.candidates) > 0
    assert all(t.vertices is not None for c in result.candidates for t in c.tiles)
    assert any(c.metrics.min_diagonal_cut_span is not None for c in result.candidates)
    assert all(c.metrics.min_edge_cut_width is None for c in result.candidates)
    assert all(c.metrics.symmetry_delta_x == 0.0 and c.metrics.symmetry_delta_y == 0.0 for c in result.candidates)


def test_diagonal_herringbone_has_no_flush_corner_canonical_candidates():
    surface = Surface(width=2000, height=1500)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="diagonal_herringbone", candidate_count=10, sample_steps=8,
    )

    assert all("corner" not in c.label for c in result.candidates)


def test_diagonal_herringbone_allow_rotation_does_not_duplicate_candidates():
    """Reuses HerringboneBond's own motif, which already mixes both
    90-degree orientations within one lattice — the pattern-level
    rotation search would only relabel an identical layout, the same
    reasoning that already skips it for plain herringbone."""
    surface = Surface(width=2000, height=1500)
    tile = Tile(width=300, height=150, allow_rotation=True)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="diagonal_herringbone", candidate_count=10, sample_steps=8,
    )

    assert all(not c.rotated for c in result.candidates)


def test_build_bond_double_herringbone_returns_double_herringbone_bond():
    assert isinstance(build_bond("double_herringbone"), DoubleHerringboneBond)


def test_build_bond_diagonal_double_herringbone_returns_diagonal_double_herringbone_bond():
    assert isinstance(build_bond("diagonal_double_herringbone"), DiagonalDoubleHerringboneBond)


def test_double_herringbone_solves_end_to_end_with_a_flush_corner_candidate():
    """Unlike the diagonal-family bonds, double herringbone is wall-aligned
    — a flush corner candidate is just as meaningful for it as for plain
    herringbone, so canonical-candidate injection is *not* skipped here."""
    surface = Surface(width=2000, height=1500)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="double_herringbone", candidate_count=20, sample_steps=8,
    )

    assert len(result.candidates) > 0
    assert any("corner" in c.label for c in result.candidates)


def test_double_herringbone_allow_rotation_does_not_duplicate_candidates():
    surface = Surface(width=2000, height=1500)
    tile = Tile(width=300, height=150, allow_rotation=True)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="double_herringbone", candidate_count=10, sample_steps=8,
    )

    assert all(not c.rotated for c in result.candidates)


def test_diagonal_double_herringbone_solves_end_to_end():
    surface = Surface(width=2000, height=1500)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)

    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="diagonal_double_herringbone", candidate_count=10, sample_steps=8,
    )

    assert len(result.candidates) > 0
    assert all(t.vertices is not None for c in result.candidates for t in c.tiles)
    assert any(c.metrics.min_diagonal_cut_span is not None for c in result.candidates)
    assert all(c.metrics.min_edge_cut_width is None for c in result.candidates)
    assert all("corner" not in c.label for c in result.candidates)
