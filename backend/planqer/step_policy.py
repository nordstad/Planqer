"""Pure STEP measured-body classification and cutlist grouping policy."""

from dataclasses import dataclass
from enum import Enum
from typing import Protocol

from planqer.cad_policy import is_sheet


class MeasuredBody(Protocol):
    name: str
    length: float
    width: float
    thickness: float
    quantity: int
    volume: float
    material: str | None
    assembly_path: str | None
    cad_id: str | None


class StepComponentType(Enum):
    BOARD = "board"
    SHEET = "sheet"
    ASSEMBLY = "assembly"


@dataclass
class StepCutListItem:
    type: StepComponentType
    length: float
    width: float
    thickness: float
    quantity: int
    name: str
    volume: float
    material: str | None = None
    assembly_path: str | None = None
    cad_id: str | None = None

    def to_dict(self) -> dict:
        return {
            "type": self.type.value,
            "length": self.length,
            "width": self.width,
            "thickness": self.thickness,
            "quantity": self.quantity,
            "name": self.name,
            "volume": self.volume,
            "material": self.material,
            "assembly_path": self.assembly_path,
            "cad_id": self.cad_id,
        }


def measured_bodies_to_cutlist(
    bodies: list[MeasuredBody], round_precision: int = 1
) -> list[StepCutListItem]:
    """Classify and group reader measurements without file or HTTP concerns."""
    grouped: dict[tuple, dict] = {}

    def rounded(value: float) -> float:
        return round(value, round_precision)

    for body in bodies:
        length = rounded(body.length)
        width = rounded(body.width)
        thickness = rounded(body.thickness)
        if max(length, width, thickness) < 1.0 or thickness <= 0.5:
            continue

        component_type = (
            StepComponentType.SHEET
            if is_sheet(length, width, thickness)
            else StepComponentType.BOARD
        )
        key = (component_type, length, width, thickness, body.material or "")
        if key in grouped:
            grouped[key]["quantity"] += body.quantity
            grouped[key]["names"].append(body.name)
        else:
            grouped[key] = {
                "type": component_type,
                "length": length,
                "width": width,
                "thickness": thickness,
                "quantity": body.quantity,
                "name": body.name,
                "names": [body.name],
                "volume": rounded(body.volume),
                "material": body.material,
                "assembly_path": body.assembly_path,
                "cad_id": body.cad_id,
            }

    items = []
    for data in grouped.values():
        names = dict.fromkeys(data["names"])
        name = data["name"]
        if len(names) > 1:
            name = f"{next(iter(names))} (and {len(names) - 1} more)"
        items.append(
            StepCutListItem(
                type=data["type"],
                length=data["length"],
                width=data["width"],
                thickness=data["thickness"],
                quantity=data["quantity"],
                name=name,
                volume=data["volume"],
                material=data["material"],
                assembly_path=data["assembly_path"],
                cad_id=data["cad_id"],
            )
        )

    items.sort(
        key=lambda item: (
            item.type.value,
            item.material or "",
            -item.length,
            -item.width,
        )
    )
    return items
