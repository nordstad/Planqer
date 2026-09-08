"""
Tests for tile layout geometry, bonds, scoring, and offcut reuse.

Where practical these use hand-computed known-answer cases (surface, tile,
and joint dimensions chosen so the expected tile counts and cut sizes can be
verified by arithmetic, not just by re-running the code under test).
"""

import pytest

from planqer.tile_layout.bonds import RunningBond, StackBond
from planqer.tile_layout.geometry import (
    Cutout,
    JointSpec,
    PlacedTile,
    Surface,
    Tile,
    TileKind,
    place_and_clip,
)
from planqer.tile_layout.offcuts import match_offcuts
from planqer.tile_layout.scoring import score_layout

# ── Surface / Cutout validation ──────────────────────────────────────────

def test_surface_rejects_non_positive_dimensions():
    with pytest.raises(ValueError):
        Surface(width=0, height=100)
    with pytest.raises(ValueError):
        Surface(width=100, height=-1)


def test_surface_rejects_cutout_outside_bounds():
    with pytest.raises(ValueError):
        Surface(width=1000, height=1000, cutouts=(Cutout(x=900, y=0, width=200, height=200),))


def test_surface_rejects_overlapping_cutouts():
    cutouts = (
        Cutout(x=0, y=0, width=100, height=100),
        Cutout(x=50, y=50, width=100, height=100),
    )
    with pytest.raises(ValueError):
        Surface(width=1000, height=1000, cutouts=cutouts)


def test_surface_net_area_subtracts_cutouts():
    surface = Surface(width=1000, height=1000, cutouts=(Cutout(x=0, y=0, width=100, height=200),))
    assert surface.gross_area == 1_000_000
    assert surface.net_area == 1_000_000 - 20_000


# ── place_and_clip ────────────────────────────────────────────────────────

def test_full_tile_placed_entirely_inside_surface():
    surface = Surface(width=1000, height=1000)
    tile = Tile(width=300, height=300)
    joint = JointSpec(joint_width=0)

    placed = place_and_clip(x=100, y=100, rotated=False, tile=tile, surface=surface, joint=joint)

    assert placed is not None
    assert placed.kind == TileKind.FULL
    assert (placed.x, placed.y, placed.width, placed.height) == (100, 100, 300, 300)


def test_tile_clipped_at_surface_boundary_is_cut():
    surface = Surface(width=1000, height=600)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=0)

    # Placed so it overhangs the right edge by 200mm.
    placed = place_and_clip(x=900, y=0, rotated=False, tile=tile, surface=surface, joint=joint)

    assert placed is not None
    assert placed.kind == TileKind.CUT
    assert placed.width == pytest.approx(100)
    assert placed.height == pytest.approx(600)
    assert placed.nominal_width == 300


def test_tile_entirely_outside_surface_is_none():
    surface = Surface(width=1000, height=600)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=0)

    placed = place_and_clip(x=1000, y=0, rotated=False, tile=tile, surface=surface, joint=joint)

    assert placed is None


def test_perimeter_gap_shrinks_usable_area():
    surface = Surface(width=1000, height=600)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=0, perimeter_gap=10)

    # A tile placed flush with the true edge is clipped back by the gap.
    placed = place_and_clip(x=0, y=0, rotated=False, tile=tile, surface=surface, joint=joint)

    assert placed is not None
    assert placed.x == pytest.approx(10)
    assert placed.width == pytest.approx(290)
    assert placed.kind == TileKind.CUT


def test_tile_fully_inside_cutout_is_discarded():
    surface = Surface(width=1000, height=1000, cutouts=(Cutout(x=0, y=0, width=400, height=400),))
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    placed = place_and_clip(x=100, y=100, rotated=False, tile=tile, surface=surface, joint=joint)

    assert placed is None


def test_tile_partially_overlapping_cutout_is_notched():
    surface = Surface(width=1000, height=1000, cutouts=(Cutout(x=250, y=0, width=100, height=100),))
    tile = Tile(width=300, height=300)
    joint = JointSpec(joint_width=0)

    # Tile spans x:[200,500), y:[0,300); cutout spans x:[250,350), y:[0,100)
    # -> overlap is x:[250,350)∩[200,500)=100 wide, y:[0,100) -> 100x100 = 10,000
    placed = place_and_clip(x=200, y=0, rotated=False, tile=tile, surface=surface, joint=joint)

    assert placed is not None
    assert placed.kind == TileKind.NOTCHED
    assert placed.notch_area == pytest.approx(10_000)


def test_rotation_swaps_dimensions():
    surface = Surface(width=1000, height=1000)
    tile = Tile(width=300, height=150, allow_rotation=True)
    joint = JointSpec(joint_width=0)

    placed = place_and_clip(x=0, y=0, rotated=True, tile=tile, surface=surface, joint=joint)

    assert placed is not None
    assert placed.nominal_width == 150
    assert placed.nominal_height == 300


# ── Bonds ─────────────────────────────────────────────────────────────────

def test_stack_bond_covers_exact_grid_with_no_partial_tiles():
    # 3 columns x 2 rows exactly, pitch 303 x 603 (300+3 joint, 600+3 joint)
    surface = Surface(width=909, height=1206)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=3)

    positions = list(StackBond().raw_positions(surface, tile, joint, offset_x=0, offset_y=0))
    placed = [
        p
        for (x, y, rotated) in positions
        if (p := place_and_clip(x, y, rotated, tile, surface, joint)) is not None
    ]

    assert len(placed) == 6
    assert all(p.kind == TileKind.FULL for p in placed)


def test_stack_bond_produces_one_cut_column_when_width_does_not_divide_evenly():
    # Hand-computed: 1000mm wide / 300mm tile, no joint -> 3 full columns
    # (900mm) + one 100mm-wide cut column. Height matches exactly (600/600).
    surface = Surface(width=1000, height=600)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=0)

    positions = list(StackBond().raw_positions(surface, tile, joint, offset_x=0, offset_y=0))
    placed = [
        p
        for (x, y, rotated) in positions
        if (p := place_and_clip(x, y, rotated, tile, surface, joint)) is not None
    ]

    full = [p for p in placed if p.kind == TileKind.FULL]
    cut = [p for p in placed if p.kind == TileKind.CUT]

    assert len(placed) == 4
    assert len(full) == 3
    assert len(cut) == 1
    assert cut[0].width == pytest.approx(100)
    assert cut[0].height == pytest.approx(600)


def test_running_bond_shifts_alternate_rows_by_offset_fraction():
    surface = Surface(width=1000, height=1206)  # 2 rows at pitch 603
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=3)

    bond = RunningBond(offset_fraction=0.5)
    positions = list(bond.raw_positions(surface, tile, joint, offset_x=0, offset_y=0))

    pitch_x = 300 + 3
    row0_xs = sorted({x for (x, y, _r) in positions if abs(y - 0) < 1e-6})
    row1_xs = sorted({x for (x, y, _r) in positions if abs(y - 603) < 1e-6})

    # The shift is defined as a fraction of the tile width (not the pitch,
    # which would also fold in the joint) — see RunningBond's docstring.
    # Since both rows are arithmetic progressions at the same pitch, x mod
    # pitch is constant across an entire row, so any element demonstrates it.
    shift = (row1_xs[0] - row0_xs[0]) % pitch_x
    assert shift == pytest.approx(300 * 0.5)


def test_running_bond_rejects_offset_fraction_out_of_range():
    with pytest.raises(ValueError):
        RunningBond(offset_fraction=0.0)
    with pytest.raises(ValueError):
        RunningBond(offset_fraction=1.0)


# ── Scoring ───────────────────────────────────────────────────────────────

def _placed_layout_for_1000x600():
    """The hand-computed 4-tile layout from
    test_stack_bond_produces_one_cut_column_when_width_does_not_divide_evenly."""
    surface = Surface(width=1000, height=600)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=0)
    positions = list(StackBond().raw_positions(surface, tile, joint, offset_x=0, offset_y=0))
    placed = [
        p
        for (x, y, rotated) in positions
        if (p := place_and_clip(x, y, rotated, tile, surface, joint)) is not None
    ]
    return surface, tile, placed


def test_score_layout_exact_coverage_case():
    surface, _tile, placed = _placed_layout_for_1000x600()

    scored, metrics = score_layout(placed, surface)

    assert metrics.placed_tile_count == 4
    assert metrics.full_tile_count == 3
    assert metrics.cut_tile_count == 1
    assert metrics.notched_count == 0
    # No joints in this case, so tiles cover the surface exactly.
    assert metrics.coverage_area == pytest.approx(600_000)
    assert metrics.waste_area == pytest.approx(0)
    assert metrics.efficiency == pytest.approx(1.0)
    assert metrics.min_edge_cut_width == pytest.approx(100)
    assert metrics.min_edge_cut_height is None
    assert len(scored) == 4


def test_score_layout_with_joints_reports_waste():
    surface = Surface(width=909, height=1206)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=3)
    positions = list(StackBond().raw_positions(surface, tile, joint, offset_x=0, offset_y=0))
    placed = [
        p
        for (x, y, rotated) in positions
        if (p := place_and_clip(x, y, rotated, tile, surface, joint)) is not None
    ]

    _scored, metrics = score_layout(placed, surface)

    assert metrics.full_tile_count == 6
    assert metrics.cut_tile_count == 0
    assert metrics.coverage_area == pytest.approx(6 * 300 * 600)
    assert metrics.waste_area == pytest.approx(surface.net_area - 6 * 300 * 600)


def test_score_layout_empty_raises():
    surface = Surface(width=1000, height=1000)
    with pytest.raises(ValueError):
        score_layout([], surface)


def test_sliver_detection_flags_thin_cut_pieces():
    surface, _tile, placed = _placed_layout_for_1000x600()  # cut piece is 100mm wide

    scored, metrics = score_layout(placed, surface, min_edge_cut=150)

    slivers = [t for t in scored if t.is_sliver]
    assert metrics.sliver_count == 1
    assert len(slivers) == 1
    assert slivers[0].width == pytest.approx(100)


def test_sliver_threshold_below_cut_width_flags_nothing():
    surface, _tile, placed = _placed_layout_for_1000x600()

    _scored, metrics = score_layout(placed, surface, min_edge_cut=50)

    assert metrics.sliver_count == 0


def test_symmetry_delta_zero_when_layout_is_centered():
    # 1000mm surface, 300mm tile: centering leaves a 50mm cut on each side.
    surface = Surface(width=1000, height=300)
    tile = Tile(width=300, height=300)
    joint = JointSpec(joint_width=0)
    # 3 tiles at pitch 300 covering 900mm, centered leaves 50mm each side.
    offset_x = (1000 - 900) / 2
    positions = list(StackBond().raw_positions(surface, tile, joint, offset_x=offset_x, offset_y=0))
    placed = [
        p
        for (x, y, rotated) in positions
        if (p := place_and_clip(x, y, rotated, tile, surface, joint)) is not None
    ]

    _scored, metrics = score_layout(placed, surface)

    assert metrics.symmetry_delta_x == pytest.approx(0, abs=1e-6)


def test_symmetry_delta_nonzero_when_layout_is_not_centered():
    surface, _tile, placed = _placed_layout_for_1000x600()  # flush left: 0 vs 100mm cut

    _scored, metrics = score_layout(placed, surface)

    assert metrics.symmetry_delta_x == pytest.approx(200)  # 300 (right, full) vs 100 (left? )


# ── Offcut reuse ──────────────────────────────────────────────────────────

def _tile_at(x, y, width, height, kind=TileKind.CUT, nominal_width=300, nominal_height=600):
    return PlacedTile(
        x=x, y=y, width=width, height=height, rotated=False,
        kind=kind, nominal_width=nominal_width, nominal_height=nominal_height,
    )


def test_offcut_from_one_cut_tile_can_satisfy_another():
    tile = Tile(width=300, height=600)
    # Three independently-sized CUT tiles (nominal sizes deliberately differ
    # per tile so this test isn't accidentally symmetric — see the reasoning
    # in .plans/tile-layout.md; two same-nominal-size CUT tiles always match
    # each other reciprocally or not at all, which doesn't exercise a
    # one-directional match).
    #   tile 0: nominal 300x600, cut to 250x600 -> offcut 50x600
    #   tile 1: nominal 100x600, cut to 80x600  -> offcut 20x600 (too small for anyone)
    #   tile 2: nominal 60x600,  cut to 50x600  -> offcut 10x600 (too small to help tile 0)
    # tile 2's requirement (50x600) is exactly satisfied by tile 0's offcut.
    placed = [
        _tile_at(0, 0, 250, 600, nominal_width=300, nominal_height=600),
        _tile_at(300, 0, 80, 600, nominal_width=100, nominal_height=600),
        _tile_at(400, 0, 50, 600, nominal_width=60, nominal_height=600),
    ]

    result = match_offcuts(placed, tile)

    assert result.raw_tile_count == 3
    assert result.reused_count == 1
    assert result.tiles_to_purchase == 2
    assert result.matches == ((2, 0),)


def test_offcut_too_small_is_not_matched():
    tile = Tile(width=300, height=600)
    placed = [
        _tile_at(0, 0, 280, 600),   # offcut only 20mm wide
        _tile_at(300, 0, 100, 600),  # needs 100mm — offcut can't cover it
    ]

    result = match_offcuts(placed, tile)

    assert result.reused_count == 0
    assert result.tiles_to_purchase == 2


def test_full_tiles_do_not_generate_or_consume_offcuts():
    tile = Tile(width=300, height=600)
    placed = [
        PlacedTile(x=0, y=0, width=300, height=600, rotated=False, kind=TileKind.FULL,
                   nominal_width=300, nominal_height=600),
        _tile_at(300, 0, 100, 600),
    ]

    result = match_offcuts(placed, tile)

    assert result.raw_tile_count == 2
    assert result.reused_count == 0  # no CUT tile produced an offcut to reuse
    assert result.tiles_to_purchase == 2


def test_rotation_allows_matching_a_swapped_offcut():
    tile = Tile(width=300, height=600, allow_rotation=True)
    placed = [
        _tile_at(0, 0, 300, 500),    # offcut: 300 x 100
        _tile_at(300, 0, 100, 300),  # needs 100 x 300 — fits the offcut rotated
    ]

    result = match_offcuts(placed, tile)

    assert result.reused_count == 1
