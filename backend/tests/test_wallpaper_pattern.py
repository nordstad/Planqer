from planqer.schemas.wallpaper import Allowances, Wall
from planqer.wallpaper.pattern import pattern_datum, strip_phase
from planqer.wallpaper.strips import lay_wall_strips


def wall(height_left: float, height_right: float) -> Wall:
    return Wall(
        name="Wall",
        width_top=1060,
        width_middle=1060,
        width_bottom=1060,
        height_left=height_left,
        height_middle=(height_left + height_right) / 2,
        height_right=height_right,
    )


def test_pattern_datum_defaults_to_the_highest_ceiling_point():
    assert pattern_datum([wall(2400, 2500), wall(2450, 2600)]) == 2600


def test_plain_wallpaper_has_zero_phase_for_every_strip():
    strips = lay_wall_strips(wall(2400, 2400), 530, Allowances())

    assert [
        strip_phase(strip, repeat=0, match=None, datum=2400) for strip in strips
    ] == [
        0,
        0,
    ]


def test_straight_match_phase_uses_the_strip_top_and_global_datum():
    strip = lay_wall_strips(wall(2400, 2500), 530, Allowances())[0]

    assert strip_phase(strip, repeat=640, match="straight", datum=2600) == 150


def test_half_drop_offsets_odd_numbered_strips_by_half_a_repeat():
    strips = lay_wall_strips(wall(2400, 2400), 530, Allowances())

    assert [
        strip_phase(strip, repeat=600, match="half_drop", datum=2400)
        for strip in strips
    ] == [300, 0]
