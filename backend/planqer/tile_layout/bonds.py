"""
Bond (laying pattern) generators.

A BondGenerator turns a chosen start offset into a raw, pre-clip lattice of
tile positions covering (at least) the whole surface. Clipping against the
surface boundary and cutouts happens afterwards in geometry.place_and_clip —
a bond generator only needs to know about the tile pitch and its own
row/column shift rule.

Adding a new bond (herringbone, diagonal — see .plans/tile-layout.md phase 4)
means adding a new class here. geometry.py, scoring.py and offcuts.py do not
need to change: that is the whole point of this seam.
"""

import math
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Protocol

from .geometry import JointSpec, Surface, Tile


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
