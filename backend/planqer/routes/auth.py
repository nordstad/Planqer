import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import func, select

from planqer.auth import (
    create_access_token,
    get_current_user,
    get_password_hash,
    validate_password,
    verify_password,
)
from planqer.database import User, UserSettings, get_session

from .common import limiter

router = APIRouter(prefix="/auth", tags=["authentication"])


class UserCreate(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def validate_password_policy(cls, value: str) -> str:
        return validate_password(value)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    is_active: bool
    is_admin: bool


class SetupStatusResponse(BaseModel):
    needs_setup: bool


@router.get("/setup-status", response_model=SetupStatusResponse)
async def get_setup_status(session: AsyncSession = Depends(get_session)):
    """Whether this self-hosted instance has no accounts yet, so the frontend can
    offer first-run setup instead of a login form nobody could sign in to."""
    user_count = (await session.execute(select(func.count(User.id)))).scalar() or 0
    return SetupStatusResponse(needs_setup=user_count == 0)


@router.post(
    "/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
@limiter.limit("3/minute")
async def register_user(
    request: Request,
    user_data: UserCreate,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(User).where(User.email == user_data.email)
    result = await session.execute(stmt)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    # The first account on a fresh self-hosted instance becomes its admin automatically.
    is_first_user = (
        (await session.execute(select(func.count(User.id)))).scalar() or 0
    ) == 0

    db_user = User(
        email=user_data.email,
        hashed_password=await asyncio.to_thread(get_password_hash, user_data.password),
        is_admin=is_first_user,
    )

    session.add(db_user)
    await session.commit()
    await session.refresh(db_user)

    session.add(UserSettings(user_id=db_user.id))
    await session.commit()

    return UserResponse(
        id=db_user.id,
        email=db_user.email,
        is_active=db_user.is_active,
        is_admin=db_user.is_admin,
    )


@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login_user(
    request: Request,
    user_data: UserLogin,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(User).where(User.email == user_data.email)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    password_matches = (
        await asyncio.to_thread(verify_password, user_data.password, user.hashed_password)
        if user
        else False
    )
    if not user or not password_matches:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user"
        )

    access_token = create_access_token(data={"sub": str(user.id)})

    return Token(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        is_active=current_user.is_active,
        is_admin=current_user.is_admin,
    )
