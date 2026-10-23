from planqer.wallpaper.visualization import render_piece_svg, render_roll_svg


def test_piece_svg_escapes_labels_and_includes_cut_instruction():
    svg = render_piece_svg({"id": "A<&", "length": 2400, "phase": 320}, wall_name="Hall & stair", repeat=640)
    assert "A&lt;&amp;" in svg
    assert "visually align motif" in svg


def test_roll_svg_draws_alignment_gap_for_patterned_cut():
    svg = render_roll_svg({"number": 1, "cuts": [{"piece_id": "piece-1", "start": 100, "end": 2500, "alignment_gap": 100}]}, roll_length=10050, repeat=640)
    assert "#f3d6c0" in svg
    assert "repeat 640 mm" in svg
