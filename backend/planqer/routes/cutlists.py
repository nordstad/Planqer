import time

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.requests import Request

from planqer.auth import get_current_user
from planqer.cutlist_services import (
    build_3d_cutlist_response,
    build_step_cutlist_response,
    validate_cutlist_options,
)
from planqer.errors import PlanqerError
from planqer.schemas import StepCutlistResponse, ThreeDCutlistResponse
from planqer.step_cutlist import process_uploaded_step
from planqer.threed_cutlist import process_uploaded_stl
from planqer.validation import sanitize_project_name

router = APIRouter(tags=["3D Model Cutlist", "STEP Model Cutlist"])
from .common import limiter


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
    validate_cutlist_options(units, round_precision)
    project_name = sanitize_project_name(project_name) if project_name else None
    started = time.time()
    try:
        items, parts = await process_uploaded_stl(
            file=file,
            units=units,
            round_precision=round_precision,
            project_name=project_name,
        )
        return build_3d_cutlist_response(
            items, parts, project_name=project_name, units=units, started=started
        )
    except (HTTPException, PlanqerError):
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
    validate_cutlist_options(units, round_precision)
    project_name = sanitize_project_name(project_name) if project_name else None
    started = time.time()
    try:
        items, parts = await process_uploaded_step(
            file=file,
            units=units,
            round_precision=round_precision,
            project_name=project_name,
        )
        return build_step_cutlist_response(
            items, parts, project_name=project_name, units=units, started=started
        )
    except (HTTPException, PlanqerError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"STEP cutlist processing failed: {exc!s}"
        )
