"""
Tile/surface layout visualization system using SVG.

Follows the same contract as svg_visualization.py and sheet_visualization.py:
a single self-contained SVG string (intrinsic width/height, inline styles,
literal hex colors — no CSS custom properties), because a saved diagram is
later rasterized to PNG client-side with no page stylesheet or webfonts
available (see frontend/src/utils/svgToPng.js). Do not introduce `var(...)`
or any color outside COLORS/this module's own literal palette.

Joints and the perimeter gap are drawn implicitly: PlacedTile coordinates
already exclude joint spacing (each lattice pitch is tile + joint), so the
background color visible between drawn tile rectangles *is* the grout line,
at true scale. Nothing extra needs to be drawn for a joint.
"""

import base64
import colorsys
import itertools
import math
from xml.sax.saxutils import escape

from .tile_layout.geometry import TileKind
from .visualization_constants import get_css_styles

# Muted, desaturated tones shared with the cutting/sheet visualizers — kept
# clear of amber (the frontend page's one accent) and revision red (reserved
# here for slivers, exactly as the design system reserves it for "over-limit
# and delete affordances" elsewhere).
FULL_TILE_FILL = "#c7d9c0"
_SLIVER_STROKE = "#cc2200"
_INK = "#16150f"
_BACKGROUND = "#ecebe4"


def _generate_size_palette(count: int) -> list[str]:
    """`count` light, muted hues for coloring cut/notched tiles by their
    exact size (see assign_size_colors).

    Hues use two broad arcs, while lightness and saturation vary independently.
    This keeps adjacent entries distinguishable when a layout has many cut
    sizes, while avoiding the fixed green and red meanings.

    Assigned by a golden-ratio step (i * 0.618... mod 1) rather than an even
    i/count split: an even split packs the first few entries close together
    whenever the actual distinct-size count is smaller than `count` (the
    common case — most bond patterns produce well under a dozen distinct cut
    sizes), which is exactly when they need to be most different. The golden
    ratio scatters every prefix of the sequence roughly evenly across the
    whole arc instead."""
    golden = 0.6180339887498949
    hue_arcs = ((25, 85), (145, 340))
    colors = []
    for i in range(count):
        hue = (i * golden) % 1.0
        arc_start, arc_end = hue_arcs[i % len(hue_arcs)]
        hue_deg = arc_start + hue * (arc_end - arc_start)
        lightness = 0.68 + ((i * 0.38196601125) % 1.0) * 0.16
        saturation = 0.42 + ((i * 0.2360679775) % 1.0) * 0.16
        r, g, b = colorsys.hls_to_rgb(hue_deg / 360, lightness, saturation)
        colors.append(f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}")
    return colors


# Comfortably more than a typical bond pattern's distinct cut-size count
# (single digits in practice); beyond this the palette repeats and two
# unrelated sizes could share a color — an accepted MVP limitation, not
# silently wrong (the dimension label and cut list still disambiguate).
_SIZE_PALETTE = _generate_size_palette(14)


def tile_size_key(t) -> tuple:
    """The key assign_size_colors groups tiles by. Exposed (not a
    underscore-private helper) because api.py's fill_color lookup must
    compute the exact same key a second time — this is the one place the
    key is defined, so the SVG (grouped here) and the API response (set in
    api.py from this same function) can never drift apart.

    A bounding-box match alone (round(width), round(height)) isn't enough
    to guarantee two *diagonal* pieces are actually the same shape — a
    triangle and a pentagon can share a bounding box — so a diagonal
    tile's key also includes its vertex count and true polygon area.
    Axis-aligned tiles are unaffected: their key is unchanged from before
    diagonal existed."""
    if t.vertices is not None:
        return (
            round(t.width),
            round(t.height),
            round(t.nominal_width),
            round(t.nominal_height),
            len(t.vertices),
            round(t.area),
        )
    return (round(t.width), round(t.height))


def assign_size_colors(tiles) -> dict[tuple, str]:
    """Deterministic size -> color mapping, one entry per distinct
    tile_size_key() among non-full tiles (CUT and NOTCHED share the same
    keying — a notched piece is still "this size", just also needing a
    notch, which the diagram marks with a hatch overlay instead of a second
    color). Ordered by descending area so the biggest/most common groups get
    the earliest, most distinguishable palette entries.

    Pure function of `tiles`, so the SVG (drawn here) and the API's
    PlacedTileInfo.fill_color (set in api.py from this same function) can
    never drift apart — there is exactly one place this mapping is computed."""
    ordered = _ordered_cut_keys(tiles)
    return {key: _SIZE_PALETTE[i % len(_SIZE_PALETTE)] for i, key in enumerate(ordered)}


def _ordered_cut_keys(tiles) -> list[tuple]:
    areas: dict[tuple, float] = {}
    for t in tiles:
        if t.kind != TileKind.FULL:
            areas.setdefault(tile_size_key(t), t.area)
    return sorted(areas, key=lambda key: areas[key], reverse=True)


def _label_for_index(index: int) -> str:
    label = ""
    while True:
        label = chr(65 + index % 26) + label
        index = index // 26 - 1
        if index < 0:
            return label


def assign_size_labels(tiles) -> dict[tuple, str]:
    return {key: _label_for_index(i) for i, key in enumerate(_ordered_cut_keys(tiles))}


class TileSVGVisualizer:
    """SVG-based tile/surface layout diagram generator."""

    def _create_svg_header(self, width: int, height: int) -> str:
        return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}"
     xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="notch-hatch" width="6" height="6" patternUnits="userSpaceOnUse"
             patternTransform="rotate(45)">
      <rect width="6" height="6" fill="{_BACKGROUND}"/>
      <line x1="0" y1="0" x2="0" y2="6" stroke="#8f8d80" stroke-width="1"/>
    </pattern>
    <pattern id="notch-overlay" width="6" height="6" patternUnits="userSpaceOnUse"
             patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(22,21,15,0.4)" stroke-width="1.5"/>
    </pattern>
    <style>
{get_css_styles("tile")}
    </style>
  </defs>
  <rect width="100%" height="100%" fill="{_BACKGROUND}"/>
'''

    def svg_to_base64(self, svg_content: str) -> str:
        svg_b64 = base64.b64encode(svg_content.encode("utf-8")).decode("utf-8")
        return f"data:image/svg+xml;base64,{svg_b64}"

    def _create_header_section(
        self, project_name: str | None, label: str | None
    ) -> str:
        parts = []
        y = 16
        if project_name:
            parts.append(
                f'<text x="24" y="{y}" class="figure-caption" text-anchor="start">{escape(project_name)}</text>'
            )
            y += 18
        if label:
            parts.append(
                f'<text x="24" y="{y}" class="surface-info" text-anchor="start">{escape(label)}</text>'
            )
        return "".join(parts)

    def _create_tile_rect(
        self,
        x: float,
        y: float,
        width: float,
        height: float,
        fill: str,
        is_notched: bool,
        is_sliver: bool,
        scale: float,
        x_off: float,
        y_off: float,
        label: str | None = None,
    ) -> str:
        px, py = x_off + x * scale, y_off + y * scale
        pw, ph = width * scale, height * scale
        stroke = _SLIVER_STROKE if is_sliver else _INK
        stroke_width = 2 if is_sliver else 1

        elements = [
            (
                f'<rect x="{px:.1f}" y="{py:.1f}" width="{pw:.1f}" height="{ph:.1f}" '
                f'fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"/>'
            )
        ]
        if is_notched:
            # A hatch overlay, not a second fill color: notched pieces keep
            # their size's own color (the hatch is the only signal that this
            # piece also needs a notch cut, not which size it is).
            elements.append(
                f'<rect x="{px:.1f}" y="{py:.1f}" width="{pw:.1f}" height="{ph:.1f}" fill="url(#notch-overlay)"/>'
            )

        if pw > 26 and ph > 16:
            label = f"{width:.0f}\u00d7{height:.0f}"
            cx, cy = px + pw / 2, py + ph / 2
            css_class = "sliver-label" if is_sliver else "tile-label"
            elements.append(
                f'<text x="{cx:.1f}" y="{cy:.1f}" class="{css_class}" '
                f'text-anchor="middle" dominant-baseline="middle">{label}</text>'
            )
            if is_sliver and ph > 30:
                elements.append(
                    f'<text x="{cx:.1f}" y="{cy + 11:.1f}" class="sliver-label" '
                    f'text-anchor="middle" dominant-baseline="middle">SLIVER</text>'
                )
        if label and pw > 22 and ph > 22:
            elements.append(
                f'<text x="{px + 8:.1f}" y="{py + 11:.1f}" class="tile-label" font-weight="bold">{escape(label)}</text>'
            )

        return "".join(elements)

    def _create_tile_polygon(
        self,
        vertices,
        fill: str,
        is_notched: bool,
        is_sliver: bool,
        is_full: bool,
        nominal_width: float,
        nominal_height: float,
        scale: float,
        x_off: float,
        y_off: float,
        label: str | None = None,
    ) -> str:
        """Diagonal counterpart to _create_tile_rect: the piece is an
        arbitrary convex polygon (see geometry.place_and_clip_diagonal),
        not a rectangle, so it's drawn as <polygon>, not <rect>. Only a
        FULL diamond gets a dimension label — its bounding box isn't its
        real size, so labeling a CUT/NOTCHED polygon with "width x height"
        the way an axis-aligned piece is labeled would misrepresent an
        irregular shape as a rectangle. The drawn outline itself, at true
        scale, is what a CUT/NOTCHED piece's own shape communicates."""
        points = " ".join(
            f"{x_off + vx * scale:.1f},{y_off + vy * scale:.1f}" for vx, vy in vertices
        )
        stroke = _SLIVER_STROKE if is_sliver else _INK
        stroke_width = 2 if is_sliver else 1

        elements = [
            f'<polygon points="{points}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"/>'
        ]
        if is_notched:
            elements.append(f'<polygon points="{points}" fill="url(#notch-overlay)"/>')

        if is_full:
            # A rotated piece's *bounding box* is inflated relative to its
            # true footprint (the same reason PlacedTile.area doesn't use
            # width*height for one — see geometry.py) — using it here to
            # decide "is there room for a label" was wrong: it can look
            # roomy enough even when the tile's own true width/height, at
            # this scale, is nowhere near big enough for horizontal text,
            # which is exactly what caused labels to smear together at
            # zoomed-out scales. Gate on the tile's real scaled size
            # instead, with one stricter combined threshold (not the
            # axis-aligned case's asymmetric 26-wide/16-tall) since a
            # rotated tile needs room in *both* directions for text that
            # isn't rotated along with it.
            scaled_w, scaled_h = nominal_width * scale, nominal_height * scale
            if scaled_w > 40 and scaled_h > 40:
                xs = [x_off + vx * scale for vx, _vy in vertices]
                ys = [y_off + vy * scale for _vx, vy in vertices]
                label = f"{nominal_width:.0f}\u00d7{nominal_height:.0f}"
                cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
                elements.append(
                    f'<text x="{cx:.1f}" y="{cy:.1f}" class="tile-label" '
                    f'text-anchor="middle" dominant-baseline="middle">{label}</text>'
                )
        if label and nominal_width * scale > 22 and nominal_height * scale > 22:
            xs = [x_off + vx * scale for vx, _vy in vertices]
            ys = [y_off + vy * scale for _vx, vy in vertices]
            elements.append(
                f'<text x="{sum(xs) / len(xs):.1f}" y="{min(ys) + 11:.1f}" class="tile-label" font-weight="bold">{escape(label)}</text>'
            )

        return "".join(elements)

    def _create_cutout_rect(
        self, cutout, scale: float, x_off: float, y_off: float
    ) -> str:
        px, py = x_off + cutout.x * scale, y_off + cutout.y * scale
        pw, ph = cutout.width * scale, cutout.height * scale
        elements = [
            (
                f'<rect x="{px:.1f}" y="{py:.1f}" width="{pw:.1f}" height="{ph:.1f}" '
                f'fill="url(#notch-hatch)" stroke="{_INK}" stroke-width="1"/>'
            )
        ]
        if cutout.label and pw > 30 and ph > 16:
            elements.append(
                f'<text x="{px + pw / 2:.1f}" y="{py + ph / 2:.1f}" class="tile-label" '
                f'text-anchor="middle" dominant-baseline="middle">{escape(cutout.label)}</text>'
            )
        return "".join(elements)

    def _create_legend(self, x: int, y: int, distinct_cut_sizes: int) -> str:
        parts = []
        cx = x
        parts.append(
            f'<rect x="{cx}" y="{y - 8}" width="10" height="10" fill="{FULL_TILE_FILL}" stroke="{_INK}"/>'
        )
        parts.append(
            f'<text x="{cx + 14}" y="{y}" class="legend-text">Full tile</text>'
        )
        cx += 90

        # A hatch sample over a neutral chip, since "notched" is the overlay
        # pattern now, not a fixed fill color — its own size still gets a
        # color from the palette on the tiles themselves.
        parts.append(
            f'<rect x="{cx}" y="{y - 8}" width="10" height="10" fill="{_BACKGROUND}" stroke="{_INK}"/>'
        )
        parts.append(
            f'<rect x="{cx}" y="{y - 8}" width="10" height="10" fill="url(#notch-overlay)"/>'
        )
        parts.append(f'<text x="{cx + 14}" y="{y}" class="legend-text">Notched</text>')
        cx += 90

        parts.append(
            f'<rect x="{cx}" y="{y - 8}" width="10" height="10" fill="none" stroke="{_SLIVER_STROKE}" stroke-width="2"/>'
        )
        parts.append(f'<text x="{cx + 14}" y="{y}" class="legend-text">Sliver</text>')
        cx += 90

        if distinct_cut_sizes > 0:
            note = f"{distinct_cut_sizes} cut size{'s' if distinct_cut_sizes != 1 else ''} \u2014 see the cut list below"
            parts.append(
                f'<text x="{cx}" y="{y}" class="legend-text">{escape(note)} · letters match the cut list</text>'
            )

        return "".join(parts)

    def generate_layout_visualization(
        self, candidate, surface, project_name: str | None = None
    ) -> str:
        """`candidate` is a solver.LayoutCandidate; `surface` is a
        geometry.Surface (needed for cutouts and true dimensions)."""
        if candidate is None or not candidate.tiles:
            return self._create_empty_svg()

        margin = 40
        header_height = 40
        legend_height = 30
        target_width = 900

        scale = min(target_width / surface.width, 700 / surface.height, 1.0)
        surface_w = surface.width * scale
        surface_h = surface.height * scale

        total_width = surface_w + margin * 2
        total_height = header_height + surface_h + legend_height + margin

        x_off, y_off = margin, header_height

        label = (
            f"{surface.width:g}\u00d7{surface.height:g}mm surface \u00b7 "
            f"{candidate.label} \u00b7 {candidate.tiles_to_purchase} tiles to buy"
        )

        size_colors = assign_size_colors(candidate.tiles)
        size_labels = assign_size_labels(candidate.tiles)

        svg_parts = [self._create_svg_header(int(total_width), int(total_height))]
        svg_parts.append(self._create_header_section(project_name, label))
        svg_parts.append(
            f'<rect x="{x_off}" y="{y_off}" width="{surface_w:.1f}" height="{surface_h:.1f}" '
            f'fill="{_BACKGROUND}" stroke="{_INK}" stroke-width="2"/>'
        )

        for tile in candidate.tiles:
            label_tag = None
            if tile.kind == TileKind.FULL:
                fill = FULL_TILE_FILL
            else:
                fill = size_colors[tile_size_key(tile)]
                label_tag = size_labels[tile_size_key(tile)]
            if tile.vertices is not None:
                svg_parts.append(
                    self._create_tile_polygon(
                        tile.vertices,
                        fill,
                        tile.kind == TileKind.NOTCHED,
                        tile.is_sliver,
                        tile.kind == TileKind.FULL,
                        tile.nominal_width,
                        tile.nominal_height,
                        scale,
                        x_off,
                        y_off,
                        label_tag,
                    )
                )
            else:
                svg_parts.append(
                    self._create_tile_rect(
                        tile.x,
                        tile.y,
                        tile.width,
                        tile.height,
                        fill,
                        tile.kind == TileKind.NOTCHED,
                        tile.is_sliver,
                        scale,
                        x_off,
                        y_off,
                        label_tag,
                    )
                )

        for cutout in surface.cutouts:
            svg_parts.append(self._create_cutout_rect(cutout, scale, x_off, y_off))

        svg_parts.append(
            self._create_legend(x_off, int(y_off + surface_h + 24), len(size_colors))
        )
        svg_parts.append("</svg>")
        return "".join(svg_parts)

    def _create_empty_svg(self) -> str:
        return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="200" viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="{_BACKGROUND}"/>
  <text x="200" y="100" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="16" fill="#666">No tile layout available</text>
        </svg>'''


def generate_diagonal_piece_diagram(tile, fill: str) -> str:
    """Render a full tile with its kept polygon and marked cut edges.

    Text describing the piece belongs outside this SVG. Keeping the diagram
    image-only prevents long labels from being clipped when the image is
    displayed at a different size and keeps that information selectable.

    Args:
        tile: PlacedTile object with nominal dimensions and vertices
        fill: Fill color for the kept area
    """
    width, height = tile.nominal_width, tile.nominal_height
    padding = 120
    scale = min(360 / width, 280 / height, 1.0)

    local = tile.local_vertices or ()
    svg_width = width * scale + padding * 2
    svg_height = height * scale + padding * 2
    ox, oy = padding, padding

    def point(vertex):
        return ox + (vertex[0] + width / 2) * scale, oy + (
            height / 2 - vertex[1]
        ) * scale

    polygon = " ".join(f"{x:.1f},{y:.1f}" for x, y in (point(v) for v in local))
    full_points = (
        f"{ox:.1f},{oy + height * scale:.1f} "
        f"{ox + width * scale:.1f},{oy + height * scale:.1f} "
        f"{ox + width * scale:.1f},{oy:.1f} {ox:.1f},{oy:.1f}"
    )

    elements = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{svg_width:.0f}" height="{svg_height:.0f}" viewBox="0 0 {svg_width:.0f} {svg_height:.0f}">',
        '<defs><pattern id="waste" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#aaa79b" stroke-width="2"/></pattern></defs>',
        f'<rect width="100%" height="100%" fill="{_BACKGROUND}"/>',
    ]

    elements.extend(
        [
            f'<polygon points="{full_points}" fill="url(#waste)" stroke="{_INK}" stroke-width="2"/>',
            f'<polygon points="{polygon}" fill="{fill}" stroke="{_INK}" stroke-width="1.5"/>',
        ]
    )

    signed_area = (
        sum(
            start[0] * end[1] - end[0] * start[1]
            for start, end in zip(local, local[1:] + local[:1])
        )
        / 2
    )
    centroid = (
        sum(vertex[0] for vertex in local) / len(local),
        sum(vertex[1] for vertex in local) / len(local),
    )

    def outward_normal(start, end, reference):
        dx, dy = end[0] - start[0], end[1] - start[1]
        length = math.hypot(dx, dy)
        if not length:
            return 0, 0
        if signed_area > 0:
            candidate = (dy / length, -dx / length)
        else:
            candidate = (-dy / length, dx / length)
        midpoint = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
        if (
            candidate[0] * (midpoint[0] - reference[0])
            + candidate[1] * (midpoint[1] - reference[1])
        ) < 0:
            return -candidate[0], -candidate[1]
        return candidate

    label_boxes = []

    def add_dimension(start, end, normal, label):
        sx, sy = point(start)
        ex, ey = point(end)
        screen_normal = (normal[0], -normal[1])
        text_width = max(12, len(label) * 7.2)
        text_height = 14
        _midpoint_x, _midpoint_y = (sx + ex) / 2, (sy + ey) / 2

        def overlaps(box):
            return any(
                box[0] < other[2] + 4
                and box[2] + 4 > other[0]
                and box[1] < other[3] + 4
                and box[3] + 4 > other[1]
                for other in label_boxes
            )

        offset = 22
        while True:
            ox1, oy1 = sx + screen_normal[0] * offset, sy + screen_normal[1] * offset
            ox2, oy2 = ex + screen_normal[0] * offset, ey + screen_normal[1] * offset
            text_x, text_y = (ox1 + ox2) / 2, (oy1 + oy2) / 2 - 5
            box = (
                text_x - text_width / 2,
                text_y - text_height,
                text_x + text_width / 2,
                text_y + 3,
            )
            if (
                not overlaps(box)
                and min(box) >= 4
                and box[2] <= svg_width - 4
                and box[3] <= svg_height - 4
            ):
                label_boxes.append(box)
                break
            offset += 22

        elements.append(
            f'<line x1="{ox1:.1f}" y1="{oy1:.1f}" x2="{ox2:.1f}" y2="{oy2:.1f}" stroke="#d94801" stroke-width="2"/>'
        )
        elements.append(
            f'<line x1="{sx:.1f}" y1="{sy:.1f}" x2="{ox1:.1f}" y2="{oy1:.1f}" stroke="#d94801" stroke-width="2"/>'
        )
        elements.append(
            f'<line x1="{ex:.1f}" y1="{ey:.1f}" x2="{ox2:.1f}" y2="{oy2:.1f}" stroke="#d94801" stroke-width="2"/>'
        )
        elements.append(
            f'<text x="{text_x:.1f}" y="{text_y:.1f}" text-anchor="middle" '
            f'font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="#d94801">{label}</text>'
        )

    def is_on_side(vertex, side):
        half_width, half_height = width / 2, height / 2
        x, y = vertex
        if side == "left":
            return abs(x + half_width) < 1e-3
        if side == "right":
            return abs(x - half_width) < 1e-3
        if side == "bottom":
            return abs(y + half_height) < 1e-3
        return abs(y - half_height) < 1e-3

    side_corners = {
        "left": ((-width / 2, -height / 2), (-width / 2, height / 2)),
        "right": ((width / 2, -height / 2), (width / 2, height / 2)),
        "bottom": ((-width / 2, -height / 2), (width / 2, -height / 2)),
        "top": ((-width / 2, height / 2), (width / 2, height / 2)),
    }

    # Measure the parts of the original tile boundary that are not polygon
    # edges. These locate each cut intersection from a tile corner.
    for side, corners in side_corners.items():
        boundary_vertices = [vertex for vertex in local if is_on_side(vertex, side)]
        boundary_points = list(corners) + boundary_vertices
        if side in ("left", "right"):
            boundary_points.sort(key=lambda vertex: vertex[1])
        else:
            boundary_points.sort(key=lambda vertex: vertex[0])
        for start, end in itertools.pairwise(boundary_points):
            segment_length = math.hypot(end[0] - start[0], end[1] - start[1])
            if segment_length < 1e-3:
                continue
            is_polygon_edge = any(
                (start == edge_start and end == edge_end)
                or (start == edge_end and end == edge_start)
                for edge_start, edge_end in zip(local, local[1:] + local[:1])
            )
            has_cut_intersection = (
                start in boundary_vertices or end in boundary_vertices
            )
            if has_cut_intersection and not is_polygon_edge:
                add_dimension(
                    start,
                    end,
                    outward_normal(start, end, centroid),
                    f"{segment_length:.0f} mm",
                )

    # Add dimension lines for each edge of the piece polygon. The labels are
    # deliberately offset away from the kept polygon, including cut edges.
    for i, start in enumerate(local):
        end = local[(i + 1) % len(local)]

        # Convert to screen coordinates
        sx, sy = point(start)
        ex, ey = point(end)
        length = math.hypot(end[0] - start[0], end[1] - start[1])

        # Check if this is a cut edge (not on boundary)
        on_boundary = (
            abs(start[0] - end[0]) < 1e-6
            and abs(abs(start[0]) - width / 2) < 1e-3
            or abs(start[1] - end[1]) < 1e-6
            and abs(abs(start[1]) - height / 2) < 1e-3
        )

        normal = outward_normal(start, end, centroid)
        if on_boundary:
            add_dimension(start, end, normal, f"{length:.0f} mm")
        else:
            # This is a cut edge - draw the actual saw line, then annotate it
            # with a second dimension line outside the kept polygon.
            elements.append(
                f'<line x1="{sx:.1f}" y1="{sy:.1f}" x2="{ex:.1f}" y2="{ey:.1f}" stroke="#d94801" stroke-width="3"/>'
            )
            add_dimension(start, end, normal, f"CUT {length:.0f} mm")

    elements.append("</svg>")
    visualizer = TileSVGVisualizer()
    return visualizer.svg_to_base64("".join(elements))


def generate_tile_layout_visualization(
    candidate, surface, project_name: str | None = None
) -> str:
    """Generate a tile layout visualization. Compatible with the API response format."""
    visualizer = TileSVGVisualizer()
    svg_content = visualizer.generate_layout_visualization(
        candidate, surface, project_name
    )
    return visualizer.svg_to_base64(svg_content)


def generate_saved_tile_diagram(
    candidate, surface, project_name: str | None = None
) -> str:
    """Generate the SVG data URL stored with a saved tile project. See
    svg_visualization.generate_saved_diagram for why there is no PNG here."""
    visualizer = TileSVGVisualizer()
    svg_content = visualizer.generate_layout_visualization(
        candidate, surface, project_name
    )
    return visualizer.svg_to_base64(svg_content)
