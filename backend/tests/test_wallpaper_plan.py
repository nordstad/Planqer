import pytest

from planqer.schemas.wallpaper import Cutout, Room, Wall, WallpaperPlanRequest, WallpaperSpec
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
    assert result["waste"] == {
        "pattern": 0,
        "allowance": 200,
        "trim": 0,
        "offcut": 5250,
    }
    assert result["area_estimate_rolls"] == 1
    assert result["start_candidates"][0]["narrowest_strip"] == 530


@pytest.mark.parametrize(
    ("direction", "with_cutout"),
    [("rising_left", False), ("rising_right", False), ("rising_left", True), ("rising_right", True)],
)
def test_over_stairs_profiles_keep_coverage_phase_and_roll_allocation(
    direction, with_cutout
):
    heights = (1800, 2100, 2400) if direction == "rising_left" else (2400, 2100, 1800)
    cutouts = [Cutout(kind="window", x=700, y=500, width=400, height=500)] if with_cutout else []
    request = WallpaperPlanRequest(
        wallpaper=WallpaperSpec(
            name="Willow", manufacturer="Example", roll_width=530, roll_length=10050,
            repeat=300, match="straight",
        ),
        room=Room(walls=[Wall(
            name="Stairs", profile="over_stairs", stair_direction=direction,
            width_top=1800, width_middle=1800, width_bottom=1800,
            height_left=heights[0], height_middle=heights[1], height_right=heights[2],
            cutouts=cutouts,
        )]),
    )

    result = create_wallpaper_plan(request)

    assert len(result["strips"]) == 4
    assert result["pieces"]
    assert {piece["strip_number"] for piece in result["pieces"]} == {
        strip["number"] for strip in result["strips"]
    }
    assert all(piece["phase"] == 0 for piece in result["pieces"])
    allocated = {cut["piece_id"] for roll in result["rolls"] for cut in roll["cuts"]}
    assert allocated == {piece["id"] for piece in result["pieces"]}
    assert all(segment["local_stair_edge"] for strip in result["strips"] for segment in strip["segments"])
