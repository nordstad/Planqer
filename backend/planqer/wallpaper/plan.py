from math import ceil

from planqer.schemas.wallpaper import WallpaperPlanRequest
from planqer.wallpaper.pattern import pattern_datum, strip_phase
from planqer.wallpaper.pieces import split_strip_into_pieces
from planqer.wallpaper.rolls import RollPiece, assign_pieces_to_rolls
from planqer.wallpaper.strips import lay_wall_strips
from planqer.wallpaper.validation import validate_wallpaper_request


def create_wallpaper_plan(request: WallpaperPlanRequest) -> dict:
    """Create a conservative, phase-aware plan for the measured room."""
    warnings = validate_wallpaper_request(request)
    datum = pattern_datum(request.room.walls, request.anchor)
    strips = []
    pieces = []
    next_number = 1
    for wall_index, wall in enumerate(request.room.walls):
        if wall.skip:
            continue
        wall_strips = lay_wall_strips(
            wall,
            request.wallpaper.roll_width,
            wall.allowances or request.allowances,
            wall_index=wall_index,
            start_number=next_number,
        )
        next_number += len(wall_strips)
        strips.extend(wall_strips)
        for strip in wall_strips:
            phase = strip_phase(
                strip,
                repeat=request.wallpaper.repeat,
                match=request.wallpaper.match,
                datum=datum,
            )
            split = split_strip_into_pieces(
                strip, wall.cutouts, phase, wall.allowances or request.allowances
            )
            pieces.extend(split.pieces)

    roll_pieces = [
        RollPiece(f"piece-{index + 1}", piece.length, piece.phase)
        for index, piece in enumerate(pieces)
    ]
    rolls = assign_pieces_to_rolls(
        roll_pieces,
        request.wallpaper.roll_length,
        request.wallpaper.repeat,
        request.wallpaper.roll_offset,
    )
    rolls_needed = len(rolls)
    return {
        "rolls_needed": rolls_needed,
        "rolls_to_buy": ceil(rolls_needed * (1 + request.safety_margin_percent / 100)),
        "warnings": warnings,
        "errors": [],
        "strips": strips,
        "pieces": pieces,
        "rolls": rolls,
    }
