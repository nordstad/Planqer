from pathlib import Path

from planqer.backup import configured_database_url
from planqer.database_url import resolve_database_url


def test_runtime_and_backup_share_database_url_precedence(monkeypatch, tmp_path: Path):
    configured_url = f"sqlite+aiosqlite:///{tmp_path / 'configured.db'}"
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        f"database:\n  url: {configured_url}\n", encoding="utf-8"
    )
    monkeypatch.setenv("DATABASE_URL", configured_url)

    assert resolve_database_url(config_path=config_path) == configured_url
    assert configured_database_url(config_path=config_path) == configured_url


def test_database_url_precedence_is_explicit_then_environment_then_config(tmp_path: Path):
    config_url = f"sqlite+aiosqlite:///{tmp_path / 'config.db'}"
    env_url = f"sqlite+aiosqlite:///{tmp_path / 'env.db'}"
    explicit_url = f"sqlite+aiosqlite:///{tmp_path / 'explicit.db'}"
    config_path = tmp_path / "config.yaml"
    config_path.write_text(f"database:\n  url: {config_url}\n", encoding="utf-8")

    assert resolve_database_url(config_path=config_path, environ={}) == config_url
    assert resolve_database_url(config_path=config_path, environ={"DATABASE_URL": env_url}) == env_url
    assert resolve_database_url(explicit_url, config_path=config_path, environ={"DATABASE_URL": env_url}) == explicit_url
