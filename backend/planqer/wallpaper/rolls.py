from dataclasses import dataclass, field


@dataclass(frozen=True)
class RollPiece:
    piece_id: str
    length: float
    phase: float


@dataclass(frozen=True)
class RollCut:
    piece_id: str
    start: float
    end: float
    phase: float
    alignment_gap: float
    gap_kind: str | None = None
    source_kind: str = "roll"


@dataclass
class WallpaperRoll:
    number: int
    cuts: list[RollCut] = field(default_factory=list)

    @property
    def cursor(self) -> float:
        return max((cut.end for cut in self.cuts), default=0)


def assign_pieces_to_rolls(
    pieces: list[RollPiece], roll_length: float, repeat: float, roll_offset: float = 0
) -> list[WallpaperRoll]:
    """Assign every piece with bounded longest-first, phase-aware first fit."""
    if roll_length <= 0:
        raise ValueError("roll_length must be greater than 0")
    rolls: list[WallpaperRoll] = []
    # Trying both descending and ascending length order keeps this deliberately
    # bounded while allowing short phase-compatible pieces to fill a gap.
    candidates = [_allocate(order, roll_length, repeat, roll_offset) for order in (
        sorted(pieces, key=lambda item: item.length, reverse=True),
        sorted(pieces, key=lambda item: item.length),
    )]
    # Keep longest-first when candidates use the same number of rolls. This
    # makes the cut sheet stable while still considering a short-first fallback
    # when it saves a roll.
    return min(candidates, key=len)


def _allocate(
    pieces: list[RollPiece], roll_length: float, repeat: float, roll_offset: float
) -> list[WallpaperRoll]:
    rolls: list[WallpaperRoll] = []
    offcuts: list[tuple[WallpaperRoll, float, float]] = []
    for piece in pieces:
        if piece.length <= 0 or piece.length > roll_length:
            raise ValueError(f"Piece '{piece.piece_id}' cannot fit on a roll")
        reused = _take_compatible_offcut(offcuts, piece, repeat, roll_offset)
        if reused is not None:
            roll, cut = reused
            roll.cuts.append(cut)
            roll.cuts.sort(key=lambda item: item.start)
            continue
        for roll in rolls:
            cut = _aligned_cut(roll.cursor, piece, repeat, roll_offset)
            if cut.end <= roll_length:
                roll.cuts.append(cut)
                _record_alignment_offcut(offcuts, roll, cut)
                break
        else:
            roll = WallpaperRoll(number=len(rolls) + 1)
            cut = _aligned_cut(0, piece, repeat, roll_offset)
            if cut.end > roll_length:
                raise ValueError(f"Piece '{piece.piece_id}' cannot fit on a roll")
            roll.cuts.append(cut)
            _record_alignment_offcut(offcuts, roll, cut)
            rolls.append(roll)
    return rolls


def _record_alignment_offcut(
    offcuts: list[tuple[WallpaperRoll, float, float]], roll: WallpaperRoll, cut: RollCut
) -> None:
    if cut.alignment_gap >= 50:
        offcuts.append((roll, cut.start - cut.alignment_gap, cut.start))


def _take_compatible_offcut(
    offcuts: list[tuple[WallpaperRoll, float, float]], piece: RollPiece,
    repeat: float, roll_offset: float,
) -> tuple[WallpaperRoll, RollCut] | None:
    """Consume a real phase-compatible alignment gap before opening new stock."""
    for index, (roll, start, end) in enumerate(offcuts):
        cut = _aligned_cut(start, piece, repeat, roll_offset)
        if cut.end > end:
            continue
        offcuts.pop(index)
        if cut.start - start >= 50:
            offcuts.append((roll, start, cut.start))
        if end - cut.end >= 50:
            offcuts.append((roll, cut.end, end))
        return roll, RollCut(
            piece_id=cut.piece_id, start=cut.start, end=cut.end, phase=cut.phase,
            alignment_gap=cut.alignment_gap, gap_kind=cut.gap_kind, source_kind="offcut",
        )
    return None


def _aligned_cut(cursor: float, piece: RollPiece, repeat: float, roll_offset: float) -> RollCut:
    gap = 0 if repeat == 0 else (piece.phase - (cursor + roll_offset)) % repeat
    start = cursor + gap
    # A gap at least as long as the shortest practical strip is a separately
    # tracked reusable offcut; smaller gaps are pattern loss.
    gap_kind = None if gap == 0 else ("reusable_offcut" if gap >= 50 else "pattern_waste")
    return RollCut(piece.piece_id, start, start + piece.length, piece.phase, gap, gap_kind)
