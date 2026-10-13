import time

from planqer.errors import PlanqerError
from planqer.schemas import (
    CutListItemResponse,
    StepCutListItemResponse,
    StepCutlistResponse,
    ThreeDCutlistResponse,
)
from planqer.step_cutlist import process_step_bytes
from planqer.threed_cutlist import process_stl_bytes
from planqer.validation import sanitize_project_name

VALID_UNITS = {"mm", "cm", "m", "in", "inch", "inches", "ft", "feet"}


def validate_cutlist_options(units, precision):
    if units.lower() not in VALID_UNITS:
        raise PlanqerError(
            status_code=400,
            detail=f"Invalid units '{units}'. Valid options: {', '.join(VALID_UNITS)}",
        )
    if not 0 <= precision <= 3:
        raise PlanqerError(
            status_code=400,
            detail="Round precision must be between 0 and 3 decimal places",
        )


def build_3d_cutlist_response(items, parts, *, project_name, units, started):
    def make(item):
        return CutListItemResponse(
            type=item.type.value,
            length=item.length,
            width=item.width,
            thickness=item.thickness,
            quantity=item.quantity,
            name=item.name,
            volume=item.volume,
        )

    all_items = [make(i) for i in items]
    boards = [i for i in all_items if i.type == "board"]
    sheets = [i for i in all_items if i.type == "sheet"]
    return ThreeDCutlistResponse(
        cutlist_items=all_items,
        total_items=len(all_items),
        total_volume=sum(i.volume for i in items),
        project_name=project_name,
        units=units,
        processing_time=time.time() - started,
        boards=boards,
        sheets=sheets,
        planqer_parts=parts or None,
        board_count=len(boards),
        sheet_count=len(sheets),
    )


def build_step_cutlist_response(items, parts, *, project_name, units, started):
    def make(i):
        return StepCutListItemResponse(
            type=i.type.value,
            length=i.length,
            width=i.width,
            thickness=i.thickness,
            quantity=i.quantity,
            name=i.name,
            volume=i.volume,
            material=i.material,
            assembly_path=i.assembly_path,
            cad_id=i.cad_id,
        )

    all_items = [make(i) for i in items]
    boards = [i for i in all_items if i.type == "board"]
    sheets = [i for i in all_items if i.type == "sheet"]
    structure = {}
    for item in items:
        current = structure
        if item.assembly_path:
            for part in item.assembly_path.split("/"):
                current = current.setdefault(part, {})
    return StepCutlistResponse(
        cutlist_items=all_items,
        total_items=len(all_items),
        total_volume=sum(i.volume for i in items),
        project_name=project_name,
        units=units,
        processing_time=time.time() - started,
        boards=boards,
        sheets=sheets,
        planqer_parts=parts or None,
        board_count=len(boards),
        sheet_count=len(sheets),
        materials_used=list(
            {i.material for i in items if i.material and i.material != "Unknown"}
        ),
        assembly_structure=structure,
    )


def run_cutlist_3d(
    data: bytes,
    filename: str | None,
    units: str = "mm",
    round_precision: int = 1,
    project_name: str | None = None,
) -> ThreeDCutlistResponse:
    """Turn the contents of an STL file into a cutlist; shared by the API and the browser."""
    validate_cutlist_options(units, round_precision)
    project_name = sanitize_project_name(project_name) if project_name else None
    started = time.time()
    items, parts = process_stl_bytes(
        data, filename, units, round_precision, project_name
    )
    return build_3d_cutlist_response(
        items, parts, project_name=project_name, units=units, started=started
    )


def run_cutlist_step(
    data: bytes,
    filename: str | None,
    units: str = "mm",
    round_precision: int = 1,
    project_name: str | None = None,
) -> StepCutlistResponse:
    """Turn the contents of a STEP file into a cutlist; shared by the API and the browser."""
    validate_cutlist_options(units, round_precision)
    project_name = sanitize_project_name(project_name) if project_name else None
    started = time.time()
    items, parts = process_step_bytes(
        data, filename, units, round_precision, project_name
    )
    return build_step_cutlist_response(
        items, parts, project_name=project_name, units=units, started=started
    )
