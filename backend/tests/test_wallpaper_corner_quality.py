import pytest

from planqer.schemas.wallpaper import Corner, Room, Wall, WallpaperPlanRequest, WallpaperSpec
from planqer.wallpaper.plan import corner_quality, create_wallpaper_plan
from planqer.wallpaper.strips import ConnectedStrip, StripSegment


def wall(name: str, width: float = 3000) -> Wall:
    return Wall(
        name=name, width_top=width, width_middle=width, width_bottom=width,
        height_left=2400, height_middle=2400, height_right=2400,
    )


def strip(number: int, *segments: tuple[int, float, float]) -> ConnectedStrip:
    return ConnectedStrip(
        number=number,
        segments=tuple(
            StripSegment(wall_index=index, x_start=start, x_end=end, top_height=2400)
            for index, start, end in segments
        ),
        phase=0, precut_length=2500, precut_width=sum(end - start for _, start, end in segments),
    )


def test_no_connected_strips_means_no_corner_quality():
    quality = corner_quality([strip(1, (0, 0, 530))], [wall("A")], 100)

    assert quality == {"minimum": 100, "smallest": None, "short_corners": []}


def test_corner_pieces_above_the_minimum_are_reported_without_shortfalls():
    walls = [wall("North"), wall("East")]
    quality = corner_quality([strip(1, (0, 2700, 3000), (1, 0, 230))], walls, 100)

    assert quality["smallest"] == pytest.approx(230)
    assert quality["short_corners"] == []


def test_short_corner_piece_names_the_corner_and_recommends_a_new_strip():
    walls = [wall("North"), wall("East")]
    quality = corner_quality([strip(4, (0, 2700, 3000), (1, 0, 21))], walls, 100)

    assert quality["smallest"] == pytest.approx(21)
    assert quality["short_corners"] == [{
        "strip": 4,
        "from_wall": "North",
        "to_wall": "East",
        "width": pytest.approx(21),
        "action": "Start a new strip at the corner between 'North' and 'East'.",
    }]


def test_plan_result_includes_corner_quality():
    request = WallpaperPlanRequest(
        wallpaper=WallpaperSpec(
            name="Willow", manufacturer="Example", roll_width=530, roll_length=10050,
        ),
        room=Room(
            walls=[wall("North"), wall("East")],
            corners=[Corner(kind="inside", confirmed_continuation="continue")],
        ),
    )

    quality = create_wallpaper_plan(request)["corner_quality"]

    assert quality["minimum"] == 100
    assert quality["smallest"] >= 100
    assert quality["short_corners"] == []
