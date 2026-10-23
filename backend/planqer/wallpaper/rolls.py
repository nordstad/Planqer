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


@dataclass
class WallpaperRoll:
    number: int
    cuts: list[RollCut] = field(default_factory=list)

    @property
    def cursor(self) -> float:
        return self.cuts[-1].end if self.cuts else 0


def assign_pieces_to_rolls(
    pieces: list[RollPiece], roll_length: float, repeat: float, roll_offset: float = 0
) -> list[WallpaperRoll]:
    """Assign every piece with bounded longest-first, phase-aware first fit."""
    if roll_length <= 0:
        raise ValueError("roll_length must be greater than 0")
    rolls: list[WallpaperRoll] = []
    for piece in sorted(pieces, key=lambda item: item.length, reverse=True):
        if piece.length <= 0 or piece.length > roll_length:
            raise ValueError(f"Piece '{piece.piece_id}' cannot fit on a roll")
        for roll in rolls:
            cut = _aligned_cut(roll.cursor, piece, repeat, roll_offset)
            if cut.end <= roll_length:
                roll.cuts.append(cut)
                break
        else:
            roll = WallpaperRoll(number=len(rolls) + 1)
            cut = _aligned_cut(0, piece, repeat, roll_offset)
            if cut.end > roll_length:
                raise ValueError(f"Piece '{piece.piece_id}' cannot fit on a roll")
            roll.cuts.append(cut)
            rolls.append(roll)
    return rolls


def _aligned_cut(cursor: float, piece: RollPiece, repeat: float, roll_offset: float) -> RollCut:
    gap = 0 if repeat == 0 else (piece.phase - (cursor + roll_offset)) % repeat
    start = cursor + gap
    return RollCut(piece.piece_id, start, start + piece.length, piece.phase, gap)
