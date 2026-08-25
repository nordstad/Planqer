from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import func, select

from planqer.auth import get_current_admin_user, get_password_hash
from planqer.database import User, UserProject, UserSettings, UserSheetProject, get_session

router = APIRouter(prefix="/admin", tags=["admin"])


class UserListResponse(BaseModel):
    id: UUID
    email: str
    is_active: bool
    is_admin: bool
    created_at: datetime
    project_count: int
    sheet_project_count: int


class AdminStatsResponse(BaseModel):
    total_users: int
    active_users: int
    admin_users: int
    total_projects: int
    total_sheet_projects: int


class ToggleAdminRequest(BaseModel):
    is_admin: bool


class ResetPasswordRequest(BaseModel):
    password: str = Field(min_length=6)


@router.get("/users", response_model=list[UserListResponse])
async def list_users(
    admin_user: User = Depends(get_current_admin_user), session: AsyncSession = Depends(get_session)
):
    stmt = (
        select(
            User.id,
            User.email,
            User.is_active,
            User.is_admin,
            User.created_at,
            func.coalesce(func.count(UserProject.id), 0).label("project_count"),
            func.coalesce(func.count(UserSheetProject.id), 0).label("sheet_project_count"),
        )
        .outerjoin(UserProject, User.id == UserProject.user_id)
        .outerjoin(UserSheetProject, User.id == UserSheetProject.user_id)
        .group_by(User.id)
        .order_by(User.created_at.desc())
    )

    result = await session.execute(stmt)

    return [
        UserListResponse(
            id=user.id,
            email=user.email,
            is_active=user.is_active,
            is_admin=user.is_admin,
            created_at=user.created_at,
            project_count=user.project_count,
            sheet_project_count=user.sheet_project_count,
        )
        for user in result.all()
    ]


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    admin_user: User = Depends(get_current_admin_user), session: AsyncSession = Depends(get_session)
):
    total_users = (await session.execute(select(func.count(User.id)))).scalar() or 0
    active_users = (await session.execute(select(func.count(User.id)).where(User.is_active == True))).scalar() or 0
    admin_users = (await session.execute(select(func.count(User.id)).where(User.is_admin == True))).scalar() or 0
    total_projects = (await session.execute(select(func.count(UserProject.id)))).scalar() or 0
    total_sheet_projects = (await session.execute(select(func.count(UserSheetProject.id)))).scalar() or 0

    return AdminStatsResponse(
        total_users=total_users,
        active_users=active_users,
        admin_users=admin_users,
        total_projects=total_projects,
        total_sheet_projects=total_sheet_projects,
    )


@router.put("/users/{user_id}/toggle-admin")
async def toggle_user_admin(
    user_id: UUID,
    request: ToggleAdminRequest,
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    if user_id == admin_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify your own admin status")

    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_admin = request.is_admin
    await session.commit()

    return {"message": f"User admin status updated to {request.is_admin}"}


@router.put("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: UUID,
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    if user_id == admin_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify your own active status")

    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = not user.is_active
    await session.commit()

    return {"message": f"User active status updated to {user.is_active}"}


@router.put("/users/{user_id}/password")
async def reset_user_password(
    user_id: UUID,
    request: ResetPasswordRequest,
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.hashed_password = get_password_hash(request.password)
    await session.commit()

    return {"message": f"Password reset for {user.email}"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: UUID,
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    if user_id == admin_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own account")

    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # No ON DELETE CASCADE on these foreign keys, so related rows must go first.
    await session.execute(delete(UserSettings).where(UserSettings.user_id == user_id))
    await session.execute(delete(UserProject).where(UserProject.user_id == user_id))
    await session.execute(delete(UserSheetProject).where(UserSheetProject.user_id == user_id))

    await session.delete(user)
    await session.commit()

    return {"message": "User deleted successfully"}
