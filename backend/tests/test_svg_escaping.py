import base64
import xml.etree.ElementTree as ET

from planqer.sheet_visualization import (
    generate_saved_sheet_diagram,
    generate_sheet_cutting_visualization,
    generate_single_sheet_visualization,
)
from planqer.svg_visualization import generate_cut_list_image, generate_saved_diagram
from planqer.tile_layout.geometry import Cutout, JointSpec, Surface, Tile
from planqer.tile_layout.solver import solve_tile_layout
from planqer.tile_visualization import (
    generate_saved_tile_diagram,
    generate_tile_layout_visualization,
)

SPECIAL_TEXT = 'Part & <edge> "cafe" \u2605'


def _decode(data_url: str) -> str:
    return base64.b64decode(data_url.split(",", 1)[1]).decode("utf-8")


def _parse(data_url: str) -> ET.Element:
    return ET.fromstring(_decode(data_url))


def test_board_live_and_saved_svgs_escape_project_names():
    live = generate_cut_list_image(
        [[100.0]], 300.0, "data:image/svg+xml;base64,", project_name=SPECIAL_TEXT
    )
    saved = generate_saved_diagram([[100.0]], 300.0, project_name=SPECIAL_TEXT)

    for data_url in (live, saved):
        root = _parse(data_url)
        assert SPECIAL_TEXT in "".join(root.itertext())


def test_sheet_live_and_saved_svgs_escape_part_ids_and_project_names():
    result = {
        "sheets": [
            {
                "sheet_width": 100,
                "sheet_height": 100,
                "efficiency": 50.0,
                "parts": [
                    {
                        "part_id": f"{SPECIAL_TEXT}_1",
                        "x": 0,
                        "y": 0,
                        "width": 80,
                        "height": 50,
                        "rotated": False,
                    }
                ],
            }
        ],
        "overall_efficiency": 50.0,
        "total_waste_area": 5000.0,
    }

    live = generate_sheet_cutting_visualization(result, SPECIAL_TEXT)
    saved = generate_saved_sheet_diagram(result, SPECIAL_TEXT)

    for data_url in (live, saved):
        root = _parse(data_url)
        text = "".join(root.itertext())
        assert SPECIAL_TEXT in text
        assert f"{SPECIAL_TEXT} 1" in text


def test_single_sheet_svg_uses_a_wide_canvas_with_safe_title_spacing():
    sheet = {
        "sheet_width": 1200,
        "sheet_height": 2500,
        "efficiency": 50.0,
        "parts": [],
    }

    root = _parse(generate_single_sheet_visualization(sheet, sheet_index=6))

    assert root.attrib["width"] == "1100"
    title = next(element for element in root if element.tag.endswith("text"))
    assert float(title.attrib["y"]) > 0
    assert title.text == "Sheet 7"
    assert 'fill="#e3e0d4"' in _decode(generate_single_sheet_visualization(sheet))


def test_tile_live_and_saved_svgs_escape_cutout_labels_and_project_names():
    surface = Surface(
        width=909,
        height=1206,
        cutouts=(Cutout(x=100, y=100, width=100, height=100, label=SPECIAL_TEXT),),
    )
    result = solve_tile_layout(
        surface,
        Tile(width=300, height=600),
        JointSpec(joint_width=3),
        bond_pattern="stack",
        candidate_count=3,
        sample_steps=6,
    )
    candidate = result.candidates[result.recommended_index]

    live = generate_tile_layout_visualization(candidate, surface, SPECIAL_TEXT)
    saved = generate_saved_tile_diagram(candidate, surface, SPECIAL_TEXT)

    for data_url in (live, saved):
        root = _parse(data_url)
        assert SPECIAL_TEXT in "".join(root.itertext())
