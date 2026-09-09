"""
Tests for the tile layout SVG visualizer.

These specifically guard the contract that makes client-side PNG export
work (see frontend/src/utils/svgToPng.js and .plans/tile-layout.md): the
SVG must carry intrinsic width/height attributes and must not reference any
CSS custom property, because it is rasterized outside the page's stylesheet.
"""

import base64
import re

from planqer.tile_layout.geometry import (
    Cutout,
    JointSpec,
    PlacedTile,
    Surface,
    Tile,
    TileKind,
)
from planqer.tile_layout.solver import solve_tile_layout
from planqer.tile_visualization import (
    FULL_TILE_FILL,
    TileSVGVisualizer,
    assign_size_colors,
    generate_saved_tile_diagram,
    generate_tile_layout_visualization,
    tile_size_key,
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


def test_assign_size_colors_ignores_full_tiles_and_is_deterministic():
    common = dict(rotated=False, nominal_width=100, nominal_height=100)
    tiles = [
        PlacedTile(x=0, y=0, width=100, height=100, kind=TileKind.FULL, **common),
        PlacedTile(x=0, y=0, width=50, height=100, kind=TileKind.CUT, **common),
        PlacedTile(x=0, y=0, width=50, height=100, kind=TileKind.CUT, **common),
        PlacedTile(x=0, y=0, width=30, height=100, kind=TileKind.NOTCHED, notch_area=10, **common),
    ]

    colors = assign_size_colors(tiles)

    # One entry per distinct non-full size — the repeated 50x100 CUT tile
    # doesn't produce a second entry, and the FULL tile produces none.
    assert set(colors.keys()) == {(50, 100), (30, 100)}
    assert len(set(colors.values())) == 2  # the two sizes get different colors
    # Calling it again on the same input must produce the exact same mapping
    # (the SVG and the API's fill_color field both depend on this).
    assert assign_size_colors(tiles) == colors


def test_size_colors_never_collide_with_the_fixed_full_tile_color():
    surface, result = _solve_simple()
    for candidate in result.candidates:
        colors = assign_size_colors(candidate.tiles)
        assert FULL_TILE_FILL not in colors.values()


def test_svg_uses_a_distinct_color_per_cut_size():
    surface = Surface(width=8400, height=2400)
    tile = Tile(width=300, height=600)
    joint = JointSpec(joint_width=3)
    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="running", offset_fraction=0.5,
        candidate_count=3, sample_steps=8,
    )
    candidate = result.candidates[result.recommended_index]
    colors = assign_size_colors(candidate.tiles)
    assert len(colors) > 1  # this surface genuinely produces several cut sizes

    svg = _decode(generate_tile_layout_visualization(candidate, surface))
    for hex_color in colors.values():
        assert hex_color in svg


def test_tile_size_key_disambiguates_polygons_sharing_a_bounding_box():
    # A triangle and a pentagon can share a bounding box (both clipped from
    # the same corner region) -- the key must not conflate them.
    common = {"x": 0, "y": 0, "width": 10, "height": 10, "rotated": False,
              "nominal_width": 100, "nominal_height": 100, "kind": TileKind.CUT}
    triangle = PlacedTile(vertices=((0.0, 0.0), (10.0, 0.0), (0.0, 10.0)), **common)
    pentagon = PlacedTile(
        vertices=((0.0, 0.0), (10.0, 0.0), (10.0, 5.0), (5.0, 10.0), (0.0, 10.0)), **common,
    )

    assert tile_size_key(triangle) != tile_size_key(pentagon)


def test_tile_size_key_unchanged_for_axis_aligned_tiles():
    """Axis-aligned tiles predate diagonal support — their key must be
    exactly the plain (width, height) pair it always was, so
    assign_size_colors's grouping for stack/running/herringbone can't
    shift under existing callers."""
    tile = PlacedTile(
        x=0, y=0, width=50, height=100, rotated=False,
        kind=TileKind.CUT, nominal_width=100, nominal_height=100,
    )
    assert tile_size_key(tile) == (50, 100)


def test_diagonal_svg_draws_polygons_not_rects_for_tiles():
    surface = Surface(width=1500, height=1200)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)
    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="diagonal", candidate_count=3, sample_steps=6,
    )
    candidate = result.candidates[result.recommended_index]

    svg = _decode(generate_tile_layout_visualization(candidate, surface))

    assert svg.count("<polygon") >= len(candidate.tiles)


def test_diagonal_svg_has_intrinsic_dimensions_and_no_css_variables():
    """Same PNG-export contract as the axis-aligned bonds — see
    test_svg_has_intrinsic_dimensions_and_no_css_variables above."""
    surface = Surface(width=1500, height=1200)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)
    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="diagonal", candidate_count=3, sample_steps=6,
    )
    candidate = result.candidates[result.recommended_index]

    svg = _decode(generate_tile_layout_visualization(candidate, surface))

    svg_tag = re.search(r"<svg[^>]*>", svg).group(0)
    assert re.search(r'width="\d', svg_tag)
    assert re.search(r'height="\d', svg_tag)
    assert "var(" not in svg


def test_diagonal_svg_labels_only_full_tiles():
    """A CUT/NOTCHED diagonal piece's bounding box isn't its real size, so
    labeling it "width x height" the way an axis-aligned piece is labeled
    would misrepresent an irregular shape as a rectangle — only FULL
    diamonds (where nominal size is an honest fact) get a dimension label
    (see _create_tile_polygon)."""
    surface = Surface(width=1500, height=1200)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)
    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="diagonal", candidate_count=3, sample_steps=6,
    )
    candidate = result.candidates[result.recommended_index]
    assert any(t.kind != TileKind.FULL for t in candidate.tiles)  # sanity: real cut pieces exist
    full_tile = next(t for t in candidate.tiles if t.kind == TileKind.FULL)

    svg = _decode(generate_tile_layout_visualization(candidate, surface))

    full_label = f"{full_tile.nominal_width:.0f}\u00d7{full_tile.nominal_height:.0f}"
    assert full_label in svg
