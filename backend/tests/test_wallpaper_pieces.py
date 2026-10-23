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
        [
            Cutout(
                kind="heat_pump",
                x=0,
                y=800,
                width=530,
                height=600,
                tuck_edges=["top", "bottom"],
            )
        ],
        phase=120,
        allowances=Allowances(),
    )

    assert [(piece.y_start, piece.y_end, piece.phase) for piece in result.pieces] == [
        (0, 790, 120),
        (1410, 2400, 120),
    ]
    assert [(offcut.y_start, offcut.y_end, offcut.length, offcut.phase) for offcut in result.offcuts] == [
        (790, 1410, 620, 120)
    ]


def test_partial_cutout_becomes_an_allowance_aware_notch_on_the_piece():
    result = split_strip_into_pieces(
        strip(),
        [Cutout(kind="window", x=100, y=800, width=200, height=900, mode="precut")],
        phase=0,
        allowances=Allowances(),
    )

    assert len(result.pieces) == 1
    assert result.offcuts == []
    notch = result.pieces[0].notches[0]
    assert (notch.x_start, notch.y_start, notch.x_end, notch.y_end) == (70, 770, 330, 1730)
    assert notch.mode == "precut"


def test_grouped_cutouts_merge_to_one_conservative_notch_per_strip():
    result = split_strip_into_pieces(
        strip(),
        [
            Cutout(kind="outlet", x=100, y=800, width=50, height=50, group="services"),
            Cutout(kind="switch", x=200, y=900, width=50, height=50, group="services"),
        ],
        phase=0,
        allowances=Allowances(),
    )

    assert len(result.pieces[0].notches) == 1
    assert result.pieces[0].notches[0].mode == "mark"


def test_door_at_the_bottom_only_leaves_an_upper_piece():
    result = split_strip_into_pieces(
        strip(),
        [Cutout(kind="door", x=0, y=0, width=530, height=2100)],
        phase=0,
        allowances=Allowances(),
    )

    assert [(piece.y_start, piece.y_end) for piece in result.pieces] == [(2130, 2400)]
