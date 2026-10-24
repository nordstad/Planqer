import pytest

from planqer.schemas.wallpaper import Cutout, Wall
from planqer.wallpaper.geometry import (
    cutout_bounds,
    strip_cutout_intersection,
    wall_outline,
)


def wall(**overrides) -> Wall:
    values = dict(
        name="Hallway",
        width_top=3000,
        width_middle=2980,
        width_bottom=3010,
        height_left=2400,
        height_middle=2500,
        height_right=2600,
    )
    values.update(overrides)
    return Wall(**values)


def test_wall_outline_uses_the_widest_measurement_and_sloped_top():
    outline = wall_outline(wall())

    assert outline.width == 3010
    assert outline.vertices == ((0, 0), (3010, 0), (3010, 2600), (0, 2400))
    assert outline.top_height_at(1505) == pytest.approx(2500)


def test_wall_outline_uses_the_high_edge_for_a_strip():
    outline = wall_outline(wall())

    assert outline.strip_top_height(0, 530) == pytest.approx(2435.2159468)
    assert outline.strip_top_height(2480, 3010) == 2600


def test_over_stairs_outline_has_a_level_top_and_sloped_lower_edge():
    outline = wall_outline(wall(
        profile="over_stairs",
        stair_direction="rising_left",
        height_left=1800,
        height_middle=2100,
        height_right=2400,
    ))

    assert outline.vertices == ((0, 600), (3010, 0), (3010, 2400), (0, 2400))
    assert outline.top_height_at(0) == outline.top_height_at(3010) == 2400
    assert outline.usable_height_at(0) == 1800
    assert outline.usable_height_at(3010) == 2400


def test_double_slope_outline_interpolates_both_boundaries():
    outline = wall_outline(wall(
        profile="double_slope", height_left=2600, height_middle=2300, height_right=2000,
        lower_left=700, lower_right=200,
    ))

    assert outline.vertices == ((0, 700), (3010, 200), (3010, 2000), (0, 2600))
    assert outline.usable_height_at(0) == 1900
    assert outline.usable_height_at(3010) == 1800
    assert outline.strip_top_height(0, 530) == 2600
    assert outline.strip_bottom_height(2480, 3010) == 200


def test_cutout_bounds_are_a_bottom_left_rectangle():
    cutout = Cutout(kind="window", x=400, y=800, width=1000, height=900)

    assert cutout_bounds(cutout) == (400, 800, 1400, 1700)


def test_strip_cutout_intersection_returns_cutout_bounds_within_the_strip():
    cutout = Cutout(kind="window", x=400, y=800, width=1000, height=900)

    intersection = strip_cutout_intersection(cutout, 1000, 1530)

    assert intersection is not None
    assert intersection.x_start == 1000
    assert intersection.x_end == 1400
    assert intersection.y_start == 800
    assert intersection.y_end == 1700


def test_strip_cutout_intersection_returns_none_when_they_only_touch():
    cutout = Cutout(kind="door", x=530, y=0, width=900, height=2100)

    assert strip_cutout_intersection(cutout, 0, 530) is None
