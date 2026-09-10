"""
Tests for tile layout geometry, bonds, scoring, and offcut reuse.

Where practical these use hand-computed known-answer cases (surface, tile,
and joint dimensions chosen so the expected tile counts and cut sizes can be
verified by arithmetic, not just by re-running the code under test).
"""

import pytest

from planqer.tile_layout.bonds import (
    DiagonalBond,
    DiagonalDoubleHerringboneBond,
    DiagonalHerringboneBond,
    DoubleHerringboneBond,
    HerringboneBond,
    RunningBond,
    StackBond,
)
from planqer.tile_layout.geometry import (
    Cutout,
    JointSpec,
    PlacedTile,
    Surface,
    Tile,
    TileKind,
    place_and_clip,
    place_and_clip_at_angle,
    place_and_clip_diagonal,
)
from planqer.tile_layout.offcuts import match_diagonal_offcuts, match_offcuts
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


# ── place_and_clip_diagonal ───────────────────────────────────────────────
#
# A diagonal ("set on point") tile is a 100x100 square rotated 45 degrees
# about its own center: its 4 corners sit at a distance of 50*sqrt(2) ==
# 70.7106781... from the center, on the N/E/S/W compass points. That
# constant recurs throughout these hand-computed cases.

def test_diagonal_full_tile_entirely_inside_surface_is_full():
    surface = Surface(width=200, height=200)
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    placed = place_and_clip_diagonal(cx=100, cy=100, tile=tile, surface=surface, joint=joint)

    assert placed is not None
    assert placed.kind == TileKind.FULL
    assert len(placed.vertices) == 4
    assert placed.area == pytest.approx(10_000)


def test_diagonal_area_uses_true_polygon_area_not_bounding_box():
    # The bounding box of a square rotated 45 degrees is exactly double its
    # real area (side = 100*sqrt(2), bbox area = 20,000) -- PlacedTile.area
    # must return the true 10,000, not width*height, or every diagonal
    # candidate's coverage/waste would be silently wrong.
    surface = Surface(width=200, height=200)
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    placed = place_and_clip_diagonal(cx=100, cy=100, tile=tile, surface=surface, joint=joint)

    assert placed.width == pytest.approx(100 * 1.4142135623730951)  # bounding box side
    assert placed.area == pytest.approx(10_000)  # true polygon area, not width*height


def test_diagonal_tile_clipped_at_one_edge_leaves_a_pentagon():
    # Center shifted left so only the west corner (at cx - 70.71) pokes
    # past the surface's x=0 edge -- clipping a single corner off a
    # quadrilateral leaves a pentagon (4 - 1 removed + 2 new intersection
    # points), the common case for a tile mostly inside the field.
    surface = Surface(width=200, height=200)
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    placed = place_and_clip_diagonal(cx=30, cy=100, tile=tile, surface=surface, joint=joint)

    assert placed is not None
    assert placed.kind == TileKind.CUT
    assert len(placed.vertices) == 5
    assert placed.area == pytest.approx(8342.640687119285)
    assert min(p[0] for p in placed.vertices) == pytest.approx(0)


def test_diagonal_tile_mostly_outside_leaves_a_small_triangle():
    # Center far enough outside the surface that only the tip of the
    # diamond's east corner remains inside -- this is the small sliver
    # case at the very tip of a diagonal row (the shape offcuts.py's
    # triangle-pairing later relies on).
    surface = Surface(width=200, height=200)
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    placed = place_and_clip_diagonal(cx=-50, cy=100, tile=tile, surface=surface, joint=joint)

    assert placed is not None
    assert placed.kind == TileKind.CUT
    assert len(placed.vertices) == 3
    assert placed.area == pytest.approx(428.93218813452495)


def test_diagonal_tile_entirely_outside_surface_is_none():
    surface = Surface(width=200, height=200)
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    placed = place_and_clip_diagonal(cx=-200, cy=100, tile=tile, surface=surface, joint=joint)

    assert placed is None


def test_diagonal_tile_partially_overlapping_cutout_is_notched():
    # Diamond centered at (200, 200), fully inside a 400x400 surface (no
    # boundary clip). A cutout occupying the diamond's NE bounding-box
    # quadrant overlaps exactly the diamond's NE quarter -- a right
    # triangle with both legs 50*sqrt(2), i.e. area (50*sqrt(2))^2 / 2 ==
    # 2500 exactly.
    surface = Surface(width=400, height=400, cutouts=(Cutout(x=200, y=200, width=100, height=100),))
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    placed = place_and_clip_diagonal(cx=200, cy=200, tile=tile, surface=surface, joint=joint)

    assert placed is not None
    assert placed.kind == TileKind.NOTCHED
    assert placed.notch_area == pytest.approx(2500)
    # area is the boundary-clipped shape's area *including* the notch
    # region -- notch_area is subtracted separately at the aggregate level
    # in scoring.py, exactly like the axis-aligned NOTCHED contract already
    # works (see test_tile_partially_overlapping_cutout_is_notched above).
    assert placed.area == pytest.approx(10_000)


def test_diagonal_tile_fully_inside_cutout_is_discarded():
    surface = Surface(width=400, height=400, cutouts=(Cutout(x=0, y=0, width=400, height=400),))
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    placed = place_and_clip_diagonal(cx=200, cy=200, tile=tile, surface=surface, joint=joint)

    assert placed is None


def test_place_and_clip_at_angle_45_matches_place_and_clip_diagonal():
    """place_and_clip_diagonal is a thin wrapper over the more general
    place_and_clip_at_angle (angle_deg=45, whole tile) -- this pins that
    the generalization (needed for diagonal herringbone's two piece
    shapes/angles) didn't change diagonal's own behavior."""
    surface = Surface(width=200, height=200)
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    via_wrapper = place_and_clip_diagonal(cx=30, cy=100, tile=tile, surface=surface, joint=joint)
    via_general = place_and_clip_at_angle(
        cx=30, cy=100, width=tile.width, height=tile.height, angle_deg=45.0, surface=surface, joint=joint,
    )

    assert via_wrapper.vertices == via_general.vertices
    assert via_wrapper.kind == via_general.kind


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


def _clipped(bond, surface, tile, joint, offset_x=0.0, offset_y=0.0):
    return [
        p
        for (x, y, rotated) in bond.raw_positions(surface, tile, joint, offset_x, offset_y)
        if (p := place_and_clip(x, y, rotated, tile, surface, joint)) is not None
    ]


def _no_overlaps(tiles):
    eps = 1e-6

    def overlaps(a, b):
        return not (
            a.x + a.width <= b.x + eps or b.x + b.width <= a.x + eps
            or a.y + a.height <= b.y + eps or b.y + b.height <= a.y + eps
        )

    return not any(overlaps(tiles[i], tiles[j]) for i in range(len(tiles)) for j in range(i + 1, len(tiles)))


@pytest.mark.parametrize("width,height,joint_width", [
    (300, 150, 3),   # classic 2:1 plank
    (300, 100, 0),   # 3:1 plank, no grout
    (200, 180, 4),   # a ratio close to square, real joint
])
def test_herringbone_bond_never_overlaps(width, height, joint_width):
    """Verified constructively (see bonds.HerringboneBond's docstring) for
    any tile aspect ratio and joint width — this exercises that guarantee
    against the real geometry pipeline, not just the derivation script."""
    surface = Surface(width=2000, height=1500)
    tile = Tile(width=width, height=height)
    joint = JointSpec(joint_width=joint_width)

    placed = _clipped(HerringboneBond(), surface, tile, joint)

    assert len(placed) > 0
    assert _no_overlaps(placed)


def test_herringbone_bond_places_both_orientations():
    surface = Surface(width=2000, height=1500)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)

    placed = _clipped(HerringboneBond(), surface, tile, joint)

    widths = {round(t.width) for t in placed if t.kind == TileKind.FULL}
    # A full tile is either 300x150 (unrotated) or 150x300 (rotated) — both
    # should appear, since herringbone mixes both within one lattice.
    assert 300 in widths
    assert 150 in widths


def test_herringbone_bond_leaves_no_gap():
    """A gap (as opposed to an overlap) doesn't show up as an overlap check
    at all — it shows up as *missing area*. Coverage area must equal surface
    area minus the deliberate joint gaps, not less (a hole would silently
    under-report both waste and tile count)."""
    surface = Surface(width=1000, height=1000)
    tile = Tile(width=200, height=100)
    joint = JointSpec(joint_width=0)  # zero joint: coverage must be exact

    placed = _clipped(HerringboneBond(), surface, tile, joint)
    _scored, metrics = score_layout(placed, surface)

    assert metrics.coverage_area == pytest.approx(surface.net_area, rel=1e-6)


def _diagonal_clipped(bond, surface, tile, joint, offset_x=0.0, offset_y=0.0):
    return [
        p
        for (cx, cy, _rotated) in bond.raw_positions(surface, tile, joint, offset_x, offset_y)
        if (p := place_and_clip_diagonal(cx, cy, tile, surface, joint)) is not None
    ]


def _tile_polygon(t: PlacedTile) -> list[tuple[float, float]]:
    if t.vertices is not None:
        return list(t.vertices)
    return [(t.x, t.y), (t.x + t.width, t.y), (t.x + t.width, t.y + t.height), (t.x, t.y + t.height)]


def _convex_polygon_overlap_area(a, b) -> float:
    """Sutherland-Hodgman clip of convex polygon `a` by convex polygon `b`
    (both CCW), returning the intersection's area. Bounding-box overlap
    (as used for the axis-aligned _no_overlaps helper above) would give
    false positives for diamonds: two diamonds' bounding boxes routinely
    overlap at their corners even when the diamonds themselves don't."""
    output = a
    n = len(b)
    for i in range(n):
        if not output:
            break
        p1, p2 = b[i], b[(i + 1) % n]

        def inside(p, p1=p1, p2=p2):
            return (p2[0] - p1[0]) * (p[1] - p1[1]) - (p2[1] - p1[1]) * (p[0] - p1[0]) >= -1e-9

        def intersect(s, e, p1=p1, p2=p2):
            x1, y1 = s
            x2, y2 = e
            x3, y3 = p1
            x4, y4 = p2
            d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
            if abs(d) < 1e-12:
                return e
            t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d
            return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))

        new_output = []
        m = len(output)
        for j in range(m):
            curr = output[j]
            prev = output[j - 1]
            curr_in = inside(curr)
            prev_in = inside(prev)
            if curr_in:
                if not prev_in:
                    new_output.append(intersect(prev, curr))
                new_output.append(curr)
            elif prev_in:
                new_output.append(intersect(prev, curr))
        output = new_output

    n = len(output)
    if n < 3:
        return 0.0
    total = 0.0
    for i in range(n):
        x1, y1 = output[i]
        x2, y2 = output[(i + 1) % n]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2.0


def _no_polygon_overlaps(tiles) -> bool:
    polygons = [_tile_polygon(t) for t in tiles]
    for i in range(len(tiles)):
        for j in range(i + 1, len(tiles)):
            if _convex_polygon_overlap_area(polygons[i], polygons[j]) > 1e-6:
                return False
    return True


@pytest.mark.parametrize("width,height,joint_width", [
    (100, 100, 3),  # square
    (300, 150, 3),  # 2:1 plank
    (300, 100, 0),  # 3:1 plank, no grout
])
def test_diagonal_bond_never_overlaps(width, height, joint_width):
    """Verified against the real geometry pipeline with a proper polygon
    overlap check (bounding-box overlap alone would false-positive on
    every adjacent diamond pair)."""
    surface = Surface(width=1500, height=1200)
    tile = Tile(width=width, height=height)
    joint = JointSpec(joint_width=joint_width)

    placed = _diagonal_clipped(DiagonalBond(), surface, tile, joint)

    assert len(placed) > 0
    assert _no_polygon_overlaps(placed)


def test_diagonal_bond_leaves_no_gap_at_zero_joint():
    """With zero joint width, diamonds tile the plane exactly -- coverage
    must equal surface area (no gaps), matching herringbone's own no-gap
    check above."""
    surface = Surface(width=1000, height=1000)
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    placed = _diagonal_clipped(DiagonalBond(), surface, tile, joint)
    coverage = sum(p.area for p in placed)

    assert coverage == pytest.approx(surface.net_area, rel=1e-6)


def test_diagonal_bond_respects_the_joint_gap():
    """A real (non-zero) joint must measurably reduce coverage relative to
    a zero joint on the same surface -- otherwise the gap parameter would
    be silently ignored."""
    surface = Surface(width=1000, height=1000)
    tile = Tile(width=100, height=100)

    no_joint = _diagonal_clipped(DiagonalBond(), surface, tile, JointSpec(joint_width=0))
    with_joint = _diagonal_clipped(DiagonalBond(), surface, tile, JointSpec(joint_width=5))

    assert sum(p.area for p in with_joint) < sum(p.area for p in no_joint)


def _diagonal_herringbone_clipped(surface, tile, joint, offset_x=0.0, offset_y=0.0):
    """DiagonalHerringboneBond yields (cx, cy, is_v_tile) -- is_v_tile
    picks which of the motif's two piece shapes (l x s "H" or s x l "V")
    this position is; both share the same 45-degree global angle (see
    solver._generate_layout's dispatch for this bond)."""
    l, s = max(tile.width, tile.height), min(tile.width, tile.height)
    placed = []
    for cx, cy, is_v in DiagonalHerringboneBond().raw_positions(surface, tile, joint, offset_x, offset_y):
        width, height = (s, l) if is_v else (l, s)
        p = place_and_clip_at_angle(cx, cy, width, height, 45.0, surface, joint)
        if p is not None:
            placed.append(p)
    return placed


@pytest.mark.parametrize("width,height,joint_width", [
    (300, 150, 3),   # classic 2:1 plank
    (300, 100, 0),   # 3:1 plank, no grout
    (200, 180, 4),   # a ratio close to square, real joint
])
def test_diagonal_herringbone_never_overlaps(width, height, joint_width):
    surface = Surface(width=1500, height=1200)
    tile = Tile(width=width, height=height)
    joint = JointSpec(joint_width=joint_width)

    placed = _diagonal_herringbone_clipped(surface, tile, joint)

    assert len(placed) > 0
    assert _no_polygon_overlaps(placed)


def test_diagonal_herringbone_leaves_no_gap_at_zero_joint():
    surface = Surface(width=1000, height=1000)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=0)

    placed = _diagonal_herringbone_clipped(surface, tile, joint)
    coverage = sum(p.area for p in placed)

    assert coverage == pytest.approx(surface.net_area, rel=1e-6)


def test_diagonal_herringbone_places_both_piece_shapes():
    surface = Surface(width=1500, height=1200)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)

    placed = _diagonal_herringbone_clipped(surface, tile, joint)

    full = [p for p in placed if p.kind == TileKind.FULL]
    nominal_shapes = {(round(p.nominal_width), round(p.nominal_height)) for p in full}
    # The "H" (300x150) and "V" (150x300) motif shapes are two distinct
    # nominal sizes, both of which should appear among full pieces on a
    # real surface -- unlike plain herringbone, there's no PlacedTile.rotated
    # bookkeeping here (both pieces are equally "rotated" 45 degrees), so
    # this checks nominal_width/height directly instead.
    assert (300, 150) in nominal_shapes
    assert (150, 300) in nominal_shapes


@pytest.mark.parametrize("width,height,joint_width", [
    (300, 150, 3),   # classic 2:1 plank
    (300, 100, 0),   # 3:1 plank, no grout
    (200, 180, 4),   # a ratio close to square, real joint
])
def test_double_herringbone_never_overlaps(width, height, joint_width):
    """Double herringbone: each arm of the classic weave is a *pair* of
    planks instead of one — verified constructively (see
    bonds.DoubleHerringboneBond's docstring) by running the same
    translation-vector derivation against the pair's combined footprint,
    which places no restriction on aspect ratio, exactly like a single
    plank."""
    surface = Surface(width=1500, height=1200)
    tile = Tile(width=width, height=height)
    joint = JointSpec(joint_width=joint_width)

    placed = _clipped(DoubleHerringboneBond(), surface, tile, joint)

    assert len(placed) > 0
    assert _no_overlaps(placed)


def test_double_herringbone_leaves_no_gap_at_zero_joint():
    surface = Surface(width=1000, height=1000)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=0)

    placed = _clipped(DoubleHerringboneBond(), surface, tile, joint)
    _scored, metrics = score_layout(placed, surface)

    assert metrics.coverage_area == pytest.approx(surface.net_area, rel=1e-6)


def test_double_herringbone_places_pairs_of_identical_planks():
    """Each arm should show up as a *pair* of same-size planks, not a
    single doubled-up size -- the whole point of "double" herringbone is
    that the individual plank size is unchanged, just used two at a time."""
    surface = Surface(width=1500, height=1200)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)

    placed = _clipped(DoubleHerringboneBond(), surface, tile, joint)

    full = [p for p in placed if p.kind == TileKind.FULL]
    nominal_shapes = {(round(p.nominal_width), round(p.nominal_height)) for p in full}
    assert nominal_shapes == {(300, 150), (150, 300)}  # same two sizes as plain herringbone, not doubled


def _diagonal_double_herringbone_clipped(surface, tile, joint, offset_x=0.0, offset_y=0.0):
    l, s = max(tile.width, tile.height), min(tile.width, tile.height)
    placed = []
    for cx, cy, is_v in DiagonalDoubleHerringboneBond().raw_positions(surface, tile, joint, offset_x, offset_y):
        width, height = (s, l) if is_v else (l, s)
        p = place_and_clip_at_angle(cx, cy, width, height, 45.0, surface, joint)
        if p is not None:
            placed.append(p)
    return placed


@pytest.mark.parametrize("width,height,joint_width", [
    (300, 150, 3),
    (300, 100, 0),
    (200, 180, 4),
])
def test_diagonal_double_herringbone_never_overlaps(width, height, joint_width):
    surface = Surface(width=1500, height=1200)
    tile = Tile(width=width, height=height)
    joint = JointSpec(joint_width=joint_width)

    placed = _diagonal_double_herringbone_clipped(surface, tile, joint)

    assert len(placed) > 0
    assert _no_polygon_overlaps(placed)


def test_diagonal_double_herringbone_leaves_no_gap_at_zero_joint():
    surface = Surface(width=1000, height=1000)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=0)

    placed = _diagonal_double_herringbone_clipped(surface, tile, joint)
    coverage = sum(p.area for p in placed)

    assert coverage == pytest.approx(surface.net_area, rel=1e-6)


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
    # One cut column, one size, so one distinct cut size — the 3 full tiles
    # don't count (measuring a full tile isn't a "cut" to plan around).
    assert metrics.distinct_cut_sizes == 1


def test_distinct_cut_sizes_ignores_full_tiles_and_groups_by_rounded_size():
    surface = Surface(width=1000, height=600)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=0)
    positions = list(StackBond().raw_positions(surface, tile, joint, offset_x=0, offset_y=0))
    placed = [
        p
        for (x, y, rotated) in positions
        if (p := place_and_clip(x, y, rotated, tile, surface, joint)) is not None
    ]

    _scored, metrics = score_layout(placed, surface)

    # 3 full tiles (300x600 each) + 1 cut tile (100x600) — only the cut tile
    # counts, and it's exactly one size.
    assert metrics.full_tile_count == 3
    assert metrics.distinct_cut_sizes == 1


def test_distinct_cut_sizes_groups_notched_and_cut_of_the_same_size_together():
    # A NOTCHED piece and a CUT piece that happen to share a size are the
    # same measurement for a cutter, even though one also needs a notch —
    # they must count as one distinct size, not two.
    surface = Surface(width=1000, height=1000)
    common = dict(width=100, height=100, rotated=False, nominal_width=100, nominal_height=100)
    placed = [
        PlacedTile(x=0, y=0, kind=TileKind.CUT, **common),
        PlacedTile(x=200, y=0, kind=TileKind.NOTCHED, notch_area=25, **common),
        PlacedTile(x=400, y=0, kind=TileKind.FULL, **common),
    ]

    _scored, metrics = score_layout(placed, surface)

    assert metrics.distinct_cut_sizes == 1



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


def test_diagonal_min_cut_span_uses_caliper_width_not_bounding_box():
    # Reuses the exact fixtures from test_diagonal_tile_clipped_at_one_edge_leaves_a_pentagon
    # and test_diagonal_tile_mostly_outside_leaves_a_small_triangle above.
    surface = Surface(width=200, height=200)
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    full = place_and_clip_diagonal(cx=100, cy=100, tile=tile, surface=surface, joint=joint)
    pentagon = place_and_clip_diagonal(cx=30, cy=100, tile=tile, surface=surface, joint=joint)
    triangle = place_and_clip_diagonal(cx=-50, cy=100, tile=tile, surface=surface, joint=joint)

    _scored, metrics = score_layout([full, pentagon, triangle], surface)

    # The bounding-box-based min_edge_cut_width/height stay None -- they're
    # explicitly axis-aligned-only now (see scoring.py).
    assert metrics.min_edge_cut_width is None
    assert metrics.min_edge_cut_height is None
    # The pentagon (one corner clipped off a square) keeps its full 100mm
    # min width -- chopping one corner off doesn't narrow the two opposite
    # edges that actually define a square's minimum width. The triangle
    # (mostly outside, a thin sliver remaining) is the true narrow piece:
    # its width perpendicular to the clipped edge is exactly the distance
    # its tip pokes past the boundary, 50*(sqrt(2)-1).
    assert metrics.min_diagonal_cut_span == pytest.approx(50 * (2**0.5 - 1))


def test_diagonal_symmetry_is_a_real_zero_not_computed():
    """A physically asymmetric diagonal layout (all three pieces sit at
    different x/y extents) must still report exactly 0.0, not skip the
    computation and leave a stale/undefined value -- see scoring.py's
    is_diagonal_layout short-circuit and .plans/tile-layout.md Phase 4b."""
    surface = Surface(width=200, height=200)
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    pentagon = place_and_clip_diagonal(cx=30, cy=100, tile=tile, surface=surface, joint=joint)
    triangle = place_and_clip_diagonal(cx=-50, cy=100, tile=tile, surface=surface, joint=joint)

    _scored, metrics = score_layout([pentagon, triangle], surface)

    assert metrics.symmetry_delta_x == 0.0
    assert metrics.symmetry_delta_y == 0.0


def test_diagonal_sliver_detection_uses_caliper_width():
    surface = Surface(width=200, height=200)
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    pentagon = place_and_clip_diagonal(cx=30, cy=100, tile=tile, surface=surface, joint=joint)
    triangle = place_and_clip_diagonal(cx=-50, cy=100, tile=tile, surface=surface, joint=joint)
    span = 50 * (2**0.5 - 1)  # ~20.71mm, the triangle's known min caliper width

    scored, metrics = score_layout(
        [pentagon, triangle], surface, min_edge_cut=span + 1,
    )

    slivers = {id(t) for t in scored if t.is_sliver}
    assert metrics.sliver_count == 1
    assert len(slivers) == 1
    # The 100mm-wide pentagon must not be flagged just because it's CUT —
    # only the genuinely narrow triangle is a sliver at this threshold.
    sliver_tile = next(t for t in scored if t.is_sliver)
    assert len(sliver_tile.vertices) == 3


def test_diagonal_distinct_cut_sizes_disambiguates_shapes_with_the_same_bounding_box():
    """A triangle and a pentagon can share a bounding box (both clipped
    from the same corner region) — the size key must not conflate them
    just because width/height round the same."""
    surface = Surface(width=200, height=200)
    common_2d = [(0.0, 0.0), (10.0, 0.0), (0.0, 10.0)]  # triangle, bbox 10x10
    common_pentagon = [(0.0, 0.0), (10.0, 0.0), (10.0, 5.0), (5.0, 10.0), (0.0, 10.0)]  # bbox 10x10 too

    common = {"x": 0, "y": 0, "width": 10, "height": 10, "rotated": False, "nominal_width": 100, "nominal_height": 100}
    triangle = PlacedTile(kind=TileKind.CUT, vertices=tuple(common_2d), **common)
    pentagon = PlacedTile(kind=TileKind.CUT, vertices=tuple(common_pentagon), **common)

    _scored, metrics = score_layout([triangle, pentagon], surface)

    assert metrics.distinct_cut_sizes == 2


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


# ── Diagonal offcut reuse ─────────────────────────────────────────────────

def test_diagonal_offcuts_pairs_congruent_triangular_slivers():
    # cx=-50 and cx=250 are symmetric around the surface's x=100 centerline
    # (each poking 50mm past its own boundary), so the two triangular
    # slivers they leave are congruent -- exactly the two halves of one
    # tile ripped along its diagonal.
    surface = Surface(width=200, height=200)
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    tri_a = place_and_clip_diagonal(cx=-50, cy=100, tile=tile, surface=surface, joint=joint)
    tri_b = place_and_clip_diagonal(cx=250, cy=100, tile=tile, surface=surface, joint=joint)
    assert tri_a.kind == TileKind.CUT and len(tri_a.vertices) == 3
    assert tri_b.kind == TileKind.CUT and len(tri_b.vertices) == 3

    result = match_diagonal_offcuts([tri_a, tri_b])

    assert result.raw_tile_count == 2
    assert result.reused_count == 1
    assert result.tiles_to_purchase == 1
    assert result.matches == ((0, 1),)


def test_diagonal_offcuts_does_not_pair_different_sized_slivers():
    surface = Surface(width=200, height=200)
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    small = place_and_clip_diagonal(cx=-50, cy=100, tile=tile, surface=surface, joint=joint)
    bigger = place_and_clip_diagonal(cx=-30, cy=100, tile=tile, surface=surface, joint=joint)

    result = match_diagonal_offcuts([small, bigger])

    assert result.reused_count == 0
    assert result.tiles_to_purchase == 2


def test_diagonal_offcuts_ignores_pentagons_and_full_tiles():
    # Pentagons (a true corner clip) and full diamonds are explicitly out
    # of scope for v1 pairing -- only triangular CUT slivers are matched.
    surface = Surface(width=200, height=200)
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    full = place_and_clip_diagonal(cx=100, cy=100, tile=tile, surface=surface, joint=joint)
    pentagon = place_and_clip_diagonal(cx=30, cy=100, tile=tile, surface=surface, joint=joint)
    assert full.kind == TileKind.FULL
    assert pentagon.kind == TileKind.CUT and len(pentagon.vertices) == 5

    result = match_diagonal_offcuts([full, pentagon])

    assert result.reused_count == 0
    assert result.tiles_to_purchase == 2


def test_diagonal_offcuts_does_not_match_a_triangle_to_itself():
    surface = Surface(width=200, height=200)
    tile = Tile(width=100, height=100)
    joint = JointSpec(joint_width=0)

    tri = place_and_clip_diagonal(cx=-50, cy=100, tile=tile, surface=surface, joint=joint)

    result = match_diagonal_offcuts([tri])

    assert result.reused_count == 0
    assert result.tiles_to_purchase == 1
