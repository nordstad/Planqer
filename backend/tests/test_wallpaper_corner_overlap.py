import pytest

from planqer.schemas.wallpaper import (
    Allowances,
    Corner,
    Room,
    Wall,
    WallpaperPlanRequest,
    WallpaperSpec,
)
from planqer.wallpaper.plan import create_wallpaper_plan
from planqer.wallpaper.strips import connected_runs, corner_overlaps, lay_run_strips


def wall(width: float, name: str = "Wall", **overrides) -> Wall:
    return Wall(
        name=name,
        width_top=width,
        width_middle=width,
        width_bottom=width,
        height_left=2400,
        height_middle=2400,
        height_right=2400,
        **overrides,
    )


def request(walls, corners, *, closed=False, **options):
    return WallpaperPlanRequest(
        wallpaper=WallpaperSpec(
            name="Willow",
            manufacturer="Example",
            roll_width=530,
            roll_length=10050,
        ),
        room=Room(walls=walls, corners=corners, closed=closed),
        **options,
    )


def overlapped(plan):
    return {
        strip["number"]: (strip["return_overlap"], strip["return_wall_index"])
        for strip in plan["strips"]
        if strip["return_overlap"]
    }


def test_an_unconfirmed_inside_corner_overlaps_by_default():
    assert corner_overlaps(Corner(kind="inside"))
    assert corner_overlaps(Corner(kind="inside", confirmed_continuation="overlap"))


@pytest.mark.parametrize(
    "corner",
    [
        Corner(kind="inside", confirmed_continuation="start_new"),
        Corner(kind="inside", confirmed_continuation="continue"),
        Corner(kind="outside"),
        Corner(kind="none"),
    ],
)
def test_other_corner_treatments_do_not_overlap(corner):
    assert not corner_overlaps(corner)


def test_final_strip_wraps_fifteen_millimetres_onto_the_next_wall_by_default():
    plan = create_wallpaper_plan(
        request([wall(2400, "A"), wall(2400, "B")], [Corner(kind="inside")])
    )

    assert list(overlapped(plan).values()) == [(15, 1)]
    wrapped = next(strip for strip in plan["strips"] if strip["return_overlap"])
    assert wrapped["wall_index"] == 0
    assert wrapped["segments"][-1]["x_end"] == 2400
    assert wrapped["precut_width"] == pytest.approx(wrapped["width"] + 15)
    # The overlap is not a carried strip, so it never reads as a short corner piece.
    assert plan["corner_quality"]["smallest"] is None
    assert all(len(strip["segments"]) == 1 for strip in plan["strips"])


def test_the_next_wall_still_starts_its_own_strip_at_the_corner():
    plan = create_wallpaper_plan(
        request([wall(2400, "A"), wall(2400, "B")], [Corner(kind="inside")])
    )

    first_on_b = min(
        (strip for strip in plan["strips"] if strip["wall_index"] == 1),
        key=lambda strip: strip["x_start"],
    )
    assert first_on_b["x_start"] == 0


def test_the_overlap_follows_the_corner_allowance():
    plan = create_wallpaper_plan(
        request(
            [wall(2400, "A"), wall(2400, "B")],
            [Corner(kind="inside")],
            allowances=Allowances(corner=20),
        )
    )

    assert list(overlapped(plan).values()) == [(20, 1)]


def test_a_butt_joint_adds_no_overlap():
    corner = Corner(kind="inside", confirmed_continuation="start_new")
    plan = create_wallpaper_plan(request([wall(2400, "A"), wall(2400, "B")], [corner]))

    assert overlapped(plan) == {}


def test_a_break_between_wall_runs_adds_no_overlap():
    plan = create_wallpaper_plan(
        request([wall(2400, "A"), wall(2400, "B")], [Corner(kind="none")])
    )

    assert overlapped(plan) == {}


def test_every_inside_corner_in_a_closed_room_overlaps_including_the_closing_one():
    walls = [wall(2400, "A"), wall(1000, "B"), wall(2400, "C"), wall(1000, "D")]
    corners = [Corner(kind="inside")] * 4
    plan = create_wallpaper_plan(request(walls, corners, closed=True))

    assert sorted(wall_index for _, wall_index in overlapped(plan).values()) == [
        0,
        1,
        2,
        3,
    ]


def test_a_skipped_wall_receives_no_overlap():
    walls = [wall(2400, "A"), wall(2400, "B", skip=True), wall(2400, "C")]
    plan = create_wallpaper_plan(request(walls, [Corner(kind="inside")] * 2))

    assert 1 not in {wall_index for _, wall_index in overlapped(plan).values()}


def test_a_full_width_final_strip_cannot_wrap_beyond_the_roll():
    runs, _ = connected_runs(
        Room(walls=[wall(530, "A"), wall(530, "B")], corners=[Corner(kind="inside")])
    )
    layout = lay_run_strips(
        [wall(530, "A"), wall(530, "B")],
        [0],
        [],
        530,
        [Allowances()] * 2,
        [50] * 2,
        end_overlap=15,
        end_overlap_wall=1,
    )

    assert runs[0].overlap_wall == 1
    assert layout.strips[-1].return_overlap == 0
    assert any("no room to wrap 15 mm" in note for note in layout.notes)


def test_the_planner_avoids_a_final_strip_that_has_no_room_to_wrap():
    plan = create_wallpaper_plan(
        request([wall(2120, "A"), wall(2400, "B")], [Corner(kind="inside")])
    )

    assert list(overlapped(plan).values()) == [(15, 1)]


def test_a_closed_room_with_an_open_wall_plans_only_the_papered_walls():
    walls = [
        wall(2400, "A"),
        wall(1000, "B", skip=True),
        wall(2400, "C"),
        wall(1000, "D"),
    ]
    corners = [Corner(kind="inside")] * 4

    plan = create_wallpaper_plan(request(walls, corners, closed=True))

    assert plan["closure"]["valid"]
    assert {strip["wall_index"] for strip in plan["strips"]} == {0, 2, 3}
    assert {piece["wall_index"] for piece in plan["pieces"]} == {0, 2, 3}
    # No strip wraps onto, or out of, the open wall.
    assert all(
        strip["return_wall_index"] != 1
        for strip in plan["strips"]
        if strip["return_overlap"]
    )
