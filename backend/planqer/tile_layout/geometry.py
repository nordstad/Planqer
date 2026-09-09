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
    """A tile after clipping against the surface boundary and cutouts.

    `vertices` is None for every axis-aligned bond (stack, running,
    herringbone) — x/y/width/height are then the exact piece, unchanged
    from how this dataclass always worked. A diagonal (45deg "set on
    point") bond sets `vertices` to the tile's true clipped polygon
    (see place_and_clip_diagonal); x/y/width/height then hold only the
    polygon's bounding box, for the many consumers that don't need the
    exact shape (e.g. the cut-list table). Anything that needs the real
    shape (scoring's caliper-width metric, the SVG, offcut pairing) reads
    `vertices` directly.
    """

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
    vertices: tuple[tuple[float, float], ...] | None = None

    @property
    def area(self) -> float:
        # A rotated piece's bounding box is larger than its true footprint
        # (a square rotated 45 degrees has a bounding box exactly double its
        # own area) — width*height would silently over-count coverage and
        # under-count waste for every diagonal piece. Use the exact polygon
        # area whenever we have the real shape.
        if self.vertices is not None:
            return _polygon_area(self.vertices)
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


# ── Diagonal ("set on point") placement ──────────────────────────────────
#
# A diagonal tile is a rectangle rotated 45 degrees about its own center —
# a "diamond". Unlike the axis-aligned path above, clipping it against a
# straight surface/cutout edge does not produce another rectangle: it
# produces an arbitrary convex polygon (a triangle, pentagon, or hexagon
# depending on how many of the diamond's corners fall outside).
#
# The one simplification that keeps this tractable: cutouts are handled
# exactly like the axis-aligned path already handles them — the clipped
# polygon's *outline* is never reshaped around a cutout, only its overlap
# *area* with each cutout is measured and subtracted (see notch_area).
# That means a single primitive — clip a convex polygon against an
# axis-aligned rectangle — covers both the surface boundary (reshapes the
# polygon) and every cutout (area-only), and no polygon-vs-polygon
# clipping is needed anywhere in this module.

_EPS = 1e-9
_HALF_SQRT2 = 0.7071067811865476  # cos(45deg) == sin(45deg)


def _polygon_area(vertices: "tuple[tuple[float, float], ...] | list[tuple[float, float]]") -> float:
    """Shoelace formula. Assumes a simple (non-self-intersecting) polygon;
    every polygon this module produces is convex, which qualifies."""
    n = len(vertices)
    if n < 3:
        return 0.0
    total = 0.0
    for i in range(n):
        x1, y1 = vertices[i]
        x2, y2 = vertices[(i + 1) % n]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2.0


def _clip_convex_polygon(
    vertices: list[tuple[float, float]], rx: float, ry: float, rw: float, rh: float
) -> list[tuple[float, float]]:
    """Sutherland-Hodgman: clip a convex polygon against an axis-aligned
    rectangle. Works one straight edge (half-plane) at a time; each pass's
    output feeds the next, so the result after all four edges is the
    polygon intersected with the rectangle. Returns [] if there's no
    overlap. The input need not be convex for Sutherland-Hodgman to be
    correct against a convex clip window, but every caller in this module
    only ever passes a convex polygon (a diamond, or an already-clipped
    diamond), so the result is always convex too."""

    def clip_half_plane(poly, inside, intersect):
        if not poly:
            return []
        output = []
        prev = poly[-1]
        prev_inside = inside(prev)
        for curr in poly:
            curr_inside = inside(curr)
            if curr_inside:
                if not prev_inside:
                    output.append(intersect(prev, curr))
                output.append(curr)
            elif prev_inside:
                output.append(intersect(prev, curr))
            prev, prev_inside = curr, curr_inside
        return output

    def intersect_x(a, b, xline):
        t = (xline - a[0]) / (b[0] - a[0])
        return (xline, a[1] + t * (b[1] - a[1]))

    def intersect_y(a, b, yline):
        t = (yline - a[1]) / (b[1] - a[1])
        return (a[0] + t * (b[0] - a[0]), yline)

    xmin, xmax = rx, rx + rw
    ymin, ymax = ry, ry + rh

    poly = list(vertices)
    poly = clip_half_plane(poly, lambda p: p[0] >= xmin - _EPS, lambda a, b: intersect_x(a, b, xmin))
    poly = clip_half_plane(poly, lambda p: p[0] <= xmax + _EPS, lambda a, b: intersect_x(a, b, xmax))
    poly = clip_half_plane(poly, lambda p: p[1] >= ymin - _EPS, lambda a, b: intersect_y(a, b, ymin))
    poly = clip_half_plane(poly, lambda p: p[1] <= ymax + _EPS, lambda a, b: intersect_y(a, b, ymax))
    return poly


def _diamond_vertices(cx: float, cy: float, width: float, height: float) -> list[tuple[float, float]]:
    """The 4 corners of a width x height rectangle, centered at (cx, cy),
    rotated 45 degrees about its own center. Returned counter-clockwise
    (south, east, north, west), matching this module's other convex
    polygons so Sutherland-Hodgman clipping behaves consistently."""
    hw, hh = width / 2, height / 2
    c = _HALF_SQRT2
    # Unrotated corners (bottom-left, bottom-right, top-right, top-left),
    # rotated by x' = c*(x-y), y' = c*(x+y) — a standard 45 degree rotation.
    corners = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
    return [(cx + c * (x - y), cy + c * (x + y)) for x, y in corners]


def place_and_clip_diagonal(
    cx: float,
    cy: float,
    tile: Tile,
    surface: Surface,
    joint: JointSpec,
) -> PlacedTile | None:
    """Place a diagonal ("set on point") tile centered at (cx, cy), clip it
    against the surface's usable interior and any cutouts, and classify
    the result. Mirrors place_and_clip's contract exactly, but the piece
    kept is a polygon (`PlacedTile.vertices`), not just an (x, y, w, h)
    rectangle — see the module-level note above for why cutouts still only
    need an area-overlap, not a reshaping clip.

    Returns None if the tile falls entirely outside the usable surface, or
    entirely inside a cutout.
    """
    gap = joint.perimeter_gap
    usable_x, usable_y = gap, gap
    usable_w = surface.width - 2 * gap
    usable_h = surface.height - 2 * gap
    if usable_w <= 0 or usable_h <= 0:
        raise ValueError("perimeter_gap leaves no usable surface area")

    diamond = _diamond_vertices(cx, cy, tile.width, tile.height)
    nominal_area = tile.width * tile.height

    clipped = _clip_convex_polygon(diamond, usable_x, usable_y, usable_w, usable_h)
    if len(clipped) < 3:
        return None
    clipped_area = _polygon_area(clipped)
    if clipped_area < _EPS:
        return None

    boundary_cut = clipped_area < nominal_area - _EPS

    # Same area-only treatment as place_and_clip's notch handling: cutouts
    # are validated as mutually non-overlapping, so overlaps against this
    # (already boundary-clipped) polygon can simply be summed.
    notch_area = 0.0
    for cutout in surface.cutouts:
        overlap = _clip_convex_polygon(clipped, cutout.x, cutout.y, cutout.width, cutout.height)
        if len(overlap) >= 3:
            notch_area += _polygon_area(overlap)

    if notch_area >= clipped_area - 1e-9:
        return None  # entirely inside a cutout — not a real piece

    if notch_area > 1e-9:
        kind = TileKind.NOTCHED
    elif boundary_cut:
        kind = TileKind.CUT
    else:
        kind = TileKind.FULL

    xs = [p[0] for p in clipped]
    ys = [p[1] for p in clipped]
    bx, by = min(xs), min(ys)

    return PlacedTile(
        x=bx,
        y=by,
        width=max(xs) - bx,
        height=max(ys) - by,
        rotated=False,
        kind=kind,
        nominal_width=tile.width,
        nominal_height=tile.height,
        notch_area=notch_area,
        vertices=tuple(clipped),
    )
