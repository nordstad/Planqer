"""
Core geometry for tile layout: surfaces, cutouts, tiles, joints, and the
clipping/classification logic that turns a raw lattice position into a
placed (and possibly cut or notched) tile.

Coordinate system: (0, 0) is the bottom-left corner of the surface, x grows
right, y grows up. All units are millimetres, matching the rest of the app.
"""

from dataclasses import dataclass, field
from enum import Enum


class TileKind(str, Enum):
    """How a placed tile relates to the surface and any cutouts."""

    FULL = "full"        # unmodified tile, no boundary or cutout clipping
    CUT = "cut"          # clipped by the surface boundary only (straight cut)
    NOTCHED = "notched"  # overlaps a cutout; the piece needs a notch cut too


@dataclass(frozen=True)
class Cutout:
    """A rectangular opening in the surface (window, door, socket, hood)."""

    x: float
    y: float
    width: float
    height: float
    label: str | None = None

    @property
    def area(self) -> float:
        return self.width * self.height

    def overlaps_with(self, other: "Cutout") -> bool:
        return not (
            self.x + self.width <= other.x
            or other.x + other.width <= self.x
            or self.y + self.height <= other.y
            or other.y + other.height <= self.y
        )


@dataclass(frozen=True)
class Surface:
    """A rectangular surface to be tiled, with optional rectangular cutouts."""

    width: float
    height: float
    cutouts: tuple[Cutout, ...] = field(default_factory=tuple)

    def __post_init__(self):
        if self.width <= 0 or self.height <= 0:
            raise ValueError("Surface width and height must be positive")

        for cutout in self.cutouts:
            if (
                cutout.x < 0
                or cutout.y < 0
                or cutout.x + cutout.width > self.width
                or cutout.y + cutout.height > self.height
            ):
                raise ValueError(
                    f"Cutout {cutout.label or ''} lies outside the surface bounds"
                )

        for i, a in enumerate(self.cutouts):
            for b in self.cutouts[i + 1 :]:
                if a.overlaps_with(b):
                    raise ValueError("Cutouts must not overlap each other")

    @property
    def gross_area(self) -> float:
        return self.width * self.height

    @property
    def net_area(self) -> float:
        """Surface area minus all cutout areas."""
        return self.gross_area - sum(c.area for c in self.cutouts)


@dataclass(frozen=True)
class Tile:
    """A single rectangular tile/board/panel size."""

    width: float
    height: float
    allow_rotation: bool = False

    def __post_init__(self):
        if self.width <= 0 or self.height <= 0:
            raise ValueError("Tile width and height must be positive")


@dataclass(frozen=True)
class JointSpec:
    """Spacing configuration: grout/joint between tiles, and a perimeter gap
    (e.g. an expansion gap) between the tile field and the surface edge."""

    joint_width: float = 3.0
    perimeter_gap: float = 0.0

    def __post_init__(self):
        if self.joint_width < 0 or self.perimeter_gap < 0:
            raise ValueError("joint_width and perimeter_gap must not be negative")


@dataclass(frozen=True)
class PlacedTile:
    """A tile after clipping against the surface boundary and cutouts."""

    x: float
    y: float
    width: float
    height: float
    rotated: bool
    kind: TileKind
    nominal_width: float
    nominal_height: float
    notch_area: float = 0.0
    is_sliver: bool = False

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def is_full(self) -> bool:
        return self.kind == TileKind.FULL

    @property
    def min_dimension(self) -> float:
        """The smaller of the two clipped dimensions that differs from the
        nominal tile size — used for sliver detection. For a FULL tile this
        is simply the smaller of width/height (never a sliver by definition)."""
        return min(self.width, self.height)


def _rect_intersection(
    ax: float, ay: float, aw: float, ah: float, bx: float, by: float, bw: float, bh: float
) -> tuple[float, float, float, float] | None:
    """Axis-aligned rectangle intersection. Returns (x, y, w, h) or None."""
    left = max(ax, bx)
    right = min(ax + aw, bx + bw)
    bottom = max(ay, by)
    top = min(ay + ah, by + bh)
    if right <= left or top <= bottom:
        return None
    return (left, bottom, right - left, top - bottom)


def place_and_clip(
    x: float,
    y: float,
    rotated: bool,
    tile: Tile,
    surface: Surface,
    joint: JointSpec,
) -> PlacedTile | None:
    """Place a tile with its raw (pre-clip) top-left corner at (x, y), clip it
    against the surface's usable interior (surface shrunk by perimeter_gap)
    and against any cutouts, and classify the result.

    Returns None if the tile falls entirely outside the usable surface, or
    entirely inside a cutout (i.e. it isn't needed at all).
    """
    w, h = (tile.height, tile.width) if rotated else (tile.width, tile.height)

    gap = joint.perimeter_gap
    usable_x, usable_y = gap, gap
    usable_w = surface.width - 2 * gap
    usable_h = surface.height - 2 * gap
    if usable_w <= 0 or usable_h <= 0:
        raise ValueError("perimeter_gap leaves no usable surface area")

    clipped = _rect_intersection(x, y, w, h, usable_x, usable_y, usable_w, usable_h)
    if clipped is None:
        return None
    cx, cy, cw, ch = clipped

    boundary_cut = cw < w or ch < h

    # Cutouts are validated as mutually non-overlapping, so overlap areas
    # against this (already surface-clipped) piece can simply be summed.
    notch_area = 0.0
    remaining_area = cw * ch
    for cutout in surface.cutouts:
        overlap = _rect_intersection(cx, cy, cw, ch, cutout.x, cutout.y, cutout.width, cutout.height)
        if overlap is not None:
            notch_area += overlap[2] * overlap[3]

    if notch_area >= remaining_area - 1e-9:
        return None  # entirely inside a cutout — not a real piece

    if notch_area > 1e-9:
        kind = TileKind.NOTCHED
    elif boundary_cut:
        kind = TileKind.CUT
    else:
        kind = TileKind.FULL

    return PlacedTile(
        x=cx,
        y=cy,
        width=cw,
        height=ch,
        rotated=rotated,
        kind=kind,
        nominal_width=w,
        nominal_height=h,
        notch_area=notch_area,
    )
