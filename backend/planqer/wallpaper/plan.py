from dataclasses import asdict, replace
from math import ceil

from planqer.schemas.wallpaper import Room, WallpaperPlanRequest
from planqer.wallpaper.pattern import pattern_datum, strip_phase
from planqer.wallpaper.pieces import split_strip_into_pieces
from planqer.wallpaper.rolls import RollPiece, assign_pieces_to_rolls
from planqer.wallpaper.strips import ConnectedStrip, connected_runs, lay_run_strips
from planqer.wallpaper.validation import validate_wallpaper_request

# First-strip widths are searched in fractions of the roll width, which keeps
# the candidate search bounded to a handful of complete plans.
_FIRST_WIDTH_STEPS = 8


def create_wallpaper_plan(request: WallpaperPlanRequest) -> dict:
    """Create a conservative, phase-aware plan for the measured room."""
    warnings = validate_wallpaper_request(request)
    walls = request.room.walls
    roll_width = request.wallpaper.roll_width
    allowances = [wall.allowances or request.allowances for wall in walls]
    minimums = [wall.minimum_strip_width or request.minimum_strip_width for wall in walls]
    start_wall = request.start.wall_index if request.start else _default_start(request.room)
    runs, room_notes = connected_runs(request.room, start_wall)

    def lay(first_widths: tuple[float, ...]) -> tuple[list[ConnectedStrip], list[str], float]:
        strips, notes, narrowest = [], list(room_notes), float("inf")
        for run, first_width in zip(runs, first_widths):
            layout = lay_run_strips(
                walls, run.wall_indices, run.corners, roll_width, allowances, minimums,
                first_strip_width=first_width, start_number=len(strips) + 1,
            )
            strips.extend(layout.strips)
            notes.extend(layout.notes)
            narrowest = min(narrowest, layout.narrowest)
        return strips, notes, 0 if narrowest == float("inf") else narrowest

    options = sorted(
        {round(roll_width * step / _FIRST_WIDTH_STEPS) for step in range(1, _FIRST_WIDTH_STEPS + 1)}
        | {roll_width},
        reverse=True,
    )
    options = [width for width in options if 0 < width <= roll_width]
    per_run_best = tuple(
        min(options, key=lambda width, run=run: _run_rank(lay_run_strips(
            walls, run.wall_indices, run.corners, roll_width, allowances, minimums,
            first_strip_width=width,
        )))
        for run in runs
    )
    combinations = list(dict.fromkeys(
        [per_run_best] + [tuple(width for _ in runs) for width in options]
    ))

    candidates = []
    for first_widths in combinations:
        strips, notes, narrowest = lay(first_widths)
        plan = _plan_strips(request, strips, allowances)
        candidates.append((first_widths, strips, notes, narrowest, plan))
    candidates.sort(key=lambda item: (bool(item[2]), item[4]["rolls_needed"], -item[3], item[4]["candidate_waste"]))

    start_candidates = [
        {
            "wall_index": start_wall,
            "direction": request.start.direction if request.start else "clockwise",
            "offset": request.start.offset if request.start else 0,
            "first_strip_widths": list(first_widths),
            "rolls_needed": plan["rolls_needed"],
            "waste": plan["candidate_waste"],
            "narrowest_strip": narrowest,
            "feasible": not notes,
            "seam_notes": notes,
        }
        for first_widths, _, notes, narrowest, plan in candidates
    ]
    selected = candidates[0][4]
    selected.pop("candidate_waste")
    return selected | {
        "warnings": warnings,
        "errors": [],
        "start_candidates": start_candidates,
        "corners": [corner.model_dump(mode="json") for corner in request.room.corners],
    }


def _default_start(room: Room) -> int:
    """Start a closed room after an inside corner so no seam lands on an edge."""
    if not room.closed:
        return 0
    for index in range(len(room.walls)):
        if room.corners[index - 1].kind == "inside" and not room.walls[index].skip:
            return index
    return 0


def _run_rank(layout) -> tuple:
    precut_area = sum(strip.precut_width * strip.precut_length for strip in layout.strips)
    return (bool(layout.notes), len(layout.strips), -layout.narrowest, precut_area)


def _plan_strips(request: WallpaperPlanRequest, strips: list[ConnectedStrip], allowances) -> dict:
    walls = request.room.walls
    datum = pattern_datum(walls, request.anchor)
    cutouts = {index: wall.cutouts for index, wall in enumerate(walls)}
    allowances_by_wall = dict(enumerate(allowances))
    phased = []
    pieces = []
    offcuts = []
    for strip in strips:
        strip = replace(strip, phase=strip_phase(
            strip, repeat=request.wallpaper.repeat, match=request.wallpaper.match, datum=datum,
        ))
        phased.append(strip)
        split = split_strip_into_pieces(strip, cutouts, strip.phase, allowances_by_wall)
        pieces.extend(split.pieces)
        offcuts.extend(split.offcuts)

    # One physical piece is allocated once, however many wall faces it covers.
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
    covered_area = sum(
        segment.width * segment.top_height for strip in phased for segment in strip.segments
    )
    roll_area = request.wallpaper.roll_width * request.wallpaper.roll_length
    return {
        "rolls_needed": rolls_needed,
        "rolls_to_buy": ceil(rolls_needed * (1 + request.safety_margin_percent / 100)),
        "area_estimate_rolls": ceil(covered_area / roll_area) if roll_area else 0,
        "waste": {
            "pattern": sum(cut.alignment_gap for roll in rolls for cut in roll.cuts),
            # Allowance is deliberately cut material at the top and bottom of
            # every strip, whether or not an opening later splits that strip.
            "allowance": sum(strip.precut_length - strip.top_height for strip in phased),
            "trim": sum(offcut.length for offcut in offcuts),
            "offcut": sum(request.wallpaper.roll_length - roll.cursor for roll in rolls),
        },
        "candidate_waste": total_roll_length - sum(piece.length for piece in pieces),
        "strips": [_serialize_strip(strip) for strip in phased],
        "pieces": [
            asdict(piece) | {"id": f"piece-{index + 1}", "length": piece.length}
            for index, piece in enumerate(pieces)
        ],
        "offcuts": [asdict(offcut) | {"length": offcut.length} for offcut in offcuts],
        "rolls": [
            {
                "number": roll.number,
                "cuts": [asdict(cut) for cut in roll.cuts],
                "offcut_length": request.wallpaper.roll_length - roll.cursor,
            }
            for roll in rolls
        ],
    }


def _serialize_strip(strip: ConnectedStrip) -> dict:
    return asdict(strip) | {
        "wall_index": strip.wall_index,
        "x_start": strip.x_start,
        "x_end": strip.x_end,
        "top_height": strip.top_height,
        "bottom_height": strip.bottom_height,
        "width": strip.width,
        "segments": [
            asdict(segment) | {"width": segment.width} for segment in strip.segments
        ],
    }
