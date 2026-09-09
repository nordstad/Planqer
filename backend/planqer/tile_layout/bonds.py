"""
Bond (laying pattern) generators.

A BondGenerator turns a chosen start offset into a raw, pre-clip lattice of
tile positions covering (at least) the whole surface. Clipping against the
surface boundary and cutouts happens afterwards in geometry.place_and_clip —
a bond generator only needs to know about the tile pitch and its own
row/column shift rule.

Adding a new bond (herringbone, diagonal — see .plans/tile-layout.md phase 4)
means adding a new class here. geometry.py, scoring.py and offcuts.py do not
need to change: that is the whole point of this seam. Herringbone (below)
holds to this — it is built entirely from axis-aligned rectangles, so
place_and_clip's existing rectangle-clip logic applies unchanged. Diagonal
(also below) needed real additions to geometry.py (polygon clipping),
scoring.py (a caliper-width metric), and offcuts.py (triangle-pair
matching) — see .plans/tile-layout.md Phase 4b for that design — but this
module itself still holds to the seam: DiagonalBond only emits raw (x, y,
rotated) positions, same as every other bond here.
"""

import math
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Protocol

from .geometry import JointSpec, Surface, Tile

_C45 = math.sqrt(2) / 2  # cos(45deg) == sin(45deg)


def _index_range(offset: float, pitch: float, extent: float, span: float) -> range:
    """The range of integer lattice indices i such that a tile of size
    `extent` placed at `offset + i * pitch` could intersect [0, span]."""
    i_min = math.floor((0 - extent - offset) / pitch) - 1
    i_max = math.ceil((span - offset) / pitch) + 1
    return range(int(i_min), int(i_max) + 1)


class BondGenerator(Protocol):
    """Generates raw (pre-clip) tile positions for one candidate offset."""

    def raw_positions(
        self, surface: Surface, tile: Tile, joint: JointSpec, offset_x: float, offset_y: float
    ) -> Iterator[tuple[float, float, bool]]:
        """Yields (x, y, rotated) for every tile whose raw footprint could
        overlap the surface. Rotation is always False in the MVP bonds;
        rotation search (when tile.allow_rotation) happens one level up."""
        ...


@dataclass(frozen=True)
class StackBond:
    """Grid bond: every row and column aligned, 0% offset between rows."""

    def raw_positions(
        self, surface: Surface, tile: Tile, joint: JointSpec, offset_x: float, offset_y: float
    ) -> Iterator[tuple[float, float, bool]]:
        pitch_x = tile.width + joint.joint_width
        pitch_y = tile.height + joint.joint_width

        for j in _index_range(offset_y, pitch_y, tile.height, surface.height):
            y = offset_y + j * pitch_y
            for i in _index_range(offset_x, pitch_x, tile.width, surface.width):
                x = offset_x + i * pitch_x
                yield (x, y, False)


@dataclass(frozen=True)
class RunningBond:
    """Running/brick bond: each row j is shifted by
    (j * offset_fraction * tile.width) mod pitch_x relative to row 0.

    offset_fraction=0.5 is a standard brick bond (alternates 0%/50% every
    other row); offset_fraction=1/3 is a third bond (cycles through three
    row positions); any fraction in (0, 1) is accepted.
    """

    offset_fraction: float = 0.5

    def __post_init__(self):
        if not (0.0 < self.offset_fraction < 1.0):
            raise ValueError("offset_fraction must be between 0 and 1 (exclusive)")

    def raw_positions(
        self, surface: Surface, tile: Tile, joint: JointSpec, offset_x: float, offset_y: float
    ) -> Iterator[tuple[float, float, bool]]:
        pitch_x = tile.width + joint.joint_width
        pitch_y = tile.height + joint.joint_width

        for j in _index_range(offset_y, pitch_y, tile.height, surface.height):
            y = offset_y + j * pitch_y
            row_shift = (j * self.offset_fraction * tile.width) % pitch_x
            row_offset_x = offset_x + row_shift
            for i in _index_range(row_offset_x, pitch_x, tile.width, surface.width):
                x = row_offset_x + i * pitch_x
                yield (x, y, False)


@dataclass(frozen=True)
class HerringboneBond:
    """90-degree herringbone weave: every tile alternates 90 degrees from its
    neighbors, still axis-aligned (no 45-degree cuts) — the common "straight
    herringbone" plank-tile pattern, as opposed to mitred "chevron".

    Built from a 2-tile motif (one tile in each orientation) repeated on a
    2D lattice. Unlike stack/running bond, this works for *any* tile aspect
    ratio, not just the classic 2:1 plank — verified constructively (see
    .plans/tile-layout.md): with short side s = min(width, height), long
    side l = max(width, height), and joint width g, the motif

        H tile: (l wide, s tall) at the motif origin
        V tile: (s wide, l tall) at (l + g, 0)

    repeats via translation vectors
        T1 = (l + s + 2g, l - s - g)   — advances along one diagonal run
        T2 = (-(s + g), s + g)         — steps to the next parallel run

    and tiles the plane with a uniform gap g between every adjacent tile,
    no overlaps and no gaps, for any s, l > 0 and g >= 0. This was verified
    numerically (zero pairwise overlaps, max residual gap ~ g/2, the
    expected distance to the nearest edge at the center of a grout line)
    before being written here, not just asserted.
    """

    def raw_positions(
        self, surface: Surface, tile: Tile, joint: JointSpec, offset_x: float, offset_y: float
    ) -> Iterator[tuple[float, float, bool]]:
        g = joint.joint_width
        wide = tile.width >= tile.height
        s, l = (tile.height, tile.width) if wide else (tile.width, tile.height)

        # place_and_clip computes a placed tile's (w, h) as
        # (tile.height, tile.width) if rotated else (tile.width, tile.height).
        # Map "H" (l wide, s tall) and "V" (s wide, l tall) to whichever of
        # rotated True/False actually produces that shape for this tile.
        h_rotated = not wide
        v_rotated = wide

        t1x, t1y = l + s + 2 * g, l - s - g
        t2x, t2y = -(s + g), s + g

        # T1 and T2 advance by very different magnitudes (T1 ~ l, T2 ~ s),
        # so a single shared margin sized for the smaller one (T2) wastes a
        # lot of iterations in the T1 direction — margins are computed per
        # axis instead, each just large enough that stepping by that
        # vector's own magnitude comfortably covers the surface's diagonal.
        diagonal = surface.width + surface.height
        margin_i = math.ceil(diagonal / max(abs(t1x), abs(t1y), 1e-6)) + 3
        margin_j = math.ceil(diagonal / max(abs(t2x), abs(t2y), 1e-6)) + 3

        for i in range(-margin_i, margin_i):
            for j in range(-margin_j, margin_j):
                ox = offset_x + i * t1x + j * t2x
                oy = offset_y + i * t1y + j * t2y
                yield (ox, oy, h_rotated)
                yield (ox + l + g, oy, v_rotated)


@dataclass(frozen=True)
class DiagonalBond:
    """45-degree "set on point" bond: every tile is a w x h rectangle
    rotated 45 degrees about its own center (see
    geometry.place_and_clip_diagonal), all in the same fixed orientation —
    unlike herringbone, this bond does not mix two 90-degree orientations
    within one lattice. A non-square tile's other diagonal orientation is
    reached the normal way: the pattern-level rotation search in
    solver._orientations swaps tile.width/height for a second full search
    pass, exactly like stack/running bond — this class doesn't need to
    know about that.

    Built the easy way: generate a plain rectangular lattice in a
    coordinate frame rotated -45 degrees relative to the surface ("local"
    space, where the tiles are just axis-aligned w x h rectangles on a
    regular grid, exactly like StackBond), then rotate each lattice
    point's center back into surface space by +45 degrees before handing
    it to place_and_clip_diagonal. Rotation is an isometry, so a joint gap
    of g between adjacent tiles in local space is still exactly g in
    surface space once rotated — no herringbone-style from-scratch
    translation-vector derivation is needed here, and no restriction on
    tile aspect ratio either.

    offset_x/offset_y are consumed as the *local*-frame offset, over the
    same pitch_x = tile.width + joint_width, pitch_y = tile.height +
    joint_width every bond is already sampled over in solver.py — so the
    solver's existing generic offset-sampling grid works unchanged for
    this bond too. There is, however, no meaningful "full tile flush with
    a straight corner" canonical candidate for a 45-degree tile against a
    90-degree corner (geometrically impossible, not just unconsidered), so
    solver.py skips canonical-candidate injection for this bond and relies
    on the sampled grid alone — see solve_tile_layout.
    """

    def raw_positions(
        self, surface: Surface, tile: Tile, joint: JointSpec, offset_x: float, offset_y: float
    ) -> Iterator[tuple[float, float, bool]]:
        pitch_lx = tile.width + joint.joint_width
        pitch_ly = tile.height + joint.joint_width

        # A local-space step's *world-space* magnitude equals its local
        # pitch exactly (rotation preserves distance), so each axis gets
        # its own margin sized off its own pitch. Unlike herringbone's
        # generic width+height bound, this lattice's two directions are
        # each exactly 45 degrees off-axis, so the exact (not merely safe)
        # required span is the surface rectangle's projection onto either
        # direction: (width + height) / sqrt(2) -- tighter by a factor of
        # sqrt(2) than the Manhattan bound, which matters here since every
        # raw position costs a polygon clip, not a cheap rectangle clip.
        diagonal = (surface.width + surface.height) * _C45
        margin_i = math.ceil(diagonal / pitch_lx) + 3
        margin_j = math.ceil(diagonal / pitch_ly) + 3

        for j in range(-margin_j, margin_j):
            ly = offset_y + j * pitch_ly
            for i in range(-margin_i, margin_i):
                lx = offset_x + i * pitch_lx
                cx = _C45 * (lx - ly)
                cy = _C45 * (lx + ly)
                yield (cx, cy, False)
