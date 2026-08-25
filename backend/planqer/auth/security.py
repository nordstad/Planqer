import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

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

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
