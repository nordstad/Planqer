import json
import sqlite3
import tarfile
from datetime import UTC, datetime
from pathlib import Path

import pytest

from planqer.backup import (
    BACKUP_FORMAT,
    BackupError,
    create_backup,
    database_path_from_url,
    restore_backup,
)
from planqer.cli import main


def test_create_backup_uses_sqlite_backup_api_and_writes_manifest(tmp_path: Path):
    database_path = tmp_path / "planqer.db"
    _create_database(database_path, project_name="kitchen")

    result = create_backup(
        database_url=f"sqlite+aiosqlite:///{database_path}",
        output_dir=tmp_path / "backups",
        now=datetime(2026, 8, 26, 21, 15, 30, tzinfo=UTC),
    )

    assert result.archive_path.name == "planqer-backup-2026-08-26T211530Z.tar.gz"
    assert result.archive_path.exists()

    with tarfile.open(result.archive_path, "r:gz") as archive:
        assert {member.name for member in archive.getmembers()} == {"manifest.json", "planqer.db"}
        manifest_file = archive.extractfile("manifest.json")
        assert manifest_file is not None
        manifest = json.loads(manifest_file.read().decode("utf-8"))

    assert manifest["format"] == BACKUP_FORMAT
    assert "source_path" not in manifest["database"]
    assert manifest["database"]["type"] == "sqlite"
    assert manifest["database"]["alembic_revision"] == "007_add_default_currency"
    assert len(manifest["database"]["sha256"]) == 64


def test_restore_backup_requires_force_when_database_exists(tmp_path: Path):
    source_path = tmp_path / "source.db"
    target_path = tmp_path / "target.db"
    _create_database(source_path, project_name="backup")
    _create_database(target_path, project_name="current")
    backup = create_backup(database_url=f"sqlite+aiosqlite:///{source_path}", output_dir=tmp_path)

    with pytest.raises(BackupError, match="offline"):
        restore_backup(
            backup.archive_path,
            database_url=f"sqlite+aiosqlite:///{target_path}",
            force=True,
        )

    with pytest.raises(BackupError, match="--force"):
        restore_backup(
            backup.archive_path,
            database_url=f"sqlite+aiosqlite:///{target_path}",
            offline_confirmed=True,
        )

    assert _project_names(target_path) == ["current"]


def test_restore_backup_replaces_database_and_keeps_safety_copy(tmp_path: Path):
    source_path = tmp_path / "source.db"
    target_path = tmp_path / "target.db"
    _create_database(source_path, project_name="backup")
    _create_database(target_path, project_name="current")
    backup = create_backup(database_url=f"sqlite+aiosqlite:///{source_path}", output_dir=tmp_path)

    result = restore_backup(
        backup.archive_path,
        database_url=f"sqlite+aiosqlite:///{target_path}",
        force=True,
        offline_confirmed=True,
        now=datetime(2026, 8, 26, 22, 0, 0, tzinfo=UTC),
    )

    assert _project_names(target_path) == ["backup"]
    assert result.safety_copy_path is not None
    assert result.safety_copy_path.name == "planqer-pre-restore-2026-08-26T220000Z.db"
    assert _project_names(result.safety_copy_path) == ["current"]


def test_restore_backup_rejects_tampered_archive(tmp_path: Path):
    archive_path = tmp_path / "bad.tar.gz"
    manifest_path = tmp_path / "manifest.json"
    database_path = tmp_path / "planqer.db"
    _create_database(database_path, project_name="backup")
    manifest_path.write_text(json.dumps(_manifest("0" * 64)), encoding="utf-8")
    with tarfile.open(archive_path, "w:gz") as archive:
        archive.add(manifest_path, arcname="manifest.json")
        archive.add(database_path, arcname="planqer.db")

    with pytest.raises(BackupError, match="checksum"):
        restore_backup(
            archive_path,
            database_url=f"sqlite+aiosqlite:///{tmp_path / 'target.db'}",
            offline_confirmed=True,
        )


def test_restore_backup_requires_manifest_checksum(tmp_path: Path):
    archive_path = tmp_path / "missing-checksum.tar.gz"
    manifest_path = tmp_path / "manifest.json"
    database_path = tmp_path / "planqer.db"
    _create_database(database_path, project_name="backup")
    manifest = _manifest("0" * 64)
    del manifest["database"]["sha256"]
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with tarfile.open(archive_path, "w:gz") as archive:
        archive.add(manifest_path, arcname="manifest.json")
        archive.add(database_path, arcname="planqer.db")

    with pytest.raises(BackupError, match="sha256"):
        restore_backup(
            archive_path,
            database_url=f"sqlite+aiosqlite:///{tmp_path / 'target.db'}",
            offline_confirmed=True,
        )


def test_restore_backup_rejects_schema_revision_mismatch(tmp_path: Path):
    archive_path = tmp_path / "old-schema.tar.gz"
    manifest_path = tmp_path / "manifest.json"
    database_path = tmp_path / "planqer.db"
    _create_database(database_path, project_name="backup")
    manifest = _manifest(_sha256(database_path), alembic_revision="006_add_board_costs")
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with tarfile.open(archive_path, "w:gz") as archive:
        archive.add(manifest_path, arcname="manifest.json")
        archive.add(database_path, arcname="planqer.db")

    with pytest.raises(BackupError, match="schema revision"):
        restore_backup(
            archive_path,
            database_url=f"sqlite+aiosqlite:///{tmp_path / 'target.db'}",
            offline_confirmed=True,
        )


def test_database_path_uses_config_yaml_when_env_is_unset(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    database_path = tmp_path / "configured.db"
    config_path = tmp_path / "config.yaml"
    config_path.write_text(f"database:\n  url: sqlite+aiosqlite:///{database_path}\n", encoding="utf-8")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    assert database_path_from_url(config_path=config_path) == database_path


def test_cli_backup_prints_created_archive(tmp_path: Path, capsys: pytest.CaptureFixture[str]):
    database_path = tmp_path / "planqer.db"
    _create_database(database_path, project_name="kitchen")

    exit_code = main(
        [
            "backup",
            "--database-url",
            f"sqlite+aiosqlite:///{database_path}",
            "--output-dir",
            str(tmp_path / "backups"),
        ]
    )

    output = capsys.readouterr()
    assert exit_code == 0
    assert "Created backup:" in output.out
    assert not output.err


def _create_database(path: Path, *, project_name: str) -> None:
    connection = sqlite3.connect(path)
    try:
        connection.execute("CREATE TABLE projects (name TEXT NOT NULL)")
        connection.execute("INSERT INTO projects (name) VALUES (?)", (project_name,))
        connection.execute("CREATE TABLE alembic_version (version_num TEXT NOT NULL)")
        connection.execute("INSERT INTO alembic_version (version_num) VALUES (?)", ("007_add_default_currency",))
        connection.commit()
    finally:
        connection.close()


def _project_names(path: Path) -> list[str]:
    connection = sqlite3.connect(path)
    try:
        rows = connection.execute("SELECT name FROM projects ORDER BY name").fetchall()
    finally:
        connection.close()
    return [row[0] for row in rows]


def _manifest(sha256: str, *, alembic_revision: str = "007_add_default_currency") -> dict[str, object]:
    return {
        "format": BACKUP_FORMAT,
        "created_at": "2026-08-26T21:15:30Z",
        "planqer_version": "0.1.0",
        "database": {
            "type": "sqlite",
            "filename": "planqer.db",
            "sha256": sha256,
            "alembic_revision": alembic_revision,
        },
    }


def _sha256(path: Path) -> str:
    import hashlib

    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()
