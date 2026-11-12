import pytest
from pydantic import ValidationError

from planqer.schemas.wallpaper import (
    Corner,
    Room,
    StartPosition,
    Wall,
    WallpaperPlanRequest,
    WallpaperSpec,
)
from planqer.wallpaper.plan import create_wallpaper_plan

ROLL_WIDTH = 530


def wall(name: str, width: float) -> Wall:
    return Wall(
        name=name,
        width_top=width,
        width_middle=width,
        width_bottom=width,
        height_left=2400,
        height_middle=2400,
        height_right=2400,
    )


def plan_for(widths, *, style=None, start=None, corners=None, closed=False):
    walls = [wall(chr(65 + index), width) for index, width in enumerate(widths)]
    kwargs = {} if style is None else {"start_style": style}
    return create_wallpaper_plan(
        WallpaperPlanRequest(
            wallpaper=WallpaperSpec(
                name="W", manufacturer="X", roll_width=ROLL_WIDTH, roll_length=10050
            ),
            room=Room(walls=walls, corners=corners or [], closed=closed),
            start=start,
            **kwargs,
        )
    )


def widths_on_wall(plan, wall_index=0):
    return [
        segment["x_end"] - segment["x_start"]
        for strip in plan["strips"]
        for segment in strip["segments"]
        if segment["wall_index"] == wall_index
    ]


def test_the_default_is_the_recommended_start():
    plan = plan_for([4400])

    assert plan["start"]["style"] == "recommended"
    assert widths_on_wall(plan)[0] == ROLL_WIDTH


@pytest.mark.parametrize("style", ["centred", "full_width"])
def test_an_unknown_start_style_is_rejected(style):
    with pytest.raises(ValidationError):
        plan_for([4400], style=style)


def test_recommended_starts_with_a_full_strip_and_cuts_only_the_last_one():
    plan = plan_for([4400])

    widths = widths_on_wall(plan)
    assert widths[:-1] == [ROLL_WIDTH] * (len(widths) - 1)
    assert widths[-1] == pytest.approx(4400 - ROLL_WIDTH * (len(widths) - 1))
    assert plan["start"]["cut_strips"] == 1
    assert plan["start"]["full_width_runs"] == plan["start"]["runs"] == 1
    assert plan["start"]["fallback"] == []


def test_even_keeps_the_balanced_pieces_at_both_ends():
    plan = plan_for([4400], style="even")

    widths = widths_on_wall(plan)
    assert widths[0] == widths[-1] == pytest.approx(345)
    assert plan["start"]["cut_strips"] == 2


def test_a_wall_that_divides_exactly_needs_no_lengthwise_cut():
    plan = plan_for([ROLL_WIDTH * 6])

    assert plan["start"]["cut_strips"] == 0
    assert set(widths_on_wall(plan)) == {ROLL_WIDTH}


@pytest.mark.parametrize("width", [3250, 5850])
def test_a_full_start_that_would_leave_a_sliver_falls_back_to_even_pieces(width):
    plan = plan_for([width])

    assert min(widths_on_wall(plan)) >= 100
    assert widths_on_wall(plan)[0] < ROLL_WIDTH
    assert plan["start"]["full_width_runs"] == 0
    assert plan["start"]["fallback"] == [{"wall": "A", "reason": "narrow_piece"}]
    assert plan["start"]["full_width_extra_rolls"] is None


def test_each_wall_run_decides_for_itself():
    plan = plan_for(
        [4400, 5850],
        corners=[Corner(kind="inside", confirmed_continuation="start_new")],
    )

    assert widths_on_wall(plan, 0)[0] == ROLL_WIDTH
    assert widths_on_wall(plan, 1)[0] < ROLL_WIDTH
    assert plan["start"]["runs"] == 2
    assert plan["start"]["full_width_runs"] == 1
    assert plan["start"]["fallback"] == [{"wall": "B", "reason": "narrow_piece"}]


def test_a_width_the_user_picked_wins_over_the_style():
    plan = plan_for([4400], start=StartPosition(wall_index=0, first_strip_width=265))

    assert widths_on_wall(plan)[0] == 265
    assert plan["start"]["asked_for"] is True


def test_the_even_style_says_why_a_run_does_not_start_full():
    plan = plan_for([4400], style="even")

    assert plan["start"]["fallback"] == [{"wall": "A", "reason": "style"}]


@pytest.mark.parametrize("width", range(800, 9000, 150))
def test_the_recommended_start_never_costs_more_rolls_or_leaves_a_sliver(width):
    recommended = plan_for([width])
    even = plan_for([width], style="even")

    assert recommended["rolls_needed"] <= even["rolls_needed"]
    assert min(widths_on_wall(recommended)) >= min(100, width)
    assert recommended["start"]["cut_strips"] <= even["start"]["cut_strips"]


def test_start_candidates_carry_the_facts_that_decide_between_them():
    plan = plan_for([4400])

    first = plan["start_candidates"][0]
    assert first["first_strip_widths"] == [ROLL_WIDTH]
    assert first["cut_strips"] == 1
    assert first["full_width_runs"] == first["runs"] == 1
    assert {"fewest_rolls", "fewest_cuts", "full_width_start"} <= set(first["tags"])
    assert all(
        "full_width_start" not in candidate["tags"]
        for candidate in plan["start_candidates"][1:]
        if candidate["first_strip_widths"] != [ROLL_WIDTH]
    )


def test_a_sliver_start_is_never_tagged_as_a_good_option():
    plan = plan_for([5850])

    full = next(
        candidate
        for candidate in plan["start_candidates"]
        if candidate["first_strip_widths"] == [ROLL_WIDTH]
    )
    assert full["tags"] == []


def test_a_start_the_user_forced_says_how_many_rolls_another_start_would_save():
    forced = plan_for([4200], start=StartPosition(wall_index=0, first_strip_width=100))
    best = plan_for([4200])

    assert forced["rolls_needed"] == best["rolls_needed"] + 1
    assert forced["start"]["rolls_saved_elsewhere"] == 1
    assert best["start"]["rolls_saved_elsewhere"] == 0
