"""Single-user mode: no sign-in, one implicit owner.

For a workshop or DIY install where accounts are noise. The owner is a real
user row, so saved projects and settings work unchanged and the instance can
move to multi-user later.
"""

import ipaddress
import os
import secrets

import bcrypt
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.database import User

OWNER_EMAIL = "owner@planqer.local"


def is_single_user_mode() -> bool:
    return os.environ.get("PLANQER_SINGLE_USER", "").strip().lower() == "true"


def _is_loopback(address: str) -> bool:
    if address == "localhost":
        return True
    try:
        return ipaddress.ip_address(address).is_loopback
    except ValueError:
        return False


def check_single_user_bind() -> None:
    """Refuse to run without sign-in on an address other machines can reach.

    The container always listens on all interfaces; what matters is the host
    address Compose publishes it on, passed in as PLANQER_BIND_ADDRESS. When
    that is unknown (not run through Compose) there is nothing to check.
    """
    if not is_single_user_mode():
        return
    bind_address = os.environ.get("PLANQER_BIND_ADDRESS", "").strip()
    if not bind_address or _is_loopback(bind_address):
        return
    if os.environ.get("PLANQER_ALLOW_OPEN_LAN", "").lower() == "true":
        return
    raise RuntimeError(
        "PLANQER_SINGLE_USER=true has no sign-in, but PLANQER_BIND_ADDRESS="
        f"{bind_address} lets other machines reach it. Anyone on the network "
        "could read and change your projects. Bind to 127.0.0.1, remove "
        "PLANQER_SINGLE_USER, or set PLANQER_ALLOW_OPEN_LAN=true to accept that."
    )


async def get_or_create_owner(session: AsyncSession) -> User:
    result = await session.execute(select(User).where(User.email == OWNER_EMAIL))
    owner = result.scalar_one_or_none()
    if owner is not None:
        return owner

    # Nobody signs in as the owner: the password is random and thrown away. It
    # skips the password policy on purpose, which a random token often fails.
    owner = User(
        email=OWNER_EMAIL,
        hashed_password=bcrypt.hashpw(
            secrets.token_urlsafe(32).encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8"),
        is_admin=True,
    )
    session.add(owner)
    try:
        await session.commit()
    except IntegrityError:
        # Two first requests raced; the other one created it.
        await session.rollback()
        result = await session.execute(select(User).where(User.email == OWNER_EMAIL))
        return result.scalar_one()
    await session.refresh(owner)
    return owner
