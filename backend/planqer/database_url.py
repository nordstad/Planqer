"""Shared database URL resolution for runtime, migrations, and backups."""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path

from planqer.helpers import load_config

DEFAULT_DATABASE_URL = "sqlite+aiosqlite:///./data/planqer.db"
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
