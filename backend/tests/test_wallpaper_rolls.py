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
    assert cuts[0].gap_kind == "reusable_offcut"


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
    assert all(cut.gap_kind is None for cut in cuts)


def test_allocator_opens_a_new_roll_when_the_aligned_piece_does_not_fit():
    rolls = assign_pieces_to_rolls(
        [RollPiece("first", 700, 0), RollPiece("second", 700, 500)],
        roll_length=1500,
        repeat=600,
    )

    assert len(rolls) == 2
    assert [cut.piece_id for roll in rolls for cut in roll.cuts] == ["first", "second"]


def test_allocator_reuses_a_phase_compatible_alignment_offcut():
    rolls = assign_pieces_to_rolls(
        [
            RollPiece("long", 700, 500),
            RollPiece("short", 100, 0),
        ],
        roll_length=2000,
        repeat=600,
    )

    short = next(cut for roll in rolls for cut in roll.cuts if cut.piece_id == "short")
    assert len(rolls) == 1
    assert short.source_kind == "offcut"
    assert (short.start, short.end) == (0, 100)


def test_material_summary_counts_reused_offcuts_and_net_pattern_loss():
    from planqer.wallpaper.plan import _material_summary, _unused_gaps

    rolls = assign_pieces_to_rolls(
        [RollPiece("long", 700, 500), RollPiece("short", 100, 0)],
        roll_length=2000,
        repeat=600,
    )

    material = _material_summary(rolls, 2000, 600)

    # The 500 mm alignment gap shrinks to 400 mm because "short" fills the first 100 mm.
    assert _unused_gaps(rolls[0]) == 400
    assert material == {
        "bought_length": 2000,
        "used_length": 800,
        "offcuts_reused_count": 1,
        "offcuts_reused_length": 100,
        "fit": {
            "longest_piece": 700,
            "full_pieces": 1,
            "pieces_per_roll": 2,
            "length_for_next": 3100,
            "shortfall": 1100,
        },
        "short_pieces_count": 0,
        "short_pieces_length": 0,
        "largest_leftover": 800,
    }


def test_material_summary_counts_short_pieces_cut_from_a_roll_tail():
    from planqer.wallpaper.plan import _material_summary

    rolls = assign_pieces_to_rolls(
        [RollPiece("a", 2400, 0), RollPiece("b", 2400, 0), RollPiece("band", 300, 0)],
        roll_length=10050,
        repeat=0,
    )

    material = _material_summary(rolls, 10050)

    assert len(rolls) == 1
    assert (material["short_pieces_count"], material["short_pieces_length"]) == (1, 300)


def test_roll_fit_says_what_a_longer_roll_would_need():
    from planqer.wallpaper.plan import _material_summary

    pieces = [RollPiece(f"p{index}", 2400, 0) for index in range(5)]
    rolls = assign_pieces_to_rolls(pieces, roll_length=10050, repeat=380)

    fit = _material_summary(rolls, 10050, 380)["fit"]

    # Each 2400 mm piece starts on a 380 mm repeat, so it advances 2660 mm: three fit,
    # and a fourth would need 3 * 2660 + 2400 = 10380 mm.
    assert (fit["pieces_per_roll"], fit["length_for_next"], fit["shortfall"]) == (
        3,
        10380,
        330,
    )
