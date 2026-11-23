import xml.etree.ElementTree as ET

from partsible.svg_visualization import SVGCuttingVisualizer


def test_described_parts_show_their_cut_length_in_the_board():
    svg = SVGCuttingVisualizer().generate_svg_cut_list(
        [[1800]], 3000, part_labels={1800: "Uprights"}
    )
    root = ET.fromstring(svg)
    texts = [
        (element.text, float(element.get("y")))
        for element in root.iter()
        if element.tag.endswith("text") and element.text in {"1800", "Uprights"}
    ]
    assert [text for text, _ in texts] == ["1800", "Uprights"]
    assert texts[0][1] < texts[1][1]
    assert "CUT SCHEDULE" not in svg


def test_descriptions_are_escaped_and_do_not_replace_decimal_lengths():
    svg = SVGCuttingVisualizer().generate_svg_cut_list(
        [[1800.5]], 3000, part_labels={1800.5: "Rail & <edge>"}
    )
    root = ET.fromstring(svg)
    assert "1800.5" in list(root.itertext())
    assert "Rail & <edge>" in list(root.itertext())
    assert "CUT SCHEDULE" not in svg


def test_offcut_text_is_not_drawn_when_it_would_overflow():
    svg = SVGCuttingVisualizer().generate_svg_cut_list([[4800]], 5000)
    assert ">OFFCUT</text>" not in svg


def test_svg_keeps_a_schedule_when_a_piece_is_too_small_to_label():
    svg = SVGCuttingVisualizer().generate_svg_cut_list(
        [[2500.4, 0.49]], 3000.49, saw_blade_width=3.25
    )

    assert "CUT SCHEDULE" in svg
    assert "B1: 2500.4 · 0.49 MM" in svg
