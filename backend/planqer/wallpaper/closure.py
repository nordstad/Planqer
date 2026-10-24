from dataclasses import dataclass

from planqer.schemas.wallpaper import Room

# Tape-measure error on a real wall is a few millimetres, so a gap this small
# is treated as a closed room.
CLOSURE_TOLERANCE_MM = 10.0


@dataclass(frozen=True)
class RoomClosure:
    valid: bool
    gap: float
    message: str | None = None

    def as_dict(self) -> dict:
        return {"valid": self.valid, "gap": self.gap, "message": self.message}


def room_closure(room: Room) -> RoomClosure | None:
    """Check that a closed room's walls meet end to end.

    Mirrors the room overview: walls are walked in entry order with square
    corners, an inside corner turning right and an outside corner turning left.
    Only plan-view wall widths are used; slope and wall thickness are ignored.
    """
    if not room.closed:
        return None
    x, y = 0.0, 0.0
    heading = (1, 0)
    right_turns = 0
    for wall, corner in zip(room.walls, room.corners):
        length = max(wall.width_top, wall.width_middle, wall.width_bottom)
        x, y = x + heading[0] * length, y + heading[1] * length
        if corner.kind == "inside":
            heading, right_turns = (-heading[1], heading[0]), right_turns + 1
        else:
            heading, right_turns = (heading[1], -heading[0]), right_turns - 1
    gap = (x * x + y * y) ** 0.5
    if right_turns != 4:
        return RoomClosure(
            False,
            gap,
            "The corners do not turn through a full circle, so these walls "
            "cannot form a closed room. Check the inside and outside corners.",
        )
    if gap > CLOSURE_TOLERANCE_MM:
        return RoomClosure(
            False,
            gap,
            f"The walls leave a {gap:g} mm gap where the last wall should meet "
            "the first. Check the wall measurements before ordering.",
        )
    return RoomClosure(True, gap)
