from pathlib import Path

from partsible.backup import configured_database_url
from partsible.database_url import legacy_database_warning, resolve_database_url


def test_runtime_and_backup_share_database_url_precedence(monkeypatch, tmp_path: Path):
    configured_url = f"sqlite+aiosqlite:///{tmp_path / 'configured.db'}"
    config_path = tmp_path / "config.yaml"
    config_path.write_text(f"database:\n  url: {configured_url}\n", encoding="utf-8")
    monkeypatch.setenv("DATABASE_URL", configured_url)

    assert resolve_database_url(config_path=config_path) == configured_url
    assert configured_database_url(config_path=config_path) == configured_url


def test_database_url_precedence_is_explicit_then_environment_then_config(
    tmp_path: Path,
):
    config_url = f"sqlite+aiosqlite:///{tmp_path / 'config.db'}"
    env_url = f"sqlite+aiosqlite:///{tmp_path / 'env.db'}"
    explicit_url = f"sqlite+aiosqlite:///{tmp_path / 'explicit.db'}"
    config_path = tmp_path / "config.yaml"
    config_path.write_text(f"database:\n  url: {config_url}\n", encoding="utf-8")

    assert resolve_database_url(config_path=config_path, environ={}) == config_url
    assert (
        resolve_database_url(config_path=config_path, environ={"DATABASE_URL": env_url})
        == env_url
    )
    assert (
        resolve_database_url(
            explicit_url, config_path=config_path, environ={"DATABASE_URL": env_url}
        )
        == explicit_url
    )


def test_an_old_planqer_database_is_reported_when_there_is_no_new_one(tmp_path: Path):
    (tmp_path / "planqer.db").write_bytes(b"old")

    warning = legacy_database_warning(
        f"sqlite+aiosqlite:///{tmp_path / 'partsible.db'}"
    )

    assert warning is not None
    assert "planqer.db" in warning and "partsible.db" in warning


def test_no_warning_without_an_old_database(tmp_path: Path):
    assert (
        legacy_database_warning(f"sqlite+aiosqlite:///{tmp_path / 'partsible.db'}")
        is None
    )


def test_no_warning_once_the_new_database_exists(tmp_path: Path):
    (tmp_path / "planqer.db").write_bytes(b"old")
    (tmp_path / "partsible.db").write_bytes(b"new")

    assert (
        legacy_database_warning(f"sqlite+aiosqlite:///{tmp_path / 'partsible.db'}")
        is None
    )


def test_no_warning_for_a_database_that_is_not_sqlite():
    assert legacy_database_warning("postgresql://user@host/partsible") is None
