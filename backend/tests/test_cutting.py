import pytest
from planqer.cutting import min_boards_required_with_cut_list


def test_min_boards_simple():
    parts = {100: 2, 50: 2}
    board_length = 200
    num_boards, cut_list = min_boards_required_with_cut_list(parts, board_length)
    assert num_boards == 2
    assert sum(len(b) for b in cut_list) == 4


def test_min_boards_with_kerf():
    parts = {100: 1, 95: 1}
    board_length = 200
    num_boards, cut_list = min_boards_required_with_cut_list(
        parts, board_length, saw_blade_width=1
    )
    # 100 + 1 + 95 = 196, fits in one board
    assert num_boards == 1
    assert cut_list[0] == [100.0, 95.0]


def test_min_boards_too_short():
    parts = {300: 1}
    board_length = 200
    num_boards, cut_list = min_boards_required_with_cut_list(parts, board_length)
    assert num_boards == 1
    assert cut_list[0] == [300.0]
