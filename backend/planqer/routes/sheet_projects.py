import base64
import json
import logging
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.auth import get_current_user
from planqer.database import User, UserSheetProject, get_session
from planqer.routes.project_groups import _get_owned_group
from planqer.sheet_visualization import generate_saved_sheet_diagram

router = APIRouter(prefix="/sheet-projects", tags=["user-sheet-projects"])
logger = logging.getLogger("planqer.routes.sheet_projects")


class SheetProjectResponse(BaseModel):
    id: UUID
    project_group_id: UUID | None = None
    name: str
    parts_data: list
    sheet_width: float
    sheet_height: float
    kerf_width: float
    material_type: str
    algorithm: str | None = None
    allow_rotation: bool
    optimization_result: dict | None = None
    cutlist_image: str | None = None
    has_svg_image: bool = False
    created_at: str
    updated_at: str


class CreateSheetProjectRequest(BaseModel):
    """A layout the user has chosen to keep. The diagram is redrawn server-side
    from optimization_result, so no image comes over the wire."""

    name: str = Field(min_length=1, max_length=200)
    project_group_id: UUID | None = None
    parts_data: list
    sheet_width: float
    sheet_height: float
    kerf_width: float
    material_type: str = "plywood"
    algorithm: str | None = None
    allow_rotation: bool = True
    optimization_result: dict | None = None


class UpdateSheetProjectRequest(BaseModel):
    name: str | None = None
    parts_data: list | None = None
    sheet_width: float | None = None
    sheet_height: float | None = None
    kerf_width: float | None = None
    material_type: str | None = None
    algorithm: str | None = None
    allow_rotation: bool | None = None
    optimization_result: dict | None = None


def _render_saved_layout(optimization_result: dict | None, name: str) -> str | None:
    """Redraw the layout's diagram, now captioned with the name the user gave it.

    Drawn from the submitted layout rather than by packing again: the 2D
    packers include a genetic strategy that is not deterministic, so a second
    run could store a different layout than the one the user approved.
    """
    if not optimization_result or not optimization_result.get("sheets"):
        return None

    try:
        return generate_saved_sheet_diagram(optimization_result, name)
    except Exception as e:
        # A missing diagram is worth far less than a lost layout — keep the save.
        logger.warning(f"Failed to render diagram for saved sheet project '{name}': {e}")
        return None


def sheet_project_to_response(project: UserSheetProject) -> SheetProjectResponse:
    try:
        parts_data = json.loads(project.parts_data)
        optimization_result = json.loads(project.optimization_result) if project.optimization_result else None
    except (json.JSONDecodeError, TypeError):
        parts_data = []
        optimization_result = None

    return SheetProjectResponse(
        id=project.id,
        project_group_id=project.project_group_id,
        name=project.name,
        parts_data=parts_data,
        sheet_width=project.sheet_width,
        sheet_height=project.sheet_height,
        kerf_width=project.kerf_width,
        material_type=project.material_type,
        algorithm=project.algorithm,
        allow_rotation=project.allow_rotation,
        optimization_result=optimization_result,
        cutlist_image=project.cutlist_image,
        has_svg_image=bool(project.cutlist_image_svg),
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
    )


async def _get_owned_sheet_project(project_id: UUID, current_user: User, session: AsyncSession) -> UserSheetProject:
    stmt = select(UserSheetProject).where(
        UserSheetProject.id == project_id, UserSheetProject.user_id == current_user.id
    )
    result = await session.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sheet project not found")
    return project


@router.get("/", response_model=list[SheetProjectResponse])
async def get_user_sheet_projects(
    current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
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

    svg_data_url = _render_saved_layout(project_data.optimization_result, project_data.name)

    project = UserSheetProject(
        user_id=current_user.id,
        project_group_id=project_data.project_group_id,
        name=project_data.name,
        parts_data=json.dumps(project_data.parts_data),
        sheet_width=project_data.sheet_width,
        sheet_height=project_data.sheet_height,
        kerf_width=project_data.kerf_width,
        material_type=project_data.material_type,
        algorithm=project_data.algorithm,
        allow_rotation=project_data.allow_rotation,
        optimization_result=json.dumps(project_data.optimization_result) if project_data.optimization_result else None,
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

    if project_data.name is not None:
        project.name = project_data.name
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
    if project_data.algorithm is not None:
        project.algorithm = project_data.algorithm
    if project_data.allow_rotation is not None:
        project.allow_rotation = project_data.allow_rotation
    if project_data.optimization_result is not None:
        project.optimization_result = json.dumps(project_data.optimization_result)

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
    if not selected_image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No diagram was saved with this layout")

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
        filename = f"{project_name_safe} - Sheet Layout.{file_extension}"

        return Response(
            content=image_bytes,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(image_bytes)),
            },
        )
    except Exception as e:
        logger.error(f"Failed to decode base64 image data for sheet project {project_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to decode image data: {e}")
