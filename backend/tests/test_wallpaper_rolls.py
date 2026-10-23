from planqer.wallpaper.rolls import RollPiece, assign_pieces_to_rolls


def test_patterned_pieces_start_at_their_required_phase():
    rolls = assign_pieces_to_rolls(
        [RollPiece("long", 700, 100), RollPiece("short", 400, 300)],
        roll_length=2000,
        repeat=600,
        roll_offset=50,
    )

    cuts = rolls[0].cuts
    assert [cut.piece_id for cut in cuts] == ["long", "short"]
    assert all((cut.start + 50) % 600 == cut.phase for cut in cuts)
    assert cuts[0].alignment_gap == 50
    assert cuts[1].alignment_gap == 100


def test_plain_pieces_are_adjacent_without_alignment_gaps():
    rolls = assign_pieces_to_rolls(
        [RollPiece("long", 700, 0), RollPiece("short", 400, 0)],
        roll_length=2000,
        repeat=0,
    )

    cuts = rolls[0].cuts
    assert [(cut.start, cut.end, cut.alignment_gap) for cut in cuts] == [
        (0, 700, 0),
        (700, 1100, 0),
    ]


def test_allocator_opens_a_new_roll_when_the_aligned_piece_does_not_fit():
    rolls = assign_pieces_to_rolls(
        [RollPiece("first", 700, 0), RollPiece("second", 700, 500)],
        roll_length=1500,
        repeat=600,
    )

    assert len(rolls) == 2
    assert [cut.piece_id for roll in rolls for cut in roll.cuts] == ["first", "second"]
