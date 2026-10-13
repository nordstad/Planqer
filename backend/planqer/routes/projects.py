import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.auth import get_current_user
from planqer.database import User, UserProject, get_session
from planqer.routes.project_groups import _get_owned_group
from planqer.saved_diagrams import render_saved_board_diagram
from planqer.saved_project_adapters import load_saved_json, update_saved_image
from planqer.schemas.saved import ProjectCreateRequest, ProjectUpdateRequest

router = APIRouter(prefix="/projects", tags=["user-projects"])


class ProjectResponse(BaseModel):
    id: UUID
    project_group_id: UUID | None = None
    name: str
    parts_data: dict
    board_lengths: list[float]
    saw_blade_width: float
    material_type: str
    board_thickness: float
    board_width: float
    board_costs: dict | None = None
    product: dict | None = None
    optimization_result: dict | None = None
    cutlist_image: str | None = None
    has_svg_image: bool = False
    created_at: str
    updated_at: str


def project_to_response(project: UserProject) -> ProjectResponse:
    parts_data = load_saved_json(
        project.parts_data, field="board parts", default={}, expected=dict
    )
    board_lengths = load_saved_json(
        project.board_lengths, field="board lengths", default=[], expected=list
    )
    optimization_result = load_saved_json(
        project.optimization_result,
        field="board optimization result",
        default=None,
        expected=dict,
    )
    board_costs = load_saved_json(
        project.board_costs, field="board costs", default=None, expected=dict
    )

    product = load_saved_json(
        project.product, field="board product", default=None, expected=dict
    )

    return ProjectResponse(
        id=project.id,
        project_group_id=project.project_group_id,
        name=project.name,
        parts_data=parts_data,
        board_lengths=board_lengths,
        saw_blade_width=project.saw_blade_width,
        material_type=project.material_type,
        board_thickness=project.board_thickness,
        board_width=project.board_width,
        board_costs=board_costs,
        product=product,
        optimization_result=optimization_result,
        cutlist_image=project.cutlist_image,
        has_svg_image=bool(project.cutlist_image_svg),
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
    )


async def _get_owned_project(
    project_id: UUID, current_user: User, session: AsyncSession
) -> UserProject:
    stmt = select(UserProject).where(
        UserProject.id == project_id, UserProject.user_id == current_user.id
    )
    result = await session.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    return project


@router.get("/", response_model=list[ProjectResponse])
async def get_user_projects(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(UserProject)
        .where(UserProject.user_id == current_user.id)
        .order_by(UserProject.updated_at.desc())
    )
    result = await session.execute(stmt)
    return [project_to_response(project) for project in result.scalars().all()]


@router.post("/", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if project_data.project_group_id is not None:
        await _get_owned_group(project_data.project_group_id, current_user, session)

    svg_data_url = render_saved_board_diagram(
        project_data.optimization_result,
        project_data.saw_blade_width,
        project_data.name,
    )

    project = UserProject(
        user_id=current_user.id,
        project_group_id=project_data.project_group_id,
        name=project_data.name,
        parts_data=json.dumps(project_data.parts_data),
        board_lengths=json.dumps(project_data.board_lengths),
        saw_blade_width=project_data.saw_blade_width,
        material_type=project_data.material_type
        or (project_data.product.name if project_data.product else ""),
        board_thickness=project_data.board_thickness,
        board_width=project_data.board_width,
        board_costs=json.dumps(project_data.board_costs)
        if project_data.board_costs
        else None,
        product=project_data.product.model_dump_json()
        if project_data.product
        else None,
        optimization_result=json.dumps(project_data.optimization_result),
        cutlist_image=svg_data_url,
        cutlist_image_svg=svg_data_url,
    )

    session.add(project)
    await session.commit()
    await session.refresh(project)

    return project_to_response(project)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    project = await _get_owned_project(project_id, current_user, session)
    return project_to_response(project)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    update_data: ProjectUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    project = await _get_owned_project(project_id, current_user, session)
    if update_data.project_group_id is not None:
        await _get_owned_group(update_data.project_group_id, current_user, session)

    if update_data.name is not None:
        project.name = update_data.name
    if "project_group_id" in update_data.model_fields_set:
        project.project_group_id = update_data.project_group_id
    if update_data.parts_data is not None:
        project.parts_data = json.dumps(update_data.parts_data)
    if update_data.board_lengths is not None:
        project.board_lengths = json.dumps(update_data.board_lengths)
    if update_data.saw_blade_width is not None:
        project.saw_blade_width = update_data.saw_blade_width
    if update_data.material_type is not None:
        project.material_type = update_data.material_type
    if update_data.board_thickness is not None:
        project.board_thickness = update_data.board_thickness
    if update_data.board_width is not None:
        project.board_width = update_data.board_width
    if "board_costs" in update_data.model_fields_set:
        project.board_costs = (
            json.dumps(update_data.board_costs) if update_data.board_costs else None
        )
    if "product" in update_data.model_fields_set:
        project.product = (
            update_data.product.model_dump_json() if update_data.product else None
        )
    if update_data.optimization_result is not None:
        project.optimization_result = json.dumps(update_data.optimization_result)

    if (
        update_data.name is not None
        or update_data.saw_blade_width is not None
        or update_data.optimization_result is not None
    ):
        current_result = (
            update_data.optimization_result
            if update_data.optimization_result is not None
            else json.loads(project.optimization_result)
            if project.optimization_result
            else None
        )
        svg_data_url = render_saved_board_diagram(
            current_result,
            update_data.saw_blade_width
            if update_data.saw_blade_width is not None
            else project.saw_blade_width,
            project.name,
        )
        project.cutlist_image = svg_data_url
        project.cutlist_image_svg = svg_data_url
    project.updated_at = datetime.now()

    await session.commit()
    await session.refresh(project)

    return project_to_response(project)


@router.delete("/{project_id}")
async def delete_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    project = await _get_owned_project(project_id, current_user, session)
    await session.delete(project)
    await session.commit()

    return {"message": "Project deleted successfully"}


@router.get("/{project_id}/image")
async def get_project_image(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Serve a saved plan's diagram, as the SVG it was stored as.

    There is no `format` parameter any more. This endpoint used to offer
    `png`, served from a column CairoSVG filled in — which only worked where
    the native libcairo happened to be installed, and 404'd everywhere else.
    The browser rasterizes the SVG when the user asks for a PNG, so this stays
    one format and the feature stops depending on the host.
    """
    project = await _get_owned_project(project_id, current_user, session)

    selected_image = project.cutlist_image_svg or project.cutlist_image
    return update_saved_image(
        selected_image, project_name=project.name, diagram_label="cutlist"
    )
