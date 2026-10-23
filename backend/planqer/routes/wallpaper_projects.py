"""Owner-scoped storage for wallpaper specifications and room plans."""

import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.auth import get_current_user
from planqer.database import User, UserWallpaper, UserWallpaperProject, get_session
from planqer.routes.project_groups import _get_owned_group
from planqer.saved_project_adapters import load_saved_json
from planqer.schemas.saved import (
    UpdateWallpaperProjectRequest,
    WallpaperProjectRequest,
    WallpaperRequest,
)

wallpapers_router = APIRouter(prefix="/wallpapers", tags=["user-wallpapers"])
projects_router = APIRouter(prefix="/wallpaper-projects", tags=["user-wallpaper-projects"])


class WallpaperResponse(BaseModel):
    id: UUID
    name: str
    data: dict


class WallpaperProjectResponse(BaseModel):
    id: UUID
    project_group_id: UUID | None
    name: str
    wallpaper_data: dict
    room_data: dict
    options_data: dict
    plan_result: dict | None
    ordered_rolls: int | None
    progress_data: dict
    created_at: str
    updated_at: str


def _wallpaper_response(item: UserWallpaper) -> WallpaperResponse:
    return WallpaperResponse(id=item.id, name=item.name, data=load_saved_json(item.data, field="wallpaper", default={}, expected=dict))


def _project_response(item: UserWallpaperProject) -> WallpaperProjectResponse:
    return WallpaperProjectResponse(
        id=item.id, project_group_id=item.project_group_id, name=item.name,
        wallpaper_data=load_saved_json(item.wallpaper_data, field="wallpaper", default={}, expected=dict),
        room_data=load_saved_json(item.room_data, field="wallpaper room", default={}, expected=dict),
        options_data=load_saved_json(item.options_data, field="wallpaper options", default={}, expected=dict),
        plan_result=load_saved_json(item.plan_result, field="wallpaper plan", default=None, expected=dict),
        ordered_rolls=item.ordered_rolls,
        progress_data=load_saved_json(item.progress_data, field="wallpaper progress", default={}, expected=dict),
        created_at=item.created_at.isoformat(),
        updated_at=item.updated_at.isoformat(),
    )


async def _owned(model, item_id: UUID, user: User, session: AsyncSession, label: str):
    item = (await session.execute(select(model).where(model.id == item_id, model.user_id == user.id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not found")
    return item


@wallpapers_router.get("/", response_model=list[WallpaperResponse])
async def list_wallpapers(current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    items = (await session.execute(select(UserWallpaper).where(UserWallpaper.user_id == current_user.id).order_by(UserWallpaper.updated_at.desc()))).scalars().all()
    return [_wallpaper_response(item) for item in items]


@wallpapers_router.post("/", response_model=WallpaperResponse)
async def create_wallpaper(data: WallpaperRequest, current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    item = UserWallpaper(user_id=current_user.id, name=data.name, data=json.dumps(data.data))
    session.add(item); await session.commit(); await session.refresh(item)
    return _wallpaper_response(item)


@wallpapers_router.put("/{item_id}", response_model=WallpaperResponse)
async def update_wallpaper(item_id: UUID, data: WallpaperRequest, current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    item = await _owned(UserWallpaper, item_id, current_user, session, "Wallpaper")
    item.name, item.data, item.updated_at = data.name, json.dumps(data.data), datetime.now()
    await session.commit(); await session.refresh(item)
    return _wallpaper_response(item)


@wallpapers_router.delete("/{item_id}")
async def delete_wallpaper(item_id: UUID, current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    await session.delete(await _owned(UserWallpaper, item_id, current_user, session, "Wallpaper")); await session.commit()
    return {"message": "Wallpaper deleted successfully"}


@projects_router.get("/", response_model=list[WallpaperProjectResponse])
async def list_projects(current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    items = (await session.execute(select(UserWallpaperProject).where(UserWallpaperProject.user_id == current_user.id).order_by(UserWallpaperProject.updated_at.desc()))).scalars().all()
    return [_project_response(item) for item in items]


@projects_router.post("/", response_model=WallpaperProjectResponse)
async def create_project(data: WallpaperProjectRequest, current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    if data.project_group_id: await _get_owned_group(data.project_group_id, current_user, session)
    item = UserWallpaperProject(user_id=current_user.id, **{key: json.dumps(value) if key in {"wallpaper_data", "room_data", "options_data", "plan_result", "progress_data"} and value is not None else value for key, value in data.model_dump().items()})
    session.add(item); await session.commit(); await session.refresh(item)
    return _project_response(item)


@projects_router.get("/{item_id}", response_model=WallpaperProjectResponse)
async def get_project(item_id: UUID, current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    return _project_response(await _owned(UserWallpaperProject, item_id, current_user, session, "Wallpaper project"))


@projects_router.put("/{item_id}", response_model=WallpaperProjectResponse)
async def update_project(item_id: UUID, data: UpdateWallpaperProjectRequest, current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    item = await _owned(UserWallpaperProject, item_id, current_user, session, "Wallpaper project")
    if data.project_group_id: await _get_owned_group(data.project_group_id, current_user, session)
    for key, value in data.model_dump(include=data.model_fields_set).items():
        setattr(item, key, json.dumps(value) if key in {"wallpaper_data", "room_data", "options_data", "plan_result", "progress_data"} and value is not None else value)
    item.updated_at = datetime.now(); await session.commit(); await session.refresh(item)
    return _project_response(item)


@projects_router.delete("/{item_id}")
async def delete_project(item_id: UUID, current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    await session.delete(await _owned(UserWallpaperProject, item_id, current_user, session, "Wallpaper project")); await session.commit()
    return {"message": "Wallpaper project deleted successfully"}
