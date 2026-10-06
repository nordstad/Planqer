import logging
import os
import secrets
import tempfile
from collections.abc import Mapping
from pathlib import Path

logger = logging.getLogger("planqer.auth")

DEFAULT_SECRET_KEY_PATH = Path("data/.secret_key")


def resolve_secret_key(
    *,
    environment: Mapping[str, str] | None = None,
    auth_config: Mapping[str, object] | None = None,
    key_path: Path = DEFAULT_SECRET_KEY_PATH,
) -> str:
    """Resolve the signing key, persisting an automatic key when possible."""
    environment = os.environ if environment is None else environment
    auth_config = {} if auth_config is None else auth_config

    configured_key = environment.get("SECRET_KEY") or auth_config.get("secret_key")
    if isinstance(configured_key, str) and configured_key:
        return configured_key

    try:
        key_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            return _read_key(key_path)
        except FileNotFoundError:
            key = secrets.token_hex(32)
            try:
                _write_new_key(key_path, key)
            except FileExistsError:
                return _read_key(key_path)
            logger.info("Generated and persisted an automatic SECRET_KEY.")
            return key
    except (OSError, ValueError) as exc:
        key = secrets.token_hex(32)
        logger.warning(
            "Could not persist SECRET_KEY at %s (%s); generated a temporary key. "
            "Sessions will be invalidated when the process restarts.",
            key_path,
            exc,
        )
        return key


def _read_key(key_path: Path) -> str:
    key = key_path.read_text(encoding="utf-8")
    if not key:
        raise ValueError(f"SECRET_KEY file is empty: {key_path}")
    return key


def _write_new_key(key_path: Path, key: str) -> None:
    descriptor, temporary_path = tempfile.mkstemp(
        prefix=f".{key_path.name}.", dir=key_path.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            descriptor = -1
            file.write(key)
            file.flush()
            os.fsync(file.fileno())
        os.link(temporary_path, key_path)
    finally:
        try:
            os.unlink(temporary_path)
        except FileNotFoundError:
            pass
        if descriptor != -1:
            os.close(descriptor)
