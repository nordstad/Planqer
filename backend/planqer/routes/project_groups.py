import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.auth import get_current_user
from planqer.database import (
    ProjectGroup,
    User,
    UserProject,
    UserSheetProject,
    UserTileProject,
    get_session,
)

router = APIRouter(prefix="/project-groups", tags=["project-groups"])
logger = logging.getLogger("planqer.routes.project_groups")


class ProjectGroupResponse(BaseModel):
    id: UUID
    name: str
    created_at: str
    updated_at: str
    spare_margin_percent: float | None = None


class ProjectGroupRequest(BaseModel):
    name: str
    spare_margin_percent: float | None = None


def group_to_response(group: ProjectGroup) -> ProjectGroupResponse:
    return ProjectGroupResponse(
        id=group.id,
        name=group.name,
        created_at=group.created_at.isoformat(),
        updated_at=group.updated_at.isoformat(),
        spare_margin_percent=group.spare_margin_percent,
    )


async def _get_owned_group(
    group_id: UUID, current_user: User, session: AsyncSession
) -> ProjectGroup:
    stmt = select(ProjectGroup).where(
        ProjectGroup.id == group_id, ProjectGroup.user_id == current_user.id
    )
    result = await session.execute(stmt)
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    return group


@router.get("/", response_model=list[ProjectGroupResponse])
async def list_project_groups(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(ProjectGroup)
        .where(ProjectGroup.user_id == current_user.id)
        .order_by(ProjectGroup.updated_at.desc())
    )
    result = await session.execute(stmt)
    return [group_to_response(group) for group in result.scalars().all()]


@router.post("/", response_model=ProjectGroupResponse)
async def create_project_group(
    request: ProjectGroupRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    group = ProjectGroup(
        user_id=current_user.id,
        name=request.name,
        spare_margin_percent=request.spare_margin_percent,
    )
    session.add(group)
    await session.commit()
    await session.refresh(group)
    return group_to_response(group)


@router.put("/{group_id}", response_model=ProjectGroupResponse)
async def rename_project_group(
    group_id: UUID,
    request: ProjectGroupRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    group = await _get_owned_group(group_id, current_user, session)
    group.name = request.name
    if "spare_margin_percent" in request.model_fields_set:
        group.spare_margin_percent = request.spare_margin_percent
    group.updated_at = datetime.now()
    await session.commit()
    await session.refresh(group)
    return group_to_response(group)


@router.delete("/{group_id}")
async def delete_project_group(
    group_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    group = await _get_owned_group(group_id, current_user, session)

    # SQLite here doesn't enforce the migration's ON DELETE CASCADE (foreign
    # key checks aren't turned on for this connection), so its cutlists are
    # deleted explicitly rather than left orphaned with a dangling group id.
    for cutlist_model in (UserProject, UserSheetProject, UserTileProject):
        stmt = select(cutlist_model).where(cutlist_model.project_group_id == group_id)
        result = await session.execute(stmt)
        for cutlist in result.scalars().all():
            await session.delete(cutlist)

    await session.delete(group)
    await session.commit()

    return {"message": "Project deleted successfully"}
