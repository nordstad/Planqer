import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.auth import get_current_user
from planqer.database import User, UserTileProject, get_session
from planqer.routes.project_groups import _get_owned_group
from planqer.saved_diagrams import render_saved_tile_layout
from planqer.saved_project_adapters import load_saved_json, update_saved_image

router = APIRouter(prefix="/tile-projects", tags=["user-tile-projects"])


class TileProjectResponse(BaseModel):
    id: UUID
    project_group_id: UUID | None = None
    name: str
    surface_data: dict
    tile_data: dict
    bond_data: dict
    options_data: dict
    layout_result: dict | None = None
    pricing: dict | None = None
    cutlist_image: str | None = None
    has_svg_image: bool = False
    created_at: str
    updated_at: str


class CreateTileProjectRequest(BaseModel):
    """A layout the user has chosen to keep. The diagram is redrawn
    server-side from surface_data + layout_result, so no image comes over
    the wire — same reasoning as CreateSheetProjectRequest."""

    name: str = Field(min_length=1, max_length=200)
    project_group_id: UUID | None = None
    surface_data: dict
    tile_data: dict
    bond_data: dict
    options_data: dict = {}
    layout_result: dict | None = None
    pricing: dict | None = None


class UpdateTileProjectRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    project_group_id: UUID | None = None
    surface_data: dict | None = None
    tile_data: dict | None = None
    bond_data: dict | None = None
    options_data: dict | None = None
    layout_result: dict | None = None
    pricing: dict | None = None


def tile_project_to_response(project: UserTileProject) -> TileProjectResponse:
    return TileProjectResponse(
        id=project.id,
        project_group_id=project.project_group_id,
        name=project.name,
        surface_data=load_saved_json(
            project.surface_data, field="tile surface", default={}, expected=dict
        ),
        tile_data=load_saved_json(
            project.tile_data, field="tile definition", default={}, expected=dict
        ),
        bond_data=load_saved_json(
            project.bond_data, field="tile bond", default={}, expected=dict
        ),
        options_data=load_saved_json(
            project.options_data, field="tile options", default={}, expected=dict
        ),
        layout_result=load_saved_json(
            project.layout_result,
            field="tile layout result",
            default=None,
            expected=dict,
        ),
        pricing=load_saved_json(
            project.pricing, field="tile pricing", default=None, expected=dict
        ),
        cutlist_image=project.cutlist_image,
        has_svg_image=bool(project.cutlist_image_svg),
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
    )


async def _get_owned_tile_project(
    project_id: UUID, current_user: User, session: AsyncSession
) -> UserTileProject:
    stmt = select(UserTileProject).where(
        UserTileProject.id == project_id, UserTileProject.user_id == current_user.id
    )
    result = await session.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tile project not found"
        )
    return project


@router.get("/", response_model=list[TileProjectResponse])
async def get_user_tile_projects(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(UserTileProject)
        .where(UserTileProject.user_id == current_user.id)
        .order_by(UserTileProject.updated_at.desc())
    )
    result = await session.execute(stmt)
    return [tile_project_to_response(project) for project in result.scalars().all()]


@router.post("/", response_model=TileProjectResponse)
async def create_tile_project(
    project_data: CreateTileProjectRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if project_data.project_group_id is not None:
        await _get_owned_group(project_data.project_group_id, current_user, session)

    svg_data_url = render_saved_tile_layout(
        project_data.surface_data, project_data.layout_result, project_data.name
    )

    project = UserTileProject(
        user_id=current_user.id,
        project_group_id=project_data.project_group_id,
        name=project_data.name,
        surface_data=json.dumps(project_data.surface_data),
        tile_data=json.dumps(project_data.tile_data),
        bond_data=json.dumps(project_data.bond_data),
        options_data=json.dumps(project_data.options_data or {}),
        layout_result=json.dumps(project_data.layout_result)
        if project_data.layout_result
        else None,
        pricing=json.dumps(project_data.pricing) if project_data.pricing else None,
        cutlist_image=svg_data_url,
        cutlist_image_svg=svg_data_url,
    )

    session.add(project)
    await session.commit()
    await session.refresh(project)

    return tile_project_to_response(project)


@router.get("/{project_id}", response_model=TileProjectResponse)
async def get_tile_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    project = await _get_owned_tile_project(project_id, current_user, session)
    return tile_project_to_response(project)


@router.put("/{project_id}", response_model=TileProjectResponse)
async def update_tile_project(
    project_id: UUID,
    project_data: UpdateTileProjectRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    project = await _get_owned_tile_project(project_id, current_user, session)

    if project_data.project_group_id is not None:
        await _get_owned_group(project_data.project_group_id, current_user, session)

    if project_data.name is not None:
        project.name = project_data.name
    if "project_group_id" in project_data.model_fields_set:
        project.project_group_id = project_data.project_group_id
    if project_data.surface_data is not None:
        project.surface_data = json.dumps(project_data.surface_data)
    if project_data.tile_data is not None:
        project.tile_data = json.dumps(project_data.tile_data)
    if project_data.bond_data is not None:
        project.bond_data = json.dumps(project_data.bond_data)
    if project_data.options_data is not None:
        project.options_data = json.dumps(project_data.options_data)
    if project_data.layout_result is not None:
        project.layout_result = json.dumps(project_data.layout_result)
    if "pricing" in project_data.model_fields_set:
        project.pricing = (
            json.dumps(project_data.pricing) if project_data.pricing else None
        )

    # A rename or changed layout inputs both change what the diagram should show.
    svg_data_url = render_saved_tile_layout(
        load_saved_json(
            project.surface_data, field="tile surface", default={}, expected=dict
        ),
        load_saved_json(
            project.layout_result,
            field="tile layout result",
            default=None,
            expected=dict,
        ),
        project.name,
    )
    project.cutlist_image = svg_data_url
    project.cutlist_image_svg = svg_data_url

    project.updated_at = datetime.now()

    await session.commit()
    await session.refresh(project)

    return tile_project_to_response(project)


@router.delete("/{project_id}")
async def delete_tile_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    project = await _get_owned_tile_project(project_id, current_user, session)
    await session.delete(project)
    await session.commit()

    return {"message": "Tile project deleted successfully"}


@router.get("/{project_id}/image")
async def get_tile_project_image(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Serve a saved layout's diagram as SVG. See the board equivalent in
    routes/projects.py for why there is no `format` parameter."""
    project = await _get_owned_tile_project(project_id, current_user, session)

    selected_image = project.cutlist_image_svg or project.cutlist_image
    return update_saved_image(
        selected_image, project_name=project.name, diagram_label="tile layout"
    )
