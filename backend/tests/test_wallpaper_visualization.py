import base64

from planqer.wallpaper.visualization import (
    render_piece_svg,
    render_plan_svg,
    render_roll_svg,
)


def test_piece_svg_escapes_labels_and_includes_cut_instruction():
    svg = render_piece_svg({"id": "A<&", "length": 2400, "phase": 320}, wall_name="Hall & stair", repeat=640)
    assert "A&lt;&amp;" in svg
    assert "visually align motif" in svg


def test_roll_svg_draws_alignment_gap_for_patterned_cut():
    svg = render_roll_svg({"number": 1, "cuts": [{"piece_id": "piece-1", "start": 100, "end": 2500, "alignment_gap": 100}]}, roll_length=10050, repeat=640)
    assert "#f3d6c0" in svg
    assert "repeat 640 mm" in svg


def _decoded(data_uri: str) -> str:
    return base64.b64decode(data_uri.split(",", 1)[1]).decode()


def test_plan_svg_draws_each_connected_segment_on_its_own_wall():
    room = {"walls": [
        {"name": "A", "width_top": 800, "height_left": 2400, "height_right": 2400},
        {"name": "B", "width_top": 900, "height_left": 2400, "height_right": 2400},
    ]}
    plan = {"strips": [{
        "number": 2, "wall_index": 0, "x_start": 530, "x_end": 800,
        "segments": [
            {"wall_index": 0, "x_start": 530, "x_end": 800},
            {"wall_index": 1, "x_start": 0, "x_end": 25},
        ],
    }]}

    svg = _decoded(render_plan_svg(room, plan, project_name="Hall"))

    # Wall A seam at its right edge, and the wrapped seam 25 mm into wall B.
    assert svg.count('class="seam"') == 2
    assert 'x1="465.0"' in svg
    assert f'x1="{555 + 25 * 390 / 900:.1f}"' in svg


def test_plan_svg_still_renders_plans_saved_before_connected_strips():
    room = {"walls": [{"name": "A", "width_top": 800, "height_left": 2400, "height_right": 2400}]}
    plan = {"strips": [{"number": 1, "wall_index": 0, "x_start": 0, "x_end": 530}]}

    svg = _decoded(render_plan_svg(room, plan, project_name="Hall"))

    assert svg.count('class="seam"') == 1
