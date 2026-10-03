from planqer.svg_visualization import SVGCuttingVisualizer


def test_svg_contains_whole_mm_cut_schedule_for_standalone_exports():
    svg = SVGCuttingVisualizer().generate_svg_cut_list(
        [[2500.4, 0.49]], 3000.49, saw_blade_width=3.25
    )

    assert "CUT SCHEDULE" in svg
    assert "B1: 2500 · 0 MM" in svg
