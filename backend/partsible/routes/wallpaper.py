from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from partsible.schemas.wallpaper import WallpaperPlanRequest
from partsible.wallpaper.plan import create_wallpaper_plan

from .common import limiter

router = APIRouter(prefix="/wallpaper-plans", tags=["Wallpaper"])


@router.post("")
@limiter.limit("10/minute")
async def create_wallpaper_plan_route(
    request: Request, wallpaper_request: WallpaperPlanRequest
):
    try:
        return create_wallpaper_plan(wallpaper_request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
