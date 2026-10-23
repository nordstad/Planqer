import pytest

from planqer.schemas.wallpaper import Allowances, Wall
from planqer.wallpaper.strips import lay_wall_strips


def wall(**overrides) -> Wall:
    return Wall(
        name="Hallway",
        width_top=1100,
        width_middle=1100,
        width_bottom=1100,
        height_left=2400,
        height_middle=2450,
        height_right=2500,
        **overrides,
    )


def test_lay_wall_strips_covers_the_complete_wall():
    strips = lay_wall_strips(wall(), roll_width=530, allowances=Allowances())

    assert [(strip.x_start, strip.x_end) for strip in strips] == [
        (0, 530),
        (530, 1060),
        (1060, 1100),
    ]
    assert [strip.number for strip in strips] == [1, 2, 3]


def test_lay_wall_strips_uses_the_high_edge_of_a_sloped_strip():
    strips = lay_wall_strips(wall(), roll_width=530, allowances=Allowances())

    assert strips[0].top_height == pytest.approx(2448.1818182)
    assert strips[0].precut_length == pytest.approx(2548.1818182)


def test_lay_wall_strips_uses_a_requested_first_strip_width():
    strips = lay_wall_strips(
        wall(), roll_width=530, allowances=Allowances(), first_strip_width=40
    )

    assert [(strip.x_start, strip.x_end) for strip in strips] == [
        (0, 40),
        (40, 570),
        (570, 1100),
    ]


def test_lay_wall_strips_can_continue_room_wide_strip_numbering():
    strips = lay_wall_strips(
        wall(), roll_width=530, allowances=Allowances(), start_number=4
    )

    assert [strip.number for strip in strips] == [4, 5, 6]


@pytest.mark.parametrize("first_strip_width", [0, 531, 600])
def test_lay_wall_strips_rejects_invalid_first_strip_width(first_strip_width):
    with pytest.raises(ValueError, match="first_strip_width"):
        lay_wall_strips(
            wall(),
            roll_width=530,
            allowances=Allowances(),
            first_strip_width=first_strip_width,
        )
