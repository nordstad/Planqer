"""
Tests for the tile layout SVG visualizer.

These specifically guard the contract that makes client-side PNG export
work (see frontend/src/utils/svgToPng.js and .plans/tile-layout.md): the
SVG must carry intrinsic width/height attributes and must not reference any
CSS custom property, because it is rasterized outside the page's stylesheet.
"""

import base64
import re

from planqer.tile_layout.geometry import Cutout, JointSpec, Surface, Tile
from planqer.tile_layout.solver import solve_tile_layout
from planqer.tile_visualization import (
    TileSVGVisualizer,
    generate_saved_tile_diagram,
    generate_tile_layout_visualization,
)


def _decode(data_url: str) -> str:
    assert data_url.startswith("data:image/svg+xml;base64,")
    b64 = data_url.split(",", 1)[1]
    return base64.b64decode(b64).decode("utf-8")


def _solve_simple():
    surface = Surface(width=909, height=1206, cutouts=(Cutout(x=100, y=100, width=100, height=100, label="socket"),))
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=3)
    return surface, solve_tile_layout(surface, tile, joint, bond_pattern="stack", candidate_count=3, sample_steps=6)


def test_visualization_is_a_valid_svg_data_url():
    surface, result = _solve_simple()
    candidate = result.candidates[result.recommended_index]

    data_url = generate_tile_layout_visualization(candidate, surface, project_name="Kitchen splashback")
    svg = _decode(data_url)

    assert svg.startswith("<?xml")
    assert "<svg" in svg
    assert "Kitchen splashback" in svg


def test_svg_has_intrinsic_dimensions_and_no_css_variables():
    """Load-bearing for browser-side PNG rasterization — see module docstring."""
    surface, result = _solve_simple()
    candidate = result.candidates[result.recommended_index]

    svg = _decode(generate_tile_layout_visualization(candidate, surface))

    svg_tag = re.search(r"<svg[^>]*>", svg).group(0)
    assert re.search(r'width="\d', svg_tag), "svg root must carry an intrinsic width attribute"
    assert re.search(r'height="\d', svg_tag), "svg root must carry an intrinsic height attribute"
    assert "var(" not in svg, "tile SVG must use literal hex colors, not CSS custom properties"


def test_svg_renders_a_rect_per_placed_tile():
    surface, result = _solve_simple()
    candidate = result.candidates[result.recommended_index]

    svg = _decode(generate_tile_layout_visualization(candidate, surface))

    # One outline rect for the surface + one per tile + one per cutout, at minimum.
    assert svg.count("<rect") >= len(candidate.tiles) + 1


def test_sliver_tiles_get_the_revision_red_stroke():
    surface = Surface(width=1000, height=600)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=0)
    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="stack", candidate_count=3,
        sample_steps=4, min_edge_cut=250,
    )
    sliver_candidate = next(c for c in result.candidates if c.metrics.sliver_count > 0)

    svg = _decode(generate_tile_layout_visualization(sliver_candidate, surface))

    assert "#cc2200" in svg


def test_empty_candidate_falls_back_to_placeholder_svg():
    visualizer = TileSVGVisualizer()
    svg = visualizer.generate_layout_visualization(None, Surface(width=100, height=100))
    assert "No tile layout available" in svg


def test_generate_saved_tile_diagram_matches_live_contract():
    surface, result = _solve_simple()
    candidate = result.candidates[result.recommended_index]

    saved = generate_saved_tile_diagram(candidate, surface, project_name="Saved plan")
    svg = _decode(saved)

    assert "Saved plan" in svg
    assert "var(" not in svg
