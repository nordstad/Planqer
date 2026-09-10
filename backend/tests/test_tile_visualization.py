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
    generate_diagonal_piece_diagram,
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


def test_tile_size_key_includes_nominal_shape_for_axis_aligned_tiles():
    """Axis-aligned pieces with different source tile shapes must not collide."""
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


def test_diagonal_piece_template_keeps_description_text_outside_svg():
    surface = Surface(width=1500, height=1200)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)
    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="diagonal", candidate_count=3, sample_steps=6,
    )
    candidate = result.candidates[result.recommended_index]
    cut_tile = next(t for t in candidate.tiles if t.kind != TileKind.FULL and t.vertices is not None)

    svg = _decode(generate_diagonal_piece_diagram(cut_tile, "#d9c98a"))

    assert "Piece A" not in svg
    assert "Final size:" not in svg
    assert "Colored area = keep" not in svg
    assert "CUT " in svg


def test_diagonal_piece_template_measures_boundary_offsets_outside_piece():
    vertices = ((-150.0, -213.0), (-150.0, 213.0), (62.8, 0.0))
    tile = PlacedTile(
        x=0, y=0, width=300, height=426, rotated=False, kind=TileKind.CUT,
        nominal_width=300, nominal_height=600, vertices=vertices,
        local_vertices=vertices,
    )

    svg = _decode(generate_diagonal_piece_diagram(tile, "#d9c98a"))

    # The two 87mm corner offsets locate the cut intersections on the
    # original 600mm tile; 426mm is the kept boundary and 301mm are the cuts.
    assert svg.count("87 mm") == 2
    assert "426 mm" in svg
    assert svg.count("301 mm") == 2
    assert svg.count("CUT 301 mm") == 2
    assert svg.count('stroke="#d94801"') >= 15  # five dimensions, each with extension marks

    labels = [
        (float(x), float(y), text)
        for x, y, text in re.findall(
            r'<text x="([\d.-]+)" y="([\d.-]+)"[^>]*fill="#d94801">([^<]+)</text>', svg,
        )
    ]
    boxes = [
        (x - len(text) * 7.2 / 2, y - 14, x + len(text) * 7.2 / 2, y + 3)
        for x, y, text in labels
    ]
    for i, box in enumerate(boxes):
        for other in boxes[i + 1:]:
            assert not (
                box[0] < other[2] + 4 and box[2] + 4 > other[0]
                and box[1] < other[3] + 4 and box[3] + 4 > other[1]
            )


def test_diagonal_svg_suppresses_labels_when_tiles_render_too_small():
    """Regression test for a real reported bug: a large surface with small
    tiles produced hundreds of overlapping/smeared labels. The bug was
    gating on the rotated piece's *bounding box* (inflated relative to its
    true footprint) instead of its real scaled size — see
    _create_tile_polygon. 4400x2200mm / 300x100mm tile is the exact
    surface/tile combination that was reported broken."""
    surface = Surface(width=4400, height=2200)
    tile = Tile(width=300, height=100)
    joint = JointSpec(joint_width=3)
    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="diagonal_herringbone", candidate_count=3, sample_steps=6,
    )
    candidate = result.candidates[result.recommended_index]
    assert candidate.metrics.full_tile_count > 0  # sanity: labels would exist if not suppressed

    svg = _decode(generate_tile_layout_visualization(candidate, surface))

    assert svg.count("tile-label") == 1  # only the CSS class definition, no rendered <text> elements


def test_diagonal_herringbone_svg_shows_labels_when_there_is_room():
    """Companion to the regression test above — guards against
    over-correcting the fix into never showing a label at all."""
    surface = Surface(width=2000, height=1500)
    tile = Tile(width=300, height=150)
    joint = JointSpec(joint_width=3)
    result = solve_tile_layout(
        surface, tile, joint, bond_pattern="diagonal_herringbone", candidate_count=3, sample_steps=6,
    )
    candidate = result.candidates[result.recommended_index]

    svg = _decode(generate_tile_layout_visualization(candidate, surface))

    assert svg.count("tile-label") > 1
