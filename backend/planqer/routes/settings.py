import json
from uuid import UUID

from fastapi import APIRouter, Depends
from planqer.auth import get_current_user
from planqer.database import User, UserSettings, get_session
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

router = APIRouter(prefix="/settings", tags=["user-settings"])


class UserSettingsResponse(BaseModel):
    id: UUID
    user_id: UUID
    default_board_lengths: list[int]
    default_saw_blade_width: float
    default_currency: str
    preferred_algorithm: str
    preferred_units: str


class UserSettingsUpdate(BaseModel):
    default_board_lengths: list[int] | None = None
    default_saw_blade_width: float | None = None
    default_currency: str | None = None
    preferred_algorithm: str | None = None
    preferred_units: str | None = None


LEGACY_DEFAULT_BOARD_LENGTHS = [300, 360, 500]
CURRENT_DEFAULT_BOARD_LENGTHS = [3000, 3600, 5000]


def normalize_default_board_lengths(board_lengths):
    if board_lengths == LEGACY_DEFAULT_BOARD_LENGTHS:
        return CURRENT_DEFAULT_BOARD_LENGTHS
    return board_lengths


def settings_to_response(settings: UserSettings) -> UserSettingsResponse:
    try:
        board_lengths = json.loads(settings.default_board_lengths)
    except (json.JSONDecodeError, TypeError):
        board_lengths = CURRENT_DEFAULT_BOARD_LENGTHS

    board_lengths = normalize_default_board_lengths(board_lengths)
    if board_lengths == CURRENT_DEFAULT_BOARD_LENGTHS:
        settings.default_board_lengths = json.dumps(board_lengths)

    return UserSettingsResponse(
        id=settings.id,
        user_id=settings.user_id,
        default_board_lengths=board_lengths,
        default_saw_blade_width=settings.default_saw_blade_width,
        default_currency=settings.default_currency,
        preferred_algorithm=settings.preferred_algorithm,
        preferred_units=settings.preferred_units,
    )


@router.get("/", response_model=UserSettingsResponse)
async def get_user_settings(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(UserSettings).where(UserSettings.user_id == current_user.id)
    result = await session.execute(stmt)
    settings = result.scalar_one_or_none()

    if not settings:
        settings = UserSettings(user_id=current_user.id)
        session.add(settings)
        await session.commit()
        await session.refresh(settings)

    return settings_to_response(settings)


@router.put("/", response_model=UserSettingsResponse)
async def update_user_settings(
    updates: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(UserSettings).where(UserSettings.user_id == current_user.id)
    result = await session.execute(stmt)
    settings = result.scalar_one_or_none()

    if not settings:
        settings = UserSettings(user_id=current_user.id)
        session.add(settings)

    if updates.default_board_lengths is not None:
        settings.default_board_lengths = json.dumps(updates.default_board_lengths)
    if updates.default_saw_blade_width is not None:
        settings.default_saw_blade_width = updates.default_saw_blade_width
    if updates.default_currency is not None:
        settings.default_currency = updates.default_currency
    if updates.preferred_algorithm is not None:
        settings.preferred_algorithm = updates.preferred_algorithm
    if updates.preferred_units is not None:
        settings.preferred_units = updates.preferred_units

    await session.commit()
    await session.refresh(settings)

    return settings_to_response(settings)
