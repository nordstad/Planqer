from planqer.schemas.wallpaper import Allowances, Cutout, Wall
from planqer.wallpaper.pieces import split_strip_into_pieces
from planqer.wallpaper.strips import lay_wall_strips


def strip():
    wall = Wall(
        name="Hallway",
        width_top=530,
        width_middle=530,
        width_bottom=530,
        height_left=2400,
        height_middle=2400,
        height_right=2400,
    )
    return lay_wall_strips(wall, 530, Allowances())[0]


def test_full_width_fixed_obstacle_splits_a_strip_and_tracks_the_middle_offcut():
    result = split_strip_into_pieces(
        strip(),
        {
            0: [
                Cutout(
                    kind="heat_pump",
                    x=0,
                    y=800,
                    width=530,
                    height=600,
                    tuck_edges=["top", "bottom"],
                )
            ]
        },
        phase=120,
        allowances={0: Allowances()},
    )

    assert [(piece.y_start, piece.y_end, piece.phase) for piece in result.pieces] == [
        (0, 790, 120),
        (1410, 2400, 120),
    ]
    assert [
        (offcut.y_start, offcut.y_end, offcut.length, offcut.phase)
        for offcut in result.offcuts
    ] == [(790, 1410, 620, 120)]


def test_partial_cutout_becomes_an_allowance_aware_notch_on_the_piece():
    result = split_strip_into_pieces(
        strip(),
        {
            0: [
                Cutout(
                    kind="window", x=100, y=800, width=200, height=900, mode="precut"
                )
            ]
        },
        phase=0,
        allowances={0: Allowances()},
    )

    assert len(result.pieces) == 1
    assert result.offcuts == []
    notch = result.pieces[0].notches[0]
    assert (notch.x_start, notch.y_start, notch.x_end, notch.y_end) == (
        70,
        770,
        330,
        1730,
    )
    assert notch.mode == "precut"


def test_grouped_cutouts_merge_to_one_conservative_notch_per_strip():
    result = split_strip_into_pieces(
        strip(),
        {
            0: [
                Cutout(
                    kind="outlet", x=100, y=800, width=50, height=50, group="services"
                ),
                Cutout(
                    kind="switch", x=200, y=900, width=50, height=50, group="services"
                ),
            ]
        },
        phase=0,
        allowances={0: Allowances()},
    )

    assert len(result.pieces[0].notches) == 1
    assert result.pieces[0].notches[0].mode == "mark"


def test_door_at_the_bottom_only_leaves_an_upper_piece():
    result = split_strip_into_pieces(
        strip(),
        {0: [Cutout(kind="door", x=0, y=0, width=530, height=2100)]},
        phase=0,
        allowances={0: Allowances()},
    )

    assert [(piece.y_start, piece.y_end) for piece in result.pieces] == [(2130, 2400)]


def test_notch_keeps_the_real_opening_kind_and_label():
    result = split_strip_into_pieces(
        strip(),
        {
            0: [
                Cutout(
                    kind="window", label="Kitchen", x=100, y=800, width=200, height=900
                )
            ]
        },
        phase=0,
        allowances={0: Allowances()},
    )

    notch = result.pieces[0].notches[0]
    assert (notch.kind, notch.label) == ("window", "Kitchen")
    assert notch.core == (100, 800, 300, 1700)


def test_door_gets_the_opening_margin_on_all_sides():
    result = split_strip_into_pieces(
        strip(),
        {0: [Cutout(kind="door", x=100, y=300, width=200, height=1000)]},
        phase=0,
        allowances={0: Allowances()},
    )

    notch = result.pieces[0].notches[0]
    margins = (
        notch.core[0] - notch.x_start,
        notch.core[1] - notch.y_start,
        notch.x_end - notch.core[2],
        notch.y_end - notch.core[3],
    )
    assert margins == (30, 30, 30, 30)


def test_heat_pump_only_gets_a_margin_on_its_tuck_edges():
    result = split_strip_into_pieces(
        strip(),
        {
            0: [
                Cutout(
                    kind="heat_pump",
                    x=100,
                    y=800,
                    width=200,
                    height=300,
                    tuck_edges=["top"],
                )
            ]
        },
        phase=0,
        allowances={0: Allowances()},
    )

    notch = result.pieces[0].notches[0]
    assert notch.core == (100, 800, 300, 1100)
    assert (notch.x_start, notch.y_start, notch.x_end) == (100, 800, 300)
    assert notch.y_end == 1110


def test_margin_is_clamped_at_the_floor_but_the_core_is_not_moved():
    result = split_strip_into_pieces(
        strip(),
        {0: [Cutout(kind="window", x=100, y=10, width=200, height=400)]},
        phase=0,
        allowances={0: Allowances()},
    )

    notch = result.pieces[0].notches[0]
    assert notch.core == (100, 10, 300, 410)
    assert notch.y_start == 0


def test_core_is_clipped_to_the_piece_it_belongs_to():
    result = split_strip_into_pieces(
        strip(),
        {
            0: [
                Cutout(kind="window", x=100, y=800, width=200, height=900),
                Cutout(
                    kind="heat_pump",
                    x=0,
                    y=1000,
                    width=530,
                    height=100,
                    tuck_edges=["top", "bottom"],
                ),
            ]
        },
        phase=0,
        allowances={0: Allowances()},
    )

    lower, upper = result.pieces
    assert lower.notches[0].core == (100, 800, 300, 990)
    assert upper.notches[0].core == (100, 1110, 300, 1700)


def test_grouped_cutouts_use_the_group_name_as_label():
    result = split_strip_into_pieces(
        strip(),
        {
            0: [
                Cutout(
                    kind="outlet", x=100, y=800, width=50, height=50, group="services"
                ),
                Cutout(
                    kind="switch", x=200, y=900, width=50, height=50, group="services"
                ),
            ]
        },
        phase=0,
        allowances={0: Allowances()},
    )

    notch = result.pieces[0].notches[0]
    assert notch.label == "services"
    assert notch.core == (100, 800, 250, 950)
