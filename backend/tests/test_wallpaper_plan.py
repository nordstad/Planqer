import pytest

from planqer.schemas.wallpaper import (
    Cutout,
    Room,
    Wall,
    WallpaperPlanRequest,
    WallpaperSpec,
)
from planqer.wallpaper.plan import create_wallpaper_plan


def test_plan_returns_every_strip_piece_and_roll_for_a_plain_wall():
    request = WallpaperPlanRequest(
        wallpaper=WallpaperSpec(
            name="Willow", manufacturer="Example", roll_width=530, roll_length=10050
        ),
        room=Room(
            walls=[
                Wall(
                    name="Hall",
                    width_top=1060,
                    width_middle=1060,
                    width_bottom=1060,
                    height_left=2400,
                    height_middle=2400,
                    height_right=2400,
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
        "offcut": 5050,
    }
    assert result["area_estimate_rolls"] == 1
    assert result["start_candidates"][0]["narrowest_strip"] == 530


@pytest.mark.parametrize(
    ("upper", "lower"),
    [((2600, 2000), (700, 200)), ((2000, 2600), (200, 700))],
)
@pytest.mark.parametrize("with_cutout", [False, True])
def test_sloped_keeps_coverage_phase_and_roll_allocation(upper, lower, with_cutout):
    cutouts = (
        [Cutout(kind="window", x=700, y=300, width=400, height=500)]
        if with_cutout
        else []
    )
    request = WallpaperPlanRequest(
        wallpaper=WallpaperSpec(
            name="Willow",
            manufacturer="Example",
            roll_width=530,
            roll_length=10050,
            repeat=300,
            match="straight",
        ),
        room=Room(
            walls=[
                Wall(
                    name="Gable",
                    profile="sloped",
                    width_top=1800,
                    width_middle=1800,
                    width_bottom=1800,
                    height_left=upper[0],
                    height_middle=2000,
                    height_right=upper[1],
                    lower_left=lower[0],
                    lower_right=lower[1],
                    cutouts=cutouts,
                )
            ]
        ),
    )

    result = create_wallpaper_plan(request)

    assert len(result["strips"]) == 4
    assert {piece["strip_number"] for piece in result["pieces"]} == {
        strip["number"] for strip in result["strips"]
    }
    allocated = {cut["piece_id"] for roll in result["rolls"] for cut in roll["cuts"]}
    assert allocated == {piece["id"] for piece in result["pieces"]}
    datum = max(upper)
    pieces = {piece["strip_number"]: piece for piece in result["pieces"]}
    for strip in result["strips"]:
        segment = strip["segments"][0]
        piece = pieces[strip["number"]]
        assert piece["phase"] == pytest.approx((datum - segment["top_height"]) % 300)
        assert piece["y_start"] <= segment["bottom_height"]
        assert piece["y_end"] >= segment["top_height"]


def test_sloped_requires_lower_edge_below_upper_edge():
    with pytest.raises(ValueError, match="below the upper edge"):
        Wall(
            name="Gable",
            profile="sloped",
            width_top=1800,
            width_middle=1800,
            width_bottom=1800,
            height_left=1000,
            height_middle=1000,
            height_right=1000,
            lower_left=1000,
            lower_right=0,
        )


def test_requested_first_strip_width_is_used_when_it_is_a_candidate():
    from planqer.schemas.wallpaper import StartPosition

    def request(start=None):
        return WallpaperPlanRequest(
            wallpaper=WallpaperSpec(
                name="W", manufacturer="M", roll_width=530, roll_length=10050
            ),
            room=Room(
                walls=[
                    Wall(
                        name="Hall",
                        width_top=2400,
                        width_middle=2400,
                        width_bottom=2400,
                        height_left=2400,
                        height_middle=2400,
                        height_right=2400,
                    )
                ]
            ),
            start=start,
        )

    chosen = create_wallpaper_plan(
        request(StartPosition(wall_index=0, first_strip_width=265))
    )

    assert chosen["strips"][0]["width"] == 265
    assert chosen["start_candidates"][0]["first_strip_widths"] == [265]


def _heat_pump_plan(repeat):
    return create_wallpaper_plan(
        WallpaperPlanRequest(
            wallpaper=WallpaperSpec(
                name="Willow",
                manufacturer="Example",
                roll_width=530,
                roll_length=10050,
                repeat=repeat,
                match="straight" if repeat else None,
            ),
            room=Room(
                walls=[
                    Wall(
                        name="Hall",
                        width_top=530,
                        width_middle=530,
                        width_bottom=530,
                        height_left=2400,
                        height_middle=2400,
                        height_right=2400,
                        cutouts=[
                            Cutout(
                                kind="heat_pump",
                                x=0,
                                y=800,
                                width=530,
                                height=600,
                                tuck_edges=["top", "bottom"],
                            )
                        ],
                    )
                ]
            ),
        )
    )


def test_cut_length_adds_trim_only_at_the_ceiling_and_floor_ends():
    plan = _heat_pump_plan(0)
    lower, upper = plan["pieces"]

    assert (
        lower["length"],
        lower["allowance_top"],
        lower["allowance_bottom"],
        lower["cut_length"],
    ) == (790, 0, 50, 840)
    assert (
        upper["length"],
        upper["allowance_top"],
        upper["allowance_bottom"],
        upper["cut_length"],
    ) == (990, 50, 0, 1040)
    cuts = {
        cut["piece_id"]: cut["end"] - cut["start"]
        for roll in plan["rolls"]
        for cut in roll["cuts"]
    }
    assert cuts == {"piece-1": 840, "piece-2": 1040}


def test_trim_above_the_ceiling_shifts_the_pattern_phase_of_the_paper_top():
    plain, patterned = _heat_pump_plan(0), _heat_pump_plan(640)

    assert plain["pieces"][1]["cut_phase"] == 0
    assert patterned["pieces"][1]["cut_phase"] == 590
    cut = next(
        cut
        for roll in patterned["rolls"]
        for cut in roll["cuts"]
        if cut["piece_id"] == "piece-2"
    )
    assert cut["phase"] == 590


def test_piece_below_an_opening_takes_the_pattern_phase_of_its_own_top_edge():
    plan = _heat_pump_plan(640)
    lower, upper = plan["pieces"]

    # The strip's top is at 2400 mm; the lower piece's top is 1610 mm below it.
    assert upper["phase"] == 0
    assert lower["phase"] == 1610 % 640 == 330
    # Trim is only above the ceiling, so only the upper piece's paper top moves.
    assert (lower["cut_phase"], upper["cut_phase"]) == (330, 590)
    cuts = {
        cut["piece_id"]: cut["phase"] for roll in plan["rolls"] for cut in roll["cuts"]
    }
    assert cuts == {"piece-1": 330, "piece-2": 590}
