import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.auth import get_current_user
from planqer.database import User, UserSheetProject, get_session
from planqer.routes.project_groups import _get_owned_group
from planqer.saved_diagrams import render_saved_sheet_layout
from planqer.saved_project_adapters import load_saved_json, update_saved_image
from planqer.schemas.saved import CreateSheetProjectRequest, UpdateSheetProjectRequest
from planqer.sheet_visualization import (
    generate_single_sheet_visualization,
)

router = APIRouter(prefix="/sheet-projects", tags=["user-sheet-projects"])


class SheetProjectResponse(BaseModel):
    id: UUID
    project_group_id: UUID | None = None
    name: str
    parts_data: list
    sheet_width: float
    sheet_height: float
    kerf_width: float
    material_type: str
    sheet_thickness: float
    algorithm: str | None = None
    allow_rotation: bool
    pricing: dict | None = None
    product: dict | None = None
    optimization_result: dict | None = None
    cutlist_image: str | None = None
    has_svg_image: bool = False
    created_at: str
    updated_at: str


def sheet_project_to_response(project: UserSheetProject) -> SheetProjectResponse:
    parts_data = load_saved_json(
        project.parts_data, field="sheet parts", default=[], expected=list
    )
    optimization_result = load_saved_json(
        project.optimization_result,
        field="sheet optimization result",
        default=None,
        expected=dict,
    )
    if (
        optimization_result
        and optimization_result.get("sheets")
        and not optimization_result.get("sheet_visualizations")
    ):
        optimization_result = {
            **optimization_result,
            "sheet_visualizations": [
                generate_single_sheet_visualization(sheet, sheet_index)
                for sheet_index, sheet in enumerate(optimization_result["sheets"])
            ],
        }

    return SheetProjectResponse(
        id=project.id,
        project_group_id=project.project_group_id,
        name=project.name,
        parts_data=parts_data,
        sheet_width=project.sheet_width,
        sheet_height=project.sheet_height,
        kerf_width=project.kerf_width,
        material_type=project.material_type,
        sheet_thickness=project.sheet_thickness,
        algorithm=project.algorithm,
        allow_rotation=project.allow_rotation,
        pricing=load_saved_json(
            project.pricing, field="sheet pricing", default=None, expected=dict
        ),
        product=load_saved_json(
            project.product, field="sheet product", default=None, expected=dict
        ),
        optimization_result=optimization_result,
        cutlist_image=project.cutlist_image,
        has_svg_image=bool(project.cutlist_image_svg),
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
    )


async def _get_owned_sheet_project(
    project_id: UUID, current_user: User, session: AsyncSession
) -> UserSheetProject:
    stmt = select(UserSheetProject).where(
        UserSheetProject.id == project_id, UserSheetProject.user_id == current_user.id
    )
    result = await session.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Sheet project not found"
        )
    return project


@router.get("/", response_model=list[SheetProjectResponse])
async def get_user_sheet_projects(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(UserSheetProject)
        .where(UserSheetProject.user_id == current_user.id)
        .order_by(UserSheetProject.updated_at.desc())
    )
    result = await session.execute(stmt)
    return [sheet_project_to_response(project) for project in result.scalars().all()]


@router.post("/", response_model=SheetProjectResponse)
async def create_sheet_project(
    project_data: CreateSheetProjectRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if project_data.project_group_id is not None:
        await _get_owned_group(project_data.project_group_id, current_user, session)

    svg_data_url = render_saved_sheet_layout(
        project_data.optimization_result, project_data.name
    )

    project = UserSheetProject(
        user_id=current_user.id,
        project_group_id=project_data.project_group_id,
        name=project_data.name,
        parts_data=json.dumps(project_data.parts_data),
        sheet_width=project_data.sheet_width,
        sheet_height=project_data.sheet_height,
        kerf_width=project_data.kerf_width,
        material_type=project_data.material_type,
        sheet_thickness=project_data.sheet_thickness,
        algorithm=project_data.algorithm,
        allow_rotation=project_data.allow_rotation,
        pricing=json.dumps(project_data.pricing) if project_data.pricing else None,
        product=project_data.product.model_dump_json()
        if project_data.product
        else None,
        optimization_result=json.dumps(project_data.optimization_result)
        if project_data.optimization_result
        else None,
        cutlist_image=svg_data_url,
        cutlist_image_svg=svg_data_url,
    )

    session.add(project)
    await session.commit()
    await session.refresh(project)

    return sheet_project_to_response(project)


@router.get("/{project_id}", response_model=SheetProjectResponse)
async def get_sheet_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    project = await _get_owned_sheet_project(project_id, current_user, session)
    return sheet_project_to_response(project)


@router.put("/{project_id}", response_model=SheetProjectResponse)
async def update_sheet_project(
    project_id: UUID,
    project_data: UpdateSheetProjectRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    project = await _get_owned_sheet_project(project_id, current_user, session)

    if project_data.project_group_id is not None:
        await _get_owned_group(project_data.project_group_id, current_user, session)

    if project_data.name is not None:
        project.name = project_data.name
    if "project_group_id" in project_data.model_fields_set:
        project.project_group_id = project_data.project_group_id
    if project_data.parts_data is not None:
        project.parts_data = json.dumps(project_data.parts_data)
    if project_data.sheet_width is not None:
        project.sheet_width = project_data.sheet_width
    if project_data.sheet_height is not None:
        project.sheet_height = project_data.sheet_height
    if project_data.kerf_width is not None:
        project.kerf_width = project_data.kerf_width
    if project_data.material_type is not None:
        project.material_type = project_data.material_type
    if project_data.sheet_thickness is not None:
        project.sheet_thickness = project_data.sheet_thickness
    if "algorithm" in project_data.model_fields_set:
        project.algorithm = project_data.algorithm
    if project_data.allow_rotation is not None:
        project.allow_rotation = project_data.allow_rotation
    if project_data.optimization_result is not None:
        project.optimization_result = json.dumps(project_data.optimization_result)
    if "pricing" in project_data.model_fields_set:
        project.pricing = (
            json.dumps(project_data.pricing) if project_data.pricing else None
        )
    if "product" in project_data.model_fields_set:
        project.product = (
            project_data.product.model_dump_json() if project_data.product else None
        )

    svg_data_url = render_saved_sheet_layout(
        project_data.optimization_result
        if project_data.optimization_result is not None
        else json.loads(project.optimization_result)
        if project.optimization_result
        else None,
        project.name,
    )
    project.cutlist_image = svg_data_url
    project.cutlist_image_svg = svg_data_url
    project.updated_at = datetime.now()

    await session.commit()
    await session.refresh(project)

    return sheet_project_to_response(project)


@router.delete("/{project_id}")
async def delete_sheet_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    project = await _get_owned_sheet_project(project_id, current_user, session)
    await session.delete(project)
    await session.commit()

    return {"message": "Sheet project deleted successfully"}


@router.get("/{project_id}/image")
async def get_sheet_project_image(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Serve a saved layout's diagram as SVG. See the board equivalent in
    routes/projects.py for why there is no `format` parameter."""
    project = await _get_owned_sheet_project(project_id, current_user, session)

    selected_image = project.cutlist_image_svg or project.cutlist_image
    return update_saved_image(
        selected_image, project_name=project.name, diagram_label="sheet layout"
    )
