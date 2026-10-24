import pytest
from pydantic import ValidationError

from planqer.schemas.wallpaper import (
    Corner,
    Room,
    Wall,
    WallpaperPlanRequest,
    WallpaperSpec,
)
from planqer.wallpaper.closure import CLOSURE_TOLERANCE_MM, room_closure
from planqer.wallpaper.plan import create_wallpaper_plan


def wall(width: float, name: str = "Wall") -> Wall:
    return Wall(
        name=name, width_top=width, width_middle=width, width_bottom=width,
        height_left=2400, height_middle=2400, height_right=2400,
    )


def room(widths, *, closed=True, kinds=None) -> Room:
    walls = [wall(width, f"Wall {index + 1}") for index, width in enumerate(widths)]
    count = len(walls) if closed else len(walls) - 1
    kinds = kinds or ["inside"] * count
    return Room(walls=walls, corners=[Corner(kind=kind) for kind in kinds], closed=closed)


def plan_request(target: Room) -> WallpaperPlanRequest:
    return WallpaperPlanRequest(
        wallpaper=WallpaperSpec(
            name="Willow", manufacturer="Example", roll_width=530, roll_length=10050,
        ),
        room=target,
    )


def test_open_room_has_no_closure():
    assert room_closure(room([2400, 1000, 2400], closed=False)) is None


def test_four_equal_walls_form_a_closed_square():
    closure = room_closure(room([2400, 2400, 2400, 2400]))

    assert closure.valid
    assert closure.gap == pytest.approx(0)


def test_rectangle_closes_with_equal_opposite_walls():
    assert room_closure(room([2400, 1000, 2400, 1000])).valid


def test_unequal_walls_leave_a_measurable_gap():
    closure = room_closure(room([2400, 1000, 2400, 900]))

    assert not closure.valid
    assert closure.gap == pytest.approx(100)
    assert "100 mm" in closure.message


def test_gap_within_tolerance_is_valid():
    closure = room_closure(room([2400, 1000, 2400, 1000 - CLOSURE_TOLERANCE_MM]))

    assert closure.valid


def test_l_shaped_room_closes_with_an_outside_corner():
    # Six walls: five inside corners and one outside corner turn 360 degrees.
    closure = room_closure(
        room(
            [4000, 2000, 2000, 2000, 2000, 4000],
            kinds=["inside", "inside", "outside", "inside", "inside", "inside"],
        )
    )

    assert closure.valid


def test_wrong_total_turn_is_reported_even_when_the_endpoint_returns():
    closure = room_closure(
        room([1000, 1000, 1000], kinds=["inside", "inside", "inside"])
    )

    assert not closure.valid
    assert "turn" in closure.message


def test_closed_room_cannot_contain_a_corner_without_a_wall_join():
    with pytest.raises(ValidationError):
        room([2400, 1000, 2400, 1000], kinds=["inside", "none", "inside", "inside"])


def test_open_room_may_start_a_new_wall_run_with_a_none_corner():
    result = room([2400, 1000, 2400], closed=False, kinds=["inside", "none"])

    assert result.corners[1].kind == "none"


def test_plan_for_a_non_closing_room_is_an_invalid_draft():
    result = create_wallpaper_plan(plan_request(room([2400, 1000, 2400, 900])))

    assert result["closure"]["valid"] is False
    assert result["closure"]["gap"] == pytest.approx(100)
    assert result["errors"] == [result["closure"]["message"]]
    assert result["strips"]


def test_plan_for_a_closing_room_reports_valid_closure():
    result = create_wallpaper_plan(plan_request(room([2400, 1000, 2400, 1000])))

    assert result["closure"]["valid"] is True
    assert result["errors"] == []


def test_plan_for_an_open_room_has_no_closure():
    result = create_wallpaper_plan(plan_request(room([2400, 1000, 2400], closed=False)))

    assert result["closure"] is None


def test_none_corner_never_connects_strips_even_if_continuation_is_set():
    target = Room(
        walls=[wall(2400, "Wall 1"), wall(2400, "Wall 2")],
        corners=[Corner(kind="none", confirmed_continuation="continue")],
    )

    result = create_wallpaper_plan(plan_request(target))

    assert all(len(strip["segments"]) == 1 for strip in result["strips"])
