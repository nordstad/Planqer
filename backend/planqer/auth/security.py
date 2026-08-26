import logging
import os
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import bcrypt
from jose import JWTError, jwt

from planqer.helpers import load_config

logger = logging.getLogger("planqer.auth")

CONFIG_PATH = Path(__file__).parent.parent.parent / "config.yaml"
config = load_config(CONFIG_PATH)
auth_config = config.get("auth", {})

# No secret ships in config.yaml. A random one is generated per process if
# SECRET_KEY isn't set, so existing sessions invalidate on restart rather
# than trusting a known default.
SECRET_KEY = os.environ.get("SECRET_KEY") or auth_config.get("secret_key")
if not SECRET_KEY:
    SECRET_KEY = secrets.token_hex(32)
    logger.warning(
        "No SECRET_KEY set — generated a random key for this process. "
        "Set the SECRET_KEY environment variable to keep sessions valid across restarts."
    )

ALGORITHM = auth_config.get("algorithm", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = auth_config.get("access_token_expire_minutes", 30)

BCRYPT_MAX_PASSWORD_BYTES = 72


def _password_bytes(password: str) -> bytes:
    encoded = password.encode("utf-8")
    if len(encoded) > BCRYPT_MAX_PASSWORD_BYTES:
        raise ValueError(
            f"Password must be at most {BCRYPT_MAX_PASSWORD_BYTES} bytes when UTF-8 encoded"
        )
    return encoded


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(_password_bytes(plain_password), hashed_password.encode("utf-8"))
    except ValueError:
        return False


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
