"""Backup and restore utilities for Planqer's local SQLite database."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import tarfile
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from alembic.config import Config as AlembicConfig
from alembic.script import ScriptDirectory
from sqlalchemy.engine import make_url

from planqer import __version__
from planqer.helpers import load_config

BACKUP_FORMAT = "planqer-backup-v1"
DATABASE_FILENAME = "planqer.db"
MANIFEST_FILENAME = "manifest.json"
DEFAULT_DATABASE_URL = "sqlite+aiosqlite:///./data/planqer.db"
BACKEND_DIR = Path(__file__).resolve().parents[1]
CONFIG_PATH = BACKEND_DIR / "config.yaml"


class BackupError(RuntimeError):
    """Raised when a backup or restore cannot be completed safely."""


@dataclass(frozen=True)
class BackupResult:
    archive_path: Path
    database_path: Path
    manifest: dict[str, Any]


@dataclass(frozen=True)
class RestoreResult:
    database_path: Path
    safety_copy_path: Path | None
    manifest: dict[str, Any]


def create_backup(
    *,
    database_url: str | None = None,
    output_dir: Path | None = None,
    now: datetime | None = None,
    base_dir: Path | None = None,
    config_path: Path | None = None,
) -> BackupResult:
    """Create a compressed backup archive for the configured SQLite database."""

    database_path = database_path_from_url(database_url, base_dir=base_dir, config_path=config_path)
    if not database_path.exists():
        raise BackupError(f"Database does not exist: {database_path}")

    backup_dir = output_dir or database_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    created_at = _utc_now(now)
    timestamp = created_at.strftime("%Y-%m-%dT%H%M%SZ")
    archive_path = _unique_path(backup_dir / f"planqer-backup-{timestamp}.tar.gz")

    with tempfile.TemporaryDirectory(prefix="planqer-backup-", dir=backup_dir) as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        database_copy = temp_dir / DATABASE_FILENAME
        _copy_sqlite_database(database_path, database_copy)
        database_sha256 = _sha256(database_copy)

        manifest = {
            "format": BACKUP_FORMAT,
            "created_at": created_at.isoformat().replace("+00:00", "Z"),
            "planqer_version": __version__,
            "database": {
                "type": "sqlite",
                "filename": DATABASE_FILENAME,
                "sha256": database_sha256,
                "alembic_revision": _read_alembic_revision(database_copy),
            },
        }
        manifest_path = temp_dir / MANIFEST_FILENAME
        manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

        with tarfile.open(archive_path, "w:gz") as archive:
            archive.add(manifest_path, arcname=MANIFEST_FILENAME)
            archive.add(database_copy, arcname=DATABASE_FILENAME)

    return BackupResult(archive_path=archive_path, database_path=database_path, manifest=manifest)


def restore_backup(
    archive_path: Path,
    *,
    database_url: str | None = None,
    force: bool = False,
    offline_confirmed: bool = False,
    now: datetime | None = None,
    base_dir: Path | None = None,
    config_path: Path | None = None,
) -> RestoreResult:
    """Restore a Planqer backup archive over the configured SQLite database."""

    if not offline_confirmed:
        raise BackupError(
            "Restore must run while the backend is stopped. Re-run with --offline-confirmed after stopping it."
        )

    archive_path = archive_path.expanduser().resolve()
    if not archive_path.exists():
        raise BackupError(f"Backup archive does not exist: {archive_path}")

    database_path = database_path_from_url(database_url, base_dir=base_dir, config_path=config_path)
    if database_path.exists() and not force:
        raise BackupError(f"Database already exists: {database_path}. Re-run restore with --force.")

    database_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="planqer-restore-", dir=database_path.parent) as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        manifest, restored_database = _extract_backup_archive(archive_path, temp_dir)
        _validate_sqlite_database(restored_database)

        safety_copy_path = None
        if database_path.exists():
            safety_copy_path = _create_safety_copy(database_path, now=now)

        replacement = temp_dir / f"{DATABASE_FILENAME}.replacement"
        shutil.copy2(restored_database, replacement)
        os.replace(replacement, database_path)

    return RestoreResult(database_path=database_path, safety_copy_path=safety_copy_path, manifest=manifest)


def database_path_from_url(
    database_url: str | None = None,
    *,
    base_dir: Path | None = None,
    config_path: Path | None = None,
) -> Path:
    """Resolve a SQLite database URL to an absolute filesystem path."""

    raw_url = database_url or configured_database_url(config_path=config_path)
    url = make_url(raw_url)
    if not url.drivername.startswith("sqlite"):
        raise BackupError(f"Only SQLite databases are supported for backup and restore, got: {url.drivername}")
    if not url.database or url.database == ":memory:":
        raise BackupError("In-memory SQLite databases cannot be backed up or restored.")

    path = Path(url.database)
    if not path.is_absolute():
        path = (base_dir or Path.cwd()) / path
    return path.expanduser().resolve()


def configured_database_url(*, config_path: Path | None = None) -> str:
    """Resolve the app database URL using the same precedence as runtime."""

    if database_url := os.getenv("DATABASE_URL"):
        return database_url

    config = load_config(config_path or CONFIG_PATH)
    return config.get("database", {}).get("url") or DEFAULT_DATABASE_URL


def _copy_sqlite_database(source: Path, destination: Path) -> None:
    source_connection = sqlite3.connect(source)
    try:
        destination_connection = sqlite3.connect(destination)
        try:
            with destination_connection:
                source_connection.backup(destination_connection)
        finally:
            destination_connection.close()
    finally:
        source_connection.close()


def _extract_backup_archive(archive_path: Path, destination_dir: Path) -> tuple[dict[str, Any], Path]:
    with tarfile.open(archive_path, "r:gz") as archive:
        member_names = {member.name for member in archive.getmembers()}
        expected_names = {MANIFEST_FILENAME, DATABASE_FILENAME}
        if member_names != expected_names:
            raise BackupError(
                f"Backup archive must contain exactly {MANIFEST_FILENAME} and {DATABASE_FILENAME}."
            )

        manifest_file = archive.extractfile(MANIFEST_FILENAME)
        if manifest_file is None:
            raise BackupError(f"Backup archive is missing {MANIFEST_FILENAME}.")
        manifest = json.loads(manifest_file.read().decode("utf-8"))
        _validate_manifest(manifest)

        database_file = archive.extractfile(DATABASE_FILENAME)
        if database_file is None:
            raise BackupError(f"Backup archive is missing {DATABASE_FILENAME}.")

        restored_database = destination_dir / DATABASE_FILENAME
        with restored_database.open("wb") as output:
            shutil.copyfileobj(database_file, output)

    _validate_archive_checksum(manifest, restored_database)

    return manifest, restored_database


def _validate_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("format") != BACKUP_FORMAT:
        raise BackupError(f"Unsupported backup format: {manifest.get('format')!r}")
    _require_non_empty_string(manifest, "created_at")
    _parse_created_at(str(manifest["created_at"]))
    _require_non_empty_string(manifest, "planqer_version")

    database = manifest.get("database")
    if not isinstance(database, dict):
        raise BackupError("Backup manifest is missing database metadata.")
    if database.get("type") != "sqlite":
        raise BackupError(f"Unsupported backup database type: {database.get('type')!r}")
    if database.get("filename") != DATABASE_FILENAME:
        raise BackupError(f"Unsupported backup database filename: {database.get('filename')!r}")
    checksum = _require_non_empty_string(database, "sha256")
    if len(checksum) != 64 or any(character not in "0123456789abcdef" for character in checksum):
        raise BackupError("Backup manifest database.sha256 must be a lowercase SHA-256 hex digest.")

    backup_revision = _require_non_empty_string(database, "alembic_revision")
    current_revision = _current_alembic_head()
    if backup_revision != current_revision:
        raise BackupError(
            f"Backup schema revision {backup_revision!r} does not match current app revision {current_revision!r}."
        )


def _require_non_empty_string(mapping: dict[str, Any], key: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value:
        raise BackupError(f"Backup manifest is missing {key}.")
    return value


def _parse_created_at(value: str) -> None:
    try:
        datetime.fromisoformat(value)
    except ValueError as error:
        raise BackupError("Backup manifest created_at is not a valid ISO timestamp.") from error


def _current_alembic_head() -> str:
    config = AlembicConfig(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    head = ScriptDirectory.from_config(config).get_current_head()
    if head is None:
        raise BackupError("Could not determine current Alembic revision.")
    return head


def _validate_archive_checksum(manifest: dict[str, Any], restored_database: Path) -> None:
    expected_sha256 = manifest["database"]["sha256"]
    if _sha256(restored_database) != expected_sha256:
        raise BackupError("Backup archive database checksum does not match the manifest.")


def _validate_sqlite_database(database_path: Path) -> None:
    connection = sqlite3.connect(database_path)
    try:
        result = connection.execute("PRAGMA integrity_check").fetchone()
    finally:
        connection.close()

    if result is None or result[0] != "ok":
        raise BackupError("Restored SQLite database failed integrity_check.")


def _create_safety_copy(database_path: Path, *, now: datetime | None = None) -> Path:
    safety_dir = database_path.parent / "backups" / "pre-restore"
    safety_dir.mkdir(parents=True, exist_ok=True)
    timestamp = _utc_now(now).strftime("%Y-%m-%dT%H%M%SZ")
    safety_copy_path = _unique_path(safety_dir / f"planqer-pre-restore-{timestamp}.db")
    _copy_sqlite_database(database_path, safety_copy_path)
    return safety_copy_path


def _read_alembic_revision(database_path: Path) -> str | None:
    connection = sqlite3.connect(database_path)
    try:
        row = connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'alembic_version'"
        ).fetchone()
        if row is None:
            return None
        version_row = connection.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
    finally:
        connection.close()

    if version_row is None:
        return None
    return str(version_row[0])


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _unique_path(path: Path) -> Path:
    if not path.exists():
        return path

    stem = path.name.removesuffix("".join(path.suffixes))
    suffix = "".join(path.suffixes)
    for index in range(1, 1000):
        candidate = path.with_name(f"{stem}-{index}{suffix}")
        if not candidate.exists():
            return candidate
    raise BackupError(f"Could not create a unique backup path under {path.parent}.")


def _utc_now(now: datetime | None) -> datetime:
    if now is None:
        return datetime.now(UTC)
    if now.tzinfo is None:
        return now.replace(tzinfo=UTC)
    return now.astimezone(UTC)
