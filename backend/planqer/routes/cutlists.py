import time

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.requests import Request

from planqer.auth import get_current_user
from planqer.schemas import (
    CutListItemResponse,
    StepCutListItemResponse,
    StepCutlistResponse,
    ThreeDCutlistResponse,
)
from planqer.validation import sanitize_project_name

router = APIRouter(tags=["3D Model Cutlist", "STEP Model Cutlist"])
from .common import limiter

VALID_UNITS = {"mm", "cm", "m", "in", "inch", "inches", "ft", "feet"}


def _validate(units, precision):
    if units.lower() not in VALID_UNITS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid units '{units}'. Valid options: {', '.join(VALID_UNITS)}",
        )
    if not 0 <= precision <= 3:
        raise HTTPException(
            status_code=400,
            detail="Round precision must be between 0 and 3 decimal places",
        )


@router.post("/3d-cutlist", response_model=ThreeDCutlistResponse)
@limiter.limit("5/minute")
async def create_3d_cutlist(
    request: Request,
    file: UploadFile = File(...),
    units: str = Form("mm"),
    round_precision: int = Form(1),
    project_name: str = Form(None),
    current_user=Depends(get_current_user),
):
    _validate(units, round_precision)
    project_name = sanitize_project_name(project_name) if project_name else None
    started = time.time()
    try:
        from planqer import api

        items, parts = await api.process_uploaded_stl(
            file=file,
            units=units,
            round_precision=round_precision,
            project_name=project_name,
        )

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
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"3D cutlist processing failed: {exc!s}"
        )


@router.post("/step-cutlist", response_model=StepCutlistResponse)
@limiter.limit("3/minute")
async def create_step_cutlist(
    request: Request,
    file: UploadFile = File(...),
    units: str = Form("mm"),
    round_precision: int = Form(1),
    project_name: str = Form(None),
    current_user=Depends(get_current_user),
):
    _validate(units, round_precision)
    project_name = sanitize_project_name(project_name) if project_name else None
    started = time.time()
    try:
        from planqer.step_cutlist import process_uploaded_step

        items, parts = await process_uploaded_step(
            file=file,
            units=units,
            round_precision=round_precision,
            project_name=project_name,
        )

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
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"STEP cutlist processing failed: {exc!s}"
        )
