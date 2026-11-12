from itertools import pairwise

import pytest

from planqer.schemas.wallpaper import (
    Corner,
    Cutout,
    Room,
    Wall,
    WallpaperPlanRequest,
    WallpaperSpec,
)
from planqer.wallpaper.plan import create_wallpaper_plan


def wall(name: str, width: float, cutouts: list[Cutout] | None = None) -> Wall:
    return Wall(
        name=name,
        width_top=width,
        width_middle=width,
        width_bottom=width,
        height_left=2500,
        height_middle=2500,
        height_right=2500,
        cutouts=cutouts or [],
    )


def stepped_room_request(repeat: float = 0) -> WallpaperPlanRequest:
    """A room with a free-standing partition, walked clockwise (see the guide).

    A, B and C are the outer walls, D and F are the two faces of the partition,
    E is its end between two outside corners, and G is a separate wall run.
    """
    walls = [
        wall("A", 2650, [Cutout(kind="window", x=900, y=900, width=1000, height=1200)]),
        wall(
            "B",
            5400,
            [
                Cutout(kind="door", x=600, y=0, width=900, height=2100),
                Cutout(kind="outlet", x=3000, y=300, width=85, height=85),
            ],
        ),
        wall(
            "C", 2650, [Cutout(kind="radiator", x=800, y=200, width=1000, height=600)]
        ),
        wall("D", 4350),
        wall("E", 600),
        wall(
            "F", 4350, [Cutout(kind="window", x=1500, y=900, width=1400, height=1200)]
        ),
        wall("G", 4250),
    ]
    inside = Corner(kind="inside", confirmed_continuation="continue")
    outside = Corner(kind="outside", confirmed_continuation="continue")
    corners = [inside, inside, inside, outside, outside, Corner(kind="none")]
    return WallpaperPlanRequest(
        wallpaper=WallpaperSpec(
            name="W",
            manufacturer="X",
            roll_width=530,
            roll_length=10050,
            repeat=repeat,
            match="half_drop" if repeat else None,
        ),
        room=Room(walls=walls, corners=corners, closed=False),
    )


@pytest.fixture(params=[0, 640], ids=["plain", "patterned"])
def plan(request):
    return create_wallpaper_plan(stepped_room_request(request.param))


def test_every_wall_is_covered_end_to_end_without_gaps_or_overlaps(plan):
    request = stepped_room_request()
    for index, wall_ in enumerate(request.room.walls):
        spans = sorted(
            (segment["x_start"], segment["x_end"])
            for strip in plan["strips"]
            for segment in strip["segments"]
            if segment["wall_index"] == index
        )
        assert spans[0][0] == 0
        assert spans[-1][1] == wall_.width_top
        for (_, end), (start, _) in pairwise(spans):
            assert end == pytest.approx(start)


def test_strips_are_carried_round_the_outside_corners_of_the_partition(plan):
    joined = {
        (first["wall_index"], second["wall_index"])
        for strip in plan["strips"]
        for first, second in zip(strip["segments"], strip["segments"][1:])
    }

    assert {(3, 4), (4, 5)} <= joined


def test_the_separate_run_shares_no_strip_with_the_partition(plan):
    for strip in plan["strips"]:
        walls = {segment["wall_index"] for segment in strip["segments"]}
        assert not ({5, 6} <= walls)


def test_no_corner_piece_is_below_the_minimum(plan):
    assert plan["corner_quality"]["short_corners"] == []
    assert plan["corner_quality"]["smallest"] >= 100


def test_openings_are_cut_out_of_the_strips_that_cross_them(plan):
    cut = {
        (piece["wall_index"], notch["kind"])
        for piece in plan["pieces"]
        for notch in piece["notches"]
    }

    assert {
        (0, "window"),
        (1, "door"),
        (1, "outlet"),
        (2, "radiator"),
        (5, "window"),
    } <= cut


def test_every_piece_is_allocated_and_rolls_cover_the_cut_length(plan):
    assert plan["rolls_to_buy"] >= plan["rolls_needed"]
    assert plan["material"]["bought_length"] >= plan["material"]["used_length"]
    assert plan["material"]["used_length"] == sum(
        piece["cut_length"] for piece in plan["pieces"]
    )


def test_a_pattern_repeat_never_needs_fewer_rolls_than_plain_paper():
    plain = create_wallpaper_plan(stepped_room_request())
    patterned = create_wallpaper_plan(stepped_room_request(640))

    assert patterned["rolls_needed"] >= plain["rolls_needed"]
