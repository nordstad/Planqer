"""
STEP cutlist processing for Planqer.

Turns a STEP/STP file into a cutlist: one line per distinct part, with the real
component names, materials and assembly paths the CAD tool wrote into the file.

The geometry and metadata come from planqer.step_reader, a plain ISO 10303-21
reader with no native dependency. What used to sit here instead was a stub that
never opened the file and returned the same seven invented "Bench" components
for any upload — see step_reader's own note.

Classification is the STL path's rule, imported rather than re-stated: the same
model exported both ways must produce the same cutlist.
"""

import logging
import os
import tempfile
from dataclasses import dataclass
from enum import Enum

from fastapi import HTTPException, UploadFile
from planqer.step_reader import StepParseError, read_step_file
from planqer.threed_cutlist import is_sheet

logger = logging.getLogger("planqer.step_cutlist")

# STEP is verbose text and the reader is pure Python, so size is time. The
# endpoint is rate limited to 3/minute for the same reason.
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

# Millimetres per unit, for a file that declares no unit of its own.
UNIT_SCALE = {
    "mm": 1.0,
    "cm": 10.0,
    "m": 1000.0,
    "in": 25.4,
    "inch": 25.4,
    "inches": 25.4,
    "ft": 304.8,
    "feet": 304.8,
}


class StepComponentType(Enum):
    """Component classification for woodworking from STEP files."""

    BOARD = "board"
    SHEET = "sheet"
    ASSEMBLY = "assembly"


@dataclass
class StepCutListItem:
    """One line of the cut list, with the metadata CAD gave it."""

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


class StepProcessor:
    """Reads a STEP file and groups its solids into a cut list."""

    def __init__(self, units: str = "mm", round_precision: int = 1):
        self.units = units
        self.round_precision = round_precision
        # Only a fallback now. The file's own declared unit wins, because a
        # STEP file that says it is in inches is in inches whatever the form said.
        self.unit_scale = UNIT_SCALE.get(units.lower(), 1.0)

    def _round(self, value: float) -> float:
        return round(value, self.round_precision)

    def process_step_file(
        self, file_path: str, project_name: str | None = None
    ) -> list[StepCutListItem]:
        try:
            bodies = read_step_file(file_path, fallback_scale=self.unit_scale)
        except StepParseError as e:
            # The file's own shape is the user's problem to fix, so say what is
            # wrong with it rather than reporting a server fault.
            raise HTTPException(status_code=400, detail=str(e)) from e
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"STEP processing failed: {e}")
            raise HTTPException(
                status_code=500, detail=f"STEP processing failed: {e}"
            ) from e

        grouped: dict[tuple, dict] = {}
        for body in bodies:
            length = self._round(body.length)
            width = self._round(body.width)
            thickness = self._round(body.thickness)

            # Below a millimetre is noise from the export, not something anyone
            # cuts; a zero thickness is broken geometry.
            if max(length, width, thickness) < 1.0 or thickness <= 0.5:
                logger.info(
                    f"Skipping '{body.name}': {length}×{width}×{thickness} mm is not cuttable"
                )
                continue

            component_type = (
                StepComponentType.SHEET
                if is_sheet(length, width, thickness)
                else StepComponentType.BOARD
            )

            # Material joins the key: 18mm birch ply and 18mm MDF are the same
            # rectangle and different purchases.
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
                    "volume": self._round(body.volume),
                    "material": body.material,
                    "assembly_path": body.assembly_path,
                    "cad_id": body.cad_id,
                }

        items = []
        for data in grouped.values():
            names = dict.fromkeys(data["names"])  # distinct, in the order read
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
        logger.info(f"STEP processing completed: {len(items)} distinct components")
        return items

    def convert_to_planqer_parts(
        self, cutlist_items: list[StepCutListItem]
    ) -> dict[str, int]:
        """Board lengths and counts, in the shape the 1D optimizer takes."""
        parts: dict[str, int] = {}
        for item in cutlist_items:
            if item.type == StepComponentType.BOARD:
                key = str(int(item.length))
                parts[key] = parts.get(key, 0) + item.quantity
        return parts


async def process_uploaded_step(
    file: UploadFile,
    units: str = "mm",
    round_precision: int = 1,
    project_name: str | None = None,
) -> tuple[list[StepCutListItem], dict[str, int]]:
    """Read an uploaded STEP file into cutlist items and the 1D parts payload.

    `units` is the fallback for a file that declares no length unit; the file's
    own declaration always wins.
    """
    if not file.filename or not file.filename.lower().endswith((".step", ".stp")):
        raise HTTPException(
            status_code=400,
            detail="File must be a STEP file (.step or .stp extension)",
        )

    if file.size and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File size too large. Maximum {MAX_UPLOAD_BYTES // (1024 * 1024)}MB allowed.",
        )

    temp_fd, temp_path = tempfile.mkstemp(prefix="planqer-step-", suffix=".step")
    try:
        os.chmod(temp_path, 0o600)
        with os.fdopen(temp_fd, "wb") as temp_file:
            temp_file.write(await file.read())
            temp_file.flush()

        processor = StepProcessor(units=units, round_precision=round_precision)
        cutlist_items = processor.process_step_file(temp_path, project_name)
        return cutlist_items, processor.convert_to_planqer_parts(cutlist_items)
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
