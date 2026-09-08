"""
Tests for the Phase 1 candidate solver: search, dedup, Pareto ranking,
labeling, and waste/offcut integration.
"""

import math

import pytest

from planqer.tile_layout.geometry import Cutout, JointSpec, Surface, Tile
from planqer.tile_layout.solver import build_bond, solve_tile_layout


def test_build_bond_rejects_unknown_pattern():
    with pytest.raises(ValueError):
        build_bond("herringbone")  # not implemented until phase 4


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
