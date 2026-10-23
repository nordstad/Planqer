import pytest
from pydantic import ValidationError

from planqer.schemas.wallpaper import (
    Allowances,
    Cutout,
    Room,
    Wall,
    WallpaperPlanRequest,
    WallpaperSpec,
)


def wallpaper() -> WallpaperSpec:
    return WallpaperSpec(
        name="Willow",
        manufacturer="Example Paper Co.",
        roll_width=530,
        roll_length=10050,
    )


def wall() -> Wall:
    return Wall(
        name="North wall",
        width_top=3200,
        width_middle=3200,
        width_bottom=3200,
        height_left=2400,
        height_middle=2400,
        height_right=2400,
        confirmed=True,
    )


def test_wallpaper_request_applies_plain_wallpaper_and_allowance_defaults():
    request = WallpaperPlanRequest(wallpaper=wallpaper(), room=Room(walls=[wall()]))

    assert request.wallpaper.repeat == 0
    assert request.wallpaper.match is None
    assert request.allowances == Allowances()
    assert request.safety_margin_percent == 10
    assert request.minimum_strip_width == 50


def test_patterned_wallpaper_requires_a_match_type():
    with pytest.raises(ValidationError, match="match is required"):
        WallpaperSpec(**(wallpaper().model_dump() | {"repeat": 640}))


def test_plain_wallpaper_rejects_a_match_type():
    with pytest.raises(ValidationError, match="match must be omitted"):
        WallpaperSpec(
            name="Willow",
            manufacturer="Example Paper Co.",
            roll_width=530,
            roll_length=10050,
            match="straight",
        )


def test_cutout_selects_a_safe_default_mode_by_kind():
    assert Cutout(kind="door", x=0, y=0, width=900, height=2100).mode == "precut"
    assert Cutout(kind="outlet", x=300, y=800, width=80, height=80).mode == "mark"


def test_wallpaper_models_forbid_unknown_fields():
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        WallpaperSpec(**(wallpaper().model_dump() | {"unknown": "value"}))


def test_room_rejects_a_corner_count_that_does_not_connect_its_walls():
    with pytest.raises(ValidationError, match="one corner between each pair"):
        Room(walls=[wall(), wall()], corners=[])
