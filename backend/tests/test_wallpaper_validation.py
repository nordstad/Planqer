import pytest

from planqer.schemas.wallpaper import (
    Corner,
    Cutout,
    Room,
    Wall,
    WallpaperPlanRequest,
    WallpaperSpec,
)
from planqer.wallpaper.validation import validate_wallpaper_request


def request(*, cutouts=None, roll_length=10050, repeat=0, match=None):
    return WallpaperPlanRequest(
        wallpaper=WallpaperSpec(
            name="Willow",
            manufacturer="Example Paper Co.",
            roll_width=530,
            roll_length=roll_length,
            repeat=repeat,
            match=match,
        ),
        room=Room(
            walls=[
                Wall(
                    name="Hallway",
                    width_top=3000,
                    width_middle=3000,
                    width_bottom=3000,
                    height_left=2400,
                    height_middle=2400,
                    height_right=2400,
                    cutouts=cutouts or [],
                )
            ]
        ),
    )


def test_validation_rejects_a_cutout_outside_its_wall():
    plan_request = request(
        cutouts=[Cutout(kind="window", x=2800, y=800, width=400, height=900)]
    )

    with pytest.raises(ValueError, match="outside wall 'Hallway'"):
        validate_wallpaper_request(plan_request)


def test_validation_rejects_a_roll_shorter_than_the_tallest_piece():
    with pytest.raises(ValueError, match="shorter than the tallest piece"):
        validate_wallpaper_request(request(roll_length=2400))


def test_validation_rejects_a_repeat_longer_than_a_roll():
    with pytest.raises(ValueError, match="repeat cannot be longer than the roll"):
        validate_wallpaper_request(
            request(roll_length=500, repeat=640, match="straight")
        )


def test_validation_warns_about_ungrouped_overlap_and_wall_edges():
    plan_request = request(
        cutouts=[
            Cutout(kind="outlet", x=5, y=800, width=80, height=80),
            Cutout(kind="switch", x=50, y=800, width=80, height=80),
        ]
    )

    warnings = validate_wallpaper_request(plan_request)

    assert any("overlap" in warning for warning in warnings)
    assert any("within 10 mm" in warning for warning in warnings)


def test_validation_warns_when_closed_room_opposite_walls_differ():
    walls = [
        request().room.walls[0],
        request().room.walls[0].model_copy(update={"name": "East", "width_top": 3100}),
    ]
    plan_request = request()
    plan_request.room = Room(
        walls=walls,
        corners=[Corner(kind="inside"), Corner(kind="inside")],
        closed=True,
    )

    warnings = validate_wallpaper_request(plan_request)

    assert any("Opposite walls differ" in warning for warning in warnings)
