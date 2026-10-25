from dataclasses import asdict, replace
from math import ceil

from planqer.schemas.wallpaper import Room, WallpaperPlanRequest
from planqer.wallpaper.closure import room_closure
from planqer.wallpaper.pattern import pattern_datum, strip_phase
from planqer.wallpaper.pieces import split_strip_into_pieces
from planqer.wallpaper.rolls import RollPiece, assign_pieces_to_rolls
from planqer.wallpaper.strips import ConnectedRun, ConnectedStrip, connected_runs, lay_run_strips
from planqer.wallpaper.validation import validate_wallpaper_request

# Complete room plans are compared for a handful of first-strip widths, but each
# connected run searches its own first-strip width in much finer steps, because
# that one cut decides where every seam, and so every corner piece, falls.
_FIRST_WIDTH_STEPS = 8
_FINE_WIDTH_STEP = 5


def create_wallpaper_plan(request: WallpaperPlanRequest) -> dict:
    """Create a conservative, phase-aware plan for the measured room."""
    warnings = validate_wallpaper_request(request)
    walls = request.room.walls
    roll_width = request.wallpaper.roll_width
    allowances = [wall.allowances or request.allowances for wall in walls]
    minimums = [wall.minimum_strip_width or request.minimum_strip_width for wall in walls]
    start_wall = request.start.wall_index if request.start else _default_start(request.room)
    runs, room_notes = connected_runs(request.room, start_wall)

    minimum_corner = request.minimum_corner_piece

    def lay(first_widths: tuple[float, ...]) -> tuple[list[ConnectedStrip], list[str], float, float]:
        strips, notes, narrowest = [], list(room_notes), float("inf")
        narrowest_corner = float("inf")
        for run, first_width in zip(runs, first_widths):
            layout = lay_run_strips(
                walls, run.wall_indices, run.corners, roll_width, allowances, minimums,
                first_strip_width=first_width, start_number=len(strips) + 1,
                **_end_overlap(run, allowances),
            )
            strips.extend(layout.strips)
            notes.extend(layout.notes)
            narrowest = min(narrowest, layout.narrowest)
            narrowest_corner = min(narrowest_corner, layout.narrowest_corner)
        return strips, notes, 0 if narrowest == float("inf") else narrowest, narrowest_corner

    options = sorted(
        {round(roll_width * step / _FIRST_WIDTH_STEPS) for step in range(1, _FIRST_WIDTH_STEPS + 1)}
        | {roll_width},
        reverse=True,
    )
    options = [width for width in options if 0 < width <= roll_width]
    fine_options = sorted(
        {*range(_FINE_WIDTH_STEP, int(roll_width), _FINE_WIDTH_STEP), *options}, reverse=True
    )
    per_run_best = tuple(
        min(fine_options, key=lambda width, run=run: _run_rank(lay_run_strips(
            walls, run.wall_indices, run.corners, roll_width, allowances, minimums,
            first_strip_width=width, **_end_overlap(run, allowances),
        ), minimum_corner))
        for run in runs
    )
    preferred = request.start.first_strip_width if request.start else None
    combinations = list(dict.fromkeys(
        [per_run_best] + [tuple(width for _ in runs) for width in options]
        + ([tuple(preferred for _ in runs)] if preferred and preferred <= roll_width else [])
    ))

    candidates = []
    for first_widths in combinations:
        strips, notes, narrowest, narrowest_corner = lay(first_widths)
        plan = _plan_strips(request, strips, allowances)
        candidates.append((first_widths, strips, notes, narrowest, plan, narrowest_corner))
    candidates.sort(key=lambda item: (
        # A width the user asked for wins over the automatic ranking.
        bool(preferred) and not all(width == preferred for width in item[0]),
        bool(item[2]),
        _corner_shortfall(item[5], minimum_corner),
        item[4]["rolls_needed"],
        -item[5],
        -item[3],
        item[4]["candidate_waste"],
    ))
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
        for first_widths, _, notes, narrowest, plan, _ in candidates
    ]
    selected = candidates[0][4]
    selected.pop("candidate_waste")
    warnings = warnings + _corner_piece_warnings(
        candidates[0][1], walls, minimum_corner
    )
    closure = room_closure(request.room)
    return selected | {
        "warnings": warnings,
        "errors": [closure.message] if closure and not closure.valid else [],
        "closure": closure.as_dict() if closure else None,
        "corner_quality": corner_quality(candidates[0][1], walls, minimum_corner),
        "start_candidates": start_candidates,
        "corners": [corner.model_dump(mode="json") for corner in request.room.corners],
    }


def _end_overlap(run: ConnectedRun, allowances) -> dict:
    """The corner allowance a run's final strip wraps onto the next wall, if any."""
    if run.overlap_wall is None:
        return {}
    return {
        "end_overlap": allowances[run.wall_indices[-1]].corner,
        "end_overlap_wall": run.overlap_wall,
    }


def _default_start(room: Room) -> int:
    """Start a closed room after an inside corner so no seam lands on an edge."""
    if not room.closed:
        return 0
    for index in range(len(room.walls)):
        if room.corners[index - 1].kind == "inside" and not room.walls[index].skip:
            return index
    return 0


def _corner_shortfall(narrowest_corner: float, minimum: float) -> float:
    return max(0.0, minimum - narrowest_corner)


def corner_quality(strips, walls, minimum: float) -> dict:
    """Summarise the pieces either side of every corner a strip is carried round."""
    smallest = None
    short = []
    for strip in strips:
        for before, after in zip(strip.segments, strip.segments[1:]):
            width = min(before.width, after.width)
            smallest = width if smallest is None else min(smallest, width)
            if width < minimum:
                first, second = walls[before.wall_index].name, walls[after.wall_index].name
                short.append({
                    "strip": strip.number,
                    "from_wall": first,
                    "to_wall": second,
                    "width": width,
                    "action": f"Start a new strip at the corner between '{first}' and '{second}'.",
                })
    return {"minimum": minimum, "smallest": smallest, "short_corners": short}


def _corner_piece_warnings(strips, walls, minimum: float) -> list[str]:
    return [
        f"Strip {strip.number} leaves only {segment.width:g} mm on wall "
        f"'{walls[segment.wall_index].name}' at a corner, below the {minimum:g} mm "
        "minimum, and no first-strip width avoids it. Consider choosing to start a "
        "new strip at this corner."
        for strip in strips if len(strip.segments) > 1
        for segment in strip.segments if segment.width < minimum
    ]


def _run_rank(layout, minimum_corner: float) -> tuple:
    precut_area = sum(strip.precut_width * strip.precut_length for strip in layout.strips)
    return (
        bool(layout.notes),
        _corner_shortfall(layout.narrowest_corner, minimum_corner),
        len(layout.strips),
        -layout.narrowest_corner,
        -layout.narrowest,
        precut_area,
    )


def _plan_strips(request: WallpaperPlanRequest, strips: list[ConnectedStrip], allowances) -> dict:
    walls = request.room.walls
    datum = pattern_datum(walls, request.anchor)
    cutouts = {index: wall.cutouts for index, wall in enumerate(walls)}
    allowances_by_wall = dict(enumerate(allowances))
    phased = []
    pieces = []
    piece_trims = []
    offcuts = []
    for strip in strips:
        strip = replace(strip, phase=strip_phase(
            strip, repeat=request.wallpaper.repeat, match=request.wallpaper.match, datum=datum,
        ))
        phased.append(strip)
        split = split_strip_into_pieces(strip, cutouts, strip.phase, allowances_by_wall)
        # The motif must line up at wall height, so a piece starting below the
        # ceiling needs the phase of its own top edge, not the strip's.
        strip_pieces = [
            replace(piece, phase=_phase_at(strip, piece.y_end, request.wallpaper.repeat))
            for piece in split.pieces
        ]
        pieces.extend(strip_pieces)
        piece_trims.extend(_piece_trims(strip, piece, request.wallpaper.repeat) for piece in strip_pieces)
        offcuts.extend(split.offcuts)

    # One physical piece is allocated once, however many wall faces it covers.
    roll_pieces = [
        RollPiece(f"piece-{index + 1}", trim["cut_length"], trim["phase"])
        for index, (piece, trim) in enumerate(zip(pieces, piece_trims))
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
            # Unused length between cuts after offcut reuse: a gap later refilled by
            # another piece is no longer lost.
            "pattern": sum(_unused_gaps(roll) for roll in rolls),
            # Allowance is deliberately cut material at the top and bottom of
            # every strip, whether or not an opening later splits that strip.
            "allowance": sum(strip.precut_length - strip.top_height for strip in phased),
            "trim": sum(offcut.length for offcut in offcuts),
            "offcut": sum(request.wallpaper.roll_length - roll.cursor for roll in rolls),
        },
        "material": _material_summary(rolls, request.wallpaper.roll_length, request.wallpaper.repeat),
        "candidate_waste": total_roll_length - sum(trim["cut_length"] for trim in piece_trims),
        "strips": [_serialize_strip(strip) for strip in phased],
        "pieces": [
            asdict(piece) | {
                "id": f"piece-{index + 1}", "length": piece.length,
                "allowance_top": trim["allowance_top"], "allowance_bottom": trim["allowance_bottom"],
                "cut_length": trim["cut_length"],
                "cut_phase": trim["phase"],
            }
            for index, (piece, trim) in enumerate(zip(pieces, piece_trims))
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


def _roll_gaps(roll) -> list[float]:
    cuts = sorted(roll.cuts, key=lambda cut: cut.start)
    previous_end = [0, *(cut.end for cut in cuts)]
    return [cut.start - end for cut, end in zip(cuts, previous_end)]


def _unused_gaps(roll) -> float:
    return sum(_roll_gaps(roll))


def _material_summary(rolls, roll_length: float, repeat: float = 0) -> dict:
    """What the user actually buys, uses and can still use from leftovers."""
    bought = len(rolls) * roll_length
    cuts = [cut for roll in rolls for cut in roll.cuts]
    reused = [cut for cut in cuts if cut.source_kind == "offcut"]
    leftovers = [gap for roll in rolls for gap in [*_roll_gaps(roll), roll_length - roll.cursor]]
    # Pieces shorter than the longest one (for example the band above a heat pump)
    # that follow another cut on their roll use length that would otherwise be waste.
    longest = max((cut.end - cut.start for cut in cuts), default=0)
    short = [
        cut for roll in rolls
        for cut in sorted(roll.cuts, key=lambda item: item.start)[1:]
        if cut.end - cut.start < longest
    ]
    return {
        "bought_length": bought,
        "used_length": sum(cut.end - cut.start for cut in cuts),
        "offcuts_reused_count": len(reused),
        "offcuts_reused_length": sum(cut.end - cut.start for cut in reused),
        "fit": _roll_fit(cuts, roll_length, repeat, longest),
        "short_pieces_count": len(short),
        "short_pieces_length": sum(cut.end - cut.start for cut in short),
        "largest_leftover": max(leftovers, default=0),
    }


def _roll_fit(cuts, roll_length: float, repeat: float, longest: float) -> dict | None:
    """How many full-length pieces fit on one roll, and what one more would need."""
    full = sum(1 for cut in cuts if cut.end - cut.start >= longest - 1e-6)
    if longest <= 0 or longest > roll_length:
        return None
    step = longest if repeat <= 0 else ceil(longest / repeat) * repeat
    per_roll = int((roll_length - longest) // step) + 1
    needed = per_roll * step + longest
    return {
        "longest_piece": longest,
        "full_pieces": full,
        "pieces_per_roll": per_roll,
        "length_for_next": needed,
        "shortfall": needed - roll_length,
    }


def _phase_at(strip: ConnectedStrip, height: float, repeat: float) -> float:
    return (strip.phase + (strip.top_height - height)) % repeat if repeat else 0


def _piece_trims(strip: ConnectedStrip, piece, repeat: float) -> dict:
    """What is cut from the roll for a piece: its hanging height plus trim at a ceiling or floor end.

    The pattern phase belongs to the top edge of the paper, so trim above the ceiling shifts it.
    """
    top = strip.allowance_top if piece.y_end >= strip.top_height - 0.5 else 0
    bottom = strip.allowance_bottom if piece.y_start <= strip.bottom_height + 0.5 else 0
    return {
        "allowance_top": top,
        "allowance_bottom": bottom,
        "cut_length": piece.length + top + bottom,
        "phase": (piece.phase - top) % repeat if repeat else piece.phase,
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
