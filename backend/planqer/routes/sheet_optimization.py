import asyncio

from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from planqer.errors import PlanqerError
from planqer.schemas import SheetOptimizationRequest, SheetOptimizationResponse
from planqer.sheet_services import run_sheet_optimization

router = APIRouter(prefix="/sheet-optimization", tags=["Sheet Material Optimization"])
from .common import limiter

OPTIMIZATION_TIMEOUT_SECONDS = 30.0


@router.post(
    "",
    response_model=SheetOptimizationResponse,
    summary="Generate optimal cutting plan for sheet materials",
)
@limiter.limit("10/minute")
async def create_sheet_optimization(
    request: Request, sheet_request: SheetOptimizationRequest
):
    try:
        # A timed-out worker thread may finish in the background; input budgets
        # keep that bounded while preventing it from blocking this event loop.
        return await asyncio.wait_for(
            asyncio.to_thread(run_sheet_optimization, sheet_request),
            timeout=OPTIMIZATION_TIMEOUT_SECONDS,
        )
    except TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail="Sheet optimization exceeded the 30 second time limit",
        ) from exc
    except (HTTPException, PlanqerError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Sheet optimization failed: {exc!s}"
        )
