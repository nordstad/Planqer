from planqer.schemas.wallpaper import Room, Wall, WallpaperPlanRequest, WallpaperSpec
from planqer.wallpaper.plan import create_wallpaper_plan


def test_plan_returns_every_strip_piece_and_roll_for_a_plain_wall():
    request = WallpaperPlanRequest(
        wallpaper=WallpaperSpec(
            name="Willow", manufacturer="Example", roll_width=530, roll_length=10050
        ),
        room=Room(
            walls=[
                Wall(
                    name="Hall", width_top=1060, width_middle=1060, width_bottom=1060,
                    height_left=2400, height_middle=2400, height_right=2400,
                )
            ]
        ),
    )

    result = create_wallpaper_plan(request)

    assert result["rolls_needed"] == 1
    assert result["rolls_to_buy"] == 2
    assert len(result["strips"]) == len(result["pieces"]) == 2
