from dataclasses import asdict
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
    offcuts = []
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
            offcuts.extend(split.offcuts)

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
    total_roll_length = rolls_needed * request.wallpaper.roll_length
    pattern_waste = sum(cut.alignment_gap for roll in rolls for cut in roll.cuts)
    end_offcuts = sum(request.wallpaper.roll_length - roll.cursor for roll in rolls)
    covered_area = sum(
        strip.width * strip.top_height for strip in strips
    )
    roll_area = request.wallpaper.roll_width * request.wallpaper.roll_length
    area_estimate = ceil(covered_area / roll_area) if roll_area else 0
    minimum_width = min((strip.width for strip in strips), default=0)
    seam_notes = [
        f"Strip {strip.number} is narrower than the {request.minimum_strip_width:g} mm minimum"
        for strip in strips
        if strip.width < request.minimum_strip_width
    ]
    serialized_strips = [asdict(strip) | {"width": strip.width} for strip in strips]
    serialized_pieces = [
        asdict(piece) | {"id": f"piece-{index + 1}", "length": piece.length}
        for index, piece in enumerate(pieces)
    ]
    serialized_rolls = [
        {
            "number": roll.number,
            "cuts": [asdict(cut) for cut in roll.cuts],
            "offcut_length": request.wallpaper.roll_length - roll.cursor,
        }
        for roll in rolls
    ]
    return {
        "rolls_needed": rolls_needed,
        "rolls_to_buy": ceil(rolls_needed * (1 + request.safety_margin_percent / 100)),
        "warnings": warnings,
        "errors": [],
        "area_estimate_rolls": area_estimate,
        "waste": {
            "pattern": pattern_waste,
            # Allowance is deliberately cut material at the top and bottom of
            # every strip, whether or not an opening later splits that strip.
            "allowance": sum(
                strip.precut_length - strip.top_height for strip in strips
            ),
            "trim": sum(offcut.length for offcut in offcuts),
            "offcut": end_offcuts,
        },
        "start_candidates": [{
            "wall_index": request.start.wall_index if request.start else 0,
            "direction": request.start.direction if request.start else "clockwise",
            "offset": request.start.offset if request.start else 0,
            "rolls_needed": rolls_needed,
            "waste": total_roll_length - sum(piece.length for piece in pieces),
            "narrowest_strip": minimum_width,
            "feasible": not seam_notes,
            "seam_notes": seam_notes,
        }],
        "corners": [corner.model_dump(mode="json") for corner in request.room.corners],
        "strips": serialized_strips,
        "pieces": serialized_pieces,
        "offcuts": [asdict(offcut) | {"length": offcut.length} for offcut in offcuts],
        "rolls": serialized_rolls,
    }
