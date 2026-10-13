from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from planqer.schemas import TileLayoutRequest, TileLayoutResponse
from planqer.tile_services import run_tile_layout

router = APIRouter(prefix="/tile-layout", tags=["Tile Layout"])
from .common import limiter


@router.post(
    "",
    response_model=TileLayoutResponse,
    summary="Generate ranked tile/surface layout candidates",
)
@limiter.limit("10/minute")
async def create_tile_layout(request: Request, tile_request: TileLayoutRequest):
    try:
        return run_tile_layout(tile_request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Tile layout failed: {exc!s}")
