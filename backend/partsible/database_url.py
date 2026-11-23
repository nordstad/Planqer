"""Shared database URL resolution for runtime, migrations, and backups."""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path

from sqlalchemy.engine import make_url

from partsible.helpers import load_config

DEFAULT_DATABASE_URL = "sqlite+aiosqlite:///./data/partsible.db"
LEGACY_DATABASE_FILENAME = "planqer.db"
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.yaml"


def resolve_database_url(
    explicit_url: str | None = None,
    *,
    config_path: Path | None = None,
    environ: Mapping[str, str] | None = None,
) -> str:
    """Resolve explicit URL, env, config YAML, then the local SQLite default."""
    if explicit_url:
        return explicit_url
    environment = environ if environ is not None else os.environ
    if environment.get("DATABASE_URL"):
        return environment["DATABASE_URL"]
    config = load_config(config_path or DEFAULT_CONFIG_PATH)
    return config.get("database", {}).get("url") or DEFAULT_DATABASE_URL


def legacy_database_warning(database_url: str) -> str | None:
    """Explain a leftover planqer.db that Partsible will not read, if there is one.

    Partsible was called Planqer before 0.15.0. It does not read or rename the
    old file: it starts with an empty database next to it.
    """
    url = make_url(database_url)
    if not url.drivername.startswith("sqlite") or not url.database:
        return None
    database = Path(url.database)
    legacy = database.with_name(LEGACY_DATABASE_FILENAME)
    if database.exists() or not legacy.exists():
        return None
    return (
        f"Found {legacy.name} but no {database.name} in {database.parent}. "
        f"Partsible no longer reads the old file and will start with an empty "
        f"database. To keep your data, stop the app and rename {legacy.name} "
        f"to {database.name}."
    )
