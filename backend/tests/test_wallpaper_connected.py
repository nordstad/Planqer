import pytest

from planqer.schemas.wallpaper import (
    Allowances,
    Corner,
    Cutout,
    Room,
    Wall,
    WallpaperPlanRequest,
    WallpaperSpec,
)
from planqer.wallpaper.plan import create_wallpaper_plan
from planqer.wallpaper.strips import connected_runs, lay_run_strips


def wall(width: float, name: str = "Wall", **overrides) -> Wall:
    return Wall(
        name=name, width_top=width, width_middle=width, width_bottom=width,
        height_left=2400, height_middle=2400, height_right=2400, **overrides,
    )


def inside_continue() -> Corner:
    return Corner(kind="inside", confirmed_continuation="continue")


def request(walls, corners, *, repeat=0, match=None, closed=False, **options):
    return WallpaperPlanRequest(
        wallpaper=WallpaperSpec(
            name="Willow", manufacturer="Example", roll_width=530,
            roll_length=10050, repeat=repeat, match=match,
        ),
        room=Room(walls=walls, corners=corners, closed=closed),
        **options,
    )


def layout(walls, corners, first_strip_width=None):
    return lay_run_strips(
        walls, list(range(len(walls))), corners, 530,
        [Allowances()] * len(walls), [50] * len(walls),
        first_strip_width=first_strip_width,
    )


def covered_ranges(strips, wall_index):
    return sorted(
        (segment.x_start, segment.x_end)
        for strip in strips
        for segment in strip.segments
        if segment.wall_index == wall_index
    )


def assert_covers(strips, wall_index, width):
    cursor = 0.0
    for x_start, x_end in covered_ranges(strips, wall_index):
        assert x_start <= cursor + 1e-6, f"gap on wall {wall_index} at {cursor}"
        cursor = max(cursor, x_end)
    assert cursor == pytest.approx(width)


def test_inside_continuation_carries_the_remaining_roll_width_onto_the_next_wall():
    result = layout([wall(800), wall(900)], [inside_continue()])

    face, wrap = result.strips[1].segments
    assert (face.wall_index, face.x_start, face.x_end) == (0, 530, 800)
    assert (wrap.wall_index, wrap.x_start, wrap.x_end) == (1, 0, 260)
    assert wrap.wraps_corner
    # The next strip starts where the wrapped leftover ends.
    assert result.strips[2].segments[0].x_start == 260
    assert result.notes == []


def test_connected_strips_cover_both_wall_faces_without_gaps():
    result = layout([wall(800), wall(900)], [inside_continue()])

    assert_covers(result.strips, 0, 800)
    assert_covers(result.strips, 1, 900)


def test_outside_corner_wraps_the_remaining_roll_width_onto_the_next_wall():
    result = layout([wall(800), wall(900)], [Corner(kind="outside")])

    face, wrap = result.strips[1].segments
    assert (face.wall_index, face.x_start, face.x_end) == (0, 530, 800)
    assert (wrap.wall_index, wrap.x_start, wrap.x_end) == (1, 0, 260)
    assert wrap.wraps_corner
    assert_covers(result.strips, 1, 900)


def test_outside_corner_seam_on_the_edge_is_infeasible():
    result = layout([wall(1060), wall(900)], [Corner(kind="outside")])

    assert any("outside corner" in note for note in result.notes)


def test_unconfirmed_inside_corner_starts_afresh():
    room = Room(
        walls=[wall(800), wall(900)],
        corners=[Corner(kind="inside", recommended_continuation="continue")],
    )

    runs, _ = connected_runs(room)

    assert [run.wall_indices for run in runs] == [[0], [1]]


def test_closed_room_breaks_the_loop_at_the_start_wall():
    room = Room(
        walls=[wall(800), wall(900), wall(800), wall(900)],
        corners=[inside_continue()] * 4,
        closed=True,
    )

    runs, notes = connected_runs(room, start_wall=2)

    assert [run.wall_indices for run in runs] == [[2, 3, 0, 1]]
    assert notes == []


def test_inside_continuation_with_nothing_left_starts_the_next_wall_cleanly():
    result = layout([wall(1060), wall(900)], [inside_continue()])

    assert result.notes == []
    assert not any(segment.wraps_corner for strip in result.strips for segment in strip.segments)
    assert_covers(result.strips, 0, 1060)
    assert_covers(result.strips, 1, 900)


def test_continued_strip_is_allocated_once_with_both_faces_and_cutouts():
    plan = create_wallpaper_plan(request(
        [
            wall(800, "A", cutouts=[Cutout(kind="outlet", x=600, y=300, width=80, height=80)]),
            wall(900, "B", cutouts=[Cutout(kind="switch", x=5, y=1000, width=10, height=80)]),
        ],
        [inside_continue()],
    ))

    connected = [strip for strip in plan["strips"] if len(strip["segments"]) == 2]
    assert len(connected) == 1
    number = connected[0]["number"]
    connected_pieces = [piece for piece in plan["pieces"] if piece["strip_number"] == number]
    assert len(connected_pieces) == 1
    piece = connected_pieces[0]
    assert [segment["wall_index"] for segment in piece["segments"]] == [0, 1]
    assert piece["segments"][0]["notches"], "cutout on the first face must stay"
    assert piece["segments"][1]["notches"], "cutout on the wrapped face must stay"

    cut_ids = [cut["piece_id"] for roll in plan["rolls"] for cut in roll["cuts"]]
    assert sorted(cut_ids) == sorted(piece["id"] for piece in plan["pieces"])
    assert len(cut_ids) == len(set(cut_ids))


def test_full_height_obstacle_on_one_face_notches_rather_than_splits_the_strip():
    plan = create_wallpaper_plan(request(
        [
            wall(800, "A", cutouts=[Cutout(
                kind="heat_pump", x=530, y=800, width=270, height=600,
                tuck_edges=["top", "bottom"],
            )]),
            wall(900, "B"),
        ],
        [inside_continue()],
    ))

    connected = next(strip for strip in plan["strips"] if len(strip["segments"]) == 2)
    pieces = [piece for piece in plan["pieces"] if piece["strip_number"] == connected["number"]]
    assert len(pieces) == 1
    assert pieces[0]["segments"][0]["notches"][0]["mode"] == "precut"
    assert not pieces[0]["segments"][1]["notches"]


def test_pattern_phase_is_unchanged_across_the_corner():
    plan = create_wallpaper_plan(request(
        [wall(800), wall(900)], [inside_continue()], repeat=640, match="half_drop",
    ))

    connected = next(strip for strip in plan["strips"] if len(strip["segments"]) == 2)
    phases = {piece["phase"] for piece in plan["pieces"] if piece["strip_number"] == connected["number"]}
    assert phases == {connected["phase"]}
    numbers = [strip["number"] for strip in plan["strips"]]
    assert numbers == list(range(1, len(numbers) + 1))


def test_no_piece_is_dropped_or_double_counted_across_a_room():
    plan = create_wallpaper_plan(request(
        [
            wall(800, "A", cutouts=[Cutout(kind="door", x=100, y=0, width=530, height=2000)]),
            wall(300, "Return"),
            wall(1200, "B"),
        ],
        [Corner(kind="outside"), inside_continue()],
    ))

    piece_ids = [piece["id"] for piece in plan["pieces"]]
    cut_ids = [cut["piece_id"] for roll in plan["rolls"] for cut in roll["cuts"]]
    assert sorted(piece_ids) == sorted(cut_ids)
    assert len(piece_ids) == len(set(piece_ids))
    for strip in plan["strips"]:
        assert any(piece["strip_number"] == strip["number"] for piece in plan["pieces"])
    widths = {0: 800, 1: 300, 2: 1200}
    for wall_index, width in widths.items():
        cursor = 0.0
        for x_start, x_end in sorted(
            (segment["x_start"], segment["x_end"])
            for strip in plan["strips"]
            for segment in strip["segments"]
            if segment["wall_index"] == wall_index
        ):
            assert x_start <= cursor + 1e-6
            cursor = max(cursor, x_end)
        assert cursor == pytest.approx(width)


def test_candidate_search_rejects_an_unsafe_narrow_end_strip():
    plan = create_wallpaper_plan(request([wall(1080)], []))

    selected = plan["start_candidates"][0]
    assert selected["feasible"]
    assert selected["narrowest_strip"] >= 50
    assert min(strip["width"] for strip in plan["strips"]) >= 50
    assert any(not candidate["feasible"] for candidate in plan["start_candidates"])


def test_candidate_search_honours_a_per_wall_minimum_override():
    plan = create_wallpaper_plan(request([wall(1180, minimum_strip_width=150)], []))

    assert plan["start_candidates"][0]["feasible"]
    assert min(strip["width"] for strip in plan["strips"]) >= 150


def test_selected_layout_never_places_a_seam_on_an_outside_corner():
    plan = create_wallpaper_plan(request([wall(1060), wall(900)], [Corner(kind="outside")]))

    assert plan["start_candidates"][0]["feasible"]
    for strip in plan["strips"]:
        for segment in strip["segments"]:
            if segment["wall_index"] == 0:
                continue
            if segment["x_start"] == 0:
                assert len(strip["segments"]) == 2, "seam on the outside edge"


def corner_pieces(plan):
    return [
        segment["x_end"] - segment["x_start"]
        for strip in plan["strips"] if len(strip["segments"]) > 1
        for segment in strip["segments"]
    ]


def four_wall_room(**options):
    return request(
        [wall(2400, f"Wall {number}") for number in range(1, 5)],
        [inside_continue() for _ in range(3)],
        **options,
    )


def test_first_strip_is_cut_so_no_corner_piece_is_a_sliver():
    plan = create_wallpaper_plan(four_wall_room())

    assert min(corner_pieces(plan)) >= 120
    assert not any("corner" in warning for warning in plan["warnings"])


def test_unavoidable_corner_sliver_is_reported_with_a_recommendation():
    plan = create_wallpaper_plan(four_wall_room(minimum_corner_piece=200))

    assert any("start a new strip" in warning for warning in plan["warnings"])
