import base64
import json
import logging
import re
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.auth import get_current_user
from planqer.database import User, UserProject, get_session
from planqer.routes.project_groups import _get_owned_group
from planqer.svg_visualization import generate_saved_diagram

router = APIRouter(prefix="/projects", tags=["user-projects"])
logger = logging.getLogger("planqer.routes.projects")


class ProjectResponse(BaseModel):
    id: UUID
    project_group_id: UUID | None = None
    name: str
    parts_data: dict
    board_lengths: list[int]
    saw_blade_width: float
    board_costs: dict | None = None
    optimization_result: dict | None = None
    cutlist_image: str | None = None
    has_svg_image: bool = False
    created_at: str
    updated_at: str


class ProjectCreateRequest(BaseModel):
    """A plan the user has chosen to keep. Carries the plan itself, not a
    request to compute one: /cutting-plans solves and returns, this stores."""

    name: str = Field(min_length=1, max_length=200)
    project_group_id: UUID | None = None
    parts_data: dict
    board_lengths: list[float]
    saw_blade_width: float
    # The prices behind this plan's cost analysis, if it was priced. Stored so
    # loading the plan restores the pricing panel — supplier prices and stocked
    # lengths differ per job, so they belong to the plan, not to the app.
    board_costs: dict | None = None
    optimization_result: dict


class ProjectUpdateRequest(BaseModel):
    name: str


def _render_saved_diagram(optimization_result: dict, saw_blade_width: float, name: str) -> str | None:
    """Redraw the plan's diagram, now captioned with the name the user gave it.

    Drawn here rather than taken from the browser, and drawn from the submitted
    plan rather than by solving again: the genetic algorithm is not
    deterministic, so a second solve could store a different plan than the one
    the user approved on screen.
    """
    cut_list = optimization_result.get("cut_list")
    if not cut_list:
        return None

    board_lengths_used = optimization_result.get("board_lengths_used") or optimization_result.get("optimal_board_length")
    if not board_lengths_used:
        return None

    try:
        return generate_saved_diagram(
            cut_list, board_lengths_used, saw_blade_width=saw_blade_width, project_name=name
        )
    except Exception as e:
        # A missing diagram is worth far less than a lost plan — keep the save.
        logger.warning(f"Failed to render diagram for saved project '{name}': {e}")
        return None


def project_to_response(project: UserProject) -> ProjectResponse:
    try:
        parts_data = json.loads(project.parts_data)
        board_lengths = json.loads(project.board_lengths)
        optimization_result = json.loads(project.optimization_result) if project.optimization_result else None
        board_costs = json.loads(project.board_costs) if project.board_costs else None
    except (json.JSONDecodeError, TypeError):
        parts_data = {}
        board_lengths = []
        optimization_result = None
        board_costs = None

    return ProjectResponse(
        id=project.id,
        project_group_id=project.project_group_id,
        name=project.name,
        parts_data=parts_data,
        board_lengths=board_lengths,
        saw_blade_width=project.saw_blade_width,
        board_costs=board_costs,
        optimization_result=optimization_result,
        cutlist_image=project.cutlist_image,
        has_svg_image=bool(project.cutlist_image_svg),
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
    )


async def _get_owned_project(project_id: UUID, current_user: User, session: AsyncSession) -> UserProject:
    stmt = select(UserProject).where(UserProject.id == project_id, UserProject.user_id == current_user.id)
    result = await session.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.get("/", response_model=list[ProjectResponse])
async def get_user_projects(
    current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
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

    svg_data_url = _render_saved_diagram(
        project_data.optimization_result, project_data.saw_blade_width, project_data.name
    )

    project = UserProject(
        user_id=current_user.id,
        project_group_id=project_data.project_group_id,
        name=project_data.name,
        parts_data=json.dumps(project_data.parts_data),
        board_lengths=json.dumps(project_data.board_lengths),
        saw_blade_width=project_data.saw_blade_width,
        board_costs=json.dumps(project_data.board_costs) if project_data.board_costs else None,
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
    project.name = update_data.name
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
    if not selected_image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No diagram was saved with this plan")

    if not selected_image.strip():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image data is empty")

    if selected_image.startswith("data:image/png;base64,") or selected_image.startswith("data:image/svg+xml;base64,"):
        image_data = selected_image.split(",", 1)[1]
    else:
        image_data = selected_image

    if not image_data.strip():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Base64 image data is empty")

    try:
        if not re.match(r'^[A-Za-z0-9+/]*={0,2}$', image_data):
            raise ValueError("Invalid base64 format")

        image_bytes = base64.b64decode(image_data, validate=True)
        if len(image_bytes) == 0:
            raise ValueError("Decoded image data is empty")

        if selected_image.startswith("data:image/svg+xml;base64,"):
            media_type, file_extension = "image/svg+xml", "svg"
        else:
            media_type, file_extension = "image/png", "png"

        project_name_safe = re.sub(r'[^\w\-_\. ]', '', project.name)
        filename = f"{project_name_safe} - Cutlist.{file_extension}"

        return Response(
            content=image_bytes,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(image_bytes)),
            },
        )
    except Exception as e:
        logger.error(f"Failed to decode base64 image data for project {project_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to decode image data: {e}")
