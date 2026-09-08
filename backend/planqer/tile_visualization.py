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
from xml.sax.saxutils import escape

from .visualization_constants import get_css_styles

# Muted, desaturated tones shared with the cutting/sheet visualizers — kept
# clear of amber (the frontend page's one accent) and revision red (reserved
# here for slivers, exactly as the design system reserves it for "over-limit
# and delete affordances" elsewhere).
_FILL_FULL = "#c7d9c0"
_FILL_CUT = "#c0d3e0"
_FILL_NOTCHED = "#d9d3b8"
_SLIVER_STROKE = "#cc2200"
_INK = "#16150f"
_BACKGROUND = "#ecebe4"


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
    <style>
{get_css_styles('tile')}
    </style>
  </defs>
  <rect width="100%" height="100%" fill="{_BACKGROUND}"/>
'''

    def _create_header_section(self, project_name: str | None, label: str | None) -> str:
        parts = []
        y = 16
        if project_name:
            parts.append(f'<text x="24" y="{y}" class="figure-caption" text-anchor="start">{escape(project_name)}</text>')
            y += 18
        if label:
            parts.append(f'<text x="24" y="{y}" class="surface-info" text-anchor="start">{escape(label)}</text>')
        return "".join(parts)

    def _tile_fill(self, kind: str) -> str:
        return {"full": _FILL_FULL, "cut": _FILL_CUT, "notched": _FILL_NOTCHED}.get(kind, _FILL_CUT)

    def _create_tile_rect(self, x: float, y: float, width: float, height: float,
                           kind: str, is_sliver: bool, scale: float, x_off: float, y_off: float) -> str:
        px, py = x_off + x * scale, y_off + y * scale
        pw, ph = width * scale, height * scale
        fill = self._tile_fill(kind)
        stroke = _SLIVER_STROKE if is_sliver else _INK
        stroke_width = 2 if is_sliver else 1

        elements = [
            (
                f'<rect x="{px:.1f}" y="{py:.1f}" width="{pw:.1f}" height="{ph:.1f}" '
                f'fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"/>'
            )
        ]

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

        return "".join(elements)

    def _create_cutout_rect(self, cutout, scale: float, x_off: float, y_off: float) -> str:
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

    def _create_legend(self, x: int, y: int) -> str:
        entries = [
            (_FILL_FULL, "Full tile"),
            (_FILL_CUT, "Cut"),
            (_FILL_NOTCHED, "Notched"),
        ]
        parts = []
        cx = x
        for color, label in entries:
            parts.append(f'<rect x="{cx}" y="{y - 8}" width="10" height="10" fill="{color}" stroke="{_INK}"/>')
            parts.append(f'<text x="{cx + 14}" y="{y}" class="legend-text">{label}</text>')
            cx += 90
        parts.append(f'<rect x="{cx}" y="{y - 8}" width="10" height="10" fill="none" stroke="{_SLIVER_STROKE}" stroke-width="2"/>')
        parts.append(f'<text x="{cx + 14}" y="{y}" class="legend-text">Sliver</text>')
        return "".join(parts)

    def generate_layout_visualization(self, candidate, surface, project_name: str | None = None) -> str:
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

        svg_parts = [self._create_svg_header(int(total_width), int(total_height))]
        svg_parts.append(self._create_header_section(project_name, label))
        svg_parts.append(
            f'<rect x="{x_off}" y="{y_off}" width="{surface_w:.1f}" height="{surface_h:.1f}" '
            f'fill="{_BACKGROUND}" stroke="{_INK}" stroke-width="2"/>'
        )

        for tile in candidate.tiles:
            svg_parts.append(self._create_tile_rect(
                tile.x, tile.y, tile.width, tile.height, tile.kind.value, tile.is_sliver,
                scale, x_off, y_off,
            ))

        for cutout in surface.cutouts:
            svg_parts.append(self._create_cutout_rect(cutout, scale, x_off, y_off))

        svg_parts.append(self._create_legend(x_off, int(y_off + surface_h + 24)))
        svg_parts.append("</svg>")
        return "".join(svg_parts)

    def _create_empty_svg(self) -> str:
        return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="200" viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="{_BACKGROUND}"/>
  <text x="200" y="100" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="16" fill="#666">No tile layout available</text>
</svg>'''

    def svg_to_base64(self, svg_content: str) -> str:
        svg_b64 = base64.b64encode(svg_content.encode("utf-8")).decode("utf-8")
        return f"data:image/svg+xml;base64,{svg_b64}"


def generate_tile_layout_visualization(candidate, surface, project_name: str | None = None) -> str:
    """Generate a tile layout visualization. Compatible with the API response format."""
    visualizer = TileSVGVisualizer()
    svg_content = visualizer.generate_layout_visualization(candidate, surface, project_name)
    return visualizer.svg_to_base64(svg_content)


def generate_saved_tile_diagram(candidate, surface, project_name: str | None = None) -> str:
    """Generate the SVG data URL stored with a saved tile project. See
    svg_visualization.generate_saved_diagram for why there is no PNG here."""
    visualizer = TileSVGVisualizer()
    svg_content = visualizer.generate_layout_visualization(candidate, surface, project_name)
    return visualizer.svg_to_base64(svg_content)
